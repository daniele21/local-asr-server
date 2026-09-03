---
name: structured-change
description: Guard meaningful changes against duplicate ownership, unresolved assumptions, excess complexity, unsafe data/resource lifecycle, failure gaps, UX drift and cross-layer contract breakage while keeping publication ceremony out of ordinary iteration.
---

# Structured Change

Find the canonical owner before editing; inspect direct consumers, fakes and tests for shared boundaries. Resolve material ambiguity from repository evidence or the user rather than silently choosing product/API/persistence/security/lifecycle semantics.

Keep changes vertical: prefer an observable user/system outcome, with technical layers as subtasks unless independently useful. Spend new abstractions, dependencies, workers, caches and UI patterns only for a concrete need.

Preserve `.engineering/commands.json` invariants for build identity, immutable artifact promotion, cleanup, runtime ownership and bounded resources. Treat failure, cancellation, restart and partial initialization as normal paths. Preserve local-first/privacy boundaries and avoid content leakage in logs/E2E evidence.

For meaningful UI changes, route through the product-experience contract before polish. Reuse canonical components/tokens and preserve hierarchy, progressive disclosure, recovery, accessibility and adaptive behavior.

During `ITERATION`, use proportional reasoning and focused `validate-change` evidence. A change is implementation-complete when code, consumers, failure/resource behavior and focused tests agree. Durable documentation freshness, exact-head/full-diff review and publication readiness begin when the coherent outcome moves to `INTEGRATION` or `RELEASE` via `preflight-change`, not after every edit.
