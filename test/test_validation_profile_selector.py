from __future__ import annotations

import importlib.util
from pathlib import Path
import unittest


SCRIPT = Path(__file__).parents[1] / "scripts" / "select_validation_profile.py"
spec = importlib.util.spec_from_file_location("select_validation_profile", SCRIPT)
assert spec and spec.loader
selector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(selector)


class ValidationProfileSelectorTests(unittest.TestCase):
    def test_docs_only_is_lean(self):
        result = selector.select_profile(["docs/current-state.md", "README.md"])
        self.assertEqual(result["profile"], "lean")

    def test_ordinary_frontend_change_is_scoped(self):
        result = selector.select_profile(["frontend/src/pages/SettingsPage.tsx"])
        self.assertEqual(result["profile"], "scoped")

    def test_runtime_change_is_strong(self):
        result = selector.select_profile(["src/local_asr_server/runtime/service_manager.py"])
        self.assertEqual(result["profile"], "strong")

    def test_e2e_contract_dot_path_is_strong(self):
        result = selector.select_profile([".engineering/e2e.json"])
        self.assertEqual(result["profile"], "strong")

    def test_workflow_dot_path_is_full(self):
        result = selector.select_profile([".github/workflows/preflight.yml"])
        self.assertEqual(result["profile"], "full")

    def test_stage_environment_policy_verifier_is_full(self):
        result = selector.select_profile(["scripts/verify_stage_environment_policy.py"])
        self.assertEqual(result["profile"], "full")

    def test_exact_dotfile_keeps_its_profile(self):
        result = selector.select_profile([".editorconfig"])
        self.assertEqual(result["profile"], "lean")

    def test_dot_slash_prefix_preserves_dot_path_classification(self):
        self.assertEqual(
            selector.classify_path("./.engineering/e2e.json"),
            selector.classify_path(".engineering/e2e.json"),
        )

    def test_build_or_selector_change_is_full(self):
        for path in ("build.sh", "pyproject.toml", "scripts/select_validation_profile.py"):
            with self.subTest(path=path):
                self.assertEqual(selector.select_profile([path])["profile"], "full")

    def test_strongest_changed_path_wins(self):
        result = selector.select_profile(
            ["docs/current-state.md", "frontend/src/App.tsx", "src/local_asr_server/catalog.py"]
        )
        self.assertEqual(result["profile"], "strong")

    def test_unknown_path_fails_safe_full(self):
        result = selector.select_profile(["unexpected/tooling.conf"])
        self.assertEqual(result["profile"], "full")
        self.assertIn("fails safe", result["reason"])


if __name__ == "__main__":
    unittest.main()
