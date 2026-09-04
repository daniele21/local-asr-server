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
- `scripts/real_environment_ui_evidence.py` is the canonical target-Mac UI entrypoint. With `--build` it first looks for a successful clean finalized `.app` whose manifest `source.revision` matches the checkout and reuses that exact bundle across TCC permission reruns. It builds only when no exact artifact exists, then restores only Vite's generated `src/local_asr_server/static/` output and verifies the checkout is clean before starting the smoke.
- The same UI wrapper retains required app-window screenshots plus a journey video under `dist/evidence/real-environment/.../ui-media/meeting-recording-ui/` and records whether the artifact was `reused_exact`, `built_exact` or explicit.
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

Capture is restricted to the ClosedRoom window and uses synthetic/local test content inside a temporary `HOME`. A passing functional smoke with missing media returns `E2E_EVIDENCE_INCOMPLETE`, not success. Missing TCC/Accessibility grants return `blocked_permission`; grant only the requested permission and rerun the same command. Because the exact finalized app is reused, an ad-hoc-signed target build keeps the same TCC identity across those reruns instead of forcing a fresh approval on every attempt. A dirty checkout still fails before build and reports the offending status entries rather than producing non-attributable evidence.

Still separate from automation: VoiceOver spoken-output/subjective usability, production signing/notarization, and material production MLX/Metal compatibility/performance/quality claims.

## Current evidence status

The previously integrated UX simplification and deterministic target-Mac tooling remain on `dev`; `target-macos-real` is still pending until the canonical command above passes with complete media on the actual Apple Silicon Mac.

A new product/runtime simplification workstream is active on `feature/product-runtime-simplification`. Its first convergence wave now has implementation for the meeting-first New Meeting surface, bounded recording UI cadence, capture-priority heavy-work admission, cold/on-demand managed LLM startup and simplified Settings hierarchy. These changes are **not integrated truth yet**: selector-required deterministic validation and the complete integration diff review still have to pass on the exact feature HEAD before merge to `dev`. Representative before/after CPU/RSS evidence is also still pending, so no percentage performance improvement is claimed.

## Active workstreams

- [`docs/workstreams/ux-simplification.md`](workstreams/ux-simplification.md): integrated implementation and deterministic automation complete; UX-9 waits only for target-Mac evidence.
- [`docs/workstreams/product-runtime-simplification.md`](workstreams/product-runtime-simplification.md): Wave 1 implementation checkpoint ready for integration validation; later waves own simple processing, visual on-demand, cold AI lifecycle, event-driven progress and evidence-led audio optimization.

## Next highest-value work

1. Validate the exact Wave 1 `feature/product-runtime-simplification` head against current `dev` using the repository selector and all required deterministic integration gates; fix owning causes before merge.
2. After Wave 1 automated evidence is confirmed, converge it to `dev` and begin PRS-5/6/7 plus the backend half of PRS-8 in parallel as defined by the workstream DAG.
3. Capture representative before/after resource evidence before setting or claiming CPU/RSS improvement targets.
4. Keep the independent target-Mac UX evidence lane moving through `python3 scripts/real_environment_ui_evidence.py --build`; repeated runs on one clean revision must reuse the same finalized app.
5. If target-Mac evidence returns `blocked_permission`, grant only the requested permission and rerun the same command without rebuilding; require functional `status: pass` plus complete media.
6. Keep VoiceOver spoken output/usability, production signing/notarization and representative production MLX/Metal performance as separate evidence classes.
