from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from local_asr_server.catalog import CatalogStore
from local_asr_server.runtime.resource_policy import ResourcePolicy, ResourcePolicyBlocked


class ResourcePolicyTests(unittest.TestCase):
    def test_policy_allows_heavy_work_without_active_capture(self) -> None:
        policy = ResourcePolicy(capture_active=lambda: False)

        policy.assert_heavy_work_admissible("analysis")

        self.assertEqual(
            policy.snapshot(),
            {"profile": "balanced", "capture_active": False},
        )

    def test_policy_blocks_heavy_work_during_capture(self) -> None:
        policy = ResourcePolicy(capture_active=lambda: True)

        with self.assertRaises(ResourcePolicyBlocked) as ctx:
            policy.assert_heavy_work_admissible("transcription")

        self.assertEqual(ctx.exception.reason, "capture_active")

    def test_catalog_adapter_uses_canonical_recording_status(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            catalog = CatalogStore(Path(temp_dir) / "closedroom.db")
            policy = ResourcePolicy.from_catalog(catalog)
            self.assertFalse(policy.snapshot()["capture_active"])

            catalog.upsert_recording({
                "id": "rec-1",
                "title": "Meeting",
                "project_name": "",
                "status": "recording",
                "created_at": "2026-09-05T00:00:00+00:00",
            })
            self.assertTrue(policy.snapshot()["capture_active"])

            catalog.upsert_recording({
                "id": "rec-1",
                "title": "Meeting",
                "project_name": "",
                "status": "recorded",
                "created_at": "2026-09-05T00:00:00+00:00",
            })
            self.assertFalse(policy.snapshot()["capture_active"])


if __name__ == "__main__":
    unittest.main()
