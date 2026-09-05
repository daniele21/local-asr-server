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
- Product/runtime simplification Wave 1 is integrated on `dev` at `3fa29fb963b49f57cc4cbcce333d5f476f54659b`: Meeting-first setup, bounded recording UI cadence, capture-priority heavy-work admission, cold/on-demand managed LLM startup and simplified Settings hierarchy.
- Wave 1 exact-head INTEGRATION/STRONG automation passed repository guards, frontend lint/typecheck, the Python suite, finalized ARM64 `.app` build and packaged-app lifecycle smoke before merge.

## Current evidence status

The prior UX simplification is integrated on `dev`; its final target-Mac evidence remains pending through the canonical command above.

Product/runtime Wave 1 is automated-preflight confirmed and integrated. Representative before/after CPU/RSS evidence is still pending, so no performance percentage is claimed. Wave 2 is active from fresh `dev` and owns one-action meeting processing, visual intelligence on demand, bounded cold AI shutdown and event-driven progress.

## Active workstreams

- [`ux-simplification.md`](workstreams/ux-simplification.md): integrated implementation; UX-9 waits on target-Mac evidence.
- [`product-runtime-simplification.md`](workstreams/product-runtime-simplification.md): Wave 1 integrated; Wave 2 active, starting with simple Meeting processing before its frontend event-progress convergence.

## Next highest-value work

1. Make Meeting `Transcribe` and `Generate Notes` one-action normal workflows using persisted defaults; keep technical transcription/analysis controls as Advanced/Import tools.
2. Progress visual-on-demand and cold-AI lifecycle lanes independently where ownership does not overlap.
3. Replace normal processing polling with bounded job events after the PRS-5 Meeting workflow converges; retain polling only for reconnect/recovery.
4. Capture comparable resource evidence before setting CPU/RSS targets.
5. Continue the independent target-Mac UX evidence lane; require functional PASS plus complete media, and reuse the exact artifact across permission retries.
