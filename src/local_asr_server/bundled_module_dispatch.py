from __future__ import annotations

import runpy
import sys
from collections.abc import Sequence


SUPPORTED_BUNDLED_MODULES = {"local_llm_server", "mlx_vlm.server"}
SUPPORTED_CLI_COMMANDS = {"inspect-meeting"}


def dispatch_bundled_module(argv: Sequence[str] | None = None) -> bool:
    """Emulate the two ``python -m`` calls used by managed visual inference.

    A frozen PyInstaller executable cannot interpret ``-m`` itself: launching
    ``sys.executable -m ...`` starts the ClosedRoom entry point again. The app
    entry point calls this dispatcher before constructing any Cocoa UI.
    """

    arguments = list(sys.argv if argv is None else argv)
    if len(arguments) >= 2 and arguments[1] in SUPPORTED_CLI_COMMANDS:
        from local_asr_server.cli import main

        sys.argv = ["local-asr", *arguments[1:]]
        main()
        return True

    if len(arguments) < 3 or arguments[1] != "-m" or arguments[2] not in SUPPORTED_BUNDLED_MODULES:
        return False

    module = arguments[2]
    sys.argv = [module, *arguments[3:]]
    if module == "local_llm_server":
        from local_llm_server.cli import main

        main()
    else:
        runpy.run_module(module, run_name="__main__")
    return True
