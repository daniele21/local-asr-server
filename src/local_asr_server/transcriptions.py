from __future__ import annotations

import json
import uuid
import sqlite3
import contextlib
import threading
import time
from pathlib import Path
from datetime import datetime, timezone
from typing import Any

from local_asr_server.settings import load_settings


class TranscriptionStore:
    _last_sync_time = 0.0
    _sync_lock = threading.Lock()

    @property
    def root(self) -> Path:
        settings = load_settings()
        path = Path(settings["transcriptions_dir"]).expanduser().resolve()
        path.mkdir(parents=True, exist_ok=True)
        return path

    @property
    def db_path(self) -> Path:
        return self.root / "closedroom.db"

    @contextlib.contextmanager
    def connection(self):
        # Open a new SQLite connection for this block
        conn = sqlite3.connect(self.db_path, timeout=10.0)
        # Enable Write-Ahead Logging for concurrent reads and writes, and check foreign key constraints
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

    def _init_db(self, conn: sqlite3.Connection):
        # Initialize schema if it does not exist
        conn.execute("""
            CREATE TABLE IF NOT EXISTS transcriptions (
                id TEXT PRIMARY KEY,
                timestamp TEXT,
                audio_filename TEXT,
                recording_id TEXT,
                model TEXT,
                language TEXT,
                text TEXT,
                segments TEXT,
                stats TEXT,
                analysis TEXT,
                merged_sources TEXT,
                hidden INTEGER DEFAULT 0,
                merged_into TEXT,
                file_name TEXT
            )
        """)
        # Create indexes for performant retrieval
        conn.execute("CREATE INDEX IF NOT EXISTS idx_transcriptions_recording_id ON transcriptions(recording_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_transcriptions_audio_filename ON transcriptions(audio_filename)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_transcriptions_timestamp ON transcriptions(timestamp DESC)")

    def sync(self):
        """
        Bidirectional synchronization between sqlite database and filesystem JSON files.
        Imports any untracked disk files to SQLite, and removes SQLite records for files deleted on disk.
        """
        with self.connection() as conn:
            self._init_db(conn)
            
            # 1. Scan disk files
            disk_files = {}
            for p in self.root.glob("transcript_*.json"):
                disk_files[p.name] = p
                
            # 2. Get all records from DB
            cursor = conn.execute("SELECT id, file_name FROM transcriptions")
            db_records = cursor.fetchall()
            db_ids = {row[0] for row in db_records}
            db_file_names = {row[1]: row[0] for row in db_records if row[1]}
            
            # 3. Insert files that are on disk but not in DB
            for filename, path in disk_files.items():
                if filename not in db_file_names:
                    try:
                        with open(path, "r", encoding="utf-8") as f:
                            data = json.load(f)
                        t_id = data.get("id")
                        if not t_id:
                            continue
                        # Skip if ID exists under another filename
                        if t_id in db_ids:
                            continue
                        
                        conn.execute("""
                            INSERT INTO transcriptions (
                                id, timestamp, audio_filename, recording_id, model, language,
                                text, segments, stats, analysis, merged_sources, hidden, merged_into, file_name
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """, (
                            t_id,
                            data.get("timestamp"),
                            data.get("audio_filename"),
                            data.get("recording_id"),
                            data.get("model"),
                            data.get("language"),
                            data.get("text"),
                            json.dumps(data.get("segments", [])),
                            json.dumps(data.get("stats", {})),
                            json.dumps(data.get("analysis")) if data.get("analysis") is not None else None,
                            json.dumps(data.get("merged_sources")) if data.get("merged_sources") is not None else None,
                            1 if data.get("hidden") else 0,
                            data.get("merged_into"),
                            filename
                        ))
                    except Exception as e:
                        # Log error and continue
                        print(f"Error syncing file {filename} to database: {e}")
                        
            # 4. Delete records from DB if the corresponding file is NOT on disk
            for row in db_records:
                t_id, file_name = row
                if file_name and file_name not in disk_files:
                    conn.execute("DELETE FROM transcriptions WHERE id = ?", (t_id,))

    def _ensure_synced(self):
        """
        Throttles sync requests so directory scans happen at most once every 2 seconds.
        """
        now = time.time()
        if now - self._last_sync_time > 2.0:
            with self._sync_lock:
                if now - self._last_sync_time > 2.0:
                    self.sync()
                    self._last_sync_time = time.time()

    def _row_to_dict(self, row) -> dict[str, Any]:
        return {
            "id": row[0],
            "timestamp": row[1],
            "audio_filename": row[2],
            "recording_id": row[3],
            "model": row[4],
            "language": row[5],
            "text": row[6],
            "segments": json.loads(row[7]) if row[7] else [],
            "stats": json.loads(row[8]) if row[8] else {},
            "analysis": json.loads(row[9]) if row[9] else None,
            "merged_sources": json.loads(row[10]) if row[10] else None,
            "hidden": bool(row[11]),
            "merged_into": row[12],
        }

    def save(self, payload: dict[str, Any], audio_filename: str = "", recording_id: str | None = None) -> dict[str, Any]:
        self._ensure_synced()
        transcription_id = str(uuid.uuid4())
        timestamp = datetime.now(timezone.utc).isoformat()
        
        # Save files based on timestamp + short id
        formatted_time = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename_base = f"transcript_{formatted_time}_{transcription_id[:8]}"
        
        meta = {
            "id": transcription_id,
            "timestamp": timestamp,
            "audio_filename": audio_filename or "uploaded_audio",
            "recording_id": recording_id or payload.get("recording_id") or "",
            "model": payload.get("model", "default"),
            "language": payload.get("language", "it"),
            "text": payload.get("text", ""),
            "segments": payload.get("segments", []),
            "stats": payload.get("stats", {}),
            "analysis": payload.get("analysis"),
            "merged_sources": payload.get("merged_sources")
        }
        
        # Save JSON metadata + full result
        json_path = self.root / f"{filename_base}.json"
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(meta, f, indent=2, ensure_ascii=False)
            
        # Save plain text transcription for simple viewing
        txt_path = self.root / f"{filename_base}.txt"
        with open(txt_path, "w", encoding="utf-8") as f:
            f.write(payload.get("text", ""))
            
        # Save to SQLite database
        with self.connection() as conn:
            conn.execute("""
                INSERT INTO transcriptions (
                    id, timestamp, audio_filename, recording_id, model, language,
                    text, segments, stats, analysis, merged_sources, hidden, merged_into, file_name
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                transcription_id,
                timestamp,
                meta["audio_filename"],
                meta["recording_id"],
                meta["model"],
                meta["language"],
                meta["text"],
                json.dumps(meta["segments"]),
                json.dumps(meta["stats"]),
                json.dumps(meta["analysis"]) if meta["analysis"] is not None else None,
                json.dumps(meta["merged_sources"]) if meta["merged_sources"] is not None else None,
                0,
                None,
                f"{filename_base}.json"
            ))
            
        return meta

    def merge(self, transcription_ids: list[str], title: str | None = None) -> dict[str, Any]:
        if not transcription_ids or len(transcription_ids) < 2:
            raise ValueError("Devi selezionare almeno due trascrizioni da unire.")
            
        transcriptions_to_merge = []
        for t_id in transcription_ids:
            try:
                tr = self.get(t_id)
                transcriptions_to_merge.append(tr)
            except FileNotFoundError as exc:
                raise FileNotFoundError(f"Trascrizione con ID {t_id} non trovata.") from exc

        if not title or not title.strip():
            formatted_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            title = f"Trascrizione Unita - {formatted_time}"

        merged_text_parts = []
        merged_segments = []
        merged_sources = []
        current_offset = 0.0
        segment_id_counter = 0
        
        total_time = 0.0
        languages = []
        models = []

        for tr in transcriptions_to_merge:
            audio_filename = tr.get("audio_filename") or "Sorgente"
            
            merged_sources.append({
                "id": tr["id"],
                "audio_filename": audio_filename,
                "recording_id": tr.get("recording_id") or ""
            })
            
            part_text = tr.get("text", "")
            if part_text:
                header = f"--- {audio_filename} ---\n"
                merged_text_parts.append(f"{header}{part_text}")
                
            max_end = 0.0
            for seg in tr.get("segments", []):
                shifted_seg = seg.copy()
                shifted_seg["id"] = segment_id_counter
                segment_id_counter += 1
                shifted_seg["start"] = seg["start"] + current_offset
                shifted_seg["end"] = seg["end"] + current_offset
                if shifted_seg["end"] > max_end:
                    max_end = shifted_seg["end"]
                merged_segments.append(shifted_seg)
                
            current_offset += max_end
            
            stats = tr.get("stats", {})
            if stats:
                total_time += stats.get("time_total_seconds", 0.0)
            if tr.get("language") and tr.get("language") not in languages:
                languages.append(tr["language"])
            if tr.get("model") and tr.get("model") not in models:
                models.append(tr["model"])

        combined_text = "\n\n".join(merged_text_parts)
        combined_payload = {
            "text": combined_text,
            "segments": merged_segments,
            "merged_sources": merged_sources,
            "language": ", ".join(languages) if languages else "it",
            "model": ", ".join([m.split('/')[-1] for m in models]) if models else "default",
            "stats": {
                "time_total_seconds": total_time
            }
        }
        
        merged_meta = self.save(combined_payload, audio_filename=title)
        
        # Hide the original source transcriptions
        with self.connection() as conn:
            for t_id in transcription_ids:
                cursor = conn.execute("SELECT file_name FROM transcriptions WHERE id = ?", (t_id,))
                row = cursor.fetchone()
                if row and row[0]:
                    file_name = row[0]
                    p = self.root / file_name
                    try:
                        with open(p, "r", encoding="utf-8") as f:
                            data = json.load(f)
                        data["hidden"] = True
                        data["merged_into"] = merged_meta["id"]
                        with open(p, "w", encoding="utf-8") as f:
                            json.dump(data, f, indent=2, ensure_ascii=False)
                    except Exception as e:
                        print(f"Error updating hidden status on disk for {t_id}: {e}")
                
                # Update SQLite
                conn.execute("""
                    UPDATE transcriptions
                    SET hidden = 1, merged_into = ?
                    WHERE id = ?
                """, (merged_meta["id"], t_id))
                    
        return merged_meta

    def split(self, transcription_id: str) -> list[str]:
        merged_data = self.get(transcription_id)
        merged_sources = merged_data.get("merged_sources", [])
        
        restored_ids = []
        with self.connection() as conn:
            for src in merged_sources:
                src_id = src.get("id")
                if not src_id:
                    continue
                cursor = conn.execute("SELECT file_name FROM transcriptions WHERE id = ?", (src_id,))
                row = cursor.fetchone()
                if row and row[0]:
                    file_name = row[0]
                    p = self.root / file_name
                    try:
                        with open(p, "r", encoding="utf-8") as f:
                            data = json.load(f)
                        data.pop("hidden", None)
                        data.pop("merged_into", None)
                        with open(p, "w", encoding="utf-8") as f:
                            json.dump(data, f, indent=2, ensure_ascii=False)
                    except Exception as e:
                        print(f"Error restoring metadata on disk for {src_id}: {e}")
                
                # Update SQLite
                conn.execute("""
                    UPDATE transcriptions
                    SET hidden = 0, merged_into = NULL
                    WHERE id = ?
                """, (src_id,))
                restored_ids.append(src_id)
                    
        # Delete the merged transcription
        self.delete(transcription_id)
        return restored_ids

    def list(self, page: int = 1, limit: int = 10) -> tuple[list[dict[str, Any]], int]:
        self._ensure_synced()
        with self.connection() as conn:
            # Get total count of visible items
            cursor = conn.execute("SELECT COUNT(*) FROM transcriptions WHERE hidden = 0 AND merged_into IS NULL")
            total = cursor.fetchone()[0]
            
            # Fetch page items sorted by timestamp desc
            offset = (page - 1) * limit
            cursor = conn.execute("""
                SELECT id, timestamp, audio_filename, recording_id, model, language,
                       text, segments, stats, analysis, merged_sources, hidden, merged_into
                FROM transcriptions
                WHERE hidden = 0 AND merged_into IS NULL
                ORDER BY timestamp DESC
                LIMIT ? OFFSET ?
            """, (limit, offset))
            items = [self._row_to_dict(row) for row in cursor.fetchall()]
            return items, total

    def get(self, transcription_id: str) -> dict[str, Any]:
        self._ensure_synced()
        with self.connection() as conn:
            cursor = conn.execute("""
                SELECT id, timestamp, audio_filename, recording_id, model, language,
                       text, segments, stats, analysis, merged_sources, hidden, merged_into
                FROM transcriptions
                WHERE id = ?
            """, (transcription_id,))
            row = cursor.fetchone()
            if not row:
                raise FileNotFoundError("Transcription not found")
            return self._row_to_dict(row)

    def find_for_recording(self, recording_id: str, audio_filename: str = "") -> dict[str, Any] | None:
        self._ensure_synced()
        with self.connection() as conn:
            row = None
            if recording_id:
                cursor = conn.execute("""
                    SELECT id, timestamp, audio_filename, recording_id, model, language,
                           text, segments, stats, analysis, merged_sources, hidden, merged_into
                    FROM transcriptions
                    WHERE recording_id = ?
                """, (recording_id,))
                row = cursor.fetchone()
            
            if not row and audio_filename:
                cursor = conn.execute("""
                    SELECT id, timestamp, audio_filename, recording_id, model, language,
                           text, segments, stats, analysis, merged_sources, hidden, merged_into
                    FROM transcriptions
                    WHERE audio_filename = ?
                """, (audio_filename,))
                row = cursor.fetchone()
                
            if row:
                item = self._row_to_dict(row)
                merged_into = item.get("merged_into")
                if merged_into:
                    try:
                        return self.get(merged_into)
                    except FileNotFoundError:
                        pass
                return item
            return None

    def save_analysis(self, transcription_id: str, analysis: dict[str, Any]) -> dict[str, Any]:
        self._ensure_synced()
        # Find the file path from DB first
        file_name = None
        with self.connection() as conn:
            cursor = conn.execute("SELECT file_name FROM transcriptions WHERE id = ?", (transcription_id,))
            row = cursor.fetchone()
            if row:
                file_name = row[0]
                
        if not file_name:
            raise FileNotFoundError("Transcription not found")
            
        json_path = self.root / file_name
        
        # Read current data from file to preserve formatting
        with open(json_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            
        analysis_payload = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "result": analysis,
        }
        data["analysis"] = analysis_payload
        
        # Write back to JSON file
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            
        # Update SQLite database
        with self.connection() as conn:
            conn.execute("""
                UPDATE transcriptions
                SET analysis = ?
                WHERE id = ?
            """, (json.dumps(analysis_payload), transcription_id))
            
        return data

    def delete(self, transcription_id: str) -> bool:
        self._ensure_synced()
        file_name = None
        with self.connection() as conn:
            cursor = conn.execute("SELECT file_name FROM transcriptions WHERE id = ?", (transcription_id,))
            row = cursor.fetchone()
            if row:
                file_name = row[0]
                
        if not file_name:
            return False
            
        # Delete from disk
        p = self.root / file_name
        if p.exists():
            p.unlink()
        txt_path = p.with_suffix(".txt")
        if txt_path.exists():
            txt_path.unlink()
            
        # Delete from SQLite database
        with self.connection() as conn:
            conn.execute("DELETE FROM transcriptions WHERE id = ?", (transcription_id,))
            
        return True
