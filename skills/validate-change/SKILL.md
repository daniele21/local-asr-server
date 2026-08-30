---
name: validate-change
description: Select the narrowest sufficient validation for a change while iterating, diagnose failures at their owning invariant, and identify the correct final gate by blast radius without confusing unavailable agent-local execution with a human testing requirement or confusing emulator evidence with target-environment evidence.
---

# Validate Change

## Principle

Do not run the entire repository for every edit, and do not stop at a local unit test when a shared contract, runtime boundary or critical user experience changed. Validation follows blast radius and the strength of the claim.

Use `.engineering/commands.json` as the canonical repository-level command routing surface. Read `.engineering/e2e.json` when a complete workflow, platform/device/browser/runtime assumption or environment-dependent claim is affected. When `product-ui` is adopted and user-facing behavior changes, also read `design/ux-contract.json` and `design/brand-kit.json`.

This Skill owns iterative validation selection. `preflight-change` owns final exact-head execution classification/readiness. `remote-preflight` owns deterministic remote execution when the current agent lacks an equivalent local environment.

## Validation ladder

### Level A — local iteration

Use for private implementation inside one owner:

- formatter/linter for touched surface;
- focused unit/component tests;
- module/package compile or typecheck.

Run these directly when the current agent has the required environment. If not, record the gate as a candidate `REMOTE_AUTOMATED` gate for preflight rather than asking the user to run it by default.

### Level B — direct consumers

Add when a contract or behavior affects known callers/adapters:

- direct consumer tests;
- contract/fake compatibility;
- persistence/migration tests if applicable;
- affected UI/transport compilation and component-state tests.

### Level C — integration/repository

Add for public contracts, multiple domains, build/configuration, CI/tooling or broad dependency changes:

- canonical `check` command;
- canonical `test` command or relevant scoped subset;
- integration/contract tests;
- canonical `build` when build/runtime/package behavior may be affected;
- repository/operating/E2E-fidelity/product-experience health checks as applicable.

### Level D — end-to-end/product flow

Add when the claim crosses a complete user/system workflow boundary and lower-level tests cannot establish the final outcome:

- canonical `e2e` command or smallest relevant critical-journey subset;
- complete workflow assertion through the real public/UI/protocol boundary;
- the cheapest declared automated environment in `.engineering/e2e.json` that can truthfully prove the changed claim;
- fidelity escalation when the claim depends on a device/platform/browser/runtime/artifact dimension missing from the cheaper environment;
- built/package artifact execution when the claim depends on distributable behavior and this is technically practical;
- zero-residue cleanup of app/server/browser/device/test state owned by the run;
- bounded failure evidence with build/run/environment identity and declared fidelity class.

Execution capability and environment fidelity are separate. `REMOTE_AUTOMATED` says where/who executed the gate; `simulated_or_emulated`, `representative_virtual`, `representative_physical` and `target_environment` say what environment claim the evidence supports. Never treat a green emulator/simulator run as physical/target-environment evidence.

Do not require E2E for every change. Prefer unit/integration coverage when it can prove the same invariant more deterministically and cheaply.

### Level E — real environment / representative evidence

Required only for claims ordinary deterministic automation cannot truthfully prove or where `.engineering/e2e.json` declares residual confirmation:

- physical device/hardware behavior;
- memory reclamation/unified/GPU footprint under representative hardware conditions;
- audio/device routing;
- performance/thermal characteristics;
- protected signing/release behavior when credentials must not be available to automation;
- external-service integration where a real environment is part of the claim;
- representative-user usability or assistive-technology evidence when the UX claim requires it.

Do not place ordinary formatter, compile, R8, lint, unit, deterministic integration or unsigned build tasks here merely because the current agent lacks the platform SDK. Those are `REMOTE_AUTOMATED` when they cannot run agent-local.

The target-environment run should primarily confirm residual fidelity gaps that could not be reproduced earlier. If it repeatedly discovers ordinary workflow failures that could have been automated, strengthen the declared automated E2E environment/journey instead of normalizing the human/device test as the first whole-system check.

Synthetic/emulator evidence must be labelled as such and cannot satisfy a stronger claim.

## E2E environment fidelity

When Level D or E is relevant, use `.engineering/e2e.json` to answer four questions before selecting the run:

1. Which critical journey owns the changed outcome?
2. Which target environment dimensions are material to the claim?
3. Which declared automated environment is the cheapest one that represents those dimensions strongly enough?
4. Which fidelity gaps remain and therefore still require target/real-environment confirmation?

Prefer this progression only as needed by the claim:

```text
lower-level tests
-> automated E2E
-> built/package artifact E2E when material
-> highest practical automated fidelity
-> residual real/target-environment confirmation
```

Do not execute every rung mechanically. Escalate only when the changed invariant depends on a missing dimension or release policy requires stronger evidence.

If no automated environment can exercise a required critical journey, preserve the explicit `automation_gap_reason` from `.engineering/e2e.json` and report the limitation. Do not silently convert the workflow into an undocumented manual test.

## Product experience validation

When `product-ui` is adopted and a change affects user-facing behavior, validate the experience properties actually changed rather than only checking visual appearance.

First confirm the change depth was appropriate:

- structural UX change — user outcome/task, IA/critical journey and hierarchy/disclosure were explicitly considered before components/motion/polish;
- interaction change — the owning task/journey plus affected states/feedback/accessibility/adaptive/component/motion layers were considered;
- visual-only change — settled flow/interaction semantics were preserved and the change stayed with the canonical design-system/brand owner.

Depending on blast radius, inspect/prove:

- user outcome/task model and information architecture;
- critical journey continuity and context preservation;
- primary/secondary/destructive action hierarchy;
- progressive disclosure and whether advanced/debug complexity remains appropriately separated;
- sensible defaults and reduction of unnecessary configuration burden;
- critical loading/empty/error/disabled/offline/permission/partial states that are reachable;
- immediate feedback, truthful progress and actionable recovery;
- keyboard/focus/assistive semantics/text scaling/contrast/reduced-motion behavior where applicable;
- responsive/adaptive layout across relevant supported contexts;
- semantic token/component reuse and absence of accidental design-system duplication;
- meaningful motion has an explicit purpose, remains restrained for frequent interaction, tracks gestures where applicable and does not degrade performance;
- functional UI remains understandable without decorative imagery and data graphics support a user question/decision;
- critical-journey E2E when lower-level tests cannot prove the user outcome;
- visual regression for stable high-risk surfaces where useful;
- representative-user usability evidence for important/high-risk workflows when justified.

A screenshot can support a visual claim but cannot by itself prove interaction, accessibility, recovery, adaptive behavior or usability.

## Smoke vs E2E

A build passing is not equivalent to the built artifact working, and smoke is not equivalent to E2E.

- `smoke` proves minimal viability: start/install/launch -> minimal request/path -> stop;
- `e2e` proves a complete critical workflow outcome across the assembled system.

Use both when both claims matter.

## Failure diagnosis

A red gate must be understood before it drives another code edit. Classify it as:

- current-change regression;
- baseline/pre-existing failure;
- environment/toolchain/dependency issue;
- flaky/non-deterministic behavior;
- stale-base/stack integration effect;
- incorrect requirement/design/contract assumption.

Identify the violated invariant and owner. Fix the owner and add regression evidence at the lowest useful level.

Never weaken/delete/suppress a legitimate failing test or requirement merely to make the change green without explicitly changing the owning contract. If the same gate fails after an attempted fix, do not repeat symptom patches: re-evaluate the hypothesis, ownership and assumptions first.

## Operational validation

When the change affects runtime/build/package/E2E/lifecycle behavior, validate applicable operating-contract invariants:

- a material build has a unique build identity;
- artifact name/manifest identify product version, build ID and source revision;
- successful artifact is promoted only after validation and is not modified in place;
- `BUILD_CHANGELOG.md` compares against the previous successful comparable build;
- local artifact retention is applied after successful promotion;
- `dev`/`e2e`/`smoke`/`stop` leave no project-owned child process or listener behind;
- browser/device profiles, test data, downloads, temporary workspaces, locks and other owned ephemeral resources are cleaned after success and failure paths;
- E2E/visual traces/screenshots/videos/logs have bounded retention and do not become permanent repository clutter;
- E2E evidence identifies the execution environment/fidelity actually used and does not overclaim stronger target evidence;
- failed/partial artifacts cannot be mistaken for valid outputs.

For localhost services, a strong smoke test is: start -> readiness -> minimal request -> graceful stop -> verify process/children/listener gone -> verify temporary resources clean.

A strong E2E extends that lifecycle with one complete critical workflow before the same cleanup verification.

## Workflow

1. Identify changed owner, user-visible impact and public blast radius.
2. Read the nearest agent guide and `.engineering/commands.json`; read `.engineering/e2e.json` when a complete workflow or environment-dependent claim is relevant; read design contracts when `product-ui` and UI behavior are relevant.
3. For meaningful UX/UI semantics, confirm `design-product-experience` was applied at proportional depth before validating the implementation.
4. Run the cheapest deterministic gate that can falsify the current edit quickly **when the current agent can execute it**.
5. On failure, classify cause and owner before editing again.
6. Expand only when the change crosses a boundary or is ready for final integration.
7. Use E2E only when the full product/system outcome is part of the claim; when used, select the declared critical journey and cheapest sufficient environment fidelity.
8. Escalate E2E fidelity only when target dimensions materially affect the claim; preserve residual real-environment evidence separately.
9. Add accessibility/adaptive/motion/visual/usability evidence only when the changed experience claim requires it.
10. If a deterministic gate cannot run in the current agent environment, record the exact missing capability and mark it for `REMOTE_AUTOMATED` routing; do not silently pass it and do not default to asking the user to execute it.
11. Report exact validation executed, E2E environment/fidelity used and evidence still pending.
12. Before publication, hand the accumulated evidence to `preflight-change`; it will classify executor capability and invoke `remote-preflight` when required.

## Output

An iteration/final change summary should distinguish:

- PASS — executed and passed;
- FAIL — executed and failed;
- PENDING — required but not yet executed;
- N/A — genuinely not applicable.

Also record whether a pending gate is expected to be `REMOTE_AUTOMATED` or `REAL_ENVIRONMENT`. For E2E evidence, record the `.engineering/e2e.json` environment ID/fidelity class and any residual gaps. Absence of agent-local execution is not evidence that a user must run the gate.
