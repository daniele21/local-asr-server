# UX simplification and critical journey hardening

Status: active — implementation and deterministic automation complete; final target-environment evidence pending
Owner: frontend product experience
Read when: implementing or validating the ClosedRoom primary meeting journey and supporting accessibility work

## Goal

Make the normal ClosedRoom journey feel simple and task-led from meeting capture through transcript and insights, while preserving expert diagnostics behind progressive disclosure and keeping recovery clear when permissions, capture, transcription or analysis fail.

## Non-goals

- Rebrand ClosedRoom or replace the existing semantic design system.
- Remove expert/runtime capabilities that are useful for diagnostics.
- Change recording, transcription or analysis backend contracts unless required to preserve the user-facing journey.
- Treat screenshot polish as evidence of interaction quality; screenshot/video artifacts accompany, rather than replace, functional assertions.

## Invariants

- The canonical journey is `Home -> New Meeting -> Record -> Stop -> Transcribe -> Analyze -> Review`.
- Normal use must not require understanding backend, helper, process, port, model-path or routing concepts.
- Each critical surface has one dominant next action; destructive actions remain visually distinct.
- Complexity is disclosed as `essential -> contextual -> advanced -> diagnostics`.
- Permission, capture, processing and provider failures remain recoverable without losing the meeting.
- Existing semantic UI components/tokens remain the design-system owner.
- Keyboard/focus/assistive semantics and reduced-motion behavior are part of completion, not post-polish cleanup.
- UI E2E evidence must retain the screenshot/video artifacts required by `.engineering/e2e.json` without capturing unrelated desktop content.

## Work graph

| ID | Work | Owns/writes | Depends on | Parallel | State |
| --- | --- | --- | --- | --- | --- |
| UX-1 | Codify golden path, hierarchy and disclosure contract | `design/ux-contract.json`, this workstream | — | no | DONE |
| UX-2 | Simplify new-meeting/recording default path and permission recovery | `frontend/src/pages/NewRecordingPage.tsx`, `frontend/src/App.tsx` | UX-1 | yes | DONE |
| UX-3 | Make meeting detail the guided transcript-to-insights workspace; hide runtime diagnostics | `frontend/src/pages/MeetingDetailPage.tsx` | UX-1 | yes | DONE |
| UX-4 | Simplify analysis setup with strong defaults and advanced disclosure | `frontend/src/components/ui/AnalysisSetupModal.tsx` | UX-1 | yes | DONE |
| UX-5 | Separate user preferences from runtime diagnostics; remove runtime action from global header | `frontend/src/pages/SettingsPage.tsx`, `frontend/src/App.tsx` | UX-1 | yes | DONE |
| UX-6 | Refine dashboard around attention and next action without redesign | `frontend/src/pages/DashboardPage.tsx` | UX-1 | yes | DONE |
| UX-7 | Harden shared accessibility semantics for tooltip/menu/search/tabs and icon actions | `frontend/src/components/ui`, `frontend/src/App.tsx`, affected semantic consumers | UX-1 | yes | DONE |
| UX-8 | Reduce decorative motion and normalize icon/microcopy treatment on the primary journey | affected presentation call sites | UX-2, UX-3, UX-4, UX-5, UX-6, UX-7 | no | DONE |
| UX-9 | Critical-journey automated evidence plus declared macOS REAL_ENVIRONMENT confirmation | `scripts/real_environment_smoke.py`, `scripts/real_environment_ui_evidence.py`, `.engineering/e2e.json`, tests/docs | UX-2, UX-3, UX-4, UX-5, UX-6, UX-7, UX-8 | no | ACTIVE |

Allowed states: `READY`, `ACTIVE`, `BLOCKED`, `DONE`.

## Implemented experience

### New Meeting / recording

