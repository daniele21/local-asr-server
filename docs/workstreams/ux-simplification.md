# UX simplification and critical journey hardening

Status: active — implementation and deterministic automation complete; final target-environment evidence pending
Owner: frontend product experience
Read when: implementing or validating the ClosedRoom primary meeting journey

## Goal

Make the normal ClosedRoom journey simple and task-led from capture through transcript and insights, while preserving expert diagnostics behind progressive disclosure and clear recovery for permission, capture, transcription and analysis failures.

## Non-goals

- Rebrand ClosedRoom or replace the semantic design system.
- Remove useful expert/runtime diagnostics.
- Change recording/transcription/analysis backend contracts unless required by the user journey.
- Treat screenshots as a substitute for functional interaction evidence.

## Invariants

- Canonical journey: `Home -> New Meeting -> Record -> Stop -> Transcribe -> Analyze -> Review`.
- Normal use must not require backend/helper/process/port/model-path/routing concepts.
- Each critical surface has one dominant next action.
- Complexity follows `essential -> contextual -> advanced -> diagnostics`.
- Failures remain recoverable without losing the meeting.
- Accessibility and reduced-motion behavior are completion criteria.
- UI E2E retains screenshot/video artifacts required by `.engineering/e2e.json` without capturing unrelated desktop content.

## Work graph

| ID | Work | Owns/writes | State |
| --- | --- | --- | --- |
| UX-1 | Golden path, hierarchy and disclosure contract | `design/ux-contract.json`, this workstream | DONE |
| UX-2 | Simplified new-meeting/recording path | `NewRecordingPage.tsx`, `App.tsx` | DONE |
| UX-3 | Guided meeting transcript-to-insights workspace | `MeetingDetailPage.tsx` | DONE |
| UX-4 | Analysis defaults + advanced disclosure | `AnalysisSetupModal.tsx` | DONE |
| UX-5 | Preferences vs runtime diagnostics | `SettingsPage.tsx`, `App.tsx` | DONE |
| UX-6 | Dashboard attention/next-action refinement | `DashboardPage.tsx` | DONE |
| UX-7 | Shared accessibility semantics | shared UI/App consumers | DONE |
| UX-8 | Motion/icon/microcopy polish | primary journey call sites | DONE |
| UX-9 | Automated critical-journey evidence + macOS REAL_ENVIRONMENT confirmation | real-environment scripts, E2E contract, docs/tests | ACTIVE |

## Implemented experience

### New Meeting

- `NewRecordingPage` owns fresh meetings; historical recording detail remains in `RecordingPage`.
- Default surface shows title/project, readiness and dominant Start/Stop action.
- Permission/storage blockers use user language plus recovery actions.
- Source mode, diarization and visual intelligence are progressively disclosed.
- Capture/helper/audio-routing internals stay under Diagnostics.
- Successful finalization opens the meeting workspace by saved recording ID.

### Meeting workspace

- Missing transcript makes Transcribe dominant; transcript without analysis makes Analyze dominant.
- Runtime/model/log/visual-debug details live under Details/Diagnostics.
- Transcript, Analysis and Speakers use semantic tabs with roving focus and Arrow/Home/End navigation.
- Analysis menus support composite keyboard navigation and Escape focus restoration.

### Analysis / Settings / Dashboard / accessibility

- Analysis exposes provider/model/quality first; temperature, reasoning, token limits, JSON mode, model path and runtime state are Advanced.
- Global shell keeps user navigation, `New Meeting`, health and settings; Local LLM runtime actions are not primary navigation.
- Settings separate user defaults from service lifecycle/endpoints/model paths/logs.
- Dashboard search uses shared Radix Dialog; period selection exposes menu/radio semantics and keyboard navigation.
- Tooltip, icon actions, menus and touched composites expose names/state/focus semantics; decorative motion was reduced on the primary path.

## UX-9 acceptance

- Repository/product-experience/docs checks and selector-required deterministic validation pass on the integrated head.
- `.engineering/e2e.json` declares `target-macos-real` and keeps the meeting-recording journey at `FULL_MEDIA` because timing/lifecycle/native capture sequence is part of the claim.
- Canonical target-Mac command:

