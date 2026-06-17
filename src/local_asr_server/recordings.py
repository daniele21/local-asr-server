from __future__ import annotations

import json
import os
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from local_asr_server.catalog import CatalogStore


VALID_STATUSES = {
    "recording",
    "finalizing",
    "recorded",
    "transcribing",
    "completed",
    "failed",
}

VALID_CAPTURE_MODES = {"both", "mic_only", "pc_only", "legacy_mixed"}
VALID_TRACK_IDS = {"mixed", "mic", "system"}

TRACK_LABELS = {
    "mixed": "Conversazione",
    "mic": "Tu",
    "system": "Computer",
}

TRACK_SOURCES = {
    "mixed": "mixed",
    "mic": "mic",
    "system": "system",
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
    def __init__(
        self,
        default_root: Path,
        use_settings_dir: bool = True,
        catalog: CatalogStore | None = None,
    ):
        self._default_root = default_root.expanduser().resolve()
        self._use_settings_dir = use_settings_dir
        self.catalog = catalog
        # Verify write permission on current root
        curr_root = self.root
        curr_root.mkdir(parents=True, exist_ok=True)
        if not os.access(curr_root, os.W_OK):
            raise PermissionError(f"Recording directory is not writable: {curr_root}")
        self._locks_guard = threading.Lock()
        self._locks: dict[str, threading.Lock] = {}
        self._mark_interrupted_jobs()
        self.sync_catalog()

    @property
    def root(self) -> Path:
        if self._use_settings_dir:
            from local_asr_server.settings import load_settings
            settings = load_settings()
            path_str = settings.get("recordings_dir")
            if path_str:
                path = Path(path_str).expanduser().resolve()
                path.mkdir(parents=True, exist_ok=True)
                return path
        path = self._default_root
        path.mkdir(parents=True, exist_ok=True)
        return path

    def create(
        self,
        *,
        title: str,
        project_name: str | None = None,
        mime_type: str,
        model: str,
        language: str | None,
        capture_mode: str = "legacy_mixed",
    ) -> dict[str, Any]:
        recording_id = str(uuid.uuid4())
        date_dir = datetime.now(timezone.utc).date().isoformat()
        session_dir = self.root / date_dir / recording_id
        session_dir.mkdir(parents=True)
        extension = _extension_for_mime(mime_type)
        if capture_mode not in VALID_CAPTURE_MODES:
            raise RecordingConflict(f"Invalid capture mode: {capture_mode}")
        track_ids = self._track_ids_for_mode(capture_mode)
        primary_track_id = self._primary_track_id_for_mode(capture_mode)
        audio_tracks = [
            {
                "id": track_id,
                "source": TRACK_SOURCES[track_id],
                "label": TRACK_LABELS[track_id],
                "mime_type": mime_type,
                "extension": extension,
                "chunk_count": 0,
                "bytes_written": 0,
                "primary": track_id == primary_track_id,
                "audio_file": None,
            }
            for track_id in track_ids
        ]
        default_title = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        metadata = {
            "id": recording_id,
            "title": title.strip()[:200] if title.strip() else default_title,
            "project_name": (project_name or "").strip()[:200],
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
            "capture_mode": capture_mode,
            "primary_track_id": primary_track_id,
            "audio_tracks": audio_tracks,
        }
        for track in audio_tracks:
            self._track_part_path(session_dir, track).touch()
        self._write_metadata(session_dir, metadata)
        self._upsert_catalog(metadata)
        return self.public_metadata(metadata)

    def update(self, recording_id: str, title: str | None = None, project_name: str | None = None) -> dict[str, Any]:
        with self._lock_for(recording_id):
            session_dir, metadata = self._load(recording_id)
            if title is not None:
                new_title = title.strip()[:200]
                if not new_title:
                    try:
                        dt = datetime.fromisoformat(metadata["created_at"])
                        new_title = dt.strftime("%Y-%m-%d %H:%M:%S")
                    except Exception:
                        new_title = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                metadata["title"] = new_title
            if project_name is not None:
                metadata["project_name"] = project_name.strip()[:200]
            self._write_metadata(session_dir, metadata)
            self._upsert_catalog(metadata)
            return self.public_metadata(metadata)

    def update_title(self, recording_id: str, title: str) -> dict[str, Any]:
        return self.update(recording_id, title=title)

    def append_chunk(self, recording_id: str, sequence: int, content: bytes) -> dict[str, Any]:
        return self.append_track_chunk(recording_id, "mixed", sequence, content)

    def append_track_chunk(self, recording_id: str, track_id: str, sequence: int, content: bytes) -> dict[str, Any]:
        if sequence < 0:
            raise RecordingConflict("Chunk sequence must be non-negative")
        if not content:
            raise RecordingConflict("Chunk is empty")

        with self._lock_for(recording_id):
            session_dir, metadata = self._load(recording_id)
            metadata = self._ensure_tracks(metadata)
            if metadata["status"] != "recording":
                raise RecordingConflict("Recording is no longer accepting chunks")
            track = self._track_for(metadata, track_id)
            expected = track["chunk_count"]
            if sequence != expected:
                raise RecordingConflict(
                    f"Expected chunk sequence {expected}, received {sequence}"
                )

            part_path = self._track_part_path(session_dir, track)
            with part_path.open("ab") as output:
                output.write(content)
                output.flush()
                os.fsync(output.fileno())

            track["chunk_count"] += 1
            track["bytes_written"] += len(content)
            self._sync_legacy_totals(metadata)
            self._write_metadata(session_dir, metadata)
            self._upsert_catalog(metadata)
            return self.public_metadata(metadata)

    def finalize(self, recording_id: str) -> tuple[dict[str, Any], bool]:
        with self._lock_for(recording_id):
            session_dir, metadata = self._load(recording_id)
            metadata = self._ensure_tracks(metadata)
            if metadata["status"] in {"recorded", "transcribing", "completed", "failed"}:
                return self.public_metadata(metadata), False
            if metadata["status"] != "recording":
                raise RecordingConflict(
                    f"Cannot stop recording in status {metadata['status']}"
                )
            # Allow empty recordings – the user may have stopped
            # before the first chunk interval elapsed.

            metadata["status"] = "finalizing"
            metadata["stopped_at"] = _utc_now()
            self._write_metadata(session_dir, metadata)
            self._upsert_catalog(metadata)

            for track in metadata["audio_tracks"]:
                part_path = self._track_part_path(session_dir, track)
                audio_path = self._track_audio_path(session_dir, track)
                if part_path.exists():
                    part_path.replace(audio_path)
                elif not audio_path.exists():
                    # No data was written; create an empty file.
                    audio_path.touch()
                track["audio_file"] = self._relative_track_audio_file(metadata, track)

            metadata["status"] = "recorded"
            self._sync_legacy_totals(metadata)
            self._write_metadata(session_dir, metadata)
            self._upsert_catalog(metadata)
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
        metadata = self._ensure_tracks(metadata)
        audio_path = self._track_audio_path(session_dir, self._primary_track(metadata))
        if not audio_path.exists():
            raise RecordingConflict("Finalized recording file does not exist")
        return audio_path

    def track_audio_path(self, recording_id: str, track_id: str) -> Path:
        session_dir, metadata = self._load(recording_id)
        metadata = self._ensure_tracks(metadata)
        track = self._track_for(metadata, track_id)
        audio_path = self._track_audio_path(session_dir, track)
        if not audio_path.exists():
            raise RecordingConflict("Finalized recording track does not exist")
        return audio_path

    def transcribable_tracks(self, recording_id: str) -> list[tuple[dict[str, Any], Path]]:
        session_dir, metadata = self._load(recording_id)
        metadata = self._ensure_tracks(metadata)
        tracks = [
            track
            for track in metadata["audio_tracks"]
            if track["source"] in {"mic", "system"}
        ]
        if not tracks:
            tracks = [self._primary_track(metadata)]
        result = []
        for track in tracks:
            audio_path = self._track_audio_path(session_dir, track)
            if not audio_path.exists():
                raise RecordingConflict(f"Track {track['id']} does not have finalized audio")
            result.append((track, audio_path))
        return result

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
            self._upsert_catalog(metadata)

    def fail(self, recording_id: str, error: str) -> None:
        with self._lock_for(recording_id):
            session_dir, metadata = self._load(recording_id)
            metadata["status"] = "failed"
            metadata["completed_at"] = _utc_now()
            metadata["error"] = error[:2000]
            self._write_metadata(session_dir, metadata)
            self._upsert_catalog(metadata)

    def public_metadata(self, metadata: dict[str, Any]) -> dict[str, Any]:
        metadata = self._ensure_tracks(metadata)
        session_dir = self._session_dir(metadata)
        primary = self._primary_track(metadata)
        audio_path = self._track_audio_path(session_dir, primary)
        public_tracks = []
        for track in metadata["audio_tracks"]:
            track_audio_path = self._track_audio_path(session_dir, track)
            public_tracks.append({
                key: value
                for key, value in track.items()
                if key != "extension"
            } | {
                "audio_file": (
                    self._relative_track_audio_file(metadata, track)
                    if track_audio_path.exists()
                    else None
                )
            })
        public = {
            key: value
            for key, value in metadata.items()
            if key not in {"extension", "relative_dir", "audio_tracks"}
        } | {
            "audio_tracks": public_tracks,
            "audio_file": (
                self._relative_track_audio_file(metadata, primary)
                if audio_path.exists()
                else None
            )
        }
        public["chunk_count"] = primary.get("chunk_count", public.get("chunk_count", 0))
        public["bytes_written"] = sum(track.get("bytes_written", 0) for track in metadata["audio_tracks"])
        public["mime_type"] = primary.get("mime_type") or public.get("mime_type")
        return public

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
        metadata = self._ensure_tracks(metadata)
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

    def _track_file_stem(self, track_id: str) -> str:
        return "recording" if track_id == "mixed" else track_id

    def _track_part_path(self, session_dir: Path, track: dict[str, Any]) -> Path:
        return session_dir / f"{self._track_file_stem(track['id'])}{track['extension']}.part"

    def _track_audio_path(self, session_dir: Path, track: dict[str, Any]) -> Path:
        return session_dir / f"{self._track_file_stem(track['id'])}{track['extension']}"

    def _relative_track_audio_file(self, metadata: dict[str, Any], track: dict[str, Any]) -> str:
        return f"{metadata['relative_dir']}/{self._track_file_stem(track['id'])}{track['extension']}"

    def _track_ids_for_mode(self, capture_mode: str) -> list[str]:
        if capture_mode == "both":
            return ["mixed", "mic", "system"]
        if capture_mode == "mic_only":
            return ["mic"]
        if capture_mode == "pc_only":
            return ["system"]
        return ["mixed"]

    def _primary_track_id_for_mode(self, capture_mode: str) -> str:
        if capture_mode == "mic_only":
            return "mic"
        if capture_mode == "pc_only":
            return "system"
        return "mixed"

    def _ensure_tracks(self, metadata: dict[str, Any]) -> dict[str, Any]:
        if metadata.get("audio_tracks"):
            return metadata
        track_id = metadata.get("primary_track_id") or "mixed"
        extension = metadata.get("extension") or _extension_for_mime(metadata.get("mime_type", "audio/webm"))
        metadata["capture_mode"] = metadata.get("capture_mode") or "legacy_mixed"
        metadata["primary_track_id"] = track_id
        metadata["audio_tracks"] = [{
            "id": track_id,
            "source": TRACK_SOURCES.get(track_id, "mixed"),
            "label": TRACK_LABELS.get(track_id, "Conversazione"),
            "mime_type": metadata.get("mime_type", "audio/webm"),
            "extension": extension,
            "chunk_count": metadata.get("chunk_count", 0),
            "bytes_written": metadata.get("bytes_written", 0),
            "primary": True,
            "audio_file": None,
        }]
        return metadata

    def _track_for(self, metadata: dict[str, Any], track_id: str) -> dict[str, Any]:
        for track in metadata["audio_tracks"]:
            if track["id"] == track_id:
                return track
        raise RecordingConflict(f"Unknown recording track: {track_id}")

    def _primary_track(self, metadata: dict[str, Any]) -> dict[str, Any]:
        primary_track_id = metadata.get("primary_track_id") or "mixed"
        try:
            return self._track_for(metadata, primary_track_id)
        except RecordingConflict:
            return metadata["audio_tracks"][0]

    def _sync_legacy_totals(self, metadata: dict[str, Any]) -> None:
        primary = self._primary_track(metadata)
        metadata["chunk_count"] = primary.get("chunk_count", 0)
        metadata["bytes_written"] = sum(track.get("bytes_written", 0) for track in metadata.get("audio_tracks", []))
        metadata["mime_type"] = primary.get("mime_type", metadata.get("mime_type"))
        metadata["extension"] = primary.get("extension", metadata.get("extension"))

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
                    self._upsert_catalog(metadata)
            except (OSError, json.JSONDecodeError, KeyError):
                continue

    def sync_catalog(self) -> None:
        if self.catalog is None:
            return
        for metadata_path in self.root.glob("*/*/metadata.json"):
            try:
                with metadata_path.open("r", encoding="utf-8") as metadata_file:
                    self._upsert_catalog(json.load(metadata_file))
            except (OSError, json.JSONDecodeError, KeyError):
                continue

    def _upsert_catalog(self, metadata: dict[str, Any]) -> None:
        if self.catalog is None:
            return
        public = self.public_metadata(metadata)
        self.catalog.upsert_recording(metadata, audio_file=public.get("audio_file"))
