from __future__ import annotations

from fastapi import APIRouter, HTTPException

from local_asr_server.schemas import SettingsRequest
from local_asr_server.services.settings_service import InvalidSettings, SettingsService


router = APIRouter()


@router.get("/v1/settings")
def get_settings():
    return SettingsService().get_public()


@router.post("/v1/settings")
def update_settings(body: SettingsRequest):
    try:
        return SettingsService().update(body)
    except InvalidSettings as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except OSError as exc:
        raise HTTPException(status_code=507, detail="Unable to persist settings") from exc
