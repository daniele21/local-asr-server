# Current state

## Engineering baseline

ClosedRoom follows `daniele21/repo-template-sw` **0.9.1** at maturity **L2** with `python`, `typescript`, `macos`, `local-ai`, `product-ui`. Work integrates through `dev` before stable promotion to `main`; delivery is `ITERATION -> INTEGRATION -> RELEASE` with selector-owned risk gates.

## Evidence to preserve

- Broad Python unit/integration coverage and explicit runtime/job ownership.
- Native capture, diarization and visual-intelligence tests.
- Version-aware macOS packaging/native-helper validation.
- Semantic React UI contracts.

## Integrated baseline

- Exact-head/tree-equivalent remote preflight and immutable finalized artifacts.
- Packaged `.app` lifecycle smoke plus risk-based E2E evidence.
- Canonical target-Mac runner `python3 scripts/real_environment_ui_evidence.py --build`, with exact-artifact reuse across TCC retries, bounded AX automation, isolated HOME and ClosedRoom-window-only media.
- `target-macos-real` remains separate from hosted evidence; production signing/notarization, subjective VoiceOver usability and representative MLX/Metal performance remain separate claims.

## Current evidence status

The prior UX simplification is integrated on `dev`; its final target-Mac evidence remains pending through the canonical command above.

`feature/product-runtime-simplification` now contains the first new convergence wave: Meeting-first New Meeting, bounded recording UI cadence, capture-priority heavy-work admission, cold/on-demand managed LLM startup and simplified Settings hierarchy. This is **not integrated truth yet**: exact-head selector-required integration gates and final diff/doc review must pass before merge. Representative before/after CPU/RSS evidence is pending, so no performance percentage is claimed.

## Active workstreams

- [`ux-simplification.md`](workstreams/ux-simplification.md): integrated implementation; UX-9 waits on target-Mac evidence.
- [`product-runtime-simplification.md`](workstreams/product-runtime-simplification.md): Wave 1 implementation checkpoint; later waves own simple processing, visual on-demand, cold AI lifecycle, event progress and evidence-led audio optimization.

## Next highest-value work

1. Validate exact Wave 1 head against current `dev`; fix owning causes, then integrate.
2. After Wave 1 convergence, run PRS-5/6/7 and backend PRS-8 in parallel per the workstream DAG.
3. Capture comparable resource evidence before setting CPU/RSS targets.
4. Continue the independent target-Mac UX evidence lane; require functional PASS plus complete media, and reuse the exact artifact across permission retries.
