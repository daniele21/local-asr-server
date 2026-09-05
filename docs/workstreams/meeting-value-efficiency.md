# ClosedRoom: useful notes, simple journeys and efficient execution

Status: active — PRS-13 integration candidate
Owner: meeting product, canonical job/persistence owners and local runtime
Baseline: dev `8075b366`, 2026-09-05.

## Outcome and invariants

Record, prepare useful notes, verify decisions and find them later while the Mac stays usable. PRS-11 and PRS-12 are integrated; PRS-13 is the current integration candidate. No production-model performance or memory gain is claimed without representative evidence.

- Meeting is primary; normal recording requires no technical choice.
- `Prepare notes` is explicit after Stop; `Transcript only` is secondary.
- Reuse valid transcript, then existing notes analysis. Ready notes open first; explicit tab selection wins.
- Audio/transcript survive enrichment failure/cancel. Local-first and explicit cloud opt-in remain unchanged.
- Canonical owners stay unchanged: RecordingStore capture, JobStore durable jobs, CatalogStore persisted runs/indexes, HeavyWorkloadArbiter heavy-work scheduling, runtime services managed cleanup.
- Excluded: rewrite, second scheduler/runtime/index owner, implicit cloud, mandatory visuals, unproven audio strategy.

## Work graph

| ID | Observable outcome | Owner paths/contracts | Depends on | State |
| --- | --- | --- | --- | --- |
| PRS-11 | Fast saved Meeting open | MeetingDetailPage, API client, visual hook | — | DONE |
| PRS-12 | One recoverable Prepare notes action | jobs, analysis/transcription services, Meeting UI | PRS-11 | DONE |
| PRS-13 | Consistent notes with less repeated inference | analysis templates/jobs/service/catalog reads | PRS-12 | INTEGRATION |
| PRS-14 | Verify/edit actions and decisions | notes schema/catalog, transcript, Meeting UI | PRS-13 | BLOCKED |
| PRS-15 | Search complete local archive | CatalogStore, workspace/API/UI | — | READY |
| PRS-16 | Record safely while AI is busy | RecordingStore, resource policy/arbiter/runtime | — | READY |
| PRS-17 | Coherent macOS workspace | App/pages/components/design contracts | PRS-12,14,15,16 | BLOCKED |
| PRS-18 | Measured release | current-state, benchmarks, target-Mac evidence | selected increments | BLOCKED |

Default sequence: 11 -> 12 -> 13 -> 14 -> 15 -> 16 -> 17. PRS-15/16 may advance earlier, but shared schema/service/UI edits remain serialized into coherent outcome PRs.

## PRS-11 — integrated

Saved Meeting core content loads independently from diagnostics and visual services. Accessory errors/retries stay local, stale route responses are ignored and terminal reloads are coalesced. Evidence includes focused tests and `saved-meeting-fast-open` FULL_MEDIA. Target WKWebView/TCC fidelity remains release evidence when material.

## PRS-12 — integrated

`Prepare notes` is a durable `meeting_preparation` JobStore parent that composes the existing transcription and analysis jobs. Durable identity covers recording source, effective ASR options and analysis/template identity; valid transcripts skip ASR. Cancel prevents future stages including admission races, restart interrupts incomplete work and explicit resume starts from the first missing stage. Meeting follows the parent SSE, exposes transcript before notes finish and does not promote output from failed/interrupted/cancelled preparation pipelines. Existing expert transcription/analysis APIs remain compatible. Integration evidence included owner/API/persistence tests plus `meeting-preparation-recovery` FULL_MEDIA and packaged-app smoke.

## PRS-13 — shared structured notes — integration candidate

Goal: reduce overlapping default inference without degrading useful output. Version summary/actions/decisions/risks with source references, separate generated content from future edits and preserve legacy reads.

Implementation candidate:
- `meeting_default` with no explicit `analysis_types` executes one internal `meeting_notes_shared` v2 analysis job instead of four overlapping physical jobs; `meeting_deep`, explicit analysis types and expert single analyses remain unchanged.
- The canonical result is `closedroom.meeting_notes` schema v2 with a `generated` boundary containing summary, actions, decisions and risks. Every non-empty generated claim requires a canonical transcript segment reference with timing/speaker metadata when available.
- One real persisted v2 run is projected at read time into stable `meeting_brief`, `action_items`, `decisions` and `risks_blockers` views. No synthetic jobs or database rows are created; old persisted v1 runs continue to be read unchanged.
- Structured cache identity includes transcript segment ids/timing/speaker/text so source-reference changes cannot reuse stale cached output.
- Short inputs use one extraction. Long inputs use bounded source-aware chunks plus bounded aggregation. A source chunk can cite only segment ids supplied to that chunk; aggregation can cite only refs present in its partials. Inputs beyond the configured bound fail explicitly instead of truncating.
- The internal shared template is hidden from the public template picker, and PRS-12 still composes whatever physical analysis jobs the existing `AnalysisJobManager` returns. `HeavyWorkloadArbiter` remains the only heavy-work scheduler.

Decision gate: the deterministic rubric records schema validity, factual support, action/decision recall, attribution, latency, inference count/tokens and peak-memory status. Representative short/long fixtures must preserve expected facts and source attribution while the short default reduces physical inference count from four to one. Comparable production MLX peak-memory/resource data remains release evidence; missing comparable data stays explicitly `unknown`, never inferred.

Acceptance before merge:
- default preparation creates one physical analysis child and still exposes all four logical default note views;
- explicit deep/custom analysis behavior remains compatible;
- source refs cannot cross source-chunk/aggregation boundaries;
- cache keys invalidate when source-reference metadata changes even if transcript text is unchanged;
- old v1 runs and virtual v2 projection reads coexist;
- long input is bounded and never silently truncated;
- existing preparation partial-failure/retry journey remains green in FULL_MEDIA.

Checks: schema/projection/cache/long-input/source-boundary tests, existing analysis/preparation suites, frontend deterministic checks, `meeting-preparation-recovery` FULL_MEDIA and selector-owned STRONG gates. Production model quality/latency/RSS and target WKWebView/TCC fidelity remain release deltas unless an integration-comparable baseline exists.

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
