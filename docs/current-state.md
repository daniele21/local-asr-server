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
- Canonical target-Mac runner `python3 scripts/real_environment_ui_evidence.py --build`; production signing/notarization, subjective VoiceOver usability and representative MLX/Metal performance remain separate claims.
- Product/runtime Wave 1 is integrated through PR #25 (`3fa29fb963b49f57cc4cbcce333d5f476f54659b`): Meeting-first setup, bounded recording UI cadence, capture-priority heavy-work admission, cold/on-demand managed LLM startup and simplified Settings.
- PRS-5 is integrated through PR #26 (`c62882bb17c50288266094db8e64fa2e7067f681`): Meeting Transcribe and Generate Notes are one-action normal workflows; technical overrides remain advanced.
- PRS-7 is integrated through PR #27 (`c7161a0055804e534f6b9b10169b183bc3c1ff16`): managed LLM/VLM residency releases after a phase and the owned cold sidecar stops after a bounded idle window with stale-timer race protection. Its exact feature HEAD passed INTEGRATION/STRONG including packaged-app smoke.

## Current evidence status

Representative before/after CPU/RSS evidence is still pending, so no performance percentage is claimed. The prior UX simplification still awaits its independent target-Mac evidence lane.

PRS-6 is the active Wave 2 candidate in PR #28. Screen context is explicit/off-by-default in New Meeting; no VLM runs during recording. If frames exist, Meeting offers a secondary post-meeting action that runs one persisted/cancellable `visual_intelligence` job through the existing arbiter, enriches the same transcript in place, uses explicit bounded `v2` routing and caps post-dedupe candidate work at 2048 before VLM inference. Exact feature HEAD `b405b239554cbad73342be53d269f42944f7548d` passed INTEGRATION/STRONG remote preflight run `33953887968`, including repository guards, frontend lint/typecheck, the full Python suite, finalized ARM64 `.app` build and packaged-app lifecycle smoke. Final durable-doc corrections are docs-only and still require exact-head repository/preflight confirmation or valid reusable evidence before merge.

## Active workstreams

- [`ux-simplification.md`](workstreams/ux-simplification.md): integrated implementation; UX-9 waits on target-Mac evidence.
- [`product-runtime-simplification.md`](workstreams/product-runtime-simplification.md): PRS-5/7 integrated; PRS-6 executable evidence confirmed and in final documentation convergence; PRS-8/9/evidence remain.

## Next highest-value work

1. Finish PRS-6 durable-doc alignment and exact-head preflight/reuse, then integrate only if the final PR head remains fully confirmed against current `dev`.
2. Replace normal processing polling with bounded job events while retaining recovery/reconnect fallback.
3. Run the audio strategy benchmark before changing dual-track capture/transcription ownership.
4. Capture comparable resource evidence before setting CPU/RSS targets.
5. Continue the independent target-Mac UX evidence lane using the canonical runner and exact-artifact reuse.
