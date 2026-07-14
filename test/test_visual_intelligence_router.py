from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from local_asr_server.visual_intelligence.contracts import VisualRoutingConfig
from local_asr_server.visual_intelligence.router import TaskAwareFrameRouter
from visual_intelligence_support import jpeg


class VisualRouterTests(unittest.TestCase):
    def test_first_frame_emits_all_task_boundaries(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "frame.jpg"
            path.write_bytes(jpeg())
            candidates, _ = TaskAwareFrameRouter(VisualRoutingConfig(mode="v2")).route(
                [{"sequence": 0, "timestamp": 0.0, "path": path}], [],
            )
            self.assertEqual(
                {candidate.task.value for candidate in candidates},
                {"meeting_ui", "meeting_state", "shared_content"},
            )
