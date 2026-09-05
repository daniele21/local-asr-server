# Product and runtime simplification

Status: active — Wave 1 integrated; Wave 2 converging
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
| PRS-5 | One-action Transcribe/Generate Notes | meeting/transcription/analysis | PRS-1 | DONE: integrated through PR #26 |
| PRS-6 | Visual intelligence on-demand with budget | visual service/UI, policy | PRS-1,3 | ACTIVE: executable INTEGRATION/STRONG confirmed; final docs exact-head pending |
| PRS-7 | Bounded idle shutdown after phase-scoped residency | LLM runtime owners | PRS-3 | DONE: integrated through PR #27 |
| PRS-8 | Event-driven progress; polling fallback only | job events + frontend | PRS-0 | READY |
| PRS-9 | Simplify audio compute only if benchmark supports it | capture/transcription | PRS-0 | READY |
| PRS-10 | Product/runtime/evidence convergence | contracts/E2E/evidence | applicable slices | BLOCKED |

## Integrated checkpoints

**Wave 1 — PR #25, merge `3fa29fb963b49f57cc4cbcce333d5f476f54659b`**

- UX contract `0.7.0`, Meeting-first object model and decision budgets.
- Automatic `both` capture with recovery-only source/device controls.
- Bounded recording UI cadence.
- Capture-priority ResourcePolicy through the shared arbiter.
- Managed LLM cold at startup; simplified Settings hierarchy.
- Exact feature HEAD `18ee0dbf7ed1aa73bde344f7ecc0f4c92c9ac126` passed INTEGRATION/STRONG including finalized `.app` smoke.

**Wave 2 integrated slices**

- PRS-5 / PR #26, merge `c62882bb17c50288266094db8e64fa2e7067f681`: Meeting Transcribe and Generate Notes are one-action normal workflows; technical overrides remain advanced.
- PRS-7 / PR #27, merge `c7161a0055804e534f6b9b10169b183bc3c1ff16`: managed LLM/VLM residency is released after a phase and the owned cold sidecar stops after a bounded idle window; ensure/start/restart/stop are serialized against stale idle timers. Exact feature HEAD `d5e6334d560c9083dd456bfd7dc0337f76eb96ea` passed INTEGRATION/STRONG.

## PRS-6 candidate

PR #28 keeps screen context outside the golden path:

- New Meeting offers `Contesto schermo` only as an explicit secondary disclosure; no selection means no frames.
- Capture remains 0.5 fps while the F0 quality/performance benchmark is open; no VLM runs during recording.
- Post-meeting `Analizza contesto schermo` appears only when frames and a transcript exist.
- The action creates one persisted/cancellable `visual_intelligence` job through the existing `TranscriptionJobManager` and `HeavyWorkloadArbiter`.
- The job enriches the existing transcription in place and requests task-aware `v2` routing without mutating Settings.
- Candidate detection/dedupe precedes a hard 2048-work-item ceiling; over-budget candidates are sampled deterministically across the full timeline before VLM work.
- Explicit `v2` routing fails closed if the bounded router fails; legacy/settings-driven compatibility paths retain their prior fallback behavior.
- Exact executable HEAD `b405b239554cbad73342be53d269f42944f7548d` passed INTEGRATION/STRONG remote preflight run `33953887968`: repository guards, frontend lint/typecheck, full Python unit/integration suite, finalized ARM64 `.app` build and packaged-app lifecycle smoke all passed. Subsequent durable-doc-only commits must still receive exact-head repository/preflight confirmation or valid reusable evidence before merge.

No CPU/RSS/storage percentage improvement is claimed until representative before/after evidence exists.

## Parallel execution

PRS-5 and PRS-7 are integrated. PRS-6 is in final documentation/preflight convergence. PRS-8 may progress at its backend/event boundary; Meeting UI event integration follows the processing convergence so the normal path is not rewritten twice. PRS-9 remains evidence-led. PRS-10 closes only after product/runtime/evidence agreement.

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
- PRS-6 uses candidate detection -> dedupe -> hard frame/work budget -> VLM and never starts VLM during recording.
- PRS-7 never mutates external endpoints and cancels stale managed-idle shutdown before new owned-runtime work.
- PRS-8 keeps event history bounded/privacy-safe and polling only for reconnect/recovery.
- PRS-9 preserves dual-track audio unless evidence supports a simpler owner.

## Integration

During ITERATION use focused checks. Before INTEGRATION: refresh base/head, review full diff, update affected durable docs, run selector with `stage=integration`, execute available local gates, and use repository-owned remote automation for deterministic gates unavailable locally. Do not delegate automatable gates to the user. REAL_ENVIRONMENT remains only for genuine target-Mac/human evidence.

Expected shorthand is guidance only: PRS-1/4 SCOPED; PRS-2 SCOPED/STRONG; PRS-3/6/7 STRONG; PRS-5/8 SCOPED/STRONG; selector is authoritative.

## Completion

PRS-10 becomes DONE only when normal-path product targets, resource/lifecycle invariants, comparable evidence, exact-head deterministic gates and materially affected target-Mac evidence agree. Move durable truth to canonical docs, then delete this workstream.
