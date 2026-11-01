"""Visual-perception evaluation API."""
from __future__ import annotations

import uuid
from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from services.vp_data_service import (
    list_vp_runs,
    get_vp_run_metadata,
    get_vp_environment,
    get_vp_condition_metrics,
    get_vp_benchmark_metrics,
    get_vp_category_metrics,
    get_vp_statistical_analysis,
    get_vp_robustness_metrics,
    get_vp_ablation_metrics,
    get_vp_item_predictions,
    get_vp_report_markdown,
    get_vp_latex_tables,
    get_vp_latest_run_id,
    get_vp_dataset_status,
    get_vp_inspect_output,
)
from services.vp_experiment_service import vp_experiment_service

router = APIRouter(prefix="/api/visual-perception", tags=["visual-perception"])


# ─── Runs ──────────────────────────────────────────────────────────────────────

@router.get("/runs")
def list_runs() -> List[Dict[str, Any]]:
    return list_vp_runs()


@router.get("/runs/latest")
def latest_run() -> Dict[str, Any]:
    run_id = get_vp_latest_run_id()
    if not run_id:
        raise HTTPException(404, "No visual-perception runs found")
    return _full_run(run_id)


@router.get("/runs/{run_id}")
def get_run(run_id: str) -> Dict[str, Any]:
    meta = get_vp_run_metadata(run_id)
    if not meta:
        raise HTTPException(404, f"Run not found: {run_id}")
    return _full_run(run_id)


def _full_run(run_id: str) -> Dict[str, Any]:
    return {
        "run_id": run_id,
        "metadata": get_vp_run_metadata(run_id),
        "environment": get_vp_environment(run_id),
        "condition_metrics": get_vp_condition_metrics(run_id),
        "benchmark_metrics": get_vp_benchmark_metrics(run_id),
        "category_metrics": get_vp_category_metrics(run_id),
        "statistical_analysis": get_vp_statistical_analysis(run_id),
    }


@router.get("/runs/{run_id}/condition-metrics")
def condition_metrics(run_id: str) -> List[Dict[str, str]]:
    rows = get_vp_condition_metrics(run_id)
    if not rows:
        raise HTTPException(404, f"No condition metrics for run: {run_id}")
    return rows


@router.get("/runs/{run_id}/benchmark-metrics")
def benchmark_metrics(run_id: str) -> List[Dict[str, str]]:
    return get_vp_benchmark_metrics(run_id)


@router.get("/runs/{run_id}/category-metrics")
def category_metrics(run_id: str) -> List[Dict[str, str]]:
    return get_vp_category_metrics(run_id)


@router.get("/runs/{run_id}/statistical-analysis")
def statistical_analysis(run_id: str) -> Dict[str, Any]:
    return get_vp_statistical_analysis(run_id)


@router.get("/runs/{run_id}/robustness")
def robustness(run_id: str) -> List[Dict[str, str]]:
    return get_vp_robustness_metrics(run_id)


@router.get("/runs/{run_id}/ablation")
def ablation(run_id: str) -> List[Dict[str, str]]:
    return get_vp_ablation_metrics(run_id)


@router.get("/runs/{run_id}/predictions")
def predictions(run_id: str, limit: int = 100) -> List[Dict[str, str]]:
    return get_vp_item_predictions(run_id, limit=limit)


@router.get("/runs/{run_id}/report")
def report_markdown(run_id: str) -> Dict[str, str]:
    md = get_vp_report_markdown(run_id)
    if not md:
        raise HTTPException(404, f"No report for run: {run_id}")
    return {"run_id": run_id, "markdown": md}


@router.get("/runs/{run_id}/latex")
def latex_tables(run_id: str) -> Dict[str, str]:
    tex = get_vp_latex_tables(run_id)
    return {"run_id": run_id, "latex": tex}


# ─── Dataset and environment ───────────────────────────────────────────────────

@router.get("/dataset-status")
def dataset_status() -> Dict[str, Any]:
    return get_vp_dataset_status()


@router.get("/inspect")
def inspect() -> Dict[str, Any]:
    return get_vp_inspect_output()


# ─── Job launch ────────────────────────────────────────────────────────────────

class EvalJobRequest(BaseModel):
    subcommand: str = Field(
        default="evaluate",
        description="CLI subcommand: evaluate | robustness | ablation | smoke-test | validate-data",
    )
    extra_args: List[str] = Field(default_factory=list)


@router.post("/jobs")
def launch_job(req: EvalJobRequest) -> Dict[str, Any]:
    allowed = {"evaluate", "robustness", "ablation", "smoke-test", "validate-data"}
    if req.subcommand not in allowed:
        raise HTTPException(400, f"subcommand must be one of: {sorted(allowed)}")
    job_id = str(uuid.uuid4())[:8]
    job = vp_experiment_service.start_job(job_id, req.subcommand, req.extra_args)
    return job.to_dict()


@router.get("/jobs")
def list_jobs() -> List[Dict[str, Any]]:
    return vp_experiment_service.list_jobs()


@router.get("/jobs/{job_id}")
def get_job(job_id: str) -> Dict[str, Any]:
    job = vp_experiment_service.get_job(job_id)
    if not job:
        raise HTTPException(404, f"Job not found: {job_id}")
    return job.to_dict()
