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
* Run fast or deep analysis pipelines.
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

1. record a meeting;
2. save the audio locally;
3. transcribe it;
4. open the meeting workspace;
5. run analysis;
6. review actions, decisions, risks, and project updates.

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
| `default_model`            | Default ASR model                                           |
| `default_language`         | Default transcription language                              |
| `llm_provider`             | Analysis provider                                           |
| `local_llm_mode`           | `auto`, `external`, or `disabled`                           |
| `local_llm_url`            | External local LLM server URL                               |
| `local_llm_model`          | Model used for local analysis                               |
| `meeting_auto_analysis`    | Whether to start analysis automatically after transcription |
| `meeting_default_pipeline` | Default meeting analysis pipeline                           |

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

### Run Meeting Analysis Pipeline

```bash
curl -b /tmp/closedroom.cookies \
  -X POST http://127.0.0.1:1236/v1/analysis-pipelines \
  -H "Content-Type: application/json" \
  -d '{
    "recording_id": "<recording-id>",
    "pipeline_id": "meeting_default"
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

### Build macOS App

```bash
./build.sh
```

The packaged app includes the native capture helper and validates the helper bundle during build.

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
