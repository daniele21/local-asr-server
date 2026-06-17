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

    def save(self, payload: dict[str, Any], audio_filename: str = "", recording_id: str | None = None) -> dict[str, Any]:
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
        for t_id in transcription_ids:
            for p in self.root.glob("transcript_*.json"):
                try:
                    with open(p, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    if data.get("id") == t_id:
                        data["hidden"] = True
                        data["merged_into"] = merged_meta["id"]
                        with open(p, "w", encoding="utf-8") as f:
                            json.dump(data, f, indent=2, ensure_ascii=False)
                        break
                except Exception:
                    continue
                    
        return merged_meta

    def split(self, transcription_id: str) -> list[str]:
        merged_data = self.get(transcription_id)
        merged_sources = merged_data.get("merged_sources", [])
        
        restored_ids = []
        for src in merged_sources:
            src_id = src.get("id")
            if not src_id:
                continue
            for p in self.root.glob("transcript_*.json"):
                try:
                    with open(p, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    if data.get("id") == src_id:
                        data.pop("hidden", None)
                        data.pop("merged_into", None)
                        with open(p, "w", encoding="utf-8") as f:
                            json.dump(data, f, indent=2, ensure_ascii=False)
                        restored_ids.append(src_id)
                        break
                except Exception:
                    continue
                    
        # Delete the merged transcription
        self.delete(transcription_id)
        return restored_ids

    def list(self, page: int = 1, limit: int = 10) -> tuple[list[dict[str, Any]], int]:
        items = []
        for p in self.root.glob("transcript_*.json"):
            try:
                with open(p, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if data.get("hidden") or data.get("merged_into"):
                        continue
                    items.append(data)
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

    def find_for_recording(self, recording_id: str, audio_filename: str = "") -> dict[str, Any] | None:
        for p in self.root.glob("transcript_*.json"):
            try:
                with open(p, "r", encoding="utf-8") as f:
                    item = json.load(f)
                
                match = False
                if recording_id and item.get("recording_id") == recording_id:
                    match = True
                elif audio_filename and item.get("audio_filename") == audio_filename:
                    match = True
                    
                if match:
                    merged_into = item.get("merged_into")
                    if merged_into:
                        try:
                            return self.get(merged_into)
                        except FileNotFoundError:
                            pass
                    return item
            except Exception:
                continue
        return None

    def save_analysis(self, transcription_id: str, analysis: dict[str, Any]) -> dict[str, Any]:
        for p in self.root.glob("transcript_*.json"):
            try:
                with open(p, "r", encoding="utf-8") as f:
                    data = json.load(f)
                if data.get("id") != transcription_id:
                    continue
                data["analysis"] = {
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "result": analysis,
                }
                with open(p, "w", encoding="utf-8") as f:
                    json.dump(data, f, indent=2, ensure_ascii=False)
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
