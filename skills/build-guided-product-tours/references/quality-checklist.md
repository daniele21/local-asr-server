# Guided Tour Quality Checklist

## Coverage

- Map the shortest path from entry to successful outcome.
- Cover all primary workflows.
- Cover secondary actions that affect output, privacy, cost, permissions, export, or recovery.
- Include empty, loading, success, and relevant error states.
- Explain prerequisites before the user reaches a blocked action.
- Split long tours into quick-start, full, and contextual tours.

## Step Quality

- Give every step a stable semantic ID.
- Target a stable `data-tour` hook or semantic identifier.
- Highlight one meaningful region.
- Explain user value and expected result.
- Prefer user action completion over repeated Next clicks.
- Keep controls reachable through keyboard navigation.
- Announce step changes through an `aria-live` region.
- Expose progress, Back, Next, Skip, and Close consistently.

## State Safety

- Snapshot active view, scroll position, open panels, selected tabs, form values, and demo data.
- Restore state on completion, cancellation, exceptions, and page visibility changes.
- Avoid real writes, uploads, recording sessions, downloads, or destructive actions in demo mode.
- Mark synthetic data clearly in code and isolate it behind a demo-state adapter.
- Cancel pending timers, intervals, animation frames, fetches, and event listeners.

## Spotlight And Popover

- Keep the target fully visible before positioning the popover.
- Recompute on scroll, resize, font loading, content changes, and view transitions.
- Support fallback placements and clamp both horizontal and vertical coordinates.
- Avoid covering the next required control.
- Allow interaction through the spotlight only when the step expects it.
- Handle targets larger than the viewport with a focused subtarget or anchored callout.
- Respect reduced-motion preferences.

## Showcase And Recording

- Use deterministic fixtures and bounded event waits.
- Add enough dwell time to read each step without making the video slow.
- Show visible actions, not only explanatory text.
- Avoid browser permission prompts during the recorded sequence.
- Detect a supported `MediaRecorder` MIME type.
- Stop every captured track when finished or cancelled.
- Revoke download object URLs after the download has started.
- Provide a useful filename containing product, flow, and date when appropriate.
- Keep the normal automated showcase available when recording is denied.

## Verification

- Validate required selectors against current markup.
- Test missing optional and required targets.
- Test Back after steps that mutate demo state.
- Test cancellation from every major workflow.
- Test desktop and narrow mobile viewports.
- Check popover clipping, target occlusion, text overflow, and scroll jumps.
- Confirm the final screen communicates the completed outcome and next action.

