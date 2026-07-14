from __future__ import annotations

import importlib.util
from pathlib import Path
import sys
import unittest


SCRIPT = Path(__file__).parents[1] / "scripts" / "update_local_llm_server.py"
SPEC = importlib.util.spec_from_file_location("update_local_llm_server", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class UpdateLocalLlmServerTests(unittest.TestCase):
    def test_selects_latest_stable_semver_tag(self) -> None:
        output = "\n".join([
            "a\trefs/tags/v0.3.7",
            "b\trefs/tags/v0.10.0",
            "c\trefs/tags/v0.11.0-rc1",
            "d\trefs/tags/not-a-version",
        ])
        self.assertEqual(str(MODULE.latest_version_from_ls_remote(output)), "0.10.0")

    def test_replaces_only_dependency_wheel_path(self) -> None:
        source = 'dependencies = [\n  "local-llm-server[vision] @ file:///old/local_llm_server-0.3.1-py3-none-any.whl",\n]\n'
        wheel = Path("/tmp/local_llm_server-0.3.8-py3-none-any.whl")
        updated = MODULE.replace_dependency(source, wheel)
        self.assertIn('"local-llm-server[vision] @ file://', updated)
        self.assertIn(f"file://{wheel.resolve()}", updated)
        self.assertEqual(str(MODULE.dependency_version(updated)), "0.3.8")

    def test_extracts_github_repository_slug(self) -> None:
        self.assertEqual(
            MODULE.github_repository_slug("https://github.com/daniele21/local-llm-server.git"),
            "daniele21/local-llm-server",
        )
        self.assertEqual(
            MODULE.github_repository_slug("git@github.com:daniele21/local-llm-server.git"),
            "daniele21/local-llm-server",
        )


if __name__ == "__main__":
    unittest.main()
