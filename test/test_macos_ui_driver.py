from __future__ import annotations

import importlib.util
import platform
import shutil
import subprocess
import unittest
from pathlib import Path
from unittest import mock


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "macos_ui_driver.py"
SWIFT_HELPER = Path(__file__).resolve().parents[1] / "scripts" / "macos_ax_helper.swift"


def load_module():
    spec = importlib.util.spec_from_file_location("macos_ui_driver_test_module", SCRIPT)
    if spec is None or spec.loader is None:
        raise RuntimeError("could not load macos_ui_driver.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class MacOSUIDriverTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.driver_module = load_module()

    def test_action_timeout_is_explicit_and_bounded(self) -> None:
        driver = self.driver_module.MacOSUIDriver(source=SWIFT_HELPER, action_timeout=2.5)
        driver._ensure_binary = lambda: Path("/tmp/closedroom-ax-helper")
        with mock.patch.object(
            self.driver_module.subprocess,
            "run",
            side_effect=subprocess.TimeoutExpired(cmd=["helper"], timeout=2.5),
        ):
            with self.assertRaises(self.driver_module.UIAutomationTimeout) as caught:
                driver._invoke(123, "window")
        self.assertIn("ui_automation_timeout:window:2.5s", str(caught.exception))

    def test_accessibility_denial_is_not_a_product_failure(self) -> None:
        driver = self.driver_module.MacOSUIDriver(source=SWIFT_HELPER)
        driver._ensure_binary = lambda: Path("/tmp/closedroom-ax-helper")
        completed = subprocess.CompletedProcess(
            args=["helper"],
            returncode=77,
            stdout="",
            stderr="accessibility_permission_required\n",
        )
        with mock.patch.object(self.driver_module.subprocess, "run", return_value=completed):
            with self.assertRaises(self.driver_module.AccessibilityPermissionRequired):
                driver._invoke(123, "window")

    def test_window_rect_rejects_invalid_bounds(self) -> None:
        driver = self.driver_module.MacOSUIDriver(source=SWIFT_HELPER)
        driver._invoke = lambda *_args, **_kwargs: "10,20,0,500"
        with self.assertRaises(self.driver_module.UIAutomationError):
            driver.window_rect(123)

    @unittest.skipUnless(platform.system() == "Darwin" and shutil.which("xcrun"), "requires macOS Swift toolchain")
    def test_swift_ax_helper_compiles_on_macos(self) -> None:
        driver = self.driver_module.MacOSUIDriver(source=SWIFT_HELPER)
        try:
            binary = driver._ensure_binary()
            self.assertTrue(binary.is_file())
        finally:
            driver.close()


if __name__ == "__main__":
    unittest.main()
