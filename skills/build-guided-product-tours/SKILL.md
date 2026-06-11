---
name: build-guided-product-tours
description: Design, implement, audit, and improve guided product tours for web applications, including spotlight steps, primary and secondary workflows, deterministic showcase automation, optional screen recording, state restoration, responsive placement, accessibility, and selector validation. Use when Codex must create or update onboarding tours, product walkthroughs, interactive demos, feature showcases, recorded demos, or files such as tour.js and walkthrough configurations.
---

# Build Guided Product Tours

Build tours from the product's real workflows, not from a list of visible controls. Cover the
minimum path to value first, then secondary capabilities, important states, and recovery paths.

## Workflow

1. Inspect the application before editing.
   - Find routes, views, dialogs, tabs, collapsibles, primary actions, empty/loading/success/error
     states, permission prompts, and responsive variants.
   - Trace event handlers and state transitions. Do not infer behavior only from markup.
   - Inventory features in a coverage matrix: workflow, entry point, outcome, priority, required
     state, side effects, and tour coverage.

2. Define a small tour portfolio.
   - Create a quick-start tour for the shortest successful workflow.
   - Create a full tour for primary and secondary features.
   - Add contextual mini-tours for complex or infrequently used areas when one long tour would
     exceed 8-12 steps.
   - Reuse the same declarative step catalog for interactive and automated showcase modes.

3. Model every step declaratively.
   - Include a stable `id`, semantic `target`, view/route, title, concise value-focused text,
     placement preference, prerequisites, setup action, cleanup action, and completion rule.
   - Add showcase timing and scripted interaction separately from manual behavior.
   - Prefer `data-tour` attributes over CSS classes or layout-dependent selectors.
   - Skip unavailable optional targets explicitly; fail loudly for missing required targets.

4. Separate engine responsibilities.
   - Keep step data independent from spotlight rendering.
   - Put view switching and mock state in a demo-state adapter.
   - Snapshot state before starting and restore it on finish, cancel, exception, and recording stop.
   - Keep recording orchestration independent from tour navigation.
   - Centralize timers, animation frames, event listeners, and cancellation with one lifecycle.

5. Design each spotlight step around an action or decision.
   - Highlight the smallest meaningful region, not an entire screen.
   - State what the feature enables and what result to expect.
   - Use action-driven progression when the user must click, type, select, or complete a task.
   - Use Next only for explanation-only steps.
   - Keep copy to one title and roughly 1-3 short sentences.

6. Make showcase mode deterministic.
   - Use fixtures or synthetic state rather than production writes, microphones, file pickers,
     network timing, or permission dialogs.
   - Script visible interactions such as tab changes, progress, success states, copy/export, and
     restart flows.
   - Prefer event-based waits with bounded timeouts over fixed delays.
   - Add a short lead-in and closing frame when recording.
   - Stop tracks, revoke object URLs after download, and handle unsupported codecs with fallback.

7. Verify coverage and behavior.
   - Read [references/quality-checklist.md](references/quality-checklist.md).
   - Run `scripts/check_tour_targets.py TOUR_FILE HTML_FILE` for ID-based tours.
   - Test start, previous, next, skip, cancel, restart, missing targets, viewport resize, scrolling,
     keyboard use, and state restoration.
   - Use the Browser skill after significant frontend changes. Capture desktop and mobile
     screenshots for the first, middle, and last steps and check for clipping or overlap.

## Recommended Step Shape

Adapt this shape to the application's language and framework:

```js
{
  id: "configure-transcription",
  target: '[data-tour="transcription-settings"]',
  view: "transcription",
  title: "Configura la trascrizione",
  text: "Scegli modello, lingua e livello di dettaglio prima di avviare.",
  placement: ["top", "bottom", "right", "left"],
  required: true,
  prepare: ({ demoState }) => demoState.showTranscriptionSettings(),
  completeWhen: ({ target }) => target.matches("[data-configured='true']"),
  showcase: {
    durationMs: 4500,
    run: ({ demoState }) => demoState.selectRecommendedOptions()
  }
}
```

Treat functions in step data as thin calls into adapters. Do not embed large DOM mutations,
fixtures, or business logic in the catalog.

## Completion Standard

Deliver a tour only when:

- The quick-start path reaches a real or simulated successful outcome.
- Every primary feature appears in a workflow.
- Secondary features are covered by the full tour or a contextual mini-tour.
- The user can exit at any point without leaving fabricated or corrupted state.
- Interactive and recorded modes produce the same narrative with mode-specific interaction.
- Required selectors are validated and responsive popover placement stays inside the viewport.
- Recording failure never prevents the normal tour from running.

