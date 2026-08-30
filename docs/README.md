# ClosedRoom documentation

Use documentation by ownership, not chronology.

- `architecture.md` — current detailed architecture, ownership and system boundaries.
- `features.md` — existing aggregate registry of current product behavior and verification hints.
- `current-state.md` — short operational/maturity ledger and current gaps.
- `features/` — bounded feature documents only when splitting durable behavior reduces context or duplication.
- `adr/` — accepted durable decisions whose rationale remains useful.
- `workstreams/` — active implementation plans only; completed plans are deleted by default after durable truth is transferred.
- `assets/` — bounded reference/demo assets; generated test evidence should live in CI artifacts instead.

Older implementation/refactoring plans in this directory are historical inputs, not automatically current truth. Validate them against code, `architecture.md`, `features.md` and current tests before using them for implementation decisions.
