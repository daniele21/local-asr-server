# Current state

## Engineering baseline

ClosedRoom follows `daniele21/repo-template-sw` **0.9.2** at maturity **L2** with `python`, `typescript`, `macos`, `local-ai`, `product-ui`. Work integrates through `dev` before stable promotion to `main`; delivery is `ITERATION -> INTEGRATION -> RELEASE` with selector-owned risk gates.

The stage boundary is explicit: PRs into `dev` require affected deterministic and automated E2E evidence, while residual `REAL_ENVIRONMENT` evidence is declared `DEFERRED_TO_RELEASE`. Promotion `dev -> main` is `RELEASE` and requires FULL automated validation plus every applicable blocking target-environment confirmation.

## Evidence to preserve

- Broad Python unit/integration coverage and explicit runtime/job ownership.
- Native capture, diarization and visual-intelligence tests.
- Version-aware macOS packaging/native-helper validation.
- Semantic React UI contracts.
- Risk-based automated E2E before `dev`; target-Mac/TCC/physical-audio evidence before `main` when applicable.

## Integrated baseline

- Exact-head/tree-equivalent remote preflight and immutable finalized artifacts.
- Packaged `.app` lifecycle smoke plus risk-based E2E evidence.
- Canonical target-Mac runner `python3 scripts/real_environment_ui_evidence.py --build`; production signing/notarization, subjective VoiceOver usability and representative MLX/Metal performance remain separate release claims.
- Product/runtime Wave 1 is integrated through PR #25 (`3fa29fb963b49f57cc4cbcce333d5f476f54659b`): Meeting-first setup, bounded recording UI cadence, capture-priority heavy-work admission, cold/on-demand managed LLM startup and simplified Settings.
- PRS-5 is integrated through PR #26 (`c62882bb17c50288266094db8e64fa2e7067f681`): Meeting Transcribe and Generate Notes are one-action normal workflows; technical overrides remain advanced.
- PRS-7 is integrated through PR #27 (`c7161a0055804e534f6b9b10169b183bc3c1ff16`): managed LLM/VLM residency releases after a phase and the owned cold sidecar stops after a bounded idle window with stale-timer race protection.
- PRS-6 is integrated through PR #28 (`bf4e3596a8cf0a9bd7fc24746dcde258c91ac4df`): screen context is explicit/off-by-default, no VLM runs during recording, and post-meeting analysis enriches the existing transcript through one persisted/cancellable `visual_intelligence` job using bounded `v2` routing and a 2048-work-item ceiling. Exact feature HEAD `5a9013c01c467c8bf5427b337b4d214294b9f798` passed INTEGRATION/STRONG remote preflight run `33958256522`.
- PRS-8 is integrated through PR #30 (`c3377ab4a1f68cd90b7153bb1ca63c07c3a969c9`): normal Meeting processing follows persisted SSE job events instead of interval polling; terminal events reload canonical Meeting state and GET snapshots are recovery/reconnect-only. Persisted `job_events` are capped at 512 per job and persisted managers do not duplicate them into an undrained process-local queue. Exact final feature HEAD `cb722c654bf842f90620679a90f883a87accafea` passed INTEGRATION/STRONG remote preflight run `33962722390`.
- PRS-9 benchmark tooling is integrated through PR #31 (`c4d02525ad6485b2c59ecf49997543be6ce1c2f5`). Exact feature HEAD `c66348dd592913e60b62767ace869c708a33fb90` passed INTEGRATION/SCOPED remote preflight run `33965247318`, including frontend checks and 334 Python tests. The harness compares dual-track `mic + system` ASR with one mixed-track pass without mutating recordings, using cache, persisting transcripts or emitting transcript text.

## Current evidence status

Representative before/after CPU/RSS, target-Mac UX/TCC/native-audio confirmation and representative PRS-9 audio-strategy measurements remain pending **release evidence**. They do not block PRs into `dev` and no performance percentage or mixed-track advantage is claimed without them.

Dual-track audio remains canonical on `dev`. The PRS-9 target-Mac benchmark will be collected at release acceptance; if that evidence justifies changing audio ownership, the change must return through `dev` with its normal automated validation before promotion to `main`.

## Active workstreams

- [`product-runtime-simplification.md`](workstreams/product-runtime-simplification.md): PRS-5/6/7/8 and PRS-9 tooling integrated; PRS-10 automated convergence can proceed on `dev`. Residual target-Mac evidence is deferred to release.
- [`ux-simplification.md`](workstreams/ux-simplification.md): implementation and deterministic automation are integrated; target-Mac FULL_MEDIA confirmation is a release gate rather than a development-branch blocker.

## Next highest-value work

1. Complete PRS-10 product/runtime convergence on `dev` using selector-required deterministic and automated E2E gates only.
2. Capture comparable resource evidence when preparing `dev -> main`; do not set CPU/RSS targets before measurement.
3. Run the PRS-9 representative audio benchmark during release acceptance and retain dual-track unless evidence supports simplification.
4. Run canonical target-Mac UX/TCC/native-audio FULL_MEDIA evidence during `dev -> main` release acceptance.
5. Promote to `main` only when FULL automated validation and all applicable release-only real-environment evidence agree.
