from __future__ import annotations

import subprocess
import unittest
from unittest.mock import patch

from local_asr_server.server import AudioRouter


class AudioRouterTests(unittest.TestCase):
    def setUp(self) -> None:
        AudioRouter._original_input = None
        AudioRouter._original_output = None

    def tearDown(self) -> None:
        AudioRouter._original_input = None
        AudioRouter._original_output = None

    def test_prefers_profile_for_current_output(self) -> None:
        profile, physical, expected = AudioRouter._profile_for_output(
            ["MacBook Speakers", "Local ASR Output - MacBook Speakers"],
            "MacBook Speakers",
        )

        self.assertEqual(profile, "Local ASR Output - MacBook Speakers")
        self.assertEqual(physical, "MacBook Speakers")
        self.assertEqual(expected, "Local ASR Output - MacBook Speakers")

    def test_does_not_use_ambiguous_generic_multi_output(self) -> None:
        profile, physical, expected = AudioRouter._profile_for_output(
            ["MacBook Speakers", "Multi-Output Device"],
            "MacBook Speakers",
        )

        self.assertIsNone(profile)
        self.assertEqual(physical, "MacBook Speakers")
        self.assertEqual(expected, "Local ASR Output - MacBook Speakers")

    @patch.object(AudioRouter, "get_current_output", return_value="MacBook Speakers")
    @patch.object(AudioRouter, "get_current_input", return_value="MacBook Microphone")
    @patch.object(
        AudioRouter,
        "get_available_outputs",
        return_value=[
            "BlackHole 2ch",
            "MacBook Speakers",
            "Local ASR Output - MacBook Speakers",
        ],
    )
    @patch.object(
        AudioRouter,
        "get_available_inputs",
        return_value=["BlackHole 2ch", "MacBook Microphone"],
    )
    @patch.object(AudioRouter, "_get_switch_audio_cmd", return_value="SwitchAudioSource")
    @patch("local_asr_server.server.sys.platform", "darwin")
    def test_status_reports_ready(
        self,
        _switch_audio,
        _inputs,
        _outputs,
        _current_input,
        _current_output,
    ) -> None:
        status = AudioRouter.get_status()

        self.assertTrue(status["ready_to_record"])
        self.assertEqual(status["input_device"], "MacBook Microphone")
        self.assertEqual(
            status["output_device"],
            "Local ASR Output - MacBook Speakers",
        )
        self.assertEqual(status["physical_output"], "MacBook Speakers")
        self.assertEqual(status["missing"], [])

    @patch("local_asr_server.server.subprocess.run")
    @patch.object(AudioRouter, "get_current_output", return_value="MacBook Speakers")
    @patch.object(AudioRouter, "get_current_input", return_value="MacBook Microphone")
    @patch.object(AudioRouter, "_get_switch_audio_cmd", return_value="SwitchAudioSource")
    @patch.object(
        AudioRouter,
        "get_status",
        return_value={
            "ready_to_record": True,
            "input_device": "MacBook Microphone",
            "output_device": "Local ASR Output - MacBook Speakers",
        },
    )
    def test_route_saves_original_devices(
        self,
        _status,
        _switch_audio,
        _current_input,
        _current_output,
        run,
    ) -> None:
        self.assertTrue(AudioRouter.route_to_multi_output())

        self.assertIsNone(AudioRouter._original_input)
        self.assertEqual(AudioRouter._original_output, "MacBook Speakers")
        self.assertEqual(run.call_count, 1)

    @patch(
        "local_asr_server.server.subprocess.run",
        side_effect=subprocess.CalledProcessError(1, "SwitchAudioSource"),
    )
    @patch.object(AudioRouter, "get_current_output", return_value="MacBook Speakers")
    @patch.object(AudioRouter, "get_current_input", return_value="MacBook Microphone")
    @patch.object(AudioRouter, "_get_switch_audio_cmd", return_value="SwitchAudioSource")
    @patch.object(
        AudioRouter,
        "get_status",
        return_value={
            "ready_to_record": True,
            "input_device": "MacBook Microphone",
            "output_device": "Local ASR Output - MacBook Speakers",
        },
    )
    def test_route_failure_rolls_back_changed_devices(
        self,
        _status,
        _switch_audio,
        _current_input,
        _current_output,
        run,
    ) -> None:
        self.assertFalse(AudioRouter.route_to_multi_output())

        self.assertIsNone(AudioRouter._original_input)
        self.assertIsNone(AudioRouter._original_output)
        self.assertEqual(run.call_count, 2)


if __name__ == "__main__":
    unittest.main()
