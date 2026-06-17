---
name: structured-change-guard
description: Enforce robust, structured ClosedRoom changes with centralized data, single sources of truth, configuration-driven behavior, and no hardcoded duplicated rules. Use for any code change, especially features, bug fixes, refactors, settings, API contracts, frontend workflows, persistence, macOS routing, build assets, or cross-layer behavior.
---

# Structured Change Guard

## Overview

Use this skill as a pre-edit and pre-final review. The goal is to keep every
change discoverable, centralized, testable, and consistent across backend,
frontend, persistence, and bundle mode.

## Workflow

1. Find the existing source of truth.
   - Use `rg` before editing to locate constants, request/response models,
     endpoint callers, settings keys, path helpers, status values, and tests.
   - Prefer existing modules over introducing new globals or duplicate maps.

2. Place logic in the owning layer.
   - Keep `server.py` as the FastAPI composition root.
   - Put reusable backend behavior in domain modules such as recordings,
     transcriptions, catalog, settings, paths, audio routing, LLM, or transcriber.
   - Keep frontend pages/components focused on UI orchestration.
   - Put shared frontend constants in `frontend/src/api/config.ts` or
     `src/local_asr_server/static/config.js`, depending on the UI surface.
   - Put user-facing text in the i18n/catalog layer already used by that UI.

3. Remove or avoid hardcoding.
   - Do not duplicate endpoint paths, settings keys, status strings, model lists,
     language lists, file extensions, timing constants, storage paths, or UI copy.
   - Use `paths.py` for filesystem locations, `settings.py` for persisted user
     defaults, `CatalogStore` for queryable metadata, and store modules for
     lifecycle rules.
   - If a literal is unavoidable, keep it close to the owning rule and name it
     as a constant when reused.

4. Preserve consistency guarantees.
   - Keep recording chunks monotonic, session-locked, and atomically finalized.
   - Keep transcription cache keys deterministic and cache writes isolated.
   - Keep catalog updates synchronized with JSON/TXT persistence.
   - Keep macOS audio routing rollback paths for errors, stop, unload, and server
     restart.
   - Keep dev and PyInstaller bundle path behavior explicit.

5. Verify contracts across layers.
   - For API changes, check Pydantic models, route handlers, API clients,
     frontend callers, tests, and docs together.
   - For frontend changes, check stable IDs/selectors, script/build order,
     i18n strings, generated static assets, and responsive states.
   - For persistence changes, check old data import, atomic writes, deletion,
     merge/split behavior, and settings overrides.

## Centralization Checklist

- Paths: `src/local_asr_server/paths.py`.
- User defaults and persisted options: `src/local_asr_server/settings.py`.
- Queryable recording/transcription/project metadata:
  `src/local_asr_server/catalog.py`.
- Recording lifecycle and file writes: `src/local_asr_server/recordings.py`.
- Transcription archive, merge/split, and analysis persistence:
  `src/local_asr_server/transcriptions.py`.
- Transcription engine, cache key, streaming, and result cleanup:
  `src/local_asr_server/transcriber.py`.
- Backend API composition: `src/local_asr_server/server.py`.
- React frontend API constants and option catalogs:
  `frontend/src/api/config.ts`.
- React frontend HTTP contract: `frontend/src/api/apiClient.ts`.
- React frontend text: `frontend/src/i18n/i18n.tsx`.
- Static runtime UI constants: `src/local_asr_server/static/config.js`.
- Static runtime HTTP contract: `src/local_asr_server/static/api.js`.

## Review Questions

- Is there exactly one owner for this rule or data value?
- Would changing the value later require editing one place or many?
- Does the frontend derive behavior from the backend contract instead of
  inventing a parallel contract?
- Are persisted files, catalog rows, settings, and UI state kept consistent on
  success and failure?
- Does the change behave the same in dev and in the PyInstaller bundle?
- Are generated/minified assets produced from source instead of manually edited?

## Completion Standard

- New behavior is expressed through existing centralized data/configuration
  layers or a justified new owner.
- No duplicated hardcoded business rules, endpoints, settings keys, paths, or UI
  option catalogs were introduced.
- Failure and rollback paths leave recordings, transcriptions, settings,
  catalog rows, cache files, and audio routing consistent.
- Tests or manual verification cover the layer where the rule lives.
