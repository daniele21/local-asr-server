# Cloud ASR and Analysis Provider Implementation Plan

Ultimo aggiornamento: 2026-07-10.

## 1. Goal

ClosedRoom should keep the local-first workflow as the default, while allowing
users to opt in to cloud providers for:

- ASR transcription through Speechmatics Batch API;
- analysis through Gemini, with explicit Gemini model selection.

The implementation must preserve the existing meeting workflow:

```text
record mic/system audio
  -> transcribe each available track
  -> merge track segments into one transcript
  -> run analysis jobs/pipelines
  -> persist transcript, source tracks, jobs and analysis runs locally
```

The main architectural change is moving ASR from "model string decides runtime"
to an explicit provider contract. The same pattern already exists in partial
form for LLM analysis through `LLMService`.

## 2. Current Repo Context

| Area | Current owner | Relevant behavior |
| --- | --- | --- |
| ASR model routing | `src/local_asr_server/asr_models.py` | Chooses `mlx-whisper` or `mlx-audio-nemotron` from the selected model string. |
| ASR execution/cache | `src/local_asr_server/transcriber.py` | Runs local ASR, generates cache keys and normalizes Whisper/Nemotron output. |
| Transcription orchestration | `src/local_asr_server/routers/transcriptions.py`, `services/transcription_service.py` | Upload/path/recording routes call the transcription service and save through `TranscriptionStore`. |
| Track merge | `src/local_asr_server/routers/helpers.py` | `_merge_track_transcriptions()` merges mic/system results and annotates segments with `track_id`, `source` and `speaker_label`. |
| Settings | `src/local_asr_server/settings.py`, `schemas.py`, `routers/system.py` | Stores dirs, local ASR defaults, Gemini key, LLM provider and local LLM settings. |
| Analysis providers | `src/local_asr_server/llm.py` | Provider factory supports `mock`, `gemini`, `nemotron_local`, `voxtral_local`; Gemini model is currently hardcoded. |
| Analysis jobs/runs | `src/local_asr_server/analysis_jobs.py`, `catalog.py` | Persistent jobs and `analysis_runs` already track provider, model and run status. |
| React UI contracts | `frontend/src/api/config.ts`, `apiClient.ts`, `SettingsPage.tsx`, `TranscriptionPage.tsx`, `AnalysisPage.tsx` | Model/provider option catalogs and request payloads live here. |

## 3. Design Principles

1. Keep local ASR and local analysis as the default.
2. Make provider selection explicit: provider first, model second.
3. Keep cloud credentials write-only in API responses.
4. Store enough provider metadata to audit how a transcript or analysis was
   produced.
5. Do not fork the meeting transcription flow for Speechmatics. Recorded mic
   and system tracks should use the same per-track loop and merge function.
6. Cache by all output-changing options, including provider, region, model,
   language, diarization and prompt/configuration values.
7. Keep SDK imports lazy so tests and local-only installs remain usable without
   Speechmatics dependencies installed.

## 4. Target Architecture

```text
Transcription routes / jobs
  -> TranscriptionService
     -> ASRService
        -> ASRProviderFactory
           -> LocalMlxASRProvider
              -> Whisper
              -> Nemotron ASR
           -> SpeechmaticsBatchASRProvider

Analysis routes / jobs
  -> AnalysisJobManager
  -> AnalysisService
     -> LLMService
        -> MockProvider
        -> GeminiProvider(model=...)
        -> NemotronLocalProvider
        -> VoxtralLocalProvider
```

Recommended new files:

```text
src/local_asr_server/asr_provider.py
src/local_asr_server/speechmatics_asr.py
```

Avoid adding a large package until there are enough providers to justify it.
`asr_models.py` should remain the source of truth for local model/backends and
language compatibility.

## 5. ASR Provider Contract

Introduce a small provider interface with one synchronous method. The existing
job system already runs transcription in worker threads, so the provider can
block internally.

```python
class ASRProvider:
    name: str
    backend: str

    def transcribe(self, request: ASRRequest) -> dict[str, Any]:
        ...
```

