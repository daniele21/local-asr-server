# ClosedRoom: useful notes, simple journeys and efficient execution

Status: active — PRS-12 integration candidate
Owner: meeting product, canonical job/persistence owners and local runtime
Baseline: dev `0d5d3fa`, 2026-09-05.

## Outcome and scope

Record, prepare useful notes, verify decisions and find them later while the Mac stays usable. PRS-11 is integrated; PRS-12 is implemented on its integration branch and no measured runtime gains are claimed.
PRS-1..9 are integrated; [PRS-10](product-runtime-simplification.md) keeps its closure criteria. Current contracts apply until each increment updates them.
Excluded: rewrite, new runtime/scheduler/index owner, implicit cloud, mandatory visuals, unproven audio strategy, all-at-once release.

## Product decisions and invariants

- Meeting is primary; Today/Meetings/Projects and secondary Settings reuse the shell.
- No technical choice before recording; title/project stay optional after initial setup.
- Explicit "Prepare notes", not automatic on Stop; secondary "Transcript only". Reuse valid transcript, then existing notes analysis.
- Ready notes open first; preserve explicit tab selection. Audio/transcript survive enrichment failure/cancel.
- Local-first, explicit cloud opt-in, no content in telemetry, visuals on demand, dual-track preserved pending evidence.
- Canonical owners: RecordingStore capture; JobStore durable jobs; CatalogStore indexes; HeavyWorkloadArbiter scheduling; runtime services managed cleanup. External services remain caller-owned.
- Every increment includes UX/recovery/contracts/tests.

## Work graph

| ID | Observable outcome | Owner paths/contracts | Depends on | State |
| --- | --- | --- | --- | --- |
| PRS-11 | Open a saved meeting without waiting for diagnostics | MeetingDetailPage, API client, visual hook | — | DONE |
| PRS-12 | Prepare notes with one recoverable action | analysis/transcription services, jobs, schemas, Meeting UI | PRS-11 | INTEGRATION |
| PRS-13 | Produce consistent notes with less repeated inference | analysis_templates, analysis_jobs, analysis service, catalog | PRS-12 | BLOCKED |
| PRS-14 | Verify and correct actions/decisions without losing edits | notes schema/catalog, transcript and Meeting UI | PRS-13 | BLOCKED |
| PRS-15 | Find content anywhere in the local archive | CatalogStore, workspace router/helpers, Dashboard/Projects/API | — | READY |
| PRS-16 | Start recording safely while AI is already busy | RecordingStore, resource policy/arbiter, runtime/services | — | READY |
| PRS-17 | Use one coherent macOS workspace across states/windows | App, pages, semantic components/tokens, design contracts | PRS-12,14,15,16 | BLOCKED |
| PRS-18 | Promote a measured, reviewable release | current-state, existing benchmark and target-Mac evidence | selected release increments | BLOCKED |

Default: 11 -> 12 -> 13 -> 14 -> 15 -> 16 -> 17. PRS-15/16 can advance earlier; serialize shared catalog/schema/service/UI edits into each outcome PR. No stacked sync PRs or required parallel agents. PRS-18 releases a coherent subset.

## PRS-11 — completed slice: fast Meeting

Goal: open saved content independently of slow/failed diagnostics and visual services.
Implemented: core Meeting loads saved content only; diagnostics load on Details disclosure; frame availability and visual intelligence load on Analysis disclosure. Accessory failures stay local with retry, stale route responses are ignored and overlapping terminal reloads are coalesced.
Acceptance:
- Core content renders with accessory requests stalled/failed; no diagnostics or frame-list fetch on a normal audio meeting open.
- Local accessory error/retry; A -> B navigation cannot apply A responses to B.
- Audio/transcript and existing visual actions remain reachable.
Evidence: lint/typecheck, focused recovery tests and `browser-macos-arm64-ci` delayed/failing-route FULL_MEDIA. Synthetic browser evidence does not replace applicable release-time WKWebView/TCC evidence.

