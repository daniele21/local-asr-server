from __future__ import annotations

import argparse

import uvicorn


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="local-asr",
        description="Local ASR server powered by MLX Whisper.",
    )

    parser.add_argument(
        "serve",
        nargs="?",
        default="serve",
        help="Start the ASR server.",
    )

    import os
    from pathlib import Path

    local_model_path = Path("~/.lmstudio/models/mlx-community/whisper-large-v3-turbo").expanduser()
    default_model = str(local_model_path) if local_model_path.exists() else "mlx-community/whisper-large-v3-turbo"

    parser.add_argument(
        "--model",
        default=default_model,
        help="HF repo or local path to MLX Whisper model.",
    )

    parser.add_argument(
        "--host",
        default="127.0.0.1",
        help="Bind address.",
    )

    parser.add_argument(
        "--port",
        type=int,
        default=1236,
        help="HTTP port.",
    )

    parser.add_argument(
        "--reload",
        action="store_true",
        help="Enable reload for development.",
    )

    parser.add_argument(
        "--recordings-dir",
        default="~/Recordings/local-asr",
        help="Directory used to persist call recordings and transcripts.",
    )

    args = parser.parse_args()

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
