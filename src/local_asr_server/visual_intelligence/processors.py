from __future__ import annotations

from local_asr_server.visual_intelligence.contracts import VisualObservation, VisualTask
from local_asr_server.visual_intelligence.inference import PROMPT_VERSION


class LegacyVisualProcessor:
    """Owns conversion of validated legacy responses into persisted observations."""

    @staticmethod
    def observation(frame, parsed, model: str, *, independent_inference: bool = True):
        return VisualObservation(
            sequence=int(frame["sequence"]), timestamp=float(frame["timestamp"]),
            platform=parsed["platform"], layout=parsed["layout"],
            participants=parsed["participants"], active_speakers=parsed["active_speakers"],
            evidence=parsed["evidence"], confidence=parsed["confidence"],
            model=model, prompt_version=1, independent_inference=independent_inference,
        ).public()


class TaskAwareVisualProcessor:
    """Owns conversion of typed task responses into canonical v2 observations."""

    @staticmethod
    def observation(candidate, parsed, model: str):
        result = {
            "schema_version": 2,
            "observation_id": f"visual-{candidate.sequence}-{candidate.task.value}",
            "sequence": candidate.sequence,
            "timestamp": candidate.timestamp,
            "task": candidate.task.value,
            "trigger": candidate.trigger.value,
            "independent_inference": True,
            "model": model,
            "prompt_version": PROMPT_VERSION,
            "confidence": parsed["confidence"],
            "status": "valid",
        }
        if candidate.task is VisualTask.MEETING_UI:
            result.update({key: parsed[key] for key in (
                "platform", "layout", "participants", "active_speakers", "evidence",
            )})
        elif candidate.task is VisualTask.MEETING_STATE:
            result.update({key: parsed[key] for key in (
                "platform", "layout", "screen_share", "visible_activity",
                "visible_participant_count",
            )})
        else:
            result.update({key: parsed[key] for key in (
                "content_type", "title", "visible_text", "key_information", "content_state",
            )})
            result.update({
                "roi": list(candidate.roi) if candidate.roi else None,
                "roi_source": candidate.roi_source,
                "roi_confidence": candidate.roi_confidence,
                "roi_fallback": candidate.roi_fallback,
            })
        return result
