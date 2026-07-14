from __future__ import annotations

import unittest

from local_asr_server.visual_intelligence.fusion import apply_visual_speaker_mapping


class VisualFusionTests(unittest.TestCase):
    def test_propagated_observations_do_not_inflate_support(self):
        result = apply_visual_speaker_mapping(
            {"segments": [{"id": 1, "start": 0, "end": 3, "text": "Ciao", "provider_speaker": "S1"}]},
            [
                {"timestamp": 1, "active_speakers": ["Anna"], "confidence": 1, "independent_inference": True},
                {"timestamp": 2, "active_speakers": ["Other"], "confidence": 1, "independent_inference": False},
            ],
            minimum_observations=1, minimum_margin=0,
        )
        self.assertEqual(result["speaker_attribution"]["mappings"][0]["display_name"], "Anna")
