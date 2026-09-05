# Product and runtime simplification

Status: active — implementation slices through PRS-9 tooling integrated; PRS-10 automated convergence active
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

## Dependency DAG

```text
PRS-0 Contract + baseline
  ├─ PRS-1 Meeting-first ─┬─ PRS-5 Simple processing
  │                       └─ PRS-6 Visual on-demand ┐
  ├─ PRS-2 Lean recording                          │
  ├─ PRS-3 ResourcePolicy ─┬─ PRS-6                ├─ PRS-10 Automated convergence
  │                        └─ PRS-7 Cold AI         │
  ├─ PRS-4 Simple Settings                         │
  ├─ PRS-8 Event progress ─────────────────────────┤
  └─ PRS-9 Audio benchmark tooling ────────────────┘

RELEASE: target-Mac UX/TCC/audio/resource evidence
```

## Work graph

| ID | Outcome | State |
| --- | --- | --- |
| PRS-0 | Product contract + comparable resource baseline | Contract DONE; representative baseline DEFERRED_TO_RELEASE |
| PRS-1 | Outcome-first New Meeting/Meeting | DONE: Wave 1 |
| PRS-2 | Bounded recording UI work | DONE: Wave 1 |
| PRS-3 | Capture-priority ResourcePolicy | DONE: Wave 1 |
| PRS-4 | Preferences separated from expert runtime controls | DONE: Wave 1 |
| PRS-5 | One-action Transcribe/Generate Notes | DONE: PR #26 |
| PRS-6 | Visual intelligence on-demand with budget | DONE: PR #28 |
| PRS-7 | Bounded idle shutdown after phase-scoped residency | DONE: PR #27 |
| PRS-8 | Event-driven progress; polling fallback only | DONE: PR #30 |
| PRS-9 | Privacy-safe dual-track vs mixed benchmark tooling | DONE: PR #31; representative decision evidence DEFERRED_TO_RELEASE |
| PRS-10 | Product/runtime automated convergence on `dev` | ACTIVE |

## Integrated checkpoints

- **Wave 1 / PR #25** — merge `3fa29fb963b49f57cc4cbcce333d5f476f54659b`: Meeting-first contract, bounded recorder UI cadence, capture-priority ResourcePolicy, cold managed LLM startup and simplified Settings.
- **PRS-5 / PR #26** — merge `c62882bb17c50288266094db8e64fa2e7067f681`: one-action Meeting Transcribe/Generate Notes; technical overrides remain advanced.
- **PRS-7 / PR #27** — merge `c7161a0055804e534f6b9b10169b183bc3c1ff16`: phase-scoped managed LLM/VLM release plus bounded idle shutdown with stale-timer protection.
- **PRS-6 / PR #28** — merge `bf4e3596a8cf0a9bd7fc24746dcde258c91ac4df`: explicit/off-by-default screen context, no VLM during recording, one persisted post-meeting job and bounded `v2` routing.
- **PRS-8 / PR #30** — merge `c3377ab4a1f68cd90b7153bb1ca63c07c3a969c9`: persisted SSE normal-path job progress; GET snapshots recovery-only; bounded event history.
- **PRS-9 tooling / PR #31** — merge `c4d02525ad6485b2c59ecf49997543be6ce1c2f5`: privacy-safe local benchmark comparing current dual-track ASR with one mixed-track pass. Exact feature HEAD `c66348dd592913e60b62767ace869c708a33fb90` passed INTEGRATION/SCOPED remote preflight run `33965247318` with frontend checks and 334 Python tests.

## PRS-9 contract

Current `both` capture persists `mixed`, `mic` and `system`; normal ASR transcribes non-silent `mic` and `system` separately before cross-track dedupe/merge. This preserves `track_id`, source and speaker attribution, so changing to one mixed ASR pass is not a compute-only decision.

`scripts/benchmark_audio_strategy.py`:
- reads one finalized session without mutating it;
- uses local ASR without transcript cache or persistence;
- alternates dual-first/mixed-first order across repeats;
- emits aggregate timing/quality/attribution metrics only, never transcript text/full paths;
- makes no automatic recommendation.

Representative timing/audio-quality evidence is `REAL_ENVIRONMENT`. Under baseline 0.9.2 it is **not an INTEGRATION blocker**: the harness and all deterministic work may converge to `dev`; the representative benchmark is collected during `dev -> main` release acceptance. Until then dual-track ownership remains canonical. If release evidence supports an ownership change, that implementation returns through `dev` and its normal automated gates before promotion.

## PRS-10 automated convergence

PRS-10 may close the development workstream when:
- normal-path product contracts agree with implementation;
- applicable runtime/resource/lifecycle invariants are covered;
- affected durable docs are current;
- exact-head selector-required deterministic gates pass;
- affected automated E2E requirements for integration pass.

Do **not** keep PRS-10 blocked on target-Mac evidence. Carry the following explicitly to release instead:
- representative CPU/RSS baseline and before/after evidence;
- PRS-9 representative audio benchmark;
- TCC/native physical-audio confirmation;
- target-Mac material UX FULL_MEDIA evidence;
- subjective VoiceOver/usability observations when applicable.

## Integration and release policy

During ITERATION use focused checks. Before a PR enters `dev`, refresh base/head, review the full diff, update affected durable docs, run the selector with `stage=integration`, and execute all required deterministic/automated E2E gates locally or through repository-owned remote automation.

At `INTEGRATION`, genuine `REAL_ENVIRONMENT` requirements are reported as `DEFERRED_TO_RELEASE` and do not block `AUTOMATED_PREFLIGHT_CONFIRMED`.

Before `dev -> main`, run `stage=release` / FULL validation and complete every applicable blocking real-environment confirmation. Real-environment evidence cannot be replaced by hosted macOS when the claim genuinely requires target fidelity.

## Completion

PRS-10 becomes DONE for development integration once the automated convergence criteria above agree on exact HEAD. Transfer any residual release evidence to `docs/current-state.md`, then close/delete this workstream per repository policy. Stable promotion remains separately blocked until RELEASE validation and applicable target-environment evidence pass.