- The ordinary `New Meeting` route now uses `NewRecordingPage`; the historical recording detail remains owned by `RecordingPage` when a recording ID is present.
- A configured user sees title, project, readiness and the dominant Start/Stop action without opening technical configuration.
- Storage and permission blockers are summarized in user language with an immediate recovery action.
- Source mode, diarization and visual intelligence are progressively disclosed as meeting options.
- Capture backend, helper/permission internals and audio routing remain available under Diagnostics rather than the default path.
- The existing `useRecorder` capture lifecycle remains the runtime owner; no parallel capture implementation was introduced.
- After successful finalization the saved recording ID opens the meeting workspace directly.

### Meeting workspace

- Missing transcription makes Transcribe the dominant next action.
- A transcript without analysis makes Analyze the dominant next action.
- Runtime/backend/model/log and visual-debug details are absent from the normal processing surface and live under Details/Diagnostics.
- Transcript, Analysis and Speakers use a semantic tablist with roving focus and `ArrowLeft` / `ArrowRight` / `Home` / `End` navigation.
- The analysis action menu supports composite-menu keyboard navigation and restores focus on Escape.

### Analysis setup

- Normal setup exposes provider/runtime trust choice plus model and quality where applicable.
- Temperature, reasoning, token limits, JSON mode, model path and runtime status are under Advanced.
- Existing provider payload contracts remain unchanged.

### Settings and global shell

- The global header keeps navigation, `New Meeting`, service health and user-level settings; Local LLM runtime UI is no longer a peer primary action.
- Stable online health is informational rather than continuously animated.
- The Settings menu exposes `expanded`/menu semantics and supports ArrowUp/ArrowDown/Home/End/Escape with focus restoration.
- User-facing storage, transcription, analysis and meeting defaults are separated from service lifecycle, endpoint, model-path, expert parameters and logs under Advanced & diagnostics.

### Dashboard

- Home continues to answer what happened, what needs attention and what to open next without increasing default information density.
- Search uses the shared Radix Dialog, inheriting focus trap, Escape close and focus return.
- Period selection exposes menu/radio state and ArrowUp/ArrowDown/Home/End/Escape keyboard behavior.
- Icon-only search/technical controls have explicit accessible names.
- Decorative page-entry/lift motion was removed from the touched dashboard path; state/progress motion remains available where meaningful.

### Shared accessibility

- Tooltip content is reachable on focus and exposed through `role="tooltip"` / `aria-describedby`.
- Shared Dialog close labeling follows the active application language.
- Touched composite controls expose names, selected/expanded state and keyboard focus behavior without introducing a second global interaction owner.

## Current executable slice

`UX-9`

Acceptance:

- Repository product-experience verification, docs verification, frontend lint/typecheck and the selector-required deterministic suite pass on the exact integrated head.
- `.engineering/e2e.json` declares `target-macos-real`, adopts E2E contract `0.1.1`, and requires screenshot + video artifacts for UI journeys.
- The canonical target-Mac command is `python3 scripts/real_environment_ui_evidence.py --build` from a clean current `dev` checkout.
- `scripts/real_environment_ui_evidence.py` invokes the underlying `real_environment_smoke.py`, so the functional target-Mac assertions remain owned by the existing smoke runner rather than duplicated.
- The underlying smoke verifies an accessible packaged WKWebView, `Cmd+K`/Escape focus behavior, real native capture/TCC readiness, Start/Stop, persisted native `both` audio with non-empty mic + system tracks, and Stop -> meeting navigation.
- The UI evidence wrapper retains window-scoped screenshots for `Ready to record`, active `Stop and Save`, and persisted-meeting `Transcribe`, plus a complete app-window journey video.
- The runner launches the packaged executable with an isolated temporary `HOME`; normal ClosedRoom settings/catalog/recordings are untouched and the sandbox is removed on every non-debug exit.
- Media capture is restricted to the ClosedRoom application window and uses synthetic/local test content; unrelated desktop content is outside the declared evidence surface.
- Missing macOS grants produce `blocked_permission` plus concrete remediation rather than a false product failure.
- A functionally passing smoke with incomplete screenshot/video evidence returns `E2E_EVIDENCE_INCOMPLETE` and is not accepted as completion.
- VoiceOver spoken-output quality and subjective usability remain an explicit human-judgement residual after the deterministic accessibility-tree/keyboard checks pass.

