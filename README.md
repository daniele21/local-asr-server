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
brew install ffmpeg blackhole-2ch

# Install Python package in editable mode
pip install -e .
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

## Post-call recording

The browser sends audio chunks to the configured recordings directory while
the call is in progress. Clicking **Termina e salva** only finalizes the audio.
To run Whisper, open the **Trascrizione** screen and select the saved recording
or upload a different audio file.

Each session stores:

```text
<recordings-dir>/<date>/<session-id>/
├── recording.webm
├── metadata.json
├── transcript.json
└── transcript.txt
```

Browser recording captures the selected audio input. To include the remote
participants (or any system audio output) on macOS:

1. **Install BlackHole**: Run `./setup.sh` or `brew install blackhole-2ch`.
2. **Create a Multi-Output Device**:
   - Open the **Audio MIDI Setup** app on your Mac.
   - Click the **+** button in the bottom-left corner and select **Create Multi-Output Device**.
   - Check both your primary output device (e.g., *Built-in Output* or headphones) and **BlackHole 2ch**.
   - Enable **Drift Correction** next to *BlackHole 2ch*.
3. **Route System Audio**:
   - Open macOS **System Settings > Sound > Output**.
   - Set the output device to the newly created **Multi-Output Device**.
4. **Select Input in Web UI**:
   - Open the local-asr Web UI.
   - Select **BlackHole 2ch** in the microphone/input device list and start recording.

## Endpoints / Usage Examples

### Health check
```bash
curl http://127.0.0.1:1236/health
```

### Transcribe uploaded audio
```bash
curl http://127.0.0.1:1236/v1/audio/transcriptions \
  -F "file=@/Users/daniele/Desktop/audio.mp3" \
  -F "language=it" \
  -F "response_format=verbose_json"
```

### Transcribe local path
```bash
curl http://127.0.0.1:1236/v1/audio/transcriptions/path \
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
curl http://127.0.0.1:1236/v1/audio/transcriptions \
  -F "file=@/Users/daniele/Desktop/audio.mp3" \
  -F "language=it" \
  -F "response_format=text"
```
