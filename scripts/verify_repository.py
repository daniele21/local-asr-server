#!/usr/bin/env python3
"""Zero-dependency structural checks for ClosedRoom."""
from __future__ import annotations
import argparse,json,sys
from pathlib import Path
CORE=("plan-workstream","structured-change","design-product-experience","validate-change","preflight-change","remote-preflight","finalize-workstream","review-reference-quality")
REQUIRED=("README.md","AGENTS.md","CONTRIBUTING.md","SECURITY.md",".editorconfig",".gitignore",".engineering/baseline.json",".engineering/documentation-policy.json",".engineering/commands.json",".engineering/e2e.json",".github/pull_request_template.md",".github/workflows/repository-health.yml",".github/workflows/preflight.yml","docs/README.md","docs/architecture.md","docs/current-state.md","docs/features/README.md","docs/adr/README.md","docs/workstreams/README.md","scripts/build_artifact.sh","scripts/clean_build_state.py","scripts/finalize_build_artifact.py","scripts/select_validation_profile.py","scripts/smoke_packaged_app.py","scripts/verify_operations.py","scripts/verify_e2e.py","scripts/verify_stage_environment_policy.py","scripts/verify_product_experience.py")
MARKERS=("<PROJECT_NAME>","<REPLACE_WITH_","<DESCRIBE_","<LIST_")
def main()->int:
    p=argparse.ArgumentParser();p.add_argument("--root",default=".");p.add_argument("--template-mode",action="store_true");a=p.parse_args();root=Path(a.root).resolve();errors=[];warnings=[]
    for rel in REQUIRED:
        if not (root/rel).is_file():errors.append(f"missing required file: {rel}")
    for n in CORE:
        if not (root/"skills"/n/"SKILL.md").is_file():errors.append(f"missing core skill: skills/{n}/SKILL.md")
    try:b=json.loads((root/".engineering/baseline.json").read_text())
    except Exception as x:errors.append(f"invalid baseline.json: {x}");b={}
    s=b.get("standard",{})
    if b.get("schema_version")!=1:errors.append("baseline schema_version must be 1")
    if s.get("source")!="daniele21/repo-template-sw":errors.append("baseline source invalid")
    if s.get("version")!="0.9.2":errors.append("baseline standard.version must be 0.9.2")
    if s.get("revision")!="8aa95d10254846e7d63f4bd5c60d61b18d21060c":errors.append("baseline standard.revision must match canonical 0.9.2 main")
    if b.get("target_level") not in {"L0","L1","L2"}:errors.append("target_level invalid")
    for n in CORE:
        e=b.get("skills",{}).get(n)
        if not isinstance(e,dict) or not e.get("source_version") or not isinstance(e.get("customized"),bool):errors.append(f"baseline skill metadata invalid: {n}")
    if not a.template_mode:
        for rel in ("README.md","AGENTS.md","docs/architecture.md","SECURITY.md"):
            path=root/rel
            if path.is_file():
                text=path.read_text()
                for m in MARKERS:
                    if m in text:errors.append(f"unresolved adopter placeholder {m} in {rel}")
    py=root/"pyproject.toml"
    if py.is_file() and ("file:///Users/" in py.read_text() or "file:///home/" in py.read_text()):errors.append("pyproject.toml contains developer-machine absolute dependency")
    present=[x for x in ("node_modules",".venv","build","dist","__pycache__") if (root/x).exists()]
    if present:warnings.append("generated/local directories present: "+", ".join(present))
    print("Repository baseline check");[print("WARN:",x) for x in warnings];[print("FAIL:",x) for x in errors];print("RESULT:","FAIL" if errors else "PASS");return 1 if errors else 0
if __name__=="__main__":sys.exit(main())
