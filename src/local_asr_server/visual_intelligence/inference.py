from __future__ import annotations

from pathlib import Path
import ast
import json
from tempfile import NamedTemporaryFile
from typing import Any

from local_asr_server.visual_intelligence.contracts import FrameCandidate, VisualTask
from local_asr_server.visual_intelligence.shared_content import normalize_content_type


PROMPT_VERSION = 3

PROMPTS = {
    VisualTask.MEETING_UI: """Osserva la UI di questa videoconferenza. Usa solo nomi, label e indicatori visibili; non dedurre identita dai volti. Restituisci solo JSON valido con: platform, layout, participants (array), active_speakers (array), evidence (array), confidence (0..1). Se non leggibile usa unknown o array vuoto.""",
    VisualTask.MEETING_STATE: """Descrivi solo lo stato osservabile della videoconferenza, senza inferire emozioni, consenso o intenzioni. Restituisci solo JSON valido con: platform, layout, visible_participant_count (intero non negativo o null), screen_share {active, presenter}, visible_activity (array), confidence (0..1).""",
    VisualTask.SHARED_CONTENT: """Analizza esclusivamente il contenuto condiviso visibile. Restituisci solo JSON valido con: content_type, title, visible_text (array), key_information (array), content_state (stable|transitional|unknown), confidence (0..1). Non inventare testo non leggibile.""",
}

CONTENT_STATES = frozenset({"stable", "transitional", "unknown"})


class VisualResponseValidationError(ValueError):
    pass


def parse_visual_response(raw: str) -> dict[str, Any]:
    candidate = raw.strip()
    if candidate.startswith("```"):
        lines = candidate.splitlines()
        candidate = "\n".join(lines[1:-1]).strip() if len(lines) >= 3 else candidate
    start, end = candidate.find("{"), candidate.rfind("}")
    if start >= 0 and end >= start:
        candidate = candidate[start:end + 1]
    candidates = [candidate]
    without_outer_open = candidate[1:].lstrip() if candidate.startswith("{") else candidate
    if without_outer_open.startswith("{"):
        candidates.append(without_outer_open)
    parsed = None
    last_error: Exception | None = None
    for structured in candidates:
        for parser in (json.loads, ast.literal_eval):
            try:
                parsed = parser(structured)
                break
            except (json.JSONDecodeError, SyntaxError, ValueError) as exc:
                last_error = exc
        if parsed is not None:
            break
    if parsed is None and last_error is not None:
        raise last_error
    if not isinstance(parsed, dict):
        raise ValueError("Visual response must be a JSON object")
    return parsed


def normalize_task_response(task: VisualTask, payload: dict[str, Any]) -> dict[str, Any]:
    if task is VisualTask.MEETING_UI:
        return {
            "platform": _string(payload, "platform", default="unknown"),
            "layout": _string(payload, "layout", default="unknown"),
            "participants": _string_list(payload, "participants"),
            "active_speakers": _string_list(payload, "active_speakers"),
            "evidence": _string_list(payload, "evidence"),
            "confidence": _confidence(payload),
        }
    if task is VisualTask.MEETING_STATE:
        share = _required_mapping(payload, "screen_share")
        active = share.get("active")
        if not isinstance(active, bool):
            raise VisualResponseValidationError("screen_share.active must be a boolean")
        presenter = share.get("presenter")
        if presenter is not None and not isinstance(presenter, str):
            raise VisualResponseValidationError("screen_share.presenter must be a string or null")
        return {
            "platform": _string(payload, "platform", default="unknown"),
            "layout": _string(payload, "layout", default="unknown"),
            "screen_share": {
                "active": active,
                "presenter": presenter.strip() if isinstance(presenter, str) and presenter.strip() else None,
            },
            "visible_activity": _string_list(payload, "visible_activity"),
            "visible_participant_count": _nonnegative_int(payload.get("visible_participant_count")),
            "confidence": _confidence(payload),
        }
    content_state = _string(payload, "content_state", default="unknown").lower()
    if content_state not in CONTENT_STATES:
        raise VisualResponseValidationError(
            f"content_state must be one of {sorted(CONTENT_STATES)}"
        )
    title = payload.get("title")
    if title is not None and not isinstance(title, str):
        raise VisualResponseValidationError("title must be a string or null")
    key_information = payload.get("key_information")
    if not isinstance(key_information, list):
        raise VisualResponseValidationError("key_information must be an array")
    return {
        "content_type": normalize_content_type(payload.get("content_type")),
        "title": title.strip() if isinstance(title, str) and title.strip() else None,
        "visible_text": _string_list(payload, "visible_text"),
        "key_information": [item for item in key_information if item is not None],
        "content_state": content_state,
        "confidence": _confidence(payload),
    }


def _required_mapping(payload: dict[str, Any], key: str) -> dict[str, Any]:
    value = payload.get(key)
    if not isinstance(value, dict):
        raise VisualResponseValidationError(f"{key} must be an object")
    return value


def _string(payload: dict[str, Any], key: str, *, default: str) -> str:
    value = payload.get(key, default)
    if not isinstance(value, str):
        raise VisualResponseValidationError(f"{key} must be a string")
    return value.strip() or default


def _string_list(payload: dict[str, Any], key: str) -> list[str]:
    value = payload.get(key)
    if not isinstance(value, list):
        raise VisualResponseValidationError(f"{key} must be an array")
    if any(not isinstance(item, str) for item in value):
        raise VisualResponseValidationError(f"{key} must contain only strings")
    return [item.strip() for item in value if item.strip()]


def _confidence(payload: dict[str, Any]) -> float:
    value = payload.get("confidence")
    if isinstance(value, bool):
        raise VisualResponseValidationError("confidence must be numeric")
    try:
        parsed = float(value)
    except (TypeError, ValueError) as exc:
        raise VisualResponseValidationError("confidence must be numeric") from exc
    if not 0.0 <= parsed <= 1.0:
        raise VisualResponseValidationError("confidence must be between 0 and 1")
    return parsed


def _nonnegative_int(value: Any) -> int | None:
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise VisualResponseValidationError(
            "visible_participant_count must be a non-negative integer or null"
        )
    return value


def prepare_candidate_message(candidate: FrameCandidate, image_path: Path) -> list[dict[str, Any]]:
    from local_llm_server.vision import prepare_image_message

    if not candidate.roi:
        return prepare_image_message(image_path, PROMPTS[candidate.task])
    from PIL import Image

    with Image.open(image_path) as source:
        width, height = source.size
        left, top, right, bottom = candidate.roi
        crop = source.crop((int(left * width), int(top * height), int(right * width), int(bottom * height)))
        with NamedTemporaryFile(suffix=".jpg") as temporary:
            crop.convert("RGB").save(temporary.name, format="JPEG", quality=90)
            return prepare_image_message(Path(temporary.name), PROMPTS[candidate.task])
