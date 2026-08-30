---
name: preflight-change
description: Establish exact-head automated-validation readiness by resolving material ambiguity, verifying target-base freshness, reviewing the complete diff, selecting validation depth and E2E environment fidelity from blast radius, classifying execution capability and routing every required deterministic gate without turning the user into a test runner.
---

# Preflight Change

Use this Skill immediately before pushing, opening/updating a PR, or otherwise publishing a change for automated validation. `validate-change` owns the iterative test loop; this Skill owns final publication/readiness, validation-depth selection, E2E environment-fidelity selection and execution routing.

Read `EXECUTION-CAPABILITY-CONTRACT.md` when the current agent may lack a shell, checkout, SDK or platform toolchain. Read `.engineering/e2e.json` when the change affects a complete workflow or a platform/device/browser/runtime/environment-dependent claim.

The governing rules are:

> Validation depth follows blast radius: use the narrowest profile that proves the changed invariants.

> E2E environment fidelity follows the claim: use the cheapest declared automated environment that represents the material target dimensions, then leave only irreducible fidelity gaps for real-environment confirmation.

> CI should confirm locally reproducible deterministic failures when the agent has equivalent execution capability.

> An automatable deterministic gate must not be delegated to the user merely because the current agent cannot run it locally.

## 1. Resolve material ambiguity

Before claiming readiness, confirm that implementation is not resting on an unresolved material assumption.

First inspect canonical evidence:

- owning contract/state/config/design source;
- architecture/feature docs and accepted ADRs;
- direct consumers, fakes/adapters and nearby tests;
- active workstream acceptance criteria when applicable.

Ask the user only when two reasonable interpretations remain and they would materially change product behavior, public/API/protocol contracts, persisted data/migration semantics, security/trust/privacy boundaries, failure/resource/concurrency/lifecycle behavior, backward compatibility, acceptance criteria or meaningful UX.

Do not ask about local naming/style/implementation choices that preserve observable semantics.

## 2. Verify the intended base

Read the intended target branch/ref again before final validation.

- Record exact target/base revision and feature head revision.
- Verify the feature is based on, reconciled with, or proven merge-compatible with the current target according to repository policy.
- Treat stacked work as conditional while parent PRs/dependencies are not integrated.
- After a base/dependency/head change, invalidate prior affected evidence and rerun it.

Do not reuse green evidence from an obsolete head/base relationship.

## 3. Review the complete diff

Inspect the whole diff against the intended base, not only the last edited files.

Look for:

- accidental/generated/private files or debug/logging residue;
- unrelated edits or hidden scope expansion;
- duplicated ownership/policy or a second source of truth;
- weakened/deleted/suppressed tests or validation;
- stale docs/contracts after behavior changed;
- missed direct consumers/fakes/adapters;
- unbounded resources, missing cleanup or changed failure semantics;
- accidental compatibility/migration/security/UX drift;
- stale E2E target/environment/fidelity assumptions after platform/runtime/packaging changes.

A diff review is a semantic review, not only a formatting pass.

## 4. Select validation depth from blast radius

Read `.engineering/commands.json` and use the project-owned selector to choose `auto -> LEAN | SCOPED | STRONG | FULL`.

Use the narrowest sufficient profile:

- `LEAN` — docs/governance/metadata-only or cheap universal guards with no executable/product blast radius;
- `SCOPED` — contained implementation change: affected owner/module plus direct consumers/tests/lint/compile;
- `STRONG` — cross-boundary or release-sensitive change such as shared contracts, persistence/security, native/JNI, packaging/R8/manifest/dependency/variant or multi-owner behavior;
- `FULL` — promotion/release, CI-selector/global build/dependency-inventory/toolchain changes, unknown executable paths, explicit full request or other cases where narrowing cannot be trusted.

The selector must report the profile and reason. Unknown executable paths fail safe stronger. Changes to the selector/inventory itself force `FULL` because the narrowing mechanism cannot safely validate itself.

