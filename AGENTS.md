# ClosedRoom — Coding Agent Guide

Repository-wide routing layer. Detailed architecture belongs in `docs/architecture.md`, feature behavior in `docs/features.md`, and operational commands in `.engineering/commands.json`.

## Read only what the task requires

Always read this guide. Then read only relevant sources:

1. closest scoped `AGENTS.md`, if present;
2. `docs/architecture.md` plus owning code for architecture/lifecycle work;
3. `docs/features.md` for feature contracts;
4. `.engineering/commands.json` for operations;
5. `.engineering/e2e.json` for complete workflow, macOS/audio/model or package-fidelity claims;
6. `design/*` and `skills/design-product-experience/SKILL.md` for meaningful UI/UX work;
7. owning implementation, consumers/fakes and nearby tests.

Do not ingest generated assets, model caches, dependencies or historical plans for a local change.

## Repository purpose

ClosedRoom is a privacy-first macOS meeting workspace. It records microphone/system audio locally, transcribes through local ASR, persists meeting/transcription/job state, and can enrich or analyze meetings through explicitly selected local or remote providers. The primary runtime is a macOS Apple Silicon app built around a loopback FastAPI service, native helpers and a React UI in WKWebView.

## Non-negotiable invariants

- Local-first is the default trust boundary. No implicit cloud fallback; remote ASR/LLM providers must be explicit choices.
- Sensitive audio, transcripts, prompts and meeting content must not enter ordinary telemetry/logs by default.
- Bind the application service to loopback by default; preserve session/auth/origin restrictions.
- `server.py` is a composition root; reusable policy belongs in domain/service/runtime owners.
- `CatalogStore` owns cross-feature queryable metadata; do not create parallel indexes.
- Resolve user-data and bundle/dev paths through `paths.py`/settings; never hardcode machine-local dependencies.
- Recording/job/model work needs explicit lifecycle, bounded concurrency/backpressure where applicable, cancellation and cleanup.
- Native capture/audio routing must restore run-owned system/device state on stop, error, cancellation and shutdown.
- Cocoa/WebKit UI mutations stay on the macOS main thread.
- Validate model/backend identity before expensive local-AI load; missing resource telemetry is unknown, not zero.
- Prefer deterministic fixtures/mocks over production model downloads for cheap regressions.
- Edit `frontend/src/`, not generated `src/local_asr_server/static/assets/` bundles.
- Finalized `dist/artifacts/` build directories are immutable; create a new build identity instead of modifying one.
- Code and durable documentation ship together: before publication, assess documentation impact and update every affected canonical owner in the same change.
- README identity and README usage are separate owners. Do not rewrite stable mission/positioning for a usage-only change; do not leave stale setup/run/configuration/public examples because the identity remains valid.

## Ownership and routing

| Change | Start here | Inspect next |
| --- | --- | --- |
| FastAPI/public API | `server.py`, `routers/`, `schemas.py` | services, frontend API, tests |
| Recording/persistence | `recordings.py`, `catalog.py`, `transcriptions.py`, `jobs/` | routers/services/tests |
| ASR/model runtime | `runtime/asr_worker.py`, `asr_provider.py`, `transcriber.py` | service/jobs/settings/tests |
| Local LLM runtime | `runtime/llm_sidecar.py`, `runtime/service_manager.py`, `llm.py` | settings/services/diagnostics/tests |
| Native audio/capture | `native_capture.py`, helpers, `audio_router.py`, `macos_permissions.py` | recordings/window/build/tests |
| Speaker/visual intelligence | `speaker_diarization.py`, `speaker_labels.py`, `visual_intelligence/` | transcription/UI/benchmarks/tests |
| Ports/process leases | `runtime/port_manager.py`, `runtime/leases.py`, service manager | CLI/menubar/tests |
| Frontend | `frontend/src/` | `design/*`, API contract, i18n, E2E |
| Packaging/artifacts | `scripts/build_artifact.sh`, `build.sh`, `ClosedRoom.spec`, `build_assets/` | finalizer/smoke/E2E |
| CI/preflight | selector + `.github/workflows/preflight.yml` | commands/E2E/tests |
| Documentation impact | `docs/README.md` | README identity/usage, feature/architecture/ADR/security/current-state owner |

