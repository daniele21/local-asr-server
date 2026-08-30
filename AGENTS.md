# ClosedRoom — Coding Agent Guide

This file is the repository-wide routing layer. It owns durable ClosedRoom invariants, ownership and validation routing; detailed architecture belongs in `docs/architecture.md`, current feature behavior in `docs/features.md`, and operational commands in `.engineering/commands.json`.

## Read only what the task requires

Always read this guide. Then read only the relevant sources:

1. the closest scoped `AGENTS.md`, if one exists;
2. `docs/architecture.md` and the owning code for architecture/lifecycle work;
3. `docs/features.md` for current feature contracts;
4. `.engineering/commands.json` for setup/dev/check/test/E2E/build/package/cleanup;
5. `.engineering/e2e.json` when a complete workflow, macOS/audio/model or package-fidelity claim is affected;
6. `design/ux-contract.json`, `design/brand-kit.json` and `skills/design-product-experience/SKILL.md` for meaningful UI/UX work;
7. the owning implementation, direct consumers/fakes and nearby tests.

Do not ingest generated assets, model caches, dependencies or all historical plans for a local change.

## Repository purpose

ClosedRoom is a privacy-first macOS meeting workspace. It records microphone/system audio locally, transcribes through local ASR, persists meeting/transcription/job state, and can enrich or analyze meetings through explicitly selected local or remote providers. The primary runtime is a macOS Apple Silicon desktop app built around a loopback FastAPI service, native helpers and a React UI hosted in WKWebView.

## Non-negotiable invariants

- Local-first is the default trust boundary. Never add an implicit cloud fallback; remote ASR/LLM providers must be explicit user/configuration choices.
- Sensitive audio, transcripts, prompts and generated meeting content must not enter ordinary telemetry/logs by default.
- The application service binds to loopback by default; preserve session/auth/origin restrictions and do not broaden network exposure casually.
- `server.py` is a composition root. Reusable policy belongs in domain/service/runtime owners rather than new global state.
- `CatalogStore` owns cross-feature queryable metadata; do not create parallel unsynchronized indexes.
- User-data and bundle/dev paths are resolved through `paths.py`/settings owners; do not hardcode user paths.
- Recording/job/model work must have explicit lifecycle, bounded concurrency/backpressure where applicable, cancellation and deterministic cleanup.
- Native capture/audio routing must restore temporary system/device state after stop, error, cancellation, crash recovery and shutdown where ownership permits.
- Cocoa/WebKit UI mutations stay on the macOS main thread.
- A model/backend identity must be validated before expensive local-AI load; absence of resource telemetry is unknown, not zero.
- Do not use a production Whisper/MLX model download as a cheap regression check when deterministic fixtures or mocks prove the same invariant.
- Generated frontend assets under `src/local_asr_server/static/assets/` are build output; edit `frontend/src/` and regenerate instead of hand-editing hashes/minified files.

## Ownership and routing

| Change | Start here | Inspect next |
| --- | --- | --- |
| FastAPI composition/public API | `src/local_asr_server/server.py`, `routers/`, `schemas.py` | services, frontend API client, tests |
| Recording/persistence/catalog | `recordings.py`, `catalog.py`, `transcriptions.py`, `jobs/` | routers/services/tests |
| ASR/model runtime | `runtime/asr_worker.py`, `asr_provider.py`, `transcriber.py` | transcription service/jobs/settings/tests |
| Local LLM sidecar/runtime | `runtime/llm_sidecar.py`, `runtime/service_manager.py`, `llm.py` | settings/services/diagnostics/tests |
| Native audio/capture/permissions | `native_capture.py`, native helpers, `audio_router.py`, `macos_permissions.py` | recordings/window/build/tests |
| Speaker/visual intelligence | `speaker_diarization.py`, `speaker_labels.py`, `visual_intelligence/` | transcription/meeting UI/benchmarks/tests |
| Runtime ports/process leases | `runtime/port_manager.py`, `runtime/leases.py`, service manager | CLI/menubar/tests |
| Frontend/product experience | `frontend/src/` | `design/*`, API contract, i18n, E2E journeys |
| macOS packaging | `ClosedRoom.spec`, `build.sh`, `build_assets/`, `create_dmg.sh` | paths/native helpers/smoke evidence |