Validation routing:

- The integrated UI-media evidence boundary is `STRONG`: `.engineering/e2e.json` is an explicit runtime/native/E2E validation boundary, while the wrapper is contained execution tooling.
- The current integrated `dev` revision has successful Repository Health and selector-chosen STRONG remote preflight evidence, including governance, frontend deterministic checks, Python suite, finalized macOS arm64 build and packaged `.app` lifecycle smoke.
- Repository-owned remote preflight is the `REMOTE_AUTOMATED` executor for deterministic repository/source/package checks.
- `target-macos-real` is `REAL_ENVIRONMENT`; it must run on the user's actual Apple Silicon Mac and is not replaced by GitHub-hosted macOS.
- `.engineering/e2e.json` remains authoritative for target-environment fidelity, required UI media and residual gaps.

## Real-environment runner

Canonical command from a clean current `dev` checkout:

```bash
python3 scripts/real_environment_ui_evidence.py --build
```

Result classes:

- `PASS` with process exit `0`: the underlying target-Mac smoke passed and all required screenshots/video were retained.
- `blocked_permission` with process exit `2`: macOS requires Accessibility, Automation, Microphone or Screen & System Audio Recording permission; grant only the requested item and rerun the same command.
- `E2E_EVIDENCE_INCOMPLETE` with process exit `1`: functional smoke passed but required screenshot/video evidence is missing or empty; diagnose the media owner rather than accepting the run.
- other `fail` / exit `1`: product/test/environment invariant failed and should be diagnosed rather than bypassed.

The underlying smoke emits a short local test phrase through macOS `say` while native capture is active so the system-audio path is exercised without using user content. The recording lives only inside the temporary HOME.

Expected media layout beside the functional `report.json`:

```text
ui-media/meeting-recording-ui/
  manifest.json
  screenshots/
    01-ready-to-record.png
    02-recording.png
    03-meeting-persisted.png
  video/
    journey.mov
```

## Evidence history

- UX implementation exact-head SCOPED remote preflight passed before integration to `dev`; those runs prove the UI/source changes but do not count as target-environment evidence.
- The functional real-environment runner was integrated after exact-head deterministic validation.
- The later UI-media evidence integration adopted E2E contract `0.1.1`; the current integrated `dev` revision passed selector-chosen STRONG remote preflight and Repository Health.
- Target-environment completion is recorded only after the canonical UI-evidence command produces a functional `status: pass` report and complete screenshot/video manifest on the real target Mac; `blocked_permission` is a rerunnable environment-preparation state, not completion.

## Durable documentation destinations

- `design/ux-contract.json`: canonical journey, hierarchy/disclosure and validation expectations.
- `design/brand-kit.json`: unchanged because the adopted visual/motion principles did not change; implementation was brought closer to the existing contract.
- `.engineering/e2e.json`: canonical execution-environment fidelity, required UI media artifacts and real-environment runner declaration.
- `scripts/real_environment_smoke.py`: functional target-Mac evidence owner.
- `scripts/real_environment_ui_evidence.py`: canonical target-Mac UI journey entrypoint and screenshot/video evidence owner.
- `test/test_real_environment_smoke.py`: deterministic helper/cleanup/evidence safety checks for the functional runner.

## Completion

UX-9 can move to `DONE` after `python3 scripts/real_environment_ui_evidence.py --build` produces a passing functional report plus complete screenshot/video manifest on the real target Mac. VoiceOver spoken-output quality remains a separately stated human-judgement observation and does not get silently converted into CI evidence.