Do not silently downgrade below `auto`. Explicit stronger validation is always allowed. If an attempted fix broadens blast radius — for example by adding a global Gradle or ProGuard change — re-run selection and allow escalation.

## 5. Select E2E journey and environment fidelity

When the selected profile/claim requires E2E, read `.engineering/e2e.json` before classifying executors.

For each affected critical journey:

1. identify the complete outcome being claimed;
2. identify the declared target environment(s) and material dimensions;
3. select the smallest relevant journey subset rather than the entire E2E suite when scope permits;
4. select the cheapest declared automated execution environment whose fidelity is sufficient for the changed claim;
5. require built/package-artifact execution when the claim depends on distribution/install/package behavior;
6. escalate to a stronger automated environment when the change depends on dimensions missing from the cheaper environment;
7. preserve declared residual gaps and required/conditional real-environment confirmation separately.

Do not confuse this with execution capability. An Android emulator in CI may be `REMOTE_AUTOMATED` while still only `simulated_or_emulated` fidelity. A physical device farm may also be `REMOTE_AUTOMATED` but `representative_physical`. The executor class does not upgrade the environment claim.

The desired progression is not "run everything". It is:

```text
cheapest sufficient automated E2E
-> stronger automated fidelity only when needed
-> residual real/target-environment confirmation
```

If a required critical journey has no automated environment, retain its explicit `automation_gap_reason`; do not silently turn an undocumented human test into the primary E2E strategy.

## 6. Classify required gates by execution capability

Use `validate-change`, the selected profile, `.engineering/commands.json` and any selected E2E environments to construct the final matrix.

For every required gate, assign the execution class for the **current agent/session**:

- `AGENT_LOCAL` — the agent can execute it directly on the exact head;
- `REMOTE_AUTOMATED` — deterministic and automatable, but unavailable in the current agent environment;
- `REAL_ENVIRONMENT` — genuinely requires representative hardware, protected authority, external environment or manual evidence.

Typical deterministic gates include:

- formatting/formatter check;
- lint/static analysis/typecheck;
- touched module/package compilation;
- focused unit/component tests;
- direct-consumer/contract/integration tests;
- canonical repository `check`/`test` where selected;
- R8/minification/build/package/smoke/E2E where the chosen profile/claim requires them.

Do not classify a Gradle/R8/compiler/unit-test gate as `REAL_ENVIRONMENT` merely because ChatGPT lacks an Android SDK. That is `REMOTE_AUTOMATED`.

For an E2E gate, report both dimensions: executor classification and `.engineering/e2e.json` environment ID/fidelity class.

## 7. Execute or route deterministic validation

Run every required `AGENT_LOCAL` gate in the selected validation profile on the exact current head.

If all required deterministic gates are `AGENT_LOCAL` and pass, readiness may be `READY_FOR_CI`: remote CI is an independent confirmation environment and should use the same blast-radius profile or a deliberately stronger one.

If one or more required deterministic gates are `REMOTE_AUTOMATED` and all semantic/base/diff plus available local gates pass, readiness is `READY_FOR_REMOTE_PREFLIGHT`. Hand off immediately to `skills/remote-preflight/SKILL.md` and trigger repository-owned automation with the default `auto` profile unless a stronger profile is justified.

Do **not** ask the user to run an automatable deterministic command solely because the agent lacks a shell, checkout, SDK or toolchain.

If a required deterministic gate is unavailable both locally and through repository-owned remote automation, status is `NOT_READY_FOR_AUTOMATED_PREFLIGHT` with `AUTOMATION_CAPABILITY_GAP`. If blast radius cannot be classified safely, report `VALIDATION_SCOPE_GAP` and fail safe stronger while the selector is repaired.

`REAL_ENVIRONMENT` evidence may remain pending after automated validation, but still blocks any stronger claim that depends on it. A target-device/manual run should primarily cover the residual fidelity gap declared for the journey, not act as the first complete workflow execution unless an explicit automation capability gap makes that unavoidable.

## 8. Diagnose failures before editing

For every failure, classify it before changing production code:

