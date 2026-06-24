import unittest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from pathlib import Path
import tempfile

from local_asr_server.server import create_app
from local_asr_server.llm import LLMService, MockProvider, NemotronLocalProvider, VoxtralLocalProvider

class AnalysisApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.transcriptions_dir = Path(self.temp_dir.name) / "transcriptions"
        self.transcriptions_dir.mkdir(parents=True, exist_ok=True)
        self.settings_patcher = patch("local_asr_server.transcriptions.load_settings")
        self.mock_load_settings = self.settings_patcher.start()
        self.mock_load_settings.return_value = {
            "transcriptions_dir": str(self.transcriptions_dir),
            "recordings_dir": self.temp_dir.name,
            "gemini_api_key": "",
            "llm_provider": "mock",
            "local_llm_url": "http://127.0.0.1:1235",
        }
        self.app = create_app(
            default_model="test-model",
            recordings_dir=Path(self.temp_dir.name),
            enable_auth=False,
        )
        self.client = TestClient(self.app)

    def tearDown(self) -> None:
        self.settings_patcher.stop()
        self.client.close()
        self.temp_dir.cleanup()

    def test_mock_analysis_endpoint(self) -> None:
        response = self.client.post(
            "/v1/analysis",
            json={
                "text": "Hello world",
                "llm_provider": "mock"
            }
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("title", data)
        self.assertIn("summary", data)
        self.assertIn("key_points", data)
        self.assertIn("action_items", data)

    @patch("local_asr_server.routers.system.load_settings")
    def test_settings_does_not_return_gemini_secret(self, mock_load) -> None:
        mock_load.return_value = {"gemini_api_key": "secret-value", "llm_provider": "gemini"}
        response = self.client.get("/v1/settings")
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("gemini_api_key", response.json())
        self.assertTrue(response.json()["gemini_api_key_configured"])

    @patch("local_asr_server.routers.system.load_settings")
    @patch("local_asr_server.llm.urllib.request.urlopen")
    def test_gemini_analysis_endpoint(self, mock_urlopen, mock_load) -> None:
        mock_load.return_value = {
            "gemini_api_key": "test_key",
            "llm_provider": "gemini"
        }
        
        # Mock Gemini response
        mock_resp = MagicMock()
        mock_resp.read.return_value = b'{"candidates": [{"content": {"parts": [{"text": "{\\"title\\": \\"Gemini Title\\", \\"summary\\": \\"Gemini Summary\\", \\"key_points\\": [\\"point 1\\"], \\"action_items\\": [\\"action 1\\"]}"}]}}]}'
        mock_urlopen.return_value.__enter__.return_value = mock_resp
        
        response = self.client.post(
            "/v1/analysis",
            json={
                "text": "Hello Gemini",
                "llm_provider": "gemini",
                "gemini_api_key": "test_key"
            }
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["title"], "Gemini Title")

    @patch("local_llm_server.client.LocalLLMClient")
    def test_nemotron_local_provider_called(self, mock_client_cls) -> None:
        mock_client = MagicMock()
        mock_client.is_ready.return_value = True
        mock_client.analyze_text.return_value = {
            "title": "Nemotron Title",
            "summary": "Nemotron Summary",
            "key_points": ["point n"],
            "action_items": []
        }
        mock_client_cls.return_value = mock_client

        provider = LLMService.get_provider("nemotron_local", local_llm_url="http://127.0.0.1:1235", local_llm_model="nemotron-nano-4b")
        self.assertIsInstance(provider, NemotronLocalProvider)
        
        result = provider.analyze("Test Nemotron Text")
        mock_client_cls.assert_called_once_with(base_url="http://127.0.0.1:1235", model="nemotron-nano-4b")
        mock_client.analyze_text.assert_called_once_with("Test Nemotron Text", language="it")
        self.assertEqual(result["title"], "Nemotron Title")

    @patch("local_llm_server.client.LocalLLMClient")
    def test_voxtral_local_provider_audio(self, mock_client_cls) -> None:
        mock_client = MagicMock()
        mock_client.is_ready.return_value = True
        mock_client.analyze_audio.return_value = {
            "title": "Voxtral Title",
            "summary": "Voxtral Summary",
            "key_points": ["point v"],
            "action_items": []
        }
        mock_client_cls.return_value = mock_client

        provider = LLMService.get_provider("voxtral_local", local_llm_url="http://127.0.0.1:1235", local_llm_model="voxtral-mini-3b")
        self.assertIsInstance(provider, VoxtralLocalProvider)
        
        result = provider.analyze_audio("test.wav", task="insights", question="what?")
        mock_client_cls.assert_called_once_with(base_url="http://127.0.0.1:1235", model="voxtral-mini-3b")
        mock_client.analyze_audio.assert_called_once_with(
            audio_path="test.wav",
            task="insights",
            question="what?",
            language="it"
        )
        self.assertEqual(result["title"], "Voxtral Title")

    @patch("local_llm_server.client.LocalLLMClient")
    @patch("local_asr_server.routers.system.load_settings")
    def test_voxtral_audio_analysis_via_endpoint(self, mock_load, mock_client_cls) -> None:
        mock_load.return_value = {
            "local_llm_url": "http://127.0.0.1:1235",
            "llm_provider": "voxtral_local"
        }
        mock_client = MagicMock()
        mock_client.is_ready.return_value = True
        mock_client.analyze_audio.return_value = {
            "title": "Voxtral Endpoint Title",
            "summary": "Voxtral Endpoint Summary",
            "key_points": ["point v_end"],
            "action_items": []
        }
        mock_client_cls.return_value = mock_client

        # Create a mock recording
        created = self.client.post(
            "/v1/recordings",
            json={
                "title": "Voxtral Test Audio",
                "mime_type": "audio/webm;codecs=opus",
                "language": "it",
            },
        )
        self.assertEqual(created.status_code, 201)
        recording_id = created.json()["id"]

        # Append mock chunk and stop to finalize paths
        self.client.post(
            f"/v1/recordings/{recording_id}/chunks",
            data={"sequence": "0"},
            files={"file": ("chunk.webm", b"audio", "audio/webm")},
        )
        self.client.post(f"/v1/recordings/{recording_id}/stop")

        # Now test analysis endpoint with recording_id
        response = self.client.post(
            "/v1/analysis",
            json={
                "recording_id": recording_id,
                "llm_provider": "voxtral_local",
                "audio_task": "insights",
                "question": "test-question"
            }
        )
        
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["title"], "Voxtral Endpoint Title")

    def test_prompts_endpoints(self) -> None:
        # Test GET /v1/prompts
        response = self.client.get("/v1/prompts")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("summary", data)
        self.assertIn("default_instruction", data)
        
        # Test POST /v1/prompts
        custom_prompts = {
            "summary": {
                "it": "Custom summary prompt",
                "en": "Custom summary prompt en"
            },
            "default_instruction": {
                "it": "Custom instruction",
                "en": "Custom instruction en"
            }
        }
        post_response = self.client.post("/v1/prompts", json=custom_prompts)
        self.assertEqual(post_response.status_code, 200)
        
        # Re-fetch and check
        get_response = self.client.get("/v1/prompts")
        self.assertEqual(get_response.status_code, 200)
        updated_data = get_response.json()
        self.assertEqual(updated_data["summary"]["it"], "Custom summary prompt")
        self.assertEqual(updated_data["default_instruction"]["it"], "Custom instruction")


if __name__ == "__main__":
    unittest.main()
