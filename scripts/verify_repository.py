#!/usr/bin/env python3
"""Zero-dependency structural checks for ClosedRoom."""
from __future__ import annotations
import argparse, json, sys
from pathlib import Path

CORE_SKILLS=("plan-workstream","structured-change","design-product-experience","validate-change","preflight-change","remote-preflight","finalize-workstream","review-reference-quality")
REQUIRED=("README.md","AGENTS.md","CONTRIBUTING.md","SECURITY.md",".editorconfig",".gitignore",".engineering/baseline.json",".engineering/documentation-policy.json",".engineering/commands.json",".engineering/e2e.json",".github/pull_request_template.md",".github/workflows/repository-health.yml",".github/workflows/preflight.yml","docs/README.md","docs/architecture.md","docs/current-state.md","docs/features/README.md","docs/adr/README.md","docs/workstreams/README.md","scripts/build_artifact.sh","scripts/clean_build_state.py","scripts/finalize_build_artifact.py","scripts/select_validation_profile.py","scripts/smoke_packaged_app.py","scripts/verify_operations.py","scripts/verify_e2e.py","scripts/verify_stage_environment_policy.py","scripts/verify_product_experience.py")
MARKERS=("<PROJECT_NAME>","<REPLACE_WITH_","<DESCRIBE_","<LIST_")

def main()->int:
    p=argparse.ArgumentParser(); p.add_argument("--root",default="."); p.add_argument("--template-mode",action="store_true"); a=p.parse_args(); root=Path(a.root).resolve(); errors=[]; warnings=[]
    for rel in REQUIRED:
        if not (root/rel).is_file(): errors.append(f"missing required file: {rel}")
    for name in CORE_SKILLS:
        if not (root/"skills"/name/"SKILL.md").is_file(): errors.append(f"missing core skill: skills/{name}/SKILL.md")
    try: baseline=json.loads((root/".engineering/baseline.json").read_text())
    except Exception as exc: errors.append(f"invalid baseline.json: {exc}"); baseline={}
    standard=baseline.get("standard",{})
    if baseline.get("schema_version")!=1: errors.append("baseline schema_version must be 1")
    if standard.get("source")!="daniele21/repo-template-sw": errors.append("baseline source invalid")
    if standard.get("version")!="0.9.2": errors.append("baseline standard.version must be 0.9.2")
    if standard.get("revision")!="8aa95d10254846e7d63f4bd5c60d61b18d21060c": errors.append("baseline standard.revision must match canonical 0.9.2 main")
    if baseline.get("target_level") not in {"L0","L1","L2"}: errors.append("target_level invalid")
    for name in CORE_SKILLS:
        entry=baseline.get("skills",{}).get(name)
        if not isinstance(entry,dict) or not entry.get("source_version") or not isinstance(entry.get("customized"),bool): errors.append(f"baseline skill metadata invalid: {name}")
    if not a.template_mode:
        for rel in ("README.md","AGENTS.md","docs/architecture.md","SECURITY.md"):
            path=root/rel
            if path.is_file():
                text=path.read_text()
                for marker in MARKERS:
                    if marker in text: errors.append(f"unresolved adopter placeholder {marker} in {rel}")
    pyproject=root/"pyproject.toml"
    if pyproject.is_file() and ("file:///Users/" in pyproject.read_text() or "file:///home/" in pyproject.read_text()): errors.append("pyproject.toml contains developer-machine absolute dependency")
    present=[x for x in ("node_modules",".venv","build","dist","__pycache__") if (root/x).exists()]
    if present: warnings.append("generated/local directories present: "+", ".join(present))
    print("Repository baseline check")
    for warning in warnings: print("WARN:",warning)
    for error in errors: print("FAIL:",error)
    print("RESULT:","FAIL" if errors else "PASS")
    return 1 if errors else 0
if __name__=="__main__": sys.exit(main())
