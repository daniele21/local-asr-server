from __future__ import annotations

from typing import Any

from local_asr_server.structured_notes import (
    STRUCTURED_NOTES_SCHEMA_ID,
    STRUCTURED_NOTES_SCHEMA_VERSION,
    legacy_projection_results,
)


LEGACY_DEFAULT_ANALYSIS_TYPES = (
    "meeting_brief",
    "action_items",
    "decisions",
    "risks_blockers",
)


def is_structured_notes_result(result: Any) -> bool:
    if not isinstance(result, dict):
        return False
    schema = result.get("schema")
    if not isinstance(schema, dict):
        return False
    return (
        schema.get("id") == STRUCTURED_NOTES_SCHEMA_ID
        and schema.get("version") == STRUCTURED_NOTES_SCHEMA_VERSION
        and isinstance(result.get("generated"), dict)
    )


def expand_analysis_run(run: dict[str, Any]) -> list[dict[str, Any]]:
    """Project one real v2 run into stable legacy read views without new jobs."""
    result = run.get("result")
    if run.get("status") != "completed" or not is_structured_notes_result(result):
        return [run]

    projections = legacy_projection_results(result)
    expanded: list[dict[str, Any]] = []
    for analysis_type in LEGACY_DEFAULT_ANALYSIS_TYPES:
        projection = projections[analysis_type]
        item = {
            **run,
            "analysis_type": analysis_type,
            "result": projection,
            "result_markdown": projection.get("markdown"),
        }
        if analysis_type != "meeting_brief":
            item.update(
                {
                    "id": f"{run['id']}::{analysis_type}",
                    "job_id": None,
                    "template_id": analysis_type,
                    "template_version": "v2-projection",
                    "prompt_version": f"{run.get('prompt_version') or 'meeting_notes_shared_v2'}:projection",
                    "virtual_projection": True,
                    "source_run_id": run["id"],
                }
            )
        expanded.append(item)
    return expanded


def expand_analysis_runs(runs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    expanded: list[dict[str, Any]] = []
    for run in runs:
        expanded.extend(expand_analysis_run(run))
    return expanded
