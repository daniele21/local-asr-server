from __future__ import annotations

import unittest
from unittest.mock import Mock, patch

from local_asr_server.runtime.models import DEFAULT_LOCAL_LLM_URL
from local_asr_server.runtime.service_manager import RuntimeServiceManager


class RuntimeServiceManagerTests(unittest.TestCase):
    def test_llm_status_defaults_to_managed_stopped(self) -> None:
        with patch("local_asr_server.runtime.service_manager.load_settings") as load:
            load.return_value = {
                "local_llm_mode": "auto",
                "local_llm_model": "nemotron-nano-4b",
                "local_llm_model_path": "",
                "local_llm_url": DEFAULT_LOCAL_LLM_URL,
            }

            status = RuntimeServiceManager().llm_status()

        self.assertEqual(status["name"], "llm")
        self.assertEqual(status["status"], "stopped")
        self.assertEqual(status["mode"], "auto")
        self.assertTrue(status["managed"])
        self.assertIsNone(status["url"])

    def test_llm_status_reports_disabled_as_not_configured(self) -> None:
        with patch("local_asr_server.runtime.service_manager.load_settings") as load:
            load.return_value = {
                "local_llm_mode": "disabled",
                "local_llm_model": "nemotron-nano-4b",
            }

            status = RuntimeServiceManager().llm_status()

        self.assertEqual(status["status"], "not_configured")
        self.assertFalse(status["managed"])

    def test_llm_status_reports_missing_custom_model_path(self) -> None:
        with patch("local_asr_server.runtime.service_manager.load_settings") as load:
            load.return_value = {
                "local_llm_mode": "auto",
                "local_llm_model": "custom",
                "local_llm_model_path": "",
            }

            status = RuntimeServiceManager().llm_status()

        self.assertEqual(status["status"], "model_missing")

    def test_external_mode_exposes_configured_url(self) -> None:
        with patch("local_asr_server.runtime.service_manager.load_settings") as load:
            load.return_value = {
                "local_llm_mode": "external",
                "local_llm_model": "nemotron-nano-4b",
                "local_llm_url": "http://127.0.0.1:5555",
            }

            status = RuntimeServiceManager().llm_status()

        self.assertEqual(status["status"], "stopped")
        self.assertFalse(status["managed"])
        self.assertEqual(status["url"], "http://127.0.0.1:5555")

    def test_auto_mode_ensures_managed_sidecar_ready(self) -> None:
        sidecar = Mock()
        sidecar.ensure_ready.return_value = {
            "base_url": "http://127.0.0.1:49001",
            "reasoning": "auto",
            "requested_reasoning": "auto",
            "restart_required": False,
        }
        with patch("local_asr_server.runtime.service_manager.load_settings") as load:
            load.return_value = {
                "local_llm_mode": "auto",
                "local_llm_model": "nemotron-nano-4b",
                "local_llm_model_path": "",
                "local_llm_reasoning": "auto",
            }

            result = RuntimeServiceManager(llm_sidecar=sidecar).ensure_llm_ready(capability="text")

        self.assertEqual(result["base_url"], "http://127.0.0.1:49001")
        sidecar.ensure_ready.assert_called_once_with(
            model="nemotron-nano-4b",
            model_path="",
            backend="",
            mmproj_path="",
            ctx_size=None,
            startup_timeout=None,
            llama_server_bin="",
            reasoning="auto",
            capability="text",
        )

    def test_external_mode_returns_configured_llm_url_without_sidecar(self) -> None:
        sidecar = Mock()
        with patch("local_asr_server.runtime.service_manager.load_settings") as load:
            load.return_value = {
                "local_llm_mode": "external",
                "local_llm_model": "nemotron-nano-4b",
                "local_llm_url": "http://127.0.0.1:5555",
                "local_llm_reasoning": "off",
            }

            result = RuntimeServiceManager(llm_sidecar=sidecar).ensure_llm_ready(capability="text")

        self.assertEqual(result["base_url"], "http://127.0.0.1:5555")
        self.assertEqual(result["model"], "nemotron-nano-4b")
        self.assertEqual(result["reasoning"], "off")
        sidecar.ensure_ready.assert_not_called()


if __name__ == "__main__":
    unittest.main()
