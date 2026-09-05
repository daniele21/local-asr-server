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
- PRS-7 is integrated through PR #27 (`c7161a0055804e534f6b9b10169b183bc3c1ff16`): managed LLM/VLM residency releases after a phase and the owned cold sidecar stops after a bounded idle window with stale-timer race protection.
- PRS-6 is integrated through PR #28 (`bf4e3596a8cf0a9bd7fc24746dcde258c91ac4df`): screen context is explicit/off-by-default, no VLM runs during recording, and post-meeting analysis enriches the existing transcript through one persisted/cancellable `visual_intelligence` job using bounded `v2` routing and a 2048-work-item ceiling. Exact feature HEAD `5a9013c01c467c8bf5427b337b4d214294b9f798` passed INTEGRATION/STRONG remote preflight run `33958256522`, including frontend checks, the full Python suite, finalized ARM64 `.app` build and packaged-app smoke.
- PRS-8 is integrated through PR #30 (`c3377ab4a1f68cd90b7153bb1ca63c07c3a969c9`): normal Meeting processing follows persisted SSE job events instead of interval polling; terminal events reload canonical Meeting state and GET snapshots are recovery/reconnect-only. Persisted `job_events` are capped at 512 per job and persisted managers do not duplicate them into an undrained process-local queue. Exact final feature HEAD `cb722c654bf842f90620679a90f883a87accafea` passed INTEGRATION/STRONG remote preflight run `33962722390`, including frontend lint/typecheck, the full Python suite, finalized ARM64 `.app` build and packaged-app lifecycle smoke.

## Current evidence status

Representative before/after CPU/RSS evidence is still pending, so no performance percentage is claimed. The prior UX simplification still awaits its independent target-Mac evidence lane.

PRS-9 is active on `feature/audio-strategy-benchmark`. The current `both` capture persists `mixed`, `mic` and `system`, while normal ASR transcribes the non-silent `mic` and `system` tracks separately before cross-track deduplication/merge. A privacy-safe benchmark harness now compares that current strategy with one mixed-track ASR run using ASR audio seconds, wall time, normalized transcript similarity, timeline overlap and source-attribution retention. The harness does not mutate recordings, does not use transcription cache, forces the local provider and does not emit transcript text. No capture/transcription ownership change is allowed until representative target-Mac evidence supports it.

## Active workstreams

- [`ux-simplification.md`](workstreams/ux-simplification.md): integrated implementation; UX-9 waits on target-Mac evidence.
- [`product-runtime-simplification.md`](workstreams/product-runtime-simplification.md): PRS-5/6/7/8 integrated; PRS-9 benchmark evidence is active before any audio ownership decision and PRS-10 final convergence.

## Next highest-value work

1. Validate the PRS-9 benchmark harness and collect representative dual-track vs mixed evidence before changing capture/transcription ownership.
2. Use PRS-9 results to decide whether simpler audio ownership is justified; retain dual-track when quality or attribution evidence does not support simplification.
3. Capture comparable resource evidence before setting CPU/RSS targets.
4. Continue the independent target-Mac UX evidence lane using the canonical runner and exact-artifact reuse.
5. Close PRS-10 only after product/runtime behavior, deterministic gates and required real-environment evidence agree.
