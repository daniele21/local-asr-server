from __future__ import annotations

from local_asr_server.app_services import get_services

import json
from pathlib import Path

from fastapi import APIRouter, Request

from local_asr_server.schemas import MockDataRequest


router = APIRouter()


@router.post("/v1/system/mock-data")
def populate_mock_data(request: Request, body: MockDataRequest):
    import wave
    import shutil
    from datetime import datetime, timedelta, timezone
    from local_asr_server.settings import load_settings

    lang = body.lang
    settings = load_settings()
    recordings_dir = Path(settings["recordings_dir"]).expanduser().resolve()
    transcriptions_dir = Path(settings["transcriptions_dir"]).expanduser().resolve()
    catalog_store = get_services(request.app).catalog

    # 1. Clean up existing mock records
    with catalog_store.connection() as conn:
        mock_rec_ids = [row["id"] for row in conn.execute("SELECT id FROM recordings WHERE id LIKE 'mock-%'").fetchall()]
        conn.execute("DELETE FROM analysis_runs WHERE id LIKE 'mock-%' OR recording_id LIKE 'mock-%'")
        conn.execute("DELETE FROM transcriptions WHERE id LIKE 'mock-%' OR recording_id LIKE 'mock-%'")
        conn.execute("DELETE FROM recordings WHERE id LIKE 'mock-%'")

    for rec_id in mock_rec_ids:
        for p in recordings_dir.glob(f"*/{rec_id}"):
            if p.is_dir():
                shutil.rmtree(p, ignore_errors=True)

    for p in transcriptions_dir.glob("mock-transcript-*"):
        p.unlink(missing_ok=True)

    # Helper to calculate relative times
    def iso_days_ago(days: int, hour: int, minute: int = 0) -> str:
        now = datetime.now(timezone.utc)
        dt = now - timedelta(days=days)
        dt = dt.replace(hour=hour, minute=minute, second=0, microsecond=0)
        return dt.isoformat().replace("+00:00", "Z")

    # Helper to write silent WAV file
    def create_silent_wav(file_path: Path):
        file_path.parent.mkdir(parents=True, exist_ok=True)
        with wave.open(str(file_path), "wb") as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(8000)
            wav_file.writeframes(b'\x00' * 16000) # 1 second of silence

    # Mock data definitions
    if lang == "it":
        specs = [
            {
                "id": "mock-onboarding-permissions",
                "title": "Product sync - Onboarding e permessi macOS",
                "created_at": iso_days_ago(0, 10, 15),
                "duration": 2780,
                "project_name": "ClosedRoom Beta Launch",
                "text": "Il team conferma che il primo avvio deve spiegare solo cartella, microfono e cattura audio. Luca validara il flusso permessi entro venerdi, Sara chiudera la vista onboarding e Daniele preparera la demo beta.",
                "brief": "Il team ha riallineato il primo avvio: meno configurazione tecnica, permessi macOS guidati e demo pronta per i primi utenti beta.",
                "actions": [
                    { "task": "Validare il flusso permessi macOS con build firmata", "owner": "Luca", "due_date": "Venerdì", "priority": "Alta", "status": "open" },
                    { "task": "Chiudere la vista onboarding con copy non tecnico", "owner": "Sara", "due_date": "Giovedì", "priority": "Alta", "status": "open" },
                    { "task": "Preparare la demo per i primi utenti beta", "owner": "Daniele", "due_date": "Venerdì", "priority": "Media", "status": "open" }
                ],
                "decisions": [
                    { "decision": "La configurazione tecnica resta nascosta dietro dettagli avanzati.", "rationale": "Riduce attrito nel primo avvio." },
                    { "decision": "La modalità demo deve funzionare senza backend e senza dati reali.", "rationale": "Permette test indipendenti." }
                ],
                "risks": [
                    { "risk": "Permessi macOS possono bloccare la prima registrazione.", "severity": "Alta", "next_step": "Preflight guidato prima dello start." }
                ]
            },
            {
                "id": "mock-design-review",
                "title": "Design review - Home e progetto workspace",
                "created_at": iso_days_ago(0, 14, 30),
                "duration": 2140,
                "project_name": "ClosedRoom Beta Launch",
                "text": "La review conferma che Home deve partire da cosa e successo oggi, mentre Progetti deve mostrare stato, azioni, decisioni e rischi. Il tour deve evidenziare aree reali della UI.",
                "brief": "Home e Progetti diventano viste outcome-first: digest, azioni, decisioni e rischi sono piu importanti dei dettagli tecnici.",
                "actions": [
                    { "task": "Aggiungere spotlight sui blocchi reali di Home", "owner": "Sara", "due_date": "Domani", "priority": "Alta", "status": "open" },
                    { "task": "Rivedere gerarchia visuale del pannello Progetti", "owner": "Daniele", "due_date": "Settimana", "priority": "Media", "status": "open" }
                ],
                "decisions": [
                    { "decision": "Il tour guidato parte dalla Home piena, non dalla pagina Trascrizione.", "rationale": "Mostra valore immediato." },
                    { "decision": "Le pagine manuali restano accessibili ma non sono il racconto principale.", "rationale": "Migliora la navigazione." }
                ],
                "risks": [
                    { "risk": "Troppa configurazione tecnica puo ridurre adozione.", "severity": "Media", "next_step": "Mostrare solo cio che serve nel contesto." }
                ]
            },
            {
                "id": "mock-gtm-pricing",
                "title": "Go-to-market - Pricing e target utenti",
                "created_at": iso_days_ago(1, 11, 0),
                "duration": 1980,
                "project_name": "ClosedRoom Beta Launch",
                "text": "Il team decide di posizionare ClosedRoom su founder, consulenti e team prodotto che lavorano con materiale sensibile. La beta resta prevista per luglio.",
                "brief": "Il posizionamento beta punta su privacy locale, meeting intelligence e time saving per team piccoli con materiale sensibile.",
                "actions": [
                    { "task": "Preparare una pagina beta con focus privacy locale", "owner": "Marta", "due_date": "Lunedì", "priority": "Media", "status": "open" },
                    { "task": "Raccogliere dieci profili beta in target", "owner": "Daniele", "due_date": "Fine mese", "priority": "Media", "status": "open" }
                ],
                "decisions": [
                    { "decision": "Il rilascio beta resta previsto per luglio.", "rationale": "Timeline definita per il marketing." },
                    { "decision": "Il messaggio principale sara recuperare decisioni e azioni senza rileggere trascrizioni.", "rationale": "Chiaro pain point dell'utente." }
                ],
                "risks": [
                    { "risk": "Mancano dati realistici per mostrare il valore in demo.", "severity": "Media", "next_step": "Usare scenario beta launch coerente." }
                ]
            },
            {
                "id": "mock-technical-review",
                "title": "Technical review - Nemotron locale e performance",
                "created_at": iso_days_ago(2, 16, 45),
                "duration": 3120,
                "project_name": "", # Senza progetto
                "status": "recorded" # Incomplete, needs transcription
            }
        ]
    else:
        specs = [
            {
                "id": "mock-onboarding-permissions",
                "title": "Product sync - Onboarding and macOS permissions",
                "created_at": iso_days_ago(0, 10, 15),
                "duration": 2780,
                "project_name": "ClosedRoom Beta Launch",
                "text": "The team confirms that the first launch should only explain the folder, microphone, and audio capture. Luca will validate the permissions flow by Friday, Sara will close the onboarding view, and Daniele will prepare the beta demo.",
                "brief": "The team has realigned the first launch: less technical configuration, guided macOS permissions, and demo ready for the first beta users.",
                "actions": [
                    { "task": "Validate macOS permissions flow with signed build", "owner": "Luca", "due_date": "Friday", "priority": "High", "status": "open" },
                    { "task": "Close onboarding view with non-technical copy", "owner": "Sara", "due_date": "Thursday", "priority": "High", "status": "open" },
                    { "task": "Prepare demo for first beta users", "owner": "Daniele", "due_date": "Friday", "priority": "Medium", "status": "open" }
                ],
                "decisions": [
                    { "decision": "Technical configuration remains hidden behind advanced details.", "rationale": "Reduces friction during first launch." },
                    { "decision": "Demo mode must work without backend and without real data.", "rationale": "Allows independent testing." }
                ],
                "risks": [
                    { "risk": "macOS permissions can block the first recording.", "severity": "High", "next_step": "Guided preflight before start." }
                ]
            },
            {
                "id": "mock-design-review",
                "title": "Design review - Home and project workspace",
                "created_at": iso_days_ago(0, 14, 30),
                "duration": 2140,
                "project_name": "ClosedRoom Beta Launch",
                "text": "The review confirms that Home must start with what happened today, while Projects must show status, actions, decisions, and risks. The tour must highlight real areas of the UI.",
                "brief": "Home and Projects become outcome-first views: digest, actions, decisions, and risks are more important than technical details.",
                "actions": [
                    { "task": "Add spotlight on real blocks of Home", "owner": "Sara", "due_date": "Tomorrow", "priority": "High", "status": "open" },
                    { "task": "Review visual hierarchy of the Projects panel", "owner": "Daniele", "due_date": "Week", "priority": "Medium", "status": "open" }
                ],
                "decisions": [
                    { "decision": "Guided tour starts from the filled Home, not from the Transcription page.", "rationale": "Shows immediate value." },
                    { "decision": "Manual pages remain accessible but are not the main narrative.", "rationale": "Improves overall UX." }
                ],
                "risks": [
                    { "risk": "Too much technical configuration can reduce adoption.", "severity": "Medium", "next_step": "Show only what is needed in context." }
                ]
            },
            {
                "id": "mock-gtm-pricing",
                "title": "Go-to-market - Pricing and user target",
                "created_at": iso_days_ago(1, 11, 0),
                "duration": 1980,
                "project_name": "ClosedRoom Beta Launch",
                "text": "The team decides to position ClosedRoom on founders, consultants, and product teams working with sensitive material. The beta remains planned for July.",
                "brief": "Beta positioning focuses on local privacy, meeting intelligence, and time saving for small teams with sensitive material.",
                "actions": [
                    { "task": "Prepare a beta page with focus on local privacy", "owner": "Marta", "due_date": "Monday", "priority": "Medium", "status": "open" },
                    { "task": "Collect ten target beta profiles", "owner": "Daniele", "due_date": "End of month", "priority": "Medium", "status": "open" }
                ],
                "decisions": [
                    { "decision": "Beta release remains scheduled for July.", "rationale": "Clear timeline for marketing strategy." },
                    { "decision": "Main message will be retrieving decisions and actions without rereading transcripts.", "rationale": "Addresses key user pain point." }
                ],
                "risks": [
                    { "risk": "Lack of realistic data to show value in demo.", "severity": "Medium", "next_step": "Use coherent beta launch scenario." }
                ]
            },
            {
                "id": "mock-technical-review",
                "title": "Technical review - Local Nemotron and performance",
                "created_at": iso_days_ago(2, 16, 45),
                "duration": 3120,
                "project_name": "", # Senza progetto
                "status": "recorded" # Incomplete, needs transcription
            }
        ]

    for spec in specs:
        created_date = spec["created_at"].split("T")[0]
        session_dir = recordings_dir / created_date / spec["id"]
        session_dir.mkdir(parents=True, exist_ok=True)

        # Write 1-second silent WAV files for mixed, mic, system
        create_silent_wav(session_dir / "recording.wav")
        create_silent_wav(session_dir / "mic.wav")
        create_silent_wav(session_dir / "system.wav")

        # Audio tracks metadata
        audio_tracks = [
            {
                "id": "mixed",
                "source": "mixed",
                "label": "Mix",
                "mime_type": "audio/wav",
                "extension": ".wav",
                "chunk_count": 1,
                "bytes_written": 16044,
                "primary": True,
                "audio_file": f"{created_date}/{spec['id']}/recording.wav"
            },
            {
                "id": "mic",
                "source": "mic",
                "label": "Microphone" if lang == "en" else "Microfono",
                "mime_type": "audio/wav",
                "extension": ".wav",
                "chunk_count": 1,
                "bytes_written": 16044,
                "primary": False,
                "audio_file": f"{created_date}/{spec['id']}/mic.wav"
            },
            {
                "id": "system",
                "source": "system",
                "label": "Computer" if lang == "en" else "Computer",
                "mime_type": "audio/wav",
                "extension": ".wav",
                "chunk_count": 1,
                "bytes_written": 16044,
                "primary": False,
                "audio_file": f"{created_date}/{spec['id']}/system.wav"
            }
        ]

        # Recording metadata
        rec_meta = {
            "id": spec["id"],
            "title": spec["title"],
            "project_name": spec["project_name"],
            "status": spec.get("status", "completed"),
            "created_at": spec["created_at"],
            "stopped_at": spec["created_at"],
            "completed_at": spec["created_at"],
            "mime_type": "audio/wav",
            "extension": ".wav",
            "chunk_count": 1,
            "bytes_written": 16044 * 3,
            "model": "mlx-community/nemotron-3.5-asr-streaming-0.6b",
            "language": "it" if lang == "it" else "en",
            "error": None,
            "relative_dir": f"{created_date}/{spec['id']}",
            "capture_mode": "both",
            "primary_track_id": "mixed",
            "audio_tracks": audio_tracks,
            "capture_backend": "native",
            "capture_status": "stopped",
            "quality_report": None,
            "warnings": []
        }

        # Write metadata.json for recording
        with open(session_dir / "metadata.json", "w", encoding="utf-8") as f:
            json.dump(rec_meta, f, indent=2, ensure_ascii=False)

        catalog_store.upsert_recording(rec_meta, audio_file=f"{created_date}/{spec['id']}/recording.wav")

        # Skip transcription and analysis if meeting is recorded-only
        if spec.get("status") == "recorded":
            continue

        # Write transcription files
        tx_id = f"mock-tx-{spec['id']}"
        tx_meta = {
            "id": tx_id,
            "timestamp": spec["created_at"],
            "audio_filename": "recording.wav",
            "recording_id": spec["id"],
            "model": "mlx-community/nemotron-3.5-asr-streaming-0.6b",
            "language": "it" if lang == "it" else "en",
            "text": spec["text"],
            "segments": [],
            "stats": {"time_total_seconds": 3.4},
            "analysis": None,
            "merged_sources": None,
            "source_tracks": audio_tracks
        }

        tx_file_name = f"mock-transcript-{spec['id']}.json"
        with open(transcriptions_dir / tx_file_name, "w", encoding="utf-8") as f:
            json.dump(tx_meta, f, indent=2, ensure_ascii=False)
        with open(transcriptions_dir / f"mock-transcript-{spec['id']}.txt", "w", encoding="utf-8") as f:
            f.write(spec["text"])

        catalog_store.upsert_transcription(tx_meta, file_name=tx_file_name)

        # Generate and save Analysis Runs
        # 1. meeting_brief
        brief_md = f"# Brief del meeting\n\n**Sintesi**: {spec['brief']}" if lang == "it" else f"# Meeting brief\n\n**Summary**: {spec['brief']}"
        catalog_store.create_analysis_run({
            "id": f"mock-run-{spec['id']}-meeting_brief",
            "scope_type": "recording",
            "scope_id": spec["id"],
            "transcription_id": tx_id,
            "recording_id": spec["id"],
            "analysis_type": "meeting_brief",
            "provider": "mock",
            "model": "nemotron-nano-4b-local",
            "temperature": 0.0,
            "reasoning": "off",
            "effective_reasoning": False,
            "show_thinking": False,
            "json_mode": True,
            "input_hash": f"mock-hash-{spec['id']}-brief",
            "status": "completed",
            "result": {"summary": spec["brief"]},
            "result_markdown": brief_md,
            "source_ids": [spec["id"], tx_id],
            "created_at": spec["created_at"]
        })

        # 2. action_items
        actions_md_parts = []
        if lang == "it":
            actions_md_parts.append("# Azioni operative\n")
            for act in spec["actions"]:
                actions_md_parts.append(f"- **{act['owner']}**: {act['task']} (Scadenza: {act['due_date']}, Priorità: {act['priority']})")
        else:
            actions_md_parts.append("# Action Items\n")
            for act in spec["actions"]:
                actions_md_parts.append(f"- **{act['owner']}**: {act['task']} (Due: {act['due_date']}, Priority: {act['priority']})")
        actions_md = "\n".join(actions_md_parts)
        catalog_store.create_analysis_run({
            "id": f"mock-run-{spec['id']}-action_items",
            "scope_type": "recording",
            "scope_id": spec["id"],
            "transcription_id": tx_id,
            "recording_id": spec["id"],
            "analysis_type": "action_items",
            "provider": "mock",
            "model": "nemotron-nano-4b-local",
            "temperature": 0.0,
            "reasoning": "off",
            "effective_reasoning": False,
            "show_thinking": False,
            "json_mode": True,
            "input_hash": f"mock-hash-{spec['id']}-actions",
            "status": "completed",
            "result": {"action_items": spec["actions"]},
            "result_markdown": actions_md,
            "source_ids": [spec["id"], tx_id],
            "created_at": spec["created_at"]
        })

        # 3. decisions
        decisions_md_parts = []
        if lang == "it":
            decisions_md_parts.append("# Decisioni recenti\n")
            for dec in spec["decisions"]:
                decisions_md_parts.append(f"- **{dec['decision']}**\n  *Razionale*: {dec.get('rationale', 'N/D')}")
        else:
            decisions_md_parts.append("# Recent Decisions\n")
            for dec in spec["decisions"]:
                decisions_md_parts.append(f"- **{dec['decision']}**\n  *Rationale*: {dec.get('rationale', 'N/A')}")
        decisions_md = "\n".join(decisions_md_parts)
        catalog_store.create_analysis_run({
            "id": f"mock-run-{spec['id']}-decisions",
            "scope_type": "recording",
            "scope_id": spec["id"],
            "transcription_id": tx_id,
            "recording_id": spec["id"],
            "analysis_type": "decisions",
            "provider": "mock",
            "model": "nemotron-nano-4b-local",
            "temperature": 0.0,
            "reasoning": "off",
            "effective_reasoning": False,
            "show_thinking": False,
            "json_mode": True,
            "input_hash": f"mock-hash-{spec['id']}-decisions",
            "status": "completed",
            "result": {"decisions": spec["decisions"]},
            "result_markdown": decisions_md,
            "source_ids": [spec["id"], tx_id],
            "created_at": spec["created_at"]
        })

        # 4. risks_blockers
        risks_md_parts = []
        if lang == "it":
            risks_md_parts.append("# Rischi e blocchi\n")
            for rsk in spec["risks"]:
                risks_md_parts.append(f"- **{rsk['risk']}** (Severità: {rsk['severity']})\n  *Prossimo passo*: {rsk['next_step']}")
        else:
            risks_md_parts.append("# Risks and Blockers\n")
            for rsk in spec["risks"]:
                risks_md_parts.append(f"- **{rsk['risk']}** (Severity: {rsk['severity']})\n  *Next step*: {rsk['next_step']}")
        risks_md = "\n".join(risks_md_parts)
        catalog_store.create_analysis_run({
            "id": f"mock-run-{spec['id']}-risks_blockers",
            "scope_type": "recording",
            "scope_id": spec["id"],
            "transcription_id": tx_id,
            "recording_id": spec["id"],
            "analysis_type": "risks_blockers",
            "provider": "mock",
            "model": "nemotron-nano-4b-local",
            "temperature": 0.0,
            "reasoning": "off",
            "effective_reasoning": False,
            "show_thinking": False,
            "json_mode": True,
            "input_hash": f"mock-hash-{spec['id']}-risks",
            "status": "completed",
            "result": {"risks": spec["risks"]},
            "result_markdown": risks_md,
            "source_ids": [spec["id"], tx_id],
            "created_at": spec["created_at"]
        })

    return {"success": True}


@router.post("/v1/system/clear-mock-data")
def clear_mock_data(request: Request):
    import shutil
    from local_asr_server.settings import load_settings

    settings = load_settings()
    recordings_dir = Path(settings["recordings_dir"]).expanduser().resolve()
    transcriptions_dir = Path(settings["transcriptions_dir"]).expanduser().resolve()
    catalog_store = get_services(request.app).catalog

    with catalog_store.connection() as conn:
        mock_rec_ids = [row["id"] for row in conn.execute("SELECT id FROM recordings WHERE id LIKE 'mock-%'").fetchall()]
        conn.execute("DELETE FROM analysis_runs WHERE id LIKE 'mock-%' OR recording_id LIKE 'mock-%'")
        conn.execute("DELETE FROM transcriptions WHERE id LIKE 'mock-%' OR recording_id LIKE 'mock-%'")
        conn.execute("DELETE FROM recordings WHERE id LIKE 'mock-%'")

    for rec_id in mock_rec_ids:
        for p in recordings_dir.glob(f"*/{rec_id}"):
            if p.is_dir():
                shutil.rmtree(p, ignore_errors=True)

    for p in transcriptions_dir.glob("mock-transcript-*"):
        p.unlink(missing_ok=True)

    return {"success": True}
