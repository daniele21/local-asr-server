from __future__ import annotations

import unittest
from types import SimpleNamespace

from local_asr_server.app_services import AppServices, get_services, install_compatibility_aliases


class AppServicesTests(unittest.TestCase):
    def _services(self) -> AppServices:
        values = [object() for _ in range(10)]
        return AppServices(*values)

    def test_install_exposes_legacy_aliases(self) -> None:
        app = SimpleNamespace(state=SimpleNamespace())
        services = self._services()

        install_compatibility_aliases(app, services)

        self.assertIs(app.state.services, services)
        self.assertIs(app.state.recording_store, services.recordings)
        self.assertIs(app.state.capture_manager, services.capture)

    def test_get_services_honors_runtime_alias_override(self) -> None:
        app = SimpleNamespace(state=SimpleNamespace())
        services = self._services()
        install_compatibility_aliases(app, services)
        replacement = object()
        app.state.capture_manager = replacement

        resolved = get_services(app)

        self.assertIs(resolved.capture, replacement)


if __name__ == "__main__":
    unittest.main()
