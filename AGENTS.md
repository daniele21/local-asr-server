# ClosedRoom — Coding Agent Guide

Repository-wide routing layer. Detailed architecture belongs in `docs/architecture.md`, feature behavior in `docs/features.md`, operations in `.engineering/commands.json`, and fidelity in `.engineering/e2e.json`.

## Read only what the task requires

Always read this guide, then the closest scoped `AGENTS.md`, owning code/tests and only the relevant architecture/feature/design/operating contracts. Do not ingest generated bundles, model caches, dependencies or historical plans for a local change.

## Purpose and invariants

ClosedRoom is a privacy-first macOS meeting workspace built around a loopback FastAPI service, native audio helpers, local AI runtimes and a React UI in WKWebView.

Preserve: local-first default with no implicit cloud fallback; no sensitive content in ordinary telemetry; loopback/auth/origin restrictions; canonical persistence owners; path resolution through settings/paths; bounded/cancellable recording/job/model lifecycles; restoration of run-owned native capture state; Cocoa/WebKit main-thread mutation; truthful model/resource telemetry; deterministic fixtures before production downloads; `frontend/src/` as UI source; immutable finalized artifacts.

## Ownership routing

API -> `server.py`, routers/schemas/services. Persistence -> recordings/catalog/transcriptions/jobs. ASR/LLM -> runtime/service owners. Native audio -> capture/helpers/router/permissions. Frontend -> `frontend/src/` + design contracts. Packaging -> `scripts/build_artifact.sh`, `ClosedRoom.spec`, finalizer/smoke. CI -> selector + `.github/workflows/preflight.yml`.

## Delivery model

ClosedRoom follows repo-template-sw **0.9.1**.

- `ITERATION`: default while implementation is changing. Use focused owner-local checks; durable docs/exact-head/preflight are not required after every edit.
- `INTEGRATION`: a coherent observable outcome is ready to converge. Exact head, complete diff, affected durable docs and required risk gates must be current.
- `RELEASE`: FULL validation plus release-critical artifact/E2E and residual environment evidence.

The selector maps **risk dimensions -> required gates -> LEAN/SCOPED/STRONG/FULL summary**. Profiles are shorthand, not the source of truth.

Parallel technical work should converge early around vertical outcomes. Stacked publication is exceptional; do not create sync-only PR chains.

## Validation and evidence

`.github/workflows/preflight.yml` is the canonical remote validator. It always runs repository/governance guards, defers expensive macOS source/package jobs during draft iteration, and runs them at integration/release only when the selector requires them.

Successful integration evidence is reusable. Before merge use exact-head identity. After a content-preserving merge to `dev`, the workflow may reuse evidence only when Git tree, prior target/base, gates and profile are equivalent. Direct pushes without trusted evidence validate normally. Release remains FULL and does not silently inherit integration proof.

E2E UI evidence is risk-based: `ASSERTIONS`, `SCREENSHOTS`, `FULL_MEDIA`. The real meeting-recording UI remains `FULL_MEDIA` because timing/lifecycle/native capture sequence is part of the claim. Hosted macOS does not prove real TCC, physical audio or interactive target-Mac behavior; `python3 scripts/real_environment_ui_evidence.py --build` owns that residual evidence.

## Documentation

Durable documentation must be current when moving to `INTEGRATION`, not on every private edit. Keep README identity separate from README usage. `docs/current-state.md` owns integrated/blocked/next repository truth, not agent diaries. Delete completed workstreams after transferring durable truth.

## Failure discipline

Classify red gates before editing: change regression, baseline failure, environment, flaky, base drift or assumption. Fix the owning invariant; never weaken legitimate tests for green CI. Surface requests that would create a second owner, silently weaken privacy/auth/migration/resource cleanup, mutate finalized artifacts or overclaim evidence.
