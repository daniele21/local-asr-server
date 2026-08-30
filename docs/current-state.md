# Current state

## Engineering baseline

ClosedRoom is adopting `daniele21/repo-template-sw` **0.8.0** with target maturity **L2** and profiles `python`, `typescript`, `macos`, `local-ai`, `product-ui`.

The adoption branch `engineering-baseline-0.8` was created from `speaker_detection`, which is the most advanced product branch at migration start and is strictly ahead of `main`, `pipeline`, `tech-improvements` and `ux-refactoring` in Git history.

## Strong existing evidence to preserve

- Detailed current architecture and a broad Python unit/integration suite.
- Explicit runtime/service/job/port ownership introduced in the advanced branch line.
- Native macOS capture, diarization and visual-intelligence boundaries with focused tests.
- Existing visual + diarization smoke tooling and representative datasets.
- Version-aware macOS app packaging and native-helper validation.
- Code-first semantic UI tokens/components in the React frontend.

## Open baseline gaps

- No repository-owned deterministic packaged `.app` smoke/E2E harness yet; packaged launch/WKWebView/readiness/post-stop cleanup remains real-environment evidence.
- Source-contract E2E does not prove real TCC prompts, physical audio devices, MLX/Metal memory/performance or production model quality.
- Remote preflight is not yet implemented as a trusted exact-head repository workflow.
- Blast-radius profile selection is policy-driven but not yet machine-selected from changed paths.
- Build manifest/SHA-256, source-revision build identity, build delta and bounded successful-artifact retention are now required by contract but are not yet fully enforced by the existing build pipeline.
- Historical planning documents still need a separate lifecycle cleanup; they are not treated as current operational truth.

## Next highest-value work

1. Make the declared test/check baseline green and CI-parity-safe on the current product head.
2. Add deterministic built-`.app` smoke lifecycle automation with zero-residue listener/helper verification.
3. Enforce build manifest, source/build identity, SHA-256, build delta and artifact retention in `build.sh`/CI.
4. Add trusted exact-head remote preflight and a deterministic blast-radius selector.
5. Move reproducible failures found only during final macOS testing into the cheapest sufficient automated E2E environment.
