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
    def setUp(self) -> None:
        from unittest.mock import patch
        
        def mock_process_chunk(chunk, sr=16000):
            import numpy as np
            rms = np.sqrt(np.mean(chunk ** 2))
            return 0.9 if rms > 0.05 else 0.01

        self.patcher = patch("local_asr_server.audio_intelligence.vad.SileroVAD.process_chunk", side_effect=mock_process_chunk)
        self.patcher.start()

    def tearDown(self) -> None:
        self.patcher.stop()

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

        self.assertIn(result["backend"], {"silero-vad-v4", "energy-rms-v1"})
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

    def test_silero_vad_direct(self) -> None:
        try:
            from local_asr_server.audio_intelligence.vad import detect_speech_windows_vad
            import numpy as np
            # Generate a 2 second tone at 16kHz
            sample_rate = 16_000
            t = np.linspace(0, 2.0, 2 * sample_rate, endpoint=False)
            samples = np.zeros_like(t)
            samples[int(0.5 * sample_rate):int(1.5 * sample_rate)] = np.sin(2 * np.pi * 440 * t[int(0.5 * sample_rate):int(1.5 * sample_rate)])
            
            speech_windows = detect_speech_windows_vad(samples, sr=sample_rate)
            self.assertGreaterEqual(len(speech_windows), 1)
            self.assertLessEqual(speech_windows[0]["start"], 0.7)
            self.assertGreaterEqual(speech_windows[0]["end"], 1.3)
        except ImportError:
            self.skipTest("onnxruntime not installed")

    def test_silero_vad_actual_onnx_load(self) -> None:
        # Bypasses the patch to check actual ONNX loading and process_chunk execution without asserting speech threshold
        self.patcher.stop()
        try:
            from local_asr_server.audio_intelligence.vad import SileroVAD
            import numpy as np
            vad = SileroVAD()
            chunk = np.zeros(512, dtype=np.float32)
            prob = vad.process_chunk(chunk)
            self.assertTrue(0.0 <= prob <= 1.0)
        except ImportError:
            self.skipTest("onnxruntime not installed")
        finally:
            self.patcher.start()


if __name__ == "__main__":
    unittest.main()
