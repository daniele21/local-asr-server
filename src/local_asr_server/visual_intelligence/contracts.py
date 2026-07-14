from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any

MAX_VISUAL_FRAME_BYTES = 5 * 1024 * 1024


@dataclass(frozen=True)
class VisualObservation:
    sequence: int
    timestamp: float
    platform: str
    layout: str
    participants: list[str]
    active_speakers: list[str]
    evidence: list[str]
    confidence: float
    model: str
    prompt_version: int

    def public(self) -> dict[str, Any]:
        return {"schema_version": 1, **asdict(self), "status": "valid"}
