from __future__ import annotations

import unittest

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

    def test_policy_reads_capture_state_lazily_from_canonical_owner(self) -> None:
        active = False
        policy = ResourcePolicy(capture_active=lambda: active)

        self.assertFalse(policy.snapshot()["capture_active"])
        active = True
        self.assertTrue(policy.snapshot()["capture_active"])
        with self.assertRaises(ResourcePolicyBlocked):
            policy.assert_heavy_work_admissible("vision")
        active = False
        policy.assert_heavy_work_admissible("vision")

    def test_rejects_unknown_profile(self) -> None:
        with self.assertRaises(ValueError):
            ResourcePolicy(capture_active=lambda: False, profile="unbounded")


if __name__ == "__main__":
    unittest.main()
