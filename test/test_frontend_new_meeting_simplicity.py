from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).parents[1]
PAGE = ROOT / "frontend" / "src" / "pages" / "NewRecordingPage.tsx"


class NewMeetingSimplicityContractTests(unittest.TestCase):
    def setUp(self) -> None:
        self.source = PAGE.read_text(encoding="utf-8")

    def test_normal_new_meeting_does_not_expose_enrichment_controls(self) -> None:
        self.assertNotIn("visualIntelligenceEnabled", self.source)
        self.assertNotIn("speakerDiarizationEnabled", self.source)
        self.assertNotIn("captureWindows", self.source)
        self.assertNotIn("updateEnrichmentSetting", self.source)
        self.assertNotIn("<Checkbox", self.source)

    def test_capture_source_controls_exist_only_in_audio_recovery(self) -> None:
        self.assertIn("showAudioRecovery", self.source)
        self.assertIn("!nativeCaptureReady && nativeCaptureChecked", self.source)
        self.assertIn("new-meeting-audio-recovery", self.source)
        self.assertIn("ClosedRoom could not configure audio automatically", self.source)

    def test_normal_start_keeps_automatic_both_source_default_without_visual_capture(self) -> None:
        self.assertIn("useState<'both' | 'mic_only' | 'pc_only'>('both')", self.source)
        self.assertIn("recorder.startRecording(title, projectName, '', sourceMode)", self.source)
        self.assertNotIn("selectedVisualWindowId", self.source)
        self.assertNotIn("visualCaptureLabel", self.source)


if __name__ == "__main__":
    unittest.main()
