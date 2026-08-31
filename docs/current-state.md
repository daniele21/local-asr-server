# Current state

## Engineering baseline

ClosedRoom follows `daniele21/repo-template-sw` **0.8.0** with target maturity **L2** and profiles `python`, `typescript`, `macos`, `local-ai`, `product-ui`.

The 0.8 baseline is integrated on `speaker_detection`, the advanced product branch that was verified ahead of `main`, `pipeline`, `tech-improvements` and `ux-refactoring` at adoption time.

## Strong existing evidence to preserve

- Detailed current architecture and a broad Python unit/integration suite.
- Explicit runtime/service/job/port ownership.
- Native macOS capture, diarization and visual-intelligence boundaries with focused tests.
- Existing visual + diarization smoke tooling and representative datasets.
- Version-aware macOS app packaging and native-helper validation.
- Code-first semantic UI tokens/components in the React frontend.

## Baseline gaps now implemented

- Blast radius is machine-selected by `scripts/select_validation_profile.py` into LEAN / SCOPED / STRONG / FULL; unknown paths fail safe to FULL.
- `.github/workflows/preflight.yml` provides exact-head, read-only remote preflight and routes source/package validation by selected profile.
- Canonical builds use `scripts/build_artifact.sh`; successful artifacts receive unique identity and immutable lineage directories under `dist/artifacts/`.
- `scripts/finalize_build_artifact.py` creates `build-manifest.json`, aggregate SHA-256 evidence, `SHA256SUMS`, `BUILD_CHANGELOG.md` against the previous successful comparable build and bounded local retention.
- `scripts/clean_build_state.py` removes transient build state without deleting finalized successful artifacts by default.
- `scripts/smoke_packaged_app.py` exercises the finalized `.app` frozen executable, bundled FastAPI/static frontend, readiness, graceful stop, listener cleanup and observed child cleanup.
- Packaging no longer requires a developer-machine absolute `local-llm-server` wheel path; the current 0.3.8 integration points to its published release artifact and digest.
- Packaging precompiles the Core Audio helper without invoking user-facing `setup-audio`, so CI build does not install BlackHole or mutate audio routing merely to produce an artifact.

## Residual target-environment evidence

Automated packaged-app smoke is deliberately classified as `representative_virtual`, not complete target evidence. These remain separate when a change makes them material:

- interactive WKWebView/window/focus behavior;
- real TCC prompts and permission identity;
- physical microphone and system-audio device behavior;
- production signing/notarization identity;
- production MLX/Metal model compatibility, memory, latency, throughput and quality.

Source-contract tests likewise do not upgrade these claims.

## Current evidence status

The gap-closing implementation is on `close-baseline-gaps`. Its deterministic unit checks and exact-head GitHub Actions preflight must pass on the resulting PR before these mechanisms are considered proven on `speaker_detection`. Until that run exists, implementation is present but remote execution evidence is pending.

Historical planning documents still need a separate lifecycle cleanup; they are not treated as current operational truth.

## Active workstream

- [`docs/workstreams/ux-simplification.md`](workstreams/ux-simplification.md): simplify the primary meeting journey, progressively disclose runtime diagnostics, and harden accessibility/evidence across recording, meeting review, analysis and settings.

## Next highest-value work

1. Obtain green exact-head remote preflight for the gap-closing PR, including finalized `.app` package smoke on macOS arm64.
2. Fix any failing gate at its owning invariant rather than weakening the profile or check.
3. Merge the gap closure into `speaker_detection` only after deterministic evidence is green.
4. Continue moving reproducible failures found only during final macOS testing into the cheapest sufficient automated environment while preserving genuinely physical/TCC/model evidence separately.
