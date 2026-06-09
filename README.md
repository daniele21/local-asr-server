# local-asr-server

Local ASR server powered by MLX Whisper.

## Requirements

- macOS Apple Silicon recommended
- Python >= 3.10
- ffmpeg
- MLX Whisper model, for example:
  - `mlx-community/whisper-large-v3-turbo`

## Install

```bash
brew install ffmpeg
pip install -e .
```

## Start server

Using Hugging Face model repo:

```bash
local-asr serve \
  --model mlx-community/whisper-large-v3-turbo \
  --port 1236
```

Using a local downloaded model:

```bash
local-asr serve \
  --model /Users/daniele/models/whisper-large-v3-turbo \
  --port 1236
```

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
