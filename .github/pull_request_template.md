## Outcome

Describe the user/system outcome and the owning boundary changed.

## Branch flow

- Target branch: `dev` for ordinary work / `main` only for `dev -> main` stable promotion
- Source branch:
- [ ] This PR follows the canonical `feature|fix|chore -> dev` or `dev -> main` flow

## Scope and contracts

- Owning source(s):
- Public/persistence/security/runtime/UI contract impact:
- Documentation/design contracts updated or N/A:

## Validation

- Selected profile: LEAN / SCOPED / STRONG / FULL
- Profile reason:
- AGENT_LOCAL gates and result:
- REMOTE_AUTOMATED gates and result/pending:
- REAL_ENVIRONMENT evidence and result/pending:

If E2E applies, record the journey, `.engineering/e2e.json` environment ID, fidelity class and residual gaps. Do not promote source/emulator evidence into packaged/physical target evidence.

## Readiness

- [ ] Material ambiguity resolved
- [ ] Intended target base/head identity checked
- [ ] Complete diff reviewed for unrelated/generated/private residue
- [ ] Required deterministic gates for the selected profile passed or are explicitly routed
- [ ] Failure root causes were diagnosed rather than suppressed
- [ ] Cleanup/residue expectations are satisfied for executed runtime/E2E/build work
- [ ] Sensitive audio/transcript/credentials are absent from the diff and evidence
