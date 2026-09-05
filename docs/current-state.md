# Current state

## Engineering baseline

ClosedRoom follows `daniele21/repo-template-sw` **0.9.2** at maturity **L2** with `python`, `typescript`, `macos`, `local-ai`, `product-ui`. Changes integrate through `dev`; `dev -> main` is RELEASE. PRs into `dev` require selector-owned deterministic/E2E evidence, while applicable target-Mac `REAL_ENVIRONMENT` evidence is `DEFERRED_TO_RELEASE`.

## Integrated baseline

- Exact-head/tree-equivalent remote preflight, immutable finalized artifacts and packaged-app lifecycle smoke are established.
- Product/runtime PRS-5..8 are integrated: Meeting-first defaults, visual intelligence on demand, bounded managed model residency and persisted SSE job progress with 512-event/job retention.
- PRS-9 benchmark tooling is integrated; dual-track audio remains canonical until representative release evidence supports a change.
- PRS-11 is integrated through PR #35 at `0d5d3fa479fe5519f49e1b369d39d8e30cc2f0ab`: saved Meeting core content opens independently from diagnostics/visual routes, with local accessory recovery and browser FULL_MEDIA evidence.
- Canonical target-Mac runner: `python3 scripts/real_environment_ui_evidence.py --build`. Production signing/notarization, subjective VoiceOver usability and representative MLX/Metal performance remain release claims.

## Current integration candidate

PRS-12 is implemented on PR #36 and is **not yet in `dev`**. `Prepare notes` becomes the normal one-action Meeting workflow; `Transcript only` and advanced analysis remain secondary/expert paths. A persisted `meeting_preparation` parent composes existing transcription and analysis jobs while `HeavyWorkloadArbiter` remains the only heavy-work scheduler.

The parent persists dedupe identity and child-stage links. A valid transcript skips ASR; cancel prevents future stages; restart leaves incomplete work `interrupted`; explicit resume continues from the first missing stage. Partial/failed preparation output is not promoted as canonical ready notes. Meeting follows the parent SSE, exposes the transcript before notes finish and opens ready notes first unless the user selected another tab.

Required integration evidence includes owner/API tests plus browser FULL_MEDIA `meeting-preparation-recovery`: prepare -> transcript ready -> reconnect same parent -> notes failure -> explicit resume without ASR rerun -> notes ready. Exact-head INTEGRATION evidence is still blocking before merge.

## Release evidence still pending

Representative CPU/RSS/Metal/thermal evidence, target-Mac UX/TCC/native-audio confirmation, PRS-9 representative audio comparison and any material production ASR/LLM quality/latency claim remain release work. No performance gain or mixed-track advantage is claimed without that evidence.

## Active workstreams

- [`meeting-value-efficiency.md`](workstreams/meeting-value-efficiency.md): PRS-12 integration candidate; PRS-13 follows it.
- [`product-runtime-simplification.md`](workstreams/product-runtime-simplification.md): PRS-10 convergence remains open.
- [`ux-simplification.md`](workstreams/ux-simplification.md): deterministic work integrated; target-Mac confirmation remains a release gate.

## Next highest-value work

1. Complete exact-head INTEGRATION validation for PRS-12; merge only if selector-required gates agree.
2. Then advance PRS-13 shared structured notes without introducing another analysis/runtime owner.
3. Collect representative resource, audio-strategy and target-Mac evidence for `dev -> main` release acceptance.