Suggested request object:

```python
@dataclass(frozen=True)
class ASRRequest:
    audio_path: Path
    provider: str
    model: str
    language: str | None
    task: str
    word_timestamps: bool
    initial_prompt: str | None
    temperature: float | None
    condition_on_previous_text: bool
    verbose: bool | None
    vad_guided: bool
    vad_post_filter: bool
    options: dict[str, Any]
```

The provider result must keep the existing public shape:

```json
{
  "text": "...",
  "segments": [],
  "language": "it",
  "model": "enhanced",
  "backend": "speechmatics-batch",
  "provider": "speechmatics",
  "metadata": {}
}
```

This lets upload, path, recording and recording-job routes share the same
normalization and persistence behavior.

## 6. Speechmatics Integration

### 6.1 Dependency

Add Speechmatics as an optional extra first:

```toml
[project.optional-dependencies]
speechmatics = [
  "speechmatics-batch>=0.5.0",
]
```

Implementation note: the original draft targeted `speechmatics-batch>=0.6.0`,
but the resolver currently finds `speechmatics-batch` up to `0.5.0` on PyPI.
The MVP extra therefore uses `>=0.5.0` so the optional dependency remains
installable.

Do not make it a hard dependency until packaging cost and PyInstaller behavior
are verified. If the user selects Speechmatics without the package installed,
return a clear `400` with install guidance.

### 6.2 Settings

Add settings keys:

```python
"asr_provider": "local",
"speechmatics_api_key": "",
"speechmatics_region": "us1",
"speechmatics_model": "standard",
"speechmatics_diarization": "none",
"speechmatics_timeout_seconds": 1800,
"speechmatics_poll_interval_seconds": 2.0,
```

Valid values should be centralized:

```python
ASR_PROVIDERS = ["local", "speechmatics"]
SPEECHMATICS_REGIONS = ["eu1", "us1", "au1"]
SPEECHMATICS_MODELS = ["standard", "enhanced", "melia-1"]
SPEECHMATICS_DIARIZATION_MODES = ["none", "speaker"]
```

`GET /v1/settings` must not return `speechmatics_api_key`. It should return:

```json
{
  "speechmatics_api_key_configured": true
}
```

Future hardening: move `gemini_api_key` and `speechmatics_api_key` into macOS
Keychain via a `secrets.py` owner. The MVP can follow the existing Gemini
pattern for consistency.

### 6.3 Region and Endpoint

Map region to Batch API base URL in one owner:

```python
SPEECHMATICS_BATCH_URLS = {
    "eu1": "https://eu1.asr.api.speechmatics.com/v2",
    "us1": "https://us1.asr.api.speechmatics.com/v2",
    "au1": "https://au1.asr.api.speechmatics.com/v2",
}
```

If using the SDK connection config, pass the resolved URL rather than scattering
endpoint strings.

### 6.4 Per-Track Recording Flow

Keep the existing loop:

```text
for each transcribable track:
  skip near-silent local track if applicable
  transcribe track with selected ASR provider
merge track results
save transcript
maybe start analysis pipeline
```

For Speechmatics, each track should be a separate Batch job for MVP. This keeps
ClosedRoom's existing track labels authoritative:

- `mic` -> user/local speaker;
- `system` -> computer/remote speakers;
- `mixed` -> legacy fallback.

Do not enable Speechmatics channel diarization in the MVP because ClosedRoom
stores mic/system as separate files, not a single multichannel file. Channel
diarization can be added later if the native capture helper produces a
multichannel artifact.

### 6.5 Diarization

Speechmatics speaker diarization should be optional and off by default:

```python
TranscriptionConfig(
    language=resolved_language,
    model=speechmatics_model,
    diarization="speaker" if enabled else "none",
)
```

When enabled, preserve Speechmatics speaker labels on each segment:

```json
{
  "speaker": "S1",
  "speaker_label": "Microphone",
  "track_id": "mic"
}
```

