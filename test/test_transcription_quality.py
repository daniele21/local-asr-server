from __future__ import annotations

import unittest
from unittest.mock import Mock

import numpy as np

from local_asr_server.audio_intelligence.vad import SileroVAD
from local_asr_server.transcription_quality import (
    audio_stats,
    clean_segments,
    dedupe_cross_track_segments,
    filter_segments_by_vad,
    is_near_silent_track,
)


class TranscriptionQualityTests(unittest.TestCase):
    def test_clean_segments_keeps_raw_input_and_drops_boundary_ghost(self) -> None:
        raw = [{"start": 30.0, "end": 30.4, "text": "Grazie"}, {"start": 31.0, "end": 32.0, "text": "Contenuto utile"}]
        kept, dropped = clean_segments(raw)
        self.assertEqual([segment["text"] for segment in kept], ["Contenuto utile"])
        self.assertEqual(dropped[0]["dropped_reason"], "window_boundary_ghost")
        self.assertNotIn("dropped_reason", raw[0])

    def test_vad_filter_drops_segment_without_speech_overlap(self) -> None:
        kept, dropped = filter_segments_by_vad(
            [{"start": 0.0, "end": 1.0, "text": "silenzio"}, {"start": 5.0, "end": 6.0, "text": "parlato"}],
            [{"start": 5.2, "end": 5.8}],
        )
        self.assertEqual([segment["text"] for segment in kept], ["parlato"])
        self.assertEqual(dropped[0]["dropped_reason"], "no_vad_overlap")

    def test_cross_track_deduplication_prefers_vad_supported_segment(self) -> None:
        kept = dedupe_cross_track_segments([
            {"track_id": "mic", "start": 1.0, "end": 2.0, "text": "Ciao a tutti", "vad_overlap_ratio": 0.2},
            {"track_id": "system", "start": 1.1, "end": 2.1, "text": "Ciao a tutti", "vad_overlap_ratio": 0.9},
        ])
        self.assertEqual(len(kept), 1)
        self.assertEqual(kept[0]["track_id"], "system")

    def test_near_silent_stats(self) -> None:
        self.assertTrue(is_near_silent_track(audio_stats([0.0] * 16000)))

    def test_silero_process_chunk_supplies_rolling_context(self) -> None:
        vad = SileroVAD.__new__(SileroVAD)
        vad.reset_states(sr=16000)
        session = Mock()
        session.run.return_value = [np.array([[0.9]], dtype=np.float32), np.zeros((2, 1, 128), dtype=np.float32)]
        vad.session = session
        vad.process_chunk(np.ones(512, dtype=np.float32), sr=16000)
        first_input = session.run.call_args.args[1]["input"]
        self.assertEqual(first_input.shape, (1, 576))
        self.assertTrue(np.all(first_input[0, :64] == 0.0))
        vad.process_chunk(np.full(512, 0.5, dtype=np.float32), sr=16000)
        second_input = session.run.call_args.args[1]["input"]
        self.assertTrue(np.all(second_input[0, :64] == 1.0))


if __name__ == "__main__":
    unittest.main()
