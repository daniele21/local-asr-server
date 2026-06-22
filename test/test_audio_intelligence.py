from __future__ import annotations

import math
import struct
import tempfile
import unittest
import wave
from pathlib import Path

from local_asr_server.audio_intelligence import build_audio_intelligence


def write_tone_wav(path: Path, *, tone_ranges: list[tuple[float, float]], duration: float = 2.0) -> None:
    sample_rate = 16_000
    total_frames = int(duration * sample_rate)
    frames = bytearray()
    for index in range(total_frames):
        timestamp = index / sample_rate
        active = any(start <= timestamp < end for start, end in tone_ranges)
        sample = int(math.sin(2 * math.pi * 440 * timestamp) * 10_000) if active else 0
        frames.extend(struct.pack("<h", sample))
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        wav.writeframes(bytes(frames))


class AudioIntelligenceTests(unittest.TestCase):
    def test_builds_speech_metrics_and_enriched_segments(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            mic_path = root / "mic.wav"
            system_path = root / "system.wav"
            write_tone_wav(mic_path, tone_ranges=[(0.1, 0.8), (1.5, 1.9)])
            write_tone_wav(system_path, tone_ranges=[(0.5, 1.2)])

            result = build_audio_intelligence(
                [
                    ({"id": "mic", "source": "mic", "label": "Tu"}, mic_path),
                    ({"id": "system", "source": "system", "label": "Computer"}, system_path),
                ],
                [
                    {"id": 0, "track_id": "mic", "source": "mic", "start": 0.2, "end": 0.7, "text": "Ciao mondo"},
                    {"id": 1, "track_id": "system", "source": "system", "start": 0.6, "end": 1.1, "text": "Salve a te"},
                ],
            )

        self.assertEqual(result["backend"], "energy-rms-v1")
        self.assertEqual(result["mode"], "metadata_only")
        self.assertTrue(result["mock"])
        self.assertIn("mic", result["channels"])
        self.assertIn("system", result["channels"])
        self.assertGreater(result["conversation_metrics"]["speaking_time_seconds"]["mic"], 0)
        self.assertGreater(result["conversation_metrics"]["speaking_time_seconds"]["system"], 0)
        self.assertGreaterEqual(len(result["conversation_metrics"]["overlaps"]), 1)
        self.assertEqual(result["segments"][0]["channel"], "mic")
        self.assertIn(result["segments"][0]["energy"], {"low", "medium_low", "medium", "high"})
        self.assertGreater(result["segments"][0]["speech_rate_wpm"], 0)


if __name__ == "__main__":
    unittest.main()
