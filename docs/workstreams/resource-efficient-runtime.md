# Resource-efficient runtime hardening

Status: active
Owner: runtime / local-ai / recording
Read when: implementing or coordinating ClosedRoom recording durability, heavy-workload scheduling, local LLM/VLM integration, process efficiency or resource evidence

## Goal

Make ClosedRoom robust for long local meetings by protecting capture from AI work, bounding queues and process concurrency, integrating the latest validated `local-llm-server` source without duplicating its internal resource manager, and producing exact evidence for memory/process behavior.

## Non-goals

- Reimplement `local-llm-server` residency, per-model admission or per-runtime request scheduling inside ClosedRoom.
- Claim universal memory reclamation, production MLX/Metal performance or physical-device/TCC quality without representative evidence.
- Change local-first/privacy defaults or introduce implicit cloud fallback.
- Redesign the meeting UI while runtime/resource contracts are still changing.

## Invariants

- Capture/persistence is `REALTIME_CRITICAL` and must not be starved by post-meeting AI work.
- Heavy unified-memory workloads have one ClosedRoom owner with bounded admission, queueing, cancellation and shutdown semantics.
- `local-llm-server` owns LLM/VLM runtime admission, residency and model-level scheduling; ClosedRoom owns cross-workload orchestration.
- The default heavy-workload concurrency is 1 until representative hardware evidence supports a higher profile.
- Model/source identity is reproducible: exact source revision, package identity and artifact/hash evidence must be retained.
- No unbounded queue/list/cache remains on an unbounded recording/job path.
- Process cleanup covers success, failure, timeout, cancellation, shutdown and partial initialization.
- Missing resource telemetry is `unknown`, never treated as zero.

## Work graph

| ID | Work | Owns/writes | Depends on | Parallel | State |
| --- | --- | --- | --- | --- | --- |
| RER-1 | Build/pin latest validated `local-llm-server` source and repair the updater contract | `pyproject.toml`, `uv.lock`, `scripts/update_local_llm_server.py`, dependency/build tests | — | yes | ACTIVE |
| RER-2 | Add a bounded global heavy-workload arbiter and route transcription/diarization/analysis jobs through it | `runtime/workload_arbiter.py`, `transcription_jobs.py`, `analysis_jobs.py`, `server.py`, focused tests | — | yes | ACTIVE |
| RER-3 | Bound native capture telemetry/event retention and preserve latest-state diagnostics | `native_capture.py`, native capture tests/diagnostics | — | yes | ACTIVE |
| RER-4 | Bound browser recording upload backlog with explicit backpressure/recovery | `frontend/src/hooks/useRecorder.ts` and focused frontend tests/contracts | — | yes | READY |
| RER-5 | Add process/resource telemetry and hardware-profile policy | new runtime metrics owner, diagnostics projection, settings/tests | RER-2 | no | BLOCKED |
| RER-6 | Integrate phase-aware LLM/VLM residency using `local-llm-server` capabilities; keep capture-first/lazy AI defaults | `runtime/llm_sidecar.py`, `runtime/service_manager.py`, runtime integration tests | RER-1, RER-2 | no | BLOCKED |
| RER-7 | Add storage governor and screenshot degradation-before-audio policy | recording/visual storage owner and tests | RER-3 | yes | BLOCKED |
| RER-8 | Add long-context + canonical multimodal meeting-evidence analysis | analysis service/contracts/tests | RER-6 | yes | BLOCKED |
| RER-9 | Add soak/pressure/repeated-load evidence and final integration gates | evidence scripts, `.engineering/e2e.json` if needed, focused soak contracts/docs | RER-3, RER-4, RER-5, RER-6 | no | BLOCKED |

Allowed states: `READY`, `ACTIVE`, `BLOCKED`, `DONE`.

Parallel work has intentionally separate write ownership. RER-1 and RER-2 meet at RER-6; RER-3 and RER-4 meet only at final evidence.

## Current executable slices

`RER-1`, `RER-2`, `RER-3`

