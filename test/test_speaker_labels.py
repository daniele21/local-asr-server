from __future__ import annotations

import unittest

from local_asr_server.speaker_labels import apply_speaker_labels


class SpeakerLabelsTests(unittest.TestCase):
    def test_diarized_clusters_receive_stable_fallback_labels(self) -> None:
        payload = {
            "segments": [
                {"id": 0, "start": 0, "end": 1, "text": "Uno", "provider_speaker": "system:S2"},
                {"id": 1, "start": 1, "end": 2, "text": "Due", "provider_speaker": "system:S1"},
                {"id": 2, "start": 2, "end": 3, "text": "Tre", "provider_speaker": "system:S2"},
            ],
        }

        result = apply_speaker_labels(payload)

        self.assertEqual(result["segments"][0]["speaker_label"], "Speaker 1")
        self.assertEqual(result["segments"][1]["speaker_label"], "Speaker 2")
        self.assertIn("[00:00] Speaker 1: Uno", result["text"])
        self.assertEqual(
            [item["speaker_cluster"] for item in result["stats"]["speaker_attribution"]["mappings"]],
            ["system:S2", "system:S1"],
        )

    def test_manual_name_overrides_fallback_and_rebuilds_text(self) -> None:
        payload = {
            "segments": [
                {"id": 0, "start": 4, "end": 5, "text": "Ciao", "provider_speaker": "system:S1"},
            ],
        }

        result = apply_speaker_labels(payload, {"system:S1": "Paolo"})

        self.assertEqual(result["segments"][0]["speaker_label"], "Paolo")
        self.assertEqual(result["text"], "[00:04] Paolo: Ciao")
        mapping = result["speaker_attribution"]["mappings"][0]
        self.assertEqual(mapping["source"], "manual")
        self.assertEqual(mapping["status"], "accepted")

    def test_accepted_visual_name_has_priority_over_fallback(self) -> None:
        payload = {
            "segments": [
                {"id": 0, "start": 0, "end": 1, "text": "Ciao", "provider_speaker": "system:S1"},
            ],
            "speaker_attribution": {
                "source": "visual_evidence_plus_provider_diarization",
                "mappings": [{
                    "speaker_cluster": "system:S1",
                    "display_name": "Salvatore",
                    "status": "accepted",
                }],
            },
        }

        result = apply_speaker_labels(payload)

        self.assertEqual(result["segments"][0]["speaker_label"], "Salvatore")
        self.assertEqual(result["speaker_attribution"]["mappings"][0]["source"], "visual")


if __name__ == "__main__":
    unittest.main()
