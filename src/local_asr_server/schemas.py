from __future__ import annotations

from typing import Optional
from pydantic import BaseModel

class AnalysisRequest(BaseModel):
    transcription_id: Optional[str] = None
    text: Optional[str] = None
    gemini_api_key: Optional[str] = None
    llm_provider: Optional[str] = None

class TranscribePathRequest(BaseModel):
    file: str
    model: Optional[str] = None
    language: Optional[str] = "it"
    task: str = "transcribe"
    response_format: str = "json"
    word_timestamps: bool = False
    initial_prompt: Optional[str] = None
    temperature: Optional[float] = None
    condition_on_previous_text: bool = True
    verbose: Optional[bool] = None

class CreateRecordingRequest(BaseModel):
    title: Optional[str] = None
    project_name: Optional[str] = ""
    mime_type: str = "audio/webm;codecs=opus"
    model: Optional[str] = None
    language: Optional[str] = "it"
    capture_mode: Optional[str] = "legacy_mixed"
    capture_backend: Optional[str] = "browser"

class UpdateRecordingRequest(BaseModel):
    title: Optional[str] = None
    project_name: Optional[str] = None

class SettingsRequest(BaseModel):
    transcriptions_dir: str
    recordings_dir: Optional[str] = ""
    gemini_api_key: Optional[str] = ""
    llm_provider: Optional[str] = "mock"
    default_model: Optional[str] = ""
    default_language: Optional[str] = "it"
    default_task: Optional[str] = "transcribe"
    default_temperature: Optional[str] = ""
    default_word_timestamps: Optional[bool] = False
    default_condition_on_previous: Optional[bool] = True

class MergeTranscriptionsRequest(BaseModel):
    transcription_ids: list[str]
    title: Optional[str] = None

class TranscribeRecordingRequest(BaseModel):
    model: Optional[str] = None
    language: Optional[str] = "it"
    task: str = "transcribe"
    response_format: str = "verbose_json"
    word_timestamps: bool = False
    initial_prompt: Optional[str] = None
    temperature: Optional[float] = None
    condition_on_previous_text: bool = True
    verbose: Optional[bool] = None

class OverlayRequest(BaseModel):
    show: bool

class OverlayResizeRequest(BaseModel):
    width: int
    height: int


class CaptureStartRequest(BaseModel):
    mode: str = "both"


class CaptureEnsurePermissionsRequest(BaseModel):
    mode: str = "both"

class TranscriptionJobRequest(TranscribeRecordingRequest):
    pass