### RER-1 acceptance

- ClosedRoom can select the latest validated `local-llm-server` repository revision, build/install it reproducibly and record the exact source revision.
- The canonical dependency no longer silently remains on 0.3.8 when the source integration is upgraded.
- Clean/CI builds do not depend on developer-machine absolute paths.
- Lock/build identity stays deterministic.

Validation:

- updater unit tests;
- dependency/build verification;
- selected profile is at least STRONG and FULL if dependency inventory/lock/build machinery is materially changed;
- exact-head remote preflight.

### RER-2 acceptance

- Transcription/diarization/analysis cannot create unbounded independent execution threads.
- One shared bounded arbiter owns heavy job admission across managers.
- Default heavy concurrency is 1 and pending capacity is explicit.
- Queue-full, cancellation and shutdown behavior are deterministic and observable.
- The existing `ModelRuntimeLeaseManager` is either reduced to a compatible phase hook or removed from mutual-exclusion claims; no second misleading scheduler remains.

Validation:

- focused arbiter/job concurrency tests;
- cancellation/queue-full/shutdown tests;
- Python integration tests touching transcription + analysis job owners;
- STRONG exact-head remote preflight.

### RER-3 acceptance

- High-frequency `volume` telemetry does not accumulate for the whole meeting in an unbounded list or queue.
- Latest volume state remains available per track.
- Lifecycle/warning/error events remain retrievable with an explicit bounded retention policy.
- Dropped-event accounting is observable when retention is saturated.

Validation:

- focused native-capture unit tests, including sustained synthetic volume events;
- native capture E2E contract where selected;
- STRONG exact-head remote preflight.

## Integration points

- RER-6 consumes the exact `local-llm-server` identity/capabilities from RER-1 and the global workload state from RER-2.
- The ClosedRoom arbiter schedules phases; `local-llm-server` schedules and admits requests inside the LLM/VLM phase.
- RER-5 exports queue depth, active workload, process PID/RSS/peak RSS, model residency/load-unload timings and unknown telemetry states to diagnostics without meeting content.
- RER-9 proves the integrated lifecycle on exact HEAD; deterministic automation is remote when the current agent lacks equivalent macOS tooling, while physical TCC/audio/representative MLX remains separate real-environment evidence.

## Target process policy

Normal recording phase:

```text
ClosedRoom app/API + native capture helper
```

Heavy AI models should be lazy/off unless explicitly required during capture.

Post-meeting default:

```text
ASR -> reclaim/exit -> diarization -> exit -> visual Qwen batch -> unload/reclaim -> analysis model -> unload/reclaim
```

Light metadata, persistence and bounded diagnostics may overlap; heavy unified-memory phases do not overlap by default.

## Evidence targets

- 2h and 4h mic+system+visual recording without crash, audio loss or monotonic unbounded memory growth.
- Bounded queue depth and explicit saturation behavior for every long-lived producer/consumer path.
- Peak app RSS, child RSS, swap/memory-pressure state, model load/unload time, queue wait and process cleanup evidence.
- Repeated ASR -> Qwen -> analysis cycles without residual process/listener leaks and with measured memory deltas.
- Representative diarization/visual quality evidence remains a separate model-quality gate from runtime correctness.

## Durable documentation destinations

- `docs/architecture.md`: final runtime ownership, phase model and process/resource lifecycle.
- `docs/features.md`: user-visible recording/analysis behavior only when behavior changes.
- `docs/adr/`: only if a durable decision needs rationale beyond architecture (for example exact source-build dependency policy).
- `.engineering/e2e.json`: only when an automated/real-environment evidence contract changes.
- tests/contracts: executable truth for queue bounds, concurrency, cancellation, cleanup and dependency identity.

## Completion

The workstream is complete only when code, dependency identity, process/resource lifecycle, bounded backpressure, failure behavior, automated validation, residual real-environment evidence and durable docs agree. Then update `docs/current-state.md` and delete this file by default.
