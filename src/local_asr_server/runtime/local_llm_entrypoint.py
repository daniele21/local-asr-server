from __future__ import annotations


def run_local_llm_server_cli() -> None:
    """Start the pinned upstream runtime after applying ClosedRoom overrides."""
    from local_asr_server.local_llm_params import configure_local_llm_server_registry

    configure_local_llm_server_registry()

    from local_llm_server.cli import main

    main()


if __name__ == "__main__":
    run_local_llm_server_cli()