## PRS-12 — integration candidate: one recoverable preparation action

Goal: coordinate existing transcription/analysis with "Prepare notes".
Implemented: `meeting_preparation` is a durable parent in `JobStore`; persisted stage links compose the existing `TranscriptionJobManager` and `AnalysisJobManager` child jobs while the shared `HeavyWorkloadArbiter` remains the only heavy-work scheduler. Admission dedupes the same durable identity, valid transcript reuse skips ASR, analysis output is tied to the current transcript identity, and existing expert endpoints remain compatible. The Meeting follows only the active parent SSE, reloads canonical state when the transcript becomes available and on terminal state, keeps `Transcript only` secondary, and opens ready notes first unless the user explicitly selected another tab.
Acceptance implemented:
- Duplicate clicks/reconnect do not duplicate preparation; current valid transcript skips ASR.
- Reuse identity includes source/options/template; changed source marks derived output stale.
- Transcript is readable before notes complete; phase labels/cancellation are honest.
- Cancel prevents future stages and is acknowledged after worker observation.
- Restart restores persisted results/status; incomplete work becomes `interrupted` and resumes only through explicit user action from the first missing stage.
- Notes failure/retry preserves successful ASR and transcript/user corrections.
Evidence before merge: owner/service/API tests cover duplicate admission, migration, restart/cancel/partial failure/reuse; `browser-macos-arm64-ci` runs both the existing saved-Meeting FULL_MEDIA journey and `meeting-preparation-recovery` covering prepare → transcript-ready → reconnect same parent → notes failure → explicit resume without ASR rerun → notes-ready. Selector expectation remains STRONG; exact-head INTEGRATION evidence is blocking before merge. Production ASR/LLM quality/latency and packaged interactive WKWebView fidelity remain release deltas when material.

## PRS-13 — shared structured notes

Goal: reduce overlapping inference without degrading useful output.
Work: version summary/actions/decisions/risks with source references; project UI sections from shared output. Separate generated content from user edits; preserve legacy reads and migration safety.
Acceptance:
- Short in-context candidate uses one extraction instead of four; long input uses bounded source-aware chunks/aggregation, never silent truncation.
- Missing owner/deadline remains unknown; unsupported claims and malformed/partial output have explicit bounded recovery.
- Reuse includes source revision, model/provider, prompt/schema/options; rendering never invokes AI.
- Compare old/candidate on fixed short/long, multilingual, overlapping-speaker and ambiguous-action examples.
Decision gate: fix the rubric first: factual support, action/decision recall, attribution, schema validity, latency, inference count/tokens and peak memory. Change default only with representative quality/cost evidence; otherwise keep old default.
Checks: schema/projection/cache/migration/long-input tests; partial-result UI FULL_MEDIA; STRONG expected. Candidate may integrate behind an internal switch pending release evidence.

## PRS-14 — verifiable, editable notes

Goal: inspect evidence and correct actions/decisions without losing edits.
Work: stable item identity, source revision/segment references and user-edit overlay in canonical persistence.
Acceptance:
- Item selection opens actual source and seeks audio only with reliable timestamps.
- Generated, edited and unsupported content are distinguishable; legacy notes never invent precision.
- Owner/deadline/text corrections survive restart.
- Regeneration creates a revision, retains edits and surfaces conflicts; no silent fuzzy remapping.
- Copy/export uses reviewed content; original output remains inspectable.
Checks: edit/revision/conflict/persistence tests; evidence -> edit -> restart -> regenerate FULL_MEDIA; STRONG expected.

## PRS-15 — complete search, bounded archive

