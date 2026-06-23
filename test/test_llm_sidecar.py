from __future__ import annotations

import unittest
from unittest.mock import Mock, patch

from local_asr_server.runtime.llm_sidecar import LocalLLMSidecar, LocalLLMProcessConfig


class LocalLLMSidecarTests(unittest.TestCase):
    def test_build_command_keeps_registry_model_when_overriding_model_path(self) -> None:
        sidecar = LocalLLMSidecar()
        with patch("local_asr_server.runtime.llm_sidecar.shutil.which", return_value="local-llm"):
            command = sidecar._build_command(
                model="voxtral-mini-3b",
                model_path="/models/voxtral.gguf",
                backend="llama_server",
                mmproj_path="/models/mmproj.gguf",
                ctx_size=32768,
                startup_timeout=120,
                llama_server_bin="/opt/bin/llama-server",
                port=45678,
            )

        self.assertEqual(
            command,
            [
                "local-llm", "serve", "--host", "127.0.0.1", "--port", "45678",
                "--model", "voxtral-mini-3b", "--model-path", "/models/voxtral.gguf",
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


if __name__ == "__main__":
    unittest.main()