Public API changes require router/schema/service, frontend API consumers and tests. Persisted-data changes require migration/recovery compatibility review.

## Core engineering workflow

Use the repo-template-sw 0.8 core skills in `skills/`: `structured-change`, `design-product-experience`, `validate-change`, `preflight-change`, `remote-preflight`, `plan-workstream`, `finalize-workstream`, `review-reference-quality`.

ClosedRoom-specific skills remain local specializations; universal 0.8 contracts and this file govern conflicts.

Before publication, `preflight-change` must classify `README_IDENTITY`, `README_USAGE`, feature docs, architecture, ADR, security/data, operations, product experience and current state as `UPDATED` or `N/A`, and `DOCS_CURRENT_WITH_IMPLEMENTATION` must be `PASS`.

## Project operating commands

`.engineering/commands.json` is canonical:

`setup -> doctor -> dev -> check -> test -> e2e -> build -> smoke -> package -> stop -> clean`

`build`/`package` use `scripts/build_artifact.sh`, wrapping the existing builder with unique identity, immutable successful artifacts, manifest/SHA-256 evidence, build delta and bounded retention. `build.sh` is not the canonical release/evidence path.

`smoke` exercises the finalized `.app` frozen executable, loopback health/static frontend, graceful stop and listener/child cleanup. It does not prove interactive WKWebView, TCC, physical audio or production MLX behavior. `stop` is N/A as a standalone command because runtime/smoke owners stop their own processes.

`select_validation_profile.py` chooses LEAN for docs/governance, SCOPED for contained implementation, STRONG for runtime/native/persistence/E2E boundaries, and FULL for build/dependency/CI/selector machinery or unknown paths. `.github/workflows/preflight.yml` validates the exact PR head with read-only repository contents permission.

Execution capability (`AGENT_LOCAL`, `REMOTE_AUTOMATED`, `REAL_ENVIRONMENT`) is separate from E2E fidelity. Read `.engineering/e2e.json` before claims about real macOS permissions/audio, packaged behavior or production models.

## Product experience routing

For structural UX use: `user outcome -> task model -> IA/journey -> hierarchy -> disclosure/defaults -> states/feedback/recovery -> platform/adaptive -> accessibility -> components -> motion -> polish -> evidence`.

Reuse semantic components/tokens from `frontend/src/components/ui` and `frontend/src/index.css`; keep diagnostics progressively disclosed and motion purposeful/reduced-motion aware.

## Documentation lifecycle

- README identity sections: what ClosedRoom is/why it exists/primary audience and outcome. Change only when those claims materially change.
- README usage sections: prerequisites/setup/run/configuration/public usage/examples. Update in the same change whenever old instructions become incomplete, wrong or misleading.
- `docs/architecture.md`: detailed current architecture; intentionally larger local budget.
- `docs/features.md`: aggregate current feature registry; split into `docs/features/` only when useful. Existing feature owners change in the same change as the durable behavior they describe.
- `docs/current-state.md`: short operational ledger.
- `docs/adr/`: accepted durable decisions only.
- `docs/workstreams/`: active bounded plans only; delete completed plans after transferring durable truth.
- Historical plans are not current truth unless confirmed against code/current docs.

## Validation and evidence

Full Python suite:

```bash
UV_CACHE_DIR=.cache/uv uv run python -m unittest discover -s test -v
```

Frontend deterministic checks:

```bash
cd frontend
pnpm run lint
pnpm exec tsc --noEmit
```

For package/native/runtime evidence use `bash scripts/build_artifact.sh --no-dmg` then `python3 scripts/smoke_packaged_app.py`, or exact-head remote preflight. Real audio/TCC/interactive-WKWebView/production-MLX evidence remains separate. Never claim a gate passed unless it ran on the relevant head/environment.

## Stop conditions

Surface conflicts instead of improvising when a request would create a second owner, silently move data to cloud, weaken auth/privacy, bypass migration review, leave unbounded resources, bypass cleanup/permission/command/E2E/design/documentation-freshness contracts, weaken tests for green CI, mutate a finalized artifact, or claim evidence that was not executed.
