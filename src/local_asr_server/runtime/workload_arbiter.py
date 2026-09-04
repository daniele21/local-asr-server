from __future__ import annotations

import os
import queue
import threading
import time
from dataclasses import dataclass
from typing import Callable


class WorkloadQueueFull(RuntimeError):
    """Raised when the bounded heavy-workload queue cannot admit more work."""


class WorkloadArbiterClosed(RuntimeError):
    """Raised when work is submitted after shutdown has started."""


class WorkloadAdmissionRejected(RuntimeError):
    """Raised when resource policy forbids a heavy workload from starting."""


@dataclass(frozen=True, slots=True)
class _WorkItem:
    task_id: str
    workload_type: str
    run: Callable[[], None]
    on_cancel: Callable[[str], None] | None = None
    on_reject: Callable[[str], None] | None = None


class HeavyWorkloadArbiter:
    """Bounded process-wide scheduler for memory-heavy ClosedRoom jobs.

    ClosedRoom owns cross-workload scheduling here. Model-level request admission,
    residency and eviction remain owned by local-llm-server. The default of one
    active heavy workload protects Apple unified memory until representative
    hardware evidence justifies a higher profile.

    An optional admission guard may reject a workload based on current product
    resource policy. The guard is checked both before queue admission and again
    immediately before execution so capture that begins while work is queued
    still has priority. The guard does not own scheduling or waiting semantics.
    """

    DEFAULT_MAX_CONCURRENT = 1
    DEFAULT_QUEUE_CAPACITY = 8

    def __init__(
        self,
        *,
        max_concurrent: int = DEFAULT_MAX_CONCURRENT,
        queue_capacity: int = DEFAULT_QUEUE_CAPACITY,
        admission_guard: Callable[[str], None] | None = None,
    ) -> None:
        if max_concurrent < 1:
            raise ValueError("max_concurrent must be >= 1")
        if queue_capacity < 1:
            raise ValueError("queue_capacity must be >= 1")
        self.max_concurrent = max_concurrent
        self.queue_capacity = queue_capacity
        self._admission_guard = admission_guard
        self._queue: queue.Queue[_WorkItem] = queue.Queue(maxsize=queue_capacity)
        self._lock = threading.RLock()
        self._pending: dict[str, str] = {}
        self._active: dict[str, str] = {}
        self._cancelled: set[str] = set()
        self._closed = False
        self._submitted = 0
        self._completed = 0
        self._failed = 0
        self._rejected = 0
        self._cancelled_pending = 0
        self._workers = [
            threading.Thread(
                target=self._worker,
                name=f"closedroom-heavy-{index + 1}",
                daemon=True,
            )
            for index in range(max_concurrent)
        ]
        for worker in self._workers:
            worker.start()

    @classmethod
    def from_env(
        cls,
        *,
        admission_guard: Callable[[str], None] | None = None,
    ) -> "HeavyWorkloadArbiter":
        return cls(
            max_concurrent=_positive_env_int(
                "CLOSEDROOM_HEAVY_WORKLOAD_CONCURRENCY",
                cls.DEFAULT_MAX_CONCURRENT,
            ),
            queue_capacity=_positive_env_int(
                "CLOSEDROOM_HEAVY_WORKLOAD_QUEUE_CAPACITY",
                cls.DEFAULT_QUEUE_CAPACITY,
            ),
            admission_guard=admission_guard,
        )

    def submit(
        self,
        *,
        task_id: str,
        workload_type: str,
        run: Callable[[], None],
        on_cancel: Callable[[str], None] | None = None,
        on_reject: Callable[[str], None] | None = None,
    ) -> None:
        if not task_id.strip():
            raise ValueError("task_id must be non-empty")
        if not workload_type.strip():
            raise ValueError("workload_type must be non-empty")
        self._assert_admitted(workload_type)
        item = _WorkItem(
            task_id=task_id,
            workload_type=workload_type,
            run=run,
            on_cancel=on_cancel,
            on_reject=on_reject,
        )
        with self._lock:
            if self._closed:
                raise WorkloadArbiterClosed("heavy-workload arbiter is shutting down")
            if task_id in self._pending or task_id in self._active:
                raise ValueError(f"task is already scheduled: {task_id}")
            try:
                self._queue.put_nowait(item)
            except queue.Full as exc:
                self._rejected += 1
                raise WorkloadQueueFull(
                    f"heavy-workload queue is full ({self.queue_capacity} pending); retry later"
                ) from exc
            self._pending[task_id] = workload_type
            self._submitted += 1

    def cancel_pending(self, task_id: str) -> bool:
        """Mark queued work for cancellation without interrupting active execution."""
        with self._lock:
            if task_id not in self._pending:
                return False
            self._cancelled.add(task_id)
            return True

    def snapshot(self) -> dict[str, object]:
        with self._lock:
            return {
                "max_concurrent": self.max_concurrent,
                "queue_capacity": self.queue_capacity,
                "queue_depth": len(self._pending),
                "active_count": len(self._active),
                "pending": dict(self._pending),
                "active": dict(self._active),
                "submitted": self._submitted,
                "completed": self._completed,
                "failed": self._failed,
                "rejected": self._rejected,
                "cancelled_pending": self._cancelled_pending,
                "closed": self._closed,
            }

    def shutdown(self, *, cancel_pending: bool = True, wait_timeout: float = 2.0) -> None:
        """Stop admission, optionally cancel queued work and wait boundedly for workers.

        Running work is not force-killed here because the owning runtime/process
        boundary is responsible for safe cancellation. Worker threads are daemon
        threads so process shutdown cannot be held indefinitely by a model job.
        """
        with self._lock:
            self._closed = True
            if cancel_pending:
                self._cancelled.update(self._pending)
        deadline = time.monotonic() + max(0.0, wait_timeout)
        for worker in self._workers:
            remaining = max(0.0, deadline - time.monotonic())
            worker.join(timeout=remaining)

    def _assert_admitted(self, workload_type: str) -> None:
        if self._admission_guard is None:
            return
        try:
            self._admission_guard(workload_type)
        except Exception as exc:
            with self._lock:
                self._rejected += 1
            reason = str(exc) or exc.__class__.__name__
            raise WorkloadAdmissionRejected(reason) from exc

    def _worker(self) -> None:
        while True:
            try:
                item = self._queue.get(timeout=0.1)
            except queue.Empty:
                with self._lock:
                    if self._closed and not self._pending:
                        return
                continue

            cancelled = False
            rejection_reason: str | None = None
            with self._lock:
                cancelled = item.task_id in self._cancelled

            if not cancelled and self._admission_guard is not None:
                try:
                    self._admission_guard(item.workload_type)
                except Exception as exc:
                    rejection_reason = str(exc) or exc.__class__.__name__

            with self._lock:
                self._pending.pop(item.task_id, None)
                if item.task_id in self._cancelled:
                    self._cancelled.discard(item.task_id)
                    self._cancelled_pending += 1
                    cancelled = True
                    rejection_reason = None
                elif rejection_reason is not None:
                    self._rejected += 1
                else:
                    self._active[item.task_id] = item.workload_type

            try:
                if cancelled:
                    if item.on_cancel is not None:
                        item.on_cancel("cancelled_before_start")
                    continue
                if rejection_reason is not None:
                    if item.on_reject is not None:
                        item.on_reject(rejection_reason)
                    continue
                item.run()
            except Exception:
                with self._lock:
                    self._failed += 1
                # The job owner records user-visible failure. Do not kill the
                # scheduler worker because one workload failed.
            else:
                if not cancelled and rejection_reason is None:
                    with self._lock:
                        self._completed += 1
            finally:
                with self._lock:
                    self._active.pop(item.task_id, None)
                self._queue.task_done()


def _positive_env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None or not raw.strip():
        return default
    try:
        value = int(raw)
    except ValueError as exc:
        raise ValueError(f"{name} must be an integer") from exc
    if value < 1:
        raise ValueError(f"{name} must be >= 1")
    return value
