from __future__ import annotations

import unittest

from local_asr_server.visual_intelligence.temporal import aggregate_temporal_state


class VisualTemporalTests(unittest.TestCase):
    def test_two_share_windows_remain_distinct(self):
        observations = []
        for timestamp, active in ((0, False), (10, True), (20, False), (30, True), (40, False)):
            observations.append({
                "observation_id": f"state-{timestamp}", "timestamp": timestamp,
                "task": "meeting_state", "layout": "gallery",
                "screen_share": {"active": active}, "visible_activity": [],
            })
        for timestamp in (12, 32):
            observations.append({
                "observation_id": f"share-{timestamp}", "timestamp": timestamp,
                "task": "shared_content", "content_type": "slide", "content_state": "stable",
            })
        self.assertEqual(
            [item["id"] for item in aggregate_temporal_state(observations)["share_sessions"]],
            ["share-01", "share-02"],
        )
