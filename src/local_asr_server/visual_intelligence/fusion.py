from __future__ import annotations

from collections import defaultdict
from typing import Any


def apply_visual_speaker_mapping(
    payload: dict[str, Any], observations: list[dict[str, Any]], *,
    minimum_observations: int, minimum_margin: float,
) -> dict[str, Any]:
    """Map provider-owned diarization clusters using sparse visual evidence."""
    support: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    matched_observations: dict[str, int] = defaultdict(int)
    segments = payload.get("segments") or []
    for observation in observations:
        names = observation.get("active_speakers") or []
        if len(names) != 1:
            continue
        timestamp = float(observation.get("timestamp") or 0.0)
        confidence = max(0.0, min(1.0, float(observation.get("confidence") or 0.0)))
        overlapping = []
        for segment in segments:
            cluster = segment.get("provider_speaker")
            start = float(segment.get("start") or 0.0)
            end = float(segment.get("end") or start)
            if cluster and start <= timestamp <= end:
                overlapping.append(segment)
        # A selected conferencing window is evidence for computer-audio speakers,
        # not for the local microphone. Prefer system, then mixed/unknown tracks.
        matched = next((item for item in overlapping if item.get("source") == "system"), None)
        matched = matched or next((item for item in overlapping if item.get("source") != "mic"), None)
        if matched:
            cluster = str(matched["provider_speaker"])
            support[cluster][str(names[0])] += confidence
            matched_observations[cluster] += 1

    mappings, resolved = [], {}
    for cluster, candidates in support.items():
        ranked = sorted(candidates.items(), key=lambda item: item[1], reverse=True)
        best_name, best_score = ranked[0]
        second_score = ranked[1][1] if len(ranked) > 1 else 0.0
        margin = (best_score - second_score) / (sum(candidates.values()) or 1.0)
        accepted = matched_observations[cluster] >= minimum_observations and margin >= minimum_margin
        mappings.append({
            "speaker_cluster": cluster, "display_name": best_name if accepted else None,
            "status": "accepted" if accepted else "needs_review",
            "support_score": round(best_score, 4),
            "observation_count": matched_observations[cluster], "margin": round(margin, 4),
        })
        if accepted:
            resolved[cluster] = best_name

    for segment in segments:
        name = resolved.get(str(segment.get("provider_speaker")))
        if name:
            segment["speaker_name"] = name
            segment["speaker_label"] = name
    payload["speaker_attribution"] = {
        "version": 1, "source": "visual_evidence_plus_provider_diarization", "mappings": mappings,
    }
    if resolved:
        payload["text"] = _render_text(segments)
    return payload


def _render_text(segments: list[dict[str, Any]]) -> str:
    lines = []
    for segment in segments:
        text = str(segment.get("text") or "").strip()
        if not text:
            continue
        seconds = max(0, int(float(segment.get("start") or 0.0)))
        label = segment.get("speaker_name") or segment.get("speaker_label") or segment.get("source") or "Audio"
        lines.append(f"[{seconds // 60:02d}:{seconds % 60:02d}] {label}: {text}")
    return "\n".join(lines)
