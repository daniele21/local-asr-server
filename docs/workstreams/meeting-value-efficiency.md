# ClosedRoom: useful notes, simple journeys and efficient execution

Status: active — PRS-12 integration candidate
Owner: meeting product, canonical job/persistence owners and local runtime
Baseline: dev `0d5d3fa`, 2026-09-05.

## Outcome and invariants

Record, prepare useful notes, verify decisions and find them later while the Mac stays usable. PRS-11 is integrated; PRS-12 is implemented on its integration branch. No runtime-performance gain is claimed.

- Meeting is primary; normal recording requires no technical choice.
- `Prepare notes` is explicit after Stop; `Transcript only` is secondary.
- Reuse valid transcript, then existing notes analysis. Ready notes open first; explicit tab selection wins.
- Audio/transcript survive enrichment failure/cancel. Local-first and explicit cloud opt-in remain unchanged.
- Canonical owners stay unchanged: RecordingStore capture, JobStore durable jobs, CatalogStore indexes, HeavyWorkloadArbiter heavy-work scheduling, runtime services managed cleanup.
- Excluded: rewrite, second scheduler/runtime/index owner, implicit cloud, mandatory visuals, unproven audio strategy.

## Work graph

| ID | Observable outcome | Owner paths/contracts | Depends on | State |
| --- | --- | --- | --- | --- |
| PRS-11 | Fast saved Meeting open | MeetingDetailPage, API client, visual hook | — | DONE |
| PRS-12 | One recoverable Prepare notes action | jobs, analysis/transcription services, Meeting UI | PRS-11 | INTEGRATION |
| PRS-13 | Consistent notes with less repeated inference | analysis templates/jobs/service/catalog | PRS-12 | BLOCKED |
| PRS-14 | Verify/edit actions and decisions | notes schema/catalog, transcript, Meeting UI | PRS-13 | BLOCKED |
| PRS-15 | Search complete local archive | CatalogStore, workspace/API/UI | — | READY |
| PRS-16 | Record safely while AI is busy | RecordingStore, resource policy/arbiter/runtime | — | READY |
| PRS-17 | Coherent macOS workspace | App/pages/components/design contracts | PRS-12,14,15,16 | BLOCKED |
| PRS-18 | Measured release | current-state, benchmarks, target-Mac evidence | selected increments | BLOCKED |

Default sequence: 11 -> 12 -> 13 -> 14 -> 15 -> 16 -> 17. PRS-15/16 may advance earlier, but shared schema/service/UI edits remain serialized into coherent outcome PRs.

## PRS-11 — integrated

Saved Meeting core content loads independently from diagnostics and visual services. Accessory errors/retries stay local, stale route responses are ignored and terminal reloads are coalesced. Evidence includes focused tests and `saved-meeting-fast-open` FULL_MEDIA. Target WKWebView/TCC fidelity remains release evidence when material.

## PRS-12 — integration candidate

Goal: coordinate existing transcription and analysis behind one recoverable `Prepare notes` action.

Implemented:
- `meeting_preparation` is a durable `JobStore` parent with atomic active dedupe and persisted parent->child stage links.
- Existing `TranscriptionJobManager` and `AnalysisJobManager` still own child execution; `HeavyWorkloadArbiter` remains the sole heavy-work scheduler.
- Durable identity includes recording source, effective ASR options and analysis/template identity. A matching valid transcript skips ASR.
- Derived notes are tied to the current transcript; failed/interrupted/cancelled preparation pipelines are not promoted as canonical ready notes.
- Cancel prevents future stages, including admission races where a child appears while cancellation is in progress.
- Restart interrupts incomplete work; only explicit resume creates a new parent and continues from the first missing stage.
- Meeting follows only the active parent SSE, reloads at transcript-ready and terminal milestones, exposes transcript before notes finish and preserves explicit tab selection.
- Existing expert transcription/analysis APIs remain compatible.

Acceptance before merge:
- duplicate click/reconnect does not duplicate preparation;
- transcript reuse skips ASR only for matching durable identity;
- transcript is readable while notes continue;
- cancel/restart/partial failure preserve completed artifacts and do not silently start new AI work;
- notes retry reuses successful transcript and does not treat partial output as ready;
- source/options/template changes invalidate reuse as defined by the current contracts.

Automated evidence: owner/API/persistence tests cover dedupe, migration, cancel races, restart/resume, reuse and partial projections. The canonical browser command runs both PRS-11 and `meeting-preparation-recovery` FULL_MEDIA: prepare -> transcript ready -> reconnect same parent -> notes failure -> explicit resume without ASR rerun -> notes ready. Exact-head selector validation is blocking; STRONG is expected but selector output is authoritative. Production model quality/latency and packaged interactive WKWebView fidelity remain release deltas.

## PRS-13 — shared structured notes

Goal: reduce overlapping inference without degrading useful output. Version summary/actions/decisions/risks with source references, separate generated content from edits and preserve legacy reads.

Decision gate: fix the rubric first — factual support, action/decision recall, attribution, schema validity, latency, inference count/tokens and peak memory. Short inputs may use one extraction; long inputs require bounded source-aware chunk/aggregation, never silent truncation. Change default only with representative quality/cost evidence. Checks: schema/projection/cache/migration/long-input tests and partial-result FULL_MEDIA; STRONG expected.

## PRS-14 — verifiable, editable notes

Add stable item identity, source references and user-edit overlay. Corrections must survive restart; regeneration creates a revision, retains edits and surfaces conflicts rather than silently remapping. Evidence -> edit -> restart -> regenerate is the critical FULL_MEDIA journey; STRONG expected.

## PRS-15 — complete search, bounded archive

Extend CatalogStore projection with bounded server-side search/pagination after verifying bundled SQLite full-text support. Search must reach content beyond preview/page limits, maintain stable paging/filtering, preserve index freshness across mutations and avoid whole-archive React extraction. Synthetic large-archive tests plus search -> source -> back FULL_MEDIA; STRONG expected.

## PRS-16 — recording while AI is busy

Resolve atomic capture/heavy-work admission for both orderings. Managed work may yield/cancel only at safe supported boundaries; no unsafe thread kill or false instant-start promise. Preserve data on wait/cancel/retry and keep external services caller-owned. Controlled worker/lifecycle races plus busy-AI -> record/stop -> resume FULL_MEDIA; physical capture/thermal evidence is release-only. STRONG expected.

## PRS-17 — coherent macOS workspace

Unify hierarchy across Today, Meeting, Projects, themes and supported window sizes. Keep one dominant action per state, advanced tools discoverable, async navigation stable and focus/keyboard/reduced-motion semantics intact. Component/routing checks plus complete journey FULL_MEDIA; SCOPED expected unless contracts expand.

## Evidence and release

INTEGRATION requires fresh `dev`, reviewed diff/current contracts, selector `auto` and affected deterministic/E2E gates; material UI uses FULL_MEDIA. Missing deterministic automation is `AUTOMATION_CAPABILITY_GAP`, not user work.

RELEASE `dev -> main` requires FULL automation plus applicable target-Mac TCC/audio/WKWebView/VoiceOver, representative MLX/resources and PRS-9 audio evidence. Use `python3 scripts/real_environment_ui_evidence.py --build`. Numeric budgets come from comparable baseline measurements; missing data stays unknown.

Durable owners: `design/ux-contract.json`, `docs/features.md`, `docs/architecture.md`, tests and `docs/current-state.md`. Complete a slice only when code, consumers, recovery, docs and evidence agree.
