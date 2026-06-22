from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from local_asr_server.audio_intelligence.audio_io import EnergyWindow


PADDING_SECONDS = 0.5
MERGE_GAP_SECONDS = 1.0
LONG_PAUSE_SECONDS = 2.5
MIN_OVERLAP_SECONDS = 0.3
MAX_SERIALIZED_EVENTS = 100


@dataclass
class TrackFeatures:
    track_id: str
    source: str
    label: str
    duration_seconds: float
    windows: list[EnergyWindow]
    speech_windows: list[dict[str, Any]]
    threshold: float
    error: str | None = None


def build_track_features(track: dict[str, Any], windows: list[EnergyWindow]) -> TrackFeatures:
    source = track.get("source") or track.get("id") or "audio"
    duration = windows[-1].end if windows else 0.0
    threshold = _speech_threshold(windows)
    speech_windows = _speech_windows(windows, threshold=threshold, channel=source)
    return TrackFeatures(
        track_id=track.get("id") or source,
        source=source,
        label=track.get("label") or source,
        duration_seconds=duration,
        windows=windows,
        speech_windows=speech_windows,
        threshold=threshold,
    )


def build_error_track_features(track: dict[str, Any], error: str) -> TrackFeatures:
    source = track.get("source") or track.get("id") or "audio"
    return TrackFeatures(
        track_id=track.get("id") or source,
        source=source,
        label=track.get("label") or source,
        duration_seconds=0.0,
        windows=[],
        speech_windows=[],
        threshold=0.0,
        error=error[:500],
    )


def summarize_conversation(tracks: list[TrackFeatures], segments: list[dict[str, Any]]) -> dict[str, Any]:
    speech_by_channel = {
        track.source: round(sum(window["end"] - window["start"] for window in track.speech_windows), 3)
        for track in tracks
    }
    total_speech = sum(speech_by_channel.values())
    duration = max((track.duration_seconds for track in tracks), default=0.0)
    speaking_pct = {
        channel: round((seconds / total_speech) * 100) if total_speech > 0 else 0
        for channel, seconds in speech_by_channel.items()
    }
    return {
        "duration_seconds": round(duration, 3),
        "speaking_time_seconds": speech_by_channel,
        "speaking_time_pct": speaking_pct,
        "speech_rate_wpm": _speech_rate_by_channel(segments),
        "long_pauses": _long_pauses(tracks),
        "overlaps": _overlaps(tracks),
        "high_energy_moments": _high_energy_moments(tracks),
    }


def enrich_segments(segments: list[dict[str, Any]], tracks: list[TrackFeatures]) -> list[dict[str, Any]]:
    track_by_id = {track.track_id: track for track in tracks}
    previous_end_by_channel: dict[str, float] = {}
    enriched = []
    for segment in sorted(segments, key=lambda item: (float(item.get("start") or 0.0), float(item.get("end") or 0.0))):
        item = dict(segment)
        track = track_by_id.get(str(item.get("track_id") or ""))
        channel = item.get("source") or (track.source if track else item.get("track_id") or "audio")
        start = float(item.get("start") or 0.0)
        end = float(item.get("end") or start)
        duration = max(0.001, end - start)
        previous_end = previous_end_by_channel.get(channel)
        item["channel"] = channel
        if previous_end is not None:
            item["pause_before"] = round(max(0.0, start - previous_end), 3)
        item["speech_rate_wpm"] = round((_word_count(item.get("text") or "") / duration) * 60)
        if track:
            item["energy"] = _energy_bucket(_segment_rms(track.windows, start=start, end=end), track.windows)
        previous_end_by_channel[channel] = max(previous_end_by_channel.get(channel, 0.0), end)
        enriched.append(item)
    _mark_segment_overlaps(enriched, tracks)
    return enriched


def build_mock_insights(metrics: dict[str, Any]) -> list[dict[str, Any]]:
    insights = []
    pauses = metrics.get("long_pauses") or []
    if pauses:
        first = pauses[0]
        insights.append({
            "type": "mock_long_pause",
            "title": "Pausa lunga rilevata",
            "start": first.get("start"),
            "confidence": "mock",
            "evidence": ["long_pause"],
            "mock": True,
        })
    overlaps = metrics.get("overlaps") or []
    if overlaps:
        first = overlaps[0]
        insights.append({
            "type": "mock_overlap",
            "title": "Sovrapposizione tra canali rilevata",
            "start": first.get("start"),
            "confidence": "mock",
            "evidence": ["channel_overlap"],
            "mock": True,
        })
    return insights[:10]


def _speech_threshold(windows: list[EnergyWindow]) -> float:
    values = sorted(window.rms for window in windows)
    if not values:
        return 1.0
    noise = values[max(0, int(len(values) * 0.2) - 1)]
    peak = values[-1]
    if peak <= 0:
        return 1.0
    return max(0.004, noise * 2.5, peak * 0.08)


