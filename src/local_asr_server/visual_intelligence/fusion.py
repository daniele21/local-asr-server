from __future__ import annotations

from collections import defaultdict
from typing import Any


def derive_visual_transcript_links(
    temporal: dict[str, Any], segments: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Link visual timeline items to overlapping transcript evidence without mutation."""
    targets = []
    for index, event in enumerate(temporal.get("meeting_state_events") or []):
        targets.append((f"meeting-event-{index + 1:03d}", "meeting_state_event", event))
    for session in temporal.get("share_sessions") or []:
        for index, keyframe in enumerate(session.get("keyframes") or []):
            targets.append((
                f"{session.get('id') or 'share'}-keyframe-{index + 1:03d}",
                "share_keyframe", keyframe,
            ))

    links = []
    for target_id, target_type, target in targets:
        timestamp = float(target.get("timestamp") or 0.0)
        evidence = []
        for index, segment in enumerate(segments):
            start = float(segment.get("start") or 0.0)
            end = float(segment.get("end") or start)
            if start <= timestamp <= end:
                evidence.append({
                    "segment_id": str(segment.get("id", index)),
                    "start": start,
                    "end": end,
                })
        if evidence:
            links.append({
                "link_id": f"visual-transcript-{len(links) + 1:03d}",
                "target_id": target_id,
                "target_type": target_type,
                "timestamp": timestamp,
                "observation_id": target.get("observation_id"),
                "derivation": "timestamp_overlap",
                "transcript_evidence": evidence,
            })
    return links


def apply_visual_speaker_mapping(
    payload: dict[str, Any], observations: list[dict[str, Any]], *,
    minimum_observations: int, minimum_margin: float,
    minimum_distinct_turns: int = 1,
    minimum_temporal_support_seconds: float = 0.0,
) -> dict[str, Any]:
    """Map provider-owned diarization clusters using sparse visual evidence."""
    support: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    matched_observations: dict[str, int] = defaultdict(int)
    matched_turns: dict[str, set[str]] = defaultdict(set)
    matched_timestamps: dict[str, list[float]] = defaultdict(list)
    segments = payload.get("segments") or []
    for observation in observations:
        names = observation.get("active_speakers") or []
        if len(names) != 1:
            continue
        timestamp = float(observation.get("timestamp") or 0.0)
        confidence = max(0.0, min(1.0, float(observation.get("confidence") or 0.0)))
        
        cluster = observation.get("expected_cluster")
        matched = None
        if cluster:
            turn_id = observation.get("diarization_turn_id")
            if turn_id:
                matched = next((item for item in segments if str(item.get("id")) == turn_id), None)
            if not matched:
                matched = next((item for item in segments if item.get("provider_speaker") == cluster and float(item.get("start") or 0.0) <= timestamp <= float(item.get("end") or 0.0)), None)
        else:
            overlapping = []
            for segment in segments:
                cluster_cand = segment.get("provider_speaker")
                start = float(segment.get("start") or 0.0)
                end = float(segment.get("end") or start)
                if cluster_cand and start <= timestamp <= end:
                    overlapping.append(segment)
            system_matches = [item for item in overlapping if item.get("source") == "system"]
            eligible = system_matches or [item for item in overlapping if item.get("source") != "mic"]
            clusters = {str(item.get("provider_speaker")) for item in eligible}
            matched = eligible[0] if len(clusters) == 1 else None
            if matched:
                cluster = str(matched["provider_speaker"])

        if matched and cluster:
            independent = observation.get("independent_inference", True)
            if independent:
                support[cluster][str(names[0])] += confidence
                matched_observations[cluster] += 1
                matched_start = float(matched.get("start") or 0.0)
                matched_end = float(matched.get("end") or matched_start)
                matched_turns[cluster].add(str(matched.get("id", f"{matched_start}:{matched_end}")))
                matched_timestamps[cluster].append(timestamp)

    mappings, resolved = [], {}
    for cluster, candidates in support.items():
        ranked = sorted(candidates.items(), key=lambda item: item[1], reverse=True)
        best_name, best_score = ranked[0]
        second_score = ranked[1][1] if len(ranked) > 1 else 0.0
        margin = (best_score - second_score) / (sum(candidates.values()) or 1.0)
        timestamps = matched_timestamps[cluster]
        temporal_support = max(timestamps) - min(timestamps) if len(timestamps) >= 2 else 0.0
        accepted = (
            matched_observations[cluster] >= minimum_observations
            and len(matched_turns[cluster]) >= minimum_distinct_turns
            and temporal_support >= minimum_temporal_support_seconds
            and margin >= minimum_margin
        )
        mappings.append({
            "speaker_cluster": cluster, "display_name": best_name if accepted else None,
            "status": "accepted" if accepted else "needs_review",
            "support_score": round(best_score, 4),
            "observation_count": matched_observations[cluster],
            "distinct_turn_count": len(matched_turns[cluster]),
            "temporal_support_seconds": round(temporal_support, 4),
            "margin": round(margin, 4),
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
