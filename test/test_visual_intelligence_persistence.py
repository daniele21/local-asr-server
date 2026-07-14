from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from local_asr_server.recordings import RecordingStore


class VisualPersistenceTests(unittest.TestCase):
    def test_generation_id_is_shared_by_terminal_artifacts(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = RecordingStore(Path(tmp), use_settings_dir=False)
            recording = store.create(title="Visual", mime_type="audio/wav", model="test", language="it")
            store.replace_visual_intelligence_artifacts(
                recording["id"], [], {"version": 2},
                document={"schema_version": 2}, routing={"schema_version": 1},
            )
            result = store.get_visual_intelligence(recording["id"])
            generation = result["summary"]["generation_id"]
            self.assertEqual(result["document"]["generation_id"], generation)
            self.assertEqual(result["routing"]["generation_id"], generation)