Do not replace ClosedRoom track labels with Speechmatics speaker labels. They
answer different questions.

### 6.6 Result Normalization

Speechmatics JSON should be normalized into ClosedRoom segments:

```json
{
  "id": 0,
  "start": 1.23,
  "end": 2.34,
  "text": "Hello",
  "confidence": 0.94,
  "speaker": "S1",
  "language": "en"
}
```

Suggested algorithm:

1. Read `results`.
2. Group word and punctuation items into sentence-like segments.
3. Start a new segment when:
   - speaker changes;
   - channel changes;
   - punctuation is end-of-sentence;
   - gap between words exceeds a small threshold, for example 1.2 seconds.
4. Keep raw provider metadata under `metadata.speechmatics`.
5. Never write the API key, headers or full request object to metadata.

## 7. Cache and Persistence Changes

### 7.1 Cache Key

Extend ASR cache key with:

```json
{
  "provider": "speechmatics",
  "backend": "speechmatics-batch",
  "provider_model": "enhanced",
  "region": "us1",
  "diarization": "speaker"
}
```

For cloud providers, include a hash of the credential only if provider access
can change output. Usually it should not be needed for ASR output correctness,
but it can be useful to avoid cross-account surprises. Never store the raw key.

### 7.2 Catalog

Add first-class columns to `transcriptions`:

```sql
asr_provider TEXT
backend TEXT
provider_options TEXT
```

If a migration is too broad for the first pass, store these in `stats` and
`source_tracks[].transcription_metadata`, but the final target should be
queryable catalog columns.

Update JSON export metadata:

```json
{
  "asr_provider": "speechmatics",
  "backend": "speechmatics-batch",
  "model": "enhanced"
}
```

## 8. API Contract Changes

### 8.1 Existing Endpoints

Extend these routes without replacing them:

- `POST /v1/audio/transcriptions`
- `POST /v1/audio/transcriptions/path`
- `POST /v1/recordings/{recording_id}/transcriptions`
- `POST /v1/recordings/{recording_id}/transcription-jobs`
- `GET /v1/transcription/source-data`
- `GET/POST /v1/settings`

Add request fields:

```python
asr_provider: str | None = None
speechmatics_model: str | None = None
speechmatics_diarization: str | None = None
```

Provider resolution:

```text
request.asr_provider
  -> settings.asr_provider
  -> "local"
```

Model resolution:

```text
local provider:
  request.model -> settings.default_model -> app.state.default_model

speechmatics provider:
  request.speechmatics_model -> settings.speechmatics_model -> "standard"
```

### 8.2 Capabilities Endpoint

Add a read-only endpoint so the frontend can render provider choices without
duplicating backend catalogs:

```text
GET /v1/asr/providers
```

Suggested response:

```json
{
  "default_provider": "local",
  "providers": [
    {
      "id": "local",
      "label": "Local ASR",
      "models": ["mlx-community/whisper-large-v3-turbo", "mlx-community/nemotron-3.5-asr-streaming-0.6b"],
      "requires_api_key": false
    },
    {
      "id": "speechmatics",
      "label": "Speechmatics",
      "models": ["standard", "enhanced", "melia-1"],
      "regions": ["eu1", "us1", "au1"],
      "requires_api_key": true,
      "api_key_configured": false
    }
  ]
}
```

The frontend can keep static fallback catalogs, but should prefer this endpoint.

## 9. Gemini Model Selection

### 9.1 Settings

Add:

```python
"gemini_model": "gemini-3.5-flash"
```

Recommended catalog:

```python
GEMINI_MODELS = [
    "gemini-3.5-flash",
    "gemini-3.1-pro-preview",
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "custom",
]
```

Reasoning:

- `gemini-3.5-flash` is the stable current Flash candidate in Google docs as
  of 2026-07-10.
- `gemini-3.1-pro-preview` is useful for a higher-quality preview option.
- Keep older 2.5 options for compatibility with existing keys/projects.
- Allow a custom model ID because Gemini model availability changes.

