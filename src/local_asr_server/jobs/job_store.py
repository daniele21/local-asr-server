from __future__ import annotations

import contextlib
import json
import sqlite3
import time
from pathlib import Path
from typing import Any

from local_asr_server.catalog import CatalogStore


def _json_dump(value: Any) -> str | None:
    if value is None:
        return None
    return json.dumps(value, ensure_ascii=False)


def _json_load(value: str | None, default: Any) -> Any:
    if not value:
        return default
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return default


class JobStore:
    """SQLite-backed store for long-running ClosedRoom jobs and events."""

    def __init__(self, db_path: Path | None = None) -> None:
        self.db_path = db_path or CatalogStore.default_db_path()
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        with self.connection() as conn:
            self._init_db(conn)

    @contextlib.contextmanager
    def connection(self):
        conn = sqlite3.connect(self.db_path, timeout=10.0)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def _init_db(self, conn: sqlite3.Connection) -> None:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS jobs (
                id TEXT PRIMARY KEY,
                type TEXT NOT NULL,
                scope_type TEXT,
                scope_id TEXT,
                status TEXT NOT NULL,
                current_step TEXT,
                progress INTEGER NOT NULL DEFAULT 0,
                payload_json TEXT,
                result_json TEXT,
                error TEXT,
                created_at REAL NOT NULL,
                updated_at REAL NOT NULL,
                started_at REAL,
                completed_at REAL,
                cancel_requested INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS job_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                job_id TEXT NOT NULL,
                sequence INTEGER NOT NULL,
                status TEXT NOT NULL,
                current_step TEXT,
                progress INTEGER NOT NULL,
                message TEXT,
                payload_json TEXT,
                created_at REAL NOT NULL,
                FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
            CREATE INDEX IF NOT EXISTS idx_jobs_scope ON jobs(scope_type, scope_id);
            CREATE INDEX IF NOT EXISTS idx_jobs_type_created ON jobs(type, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_job_events_job_sequence ON job_events(job_id, sequence);
            """
        )

    def create(
        self,
        *,
        job_id: str,
        job_type: str,
        scope_type: str | None = None,
        scope_id: str | None = None,
        payload: dict[str, Any] | None = None,
        status: str = "queued",
        current_step: str = "queued",
        progress: int = 0,
    ) -> dict[str, Any]:
        now = time.time()
        with self.connection() as conn:
            conn.execute(
                """
                INSERT INTO jobs (
                    id, type, scope_type, scope_id, status, current_step, progress,
                    payload_json, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    job_id,
                    job_type,
                    scope_type,
                    scope_id,
                    status,
                    current_step,
                    progress,
                    _json_dump(payload),
                    now,
                    now,
                ),
            )
            self._insert_event(
                conn,
                job_id=job_id,
                status=status,
                current_step=current_step,
                progress=progress,
            )
        return self.get(job_id) or {}

    def update(
        self,
        job_id: str,
        *,
        status: str,
        current_step: str | None = None,
        progress: int | None = None,
        result: dict[str, Any] | None = None,
        error: str | None = None,
        cancel_requested: bool | None = None,
        message: str | None = None,
        event_payload: dict[str, Any] | None = None,
    ) -> dict[str, Any] | None:
        existing = self.get(job_id)
        if existing is None:
            return None
        now = time.time()
        next_step = current_step or status
        next_progress = existing["progress"] if progress is None else progress
        completed_at = now if status in {"completed", "failed", "cancelled"} else existing.get("completed_at")
        started_at = existing.get("started_at")
        if status in {"running", "waiting_for_service", "retrying"} and started_at is None:
            started_at = now
        if cancel_requested is None:
            cancel_requested = bool(existing.get("cancel_requested"))
        with self.connection() as conn:
            conn.execute(
                """
                UPDATE jobs
                SET status = ?,
                    current_step = ?,
                    progress = ?,
                    result_json = ?,
                    error = ?,
                    updated_at = ?,
                    started_at = ?,
                    completed_at = ?,
                    cancel_requested = ?
                WHERE id = ?
                """,
                (
                    status,
                    next_step,
                    next_progress,
                    _json_dump(result) if result is not None else _json_dump(existing.get("result")),
                    error if error is not None else existing.get("error"),
                    now,
                    started_at,
                    completed_at,
                    1 if cancel_requested else 0,
                    job_id,
                ),
            )
            self._insert_event(
                conn,
                job_id=job_id,
                status=status,
                current_step=next_step,
                progress=next_progress,
                message=message,
                payload=event_payload,
            )
        return self.get(job_id)

    def request_cancel(self, job_id: str) -> dict[str, Any] | None:
        return self.update(job_id, status="cancel_requested", cancel_requested=True)

    def get(self, job_id: str) -> dict[str, Any] | None:
        with self.connection() as conn:
            row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
        return self._row_to_job(row) if row else None

    def list_jobs(
        self,
        *,
        job_type: str | None = None,
        scope_type: str | None = None,
        scope_id: str | None = None,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        clauses: list[str] = []
        params: list[Any] = []
        if job_type:
            clauses.append("type = ?")
            params.append(job_type)
        if scope_type:
            clauses.append("scope_type = ?")
            params.append(scope_type)
        if scope_id:
            clauses.append("scope_id = ?")
            params.append(scope_id)
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        params.append(max(1, min(limit, 500)))
        with self.connection() as conn:
            rows = conn.execute(
                f"SELECT * FROM jobs {where} ORDER BY created_at DESC LIMIT ?",
                params,
            ).fetchall()
        return [self._row_to_job(row) for row in rows]

    def events_after(self, job_id: str, sequence: int = 0) -> list[dict[str, Any]] | None:
        if self.get(job_id) is None:
            return None
        with self.connection() as conn:
            rows = conn.execute(
                """
                SELECT * FROM job_events
                WHERE job_id = ? AND sequence > ?
                ORDER BY sequence ASC
                """,
                (job_id, sequence),
            ).fetchall()
        return [self._row_to_event(row) for row in rows]

    def _insert_event(
        self,
        conn: sqlite3.Connection,
        *,
        job_id: str,
        status: str,
        current_step: str | None,
        progress: int,
        message: str | None = None,
        payload: dict[str, Any] | None = None,
    ) -> None:
        row = conn.execute(
            "SELECT COALESCE(MAX(sequence), 0) + 1 AS next_sequence FROM job_events WHERE job_id = ?",
            (job_id,),
        ).fetchone()
        conn.execute(
            """
            INSERT INTO job_events (
                job_id, sequence, status, current_step, progress, message, payload_json, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                job_id,
                int(row["next_sequence"]),
                status,
                current_step,
                progress,
                message,
                _json_dump(payload),
                time.time(),
            ),
        )

    def _row_to_job(self, row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": row["id"],
            "type": row["type"],
            "scope_type": row["scope_type"],
            "scope_id": row["scope_id"],
            "status": row["status"],
            "current_step": row["current_step"],
            "progress": row["progress"],
            "payload": _json_load(row["payload_json"], None),
            "result": _json_load(row["result_json"], None),
            "error": row["error"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
            "started_at": row["started_at"],
            "completed_at": row["completed_at"],
            "cancel_requested": bool(row["cancel_requested"]),
        }

    def _row_to_event(self, row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": row["id"],
            "job_id": row["job_id"],
            "sequence": row["sequence"],
            "status": row["status"],
            "current_step": row["current_step"],
            "progress": row["progress"],
            "message": row["message"],
            "payload": _json_load(row["payload_json"], None),
            "created_at": row["created_at"],
        }

