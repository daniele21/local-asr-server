---
name: remote-preflight
description: Satisfy integration/release deterministic gates through repository-owned remote automation, reusing equivalent successful evidence before running only missing, stale or insufficient gates.
---

# Remote Preflight

Use this when `preflight-change` has an `INTEGRATION` or `RELEASE` candidate with required `REMOTE_AUTOMATED` gates.

Read `.engineering/commands.json` and record stage, head, source tree, target/base, risks, required gates, profile and any E2E environment/mode. Search successful evidence before starting new work.

Pre-merge evidence normally matches exact head + target/base + gates/profile + relevant E2E claim. ClosedRoom additionally allows **post-merge tree-equivalent reuse on `dev`** only when the validated candidate and integrated commit have the same Git tree, the push base is the exact previously validated target/base, required gates/profile are equal or weaker, and the repository workflow owns the artifact identity. A different tree, moved base, broadened gates, expired evidence or direct push means normal validation. Do not apply tree-equivalent reuse to release unless explicitly allowed.

If evidence is sufficient, return automated preflight confirmed without rerunning expensive macOS jobs. Otherwise execute only missing gates. Do not default to FULL because it is easier operationally, and never ask the user to run deterministic CI work because the current agent lacks macOS tooling.

For ClosedRoom, hosted source/package jobs remain automation evidence; real TCC, microphone/system-audio and interactive WKWebView claims remain `REAL_ENVIRONMENT` through `target-macos-real`.

On failure inspect logs, classify regression/baseline/environment/flaky/base-drift/assumption, fix the owning cause and rerun only affected evidence. Preserve read-only execution credentials, same-repository heads and bounded evidence retention.
