# Product and runtime simplification

Status: active — PRS-0 contract in progress; Wave 1 ready
Owner: product experience + local runtime
Read when: changing the primary meeting journey, user-facing configuration, capture efficiency or AI resource policy

## Goal

Make ClosedRoom feel like one focused meeting product while reducing the CPU, memory and lifecycle cost required to complete the normal meeting journey.

The product should expose outcomes, not implementation choices. Recording, transcription, analysis, diarization, visual intelligence and local runtimes may remain technically capable without becoming independent decisions in normal use.

## Non-goals

- Remove local-first or privacy boundaries.
- Remove expert diagnostics needed for recovery and development.
- Rewrite persistence contracts or replace canonical recording/transcription/analysis owners without a concrete need.
- Optimize model quality or audio architecture without representative evidence.
- Run one large waterfall rewrite or publish stacked sync-only PR chains.

## Product invariants

- `Meeting` is the primary user object. Recording, transcription, analysis, jobs, providers and runtimes are implementation concepts unless recovery requires surfacing them.
- Golden path: `Today -> New Meeting -> Record -> Stop -> Meeting -> Transcribe -> Notes/Review`.
- A configured user starts a normal meeting with at most one required decision and zero provider/model/runtime decisions.
- Normal meeting recording defaults to microphone + computer audio when available; source/device/backend choices appear only for recovery or explicit advanced use.
- Diarization is an automatic enrichment policy, not a normal per-meeting toggle.
- Visual intelligence is explicit on-demand enrichment and must not run implicitly during recording.
- A normal Transcribe or Generate Notes action is one user action; provider/model/quality overrides remain advanced.
- Technical capability does not imply a user-facing setting.
- Diagnostics remain recoverable and available without occupying the normal hierarchy.

## Runtime invariants

- Recording has priority over heavy AI work. No heavy ASR/LLM/VLM phase starts while capture is active.
- ClosedRoom keeps one canonical heavy-workload admission owner; `HeavyWorkloadArbiter` remains that owner unless an explicit migration is adopted.
- AI model residency is phase-scoped and reclaimed after work. External runtimes remain caller-owned.
- Resource telemetry contains no meeting/transcript/screenshot content.
- Background UI/activity is bounded: no display-rate React state updates or avoidable polling loops for stable state.
- Every new buffer, queue, worker, model residency or cache has an explicit bound and cleanup owner.

## Capability placement

| Capability | Product placement |
| --- | --- |
| Mic + computer recording | CORE |
| Transcript | CORE |
| Summary / decisions / actions | CORE |
| Speaker attribution/naming | CORE, automatic |
| Search meetings | CORE |
| Projects | CONTEXTUAL organization/filtering |
| File import | SECONDARY |
| Visual intelligence | ON_DEMAND |
| Custom analysis / Ask | ON_DEMAND |
| Cloud ASR / cloud LLM | ADVANCED trust/runtime choice |
| Provider/model/quality overrides | ADVANCED |
| Custom model paths/endpoints/backends | DEVELOPER |
| Runtime start/stop/restart/logs/ports | DIAGNOSTICS |
| Merge/split/raw transcript tools | POWER_TOOL |
| Demo/mock controls | DEV/DEMO |

## Dependency DAG

```text
PRS-0 Product contract + performance baseline
         |
         +-----------+------------+-------------+
         v           v            v             v
PRS-1 Meeting   PRS-2 Lean   PRS-3 Resource  PRS-4 Simple
first UX        recording     policy           settings
         |           |            |
         +-----+     |       +----+----+
         v     v     |       v         v
      PRS-5  PRS-6   |    PRS-7      PRS-8
      Simple  Visual |    Cold AI    Event
      process on-demand   lifecycle  progress
         |     |     |       |         |
         +-----+-----+-------+---------+
                       |
                    PRS-9
              Audio evidence/decision
                       |
                    PRS-10
              Convergence + evidence
```

## Work graph

