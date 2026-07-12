from __future__ import annotations

import unittest

from local_asr_server.speechmatics_asr import _normalize_speechmatics_result


class SpeechmaticsASRTests(unittest.TestCase):
    def test_normalizes_words_and_provider_speakers_without_secrets(self) -> None:
        raw = {
            "job": {"id": "job-1"},
            "results": [
                {"type": "word", "start_time": 0.0, "end_time": 0.2, "alternatives": [{"content": "Ciao", "speaker": "S1"}]},
                {"type": "punctuation", "alternatives": [{"content": "."}]},
                {"type": "word", "start_time": 1.0, "end_time": 1.3, "alternatives": [{"content": "Salve", "speaker": "S2"}]},
            ],
        }

        result = _normalize_speechmatics_result(
            raw,
            language="it",
            model="standard",
            region="eu",
            diarization="speaker",
        )

        self.assertEqual(result["provider"], "speechmatics")
        self.assertEqual(result["asr_provider"], "speechmatics")
        self.assertEqual(result["backend"], "speechmatics-batch")
        self.assertEqual(result["provider_options"]["speechmatics_model"], "standard")
        self.assertEqual(result["provider_options"]["speechmatics_region"], "eu")
        self.assertEqual(result["segments"][0]["text"], "Ciao.")
        self.assertEqual(result["segments"][0]["provider_speaker"], "S1")
        self.assertEqual(result["segments"][1]["provider_speaker"], "S2")
        self.assertNotIn("api_key", str(result))


if __name__ == "__main__":
    unittest.main()
