---
name: maintain-feature-docs
description: Keep ClosedRoom product, business, technical, operational, and feature-registry documentation synchronized with code. Use when Codex adds, removes, renames, fixes, or changes user-facing workflows, API contracts, persistence, settings, macOS audio routing, transcription or analysis behavior, frontend pages, build behavior, or documentation structure.
---

# Maintain Feature Docs

## Overview

Treat documentation as part of the feature, not as a follow-up. A ClosedRoom
change is complete only when the relevant product and technical docs either
reflect the new behavior or the final answer explains why no documentation
change was needed.

## Documentation Sources

- `docs/features.md`: feature registry and business/technical traceability.
- `README.md`: install, start, user-facing usage, endpoint examples, and setup.
- `AGENTS.md`: operational rules for future agents and repo-specific workflows.
- Domain docs or specs under `docs/` or `test/` when they already exist.

Do not document runtime facts in multiple places unless each place has a clear
audience. When duplication is unavoidable, update every copy in the same change.

## Workflow

1. Map the changed behavior.
   - Identify user workflow, CLI command, API route, store/service, persisted
     files, settings, generated assets, and tests affected.
   - Use `rg` against `server.py`, frontend API clients, stores, settings,
     paths, and tests before deciding which docs are affected.

2. Update product/business documentation.
   - Record what user outcome the feature enables.
   - Describe the supported workflow and important constraints.
   - Update README setup or usage sections when the change affects how a user
     installs, starts, configures, records, transcribes, analyzes, or exports.

3. Update technical documentation.
   - Record source-of-truth modules, API endpoints, persistent files, settings,
     and build/bundle implications.
   - Keep endpoint names, settings keys, model names, path conventions, and test
     commands aligned with code, not copied from memory.
   - If a feature spans backend and frontend, document both sides.

4. Update verification notes.
   - Add or refresh focused test commands in docs when behavior changes.
   - Mention known baseline failures from `AGENTS.md` if they affect validation.
   - If no automated test exists, name the manual check required.

5. Report the documentation decision in the final answer.
   - List changed docs.
   - If no doc changed, state the concrete reason.

## Change-Type Rules

- API change: update `docs/features.md`, README examples if public, frontend API
  client notes if relevant, and tests or verification commands.
- Frontend workflow change: update the feature registry, user-facing README if
  the workflow or setup changes, and any tour/showcase documentation.
- Persistence or catalog change: document file/database location, migration or
  import behavior, consistency guarantees, and cleanup behavior.
- Settings/configuration change: document default, persisted key, UI exposure,
  API contract, and dev vs bundle behavior.
- macOS audio routing change: document setup, rollback/restore behavior, crash
  recovery, helper requirements, and manual verification.
- Build or packaging change: document PyInstaller data/binary inclusion,
  runtime path behavior, and whether `./build.sh --no-dmg` is required.

## Completion Standard

- The feature registry names the business value and technical owner.
- Public setup or usage docs match implemented behavior.
- Technical docs identify the single source of truth for constants, paths,
  settings, API payloads, and persisted state.
- The final response reports documentation updates or the explicit no-op reason.
