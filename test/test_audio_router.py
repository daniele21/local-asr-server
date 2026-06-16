from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch

from local_asr_server.audio_router import AudioRouter


class AudioRouterTests(unittest.TestCase):
    def setUp(self) -> None:
        AudioRouter._state.clear()
        AudioRouter._helper = None

    def tearDown(self) -> None:
        AudioRouter._state.clear()
        AudioRouter._helper = None

    def test_find_blackhole(self) -> None:
        devices = [
            {"name": "MacBook Speakers", "uid": "spk", "is_output": True},
            {"name": "BlackHole 2ch", "uid": "bh", "is_output": True},
        ]
        bh = AudioRouter._find_blackhole(devices)
        self.assertIsNotNone(bh)
        self.assertEqual(bh["uid"], "bh")

    def test_is_virtual_output(self) -> None:
        self.assertTrue(AudioRouter._is_virtual_output("BlackHole 2ch"))
        self.assertTrue(AudioRouter._is_virtual_output("Multi-Output Device"))
        self.assertTrue(AudioRouter._is_virtual_output("Local ASR Temporary Output"))
        self.assertFalse(AudioRouter._is_virtual_output("MacBook Speakers"))
        self.assertFalse(AudioRouter._is_virtual_output("AirPods"))

    def test_find_physical_output(self) -> None:
        devices = [
            {"name": "MacBook Speakers", "uid": "spk", "is_output": True},
            {"name": "BlackHole 2ch", "uid": "bh", "is_output": True},
        ]
        current = {"name": "BlackHole 2ch", "uid": "bh", "is_output": True}
        physical = AudioRouter._find_physical_output(current, devices)
        self.assertIsNotNone(physical)
        self.assertEqual(physical["uid"], "spk")

    @patch("local_asr_server.audio_router.sys.platform", "darwin")
    @patch.object(AudioRouter, "_get_helper")
    def test_status_reports_ready(self, mock_get_helper) -> None:
        mock_helper = MagicMock()
        mock_helper.list_devices.return_value = [
            {"name": "MacBook Speakers", "uid": "spk", "is_output": True},
            {"name": "BlackHole 2ch", "uid": "bh", "is_output": True},
        ]
        mock_helper.get_current_output.return_value = {
            "name": "MacBook Speakers",
            "uid": "spk",
            "is_output": True,
        }
        mock_get_helper.return_value = mock_helper

        status = AudioRouter.get_status()

        self.assertTrue(status["ready_to_record"])
        self.assertTrue(status["blackhole_installed"])
        self.assertEqual(status["physical_output"], "MacBook Speakers")
        self.assertEqual(status["missing"], [])

    @patch("local_asr_server.audio_router.sys.platform", "darwin")
    @patch.object(AudioRouter, "_get_helper")
    def test_route_saves_original_devices(self, mock_get_helper) -> None:
        mock_helper = MagicMock()
        mock_helper.list_devices.return_value = [
            {"name": "MacBook Speakers", "uid": "spk", "is_output": True},
            {"name": "BlackHole 2ch", "uid": "bh", "is_output": True},
        ]
        mock_helper.get_current_output.return_value = {
            "name": "MacBook Speakers",
            "uid": "spk",
            "is_output": True,
        }
        mock_helper.create_aggregate.return_value = {"device_id": 123, "uid": "temp-uid"}
        mock_get_helper.return_value = mock_helper

        success = AudioRouter.route_to_multi_output()

        self.assertTrue(success)
        self.assertEqual(AudioRouter._state.original_output_uid, "spk")
        self.assertEqual(AudioRouter._state.original_output_name, "MacBook Speakers")
        self.assertEqual(AudioRouter._state.status, "active")
        
        mock_helper.create_aggregate.assert_called_once()
        mock_helper.set_default_output.assert_called_once()

    @patch("local_asr_server.audio_router.sys.platform", "darwin")
    @patch.object(AudioRouter, "_get_helper")
    def test_route_failure_rolls_back(self, mock_get_helper) -> None:
        mock_helper = MagicMock()
        mock_helper.list_devices.return_value = [
            {"name": "MacBook Speakers", "uid": "spk", "is_output": True},
            {"name": "BlackHole 2ch", "uid": "bh", "is_output": True},
        ]
        mock_helper.get_current_output.return_value = {
            "name": "MacBook Speakers",
            "uid": "spk",
            "is_output": True,
        }
        mock_helper.create_aggregate.side_effect = Exception("Failed creation")
        mock_get_helper.return_value = mock_helper

        success = AudioRouter.route_to_multi_output()

        self.assertFalse(success)
        self.assertEqual(AudioRouter._state.status, "idle")
        self.assertIsNone(AudioRouter._state.original_output_uid)

    @patch("local_asr_server.audio_router.sys.platform", "darwin")
    @patch.object(AudioRouter, "_get_helper")
    def test_restore_original_output(self, mock_get_helper) -> None:
        mock_helper = MagicMock()
        mock_get_helper.return_value = mock_helper

        # Setup active state
        AudioRouter._state.status = "active"
        AudioRouter._state.original_output_uid = "spk"
        AudioRouter._state.original_output_name = "MacBook Speakers"
        AudioRouter._state.temporary_device_uid = "temp-uid"

        success = AudioRouter.restore_original_output()

        self.assertTrue(success)
        self.assertEqual(AudioRouter._state.status, "idle")
        mock_helper.set_default_output.assert_called_once_with("spk")
        mock_helper.destroy_aggregate.assert_called_once_with("temp-uid")


if __name__ == "__main__":
    unittest.main()