A public API change requires coordinated inspection of the owning router/schema/service, `frontend/src/api/`, direct callers and tests. A persisted-data change requires migration/recovery compatibility review before implementation.

## Core engineering workflow

Use the repo-template-sw 0.8 core skills now vendored in `skills/`:

- `structured-change` before and after meaningful code/product changes;
- `design-product-experience` for meaningful UX/UI semantics;
- `validate-change` for the narrowest sufficient iteration evidence;
- `preflight-change` before publishing a change;
- `remote-preflight` when deterministic required gates are automatable but unavailable agent-local;
- `plan-workstream` only when dependency/state coordination is useful;
- `finalize-workstream` when an active plan is done;
- `review-reference-quality` for maturity/reference-grade audits.

Existing ClosedRoom-specific skills (`build-guided-product-tours`, `maintain-feature-docs`, `structured-change-guard`) are retained as local specializations. Do not let them create a second source of truth: the 0.8 operating/E2E/product contracts and the project-specific invariants in this file govern conflicts.

## Project operating commands

`.engineering/commands.json` is canonical. Use intent rather than inventing another run path:

`setup -> doctor -> dev -> check -> test -> e2e -> build -> smoke -> package -> stop -> clean`

`smoke` and `stop` are currently declared unavailable as canonical automation rather than faked. `docs/current-state.md` records the gap. Do not promote source tests into packaged-app evidence.

Validation depth follows blast radius: LEAN for governance/docs, SCOPED for contained owners, STRONG for shared/native/persistence/security/package boundaries, FULL for promotion or changes to validation/global build/dependency machinery. Unknown executable paths fail safe to FULL until selector automation exists.

Execution capability (`AGENT_LOCAL`, `REMOTE_AUTOMATED`, `REAL_ENVIRONMENT`) is separate from E2E environment fidelity. Read `.engineering/e2e.json` before making claims about real macOS permissions/audio, Apple hardware, packaged-app behavior or production model performance.

## Product experience routing

For structural UX, use this order at proportional depth:

`user outcome -> task model -> IA/journey -> hierarchy -> disclosure/defaults -> states/feedback/recovery -> platform/adaptive -> accessibility -> components -> motion -> polish -> evidence`

Reuse semantic components/tokens from `frontend/src/components/ui` and `frontend/src/index.css`. Advanced diagnostics/configuration should remain progressively disclosed. Motion must serve feedback, continuity, state, progress or orientation and respect reduced-motion behavior.

## Documentation lifecycle

- `docs/architecture.md` is the detailed current architecture/ownership source and is intentionally allowed a larger local budget than the generic template.
- `docs/features.md` remains the existing aggregate feature registry; `docs/features/` is available for future bounded feature docs when splitting reduces duplication/context.
- `docs/current-state.md` is the short operational ledger.
- `docs/adr/` stores accepted durable decisions only.
- `docs/workstreams/` stores active bounded plans only; completed plans are deleted by default after durable truth is transferred.
- Existing historical planning documents are not automatically current truth; confirm against code/current architecture before relying on them.

## Validation and evidence

Run focused tests while iterating, then the profile-selected canonical gates. The full Python suite is:

```bash
UV_CACHE_DIR=.cache/uv uv run python -m unittest discover -s test -v
```

Frontend deterministic checks are:

```bash
cd frontend
pnpm run lint
pnpm exec tsc --noEmit
```

Use `./build.sh --no-dmg` when package/native/runtime resources are affected. Real macOS audio/TCC/MLX evidence remains separate from source-contract tests. Never claim a gate passed unless it ran on the relevant head/environment.

## Stop conditions

Surface a conflict instead of improvising when a request would create a second owner, silently move data to cloud, weaken auth/privacy, bypass persisted-data migration review, leave unbounded runtime resources, bypass macOS cleanup/permission invariants, bypass canonical commands/E2E fidelity/design contracts, weaken legitimate tests to obtain green CI, or claim physical/package/model evidence that was not executed.
