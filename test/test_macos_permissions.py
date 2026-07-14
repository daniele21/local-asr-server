from __future__ import annotations

import sys
from types import ModuleType
import unittest
from unittest.mock import patch

from local_asr_server.macos_permissions import accessibility_status


class AccessibilityStatusTests(unittest.TestCase):
    def test_reports_untrusted_macos_process_without_prompting(self) -> None:
        application_services = ModuleType("ApplicationServices")
        application_services.AXIsProcessTrusted = lambda: False  # type: ignore[attr-defined]
        with patch("local_asr_server.macos_permissions.sys.platform", "darwin"), patch.dict(
            sys.modules, {"ApplicationServices": application_services}
        ):
            status = accessibility_status()

        self.assertTrue(status["available"])
        self.assertFalse(status["trusted"])
        self.assertEqual(status["reason"], "accessibility_permission_required")
        self.assertIn("global_hotkeys", status["required_for"])

    def test_reports_platform_requirement_outside_macos(self) -> None:
        with patch("local_asr_server.macos_permissions.sys.platform", "linux"):
            status = accessibility_status()

        self.assertFalse(status["available"])
        self.assertEqual(status["reason"], "macos_required")


if __name__ == "__main__":
    unittest.main()
