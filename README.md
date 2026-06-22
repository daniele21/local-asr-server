# local-asr-server

Local ASR server powered by MLX Whisper.

## Requirements

- macOS Apple Silicon recommended
- Python >= 3.10
- ffmpeg
- MLX Whisper model, for example:
  - `mlx-community/whisper-large-v3-turbo`

## Install

On macOS, you can run the provided setup script to install all required dependencies (including `ffmpeg` and `blackhole-2ch` for system audio recording) and the Python package:

```bash
./setup.sh
```

Alternatively, you can install the dependencies manually:

```bash
# Install system dependencies (macOS)
brew install ffmpeg blackhole-2ch switchaudio-osx

# Install Python package in editable mode
pip install -e .
local-asr doctor
```

## Start server

Using Hugging Face model repo:

```bash
local-asr serve \
  --model mlx-community/whisper-large-v3-turbo \
  --recordings-dir ~/Recordings/local-asr \
  --port 1236
```

Using a local downloaded model:

```bash
local-asr serve \
  --model /Users/daniele/models/whisper-large-v3-turbo \
  --recordings-dir ~/Recordings/local-asr \
  --port 1236
```

Open `http://127.0.0.1:1236` to upload an audio file or record a call.
The web app bootstraps a local same-origin session automatically. For direct
API calls, fetch `/v1/session` first and reuse the returned cookie or bearer
token. Set `LOCAL_ASR_REQUIRE_AUTH=0` only for trusted development tests.

## Post-call recording

The browser sends audio chunks to the configured recordings directory while
the call is in progress. Clicking **Termina e salva** only finalizes the audio.
To run Whisper, open the **Trascrizione** screen and select the saved recording
or upload a different audio file.

Chunk uploads are recorded with monotonic sequence numbers and SHA-256 metadata,
so retrying the same committed chunk is idempotent while conflicting duplicate
content is rejected. If the browser tab closes or the server restarts before
stop, ClosedRoom marks sessions with partial audio as recoverable and can
finalize them as partial recordings instead of discarding the captured audio.

Each session stores:

```text
<recordings-dir>/<date>/<session-id>/
├── recording.webm      # mixed playback track
├── mic.webm            # local microphone track, when captured
├── system.webm         # computer audio track, when captured
├── metadata.json
├── transcript.json
└── transcript.txt
```

ClosedRoom checks `/v1/capture/capabilities` before recording. On macOS 14 or
later, the native Swift helper records microphone audio with AVFoundation and
computer audio with ScreenCaptureKit, then writes WAV tracks directly into the
recording session. The native backend is considered available only when the
macOS version and the required Screen Recording/Microphone permissions are
ready. When it is available, it becomes the default and the UI shows native
capture status instead of BlackHole setup controls. For **voice + computer
audio** sessions, ClosedRoom stores the source tracks plus a mixed playback
track under one recording item. Whisper is started later from the
**Trascrizione** screen: it transcribes the source tracks sequentially and
merges the resulting segments by timestamp, labeling them as local microphone
or computer audio.

When a multi-track recording is transcribed, ClosedRoom also runs a lightweight
audio intelligence pass in shadow mode. It reads the finalized source tracks in
small audio windows, computes local metadata such as speaking time, long pauses,
channel overlap, speech rate and relative energy, enriches transcript segments,
and stores a compact `intelligence.json` next to the recording. This pass does
not create persistent audio clips and does not call an LLM; any insight
candidates are marked as mock placeholders for a future local text analysis
step. The recording detail screen shows the generated speaking-time, pause,
overlap, speech-rate and energy metrics after transcription, and the
transcription segment view displays small badges for the same per-segment
signals when available.

In the macOS app bundle, native capture runs from an embedded helper app,
`ClosedRoomNativeCapture.app`, with its own bundle identifier
`com.closedroom.nativecapture` and microphone/screen/audio usage descriptions.
`build.sh` creates the helper app before PyInstaller, copies it manually into
`ClosedRoom.app/Contents/Helpers` after PyInstaller, then signs the helper
executable, the helper app, `audio-helper`, `ffmpeg`, the main executable, and
the final `.app`. The build fails if the helper app is repackaged as a
`__dot__app` directory, if
`ClosedRoom.app/Contents/Helpers/ClosedRoomNativeCapture.app/Contents/MacOS/ClosedRoomNativeCapture`
is missing, or if helper diagnostics after signing do not report the expected
bundle identifier and signed code state. Use
`/v1/capture/diagnostics` to inspect the effective `executable_path`,
`bundle_identifier`, `code_signature`, and TCC permission status. A failed
`codesign` or bundle verification stops the build, because an unsigned or
anonymous native helper cannot reliably request Microphone/System Audio
permissions.

The app checks `/v1/capture/permissions` and `/v1/capture/diagnostics` on load.
When the selected native capture mode requires a permission whose status is not
determined, the recording screen shows an authorization CTA and calls
`POST /v1/capture/ensure-permissions` with `{ "mode": "both" | "mic_only" |
"pc_only" }`. Starting a native recording runs the same mode-specific preflight
before capture starts; the timer and overlay are shown only after the helper
emits its `ready` event.

If the native helper is unavailable, ClosedRoom makes that fallback explicit and
uses browser recording with BlackHole compatibility. The one-time setup for each
output device is:

1. **Install prerequisites**: Run `./setup.sh` or `local-asr setup-audio`.
2. **Create an output profile**:
   - Open the **Audio MIDI Setup** app on your Mac.
   - Click the **+** button in the bottom-left corner and select **Create Multi-Output Device**.
   - Rename it to `Local ASR Output - <device name>`, for example
     `Local ASR Output - MacBook Speakers`.
   - Check both your primary output device (e.g., *Built-in Output* or headphones) and **BlackHole 2ch**.
   - Enable **Drift Correction** next to *BlackHole 2ch*.
3. **Verify**: Run `local-asr doctor` or use the guided setup in the Web UI.

Create one profile for every output you regularly use. Microphone and BlackHole
selection are shown only while the app is using browser + BlackHole fallback.

## Endpoints / Usage Examples

### Health check
```bash
curl http://127.0.0.1:1236/health
```

### Capture capabilities
```bash
curl -c /tmp/closedroom.cookies http://127.0.0.1:1236/v1/session
curl -b /tmp/closedroom.cookies http://127.0.0.1:1236/v1/capture/capabilities
```

### Transcribe uploaded audio
```bash
curl -c /tmp/closedroom.cookies http://127.0.0.1:1236/v1/session
curl -b /tmp/closedroom.cookies http://127.0.0.1:1236/v1/audio/transcriptions \
  -F "file=@/Users/daniele/Desktop/audio.mp3" \
  -F "language=it" \
  -F "response_format=verbose_json"
```

### Transcribe local path
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
