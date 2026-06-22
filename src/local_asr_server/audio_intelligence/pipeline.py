from __future__ import annotations

from pathlib import Path
from typing import Any

from local_asr_server.audio_intelligence.audio_io import iter_energy_windows
from local_asr_server.audio_intelligence.features import (
    MAX_SERIALIZED_EVENTS,
    build_error_track_features,
    build_mock_insights,
    build_track_features,
    enrich_segments,
    summarize_conversation,
)


INTELLIGENCE_VERSION = 1
ENERGY_BACKEND = "energy-rms-v1"


def build_audio_intelligence(
    track_paths: list[tuple[dict[str, Any], Path]],
    segments: list[dict[str, Any]],
) -> dict[str, Any]:
    tracks = []
    for track, path in track_paths:
        try:
            windows = list(iter_energy_windows(path))
            if not windows and path.exists() and path.stat().st_size > 0:
                raise ValueError("audio_decode_empty")
            tracks.append(build_track_features(track, windows))
        except Exception as exc:
            tracks.append(build_error_track_features(track, str(exc)))

    enriched_segments = enrich_segments(segments, tracks)
    metrics = summarize_conversation(tracks, enriched_segments)
    mock_insights = build_mock_insights(metrics)
    return {
        "version": INTELLIGENCE_VERSION,
        "backend": ENERGY_BACKEND,
        "mode": "metadata_only",
        "channels": {
            track.source: {
                "track_id": track.track_id,
                "label": track.label,
                "available": track.error is None,
                "error": track.error,
                "duration_seconds": round(track.duration_seconds, 3),
                "speech_threshold": round(track.threshold, 6),
            }
            for track in tracks
        },
        "speech_windows": [
            window
            for track in tracks
            for window in track.speech_windows
        ][:MAX_SERIALIZED_EVENTS],
        "segments": enriched_segments,
        "conversation_metrics": metrics,
        "insight_candidates": mock_insights,
        "mock": True,
    }
