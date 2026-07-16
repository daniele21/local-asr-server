import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class FrontendTranscriptionWorkflowTests(unittest.TestCase):
    def test_meeting_uses_the_shared_transcription_workflow(self) -> None:
        page = (ROOT / "frontend/src/pages/MeetingDetailPage.tsx").read_text(encoding="utf-8")

        self.assertIn("recordingTranscriptionRoute(meeting.id", page)
        self.assertNotIn("TranscriptionModelModal", page)
        self.assertNotIn("ApiClient.createTranscriptionJob", page)

    def test_recording_route_contract_is_centralized(self) -> None:
        route_helper = (ROOT / "frontend/src/utils/transcriptionRoute.ts").read_text(encoding="utf-8")
        transcription_page = (ROOT / "frontend/src/pages/TranscriptionPage.tsx").read_text(encoding="utf-8")

        self.assertIn("recordingTranscriptionRoute", route_helper)
        self.assertIn("parseRecordingTranscriptionRoute", route_helper)
        self.assertIn("parseRecordingTranscriptionRoute(detailPath)", transcription_page)
        self.assertNotIn("detailPath.startsWith('file-')", transcription_page)


if __name__ == "__main__":
    unittest.main()
