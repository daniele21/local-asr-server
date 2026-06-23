from __future__ import annotations

import logging
import urllib.request
from pathlib import Path
from typing import Iterator

import numpy as np

from local_asr_server.paths import get_models_dir

logger = logging.getLogger("uvicorn.error")

SILERO_VAD_URL = "https://raw.githubusercontent.com/snakers4/silero-vad/master/src/silero_vad/data/silero_vad.onnx"


class SileroVAD:
    """
    Wrapper around Silero VAD ONNX model.
    Handles automatic model download, ONNX session initialization,
    and stateful speech chunk classification.
    """

    def __init__(self, model_path: Path | None = None) -> None:
        if model_path is None:
            model_path = get_models_dir() / "silero_vad.onnx"
        self.model_path = model_path
        self._ensure_model_exists()

        import onnxruntime as ort

        # Keep the small model deterministic and avoid oversubscribing ASR threads.
        opts = ort.SessionOptions()
        opts.inter_op_num_threads = 1
        opts.intra_op_num_threads = 1
        self.session = ort.InferenceSession(
            str(self.model_path),
            providers=["CPUExecutionProvider"],
            sess_options=opts,
        )
        self.reset_states()

    def _ensure_model_exists(self) -> None:
        if self.model_path.exists():
            return

        logger.info(f"Downloading Silero VAD model to {self.model_path}...")
        self.model_path.parent.mkdir(parents=True, exist_ok=True)
        temp_path = self.model_path.with_suffix(".tmp")
        try:
            with urllib.request.urlopen(SILERO_VAD_URL, timeout=30) as response:
                with open(temp_path, "wb") as f:
                    while True:
                        chunk = response.read(1024 * 64)
                        if not chunk:
                            break
                        f.write(chunk)
            temp_path.rename(self.model_path)
            logger.info("Silero VAD model downloaded successfully.")
        except Exception as e:
            if temp_path.exists():
                try:
                    temp_path.unlink()
                except OSError:
                    pass
            logger.error(f"Failed to download Silero VAD model: {e}")
            raise

    def reset_states(self, batch_size: int = 1, sr: int = 16000) -> None:
        """Reset the recurrent neural network states."""
        self._state = np.zeros((2, batch_size, 128), dtype=np.float32)
        context_size = 64 if sr == 16000 else 32
        self._context = np.zeros((batch_size, context_size), dtype=np.float32)
        self._last_sr = sr
        self._last_batch_size = batch_size

    def process_chunk(self, chunk: np.ndarray, sr: int = 16000) -> float:
        """
        Process one Silero-sized chunk with the required rolling context.
        Returns the probability of speech (float between 0.0 and 1.0).
        """
        if sr not in (8000, 16000):
            raise ValueError(f"Unsupported sample rate for Silero VAD: {sr}")
        num_samples = 512 if sr == 16000 else 256
        context_size = 64 if sr == 16000 else 32
        chunk = np.asarray(chunk, dtype=np.float32)
        if chunk.ndim == 1:
            chunk = np.expand_dims(chunk, axis=0)
        if chunk.ndim != 2:
            raise ValueError(f"Invalid VAD chunk shape: {chunk.shape}")
        if chunk.shape[1] < num_samples:
            chunk = np.pad(chunk, ((0, 0), (0, num_samples - chunk.shape[1])))
        if chunk.shape[1] != num_samples:
            raise ValueError(f"Invalid VAD chunk length: {chunk.shape[1]}; expected {num_samples}")
        batch_size = chunk.shape[0]
        if self._last_sr != sr or self._last_batch_size != batch_size:
            self.reset_states(batch_size=batch_size, sr=sr)
        model_input = np.concatenate([self._context, chunk], axis=1).astype(np.float32)

        ort_inputs = {
            "input": model_input,
            "state": self._state,
            "sr": np.array([sr], dtype=np.int64),
        }
        ort_outs = self.session.run(None, ort_inputs)
        out, updated_state = ort_outs
        self._state = updated_state.astype(np.float32)
        self._context = model_input[:, -context_size:].copy()
        return float(np.squeeze(out))


