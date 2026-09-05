# Product and runtime simplification

Status: active — Wave 1 and Wave 2 integrated; PRS-9 benchmark evidence active
Owner: product experience + local runtime
Read when: changing meeting UX, configuration, recording efficiency or AI resource policy

## Goal

Make ClosedRoom one focused meeting product while reducing normal-path CPU, memory and lifecycle cost. Expose outcomes, not implementation choices.

## Invariants

- `Meeting` is the primary user object; jobs/providers/models/runtimes are hidden unless advanced use or recovery requires them.
- Golden path: `Today -> New Meeting -> Record -> Stop -> Meeting -> Transcribe -> Notes/Review`.
- Configured users start a meeting with <=1 required decision and zero provider/model/runtime choices.
- Normal capture defaults to mic + computer audio; source/device/backend controls are recovery-only.
- Diarization is automatic policy; visual intelligence is explicit on-demand enrichment.
- Transcribe and Generate Notes are one-action normal workflows.
- Recording has priority: heavy ASR/LLM/VLM must not start while capture is active.
- `RecordingStore` owns capture state; `HeavyWorkloadArbiter` remains the only heavy-work scheduler.
- Runtime/service owners retain model residency and cleanup; external runtimes remain caller-owned.
- Stable UI state must not require display-rate React updates or avoidable polling.
- No resource telemetry contains meeting/transcript/screenshot content.

## Capability placement

| Placement | Capabilities |
| --- | --- |
| CORE | recording, transcript, notes/actions, speakers, search |
| CONTEXTUAL | projects |
| SECONDARY | file import |
| ON_DEMAND | visual intelligence, custom Ask/analysis |
| ADVANCED | cloud/local trust choice, provider/model/quality overrides |
| DEVELOPER/DIAGNOSTICS | model paths/endpoints, backend/runtime lifecycle/logs/ports |
| POWER_TOOL | merge/split/raw transcript tools |

## Dependency DAG

```text
PRS-0 Contract + baseline
  ├─ PRS-1 Meeting-first ─┬─ PRS-5 Simple processing
  │                       └─ PRS-6 Visual on-demand ┐
  ├─ PRS-2 Lean recording                          │
  ├─ PRS-3 ResourcePolicy ─┬─ PRS-6                ├─ PRS-10 Evidence
  │                        └─ PRS-7 Cold AI         │
  ├─ PRS-4 Simple Settings                         │
  ├─ PRS-8 Event progress ─────────────────────────┤
  └─ PRS-9 Audio benchmark/decision ───────────────┘
```

## Work graph

| ID | Outcome | Primary owners | Depends on | State |
| --- | --- | --- | --- | --- |
| PRS-0 | Product contract + comparable resource baseline | UX contract, evidence | — | ACTIVE: contract done; baseline pending |
| PRS-1 | Outcome-first New Meeting/Meeting | NewRecording, MeetingDetail, App | PRS-0 | DONE: integrated in Wave 1 |
| PRS-2 | Bounded recording UI work | useRecorder, visualizer/overlay | PRS-0 | DONE: integrated in Wave 1 |
| PRS-3 | Capture-priority ResourcePolicy | resource policy, arbiter/job consumers | PRS-0 | DONE: integrated in Wave 1 |
| PRS-4 | Preferences separated from expert runtime controls | Settings | PRS-0 | DONE: integrated in Wave 1 |
| PRS-5 | One-action Transcribe/Generate Notes | meeting/transcription/analysis | PRS-1 | DONE: PR #26 |
| PRS-6 | Visual intelligence on-demand with budget | visual service/UI, policy | PRS-1,3 | DONE: PR #28 |
| PRS-7 | Bounded idle shutdown after phase-scoped residency | LLM runtime owners | PRS-3 | DONE: PR #27 |
| PRS-8 | Event-driven progress; polling fallback only | job events + frontend | PRS-0 | DONE: PR #30 |
| PRS-9 | Simplify audio compute only if benchmark supports it | capture/transcription | PRS-0 | ACTIVE: benchmark harness/evidence |
| PRS-10 | Product/runtime/evidence convergence | contracts/E2E/evidence | applicable slices | BLOCKED |

## Integrated checkpoints

**Wave 1 — PR #25, merge `3fa29fb963b49f57cc4cbcce333d5f476f54659b`**

- Meeting-first contract, decision budgets, automatic `both` capture, bounded recorder UI cadence, capture-priority ResourcePolicy, cold managed LLM startup and simplified Settings.
- Exact feature HEAD `18ee0dbf7ed1aa73bde344f7ecc0f4c92c9ac126` passed INTEGRATION/STRONG including finalized `.app` smoke.

**Wave 2**

