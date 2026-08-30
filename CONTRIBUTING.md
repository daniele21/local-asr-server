# Contributing to ClosedRoom

ClosedRoom combines Python/FastAPI, React/TypeScript, macOS native helpers, local AI runtimes and a packaged desktop application. Changes should preserve the repository's existing ownership boundaries rather than adding parallel mechanisms.

## Before changing code

Read `AGENTS.md`, then the smallest relevant architecture/feature/design sources. Use `.engineering/commands.json` for canonical operations and `.engineering/e2e.json` when a complete workflow or environment-dependent claim is involved.

For meaningful changes use the repo-local `structured-change` skill. For meaningful UX/UI semantics also use `design-product-experience`.

## Development principles

- Keep local-first behavior and explicit provider trust boundaries.
- Extend the owning service/runtime/store/configuration rather than duplicating state.
- Keep public API/schema/frontend consumers synchronized.
- Keep expensive local model loads out of cheap tests; use deterministic fixtures/mocks when they prove the invariant.
- Preserve cancellation, shutdown, failure recovery and cleanup for run-owned processes, listeners, devices, jobs and temporary files.
- Do not hand-edit generated Vite assets when the frontend source can regenerate them.

## Validation

Use the narrowest sufficient iteration checks, then `preflight-change` before publication. Canonical commands and current availability are defined in `.engineering/commands.json`.

Repository health checks are intentionally zero-dependency and run on pull requests. Python tests, frontend lint/typecheck, package/build and real macOS evidence are separate evidence layers; do not treat one as proof of another.

When an E2E claim depends on macOS permissions/audio hardware, packaged app behavior or production local-model performance, report the actual environment and residual gaps from `.engineering/e2e.json`.

## Pull requests

Keep one coherent outcome per PR. Describe the owning boundary, user-visible/contract impact, selected validation profile, executed evidence, pending remote/real-environment evidence and documentation/design-contract changes. Never mark a known-red or unexecuted gate as passing.

For the current baseline migration, `speaker_detection` is the product base from which `engineering-baseline-0.8` was derived. Re-check the intended target base before future work rather than assuming this branch relationship remains permanent.
