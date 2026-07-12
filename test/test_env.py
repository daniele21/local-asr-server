from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from local_asr_server import env


class EnvTests(unittest.TestCase):
    def test_loads_dotenv_case_insensitive_secret_lookup(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            Path(temp, ".env").write_text("SPeeCHMATICS_API_KEY=secret\n", encoding="utf-8")
            with patch.object(env, "_LOADED", False), patch.object(env, "_candidate_env_files", return_value=[Path(temp, ".env")]), patch.dict(os.environ, {}, clear=True):
                self.assertEqual(env.get_env_var("SPEECHMATICS_API_KEY"), "secret")


if __name__ == "__main__":
    unittest.main()
