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

        # Load ONNX session (using CPU provider for maximum compatibility)
        self.session = ort.InferenceSession(
            str(self.model_path),
            providers=["CPUExecutionProvider"],
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

    def reset_states(self) -> None:
        """Reset the recurrent neural network states."""
        self._state = np.zeros((2, 1, 128), dtype=np.float32)

    def process_chunk(self, chunk: np.ndarray, sr: int = 16000) -> float:
        """
        Process a chunk of 512, 1024, or 1536 float32 samples.
        Returns the probability of speech (float between 0.0 and 1.0).
        """
        # Ensure dimensions [1, chunk_size]
        if len(chunk.shape) == 1:
            chunk = np.expand_dims(chunk, axis=0)

        # Ensure correct type
        chunk = chunk.astype(np.float32)

        ort_inputs = {
            "input": chunk,
            "state": self._state,
            "sr": np.array([sr], dtype=np.int64),
        }
        ort_outs = self.session.run(None, ort_inputs)
        out, updated_state = ort_outs
        self._state = updated_state
        return float(out[0][0])


def detect_speech_windows_vad(
    audio_samples: np.ndarray,
    sr: int = 16000,
    chunk_size: int = 512,
    threshold: float = 0.20,
    neg_threshold: float = 0.1,
    min_speech_duration_ms: int = 80,
    min_silence_duration_ms: int = 1000,
) -> list[dict[str, float]]:
    """
    Perform stateful Silero VAD over the full numpy array of float32 samples.
    Returns a list of speech windows: [{"start": float, "end": float}] in seconds.
    """
    vad = SileroVAD()
    total_samples = len(audio_samples)
    step = chunk_size

    # Convert durations to samples
    min_speech_samples = (min_speech_duration_ms * sr) // 1000
    min_silence_samples = (min_silence_duration_ms * sr) // 1000

    speech_windows = []
    is_speaking = False
    temp_start = 0

    # Stateful loop
    for i in range(0, total_samples, step):
        chunk = audio_samples[i : i + step]
        # Pad last chunk if it's smaller than chunk_size
        if len(chunk) < step:
            chunk = np.pad(chunk, (0, step - len(chunk)))

        prob = vad.process_chunk(chunk, sr=sr)

        # Current time in samples
        current_sample = i

        if prob >= threshold and not is_speaking:
            is_speaking = True
            temp_start = current_sample

        elif prob < neg_threshold and is_speaking:
            # Check duration of current speech
            duration = current_sample - temp_start
            if duration >= min_speech_samples:
                # Check if we should merge with previous window or if there's enough silence
                # For simplicity, we just save the segment first and post-process
                speech_windows.append({"start": temp_start / sr, "end": current_sample / sr})
            is_speaking = False

    # Handle end of audio
    if is_speaking:
        duration = total_samples - temp_start
        if duration >= min_speech_samples:
            speech_windows.append({"start": temp_start / sr, "end": total_samples / sr})

    # Post-process: merge segments with silence smaller than min_silence_duration_ms
    if not speech_windows:
        return []

    merged: list[dict[str, float]] = []
    current = speech_windows[0]
    for nxt in speech_windows[1:]:
        silence_duration = nxt["start"] - current["end"]
        if silence_duration < (min_silence_duration_ms / 1000.0):
            current["end"] = nxt["end"]
        else:
            merged.append(current)
            current = nxt
    merged.append(current)

    return merged
