# Current state

## Engineering baseline

ClosedRoom follows `daniele21/repo-template-sw` **0.8.0** at maturity **L2** with `python`, `typescript`, `macos`, `local-ai`, `product-ui`. Feature/fix/test work integrates through `dev` before promotion.

## Strong evidence to preserve

- Broad Python unit/integration coverage plus explicit runtime/service/job/port ownership.
- Focused native capture, diarization and visual-intelligence tests.
- Version-aware macOS packaging and native-helper validation.
- Semantic React UI tokens/components.

## Baseline gaps now implemented

- `scripts/select_validation_profile.py` selects LEAN / SCOPED / STRONG / FULL; unknown paths fail safe to FULL.
- `.github/workflows/preflight.yml` provides exact-head remote preflight.
- `scripts/build_artifact.sh` creates immutable, uniquely identified finalized artifacts; finalization records manifest, SHA-256 evidence and build delta.
- `scripts/smoke_packaged_app.py` verifies the finalized `.app`, bundled FastAPI/static frontend, readiness and cleanup.
- `scripts/real_environment_smoke.py` owns functional target-Mac evidence: packaged WKWebView/accessibility behavior, TCC/native mic + system-audio capture, persisted dual-source recording, Stop -> meeting navigation and isolated-HOME cleanup.
- `scripts/real_environment_ui_evidence.py` is the canonical target-Mac UI entrypoint. It wraps the functional smoke and retains required app-window screenshots plus a journey video under `dist/evidence/real-environment/.../ui-media/meeting-recording-ui/`.
- `.engineering/e2e.json` uses E2E contract **0.1.1** and requires screenshot + video artifacts for UI journeys.
- Packaging uses the published `local-llm-server` artifact and precompiles Core Audio without mutating user audio routing.

## Residual target-environment evidence

Hosted packaged-app smoke is `representative_virtual`, not target evidence. For the meeting-recording UI/native-capture claim, run on the real Apple Silicon Mac:

```bash
python3 scripts/real_environment_ui_evidence.py --build
```

Required media:

- ready-to-record screenshot;
- active-recording screenshot;
- persisted-meeting / Transcribe screenshot;
- complete ClosedRoom app-window video;
- `manifest.json` tied to the journey/source revision.

Capture is restricted to the ClosedRoom window and uses synthetic/local test content inside a temporary `HOME`. A passing functional smoke with missing media returns `E2E_EVIDENCE_INCOMPLETE`, not success. Missing TCC/Accessibility grants return `blocked_permission`; grant only the requested permission and rerun unchanged.

Still separate from automation: VoiceOver spoken-output/subjective usability, production signing/notarization, and material production MLX/Metal compatibility/performance/quality claims.

## Current evidence status

UX implementation, the functional real-environment runner and the screenshot/video wrapper are integrated on `dev`. The integrated revision has successful Repository Health and selector-chosen **STRONG** remote preflight covering governance, frontend checks, Python suite, finalized macOS arm64 build and packaged `.app` smoke.

A first target-Mac run on clean `dev@3a3f154a3475` confirmed arm64/package validity, loopback health, isolated user data and zero-residue cleanup, then failed before native-capture interaction because the initial `System Events` WKWebView window probe exceeded its fixed 15-second timeout. That finding is classified as a real-environment automation-readiness defect, not evidence of a ClosedRoom runtime failure. The runner now retries bounded UI readiness, preserves Accessibility permission errors as `blocked_permission`, retries transient UI press failures, and avoids forcing the media window probe frontmost before bounds are available.

`target-macos-real` remains pending until the canonical command passes with complete media.

## Active workstream

- [`docs/workstreams/ux-simplification.md`](workstreams/ux-simplification.md): implementation and deterministic automation complete; UX-9 waits only for target-Mac evidence.

## Next highest-value work

1. Validate the UI-readiness runner fix with selector-required remote preflight and integrate it into `dev`.
2. Run `python3 scripts/real_environment_ui_evidence.py --build` from a clean current `dev` checkout on the target Mac.
3. If `blocked_permission`, grant only the requested permission and rerun unchanged.
4. Require functional `status: pass` plus the complete screenshot/video manifest; do not accept `E2E_EVIDENCE_INCOMPLETE`.
5. Review VoiceOver spoken output/usability separately.
6. Move any further reproducible real-Mac failure into the cheapest sufficient automated environment where possible.
