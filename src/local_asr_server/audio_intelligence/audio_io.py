from __future__ import annotations

import math
import struct
import subprocess
import wave
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator

from local_asr_server.paths import get_ffmpeg_path


TARGET_SAMPLE_RATE = 16_000
DEFAULT_WINDOW_SECONDS = 0.1


@dataclass(frozen=True)
class EnergyWindow:
    start: float
    end: float
    rms: float


def iter_energy_windows(
    path: Path,
    *,
    window_seconds: float = DEFAULT_WINDOW_SECONDS,
) -> Iterator[EnergyWindow]:
    if not _looks_like_wave(path):
        yield from _iter_ffmpeg_energy_windows(path, window_seconds=window_seconds)
        return
    try:
        yield from _iter_wave_energy_windows(path, window_seconds=window_seconds)
    except (wave.Error, EOFError, OSError):
        yield from _iter_ffmpeg_energy_windows(path, window_seconds=window_seconds)


def _iter_wave_energy_windows(path: Path, *, window_seconds: float) -> Iterator[EnergyWindow]:
    with wave.open(str(path), "rb") as wav:
        sample_rate = wav.getframerate()
        channels = wav.getnchannels()
        sample_width = wav.getsampwidth()
        if sample_rate <= 0 or channels <= 0 or sample_width not in {1, 2, 3, 4}:
            raise wave.Error("unsupported wav format")

        frames_per_window = max(1, int(sample_rate * window_seconds))
        frame_index = 0
        while True:
            raw = wav.readframes(frames_per_window)
            if not raw:
                break
            frame_count = len(raw) // (sample_width * channels)
            if frame_count <= 0:
                break
            rms = _pcm_rms(raw, sample_width=sample_width, channels=channels)
            start = frame_index / sample_rate
            frame_index += frame_count
            end = frame_index / sample_rate
            yield EnergyWindow(start=start, end=end, rms=rms)


def _looks_like_wave(path: Path) -> bool:
    try:
        with path.open("rb") as audio_file:
            header = audio_file.read(12)
        return len(header) >= 12 and header[:4] == b"RIFF" and header[8:12] == b"WAVE"
    except OSError:
        return False


def _iter_ffmpeg_energy_windows(path: Path, *, window_seconds: float) -> Iterator[EnergyWindow]:
    ffmpeg = get_ffmpeg_path()
    frames_per_window = max(1, int(TARGET_SAMPLE_RATE * window_seconds))
    bytes_per_window = frames_per_window * 4
    process = subprocess.Popen(
        [
            ffmpeg,
            "-v",
            "error",
            "-i",
            str(path),
            "-ac",
            "1",
            "-ar",
            str(TARGET_SAMPLE_RATE),
            "-f",
            "f32le",
            "pipe:1",
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    if process.stdout is None:
        raise OSError("ffmpeg stdout unavailable")

    frame_index = 0
    try:
        while True:
            raw = process.stdout.read(bytes_per_window)
            if not raw:
                break
            sample_count = len(raw) // 4
            if sample_count <= 0:
                break
            values = struct.unpack("<" + "f" * sample_count, raw[: sample_count * 4])
            rms = math.sqrt(sum(sample * sample for sample in values) / sample_count)
            start = frame_index / TARGET_SAMPLE_RATE
            frame_index += sample_count
            end = frame_index / TARGET_SAMPLE_RATE
            yield EnergyWindow(start=start, end=end, rms=rms)
    finally:
        try:
            if process.stdout:
                process.stdout.close()
            if process.stderr:
                process.stderr.close()
            process.wait(timeout=5)
        except Exception:
            process.kill()


def _pcm_rms(raw: bytes, *, sample_width: int, channels: int) -> float:
    samples = []
    step = sample_width * channels
    max_value = float((1 << ((sample_width * 8) - 1)) - 1)
    if max_value <= 0:
        return 0.0

    for offset in range(0, len(raw) - step + 1, step):
        channel_values = [
            _sample_to_int(raw[offset + channel * sample_width : offset + (channel + 1) * sample_width], sample_width)
            for channel in range(channels)
        ]
        samples.append(sum(channel_values) / channels)

    if not samples:
        return 0.0
    return min(1.0, math.sqrt(sum(sample * sample for sample in samples) / len(samples)) / max_value)


def _sample_to_int(raw: bytes, sample_width: int) -> int:
    if sample_width == 1:
        return raw[0] - 128
    return int.from_bytes(raw, byteorder="little", signed=True)
