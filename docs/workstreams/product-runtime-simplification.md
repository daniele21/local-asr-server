# Product and runtime simplification

Status: active — Wave 1 implementation complete; integration validation pending
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
| PRS-1 | Outcome-first New Meeting/Meeting | NewRecording, MeetingDetail, App | PRS-0 | ACTIVE: implementation done; validation pending |
| PRS-2 | Bounded recording UI work | useRecorder, visualizer/overlay | PRS-0 | ACTIVE: implementation done; validation pending |
| PRS-3 | Capture-priority ResourcePolicy | resource policy, arbiter/job consumers | PRS-0 | ACTIVE: implementation done; validation pending |
| PRS-4 | Preferences separated from expert runtime controls | Settings | PRS-0 | ACTIVE: implementation done; validation pending |
| PRS-5 | One-action Transcribe/Generate Notes | meeting/transcription/analysis | PRS-1 | READY |
| PRS-6 | Visual intelligence on-demand with budget | visual service/UI, policy | PRS-1,3 | READY |
| PRS-7 | Bounded idle shutdown after phase-scoped residency | LLM runtime owners | PRS-3 | READY |
| PRS-8 | Event-driven progress; polling fallback only | job events + frontend | PRS-0 | READY |
| PRS-9 | Simplify audio compute only if benchmark supports it | capture/transcription | PRS-0 | READY |
| PRS-10 | Product/runtime/evidence convergence | contracts/E2E/evidence | applicable slices | BLOCKED |

## Wave 1 checkpoint

Implemented on `feature/product-runtime-simplification`:

- UX contract `0.7.0`: Meeting-first object model, decision budgets and capability placement.
- New Meeting: optional title/project; automatic `both` capture; no visual/diarization controls; source/device UI only in Audio recovery.
- Recording: canvas ~12.5 Hz while visible, React meter 4 Hz, timer 1 Hz, overlay 2 Hz; hidden document skips meter work.
- ResourcePolicy: reads `RecordingStore.active_recording()` lazily; the shared arbiter checks admission at submit and again before execution, covering queued-work/capture races.
- Managed local LLM stays cold at app startup and starts through existing `ensure_llm_ready()` when local AI is first required.
- Settings: normal storage/meeting/privacy surfaces; provider/model/quality under Advanced; runtime/path/lifecycle/logs under Developer & diagnostics.

No CPU/RSS percentage improvement is claimed until representative before/after evidence exists.

## Parallel execution

**Wave 1:** PRS-1/2/3/4 plus PRS-9 benchmark preparation may run independently, then converge on:
`Open -> New Meeting -> Start -> Record -> Stop -> Meeting`.

**Wave 2 after Wave 1 integration:** PRS-5/6/7 in parallel. PRS-8 backend may run concurrently; its Transcription UI integration waits for PRS-5 convergence.

**Wave 3:** finish PRS-9 evidence-led decision, then PRS-10 acceptance.

Parallel branches are implementation lanes only; converge early and avoid sync-only stacked PRs.

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
- PRS-5 moves normal meeting processing away from the standalone technical wizard; Advanced overrides remain reachable.
- PRS-6 uses candidate detection -> dedupe -> hard frame/work budget -> VLM and never starts VLM during recording.
- PRS-7 releases managed residency after phases and adds bounded owned-sidecar idle shutdown; never mutates external endpoints.
- PRS-8 keeps event history bounded/privacy-safe and polling only for reconnect/recovery.
- PRS-9 preserves dual-track audio unless evidence supports a simpler owner.

## Integration

During ITERATION use focused checks. Before INTEGRATION: refresh base/head, review full diff, update affected durable docs, run selector with `stage=integration`, execute available local gates, and use repository-owned remote automation for deterministic gates unavailable locally. Do not delegate automatable gates to the user. REAL_ENVIRONMENT remains only for genuine target-Mac/human evidence.

Expected shorthand is guidance only: PRS-1/4 SCOPED; PRS-2 SCOPED/STRONG; PRS-3/6/7 STRONG; PRS-5/8 SCOPED/STRONG; selector is authoritative.

## Completion

PRS-10 becomes DONE only when normal-path product targets, resource/lifecycle invariants, comparable evidence, exact-head deterministic gates and materially affected target-Mac evidence agree. Move durable truth to canonical docs, then delete this workstream.
