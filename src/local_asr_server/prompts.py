"""
prompts.py — Centralized prompt templates configuration for ClosedRoom.
"""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Any

from local_asr_server.paths import get_prompts_file

DEFAULT_PROMPTS: dict[str, dict[str, str]] = {
    "summary": {
        "it": "Analizza la seguente trascrizione identificando chiaramente i contributi di \"Tu\" (microfono locale) e \"Computer\" (audio di sistema/interlocutore remoto). Genera un titolo breve, un riassunto ben dettagliato che descriva la dinamica del colloquio, tutti i punti chiave evidenziando chi ha espresso cosa, e le azioni pratiche da intraprendere.",
        "en": "Analyze the following transcription, clearly identifying the contributions of \"You\" (local microphone) and \"Computer\" (system audio/remote speaker). Generate a short title, a detailed summary describing the dynamics of the conversation, all key points highlighting who said what, and practical actions to be taken."
    },
    "minutes": {
        "it": "Genera un verbale di riunione formale basato sulla trascrizione, strutturando i punti chiave e le decisioni in modo formale. Identifica chiaramente il ruolo di \"Tu\" (microfono locale) e \"Computer\" (audio di sistema/interlocutore remoto) e attribuisce correttamente a ciascuno i concetti espressi.",
        "en": "Generate formal meeting minutes based on the transcription, structuring key points and decisions in a formal manner. Clearly identify the roles of \"You\" (local microphone) and \"Computer\" (system audio/remote speaker) and attribute the expressed points to the correct speaker."
    },
    "actions": {
        "it": "Estrai tutti gli \"action items\" (le attività pratiche da svolgere, i responsabili e le scadenze se menzionate) in modo dettagliato. Specifica chiaramente se l'azione è assegnata a \"Tu\" o a \"Computer\" basandoti su quanto discusso nella trascrizione.",
        "en": "Extract all action items (practical tasks, assignees, and deadlines if mentioned) in a detailed manner. Clearly specify if the task is assigned to \"Tu\" or \"Computer\" based on the transcription discussion."
    },
    "default_instruction": {
        "it": "Analizza la seguente trascrizione audio e restituisci un riepilogo in formato Markdown con un titolo (#), punti chiave e azioni consigliate.",
        "en": "Analyze the following audio transcription and return a summary in Markdown format with a title (#), key points, and recommended actions."
    }
}


def load_prompts() -> dict[str, dict[str, str]]:
    """
    Load prompt templates from disk, merging with defaults for missing keys.
    """
    prompts_file = get_prompts_file()
    if not prompts_file.exists():
        return DEFAULT_PROMPTS.copy()
    try:
        with open(prompts_file, "r", encoding="utf-8") as f:
            data = json.load(f)
        # Deep merge/update defaults with custom values
        merged = DEFAULT_PROMPTS.copy()
        for key, val in data.items():
            if isinstance(val, dict):
                if key not in merged:
                    merged[key] = {}
                merged[key].update(val)
        return merged
    except Exception:
        return DEFAULT_PROMPTS.copy()


def save_prompts(prompts: dict[str, dict[str, str]]) -> None:
    """
    Persist custom prompt templates to disk atomically.
    """
    prompts_file = get_prompts_file()
    prompts_file.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary_path = tempfile.mkstemp(prefix=f".{prompts_file.name}.", suffix=".tmp", dir=prompts_file.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(prompts, f, indent=2, ensure_ascii=False)
            f.flush()
            os.fsync(f.fileno())
        os.replace(temporary_path, prompts_file)
    except Exception:
        try:
            os.unlink(temporary_path)
        except FileNotFoundError:
            pass
        raise
