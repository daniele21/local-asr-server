from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

import uvicorn


def _default_model() -> str:
    local_model_path = Path(
        "~/.lmstudio/models/mlx-community/whisper-large-v3-turbo"
    ).expanduser()
    if local_model_path.exists():
        return str(local_model_path)
    return "mlx-community/whisper-large-v3-turbo"


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="local-asr",
        description="Local ASR server powered by MLX Whisper.",
    )
    subparsers = parser.add_subparsers(dest="command")

    serve = subparsers.add_parser("serve", help="Start the ASR server.")
    serve.add_argument(
        "--model",
        default=_default_model(),
        help="HF repo or local path to MLX Whisper model.",
    )
    serve.add_argument("--host", default="127.0.0.1", help="Bind address.")
    serve.add_argument("--port", type=int, default=1236, help="HTTP port.")
    serve.add_argument(
        "--reload",
        action="store_true",
        help="Enable reload for development.",
    )
    serve.add_argument(
        "--recordings-dir",
        default="~/Recordings/local-asr",
        help="Directory used to persist call recordings and transcripts.",
    )

    subparsers.add_parser(
        "doctor",
        help="Check the macOS audio capture configuration.",
    )
    subparsers.add_parser(
        "setup-audio",
        help="Install macOS audio routing prerequisites.",
    )
    subparsers.add_parser(
        "app",
        help="Launch ClosedRoom in menu bar mode (macOS only).",
    )
    return parser


def _print_audio_status() -> bool:
    """Check and display the audio routing configuration status."""
    from local_asr_server.audio_router import AudioRouter

    status = AudioRouter.get_status()

    # Check Swift audio helper
    helper_ok = status.get("audio_helper_available", False)
    swift_check = "OK" if helper_ok else "MISSING"

    checks = (
        ("macOS", status["platform"] == "darwin"),
        ("BlackHole 2ch", status["blackhole_installed"]),
        ("Audio Helper", helper_ok),
    )
    for label, passed in checks:
        print(f"{'OK' if passed else 'MISSING':7} {label}")

    if status.get("physical_output"):
        print(f"        Current output: {status['physical_output']}")

    routing_active = status.get("routing_active", False)
    if routing_active:
        print(f"        Routing:        Active (temporary device)")

    if status["ready_to_record"]:
        print(
            "\nAudio routing is ready."
            "\nMulti-Output devices are created automatically when recording."
        )
        return True

    print("\nAudio routing is not ready.")
    missing = status.get("missing", [])
    if "audio_helper" in missing:
        print("- Audio helper not available. Run: local-asr setup-audio")
    if "blackhole" in missing:
        print("- BlackHole 2ch not installed. Run: brew install blackhole-2ch")
    return False


def _setup_audio() -> None:
    """Install audio prerequisites and compile the Swift helper."""
    if sys.platform != "darwin":
        raise SystemExit("setup-audio is supported only on macOS.")
    brew = shutil.which("brew")
    if not brew:
        raise SystemExit("Homebrew is required: https://brew.sh")

    # Install BlackHole (SwitchAudioSource no longer required)
    print("Installing BlackHole 2ch...")
    subprocess.run(
        [brew, "install", "blackhole-2ch"],
        check=True,
    )

    # Compile the Swift audio helper
    print("\nCompiling Core Audio helper...")
    try:
        from local_asr_server.macos_audio_helper.compile import compile_helper
        binary_path = compile_helper(force=True)
        print(f"Audio helper compiled: {binary_path}")
    except RuntimeError as exc:
        print(f"WARNING: Failed to compile audio helper: {exc}")
        print("You may need to install Xcode Command Line Tools:")
        print("  xcode-select --install")
        return

    print(
        "\nSetup complete! Multi-Output devices are now created "
        "automatically when you start a recording.\n"
        "No manual Audio MIDI Setup configuration is needed.\n"
        "Run 'local-asr doctor' to verify."
    )


def main() -> None:
    parser = _build_parser()
    argv = sys.argv[1:]
    if not argv:
        argv = ["serve"]
    args = parser.parse_args(argv)

    if args.command == "doctor":
        if not _print_audio_status():
            raise SystemExit(1)
        return
    if args.command == "setup-audio":
        _setup_audio()
        return
    if args.command == "app":
        from local_asr_server.menubar import main as menubar_main
        menubar_main()
        return
    if args.command != "serve":
        parser.print_help()
        return

    from local_asr_server.server import create_app

    app = create_app(
        default_model=args.model,
        recordings_dir=Path(args.recordings_dir).expanduser(),
    )
    uvicorn.run(
        app,
        host=args.host,
        port=args.port,
        reload=args.reload,
    )
