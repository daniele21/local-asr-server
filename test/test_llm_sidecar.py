from __future__ import annotations

import signal
import sys
import unittest
from unittest.mock import Mock, patch

from local_asr_server.runtime.llm_sidecar import (
    LocalLLMSidecar,
    LocalLLMSidecarError,
    LocalLLMProcessConfig,
)


class LocalLLMSidecarTests(unittest.TestCase):
    def test_stale_vision_cleanup_only_terminates_matching_worker(self) -> None:
        with (
            patch("local_asr_server.runtime.llm_sidecar.subprocess.run") as run,
            patch("local_asr_server.runtime.llm_sidecar.os.kill") as kill,
        ):
            run.side_effect = [
                Mock(stdout="123\n456\n"),
                Mock(stdout="python -m mlx_vlm.server --port 8092\n"),
                Mock(stdout="python unrelated.py\n"),
            ]

            LocalLLMSidecar._terminate_stale_vision_workers()

        kill.assert_called_once_with(123, signal.SIGTERM)

    def test_build_command_keeps_registry_model_when_overriding_model_path(self) -> None:
        sidecar = LocalLLMSidecar()
        with (
            patch("local_asr_server.settings.load_settings", return_value={"visual_llm_model": "qwen3-vl-4b"}),
            patch("local_asr_server.local_llm_params.load_local_llm_params", return_value={}),
        ):
            command = sidecar._build_command(
                model="voxtral-mini-3b",
                model_path="/models/voxtral.gguf",
                backend="llama_server",
                mmproj_path="/models/mmproj.gguf",
                ctx_size=32768,
                startup_timeout=120,
                llama_server_bin="/opt/bin/llama-server",
                port=45678,
                vision_port=45679,
            )

        self.assertEqual(
            command,
            [
                sys.executable, "-m", "local_asr_server.runtime.local_llm_entrypoint", "serve",
                "--host", "127.0.0.1", "--port", "45678",
                "--enable-admin-api", "--mlx-vlm-server-port", "45679",
                "--models", "voxtral-mini-3b", "qwen3-vl-4b", "--model-path", "/models/voxtral.gguf",
                "--backend", "llama_server", "--mmproj-path", "/models/mmproj.gguf",
                "--ctx-size", "32768", "--startup-timeout", "120",
                "--llama-server-bin", "/opt/bin/llama-server",
            ],
        )

    def test_ensure_ready_restarts_when_process_configuration_changes(self) -> None:
        sidecar = LocalLLMSidecar()
        process = Mock()
        process.poll.return_value = None
        sidecar._process = process
        sidecar._process_config = LocalLLMProcessConfig(model="nemotron-nano-4b")

        with (
            patch.object(sidecar, "_runtime_available", return_value=True),
            patch.object(sidecar, "restart") as restart,
            patch.object(sidecar, "wait_until_ready", return_value=True),
        ):
            sidecar.ensure_ready(model="voxtral-mini-3b", model_path="/models/voxtral.gguf")

        restart.assert_called_once_with(
            model="voxtral-mini-3b",
            model_path="/models/voxtral.gguf",
            backend="",
            mmproj_path="",
            ctx_size=None,
            startup_timeout=None,
            llama_server_bin="",
        )

    def test_ensure_ready_reports_missing_vision_extra_before_starting(self) -> None:
        sidecar = LocalLLMSidecar()
        with (
            patch.object(sidecar, "_runtime_available", return_value=True),
            patch.object(sidecar, "_vision_runtime_available", return_value=False),
            patch.object(sidecar, "start") as start,
            self.assertRaises(LocalLLMSidecarError) as raised,
        ):
            sidecar.ensure_ready(model="qwen3-vl-4b", capability="image")

        self.assertEqual(raised.exception.code, "local_llm_vision_dependency_missing")
        self.assertEqual(raised.exception.status, 503)
        start.assert_not_called()


if __name__ == "__main__":
    unittest.main()