def _speech_windows(windows: list[EnergyWindow], *, threshold: float, channel: str) -> list[dict[str, Any]]:
    raw = []
    current: dict[str, Any] | None = None
    for window in windows:
        if window.rms < threshold:
            if current is not None:
                raw.append(current)
                current = None
            continue
        if current is None:
            current = {"channel": channel, "source_start": window.start, "source_end": window.end, "peak_rms": window.rms}
        else:
            current["source_end"] = window.end
            current["peak_rms"] = max(current["peak_rms"], window.rms)
    if current is not None:
        raw.append(current)

    merged: list[dict[str, Any]] = []
    for item in raw:
        if merged and item["source_start"] - merged[-1]["source_end"] <= MERGE_GAP_SECONDS:
            merged[-1]["source_end"] = item["source_end"]
            merged[-1]["peak_rms"] = max(merged[-1]["peak_rms"], item["peak_rms"])
        else:
            merged.append(item)

    previous_end = None
    result = []
    for item in merged:
        start = max(0.0, item["source_start"] - PADDING_SECONDS)
        end = item["source_end"] + PADDING_SECONDS
        payload = {
            "channel": channel,
            "start": round(start, 3),
            "end": round(end, 3),
            "speech": True,
            "pause_before": round(item["source_start"] - previous_end, 3) if previous_end is not None else None,
            "source_start": round(item["source_start"], 3),
            "source_end": round(item["source_end"], 3),
            "peak_rms": round(item["peak_rms"], 6),
        }
        result.append(payload)
        previous_end = item["source_end"]
    return result


def _long_pauses(tracks: list[TrackFeatures]) -> list[dict[str, Any]]:
    windows = sorted(
        (window for track in tracks for window in track.speech_windows),
        key=lambda item: (item["source_start"], item["source_end"]),
    )
    pauses = []
    previous_end = None
    for window in windows:
        start = float(window["source_start"])
        if previous_end is not None and start - previous_end >= LONG_PAUSE_SECONDS:
            pauses.append({"start": round(previous_end, 3), "duration": round(start - previous_end, 3)})
        previous_end = max(previous_end or 0.0, float(window["source_end"]))
    return pauses[:MAX_SERIALIZED_EVENTS]


def _overlaps(tracks: list[TrackFeatures]) -> list[dict[str, Any]]:
    by_channel = {track.source: track.speech_windows for track in tracks}
    mic = by_channel.get("mic") or []
    system = by_channel.get("system") or []
    overlaps = []
    for left in mic:
        for right in system:
            start = max(float(left["source_start"]), float(right["source_start"]))
            end = min(float(left["source_end"]), float(right["source_end"]))
            if end - start >= MIN_OVERLAP_SECONDS:
                overlaps.append({
                    "start": round(start, 3),
                    "end": round(end, 3),
                    "duration": round(end - start, 3),
                    "channels": ["mic", "system"],
                })
                if len(overlaps) >= MAX_SERIALIZED_EVENTS:
                    return overlaps
    return overlaps


def _high_energy_moments(tracks: list[TrackFeatures]) -> list[dict[str, Any]]:
    moments = []
    for track in tracks:
        values = sorted(window.rms for window in track.windows)
        if not values:
            continue
        threshold = values[int(len(values) * 0.85)]
        for window in track.speech_windows:
            if float(window.get("peak_rms") or 0.0) >= threshold:
                moments.append({
                    "start": window["source_start"],
                    "end": window["source_end"],
                    "channels": [track.source],
                })
                if len(moments) >= MAX_SERIALIZED_EVENTS:
                    return moments
    return moments


def _speech_rate_by_channel(segments: list[dict[str, Any]]) -> dict[str, int]:
    totals: dict[str, dict[str, float]] = {}
    for segment in segments:
        channel = segment.get("source") or segment.get("track_id") or "audio"
        start = float(segment.get("start") or 0.0)
        end = float(segment.get("end") or start)
        bucket = totals.setdefault(channel, {"words": 0.0, "seconds": 0.0})
        bucket["words"] += _word_count(segment.get("text") or "")
        bucket["seconds"] += max(0.0, end - start)
    return {
        channel: round((data["words"] / data["seconds"]) * 60) if data["seconds"] > 0 else 0
        for channel, data in totals.items()
    }


def _word_count(text: str) -> int:
    return len([word for word in text.replace("\n", " ").split(" ") if word.strip()])


def _segment_rms(windows: list[EnergyWindow], *, start: float, end: float) -> float | None:
    values = [window.rms for window in windows if window.end > start and window.start < end]
    if not values:
        return None
    return sum(values) / len(values)


def _energy_bucket(value: float | None, windows: list[EnergyWindow]) -> str | None:
    if value is None:
        return None
    values = sorted(window.rms for window in windows)
    if not values:
        return None
    p40 = values[int(len(values) * 0.4)]
    p65 = values[int(len(values) * 0.65)]
    p85 = values[int(len(values) * 0.85)]
    if value < p40:
        return "low"
    if value < p65:
        return "medium_low"
    if value < p85:
        return "medium"
    return "high"


def _mark_segment_overlaps(segments: list[dict[str, Any]], tracks: list[TrackFeatures]) -> None:
    overlaps = _overlaps(tracks)
    for segment in segments:
        start = float(segment.get("start") or 0.0)
        end = float(segment.get("end") or start)
        segment["overlap"] = any(float(item["end"]) > start and float(item["start"]) < end for item in overlaps)
