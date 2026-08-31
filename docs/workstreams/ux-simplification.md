# UX simplification and critical journey hardening

Status: active
Owner: frontend product experience
Read when: implementing or coordinating the ClosedRoom primary meeting journey and supporting accessibility work

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
| UX-1 | Codify golden path, hierarchy and disclosure contract | `design/ux-contract.json`, this workstream | — | no | ACTIVE |
| UX-2 | Simplify new-meeting/recording default path and permission recovery | `frontend/src/pages/RecordingPage.tsx`, recording-specific UI helpers/i18n | UX-1 | yes | BLOCKED |
| UX-3 | Make meeting detail the guided transcript-to-insights workspace; hide runtime diagnostics | `frontend/src/pages/MeetingDetailPage.tsx`, meeting-specific UI/i18n | UX-1 | yes | BLOCKED |
| UX-4 | Simplify analysis setup with strong defaults and advanced disclosure | `frontend/src/components/AnalysisSetupModal.tsx`, analysis setup i18n | UX-1 | yes | BLOCKED |
| UX-5 | Separate user preferences from runtime diagnostics; remove runtime action from global header | `frontend/src/pages/SettingsPage.tsx`, `frontend/src/App.tsx`, settings/header i18n | UX-1 | yes | BLOCKED |
| UX-6 | Refine dashboard around attention and next action without redesign | `frontend/src/pages/DashboardPage.tsx`, dashboard-specific UI/i18n | UX-1 | yes | BLOCKED |
| UX-7 | Harden shared accessibility semantics for tooltip/menu/search/tabs and icon actions | `frontend/src/components/ui`, affected semantic consumers | UX-1 | yes | BLOCKED |
| UX-8 | Reduce decorative motion/glow and normalize icon/microcopy treatment | `frontend/src/index.css`, affected presentation-only call sites | UX-2, UX-3, UX-4, UX-5, UX-6, UX-7 | no | BLOCKED |
| UX-9 | Critical-journey automated evidence plus declared macOS REAL_ENVIRONMENT residual checks | tests/scripts/contracts/docs | UX-2, UX-3, UX-4, UX-5, UX-6, UX-7, UX-8 | no | BLOCKED |

Allowed states: `READY`, `ACTIVE`, `BLOCKED`, `DONE`.

Parallel work must stay inside the declared write boundaries or use an explicit integration commit.

## Current executable slice

`UX-1`

Acceptance:

- `design/ux-contract.json` declares the canonical golden path and disclosure tiers.
- The normal-path contract explicitly excludes internal runtime concepts unless they create user value or are needed for recovery.
- Recording, meeting, analysis and settings slices have observable user-outcome acceptance criteria in this workstream.

Validation:

- `python3 scripts/verify_product_experience.py`
- `python3 scripts/verify_docs.py`

## Slice acceptance

### UX-2 Recording

- A configured user can start a default `microphone + computer` meeting from the main form without opening technical settings.
- Readiness is summarized as a user-facing ready/blocking state; detailed backend diagnostics are not in the default path.
- Missing microphone/screen permission exposes one clear recovery action and supports retry.
- Source mode, diarization and visual intelligence remain discoverable as contextual/advanced options.

### UX-3 Meeting workspace

- If transcription is missing, transcription is the dominant next action.
- If transcript exists and analysis is missing, analysis is the dominant next action.
- Runtime/backend/model/log details are absent from normal processing state and available only through explicit details/diagnostics disclosure.
- Transcript/insights/speakers navigation has correct semantic selection relationships and keyboard focus behavior.

### UX-4 Analysis setup

- Default choice is understandable as Local vs Cloud/provider plus a user-facing quality preset.
- Temperature, reasoning, token limits, JSON mode and model paths do not appear until Advanced is opened.
- The current explicit provider/runtime trust choice remains preserved.

### UX-5 Settings/header

- Global header contains primary navigation, `New Meeting`, and user-level settings controls; Local LLM runtime UI is not a peer primary action.
- User preference sections remain separate from service lifecycle/log/port/model diagnostics.

### UX-6 Dashboard

- Home answers `what happened`, `what needs attention`, and `what should I open/do next` without increasing default density.
- Search and period controls use accessible interaction semantics.

### UX-7 Accessibility

- Tooltip content is reachable by keyboard and exposed with assistive semantics.
- Custom menus/search/tabs expose appropriate roles, names, selected/expanded state and focus behavior.
- Icon-only critical controls have accessible names.

### UX-8 Visual polish

- Frequent interactions use restrained motion; attention animation is reserved for actual state/progress/urgency.
- Functional icons use Lucide rather than emoji where practical.
- Hard-coded locale-specific functional copy in touched surfaces is removed.

### UX-9 Evidence

- Required repository product-experience verification, frontend lint/typecheck and selected E2E/contract checks pass on exact HEAD.
- Validation profile is selected from the actual diff and is not silently downgraded.
- Interactive WKWebView/focus/VoiceOver/TCC evidence remains explicitly `REAL_ENVIRONMENT` where automation cannot prove it.

## Integration points

- `design/ux-contract.json` owns journey/disclosure semantics used by every slice.
- Shared component changes in UX-7 land before consumers depend on their semantics.
- UX-8 may tune presentation only after task hierarchy is stable.
- UX-9 validates the integrated exact head rather than reusing evidence from earlier slice commits.

## Durable documentation destinations

- `design/ux-contract.json`: canonical journey, hierarchy/disclosure and validation expectations.
- `design/brand-kit.json`: only if semantic visual/motion rules materially change.
- `docs/features/`: only when durable user-visible feature behavior changes beyond the design contract.
- tests/contracts: executable critical-journey and accessibility-adjacent deterministic truth.

## Completion

The workstream is complete only when applicable code, interaction states, recovery, accessibility, adaptive behavior, validation/evidence and durable docs agree. Then update `docs/current-state.md` and delete this file by default.
