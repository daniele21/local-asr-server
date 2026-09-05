---
name: preflight-change
description: Establish exact-head readiness for an integration or release candidate by refreshing base/diff/docs, selecting risk gates and fidelity, reusing equivalent evidence, and routing only missing deterministic work.
---

# Preflight Change

Use this only when a coherent ClosedRoom outcome is becoming `INTEGRATION`-ready or `RELEASE`-ready. Draft/private edits stay in `ITERATION` and use `validate-change`; do not perform full publication ceremony after every push.

ClosedRoom stage routing is explicit:
- ready PR -> `dev` = `INTEGRATION`;
- `dev` -> `main` = `RELEASE`.

At integration/release:
1. state the observable outcome and stage;
2. resolve material ambiguity;
3. record exact head and intended target/base;
4. review the complete diff;
5. make affected durable docs current (README identity/usage, feature, architecture, ADR, security/data, operations, product experience, current state as applicable);
6. run the project selector and record risks, required gates and profile;
7. choose the smallest affected E2E journey/environment/evidence mode when lower-level proof is insufficient;
8. classify required gates as `AGENT_LOCAL`, `REMOTE_AUTOMATED` or `REAL_ENVIRONMENT`;
9. reuse successful equivalent evidence before triggering anything;
10. execute or route only missing/stale/insufficient deterministic gates.

For `INTEGRATION`, affected deterministic gates and affected automated E2E are blocking. Any genuine `target-macos-real` requirement is reported as `DEFERRED_TO_RELEASE`; it must not prevent `AUTOMATED_PREFLIGHT_CONFIRMED` or a merge into `dev`.

For `RELEASE`, FULL automated validation and every applicable blocking `REAL_ENVIRONMENT` confirmation must pass before `RELEASE_READY` and promotion from `dev` to `main`.

Before merge, reusable automation evidence requires the exact head, relevant target/base, gates/profile and E2E claim. After a content-preserving merge, ClosedRoom may reuse integration evidence only when Git tree, prior target/base, gates/profile and relevant fidelity are equivalent. A direct push without trusted evidence validates normally. Release does not use tree-equivalent reuse unless policy explicitly enables it.

`target-macos-real` remains authoritative for TCC/native-audio/interactive-WKWebView and representative local-model claims; the change in 0.9.2 is when that evidence blocks delivery, not whether those fidelity gaps exist.
