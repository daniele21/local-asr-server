from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from local_asr_server.recordings import RecordingConflict, RecordingStore


class RecordingStoreTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.store = RecordingStore(self.root, use_settings_dir=False)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def create_recording(self) -> dict:
        return self.store.create(
            title="Titolo Registrazione",
            mime_type="audio/webm;codecs=opus",
            model="test-model",
            language="it",
        )

    def test_persists_chunks_in_order_and_finalizes_audio(self) -> None:
        recording = self.create_recording()

        first = self.store.append_chunk(recording["id"], 0, b"first")
        second = self.store.append_chunk(recording["id"], 1, b"second")
        finalized, should_start = self.store.finalize(recording["id"])

        self.assertEqual(first["chunk_count"], 1)
        self.assertEqual(second["bytes_written"], 11)
        self.assertEqual(finalized["status"], "recorded")
        self.assertFalse(should_start)
        self.assertEqual(self.store.audio_path(recording["id"]).read_bytes(), b"firstsecond")

    def test_rejects_out_of_order_and_post_stop_chunks(self) -> None:
        recording = self.create_recording()

        with self.assertRaises(RecordingConflict):
            self.store.append_chunk(recording["id"], 1, b"wrong")

        self.store.append_chunk(recording["id"], 0, b"audio")
        self.store.finalize(recording["id"])

        with self.assertRaises(RecordingConflict):
            self.store.append_chunk(recording["id"], 1, b"late")

    def test_stop_is_idempotent(self) -> None:
        recording = self.create_recording()
        self.store.append_chunk(recording["id"], 0, b"audio")

        _, first_should_start = self.store.finalize(recording["id"])
        metadata, second_should_start = self.store.finalize(recording["id"])

        self.assertFalse(first_should_start)
        self.assertFalse(second_should_start)
        self.assertEqual(metadata["status"], "recorded")

    def test_recorded_audio_survives_restart(self) -> None:
        recording = self.create_recording()
        self.store.append_chunk(recording["id"], 0, b"audio")
        self.store.finalize(recording["id"])

        restored = RecordingStore(self.root, use_settings_dir=False).get(recording["id"])

        self.assertEqual(restored["status"], "recorded")
        self.assertEqual(self.store.audio_path(recording["id"]).read_bytes(), b"audio")

    def test_split_tracks_are_persisted_under_one_recording(self) -> None:
        recording = self.store.create(
            title="Call",
            mime_type="audio/webm;codecs=opus",
            model="test-model",
            language="it",
            capture_mode="both",
        )

        self.store.append_track_chunk(recording["id"], "mic", 0, b"mic")
        self.store.append_track_chunk(recording["id"], "system", 0, b"sys")
        self.store.append_track_chunk(recording["id"], "mixed", 0, b"mix")
        finalized, _ = self.store.finalize(recording["id"])

        self.assertEqual(finalized["status"], "recorded")
        self.assertEqual(finalized["capture_mode"], "both")
        self.assertEqual({track["id"] for track in finalized["audio_tracks"]}, {"mic", "system", "mixed"})
        self.assertEqual(self.store.track_audio_path(recording["id"], "mic").read_bytes(), b"mic")
        self.assertEqual(self.store.track_audio_path(recording["id"], "system").read_bytes(), b"sys")
        self.assertEqual(self.store.audio_path(recording["id"]).read_bytes(), b"mix")

        tracks = self.store.transcribable_tracks(recording["id"])
        self.assertEqual([track["id"] for track, _ in tracks], ["mic", "system"])


if __name__ == "__main__":
    unittest.main()