- PRS-5 / PR #26, merge `c62882bb17c50288266094db8e64fa2e7067f681`: one-action Meeting Transcribe/Generate Notes; technical overrides remain advanced.
- PRS-7 / PR #27, merge `c7161a0055804e534f6b9b10169b183bc3c1ff16`: phase-scoped managed LLM/VLM release plus bounded idle shutdown with stale-timer protection. Exact head `d5e6334d560c9083dd456bfd7dc0337f76eb96ea` passed INTEGRATION/STRONG.
- PRS-6 / PR #28, merge `bf4e3596a8cf0a9bd7fc24746dcde258c91ac4df`: explicit/off-by-default screen context, no VLM during recording, one persisted post-meeting job and bounded `v2` routing capped at 2048 work items. Exact head `5a9013c01c467c8bf5427b337b4d214294b9f798` passed INTEGRATION/STRONG run `33958256522`.
- PRS-8 / PR #30, merge `c3377ab4a1f68cd90b7153bb1ca63c07c3a969c9`: normal Meeting progress uses persisted SSE; GET snapshots are recovery-only; `job_events` cap at 512/job and are not duplicated into an undrained local queue. Exact head `cb722c654bf842f90620679a90f883a87accafea` passed INTEGRATION/STRONG run `33962722390`.

## PRS-9 benchmark contract

Current normal `both` capture persists `mixed`, `mic` and `system`, while `RecordingStore.transcribable_tracks()` sends only non-silent `mic` and `system` through ASR. Their results are cross-track deduplicated and merged with `track_id`, `source` and speaker labels, so simplifying to one mixed ASR pass is not a compute-only decision.

The benchmark slice changes evidence tooling, not runtime ownership:

- `scripts/benchmark_audio_strategy.py` reads one finalized session containing `recording`, `mic` and `system` audio;
- local ASR is uncached/unpersisted and production near-silent skipping is reused;
- repeats alternate dual-first/mixed-first order to reduce warm-cache/order bias;
- output is aggregate-only: ASR audio seconds, wall time, word/segment counts, normalized transcript similarity, timeline Jaccard and source-attribution retention;
- transcript text/full paths are not emitted and the recording is not mutated;
- no automatic recommendation is produced.

Deterministic tests use synthetic payloads. Representative ASR timing and captured-audio quality remain REAL_ENVIRONMENT evidence on a target Mac. Until that evidence exists, dual-track ownership remains canonical.

```bash
UV_CACHE_DIR=.cache/uv uv run python scripts/benchmark_audio_strategy.py \
  /path/to/recording/session --repeats 3 \
  --output /tmp/closedroom-audio-strategy.json
```

No CPU/RSS/storage percentage improvement is claimed until representative before/after evidence exists.

## Parallel execution

PRS-5/6/7/8 are integrated. PRS-9 is the active evidence slice and must not change dual-track ownership before representative results. PRS-0 comparable resource baseline and the independent target-Mac UX evidence lane can continue independently. PRS-10 closes only after product/runtime/evidence agreement.

## Baseline / acceptance evidence

Compare before/after for: app idle RSS/CPU; New Meeting idle; active recording RSS/CPU/update cadence; stop peak/time; ASR duration/memory; LLM duration/sidecar RSS/residency; visual duration/RSS/frame budget; post-job idle/residency.

Product targets:
- start meeting <=1 required decision;
- golden-path technical concepts = 0;
- provider/model choices before recording/transcription/notes = 0;
- Transcribe = 1 primary action;
- Generate Notes = 1 primary action.

Set performance targets only after baseline measurement.

## Slice constraints

- PRS-1 preserves recovery/diagnostics and saved Meeting destination.
- PRS-2 changes UI cadence only, not capture/finalization semantics.
- PRS-3 is policy, not a scheduler; no duplicate queue/mutex owner.
- PRS-4 preserves backend settings compatibility.
- PRS-5 keeps normal execution policy in persisted defaults while Advanced overrides remain reachable.
- PRS-6 uses candidate detection -> dedupe -> hard work budget -> VLM and never starts VLM during recording.
- PRS-7 never mutates external endpoints and cancels stale managed-idle shutdown before new owned-runtime work.
- PRS-8 keeps event history bounded/privacy-safe and polling only for reconnect/recovery.
- PRS-9 preserves dual-track audio unless representative evidence supports a simpler owner.

## Integration

During ITERATION use focused checks. Before INTEGRATION: refresh base/head, review full diff, update affected durable docs, run selector with `stage=integration`, execute available local gates, and use repository-owned remote automation for deterministic gates unavailable locally. Do not delegate automatable gates to the user. REAL_ENVIRONMENT remains only for genuine target-Mac/human evidence.

Expected shorthand is guidance only: PRS-1/4 SCOPED; PRS-2 SCOPED/STRONG; PRS-3/6/7 STRONG; PRS-5/8 SCOPED/STRONG; PRS-9 LEAN/SCOPED for evidence-only tooling unless selector escalates; selector is authoritative.

## Completion

PRS-10 becomes DONE only when normal-path product targets, resource/lifecycle invariants, comparable evidence, exact-head deterministic gates and materially affected target-Mac evidence agree. Move durable truth to canonical docs, then delete this workstream.
