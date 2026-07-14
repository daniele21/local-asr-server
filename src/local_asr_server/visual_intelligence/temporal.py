from __future__ import annotations

from typing import Any

from local_asr_server.visual_intelligence.contracts import VisualTemporalConfig


def aggregate_temporal_state(
    observations: list[dict[str, Any]], *, config: VisualTemporalConfig | None = None,
) -> dict[str, Any]:
    config = config or VisualTemporalConfig()
    ordered = sorted(observations, key=lambda item: float(item.get("timestamp") or 0.0))
    speaker_intervals = _intervals(
        [item for item in ordered if item.get("task") == "meeting_ui"],
        value_key="active_speakers",
    )
    meeting_states = _stable_meeting_states(
        [item for item in ordered if item.get("task") == "meeting_state"],
        debounce_seconds=config.meeting_state_debounce_seconds,
    )
    meeting_state_events = _meeting_state_events(meeting_states)
    share_keyframes = [
        {
            "timestamp": float(item.get("timestamp") or 0.0),
            "content_type": item.get("content_type") or "unknown",
            "title": item.get("title"),
            "visible_text": item.get("visible_text") or [],
            "key_information": item.get("key_information") or [],
            "observation_id": item.get("observation_id"),
        }
        for item in ordered
        if (
            item.get("task") == "shared_content"
            and item.get("content_state") != "transitional"
            and (
                item.get("content_type") not in {None, "", "unknown"}
                or item.get("title")
                or item.get("visible_text")
                or item.get("key_information")
            )
        )
    ]
    share_sessions, unassigned_share_keyframes = _share_sessions(
        share_keyframes, meeting_states,
    )
    return {
        "schema_version": 2,
        "speaker_intervals": speaker_intervals,
        "meeting_state_events": meeting_state_events,
        "share_sessions": share_sessions,
        "unassigned_share_keyframes": unassigned_share_keyframes,
    }


def _share_sessions(share_keyframes, meeting_states):
    if not share_keyframes:
        return [], []
    if not meeting_states:
        return [{
            "id": "share-01",
            "start": share_keyframes[0]["timestamp"],
            "end": share_keyframes[-1]["timestamp"],
            "boundary_source": "shared_content_fallback",
            "keyframes": share_keyframes,
        }], []

    windows = []
    active_start = None
    for point in meeting_states:
        active = point["state"]["screen_share_active"]
        timestamp = point["timestamp"]
        if active and active_start is None:
            active_start = timestamp
        elif not active and active_start is not None:
            windows.append((active_start, timestamp))
            active_start = None
    if active_start is not None:
        windows.append((active_start, max(
            meeting_states[-1]["timestamp"], share_keyframes[-1]["timestamp"],
        )))

    sessions = []
    assigned_ids = set()
    for start, end in windows:
        keyframes = [
            item for item in share_keyframes
            if start <= item["timestamp"] <= end
        ]
        if not keyframes:
            continue
        sessions.append({
            "id": f"share-{len(sessions) + 1:02d}",
            "start": start,
            "end": end,
            "boundary_source": "meeting_state",
            "keyframes": keyframes,
        })
        assigned_ids.update(id(item) for item in keyframes)
    return sessions, [item for item in share_keyframes if id(item) not in assigned_ids]


def _intervals(observations, *, value_key: str) -> list[dict[str, Any]]:
    intervals = []
    current = None
    for item in observations:
        value = tuple(item.get(value_key) or [])
        timestamp = float(item.get("timestamp") or 0.0)
        if current and current["value"] == value:
            current["valid_to"] = timestamp
            current["independent_inferences"] += int(bool(item.get("independent_inference", True)))
            current["supporting_frames"] += 1
            current["confidence"] = max(current["confidence"], float(item.get("confidence") or 0.0))
            continue
        if current:
            intervals.append(_public_interval(current))
        current = {
            "value": value,
            "valid_from": timestamp,
            "valid_to": timestamp,
            "independent_inferences": int(bool(item.get("independent_inference", True))),
            "supporting_frames": 1,
            "confidence": float(item.get("confidence") or 0.0),
        }
    if current:
        intervals.append(_public_interval(current))
    return intervals


def _public_interval(interval):
    return {
        "active_speakers": list(interval["value"]),
        "valid_from": interval["valid_from"],
        "valid_to": interval["valid_to"],
        "independent_inferences": interval["independent_inferences"],
        "supporting_frames": interval["supporting_frames"],
        "confidence": round(interval["confidence"], 4),
    }


def _stable_meeting_states(observations, *, debounce_seconds: float):
    stable = []
    for item in observations:
        point = {
            "timestamp": float(item.get("timestamp") or 0.0),
            "observation_id": item.get("observation_id"),
            "state": _meeting_state(item),
        }
        if stable and stable[-1]["state"] == point["state"]:
            continue
        if (
            len(stable) >= 2
            and stable[-2]["state"] == point["state"]
            and point["timestamp"] - stable[-1]["timestamp"] <= debounce_seconds
        ):
            stable.pop()
            continue
        stable.append(point)
    return stable


def _meeting_state(item):
    share = item.get("screen_share") if isinstance(item.get("screen_share"), dict) else {}
    count = item.get("visible_participant_count")
    if isinstance(count, bool) or not isinstance(count, int) or count < 0:
        count = None
    return {
        "layout": str(item.get("layout") or "unknown"),
        "screen_share_active": bool(share.get("active")),
        "screen_share_presenter": share.get("presenter"),
        "visible_participant_count": count,
        "visible_activity": tuple(sorted(str(value) for value in (item.get("visible_activity") or []))),
    }


def _meeting_state_events(points):
    if not points:
        return []
    events = [{
        "timestamp": points[0]["timestamp"],
        "type": "meeting_state_initialized",
        **_public_meeting_state(points[0]["state"]),
        "observation_id": points[0]["observation_id"],
    }]
    previous = points[0]
    for current in points[1:]:
        before, after = previous["state"], current["state"]
        common = {
            "timestamp": current["timestamp"],
            **_public_meeting_state(after),
            "observation_id": current["observation_id"],
        }
        if before["layout"] != after["layout"]:
            events.append({
                **common, "type": "layout_changed",
                "previous_layout": before["layout"], "layout": after["layout"],
            })
        if before["screen_share_active"] != after["screen_share_active"]:
            events.append({
                **common,
                "type": "screen_share_started" if after["screen_share_active"] else "screen_share_stopped",
            })
        before_count = before["visible_participant_count"]
        after_count = after["visible_participant_count"]
        if before_count is not None and after_count is not None and before_count != after_count:
            events.append({
                **common,
                "type": "participant_joined" if after_count > before_count else "participant_left",
                "participant_delta": after_count - before_count,
                "previous_participant_count": before_count,
            })
        if before["visible_activity"] != after["visible_activity"]:
            events.append({**common, "type": "visible_activity_changed"})
        previous = current
    return events


def _public_meeting_state(state):
    return {
        "layout": state["layout"],
        "screen_share_active": state["screen_share_active"],
        "screen_share_presenter": state["screen_share_presenter"],
        "visible_participant_count": state["visible_participant_count"],
        "visible_activity": list(state["visible_activity"]),
    }
