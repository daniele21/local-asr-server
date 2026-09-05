# Current state

## Engineering baseline

ClosedRoom follows `daniele21/repo-template-sw` **0.9.2** at maturity **L2** with `python`, `typescript`, `macos`, `local-ai`, `product-ui`. Changes integrate through `dev`; `dev -> main` is RELEASE. PRs into `dev` require selector-owned deterministic/E2E evidence, while applicable target-Mac `REAL_ENVIRONMENT` evidence is `DEFERRED_TO_RELEASE`.

## Integrated baseline

- Exact-head/tree-equivalent remote preflight, immutable finalized artifacts and packaged-app lifecycle smoke are established.
- Product/runtime PRS-5..8 are integrated: Meeting-first defaults, visual intelligence on demand, bounded managed model residency and persisted SSE job progress with 512-event/job retention.
- PRS-9 benchmark tooling is integrated; dual-track audio remains canonical until representative release evidence supports a change.
- PRS-11 is integrated through PR #35: saved Meeting core content opens independently from diagnostics/visual routes, with local accessory recovery and browser FULL_MEDIA evidence.
- PRS-12 is integrated through PR #36 at `8075b366af387af5f5d0fbd1dd6faf3d4fb5e7fe`: `Prepare notes` is one durable Meeting workflow backed by a persisted `meeting_preparation` parent, reuse/cancel/restart/resume contracts and `meeting-preparation-recovery` FULL_MEDIA. Existing transcription/analysis managers and `HeavyWorkloadArbiter` remain the execution owners.
- Canonical target-Mac runner: `python3 scripts/real_environment_ui_evidence.py --build`. Production signing/notarization, subjective VoiceOver usability and representative MLX/Metal performance remain release claims.

## Current integration candidate

PRS-13 is implemented on PR #37 and is **not yet in `dev`**. The implicit `meeting_default` path executes one internal `meeting_notes_shared` v2 physical analysis job instead of four overlapping default jobs while preserving `meeting_deep`, explicit `analysis_types` and expert analysis behavior.

The canonical `closedroom.meeting_notes` v2 result separates generated summary/actions/decisions/risks and requires transcript source references. Short inputs use one extraction; long inputs use bounded segment-aware chunks and aggregation, with explicit failure rather than silent truncation. Each chunk may cite only supplied segment ids and aggregation may cite only references already present in partial results.

Only the real canonical run is persisted. Meeting and analysis-run read surfaces derive stable virtual `meeting_brief`, `action_items`, `decisions` and `risks_blockers` projections, so existing UI/history/API reads coexist with old persisted v1 runs without synthetic jobs or a new catalog owner. Structured cache identity includes segment ids/timing/speaker/text.

The fixed decision rubric covers schema validity, factual support, action/decision recall, attribution, latency, inference count/tokens and peak-memory status. Deterministic short/long fixtures must preserve expected facts and attribution while the short default reduces physical inference count from four to one. Comparable production MLX memory/quality remains release evidence and is explicitly unknown when no representative baseline exists.

Required integration evidence is selector-owned STRONG validation: full source suite, frontend deterministic checks, existing `meeting-preparation-recovery` FULL_MEDIA, and packaged-app smoke when selected. Draft ITERATION guards are green; exact-head INTEGRATION execution remains blocking before merge.

## Release evidence still pending

Representative CPU/RSS/Metal/thermal evidence, target-Mac UX/TCC/native-audio confirmation, PRS-9 representative audio comparison and any material production ASR/LLM quality/latency claim remain release work. No production performance gain is claimed from the deterministic PRS-13 cost proxy alone.

## Active workstreams

- [`meeting-value-efficiency.md`](workstreams/meeting-value-efficiency.md): PRS-11/12 integrated; PRS-13 integration candidate.
- [`product-runtime-simplification.md`](workstreams/product-runtime-simplification.md): PRS-10 convergence remains open.
- [`ux-simplification.md`](workstreams/ux-simplification.md): deterministic work integrated; target-Mac confirmation remains a release gate.

## Next highest-value work

1. Complete exact-head INTEGRATION validation for PRS-13; merge only if selector-required source/FULL_MEDIA/package gates agree.
2. Then advance PRS-14 verifiable/editable notes on top of the integrated v2 schema.
3. Keep PRS-15/16 available as independent slices and collect representative resource, audio-strategy and target-Mac evidence for `dev -> main` release acceptance.
