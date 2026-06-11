from __future__ import annotations

import json
import uuid
from pathlib import Path
from datetime import datetime, timezone
from typing import Any

from local_asr_server.settings import load_settings


class TranscriptionStore:
    @property
    def root(self) -> Path:
        settings = load_settings()
        path = Path(settings["transcriptions_dir"]).expanduser().resolve()
        path.mkdir(parents=True, exist_ok=True)
        return path

    def save(self, payload: dict[str, Any], audio_filename: str = "") -> dict[str, Any]:
        transcription_id = str(uuid.uuid4())
        timestamp = datetime.now(timezone.utc).isoformat()
        
        # Save files based on timestamp + short id
        formatted_time = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename_base = f"transcript_{formatted_time}_{transcription_id[:8]}"
        
        meta = {
            "id": transcription_id,
            "timestamp": timestamp,
            "audio_filename": audio_filename or "uploaded_audio",
            "model": payload.get("model", "default"),
            "language": payload.get("language", "it"),
            "text": payload.get("text", ""),
            "segments": payload.get("segments", []),
            "stats": payload.get("stats", {})
        }
        
        # Save JSON metadata + full result
        json_path = self.root / f"{filename_base}.json"
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(meta, f, indent=2, ensure_ascii=False)
            
        # Save plain text transcription for simple viewing
        txt_path = self.root / f"{filename_base}.txt"
        with open(txt_path, "w", encoding="utf-8") as f:
            f.write(payload.get("text", ""))
            
        return meta

    def list(self, page: int = 1, limit: int = 10) -> tuple[list[dict[str, Any]], int]:
        items = []
        for p in self.root.glob("transcript_*.json"):
            try:
                with open(p, "r", encoding="utf-8") as f:
                    items.append(json.load(f))
            except Exception:
                continue
                
        # Sort by timestamp descending
        items.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
        
        total = len(items)
        start = (page - 1) * limit
        end = start + limit
        
        return items[start:end], total

    def get(self, transcription_id: str) -> dict[str, Any]:
        for p in self.root.glob("transcript_*.json"):
            try:
                with open(p, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if data.get("id") == transcription_id:
                        return data
            except Exception:
                continue
        raise FileNotFoundError("Transcription not found")

    def delete(self, transcription_id: str) -> bool:
        for p in self.root.glob("transcript_*.json"):
            try:
                with open(p, "r", encoding="utf-8") as f:
                    data = json.load(f)
                if data.get("id") == transcription_id:
                    p.unlink()
                    txt_path = p.with_suffix(".txt")
                    if txt_path.exists():
                        txt_path.unlink()
                    return True
            except Exception:
                continue
        return False
