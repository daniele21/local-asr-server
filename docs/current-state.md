# Current state

## Engineering baseline

ClosedRoom follows `daniele21/repo-template-sw` **0.8.0** with target maturity **L2** and profiles `python`, `typescript`, `macos`, `local-ai`, `product-ui`.

The canonical branch model is now `feature/fix/... -> dev -> main`. `dev` is the integration target for ordinary changes; `main` is stable-only.

## Current validated baseline

`dev` and `main` currently carry the same product/config/test tree after the validated `dev -> main` promotion on 30 August 2026. The promoted stable state has successful repository-health and FULL remote-preflight evidence, including deterministic frontend/Python checks, macOS arm64 packaging and finalized `.app` lifecycle smoke.

This automated evidence does **not** upgrade the residual real-environment claims listed below.

## Active workstream

- [`docs/workstreams/resource-efficient-runtime.md`](workstreams/resource-efficient-runtime.md) coordinates resource-efficiency hardening: latest-source `local-llm-server` integration, bounded heavy-workload orchestration, capture backpressure, process/memory telemetry and soak evidence.

## Strong existing evidence to preserve

- Detailed current architecture and a broad Python unit/integration suite.
- Explicit runtime/service/job/port ownership.
- Progressive recording persistence with native macOS capture and browser fallback.
- Native capture, diarization and visual-intelligence boundaries with focused tests.
- Existing visual + diarization smoke tooling and representative fixtures.
- Version-aware macOS app packaging and native-helper validation.
- Exact-head remote preflight with blast-radius profile selection.
- Canonical builds through `scripts/build_artifact.sh`, immutable finalized artifacts, manifest/SHA-256 evidence and packaged-app smoke.
- Local-first trust boundary with explicit remote-provider selection and privacy-safe diagnostics contracts.

## Known resource/runtime gaps

- ClosedRoom still pins `local-llm-server` 0.3.8 even though the dependency repository has materially newer resource-aware runtime behavior.
- Heavy transcription/diarization/analysis jobs can still be launched from independent daemon threads; the existing model lease records intent but is not a global bounded scheduler.
- Native high-frequency capture telemetry retains unbounded event history for a long meeting.
- Browser chunk uploads are serialized but do not have an explicit pending-byte/chunk budget.
- Process/RSS/unified-memory/model-residency metrics are not yet a first-class ClosedRoom resource contract.
- Long-context analysis and canonical transcript+visual evidence fusion remain follow-up product/runtime work.

## Residual target-environment evidence

Automated packaged-app smoke is deliberately representative rather than complete target evidence. These remain separate when a change makes them material:

- interactive WKWebView/window/focus behavior;
- real TCC prompts and permission identity;
- physical microphone and system-audio device behavior;
- production signing/notarization identity;
- production MLX/Metal model compatibility, memory, latency, throughput and quality;
- representative long-running thermal/memory-pressure behavior.

Source-contract tests and virtual macOS runners do not upgrade these claims.

## Next highest-value work

1. Execute the parallel `resource-efficient-runtime` slices that have non-conflicting ownership boundaries.
2. Integrate the latest validated `local-llm-server` source reproducibly instead of duplicating its internal resource manager in ClosedRoom.
3. Establish one bounded ClosedRoom owner for cross-workload heavy-AI scheduling with capture-first priority.
4. Bound capture/browser producer-consumer paths and add process/resource observability.
5. Run STRONG/FULL exact-head automated preflight according to the selector, then close only the residual representative macOS/MLX evidence in the real environment.
