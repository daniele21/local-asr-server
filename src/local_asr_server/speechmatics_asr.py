from __future__ import annotations

import asyncio
import threading
from pathlib import Path
from typing import Any

from local_asr_server.env import get_env_var
from local_asr_server.asr_provider import (
    ASR_PROVIDER_SPEECHMATICS,
    ASRRequest,
    DEFAULT_SPEECHMATICS_DIARIZATION,
    DEFAULT_SPEECHMATICS_MODEL,
    DEFAULT_SPEECHMATICS_REGION,
    SPEECHMATICS_BACKEND,
    SPEECHMATICS_REGION_URLS,
)


class SpeechmaticsBatchASRProvider:
    def transcribe(self, request: ASRRequest) -> dict[str, Any]:
        return _run_coro_sync(self._transcribe_async(request))

    async def _transcribe_async(self, request: ASRRequest) -> dict[str, Any]:
        try:
            from speechmatics.batch import AsyncClient, JobConfig, JobType, Model, TranscriptionConfig
        except ModuleNotFoundError as exc:
            raise RuntimeError(
                "Speechmatics SDK not installed. Install optional dependency with: "
                "uv pip install -e '.[speechmatics]'"
            ) from exc

        options = request.provider_options or {}
        api_key = options.get("api_key") or get_env_var("SPEECHMATICS_API_KEY")
        if not api_key:
            raise ValueError("Speechmatics API key is missing. Configure it in Settings first.")

        region = options.get("region") or DEFAULT_SPEECHMATICS_REGION
        url = options.get("url") or get_env_var("SPEECHMATICS_BATCH_URL") or SPEECHMATICS_REGION_URLS.get(region)
        if not url:
            raise ValueError(f"Unsupported Speechmatics region: {region}")

        timeout = _float_or_none(options.get("timeout_seconds")) or 900.0
        polling_interval = _float_or_none(options.get("poll_interval_seconds")) or 5.0
        speechmatics_model = options.get("speechmatics_model") or DEFAULT_SPEECHMATICS_MODEL
        diarization = options.get("speechmatics_diarization") or DEFAULT_SPEECHMATICS_DIARIZATION

        client = AsyncClient(api_key=api_key, url=url)
        transcription_config = _build_transcription_config(
            TranscriptionConfig,
            language=request.language,
            model=_model_enum(Model, speechmatics_model),
            diarization=diarization,
        )
        job_config = JobConfig(type=JobType.TRANSCRIPTION, transcription_config=transcription_config)
        raw_result = await client.transcribe(
            str(request.audio_path),
            config=job_config,
            timeout=timeout,
            polling_interval=polling_interval,
        )
        return _normalize_speechmatics_result(
            raw_result,
            language=request.language,
            model=speechmatics_model,
            region=region,
            diarization=diarization,
        )


def _run_coro_sync(coro):
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(coro)

    result: dict[str, Any] = {}
    error: list[BaseException] = []

    def runner() -> None:
        try:
            result["value"] = asyncio.run(coro)
        except BaseException as exc:
            error.append(exc)

    thread = threading.Thread(target=runner, daemon=True)
    thread.start()
    thread.join()
    if error:
        raise error[0]
    return result.get("value")


def _model_enum(model_cls: Any, model: str) -> Any:
    for item in model_cls:
        if getattr(item, "value", None) == model:
            return item
    return model


def _build_transcription_config(config_cls: Any, *, language: str | None, model: Any, diarization: str) -> Any:
    kwargs: dict[str, Any] = {"language": language or "en", "model": model}
    if diarization and diarization != "none":
        kwargs["diarization"] = diarization
    try:
        return config_cls(**kwargs)
    except TypeError:
        kwargs.pop("diarization", None)
        return config_cls(**kwargs)


def _normalize_speechmatics_result(
    result: Any,
    *,
    language: str | None,
    model: str,
    region: str,
    diarization: str,
) -> dict[str, Any]:
    raw = _to_plain_dict(result)
    text = (
        raw.get("transcript_text")
        or raw.get("text")
        or raw.get("transcript", {}).get("text")
        or getattr(result, "transcript_text", "")
        or ""
    )
    raw_results = raw.get("results") or raw.get("transcript", {}).get("results") or []
    segments = _segments_from_results(raw_results)
    if not text and segments:
        text = " ".join((segment.get("text") or "").strip() for segment in segments).strip()
    return {
        "text": text,
        "segments": segments,
        "language": raw.get("language") or language,
        "model": model,
        "backend": SPEECHMATICS_BACKEND,
        "provider": ASR_PROVIDER_SPEECHMATICS,
        "asr_provider": ASR_PROVIDER_SPEECHMATICS,
        "provider_options": {
            "speechmatics_model": model,
            "speechmatics_region": region,
            "speechmatics_diarization": diarization,
        },
        "metadata": {
            "asr_provider": ASR_PROVIDER_SPEECHMATICS,
            "backend": SPEECHMATICS_BACKEND,
            "speechmatics_model": model,
            "speechmatics_region": region,
            "speechmatics_diarization": diarization,
            "job_id": raw.get("job", {}).get("id") or raw.get("job_id") or raw.get("id"),
        },
    }


def _segments_from_results(results: list[Any]) -> list[dict[str, Any]]:
    segments: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None
    for item in results or []:
        data = _to_plain_dict(item)
        alternatives = data.get("alternatives") or []
        alt = _to_plain_dict(alternatives[0]) if alternatives else {}
        content = alt.get("content") or data.get("content") or ""
        if not content:
            continue
        item_type = data.get("type") or alt.get("type")
        start = _float_or_none(data.get("start_time") or data.get("start"))
        end = _float_or_none(data.get("end_time") or data.get("end"))
        speaker = alt.get("speaker") or data.get("speaker")
        if item_type == "punctuation" and current is not None:
            current["text"] = f"{current['text']}{content}"
            continue
        if current is None:
            current = {
                "id": len(segments),
                "start": start or 0.0,
                "end": end or start or 0.0,
                "text": content,
            }
            if speaker:
                current["provider_speaker"] = speaker
            continue
        same_speaker = (current.get("provider_speaker") or None) == (speaker or None)
        if same_speaker and start is not None and float(start) - float(current.get("end") or 0.0) <= 1.0:
            current["text"] = f"{current['text']} {content}".strip()
            current["end"] = end or start or current.get("end", 0.0)
        else:
            segments.append(current)
            current = {
                "id": len(segments),
                "start": start or 0.0,
                "end": end or start or 0.0,
                "text": content,
            }
            if speaker:
                current["provider_speaker"] = speaker
    if current is not None:
        segments.append(current)
    return segments


def _to_plain_dict(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    for attr in ("to_dict", "model_dump", "dict"):
        method = getattr(value, attr, None)
        if callable(method):
            try:
                data = method()
                if isinstance(data, dict):
                    return data
            except Exception:
                pass
    if hasattr(value, "__dict__"):
        return {key: val for key, val in vars(value).items() if not key.startswith("_")}
    return {}


def _float_or_none(value: Any) -> float | None:
    try:
        if value is None or value == "":
            return None
        return float(value)
    except (TypeError, ValueError):
        return None
