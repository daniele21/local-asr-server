# UX simplification and critical journey hardening

Status: active — implementation complete; final evidence pending
Owner: frontend product experience
Read when: implementing or validating the ClosedRoom primary meeting journey and supporting accessibility work

## Goal

Make the normal ClosedRoom journey feel simple and task-led from meeting capture through transcript and insights, while preserving expert diagnostics behind progressive disclosure and keeping recovery clear when permissions, capture, transcription or analysis fail.

## Non-goals

- Rebrand ClosedRoom or replace the existing semantic design system.
- Remove expert/runtime capabilities that are useful for diagnostics.
- Change recording, transcription or analysis backend contracts unless required to preserve the user-facing journey.
- Treat screenshot polish as evidence of interaction quality.

## Invariants

- The canonical journey is `Home -> New Meeting -> Record -> Stop -> Transcribe -> Analyze -> Review`.
- Normal use must not require understanding backend, helper, process, port, model-path or routing concepts.
- Each critical surface has one dominant next action; destructive actions remain visually distinct.
- Complexity is disclosed as `essential -> contextual -> advanced -> diagnostics`.
- Permission, capture, processing and provider failures remain recoverable without losing the meeting.
- Existing semantic UI components/tokens remain the design-system owner.
- Keyboard/focus/assistive semantics and reduced-motion behavior are part of completion, not post-polish cleanup.

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
| UX-9 | Critical-journey automated evidence plus declared macOS REAL_ENVIRONMENT residual checks | tests/scripts/contracts/docs | UX-2, UX-3, UX-4, UX-5, UX-6, UX-7, UX-8 | no | ACTIVE |

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

- Repository product-experience verification, docs verification, frontend lint/typecheck and the selector-required deterministic suite pass on the integrated exact HEAD.
- Validation profile is selected from the actual complete diff and is not silently downgraded.
- The PR remains based on the current `dev` revision and the complete diff contains no unrelated/generated/private residue.
- Interactive WKWebView rendering/focus, VoiceOver behavior and real TCC/audio-device behavior remain explicitly `REAL_ENVIRONMENT` where repository automation cannot prove them.

Validation routing:

- `SCOPED` is expected from the current diff because executable changes are contained to `frontend/` and adopted `design/` / `docs/` owners are LEAN paths.
- Repository-owned PR preflight is the `REMOTE_AUTOMATED` executor in this session.
- `.engineering/e2e.json` remains authoritative for residual target-environment fidelity gaps.

## Evidence history

- Earlier integrated heads passed Repository health and SCOPED remote preflight while implementation slices were landing; those runs are useful regression-isolation evidence only and are not reused for a newer material HEAD.
- Final readiness is based only on the latest exact HEAD after this workstream-state update and PR metadata are current.

## Durable documentation destinations

- `design/ux-contract.json`: canonical journey, hierarchy/disclosure and validation expectations.
- `design/brand-kit.json`: unchanged because the adopted visual/motion principles did not change; implementation was brought closer to the existing contract.
- `docs/features/`: N/A; durable cross-surface behavior is sufficiently owned by the adopted UX contract and this active execution workstream.
- tests/contracts: existing repository deterministic suites remain the executable source of truth for the affected source boundaries.

## Completion

Automated implementation completion requires all selected deterministic gates to pass on the exact integrated HEAD/base. The workstream remains active after that when stronger claims still depend on the declared `target-macos-manual` residual evidence for interactive WKWebView focus/VoiceOver and real TCC/audio behavior.
