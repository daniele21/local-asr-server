from __future__ import annotations

import io
import json
import subprocess
import sys
import time
import unittest

from local_asr_server.runtime.asr_worker import ASRProcessRunner


class _WritableInput(io.StringIO):
    def close(self) -> None:
        self.flushed_value = self.getvalue()


class _DelayedLines:
    def __init__(self, lines: list[str]) -> None:
        self.lines = lines

    def __iter__(self):
        time.sleep(0.02)
        yield from self.lines


class _ExitedProcess:
    def __init__(self, result: dict, progress: list[dict] | None = None) -> None:
        self.stdin = _WritableInput()
        self.stdout = _DelayedLines([
            *(json.dumps({"type": "progress", **item}) + "\n" for item in (progress or [])),
            json.dumps({"type": "result", "data": result}) + "\n",
        ])
        self.stderr = []
        self.returncode = 0

    def poll(self):
        return self.returncode


class ASRWorkerTests(unittest.TestCase):
    def test_cli_module_executes_transcribe_worker_entrypoint(self) -> None:
        completed = subprocess.run(
            [sys.executable, "-m", "local_asr_server.cli", "transcribe"],
            input="{}",
            capture_output=True,
            text=True,
            timeout=10,
        )

        self.assertNotEqual(completed.returncode, 0)
        message = json.loads(completed.stdout.strip().splitlines()[-1])
        self.assertEqual(message["type"], "error")
        self.assertIn("audio_path", message["message"])

    def test_process_runner_drains_result_enqueued_after_process_exit(self) -> None:
        expected = {"text": "completed", "segments": []}
        process = _ExitedProcess(expected)
        runner = ASRProcessRunner(
            popen_factory=lambda *args, **kwargs: process,
            sleep_func=lambda _: time.sleep(0.005),
        )

        result = runner.transcribe(audio_path="/tmp/audio.wav")

        self.assertEqual(result, expected)
        self.assertEqual(
            json.loads(process.stdin.flushed_value),
            {"audio_path": "/tmp/audio.wav"},
        )

    def test_process_runner_forwards_structured_audio_progress(self) -> None:
        process = _ExitedProcess(
            {"text": "completed", "segments": []},
            progress=[{"phase": "transcribing", "processed_audio_seconds": 12.5}],
        )
        received = []
        runner = ASRProcessRunner(
            popen_factory=lambda *args, **kwargs: process,
            sleep_func=lambda _: time.sleep(0.005),
        )

        runner.transcribe(
            audio_path="/tmp/audio.wav",
            audio_duration_seconds=30,
            progress_callback=received.append,
        )

        self.assertTrue(received)
        self.assertEqual(received[-1]["processed_audio_seconds"], 12.5)
        self.assertNotIn("progress_callback", json.loads(process.stdin.flushed_value))


if __name__ == "__main__":
    unittest.main()
