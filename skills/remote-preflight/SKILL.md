---
name: remote-preflight
description: Execute and close the narrowest sufficient deterministic validation through repository-owned remote automation when the current coding agent lacks an equivalent local execution environment, without delegating automatable test work to the user or running full CI by default.
---

# Remote Preflight

Use this Skill when `preflight-change` classifies one or more required deterministic gates as `REMOTE_AUTOMATED`.

The governing rules are:

> Do not turn the user into a CI runner because the current agent lacks a shell, checkout, SDK or platform toolchain.

> Do not turn every small PR into a full repository/release build. Select validation from the actual blast radius.

## 1. Confirm remote execution ownership

Read `.engineering/commands.json` and identify:

- remote-preflight trigger mechanism and exact command/event;
- validation profile selector;
- intended target PR/head;
- canonical commands/jobs each profile can execute;
- how results/logs and selected scope are surfaced;
- timeout/retention behavior;
- trust/security restrictions.

If the repository has no usable remote path for a required automatable gate, report `AUTOMATION_CAPABILITY_GAP`. If it has no trustworthy way to narrow blast radius, report `VALIDATION_SCOPE_GAP` and fail safe to a stronger profile while fixing the selector.

## 2. Resolve profile

Default to the repository's `auto` selector.

Expected resolution:

- `LEAN` — docs/governance/metadata-only or cheap universal guards;
- `SCOPED` — contained implementation owner/module plus direct consumers;
- `STRONG` — cross-boundary/shared-contract/native/JNI/persistence/security/packaging/R8/dependency/variant or other release-sensitive changes;
- `FULL` — promotion/release, selector/global-build/dependency-inventory/toolchain changes, unknown executable paths, or explicit full validation.

The run must report the selected profile and reason. Do not silently request `full` merely because it is simpler to implement.

A stronger explicit request is allowed, such as `/preflight strong` or `/preflight full`. A weaker-than-auto request is exceptional and requires explicit justification; do not use it as a normal optimization.

## 3. Trigger exact-head validation

Trigger the declared remote preflight against the exact current PR/head revision using `auto` unless a stronger profile is justified.

For a PR-comment trigger:

- verify the PR still targets the intended base;
- record the current head SHA before triggering;
- issue the exact declared command once;
- correlate the resulting run/report with that head SHA;
- verify the run reports the expected profile/scope reason.

Do not reuse a remote result from an older head after any material edit, rebase, replay or base change.

## 4. Inspect result and logs

Record:

- selected profile;
- profile reason;
- affected modules/components/jobs;
- each required remote gate as `PASS`, `FAIL`, `PENDING` or `N/A`.

On failure:

1. inspect the failing job/step/log rather than guessing from the headline;
2. classify the failure as `CHANGE_REGRESSION`, `BASELINE_FAILURE`, `ENVIRONMENT`, `FLAKY`, `BASE_DRIFT` or `ASSUMPTION`;
3. identify the violated invariant and owning source/configuration;
4. determine whether the remote runner exposed a local/remote parity or scope-selection gap;
5. form a falsifiable repair hypothesis before editing.

A remote failure is not permission to suppress R8/lint/tests, add broad keep rules blindly, weaken another legitimate gate, or downgrade the profile to escape the failure.

## 5. Repair and retrigger autonomously

When the failure is actionable and unambiguous:

- patch the owning cause;
- run any available cheap `AGENT_LOCAL` checks/static review;
- refresh head/base identity and complete-diff review as needed;
- re-run blast-radius/profile selection because the fix itself can alter scope;
- retrigger remote preflight;
- inspect the new exact-head result.

Do not ask the user to execute the same automatable test between repair attempts.

If the same gate fails after a repair, stop symptom patching and form a new root-cause hypothesis before the next edit. Escalate to the user only if a material product/contract decision becomes genuinely ambiguous or `REAL_ENVIRONMENT` evidence is required.

## 6. Profile quality feedback

Treat CI cost/latency as an engineering signal without trading away evidence.

If `FULL` runs frequently for contained changes, inspect why:

- unknown paths not mapped to owners;
- missing dependency graph;
- overly broad global-path rules;
- selector unable to distinguish package/native/runtime risk;
- validation infrastructure accidentally acting as the second source of truth.

Prefer improving deterministic scope selection over adding manual labels to every PR.

Conversely, if a narrower profile misses a deterministic failure in a materially affected component, strengthen the dependency/scope mapping so the same class escalates automatically next time.

## 7. Security requirements

For repository automation that executes PR/change-branch code, verify that the implementation follows the local security contract. Prefer:

- trusted requesters only;
- exact-head pinning;
- same-repository PRs by default;
- no production/deployment/signing secrets in the execution job;
- read-only/no write credentials while change-branch code executes;
- a separate reporting job if PR write permission is needed;
- bounded timeout and failure-artifact retention.

Do not solve an execution-capability problem by weakening the repository trust boundary.

## 8. Output

Report:

```text
HEAD: <revision>
TARGET: <branch>@<revision>
REMOTE_TRIGGER: <mechanism>
VALIDATION_PROFILE: LEAN|SCOPED|STRONG|FULL
PROFILE_REASON: <reason>
AFFECTED_SCOPE: <modules/components/jobs>
REMOTE_GATES:
  <gate>: PASS|FAIL|PENDING|N/A
FAILURE_CLASS: <class|N/A>
REAL_ENVIRONMENT:
  <gate>: PENDING|PASS|N/A
READINESS: AUTOMATED_PREFLIGHT_CONFIRMED|NOT_READY_FOR_AUTOMATED_PREFLIGHT
```

`AUTOMATED_PREFLIGHT_CONFIRMED` requires every deterministic automatable gate selected by the blast-radius profile to pass on the exact current head/base. It does not imply physical-device, hardware, representative-user, signing or release evidence unless those gates also ran.