| ID | Observable outcome | Primary owners | Depends on | State | Convergence |
| --- | --- | --- | --- | --- | --- |
| PRS-0 | Product choices and baseline metrics are explicit before implementation | `design/ux-contract.json`, this workstream, resource evidence contract | — | ACTIVE | Wave 1 branch |
| PRS-1 | New Meeting and Meeting expose only outcome-level normal actions | `NewRecordingPage.tsx`, `MeetingDetailPage.tsx`, `App.tsx` | PRS-0 | READY | Wave 1 |
| PRS-2 | Recording UI/state updates are bounded and materially cheaper | `useRecorder.ts`, audio visualizer, overlay consumers | PRS-0 | READY | Wave 1 |
| PRS-3 | One ResourcePolicy decides capture-vs-heavy-AI admission and execution budget | `runtime/`, resource metrics, workload arbiter consumers | PRS-0 | READY | Wave 1 |
| PRS-4 | Normal Settings expose preferences; technical controls move to advanced/developer/diagnostics | `SettingsPage.tsx`, config presentation | PRS-0 | READY | Wave 1 |
| PRS-5 | Meeting Transcribe / Generate Notes are one-action workflows with automatic defaults | meeting/transcription/analysis UI + service consumers | PRS-1 | READY | Wave 2 |
| PRS-6 | Visual intelligence becomes on-demand with explicit workload/frame budget | visual UI/service + resource policy consumer | PRS-1, PRS-3 | READY | Wave 2 |
| PRS-7 | Managed local AI becomes cold after phases and stops after bounded idle policy | `llm_sidecar.py`, `service_manager.py`, ResourcePolicy | PRS-3 | READY | Wave 2 |
| PRS-8 | Processing progress is event-driven; polling is reconnect/fallback only | job event owner + frontend job consumers | PRS-0 | READY | Wave 2 after PRS-5 frontend convergence |
| PRS-9 | Audio compute strategy changes only if benchmark preserves useful quality | capture/transcription benchmark + direct consumers | PRS-0 measurement prep | READY | Wave 3 |
| PRS-10 | Integrated product proves simpler decisions and lower resource cost on representative paths | contracts, E2E, resource evidence, current state | PRS-1..9 applicable | BLOCKED | Integration/release |

## Parallel execution rules

### Wave 1

After PRS-0, run in parallel where write ownership does not conflict:

- PRS-1 Meeting-first product
- PRS-2 Lean recording
- PRS-3 ResourcePolicy foundation
- PRS-4 Simple Settings
- PRS-9 benchmark preparation only

Converge early and validate the vertical outcome:

`Open -> New Meeting -> Start without technical configuration -> Record with bounded UI work -> Stop -> Meeting`.

### Wave 2

After Wave 1 convergence:

- PRS-5 Simple processing
- PRS-6 Visual on-demand
- PRS-7 Cold AI lifecycle
- PRS-8 event backend may proceed in parallel; its `TranscriptionPage` integration waits until PRS-5 converges

Converge on:

`Meeting -> Transcribe -> Generate Notes -> optional Visual`, with resource policy owning heavy-work admission and model reclamation.

### Wave 3

- Finish PRS-9 benchmark and change the audio pipeline only if evidence justifies it.
- PRS-10 repeats baseline scenarios and closes the workstream only when product, runtime, tests and evidence agree.

Parallel branches are temporary implementation lanes, not publication chains. Related work converges onto this feature branch before integration to `dev`; do not create sync-only stacked PRs.

## PRS-0 baseline evidence

Measure the same scenarios before and after material runtime work. Store only aggregate machine/runtime metrics, never user content.

| Scenario | Minimum evidence |
| --- | --- |
| App idle | app RSS, app CPU, sidecar state/RSS |
| New Meeting idle | app RSS/CPU, background activity count where measurable |
| Active recording | app CPU/RSS, capture backend, UI update rates |
| Stop/finalization | peak app RSS, completion time |
| ASR | duration, peak/current memory where measurable, workload state |
| LLM analysis | duration, sidecar RSS, residency before/after |
| Visual processing | duration, sidecar/RSS, processed frame count/budget |
| Post-job idle | app RSS, sidecar process/residency after bounded idle |

Initial product targets:

- start meeting: <= 1 required decision;
- technical concepts in golden path: 0;
- normal provider/model decisions before recording/transcription/notes: 0;
- Transcribe meeting: 1 primary action;
- Generate Notes: 1 primary action.

Performance targets are set after baseline measurement; do not invent percentage improvements without representative evidence.

## Slice details

### PRS-1 Meeting-first

- Remove source/diarization/visual/device choices from normal New Meeting hierarchy.
- Default to mic + computer audio when ready.
- Expose source/device/backend choices only for recovery/advanced cases.
- Stop per-meeting enrichment controls from mutating ambiguous global preferences.
- Keep saved meeting as the canonical destination after Stop.

