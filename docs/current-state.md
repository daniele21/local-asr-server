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
- `scripts/real_environment_smoke.py` owns the functional target-Mac smoke: real packaged WKWebView/accessibility behavior, TCC/native microphone + system-audio capture, persisted dual-source recording evidence, Stop -> meeting navigation and zero-residue cleanup inside an isolated temporary `HOME`.
- `scripts/real_environment_ui_evidence.py` is the canonical target-environment UI journey entrypoint. It wraps the functional smoke and retains required window-scoped screenshot checkpoints plus a complete app-window video under `dist/evidence/real-environment/.../ui-media/meeting-recording-ui/`.
- `.engineering/e2e.json` adopts E2E contract **0.1.1** and requires screenshot + video artifacts for UI journeys.
- Packaging no longer requires a developer-machine absolute `local-llm-server` wheel path; the current integration points to its published release artifact and digest.
- Packaging precompiles the Core Audio helper without invoking user-facing `setup-audio`, so CI build does not install BlackHole or mutate audio routing merely to produce an artifact.

## Residual target-environment evidence

Automated packaged-app CI smoke remains deliberately classified as `representative_virtual`, not complete target evidence. For the material meeting-recording UI/native-capture claim the canonical real-Mac command is:

```bash
python3 scripts/real_environment_ui_evidence.py --build
```

That command runs the underlying target-Mac smoke and additionally captures the required UI media evidence for the real WKWebView journey:

- ready-to-record checkpoint screenshot;
- active-recording checkpoint screenshot;
- persisted-meeting / Transcribe checkpoint screenshot;
- complete ClosedRoom app-window video for the journey;
- `manifest.json` tying the media to the target-environment journey and source revision.

The media wrapper restricts capture to the ClosedRoom application window and the smoke uses synthetic/local test content in an isolated temporary `HOME`. A successful functional smoke with missing screenshot/video evidence is reported as `E2E_EVIDENCE_INCOMPLETE` and is not accepted as a pass.

macOS does not allow the runner to grant TCC/Accessibility permissions itself: a missing grant is reported as `blocked_permission`; grant only the requested permission and rerun the same canonical command.

Evidence that remains genuinely separate:

- VoiceOver spoken-output quality and subjective usability judgement;
- production signing/notarization identity;
- production MLX/Metal model compatibility, memory, latency, throughput and quality when those claims are material.

Source-contract tests do not upgrade these claims.

## Current evidence status

The engineering baseline, UX simplification implementation, real-environment functional runner and screenshot/video UI-evidence wrapper are integrated on `dev`.

The current integrated `dev` revision has successful Repository Health and selector-chosen **STRONG** remote preflight evidence, including governance verification, frontend deterministic checks, the Python unit/integration suite, finalized macOS arm64 build and packaged `.app` lifecycle smoke. This is deterministic automated readiness; it does not replace the declared `target-macos-real` run.

Target-environment completion exists only after the canonical command above produces a passing functional report and complete screenshot/video manifest on a real Apple Silicon Mac.

Historical planning documents are not treated as current operational truth when they conflict with live branch/PR/CI state.

## Active workstream

- [`docs/workstreams/ux-simplification.md`](workstreams/ux-simplification.md): implementation and deterministic automation are complete; UX-9 remains active until the declared target-macOS UI evidence is executed and classified.

## Next highest-value work

1. From a clean current `dev` checkout on the target Apple Silicon Mac, run `python3 scripts/real_environment_ui_evidence.py --build`.
2. If the result is `blocked_permission`, grant only the requested Accessibility/Automation/Microphone/Screen & System Audio Recording permission and rerun the same command unchanged.
3. Require both the functional `status: pass` report and complete `ui-media/meeting-recording-ui` screenshot/video manifest; do not downgrade `E2E_EVIDENCE_INCOMPLETE` to success.
4. Review VoiceOver spoken-output quality and subjective usability separately after the automated target-Mac run passes.
5. Move reproducible failures found on the real Mac into the cheapest sufficient automated environment while preserving genuinely physical/TCC/subjective evidence separately.
