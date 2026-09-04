# Current state

## Engineering baseline

ClosedRoom follows `daniele21/repo-template-sw` **0.9.1** at maturity **L2** with `python`, `typescript`, `macos`, `local-ai`, `product-ui`. Feature/fix/test work integrates through `dev` before promotion. Delivery is staged as `ITERATION -> INTEGRATION -> RELEASE`, with validation selected from risk dimensions and required gates rather than running the broadest suite after every edit.

## Strong evidence to preserve

- Broad Python unit/integration coverage plus explicit runtime/service/job/port ownership.
- Focused native capture, diarization and visual-intelligence tests.
- Version-aware macOS packaging and native-helper validation.
- Semantic React UI tokens/components.

## Baseline capabilities now implemented

- `scripts/select_validation_profile.py` selects risks, required gates and LEAN / SCOPED / STRONG / FULL shorthand; unknown executable/owner paths fail safe to FULL.
- `.github/workflows/preflight.yml` provides exact-head remote validation at integration/release and may reuse equivalent evidence only when the 0.9.1 identity contract allows it.
- `scripts/build_artifact.sh` creates immutable, uniquely identified finalized artifacts; finalization records manifest, SHA-256 evidence and build delta.
- `scripts/smoke_packaged_app.py` verifies the finalized `.app`, bundled FastAPI/static frontend, readiness and cleanup.
- `scripts/real_environment_smoke.py` owns functional target-Mac evidence: packaged WKWebView/accessibility behavior, TCC/native mic + system-audio capture, persisted dual-source recording, Stop -> meeting navigation and isolated-HOME cleanup.
- Target-Mac UI automation uses a bounded direct `AXUIElement`/`CGEvent` driver compiled from `scripts/macos_ax_helper.swift`, avoiding unbounded AppleScript/System Events tree enumeration. Per-action timeouts and bounded tree traversal keep runner failures classifiable.
- A dirty target-Mac checkout remains a hard preflight failure so the built artifact is attributable to one revision; the report includes the exact `git status --porcelain` entries that caused the block.
- `scripts/real_environment_ui_evidence.py` is the canonical target-Mac UI entrypoint. It wraps the functional smoke and retains required app-window screenshots plus a journey video under `dist/evidence/real-environment/.../ui-media/meeting-recording-ui/`.
- `.engineering/e2e.json` uses risk-based UI evidence and keeps the real meeting-recording journey at `FULL_MEDIA` fidelity.
- Packaging uses the published `local-llm-server` artifact and precompiles Core Audio without mutating user audio routing.

## Residual target-environment evidence

Hosted packaged-app smoke is `representative_virtual`, not target evidence. For the meeting-recording UI/native-capture claim, run on the real Apple Silicon Mac from a clean current `dev` checkout:

```bash
python3 scripts/real_environment_ui_evidence.py --build
```

Required media:

- ready-to-record screenshot;
- active-recording screenshot;
- persisted-meeting / Transcribe screenshot;
- complete ClosedRoom app-window video;
- `manifest.json` tied to the journey/source revision.

Capture is restricted to the ClosedRoom window and uses synthetic/local test content inside a temporary `HOME`. A passing functional smoke with missing media returns `E2E_EVIDENCE_INCOMPLETE`, not success. Missing TCC/Accessibility grants return `blocked_permission`; grant only the requested permission and rerun unchanged. A dirty checkout fails before build and reports the offending status entries rather than producing non-attributable evidence.

Still separate from automation: VoiceOver spoken-output/subjective usability, production signing/notarization, and material production MLX/Metal compatibility/performance/quality claims.

## Current evidence status

UX implementation and deterministic target-Mac tooling are integrated through the normal `dev` flow only after selector-required automated gates pass. `target-macos-real` remains pending until the command above passes with complete media on the actual Apple Silicon Mac.

## Active workstream

- [`docs/workstreams/ux-simplification.md`](workstreams/ux-simplification.md): implementation and deterministic automation complete; UX-9 waits only for target-Mac evidence.

## Next highest-value work

1. Run `python3 scripts/real_environment_ui_evidence.py --build` from a clean current `dev` checkout on the target Mac.
2. If `checkout_clean` fails, preserve local changes and resolve the reported `source_dirty_entries`; do not bypass the exact-source gate.
3. If `blocked_permission`, grant only the requested permission and rerun unchanged.
4. Require functional `status: pass` plus the complete screenshot/video manifest; do not accept `E2E_EVIDENCE_INCOMPLETE`.
5. Review VoiceOver spoken output/usability separately.
6. Move reproducible real-Mac failures into the cheapest sufficient automated environment where possible.