def detect_speech_windows_vad(
    audio_samples: np.ndarray,
    sr: int = 16000,
    chunk_size: int = 512,
    threshold: float = 0.35,
    neg_threshold: float = 0.20,
    min_speech_duration_ms: int = 150,
    min_silence_duration_ms: int = 700,
    speech_pad_ms: int = 800,
) -> list[dict[str, float]]:
    """
    Perform stateful Silero VAD over the full numpy array of float32 samples.
    Returns a list of speech windows: [{"start": float, "end": float}] in seconds.
    """
    audio_samples = np.nan_to_num(np.asarray(audio_samples, dtype=np.float32), nan=0.0, posinf=0.0, neginf=0.0)
    peak = float(np.max(np.abs(audio_samples))) if len(audio_samples) else 0.0
    if peak > 2.0:
        audio_samples = audio_samples / 32768.0
    audio_samples = np.clip(audio_samples, -1.0, 1.0)
    vad = SileroVAD()
    vad.reset_states(sr=sr)
    total_samples = len(audio_samples)
    step = chunk_size

    # Convert durations to samples
    min_speech_samples = (min_speech_duration_ms * sr) // 1000
    min_silence_samples = (min_silence_duration_ms * sr) // 1000

    speech_pad_samples = (speech_pad_ms * sr) // 1000
    speech_windows = []
    is_speaking = False
    speech_start = 0
    temp_end: int | None = None
    probabilities: list[float] = []

    # Stateful loop
    for i in range(0, total_samples, step):
        chunk = audio_samples[i : i + step]
        # Pad last chunk if it's smaller than chunk_size
        if len(chunk) < step:
            chunk = np.pad(chunk, (0, step - len(chunk)))

        prob = vad.process_chunk(chunk, sr=sr)

        probabilities.append(prob)
        current_sample = min(i + step, total_samples)

        if prob >= threshold and not is_speaking:
            is_speaking = True
            speech_start = max(0, i - speech_pad_samples)
            temp_end = None
        elif is_speaking and prob < neg_threshold:
            if temp_end is None:
                temp_end = current_sample
            if current_sample - temp_end >= min_silence_samples:
                speech_end = min(total_samples, temp_end + speech_pad_samples)
                if speech_end - speech_start >= min_speech_samples:
                    speech_windows.append({"start": round(speech_start / sr, 3), "end": round(speech_end / sr, 3)})
                is_speaking = False
                temp_end = None
        elif is_speaking:
            temp_end = None

    # Handle end of audio
    if is_speaking:
        duration = total_samples - speech_start
        if duration >= min_speech_samples:
            speech_windows.append({"start": round(speech_start / sr, 3), "end": round(total_samples / sr, 3)})

    # Post-process: merge segments with silence smaller than min_silence_duration_ms
    if probabilities:
        probs = np.asarray(probabilities, dtype=np.float32)
        rms = float(np.sqrt(np.mean(np.square(audio_samples)))) if len(audio_samples) else 0.0
        logger.info("[VAD] stats: chunks=%s max_prob=%.4f p99=%.4f p95=%.4f mean=%.4f rms=%.6f peak=%.6f threshold=%s neg_threshold=%s windows=%s", len(probs), float(np.max(probs)), float(np.percentile(probs, 99)), float(np.percentile(probs, 95)), float(np.mean(probs)), rms, peak, threshold, neg_threshold, len(speech_windows))
    return _merge_vad_windows(speech_windows)


def _merge_vad_windows(windows: list[dict[str, float]], *, max_gap_seconds: float = 1.5) -> list[dict[str, float]]:
    if not windows:
        return []
    merged = [dict(windows[0])]
    for window in windows[1:]:
        previous = merged[-1]
        if window["start"] - previous["end"] <= max_gap_seconds:
            previous["end"] = max(previous["end"], window["end"])
        else:
            merged.append(dict(window))
    return merged
