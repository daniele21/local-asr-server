from __future__ import annotations

import json
import queue
import re
import subprocess
import sys
import threading
import time
from dataclasses import dataclass
from typing import Any, Protocol

from local_asr_server.transcriber import transcribe_file_sync


class ASRWorkerRunner(Protocol):
    """Stable runtime boundary for ASR execution."""

    def transcribe(self, **kwargs: Any) -> dict[str, Any]:
        ...


@dataclass
class InProcessASRWorkerRunner:
    """Runs MLX Whisper in the API process while preserving a worker boundary."""

    transcribe_func: Any = transcribe_file_sync

    def transcribe(self, **kwargs: Any) -> dict[str, Any]:
        kwargs.pop("job", None)
        kwargs.pop("progress_callback", None)
        return self.transcribe_func(**kwargs)


@dataclass
class ASRProcessRunner:
    """Runs MLX Whisper in a separate process to reclaim unified memory upon exit."""

    popen_factory: Any = subprocess.Popen
    sleep_func: Any = time.sleep

    def transcribe(self, **kwargs: Any) -> dict[str, Any]:
        from local_asr_server.paths import is_bundled
        
        job = kwargs.pop("job", None)
        progress_callback = kwargs.pop("progress_callback", None)
        audio_duration_seconds = kwargs.get("audio_duration_seconds")
        
        if is_bundled():
            cmd = [sys.executable, "transcribe"]
        else:
            cmd = [sys.executable, "-m", "local_asr_server.cli", "transcribe"]
            
        proc = self.popen_factory(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
        )
        
        # Write config payload to stdin
        input_data = json.dumps(kwargs, ensure_ascii=False)
        proc.stdin.write(input_data)
        proc.stdin.close()
        
        result = None
        error_msg = None
        started_at = time.monotonic()
        last_progress_at = 0.0
        processed_audio_seconds = 0.0
        
        q = queue.Queue()
        
        def read_stdout(stream, q):
            for line in stream:
                q.put(line)
                
        def read_stderr(stream):
            import logging
            logger = logging.getLogger("uvicorn.error")
            for line in stream:
                if line.strip():
                    logger.info(f"[ASR Process stderr] {line.strip()}")

        t_out = threading.Thread(target=read_stdout, args=(proc.stdout, q), daemon=True)
        t_err = threading.Thread(target=read_stderr, args=(proc.stderr,), daemon=True)
        t_out.start()
        t_err.start()
        
        try:
            # The process can exit before the stdout reader has enqueued its
            # final result line. Keep draining until the reader is finished,
            # otherwise a valid result is lost in a small exit-time race.
            while proc.poll() is None or t_out.is_alive() or not q.empty():
                if job and job.cancel_requested:
                    proc.terminate()
                    try:
                        proc.wait(timeout=2.0)
                    except subprocess.TimeoutExpired:
                        proc.kill()
                    raise RuntimeError("Transcription job cancelled")
                    
                try:
                    line = q.get_nowait()
                    if line.strip():
                        try:
                            data = json.loads(line)
                            if data.get("type") == "progress":
                                message = str(data.get("message") or "")
                                structured_seconds = data.get("processed_audio_seconds")
                                if structured_seconds is not None:
                                    processed_audio_seconds = max(processed_audio_seconds, float(structured_seconds))
                                else:
                                    matches = re.findall(
                                        r"(?:\d{1,2}:)?(\d{1,2}):(\d{2}(?:\.\d+)?)",
                                        message,
                                    )
                                    if matches:
                                        minutes, seconds = matches[-1]
                                        processed_audio_seconds = max(
                                            processed_audio_seconds,
                                            float(minutes) * 60 + float(seconds),
                                        )
                                if progress_callback:
                                    progress_callback({
                                        "phase": data.get("phase") or "transcribing",
                                        "processed_audio_seconds": processed_audio_seconds,
                                        "message": message,
                                    })
                                    last_progress_at = time.monotonic()
                            elif data.get("type") == "result":
                                result = data.get("data")
                            elif data.get("type") == "error":
                                error_msg = data.get("message")
                        except json.JSONDecodeError:
                            import logging
                            logger = logging.getLogger("uvicorn.error")
                            logger.info(f"[ASR Process stdout] {line.strip()}")
                except queue.Empty:
                    now = time.monotonic()
                    if progress_callback and now - last_progress_at >= 1.0:
                        progress_callback({
                            "phase": "transcribing",
                            "processed_audio_seconds": processed_audio_seconds,
                            "elapsed_seconds": now - started_at,
                            "audio_duration_seconds": audio_duration_seconds,
                        })
                        last_progress_at = now
                    self.sleep_func(0.1)
        finally:
            t_out.join(timeout=1.0)
            t_err.join(timeout=1.0)
            
        if proc.returncode != 0:
            raise RuntimeError(error_msg or f"ASR process failed with exit code {proc.returncode}")
            
        if result is None:
            raise RuntimeError("ASR process exited without returning result")
            
        return result