### 9.2 Provider

Change:

```python
GeminiProvider(api_key)
```

to:

```python
GeminiProvider(api_key, model)
```

Build the endpoint from the model:

```python
f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
```

MVP can keep the existing `generateContent` REST path. A later pass can migrate
Gemini to the newer Interactions API if the product needs conversation state,
newer reasoning controls or streaming.

### 9.3 Analysis Metadata and Cache

Update `AnalysisService` and `AnalysisJobManager` so:

- `analysis_runs.model` stores the actual Gemini model for Gemini runs;
- analysis cache key includes `gemini_model`;
- `llm_options` includes provider-specific model settings;
- no API key is stored, only an optional credential hash already used by the
  cache.

## 10. Frontend Changes

### 10.1 Settings Page

In `frontend/src/pages/SettingsPage.tsx`:

- add ASR provider segmented/select control;
- show local ASR model settings only when `asr_provider === "local"`;
- show Speechmatics key, region, model and diarization when
  `asr_provider === "speechmatics"`;
- show `speechmatics_api_key_configured` state without echoing the secret;
- add Gemini model picker under Gemini analysis provider;
- keep local LLM controls only for local providers.

Update types in `frontend/src/api/apiClient.ts`.

Move option lists to `frontend/src/api/config.ts` or, preferably, consume
`GET /v1/asr/providers` and keep `config.ts` as fallback.

### 10.2 Transcription Page

In `TranscriptionPage.tsx` and `ConfigureStep.tsx`:

- show provider selector;
- adjust model selector based on provider;
- skip local model cache check for Speechmatics;
- send `asr_provider` and provider options to upload and recording job payloads;
- keep recording job path as the default for recorded meetings because it
  handles mic/system tracks correctly.

### 10.3 Analysis Page

In `AnalysisPage.tsx`:

- show Gemini model picker when provider is `gemini`;
- include `gemini_model` in settings update and analysis payloads if request
  overrides are supported.

## 11. Error Handling and Operational Behavior

Speechmatics errors should be mapped to actionable HTTP errors:

| Case | HTTP | Message |
| --- | --- | --- |
| Missing API key | 400 | Speechmatics API key is not configured. |
| SDK missing | 400 | Install the Speechmatics optional dependency. |
| Auth failed | 401 | Speechmatics rejected the API key. |
| Rate limited | 429 | Speechmatics rate limit reached. Retry later. |
| Timeout | 504 | Speechmatics job timed out. |
| Job rejected | 502 | Speechmatics rejected the audio/job config. |

Retries:

- retry transient network/status polling failures with bounded backoff;
- do not retry rejected jobs automatically;
- record external job IDs in metadata for debugging, but never credentials.

Cancellation:

- current local transcription jobs only support cooperative cancel between
  track transcriptions;
- Speechmatics MVP should stop polling when cancel is requested;
- deleting the remote Speechmatics job can be a later enhancement if the SDK
  supports it reliably.

## 12. Implementation Phases

| Phase | Scope | Files | Verification |
| --- | --- | --- | --- |
| 0 | Add centralized catalogs and settings fields. | `settings.py`, `schemas.py`, `routers/system.py`, `frontend/src/api/apiClient.ts`, `frontend/src/api/config.ts` | Settings tests, frontend typecheck/build. |
| 1 | Add ASR provider abstraction around existing local path. | `asr_provider.py`, `transcriber.py`, `services/transcription_service.py`, `routers/transcriptions.py` | Existing ASR tests must still pass; no real model download. |
| 2 | Add Speechmatics provider with mocked SDK. | `speechmatics_asr.py`, optional dependency, unit tests | Fake SDK tests for submit/wait/result normalization. |
| 3 | Wire Speechmatics into upload/path/recording jobs. | `routers/transcriptions.py`, `TranscriptionJobManager` payloads | Test two-track recording with fake provider; cache key tests. |
| 4 | Persist provider/backend metadata. | `catalog.py`, `transcriptions.py` | Catalog migration tests and JSON export checks. |
| 5 | Update React settings and transcription UI. | `SettingsPage.tsx`, `TranscriptionPage.tsx`, `ConfigureStep.tsx` | `cd frontend && npm run build`; manual provider switch. |
| 6 | Add Gemini model selection. | `llm.py`, `analysis_service.py`, `analysis_jobs.py`, settings/UI | Gemini mocked API tests verify selected model URL and run metadata. |
| 7 | Documentation and packaging pass. | `docs/features.md`, `README.md`, `pyproject.toml`, `ClosedRoom.spec` if needed | Full targeted test plan and optional bundle check. |

