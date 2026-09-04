from __future__ import annotations

from dataclasses import dataclass
from typing import Callable


class ResourcePolicyBlocked(RuntimeError):
    """Raised when current product resource policy forbids heavy work."""

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


@dataclass(frozen=True, slots=True)
class ResourcePolicySnapshot:
    profile: str
    capture_active: bool

    def public(self) -> dict[str, object]:
        return {
            "profile": self.profile,
            "capture_active": self.capture_active,
        }


class ResourcePolicy:
    """Outcome-level admission policy layered above the heavy-work scheduler.

    This class does not own queues, workers, recording state, model residency or
    cancellation. ``RecordingStore`` remains the canonical capture-state owner,
    ``HeavyWorkloadArbiter`` remains the sole ClosedRoom heavy-work scheduler,
    and runtime/service owners remain responsible for model lifecycle. The
    policy only answers whether starting a heavy phase is currently allowed.
    """

    DEFAULT_PROFILE = "balanced"
    VALID_PROFILES = {"efficient", "balanced", "maximum"}

    def __init__(
        self,
        *,
        capture_active: Callable[[], bool],
        profile: str = DEFAULT_PROFILE,
    ) -> None:
        if profile not in self.VALID_PROFILES:
            raise ValueError(f"unsupported resource profile: {profile}")
        self._capture_active = capture_active
        self.profile = profile

    def assert_heavy_work_admissible(self, workload_type: str) -> None:
        if not workload_type.strip():
            raise ValueError("workload_type must be non-empty")
        if self._capture_active():
            raise ResourcePolicyBlocked("capture_active")

    def snapshot(self) -> dict[str, object]:
        return ResourcePolicySnapshot(
            profile=self.profile,
            capture_active=self._capture_active(),
        ).public()
