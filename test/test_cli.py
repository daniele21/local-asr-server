from __future__ import annotations

import unittest

from local_asr_server.cli import _build_parser, _resolve_serve_port


class CliPortTests(unittest.TestCase):
    def test_serve_defaults_to_app_port_without_reload(self) -> None:
        args = _build_parser().parse_args(["serve"])
        self.assertEqual(_resolve_serve_port(args), 1236)

    def test_reload_defaults_to_dedicated_dev_port(self) -> None:
        args = _build_parser().parse_args(["serve", "--reload"])
        self.assertEqual(_resolve_serve_port(args), 1237)

    def test_explicit_port_overrides_reload_default(self) -> None:
        args = _build_parser().parse_args(["serve", "--reload", "--port", "1240"])
        self.assertEqual(_resolve_serve_port(args), 1240)


if __name__ == "__main__":
    unittest.main()
