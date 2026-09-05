# UX simplification and critical journey hardening

Status: integrated for `dev` — deterministic/automated evidence complete; target-Mac confirmation DEFERRED_TO_RELEASE
Owner: frontend product experience
Read when: validating the ClosedRoom primary meeting journey or preparing `dev -> main`

## Goal

Make the normal ClosedRoom journey simple and task-led from capture through transcript and insights, while preserving expert diagnostics behind progressive disclosure and clear recovery for permission, capture, transcription and analysis failures.

## Invariants

- Canonical journey: `Home -> New Meeting -> Record -> Stop -> Transcribe -> Analyze -> Review`.
- Normal use must not require backend/helper/process/port/model-path/routing concepts.
- Each critical surface has one dominant next action.
- Complexity follows `essential -> contextual -> advanced -> diagnostics`.
- Failures remain recoverable without losing the meeting.
- Accessibility and reduced-motion behavior remain product criteria.
- Material UI/UX integration uses automated E2E evidence selected by `.engineering/e2e.json`; genuine target-Mac deltas are release evidence.

## Work graph

| ID | Work | State |
| --- | --- | --- |
| UX-1 | Golden path, hierarchy and disclosure contract | DONE |
| UX-2 | Simplified new-meeting/recording path | DONE |
| UX-3 | Guided meeting transcript-to-insights workspace | DONE |
| UX-4 | Analysis defaults + advanced disclosure | DONE |
| UX-5 | Preferences vs runtime diagnostics | DONE |
| UX-6 | Dashboard attention/next-action refinement | DONE |
| UX-7 | Shared accessibility semantics | DONE |
| UX-8 | Motion/icon/microcopy polish | DONE |
| UX-9 | Automated critical-journey evidence + release-only target-Mac confirmation | DONE for INTEGRATION; target-Mac DEFERRED_TO_RELEASE |

## Integrated experience

- `NewRecordingPage` owns fresh meetings; default surface shows title/project, readiness and dominant Start/Stop action.
- Permission/storage blockers use user language plus recovery actions; source/backend/runtime details are progressively disclosed.
- Successful finalization opens the saved Meeting workspace.
- Missing transcript makes Transcribe dominant; transcript without analysis makes Analyze dominant.
- Runtime/model/log/visual-debug details live under Details/Diagnostics.
- Transcript, Analysis and Speakers expose semantic keyboard-accessible tabs; menus restore focus correctly.
- Settings separate user defaults from service lifecycle/endpoints/model paths/logs.
- Dashboard search and period controls use semantic dialog/menu behavior.
- Touched composites expose accessible names/state/focus semantics and reduced-motion behavior.

## Integration evidence policy

For PRs targeting `dev`:
- selector-required deterministic tests and affected automated E2E are blocking;
- material UI/UX outcomes use the configured automated `FULL_MEDIA` requirement where applicable;
- `target-macos-real` is **not** an integration blocker;
- residual TCC, physical microphone/system-audio and interactive target-Mac fidelity are reported as `DEFERRED_TO_RELEASE`.

The implementation and deterministic automation are already integrated. No additional target-Mac run is required merely to continue feature development on `dev`.

## Release evidence

For `dev -> main`, the canonical target-Mac command is:

```bash
python3 scripts/real_environment_ui_evidence.py --build
```

The runner:
- reuses an exact-checkout finalized `.app` when available;
- keeps user data isolated in a temporary `HOME`;
- drives the real WKWebView through bounded AXUIElement/CGEvent automation;
- verifies TCC-backed `both` capture, Start/Stop, persisted mic + system audio and Stop -> Meeting navigation;
- retains screenshots for Ready, active recording and persisted Meeting plus one journey video;
- returns explicit blocked/incomplete/failure states rather than treating missing permissions or missing media as success.

Expected media:

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

VoiceOver spoken-output quality and subjective usability remain human evidence when materially required.

## Durable owners

- `design/ux-contract.json`: journey/hierarchy/disclosure.
- `.engineering/e2e.json`: integration/release environment policy, fidelity and media requirements.
- `scripts/macos_ax_helper.swift` + `scripts/macos_ui_driver.py`: bounded target-Mac Accessibility/keyboard automation.
- `scripts/real_environment_smoke.py`: functional target-Mac evidence.
- `scripts/real_environment_ui_evidence.py`: exact-artifact selection/reuse plus screenshot/video evidence.

## Completion

UX simplification is complete for development integration. Target-Mac evidence is a RELEASE acceptance gate and is tracked in `docs/current-state.md`; it must not keep PRs to `dev` open or block unrelated development work.
