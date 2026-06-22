from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from local_asr_server.audio_intelligence.audio_io import iter_energy_windows, load_audio_samples
from local_asr_server.audio_intelligence.features import (
    MAX_SERIALIZED_EVENTS,
    build_error_track_features,
    build_mock_insights,
    build_track_features,
    enrich_segments,
    summarize_conversation,
    format_vad_speech_windows,
)

logger = logging.getLogger("uvicorn.error")

INTELLIGENCE_VERSION = 1
ENERGY_BACKEND = "energy-rms-v1"
VAD_BACKEND = "silero-vad-v4"


def build_audio_intelligence(
    track_paths: list[tuple[dict[str, Any], Path]],
    segments: list[dict[str, Any]],
) -> dict[str, Any]:
    tracks = []
    backend_used = VAD_BACKEND
    
    use_vad = True
    try:
        from local_asr_server.audio_intelligence.vad import detect_speech_windows_vad
    except Exception as e:
        logger.warning(f"Could not load VAD backend, falling back to RMS: {e}")
        use_vad = False
        backend_used = ENERGY_BACKEND

    for track, path in track_paths:
        try:
            windows = list(iter_energy_windows(path))
            if not windows and path.exists() and path.stat().st_size > 0:
                raise ValueError("audio_decode_empty")
            
            track_features = None
            if use_vad:
                try:
                    samples = load_audio_samples(path)
                    duration = windows[-1].end if windows else 0.0
                    raw_speech = detect_speech_windows_vad(samples, sr=16000)
                    source = track.get("source") or track.get("id") or "audio"
                    speech_windows = format_vad_speech_windows(
                        raw_speech, windows, channel=source, duration=duration
                    )
                    track_features = build_track_features(
                        track, windows, speech_windows=speech_windows, threshold=0.5
                    )
                except Exception as vad_exc:
                    logger.warning(f"VAD failed for track {track.get('id')}, falling back to RMS: {vad_exc}")
                    backend_used = ENERGY_BACKEND
            
            if track_features is None:
                track_features = build_track_features(track, windows)
                
            tracks.append(track_features)
        except Exception as exc:
            tracks.append(build_error_track_features(track, str(exc)))

    enriched_segments = enrich_segments(segments, tracks)
    metrics = summarize_conversation(tracks, enriched_segments)
    mock_insights = build_mock_insights(metrics)
    return {
        "version": INTELLIGENCE_VERSION,
        "backend": backend_used,
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
