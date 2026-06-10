from __future__ import annotations

import json
import os
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


VALID_STATUSES = {
    "recording",
    "finalizing",
    "recorded",
    "transcribing",
    "completed",
    "failed",
}


class RecordingError(Exception):
    pass


class RecordingNotFound(RecordingError):
    pass


class RecordingConflict(RecordingError):
    pass


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _extension_for_mime(mime_type: str) -> str:
    normalized = mime_type.lower()
    if "ogg" in normalized:
        return ".ogg"
    if "mp4" in normalized or "m4a" in normalized:
        return ".m4a"
    if "wav" in normalized:
        return ".wav"
    return ".webm"


class RecordingStore:
    def __init__(self, root: Path):
        self.root = root.expanduser().resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        if not os.access(self.root, os.W_OK):
            raise PermissionError(f"Recording directory is not writable: {self.root}")
        self._locks_guard = threading.Lock()
        self._locks: dict[str, threading.Lock] = {}
        self._mark_interrupted_jobs()

    def create(
        self,
        *,
        title: str,
        mime_type: str,
        model: str,
        language: str | None,
    ) -> dict[str, Any]:
        recording_id = str(uuid.uuid4())
        date_dir = datetime.now(timezone.utc).date().isoformat()
        session_dir = self.root / date_dir / recording_id
        session_dir.mkdir(parents=True)
        extension = _extension_for_mime(mime_type)
        metadata = {
            "id": recording_id,
            "title": title.strip()[:200] or "Registrazione senza titolo",
            "status": "recording",
            "created_at": _utc_now(),
            "stopped_at": None,
            "completed_at": None,
            "mime_type": mime_type,
            "extension": extension,
            "chunk_count": 0,
            "bytes_written": 0,
            "model": model,
            "language": language,
            "error": None,
            "relative_dir": str(session_dir.relative_to(self.root)),
        }
        (session_dir / f"recording{extension}.part").touch()
        self._write_metadata(session_dir, metadata)
        return self.public_metadata(metadata)

    def append_chunk(self, recording_id: str, sequence: int, content: bytes) -> dict[str, Any]:
        if sequence < 0:
            raise RecordingConflict("Chunk sequence must be non-negative")
        if not content:
            raise RecordingConflict("Chunk is empty")

        with self._lock_for(recording_id):
            session_dir, metadata = self._load(recording_id)
            if metadata["status"] != "recording":
                raise RecordingConflict("Recording is no longer accepting chunks")
            expected = metadata["chunk_count"]
            if sequence != expected:
                raise RecordingConflict(
                    f"Expected chunk sequence {expected}, received {sequence}"
                )

            part_path = self._part_path(session_dir, metadata)
            with part_path.open("ab") as output:
                output.write(content)
                output.flush()
                os.fsync(output.fileno())

            metadata["chunk_count"] += 1
            metadata["bytes_written"] += len(content)
            self._write_metadata(session_dir, metadata)
            return self.public_metadata(metadata)

    def finalize(self, recording_id: str) -> tuple[dict[str, Any], bool]:
        with self._lock_for(recording_id):
            session_dir, metadata = self._load(recording_id)
            if metadata["status"] in {"recorded", "transcribing", "completed", "failed"}:
                return self.public_metadata(metadata), False
            if metadata["status"] != "recording":
                raise RecordingConflict(
                    f"Cannot stop recording in status {metadata['status']}"
                )
            if metadata["chunk_count"] == 0:
                raise RecordingConflict("Cannot stop an empty recording")

            metadata["status"] = "finalizing"
            metadata["stopped_at"] = _utc_now()
            self._write_metadata(session_dir, metadata)

            part_path = self._part_path(session_dir, metadata)
            audio_path = self._audio_path(session_dir, metadata)
            part_path.replace(audio_path)

            metadata["status"] = "recorded"
            self._write_metadata(session_dir, metadata)
            return self.public_metadata(metadata), False

    def get(self, recording_id: str, include_result: bool = True) -> dict[str, Any]:
        _, metadata = self._load(recording_id)
        response = self.public_metadata(metadata)
        if include_result:
            result_path = self._session_dir(metadata) / "transcript.json"
            if result_path.exists():
                with result_path.open("r", encoding="utf-8") as result_file:
                    response["result"] = json.load(result_file)
        return response

    def list(self, limit: int = 20) -> list[dict[str, Any]]:
        items = []
        for metadata_path in self.root.glob("*/*/metadata.json"):
            try:
                with metadata_path.open("r", encoding="utf-8") as metadata_file:
                    items.append(self.public_metadata(json.load(metadata_file)))
            except (OSError, json.JSONDecodeError, KeyError):
                continue
        items.sort(key=lambda item: item["created_at"], reverse=True)
        return items[: max(1, min(limit, 100))]

    def audio_path(self, recording_id: str) -> Path:
        session_dir, metadata = self._load(recording_id)
        audio_path = self._audio_path(session_dir, metadata)
        if not audio_path.exists():
            raise RecordingConflict("Finalized recording file does not exist")
        return audio_path

    def complete(self, recording_id: str, result: dict[str, Any]) -> None:
        with self._lock_for(recording_id):
            session_dir, metadata = self._load(recording_id)
            if metadata["status"] != "transcribing":
                raise RecordingConflict(
                    f"Cannot complete recording in status {metadata['status']}"
                )
            self._write_json_atomic(session_dir / "transcript.json", result)
            self._write_text_atomic(session_dir / "transcript.txt", result.get("text", ""))
            metadata["status"] = "completed"
            metadata["completed_at"] = _utc_now()
            metadata["error"] = None
            self._write_metadata(session_dir, metadata)

    def fail(self, recording_id: str, error: str) -> None:
        with self._lock_for(recording_id):
            session_dir, metadata = self._load(recording_id)
            metadata["status"] = "failed"
            metadata["completed_at"] = _utc_now()
            metadata["error"] = error[:2000]
            self._write_metadata(session_dir, metadata)

    def public_metadata(self, metadata: dict[str, Any]) -> dict[str, Any]:
        audio_path = self._audio_path(self._session_dir(metadata), metadata)
        return {
            key: value
            for key, value in metadata.items()
            if key not in {"extension", "relative_dir"}
        } | {
            "audio_file": (
                f"{metadata['relative_dir']}/recording{metadata['extension']}"
                if audio_path.exists()
                else None
            )
        }

    def _load(self, recording_id: str) -> tuple[Path, dict[str, Any]]:
        try:
            normalized_id = str(uuid.UUID(recording_id))
        except ValueError as exc:
            raise RecordingNotFound(recording_id) from exc

        matches = list(self.root.glob(f"*/{normalized_id}/metadata.json"))
        if len(matches) != 1:
            raise RecordingNotFound(recording_id)
        metadata_path = matches[0]
        with metadata_path.open("r", encoding="utf-8") as metadata_file:
            metadata = json.load(metadata_file)
        return metadata_path.parent, metadata

    def _session_dir(self, metadata: dict[str, Any]) -> Path:
        path = (self.root / metadata["relative_dir"]).resolve()
        if self.root not in path.parents:
            raise RecordingConflict("Invalid recording path")
        return path

    def _part_path(self, session_dir: Path, metadata: dict[str, Any]) -> Path:
        return session_dir / f"recording{metadata['extension']}.part"

    def _audio_path(self, session_dir: Path, metadata: dict[str, Any]) -> Path:
        return session_dir / f"recording{metadata['extension']}"

    def _lock_for(self, recording_id: str) -> threading.Lock:
        with self._locks_guard:
            return self._locks.setdefault(recording_id, threading.Lock())

    def _write_metadata(self, session_dir: Path, metadata: dict[str, Any]) -> None:
        if metadata["status"] not in VALID_STATUSES:
            raise RecordingConflict(f"Invalid status: {metadata['status']}")
        self._write_json_atomic(session_dir / "metadata.json", metadata)

    def _write_json_atomic(self, path: Path, data: dict[str, Any]) -> None:
        temp_path = path.with_suffix(path.suffix + ".tmp")
        with temp_path.open("w", encoding="utf-8") as output:
            json.dump(data, output, ensure_ascii=False, indent=2)
            output.flush()
            os.fsync(output.fileno())
        temp_path.replace(path)

    def _write_text_atomic(self, path: Path, text: str) -> None:
        temp_path = path.with_suffix(path.suffix + ".tmp")
        with temp_path.open("w", encoding="utf-8") as output:
            output.write(text)
            output.flush()
            os.fsync(output.fileno())
        temp_path.replace(path)

    def _mark_interrupted_jobs(self) -> None:
        for metadata_path in self.root.glob("*/*/metadata.json"):
            try:
                with metadata_path.open("r", encoding="utf-8") as metadata_file:
                    metadata = json.load(metadata_file)
                if metadata.get("status") == "finalizing":
                    metadata["status"] = "failed"
                    metadata["completed_at"] = _utc_now()
                    metadata["error"] = "Server restarted before processing completed"
                    self._write_metadata(metadata_path.parent, metadata)
            except (OSError, json.JSONDecodeError, KeyError):
                continue
