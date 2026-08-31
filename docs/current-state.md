# Current state

## Engineering baseline

ClosedRoom follows `daniele21/repo-template-sw` **0.8.0** with target maturity **L2** and profiles `python`, `typescript`, `macos`, `local-ai`, `product-ui`.

The repository uses `dev` as the integration target for feature/fix/test work before promotion to the default branch.

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
- `scripts/real_environment_smoke.py` drives a freshly finalized `.app` on a real Apple Silicon Mac through macOS Accessibility, WKWebView keyboard/focus behavior, real TCC/native microphone+system-audio capture and persisted recording evidence. It runs ClosedRoom with an isolated temporary `HOME`, so the test catalog/settings/recording never enter the user's normal data, and writes privacy-safe evidence under `dist/evidence/real-environment/`.
- Packaging no longer requires a developer-machine absolute `local-llm-server` wheel path; the current integration points to its published release artifact and digest.
- Packaging precompiles the Core Audio helper without invoking user-facing `setup-audio`, so CI build does not install BlackHole or mutate audio routing merely to produce an artifact.

## Residual target-environment evidence

Automated packaged-app CI smoke remains deliberately classified as `representative_virtual`, not complete target evidence. For material UI/native-capture claims the real-Mac runner is:

```bash
python3 scripts/real_environment_smoke.py --build
```

That command can automate interactive WKWebView/accessibility-tree checks, `Cmd+K`/Escape focus behavior, real TCC status, native microphone + system-audio capture, Stop -> meeting navigation, persisted dual-source audio and zero-residue cleanup. macOS does not allow the runner to grant TCC/Accessibility permissions itself: a missing grant is reported as `blocked_permission` with remediation and the same command can then be rerun.

Evidence that remains genuinely separate:

- VoiceOver spoken-output quality and subjective usability judgement;
- production signing/notarization identity;
- production MLX/Metal model compatibility, memory, latency, throughput and quality when those claims are material.

Source-contract tests do not upgrade these claims.

## Current evidence status

The engineering baseline, exact-head remote preflight and UX simplification changes are integrated on `dev`. The real-environment runner is implemented on `test/real-environment-smoke`; it still requires its selected deterministic preflight before integration, and its target-environment evidence exists only after the command above is executed on a real Apple Silicon Mac.

Historical planning documents are not treated as current operational truth when they conflict with live branch/PR/CI state.

## Active workstream

- [`docs/workstreams/ux-simplification.md`](workstreams/ux-simplification.md): implementation is complete; UX-9 remains active until the declared target-macOS evidence is executed and classified.

## Next highest-value work

1. Obtain green exact-head remote preflight for `test/real-environment-smoke` using the selector-chosen profile and merge the runner into `dev` only after deterministic evidence is green.
2. Run `python3 scripts/real_environment_smoke.py --build` from a clean `dev` checkout on the real Apple Silicon Mac; grant only the TCC/Accessibility permissions that macOS requests and rerun unchanged if the result is `blocked_permission`.
3. Treat `pass`, `blocked_permission` and product/test failures as different outcomes; do not weaken the target-environment checks to bypass a real failure.
4. Move reproducible failures found on the real Mac into the cheapest sufficient automated environment while preserving genuinely physical/TCC/subjective evidence separately.
