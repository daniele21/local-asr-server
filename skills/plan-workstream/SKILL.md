---
name: plan-workstream
description: Plan substantial work as observable vertical outcomes with explicit dependencies, parallel technical subtasks and early branch convergence rather than stacked publication ceremony.
---

# Plan Workstream

Use a workstream only when persistent dependency or parallel coordination adds value. Small coherent changes need no durable plan.

Prefer **observable user/system outcomes** as slices. Technical layers are subtasks unless independently valuable, mergeable and reviewable. Parallel branches may own non-conflicting subtasks, but related work should converge early onto a shared feature/integration branch. Stacked PRs are exceptional; a PR whose only purpose is syncing one branch into another is a coordination smell.

For each active slice record: goal, non-goals, owning paths/contracts, dependencies, state (`READY|ACTIVE|BLOCKED|DONE`), convergence point, iteration checks and integration/release gates. Put fast validation beside subtasks and stronger E2E/release evidence beside the vertical outcome it proves.

`docs/current-state.md` owns integrated/blocked/next repository truth, not every temporary branch update. Delete completed workstreams after durable truth has moved to canonical docs.