## 13. Test Plan

Backend unit tests:

```bash
PYTHONPATH=src python -m unittest discover -s test -p 'test_caching.py' -v
PYTHONPATH=src python -m unittest discover -s test -p 'test_recording_api.py' -v
PYTHONPATH=src python -m unittest discover -s test -p 'test_analysis_api.py' -v
```

New tests to add:

- `test_asr_provider.py`
  - local provider preserves current result shape;
  - provider resolver defaults to local;
  - invalid provider is rejected.
- `test_speechmatics_asr.py`
  - missing API key error;
  - SDK missing error;
  - fake Batch result normalizes words/punctuation into segments;
  - diarization labels are preserved;
  - raw credentials are absent from metadata.
- `test_transcription_provider_cache.py`
  - cache key changes by provider, region, model and diarization.
- `test_settings.py`
  - `speechmatics_api_key` is write-only;
  - `speechmatics_api_key_configured` is returned.
- Extend `test_analysis_api.py`
  - Gemini provider uses selected `gemini_model`;
  - `analysis_runs.model` stores selected model.

Frontend:

```bash
cd frontend && npm run build
```

Manual checks:

1. Select local ASR and transcribe a recorded meeting.
2. Select Speechmatics with no key and verify clear validation.
3. Add Speechmatics key, transcribe a recording with mic/system tracks and
   verify both source tracks appear in the saved transcript.
4. Select Gemini, choose a model, run analysis and verify run metadata.

Do not use a real Whisper/Nemotron transcription as a quick test because it can
download large models.

## 14. Documentation Updates Required During Implementation

Update `docs/features.md` when code changes land:

- `Trascrizione audio`: mention explicit ASR provider, Speechmatics cloud
  option, provider metadata and cache keys.
- `Job trascrizione locale`: rename or clarify because jobs can call cloud ASR
  while still being local ClosedRoom jobs.
- `Analisi AI`: mention Gemini model selection.
- `Impostazioni`: mention Speechmatics key masking and Gemini model setting.
- `Security & Privacy` docs: cloud opt-in sends audio/transcripts to selected
  third-party providers.

Update `README.md`:

- installation extra for Speechmatics;
- setup steps for Speechmatics API key;
- privacy implications;
- examples for selecting ASR provider and Gemini model.

## 15. Non-Goals for MVP

- Realtime Speechmatics websocket transcription.
- Browser-side temporary Speechmatics keys.
- Remote job deletion on cancel.
- Speechmatics channel diarization from a single multichannel file.
- Keychain migration for secrets.
- Gemini Interactions API migration.
- Cloud provider cost estimation UI.

## 16. External References

- Speechmatics Batch SDK README:
  https://github.com/speechmatics/speechmatics-python-sdk/tree/main/sdk/batch
- Speechmatics authentication and endpoints:
  https://docs.speechmatics.com/get-started/authentication
- Speechmatics Batch quickstart:
  https://docs.speechmatics.com/speech-to-text/batch/quickstart
- Speechmatics Batch diarization:
  https://docs.speechmatics.com/speech-to-text/batch/batch-diarization
- Speechmatics Batch output schema:
  https://docs.speechmatics.com/speech-to-text/batch/output
- Google Gemini model catalog:
  https://ai.google.dev/gemini-api/docs/models
- Google Gemini text generation and Interactions API examples:
  https://ai.google.dev/gemini-api/docs/text-generation
