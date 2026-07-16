from __future__ import annotations

import json
import queue
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
        return self.transcribe_func(**kwargs)


class ASRProcessRunner:
    """Runs MLX Whisper in a separate process to reclaim unified memory upon exit."""

    def transcribe(self, **kwargs: Any) -> dict[str, Any]:
        from local_asr_server.paths import is_bundled
        
        job = kwargs.pop("job", None)
        
        if is_bundled():
            cmd = [sys.executable, "transcribe"]
        else:
            cmd = [sys.executable, "-m", "local_asr_server.cli", "transcribe"]
            
        proc = subprocess.Popen(
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
            while proc.poll() is None or not q.empty():
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
                                if job:
                                    if "percent" in data:
                                        job.progress = int(data["percent"])
                                    if "message" in data:
                                        job.current_step = data["message"]
                            elif data.get("type") == "result":
                                result = data.get("data")
                            elif data.get("type") == "error":
                                error_msg = data.get("message")
                        except json.JSONDecodeError:
                            import logging
                            logger = logging.getLogger("uvicorn.error")
                            logger.info(f"[ASR Process stdout] {line.strip()}")
                except queue.Empty:
                    time.sleep(0.1)
        finally:
            t_out.join(timeout=1.0)
            t_err.join(timeout=1.0)
            
        if proc.returncode != 0:
            raise RuntimeError(error_msg or f"ASR process failed with exit code {proc.returncode}")
            
        if result is None:
            raise RuntimeError("ASR process exited without returning result")
            
        return result
