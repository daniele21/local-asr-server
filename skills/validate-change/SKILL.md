---
name: validate-change
description: Select the cheapest sufficient validation by delivery stage and risk, escalating only when the changed invariant requires stronger gates or environment fidelity.
---

# Validate Change

Optimize for sufficient confidence per feedback time. Read `.engineering/commands.json` for stage/gate routing and `.engineering/e2e.json` only when a complete workflow or environment-dependent claim is affected.

## ITERATION
Use owner-local formatter/static checks, focused unit/component tests and affected compile/typecheck. Do not require exact-head publication evidence, durable-doc freshness, packaged `.app`, target-Mac UI media or remote preflight merely because they exist.

## INTEGRATION
For a coherent observable slice, run the selector and satisfy its **risk dimensions -> required gates -> profile** mapping. ClosedRoom integration normally adds source tests for executable changes and the packaged `.app` only for runtime/native/persistence/E2E/build-sensitive risk.

## RELEASE
Use FULL validation plus release-critical artifact/E2E gates and any residual real-environment evidence.

E2E UI evidence modes are `ASSERTIONS`, `SCREENSHOTS`, `FULL_MEDIA`. Use FULL_MEDIA only when motion/timing/navigation sequence/lifecycle visibility/release acceptance is material. ClosedRoom's real meeting-recording journey remains FULL_MEDIA because the state/lifecycle sequence and native capture path are part of the claim.

Execution capability and fidelity are separate: hosted macOS can be `REMOTE_AUTOMATED` without proving TCC/physical audio. `target-macos-real` remains the owner of those residual claims.

On failure classify regression, baseline, environment, flaky, base-drift or assumption before editing. Fix the owning invariant; never weaken a legitimate gate for green CI. Hand exact-head integration/release readiness to `preflight-change`.
