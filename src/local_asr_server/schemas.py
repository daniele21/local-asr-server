from __future__ import annotations

from typing import Optional
from pydantic import BaseModel

from local_asr_server.transcriber import VAD_GUIDED_DEFAULT

class AnalysisRequest(BaseModel):
    transcription_id: Optional[str] = None
    recording_id: Optional[str] = None
    text: Optional[str] = None
    gemini_api_key: Optional[str] = None
    llm_provider: Optional[str] = None
    audio_task: Optional[str] = "analysis"
    question: Optional[str] = None
    prompt: Optional[str] = None

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
    vad_guided: bool = VAD_GUIDED_DEFAULT

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
    # All fields are optional to support partial updates (e.g. only updating
    # the LLM provider without touching directory settings).
    transcriptions_dir: Optional[str] = None
    recordings_dir: Optional[str] = None
    gemini_api_key: Optional[str] = None
    llm_provider: Optional[str] = None
    local_llm_mode: Optional[str] = None
    local_llm_url: Optional[str] = None
    default_model: Optional[str] = None
    default_language: Optional[str] = None
    default_task: Optional[str] = None
    default_temperature: Optional[str] = None
    default_word_timestamps: Optional[bool] = None
    default_condition_on_previous: Optional[bool] = None
    local_llm_model: Optional[str] = None
    local_llm_quality_preset: Optional[str] = None
    local_llm_temperature: Optional[float] = None
    local_llm_reasoning: Optional[str] = None
    local_llm_max_output_tokens: Optional[int] = None
    local_llm_json_mode: Optional[bool] = None
    local_llm_model_path: Optional[str] = None
    local_llm_model_paths: Optional[dict[str, str]] = None

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
    vad_guided: bool = VAD_GUIDED_DEFAULT

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
