from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

import uvicorn

from local_asr_server.runtime.models import (
    DEFAULT_API_PORT,
    DEFAULT_DEV_RELOAD_PORT,
    LOCAL_SERVICE_HOST,
)

DEFAULT_SERVER_PORT = DEFAULT_API_PORT
DEV_SERVER_PORT = DEFAULT_DEV_RELOAD_PORT


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
    serve.add_argument(
        "--port",
        type=int,
        default=None,
        help=(
            "HTTP port. Defaults to 1236, or 1237 when --reload is used "
            "so the development server stays separate from the macOS app."
        ),
    )
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
    serve.add_argument(
        "--llm-port",
        type=int,
        default=None,
        help="Start the local LLM server on this port in parallel.",
    )
    serve.add_argument(
        "--llm-model",
        default=None,
        help="The local LLM model key to run in local-llm-server (e.g. nemotron-nano-4b, voxtral-mini-3b).",
    )
    serve.add_argument(
        "--llm-model-path",
        default=None,
        help="The direct path to a local GGUF model file.",
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


def _resolve_serve_port(args: argparse.Namespace) -> int:
    if args.port is not None:
        return args.port
    return DEV_SERVER_PORT if args.reload else DEFAULT_SERVER_PORT


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

    port = _resolve_serve_port(args)
    app = create_app(
        default_model=args.model,
        recordings_dir=Path(args.recordings_dir).expanduser(),
    )

    llm_process = None
    if args.llm_port:
        from local_asr_server.settings import load_settings, save_settings
        settings = load_settings()
        settings["local_llm_mode"] = "external"
        settings["local_llm_url"] = f"http://{LOCAL_SERVICE_HOST}:{args.llm_port}"
        
        # Get model key from args, settings, or default
        llm_model = args.llm_model or settings.get("local_llm_model") or "nemotron-nano-4b"
        llm_model_paths = settings.get("local_llm_model_paths", {})
        llm_model_path = args.llm_model_path or llm_model_paths.get(llm_model) or settings.get("local_llm_model_path") or ""
        settings["local_llm_model"] = llm_model
        settings["local_llm_model_path"] = llm_model_path
        save_settings(settings)

        # Build command to start local-llm-server
        cmd = [sys.executable, "-m", "local_llm_server", "serve", "--host", LOCAL_SERVICE_HOST, "--port", str(args.llm_port)]
        if llm_model_path:
            cmd.extend(["--model-path", llm_model_path])
        else:
            cmd.extend(["--model", llm_model])

        binary = shutil.which("local-llm-server")
        if binary:
            binary_cmd = [binary, "serve", "--host", LOCAL_SERVICE_HOST, "--port", str(args.llm_port)]
            if llm_model_path:
                binary_cmd.extend(["--model-path", llm_model_path])
            else:
                binary_cmd.extend(["--model", llm_model])
            cmd = binary_cmd
        
        desc = f"path: {llm_model_path}" if llm_model_path else f"model: {llm_model}"
        print(f"Starting local LLM server ({desc}) on port {args.llm_port} in background...")
        llm_process = subprocess.Popen(cmd)

    try:
        uvicorn.run(
            app,
            host=args.host,
            port=port,
            reload=args.reload,
        )
    finally:
        if llm_process:
            print("Stopping local LLM server...")
            llm_process.terminate()
            try:
                llm_process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                llm_process.kill()