- `CHANGE_REGRESSION` — introduced by this change;
- `BASELINE_FAILURE` — reproducible on the intended target base;
- `ENVIRONMENT` — toolchain/dependency/environment mismatch;
- `FLAKY` — non-deterministic and reproduced as such;
- `BASE_DRIFT` — stale/stacked integration effect;
- `ASSUMPTION` — requirement/design/contract assumption is wrong or unresolved.

Then identify the violated invariant and its owner. Fix the owner and add/strengthen regression evidence at the lowest useful level.

Never delete, suppress, weaken or rewrite a legitimate gate simply to make the branch green unless the owning contract itself is intentionally changed.

If the same gate fails after a repair, stop symptom patching. Re-examine the cause, owner and assumptions and form a new falsifiable hypothesis before editing again. If that exposes material ambiguity, return to section 1 and ask the user.

After every material fix, reconsider the selected validation profile and E2E fidelity because the repair itself may broaden or narrow the blast radius or add a target-environment dependency.

## 9. Check command and evidence parity

Deterministic automation should invoke the same project-owned canonical commands/scripts regardless of whether execution occurs agent-local or remotely. Workflow YAML may orchestrate scope detection, environment setup, caching and evidence, but should not secretly own a divergent formatter/test/build policy.

If remote automation finds a deterministic failure that an equivalent agent-local environment should have found, close the parity/preflight-selection gap. If the current agent had **no equivalent local execution capability**, the remote discovery is valid execution, not a process defect.

If a real target-environment run repeatedly discovers ordinary complete-workflow regressions that a declared automated environment could reproduce, close the E2E fidelity gap by moving that evidence earlier. Do not accept final manual/device testing as a permanent substitute for automatable whole-system validation.

If a remote run executes materially unrelated suites, improve the scope selector rather than accepting full-CI-by-default as permanent overhead.

## 10. Output readiness

Report:

```text
HEAD: <revision>
TARGET: <branch>@<revision>
AMBIGUITY: PASS|FAIL
BASE_FRESHNESS: PASS|FAIL
FULL_DIFF_REVIEW: PASS|FAIL
VALIDATION_PROFILE: LEAN|SCOPED|STRONG|FULL
PROFILE_REASON: <reason>
EXECUTION_CAPABILITY: local|mixed|remote-only
E2E_JOURNEYS:
  <journey>: <environment-id> / <fidelity-class> / PASS|FAIL|PENDING|N/A
E2E_RESIDUAL_GAPS:
  <journey>: <gap or N/A>
AGENT_LOCAL:
  <gate>: PASS|FAIL|N/A
REMOTE_AUTOMATED:
  <gate>: PASS|FAIL|PENDING|N/A
REAL_ENVIRONMENT:
  <gate>: PASS|PENDING|N/A
READINESS: READY_FOR_CI|READY_FOR_REMOTE_PREFLIGHT|AUTOMATED_PREFLIGHT_CONFIRMED|NOT_READY_FOR_AUTOMATED_PREFLIGHT
```

Readiness meanings:

- `READY_FOR_CI` — all deterministic gates required by the selected profile could run agent-local and passed; CI can confirm independently;
- `READY_FOR_REMOTE_PREFLIGHT` — semantic/base/diff checks and all available local gates passed; required deterministic remote gates from the selected profile must now be triggered by the agent;
- `AUTOMATED_PREFLIGHT_CONFIRMED` — every deterministic automated gate required by the selected profile passed on the exact head/base at the required declared E2E fidelity, regardless of execution location;
- `NOT_READY_FOR_AUTOMATED_PREFLIGHT` — a required gate failed, profile/fidelity selection is unsafe, a material ambiguity/base/diff issue remains, or required automation routing is missing.

Any later edit, rebase/merge/replay, dependency change or material target-base/environment relationship change invalidates the affected evidence and may change the selected profile or fidelity requirement.

A known-red draft may be published only when the user explicitly wants a collaboration/investigation artifact. State the known-red condition clearly; do not represent it as automated readiness.