```bash
python3 scripts/real_environment_ui_evidence.py --build
```

- `real_environment_ui_evidence.py` wraps `real_environment_smoke.py`; it does not duplicate functional ownership.
- Functional smoke verifies packaged WKWebView accessibility/focus, `Cmd+K`/Escape, native TCC readiness, mic + system capture, Start/Stop, persisted dual-source audio and Stop -> meeting navigation.
- UI interaction is driven by a bounded direct `AXUIElement`/`CGEvent` helper instead of AppleScript/System Events tree enumeration; action timeout and traversal limits make automation failure explicit and bounded.
- A dirty checkout remains a hard preflight failure so evidence is attributable to one source revision; the report includes the offending `git status --porcelain` entries.
- UI wrapper retains screenshots for Ready, active recording, and persisted meeting/Transcribe plus a complete app-window journey video.
- Packaged execution uses an isolated temporary `HOME`; normal settings/catalog/recordings remain untouched.
- Media is restricted to the ClosedRoom window and synthetic/local test content.
- Missing grants return `blocked_permission`; a passing smoke with missing media returns `E2E_EVIDENCE_INCOMPLETE` and is not completion.
- VoiceOver spoken-output quality and subjective usability remain separate human judgement.

Validation routing:

- Target-Mac runner/driver changes are **STRONG** under the 0.9.1 risk selector (`runtime_native_persistence_e2e`).
- Integration requires governance, source tests and packaged-app evidence; the real target-Mac run remains `REAL_ENVIRONMENT` and cannot be replaced by hosted macOS.
- `.engineering/e2e.json` is authoritative for target fidelity, required media and residual gaps.

## Real-environment result classes

- `PASS` / exit `0`: functional target-Mac smoke passed and all required media exists.
- `blocked_permission` / exit `2`: grant only the requested Accessibility/Microphone/Screen & System Audio Recording permission, then rerun unchanged.
- `E2E_EVIDENCE_INCOMPLETE` / exit `1`: functional smoke passed but screenshot/video evidence is incomplete; fix the media evidence path rather than accepting the run.
- `checkout_clean` fail / exit `1`: preserve local edits, resolve the reported dirty entries, then rerun from the same clean revision.
- other `fail` / exit `1`: product/test/environment invariant failed and must be diagnosed.

Expected media beside `report.json`:

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

The underlying smoke emits a short local phrase via macOS `say` while recording so system audio is exercised without user content.

## Evidence history

- UX implementation passed exact-head SCOPED remote preflight before integration.
- Functional real-environment smoke and UI-media wrapper were integrated after deterministic validation.
- A real-Mac run exposed unbounded System Events accessibility traversal as runner infrastructure rather than a product regression; the automation owner was hardened with direct bounded AX APIs and deterministic macOS compile tests.
- Target completion exists only after the canonical UI-evidence command produces functional `status: pass` plus a complete media manifest on the real Mac. `blocked_permission` and dirty-checkout failures are preparation/attribution states, not completion.

## Durable owners

- `design/ux-contract.json`: journey/hierarchy/disclosure.
- `.engineering/e2e.json`: environment fidelity, UI media requirements and canonical target runner.
- `scripts/macos_ax_helper.swift` + `scripts/macos_ui_driver.py`: bounded target-Mac Accessibility/keyboard automation.
- `scripts/real_environment_smoke.py`: functional target-Mac evidence.
- `scripts/real_environment_ui_evidence.py`: UI screenshot/video evidence and canonical target-Mac entrypoint.
- `test/test_macos_ui_driver.py`: driver timeout/permission/bounds/Swift-compile coverage.
- `test/test_real_environment_smoke.py`: functional runner helper/cleanup/source-attribution safety checks.

## Completion

UX-9 becomes `DONE` after `python3 scripts/real_environment_ui_evidence.py --build` produces a passing functional report and complete screenshot/video manifest on the real target Mac. VoiceOver spoken-output quality remains separately observed human evidence.