Goal: find content beyond 120 meetings and 800 transcript characters.
Work: extend CatalogStore projection; verify bundled SQLite full-text support before choosing it. Add bounded server-side search/pagination and lightweight list responses with API compatibility.
Acceptance:
- Find a phrase after character 800 outside the first page.
- Stable paging without duplicates/omissions for a fixed snapshot; composable title/project/date filters.
- Import/edit/delete/hide/merge/split/rebuild preserve visibility and index freshness.
- Old archives stay usable during bounded backfill; incomplete indexing is disclosed.
- Today/project aggregates cover requested period, not just displayed page.
- Lists omit full transcripts/frame lists; no whole-archive React extraction; stale search responses ignored.
- Paginate long detail/history only where measured payload requires it.
Checks: synthetic large-archive search/migration/paging and API tests; search -> source -> back plus empty/error/indexing FULL_MEDIA; STRONG expected.

## PRS-16 — recording while AI is busy

Goal: protect capture in both AI-during-recording and recording-during-AI ordering.
Work: test latter first; resolve atomic admission between capture and existing arbiter. Managed work yields at safe boundaries; native calls are not assumed preemptible. Bound waiting and expose actionable recovery.
Acceptance:
- Simultaneous admission has deterministic ownership; no check/start race.
- Active inference yields/cancels safely or recording reports a bounded actionable condition; no unsafe thread kill or false instant-start promise.
- Cancel/wait preserves data and retry; completion releases capture admission.
- Queue/buffer/event bounds and cleanup hold on cancel/error/shutdown.
- Managed residency/idle timers respect pending work; external services never killed/unloaded.
Decision gate: establish backend cancellation latency/resume semantics from code/contracts before promising responsiveness; surface unsupported behavior.
Checks: controlled-worker arbiter/policy/runtime races and lifecycle tests; busy-AI -> record/stop -> resume FULL_MEDIA. STRONG expected; physical capture/MLX/thermal evidence deferred to release.

## PRS-17 — coherent macOS workspace

Goal: one hierarchy across states, light/dark themes and window sizes.
Work: Today prioritizes record/recent/attention; Meeting ready notes; Projects changes/open commitments. Move run counters/diagnostics to secondary views, reduce repeated badges/chrome. Reuse tokens/sidebar/menus. Evaluate lazy loading of secondary routes against startup cost.
Acceptance:
- One dominant action per state; advanced tools remain discoverable.
- Clear first-run storage/permissions, empty, processing, partial and recovery states.
- Explicit navigation survives async updates; native/browser recording overlay remains intact.
- Supported compact/default/wide windows have no essential clipping; readable text, focus, keyboard, accessible names and reduced motion in both themes.
Checks: component/state/routing, initial JS/payload comparison; complete journey FULL_MEDIA. SCOPED expected unless contracts expand.
Update design/brand contracts for actual decisions. Earlier increments already include their own UI; no framework rewrite.

## Evidence, release and completion

ITERATION: focused owner tests. INTEGRATION: fresh dev base, reviewed diff/current contracts, selector auto and affected automated E2E; material UI uses FULL_MEDIA. Static assertions cannot prove interaction. Profiles above are provisional. Route unavailable deterministic gates to remote automation; missing automation is AUTOMATION_CAPABILITY_GAP.

PRS-18: preserve baseline build/input/model/config identity. At release compare same Mac/OS/model/input: idle, call recording, ASR/notes, cancel/recovery, repeated meetings, large archive. Measure phase latency, scoped CPU, RSS/footprint/Metal without double-counting, pressure/swap, thermal/energy context, audio continuity and quality. Separate cold/warm; missing data is unknown. Derive numeric budgets from baseline; fix quality rubric before comparison.
UX: time/actions/errors to record, find, correct and recover; count technical choices.
RELEASE dev -> main: FULL automation plus applicable TCC/audio/WKWebView/VoiceOver, representative MLX/resources and PRS-9 evidence. Use `python3 scripts/real_environment_ui_evidence.py --build`; bounded media with exact source/build identity. These real-environment gates are DEFERRED_TO_RELEASE during dev integration.
Durable owners: design/ux-contract.json, docs/features.md, docs/architecture.md, tests, docs/current-state.md. ADR only for material durable decisions. Complete slices when code/consumers/recovery/docs/evidence agree; transfer residual release evidence and delete this plan when coordination ends.
