from __future__ import annotations

import unittest
import logging
import tempfile
from pathlib import Path
from unittest.mock import Mock

from local_asr_server.diagnostics import attach_diagnostics, diagnostic, log_diagnostic, outcome_status
from local_asr_server.meeting_diagnostics import build_meeting_diagnostic_report


class DiagnosticContractTests(unittest.TestCase):
    def test_fallback_makes_success_explicitly_completed_with_warnings(self) -> None:
        item = diagnostic(
            "audio_intelligence",
            "degraded",
            requested_backend="silero-vad-v4",
            actual_backend="energy-rms-v1",
            fallback_used=True,
            fallback_reason="vad_backend_unavailable",
        )

        self.assertEqual(outcome_status([item]), "completed_with_warnings")
        self.assertTrue(item["fallback_used"])
        self.assertEqual(item["actual_backend"], "energy-rms-v1")

    def test_attach_persists_same_contract_at_payload_and_stats_level(self) -> None:
        payload = attach_diagnostics({}, [diagnostic("visual_intelligence", "completed")])

        self.assertEqual(payload["outcome_status"], "completed")
        self.assertEqual(payload["diagnostics"], payload["stats"]["diagnostics"])

    def test_invalid_status_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            diagnostic("visual_intelligence", "silently_ignored")

    def test_correlated_log_redacts_secrets_and_report_reuses_it(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            log_path = Path(tmp) / "closedroom.log"
            logger = logging.getLogger(f"diagnostic-test-{id(self)}")
            logger.setLevel(logging.INFO)
            handler = logging.FileHandler(log_path, encoding="utf-8")
            logger.addHandler(handler)
            try:
                item = diagnostic(
                    "visual_intelligence",
                    "failed",
                    requested_backend="qwen",
                    error="api_key=super-secret",
                )
                log_diagnostic(logger, item, recording_id="rec-1", job_id="job-1")
                handler.flush()
            finally:
                logger.removeHandler(handler)
                handler.close()
            text = log_path.read_text(encoding="utf-8")
            self.assertIn('"recording_id": "rec-1"', text)
            self.assertIn('"job_id": "job-1"', text)
            self.assertNotIn("super-secret", text)

            store = Mock()
            store.list_jobs.return_value = []
            report = build_meeting_diagnostic_report(
                "rec-1", {"stats": {"diagnostics": [item]}}, store, log_file=log_path
            )
            self.assertEqual(report["diagnostics"], [item])
            self.assertTrue(report["log_lines"])


if __name__ == "__main__":
    unittest.main()