Iteration checks: frontend lint/typecheck plus focused journey/contract tests.

### PRS-2 Lean recording

Target behavior:

- audio samples stay latest-state in refs;
- canvas redraw <= 10–15 Hz while visible;
- React text meter updates <= 4–5 Hz;
- timer updates at 1 Hz;
- overlay status <= 2–4 Hz;
- visual meter pauses or strongly throttles when the relevant document/window is not visible;
- capture correctness and finalization semantics remain unchanged.

Iteration checks: focused frontend tests/contracts; capture lifecycle tests if touched.

### PRS-3 ResourcePolicy

Introduce one canonical policy owner that consumes machine/resource/workload state and decides execution eligibility/profile. First version must at least enforce:

- capture active => reject/defer heavy AI;
- one bounded heavy workload through the existing arbiter;
- no speculative model preload under constrained/default policy;
- phase completion triggers residency reclamation through canonical runtime owners.

No second scheduler or duplicate mutual-exclusion owner.

Iteration checks: policy unit tests, arbiter/direct consumer tests. Integration risk expected STRONG.

### PRS-4 Simple Settings

Normal sections: General, Storage, Language, Privacy/Processing, Performance.

Advanced: cloud/local trust boundary, provider/model/quality overrides.

Developer/Diagnostics: model paths, URLs, backend, ctx, reasoning/tokens/JSON, runtime lifecycle and logs.

Backend configuration compatibility remains intact in this slice.

### PRS-5 Simple processing

- Meeting `Transcribe` resolves defaults automatically.
- Meeting `Generate Notes` resolves defaults automatically.
- Standalone `TranscriptionPage` becomes import/power-tool/history surface rather than the normal meeting path.
- Advanced overrides remain reachable without occupying the primary action.

### PRS-6 Visual on-demand

- Remove visual capture from normal meeting setup.
- User explicitly requests screen/shared-content analysis.
- Candidate detection -> deduplication -> hard frame/work budget -> VLM.
- Never start VLM while recording.

### PRS-7 Cold AI lifecycle

- Release managed model residency at phase completion.
- Add bounded idle shutdown policy for the owned sidecar.
- External endpoints are never mutated.
- Memory pressure may shorten residency/idle policy but must not create unsafe force-kill semantics.

### PRS-8 Event-driven progress

- Canonical job owner emits progress events.
- UI subscribes through bounded SSE/event stream.
- Polling remains only for reconnect/fallback/recovery.
- Event history is bounded and privacy-safe.

### PRS-9 Audio evidence

Benchmark at least:

1. mic ASR + system ASR;
2. mixed ASR;
3. mixed ASR + lightweight source/speaker alignment if feasible.

Compare compute, transcript usefulness and speaker/source attribution. Preserve dual-track architecture unless evidence supports a simpler owner.

## Integration and validation

Development stage defaults to ITERATION. Use focused owner-local checks while slices are changing. Move a vertical wave to INTEGRATION only when its implementation, consumers, failure/resource behavior and focused tests agree.

At INTEGRATION:

- refresh target/base and review the complete diff;
- update durable feature/architecture/current-state docs affected by the integrated behavior;
- run `scripts/select_validation_profile.py --base <base> --head <head> --stage integration`;
- execute all required AGENT_LOCAL gates and use repository-owned REMOTE_AUTOMATED preflight for deterministic gates unavailable locally;
- do not delegate ordinary build/lint/test/package gates to the user;
- retain REAL_ENVIRONMENT only for evidence that genuinely requires the target Mac/user judgement.

Expected risk shorthand is guidance only: PRS-0 LEAN; PRS-1/4 SCOPED; PRS-2 SCOPED or STRONG depending on capture ownership touched; PRS-3/6/7 STRONG; PRS-5/8 SCOPED or STRONG by shared runtime/API impact; PRS-9 STRONG only if runtime behavior changes; release/promotion may require FULL. The selector is authoritative.

## Completion

PRS-10 is DONE only when:

- normal meeting path meets the product targets above;
- technical settings are absent from the golden path but recovery remains available;
- recording and AI workloads obey the resource/lifecycle invariants;
- baseline scenarios have comparable after-evidence;
- applicable deterministic gates pass on exact integrated HEAD;
- target-Mac evidence is updated only for claims materially affected by these changes;
- durable behavior has moved to canonical contracts/docs and this workstream can be deleted.
