# ClosedRoom / local-asr-server

Local-first meeting intelligence workspace for recording, transcribing, analyzing, and remembering everything that happens in meetings.

`local-asr-server` is the local backend behind **ClosedRoom**: a private meeting workspace designed to help you keep track of what was discussed, what was decided, what needs to be done, and how projects evolve over time.

The goal of this project is simple:

> Never lose important meeting context again.

ClosedRoom lets you:

* record meetings locally;
* transcribe audio on-device;
* extract summaries, decisions, action items, risks, and project updates;
* browse meeting history by day, project, and individual meeting;
* keep a local operational memory of your work without sending sensitive meeting data to cloud APIs.

This project was built as an experiment in **fully local meeting intelligence**, using:

* **Nemotron ASR** for local speech-to-text transcription;
* **Nemotron Nano 4B** for local meeting analysis;
* [`local-llm-server`](https://github.com/daniele21/local-llm-server) as the managed local LLM runtime used by ClosedRoom for analysis.

---

## Interactive Demo & UI Gallery

ClosedRoom includes a local web workspace for managing recordings, transcriptions, analyses, projects, and demo data.

### Suggested UI Gallery

Add screenshots or videos under `docs/assets/` and update the paths below.

<table width="100%">
  <tr>
    <td width="50%" valign="top">
      <h4>1. Today Workspace</h4>
      <p>See what happened in the selected period: meetings, actions, decisions, risks, and digest.</p>
      <img src="docs/assets/0.home.png" alt="Today Workspace" width="100%"/>
    </td>
    <td width="50%" valign="top">
      <h4>2. Project Workspace</h4>
      <p>Track the status of a project across multiple meetings without rereading raw transcripts.</p>
      <img src="docs/assets/6.project-analysis.png" alt="Project Workspace" width="100%"/>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <h4>3. Meeting Detail</h4>
      <p>Open a single meeting, listen to the audio, read the transcript, and run structured analysis pipelines.</p>
      <img src="docs/assets/5.meeting-analysis.png" alt="Meeting Detail" width="100%"/>
    </td>
    <td width="50%" valign="top">
      <h4>4. Demo Mode & Guided Tour</h4>
      <p>Explore the value of the workspace using local synthetic data without recording a real meeting.</p>
      <img src="docs/assets/3.daily-recap.png" alt="Demo Mode and Guided Tour" width="100%"/>
    </td>
  </tr>
</table>

---

## Table of Contents

1. [Why This Project Exists](#1-why-this-project-exists)
2. [Core Features](#2-core-features)
3. [Architecture & Ecosystem Integration](#3-architecture--ecosystem-integration)
4. [Requirements & Installation](#4-requirements--installation)
5. [Quick Start](#5-quick-start)
6. [Recording Meetings](#6-recording-meetings)
7. [Transcription & Meeting Intelligence](#7-transcription--meeting-intelligence)
8. [Local LLM Analysis](#8-local-llm-analysis)
9. [Configuration](#9-configuration)
10. [HTTP API Reference](#10-http-api-reference)
11. [Security & Privacy](#11-security--privacy)
12. [Development & Build](#12-development--build)
13. [Project Status & Roadmap](#13-project-status--roadmap)
14. [License](#14-license)

---

## 1. Why This Project Exists

Meetings contain a large amount of operational knowledge:

* decisions;
* tasks;
* risks;
* blockers;
* open questions;
* project updates;
* commitments made by different people.

The problem is that this knowledge often disappears inside raw transcripts, fragmented notes, chat messages, or memory.

ClosedRoom is designed to turn meetings into a **local operational memory**.

The project is driven by a few principles:

* **Local-first by design**: meeting audio, transcripts, prompts, and analysis results stay on the user's machine.
* **Meeting intelligence, not just transcription**: the goal is not only to produce text, but to extract what matters.
* **Project memory over isolated meetings**: a single meeting is useful, but the real value comes from understanding what changes across multiple meetings.
* **Small local models are enough for many workflows**: tasks such as summarization, action item extraction, decision logging, and risk detection can be handled by compact local models.
* **No recurring API cost**: the default architecture is designed to avoid token-based cloud billing.
* **Progressive disclosure**: the user should see the useful output first, while technical details remain available only when needed.

---

## 2. Core Features

### Local Recording

* Record meetings directly from the local web UI.
* Capture microphone audio and, when available, computer/system audio.
* Save audio progressively to avoid losing the session if the tab or process is interrupted.
* Support recoverable partial recordings.

### Local Transcription

* Transcribe uploaded files or locally recorded meetings.
* Support MLX Whisper models.
* Support Nemotron ASR through `mlx-audio`.
* Store transcripts locally and reuse cached results when the same audio/options are used again.

### Meeting Workspace

* View each meeting as a workspace.
* Listen to the original audio.
* Read the transcript.
* Run fast or deep analysis pipelines, choosing provider, model, and local LLM setup before each run.
* Inspect analysis history and job status.

### Today Workspace

* See meetings for today, recent days, the current week, or a custom period.
* Review open actions, recent decisions, risks, blockers, and period digest.
* Avoid digging into every transcript manually.

### Project Workspace

* Group meetings by project.
* Track project status across multiple meetings.
* See project-level actions, decisions, risks, and updates.
* Generate a project situation from already extracted insights.

### Local LLM Analysis

* Use `local-llm-server` as the local reasoning layer.
* Run Nemotron Nano 4B locally for structured meeting analysis.
* Extract:

  * summaries;
  * action items;
  * decisions;
  * risks and blockers;
  * meeting minutes;
  * open questions;
  * project updates.

### Demo Mode

* Explore ClosedRoom using synthetic local data.
* Run the guided tour without recording a real meeting.
* Demo data is frontend-only and does not require real ASR or LLM jobs.

---

## 3. Architecture & Ecosystem Integration

For the complete system design, including high-level context, low-level module
responsibilities, data model, runtime flows, failure handling, security,
packaging, and extension rules, see
[`docs/architecture.md`](docs/architecture.md).

End-to-end readiness for the combined visual intelligence and speaker
diarization workflow is tracked in
[`docs/visual-diarization-e2e-readiness.md`](docs/visual-diarization-e2e-readiness.md).

ClosedRoom is composed of three main layers:

```text
[ ClosedRoom React UI ]
          │
          ▼
[ local-asr-server ]
          │
          ├── Recording / Audio Capture
          ├── Transcription Jobs
          ├── Meeting Catalog
          ├── Analysis Pipelines
          └── Local Runtime Service Management
          │
          ▼
[ local-llm-server ]
          │
          ▼
[ Local LLM Backends / Nemotron Nano 4B ]
```

### Transcription Layer

```text
[ Audio File / Meeting Recording ]
              │
              ▼
      [ local-asr-server ]
              │
              ▼
[ MLX Whisper / Nemotron ASR ]
              │
              ▼
        [ Local Transcript ]
```

### Analysis Layer

```text
[ Transcript / Meeting Context ]
              │
              ▼
      [ ClosedRoom Analysis Pipeline ]
              │
              ▼
        [ local-llm-server ]
              │
              ▼
       [ Nemotron Nano 4B ]
              │
              ▼
[ Summary / Actions / Decisions / Risks ]
```

### Why `local-llm-server` is used

ClosedRoom delegates local LLM serving to [`local-llm-server`](https://github.com/daniele21/local-llm-server).

This keeps the meeting application focused on product experience, while `local-llm-server` handles:

* model loading;
* backend selection;
* OpenAI-compatible inference;
* runtime lifecycle;
* local model configuration;
* reasoning/JSON mode;
* logs and diagnostics.

ClosedRoom persists its main rotating application log in
`~/Library/Logs/ClosedRoom/closedroom.log`. To inspect effective backends,
fallbacks and errors for a meeting from a terminal:

```bash
local-asr inspect-meeting <recording-id>
local-asr inspect-meeting <recording-id> --json
```

The same canonical report is available to the authenticated UI at
`GET /v1/meetings/<recording-id>/diagnostics`; it includes component outcomes,
job events, artifact presence and redacted log lines correlated to the meeting.

---

## 4. Requirements & Installation

### Requirements

* macOS recommended.
* Apple Silicon recommended for MLX-based models.
* Python `>= 3.10`.
* `ffmpeg`.
* Optional: `blackhole-2ch` for browser/system-audio fallback.
* ASR model, for example:

  * `mlx-community/whisper-large-v3-turbo`;
  * `mlx-community/nemotron-3.5-asr-streaming-0.6b`.
* Local LLM runtime:

  * [`local-llm-server`](https://github.com/daniele21/local-llm-server);
  * Nemotron Nano 4B / `nemotron-nano-4b` or compatible local model.
* Optional cloud providers:

  * Speechmatics Batch ASR, installed with the `speechmatics` extra;
  * Gemini API key, only when cloud analysis is selected.

### Install with setup script

```bash
./setup.sh
```

The setup script installs required local dependencies and prepares the application for local recording and transcription.

### Manual installation

```bash
# macOS system dependencies
brew install ffmpeg blackhole-2ch switchaudio-osx

# Python package
pip install -e .

# Check local setup
local-asr doctor
```

### Optional app dependencies

```bash
pip install -e ".[app]"
```

### Optional build dependencies

```bash
pip install -e ".[build]"
```

### Optional Speechmatics ASR dependency

Speechmatics is opt-in. Install the optional extra only when you want cloud ASR:

```bash
pip install -e ".[speechmatics]"
```

Then open Settings, choose `Speechmatics Batch` as ASR provider, configure the
API key, region, model and diarization mode. The default ASR provider remains
local MLX.

In development, ClosedRoom also reads a local `.env` file from the project root.
Use `SPEECHMATICS_API_KEY=...` or configure the same key from Settings.

---

## 5. Quick Start

### 1. Start ClosedRoom

```bash
local-asr serve \
  --model mlx-community/nemotron-3.5-asr-streaming-0.6b \
  --recordings-dir ~/Recordings/local-asr \
  --port 1236
```

Open:

```text
http://127.0.0.1:1236
```

### 2. Start in development mode

```bash
local-asr serve --reload
```

In development with reload, ClosedRoom uses a separate default port:

```text
http://127.0.0.1:1237
```

### 3. Start with a local downloaded model

```bash
local-asr serve \
  --model /Users/daniele/models/nemotron-asr \
  --recordings-dir ~/Recordings/local-asr \
  --port 1236
```

### 4. Use the Web UI

From the local web app you can:

1. choose speaker diarization, visual intelligence and the exact meeting window
   to observe from the Recording page;
2. record a meeting;
3. save the audio locally;
4. transcribe it;
5. open the meeting workspace;
6. run analysis;
7. review actions, decisions, risks, and project updates.

---

## 6. Recording Meetings

ClosedRoom records audio in chunks while the meeting is in progress.

When the user stops the recording, the application finalizes the audio and creates a meeting item in the local workspace.

A recording session is stored under:

```text
<recordings-dir>/<date>/<session-id>/
├── recording.webm      # mixed playback track
├── mic.webm            # local microphone track, when captured
├── system.webm         # computer audio track, when captured
├── metadata.json
├── speaker-diarization.json # optional FluidAudio speaker timeline
├── transcript.json
└── transcript.txt
```

### Native macOS Capture

On supported macOS versions, ClosedRoom can use a native helper for microphone and computer audio capture.

The native helper records:

* microphone audio through AVFoundation;
* computer/system audio through ScreenCaptureKit;
* separate source tracks;
* a mixed playback track.

### Local post-meeting speaker diarization

ClosedRoom can identify distinct speakers locally after a recording using
FluidAudio's offline Community-1 pipeline (Core ML segmentation, WeSpeaker
embeddings and VBx clustering). The Swift helper runs on Apple Silicon and
returns timestamped clusters such as `system:0` and `system:1`; ASR segments are
matched by temporal overlap. Provider-owned clusters, such as Speechmatics
`S1`/`S2`, are preserved rather than overwritten.

The feature is opt-in from the Recording page (and remains configurable in
Settings) and requires macOS 14+. FluidAudio is
compiled into the app bundle, while its Core ML models are downloaded on first
use under `~/Library/Application Support/ClosedRoom/models/fluidaudio-speaker-diarization/`.
A failure is recorded in `speaker-diarization.json` but does not fail the
transcription. When visual intelligence is also enabled, Qwen uses these local
clusters as the stable diarization source for conservative name attribution.

### Post-meeting visual intelligence foundation

ClosedRoom can stage timestamped JPEG frames while a recording is active and
analyze them with `qwen3-vl-4b` when the transcription job runs after the
meeting. Qwen produces visual identity evidence; it does not replace
diarization and does not use face recognition. Automatic names are applied only
to existing provider speaker clusters when the configured support thresholds
are met.

The feature is disabled by default. The Recording page exposes the toggle next
to diarization and, when enabled, lists the
shareable macOS windows and requires an explicit window selection; leaving the
selector disabled records no images. A separate ScreenCaptureKit stream samples
only that window at low frequency without changing the audio capture stream.
Staged frames are private temporary data in the recording directory and are
removed after processing, including failed Qwen runs. Only structured
observations and a compact summary persist.

The transcription result always shows the effective outcome of FluidAudio,
Qwen and speaker attribution. Missing frames, partial frame failures, runtime
errors and ASR/VAD fallbacks produce a persistent “completed with warnings”
panel with the requested backend, effective backend and reason; they are never
reported only as a green success toast.

Global shortcuts additionally require macOS Accessibility permission. If it is
missing, Settings shows an actionable warning and the app does not start the
keyboard listener; recording, transcription and visual intelligence are not
disabled by this permission.

For a repeatable development smoke test, start `local-llm-server` with the
existing LM Studio MLX model and then run the combined harness with a
two-speaker WAV and a JPEG containing one visible active-speaker label:

```bash
.venv/bin/local-llm serve \
  --model qwen3-vl-4b \
  --model-path ~/.lmstudio/models/lmstudio-community/Qwen3-VL-4B-Instruct-MLX-4bit \
  --host 127.0.0.1 --port 1245

.venv/bin/python scripts/smoke_visual_diarization_e2e.py \
  --audio /path/to/two-speakers.wav \
  --frame /path/to/active-speaker.jpg \
  --base-url http://127.0.0.1:1245 \
  --output-dir /private/tmp/closedroom-combo-e2e
```

The harness uses real FluidAudio and Qwen inference but deterministic timed ASR
segments, so it does not download or execute Whisper. It fails unless the
speaker mapping, persisted artifacts, catalog rows and visual staging cleanup
all pass.

The macOS bundle is built with Python 3.10 by default, matching the supported
MLX runtime used in development. Override it only for an explicit compatibility
test with `CLOSEDROOM_BUILD_PYTHON_VERSION`; selecting the newest interpreter
implicitly can produce a bundle that passes health checks but fails inside the
MLX-VLM generation thread.
The macOS dependency graph also pins `mlx 0.31.2`: a clean resolution to
`mlx 0.32.0` currently breaks GPU stream ownership in the frozen MLX-VLM worker.

### Browser + BlackHole Fallback

If native capture is unavailable, ClosedRoom can use browser recording with BlackHole compatibility.

One-time setup:

1. Install dependencies:

```bash
./setup.sh
```

or:

```bash
local-asr setup-audio
```

2. Create a Multi-Output Device in macOS Audio MIDI Setup.
3. Include both your output device and `BlackHole 2ch`.
4. Enable Drift Correction for BlackHole.
5. Run:

```bash
local-asr doctor
```

---

## 7. Transcription & Meeting Intelligence

ClosedRoom separates recording from transcription.

Stopping a recording does not block on ASR inference. Instead, the meeting is saved first, and transcription can be started from:

* Today workspace;
* meeting detail;
* import/transcription page;
* API endpoints.

### Transcribe uploaded audio

```bash
curl -c /tmp/closedroom.cookies http://127.0.0.1:1236/v1/session

curl -b /tmp/closedroom.cookies http://127.0.0.1:1236/v1/audio/transcriptions \
  -F "file=@/Users/daniele/Desktop/audio.mp3" \
  -F "language=it" \
  -F "response_format=verbose_json"
```

### Transcribe a local path

```bash
curl -c /tmp/closedroom.cookies http://127.0.0.1:1236/v1/session

curl -b /tmp/closedroom.cookies http://127.0.0.1:1236/v1/audio/transcriptions/path \
  -H "Content-Type: application/json" \
  -d '{
    "file": "/Users/daniele/Desktop/audio.mp3",
    "language": "it",
    "response_format": "verbose_json",
    "word_timestamps": false
  }'
```

### Text-only response

```bash
curl -c /tmp/closedroom.cookies http://127.0.0.1:1236/v1/session

curl -b /tmp/closedroom.cookies http://127.0.0.1:1236/v1/audio/transcriptions \
  -F "file=@/Users/daniele/Desktop/audio.mp3" \
  -F "language=it" \
  -F "response_format=text"
```

### Result Caching

ClosedRoom reuses completed transcription results when audio bytes and ASR options match.

The cache includes:

* model;
* language;
* task;
* prompt;
* temperature;
* VAD options;
* audio hash.

This avoids repeated local processing for identical inputs.

---

## 8. Local LLM Analysis

ClosedRoom uses local LLM analysis to transform raw transcripts into operational knowledge.

The local analysis layer can extract:

* meeting brief;
* action items;
* decisions;
* risks and blockers;
* minutes;
* open questions;
* project updates.

### Fast Analysis

The fast analysis pipeline focuses on the core operational output:

```text
Transcript
   │
   ▼
Brief + Actions + Decisions + Risks
```

### Deep Analysis

The deep analysis pipeline adds richer meeting intelligence:

```text
Transcript
   │
   ▼
Brief
Actions
Decisions
Risks
Minutes
Open Questions
Project Update
```

When launching analysis from a meeting, ClosedRoom opens a setup dialog for the run. The saved settings remain defaults, but the request can override provider, Gemini model, local model, model path, quality preset, temperature, reasoning mode, max output tokens, and JSON mode.

### Integration with `local-llm-server`

ClosedRoom can run `local-llm-server` as a managed local sidecar.

Default local LLM endpoint:

```text
http://127.0.0.1:1235
```

In managed mode, ClosedRoom starts and supervises the local LLM runtime and stores logs under:

```text
~/Library/Logs/ClosedRoom/llm-server.log
```

For direct local LLM experimentation, you can start the server manually:

```bash
local-llm serve --model nemotron-nano-4b
```

Then configure ClosedRoom to use the external local endpoint from settings.

---

## 9. Configuration

ClosedRoom can be configured through:

* CLI flags;
* environment variables;
* local settings in the web UI.

### Important Runtime Settings

| Setting                    | Description                                                 |
| -------------------------- | ----------------------------------------------------------- |
| `recordings_dir`           | Directory where local meeting recordings are stored         |
| `asr_provider`             | `local` or `speechmatics`; defaults to local                |
| `default_model`            | Default ASR model                                           |
| `default_language`         | Default transcription language                              |
| `default_temperature`      | Non-negative numeric ASR temperature                        |
| `speechmatics_region`      | Speechmatics Batch region (`eu` or `us`)                    |
| `speechmatics_model`       | Speechmatics model (`standard` or `enhanced`)               |
| `speechmatics_diarization` | Speechmatics diarization mode (`none` or `speaker`)         |
| `llm_provider`             | Analysis provider                                           |
| `gemini_model`             | Gemini model used when `llm_provider=gemini`                |
| `local_llm_mode`           | `auto`, `external`, or `disabled`                           |
| `local_llm_url`            | External local LLM server URL                               |
| `local_llm_model`          | Model used for local analysis                               |
| `local_llm_quality_preset` | Default quality preset for local analysis                   |
| `local_llm_reasoning`      | Default local reasoning mode (`auto`, `on`, or `off`)       |
| `meeting_auto_analysis`    | Whether to start analysis automatically after transcription |
| `meeting_default_pipeline` | Default meeting analysis pipeline                           |
| `speaker_diarization_enabled` | Enable local FluidAudio diarization after transcription; default `false` |
| `speaker_diarization_minimum_overlap` | Minimum ASR-segment overlap required to assign a local cluster; default `0.25` |
| `visual_intelligence_enabled` | Enable post-meeting Qwen visual evidence processing; default `false` |
| `visual_llm_model` | Vision model routed through `local-llm-server`; default `qwen3-vl-4b` |
| `visual_minimum_observations` | Minimum matching observations before automatic attribution |
| `visual_minimum_margin` | Minimum normalized lead over the second identity candidate |

Settings updates are validated before the atomic write. Unknown providers,
runtime modes, analysis pipelines and transcription tasks, as well as invalid
timeouts or temperatures, are rejected without changing `settings.json`. When
`local_llm_model_paths` contains the selected model, that model-specific path
takes precedence over the legacy `local_llm_model_path` value.

### Local LLM Modes

| Mode       | Description                                                |
| ---------- | ---------------------------------------------------------- |
| `auto`     | ClosedRoom manages the local LLM sidecar                   |
| `external` | ClosedRoom connects to a manually started local LLM server |
| `disabled` | Local LLM analysis is disabled                             |

### Example environment variables

```bash
export LOCAL_ASR_RECORDINGS_DIR="$HOME/Recordings/local-asr"
export LOCAL_ASR_REQUIRE_AUTH=1
export LOCAL_LLM_URL="http://127.0.0.1:1235"
export SPEECHMATICS_API_KEY="..."
export GEMINI_API_KEY="..."
```

---

## 10. HTTP API Reference

### Session

ClosedRoom uses a local same-origin session for the web app.

```bash
curl -c /tmp/closedroom.cookies http://127.0.0.1:1236/v1/session
```

### Health Check

```bash
curl http://127.0.0.1:1236/health
```

### Capture Capabilities

```bash
curl -b /tmp/closedroom.cookies http://127.0.0.1:1236/v1/capture/capabilities
```

### Visual frame staging and observations

```bash
curl -b /tmp/closedroom.cookies \
  -F 'file=@frame.jpg;type=image/jpeg' \
  -F 'sequence=0' \
  -F 'timestamp=1.25' \
  http://127.0.0.1:1236/v1/recordings/<recording-id>/visual-frames

curl -b /tmp/closedroom.cookies \
  http://127.0.0.1:1236/v1/recordings/<recording-id>/visual-intelligence

curl -b /tmp/closedroom.cookies \
  http://127.0.0.1:1236/v1/capture/windows
```

Frame sequence and meeting-relative timestamp must be monotonic. Each frame
must be a JPEG no larger than 5 MB and can only be staged while the recording
is active.

### Runtime Service Status

```bash
curl -b /tmp/closedroom.cookies http://127.0.0.1:1236/v1/runtime/status
curl -b /tmp/closedroom.cookies http://127.0.0.1:1236/v1/runtime/services
curl -b /tmp/closedroom.cookies http://127.0.0.1:1236/v1/runtime/services/llm
```

### Start Local LLM Service

```bash
curl -b /tmp/closedroom.cookies \
  -X POST http://127.0.0.1:1236/v1/runtime/services/llm/start
```

### LLM Service Logs

```bash
curl -b /tmp/closedroom.cookies \
  http://127.0.0.1:1236/v1/runtime/services/llm/logs?tail=100
```

### Job Status

```bash
curl -b /tmp/closedroom.cookies http://127.0.0.1:1236/v1/jobs
curl -b /tmp/closedroom.cookies http://127.0.0.1:1236/v1/jobs/<job-id>
curl -b /tmp/closedroom.cookies http://127.0.0.1:1236/v1/jobs/<job-id>/events
```

### Meeting Workspace

```bash
curl -b /tmp/closedroom.cookies http://127.0.0.1:1236/v1/meetings
curl -b /tmp/closedroom.cookies http://127.0.0.1:1236/v1/meetings/<recording-id>
```

### Analysis Templates & Pipelines

```bash
curl -b /tmp/closedroom.cookies http://127.0.0.1:1236/v1/analysis/templates
curl -b /tmp/closedroom.cookies http://127.0.0.1:1236/v1/analysis/pipelines
```

### ASR Providers

```bash
curl -b /tmp/closedroom.cookies http://127.0.0.1:1236/v1/asr/providers
```

### Run Meeting Analysis Pipeline

```bash
curl -b /tmp/closedroom.cookies \
  -X POST http://127.0.0.1:1236/v1/analysis-pipelines \
  -H "Content-Type: application/json" \
  -d '{
    "recording_id": "<recording-id>",
    "pipeline_id": "meeting_default",
    "llm_provider": "nemotron_local",
    "local_llm_model": "nemotron-nano-4b-q8",
    "local_llm_quality_preset": "balanced",
    "local_llm_reasoning": "auto"
  }'
```

---

## 11. Security & Privacy

ClosedRoom is designed around local-first privacy.

### Local Processing

By default:

* audio recordings stay on the local machine;
* transcripts are stored locally;
* analysis runs locally through `local-llm-server`;
* prompts and results are stored in the local catalog;
* no cloud LLM API is required for the default local workflow.

### Optional Cloud Providers

Speechmatics and Gemini are explicit opt-in providers:

* selecting Speechmatics sends the selected audio track to Speechmatics Batch
  ASR for transcription;
* selecting Gemini sends transcript text and prompt content to Gemini for
  analysis;
* `GET /v1/settings` never returns saved cloud API keys, only configured-state
  booleans;
* transcript metadata stores provider/backend/model options but not API keys,
  raw request headers or authorization values;
* Speechmatics transcripts report the effective Speechmatics model from
  provider settings/options, never the local Whisper default model.

### Local Authentication

The web app bootstraps a same-origin local session automatically.

For direct API calls:

1. fetch `/v1/session`;
2. reuse the returned cookie or bearer token.

Only disable authentication for trusted local development:

```bash
export LOCAL_ASR_REQUIRE_AUTH=0
```

### Network Exposure

The intended default binding is local:

```text
127.0.0.1
```

Avoid exposing ClosedRoom or the local LLM server to an untrusted network unless you understand the security implications.

### Sensitive Meeting Data

Meeting data can contain confidential information. Treat the recordings directory, transcripts, logs, and local SQLite catalog as sensitive data.

---

## 12. Development & Build

### Frontend

```bash
cd frontend
npm install
npm run build
```

### Backend

```bash
pip install -e .
local-asr serve --reload
```

### Full local development run

```bash
./run.sh
```

During development, `./run.sh` starts ClosedRoom and follows the managed LLM sidecar log in the same terminal.

### Update the local LLM runtime

ClosedRoom pins `local-llm-server` to a local wheel. The updater discovers the
latest stable semantic-version tag on GitHub, downloads the matching wheel from
that GitHub Release, and updates both `pyproject.toml` and `uv.lock`:

```bash
python3 scripts/update_local_llm_server.py --check
python3 scripts/update_local_llm_server.py
```

The script never builds `local-llm-server` from source. It reuses an exact
version wheel already present in the sibling `local-llm-server/dist/` directory,
or downloads `local_llm_server-<version>-py3-none-any.whl` through GitHub CLI.
The dependency enables the wheel's `vision` extra so the Qwen MLX backend is
installed reproducibly. If lock generation fails, the dependency files are
restored.

### Build macOS App

```bash
./build.sh
```

The packaged app includes the native capture helper and the arm64 FluidAudio
batch-diarization helper. Swift Package Manager resolves the pinned FluidAudio
dependency during the first build. The final app bundle and visible bundle name
are versioned from `pyproject.toml`, for example `dist/ClosedRoom-0.1.0.app`, so
local builds can be installed side by side instead of overwriting or visually
colliding with `ClosedRoom.app`. The build also removes stale unversioned app
bundles from `dist/`.

If an older `ClosedRoom.app` is still running on the standard app port, the versioned bundle starts its own local server on the next available app port instead of silently reusing the old server. Quit the old menu bar app if you want the versioned build to use the default port.

To install the signed build into `/Applications` with the same versioned name:

```bash
./build.sh --no-dmg --install
```

When using `--no-dmg`, open the generated `.app` directly. The script removes any stale same-version DMG so an old disk image is not mistaken for the current build output.

---

## 13. Project Status & Roadmap

### Current Status

`v0.1.0` is the first local meeting intelligence release.

It includes:

* local recording;
* local transcription;
* meeting workspace;
* local analysis pipelines;
* project-oriented meeting intelligence;
* managed local LLM integration;
* demo mode and guided tour;
* native macOS capture support;
* local runtime service management.

### Roadmap

* Persistent editable action items.
* Better diarization and speaker attribution.
* More robust project-level memory.
* Advanced search across meetings and projects.
* Export to Markdown, JSON, PDF, or Notion-like formats.
* Better offline packaging for non-technical users.
* Improved local model presets for different hardware profiles.
* Stronger evaluation of local ASR and LLM analysis quality.

---

## 14. License

This project is licensed under the [MIT License](LICENSE).
