"""Experiments API — list runs, fetch metrics, run new experiments."""
from __future__ import annotations

import uuid
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Any, Dict, List

from services.data_service import (
    list_experiment_runs,
    get_experiment_condition_metrics,
    get_experiment_dataset_metrics,
    get_experiment_statistical_tests,
    get_experiment_manifest,
    get_experiment_qualitative_errors,
    get_latest_run_id,
)
from services.experiment_service import experiment_service

router = APIRouter(prefix="/api/experiments", tags=["experiments"])


@router.get("")
def list_runs() -> List[Dict[str, Any]]:
    return list_experiment_runs()


@router.get("/latest")
def latest_run() -> Dict[str, Any]:
    run_id = get_latest_run_id()
    if not run_id:
        raise HTTPException(404, "No experiment runs found")
    return {
        "run_id": run_id,
        "condition_metrics": get_experiment_condition_metrics(run_id),
        "dataset_metrics": get_experiment_dataset_metrics(run_id),
        "statistical_tests": get_experiment_statistical_tests(run_id),
        "manifest": get_experiment_manifest(run_id),
    }


@router.get("/{run_id}/condition-metrics")
def condition_metrics(run_id: str) -> List[Dict[str, str]]:
    rows = get_experiment_condition_metrics(run_id)
    if not rows:
        raise HTTPException(404, f"No metrics for run: {run_id}")
    return rows


@router.get("/{run_id}/dataset-metrics")
def dataset_metrics(run_id: str) -> List[Dict[str, str]]:
    rows = get_experiment_dataset_metrics(run_id)
    if not rows:
        raise HTTPException(404, f"No dataset metrics for run: {run_id}")
    return rows


@router.get("/{run_id}/statistical-tests")
def statistical_tests(run_id: str) -> List[Dict[str, str]]:
    rows = get_experiment_statistical_tests(run_id)
    if not rows:
        raise HTTPException(404, f"No statistical tests for run: {run_id}")
    return rows


@router.get("/{run_id}/manifest")
def manifest(run_id: str) -> Dict[str, Any]:
    data = get_experiment_manifest(run_id)
    if not data:
        raise HTTPException(404, f"No manifest for run: {run_id}")
    return data


@router.get("/{run_id}/errors")
def qualitative_errors(run_id: str) -> List[Dict[str, Any]]:
    return get_experiment_qualitative_errors(run_id)


class ExperimentConfig(BaseModel):
    input_path: str = "data/sample_benchmark.jsonl"
    seed: int = Field(default=42, ge=0, le=99999)
    max_revision_attempts: int = Field(default=2, ge=0, le=5)
    verification_threshold: float = Field(default=0.70, ge=0.0, le=1.0)
    model_name: str = "heuristic-local-model"
    split: str = "all"
    bootstrap_samples: int = Field(default=200, ge=50, le=5000)
    calibrate_detector: bool = False
    use_label_for_verification: bool = True
    ti_weight_hallucination: float = Field(default=0.25, ge=0.0, le=1.0)
    ti_weight_bias: float = Field(default=0.25, ge=0.0, le=1.0)
    ti_weight_robustness: float = Field(default=0.25, ge=0.0, le=1.0)
    ti_weight_decision: float = Field(default=0.25, ge=0.0, le=1.0)


@router.post("/run")
def run_new_experiment(config: ExperimentConfig) -> Dict[str, Any]:
    job_id = str(uuid.uuid4())[:8]
    config_dict = config.model_dump()
    config_dict["ti_weights"] = {
        "hallucination": config.ti_weight_hallucination,
        "bias": config.ti_weight_bias,
        "robustness": config.ti_weight_robustness,
        "decision": config.ti_weight_decision,
    }
    job = experiment_service.start_experiment(job_id, config_dict)
    return {"job_id": job_id, "status": job.status, "message": job.message}


@router.get("/jobs/{job_id}")
def get_job_status(job_id: str) -> Dict[str, Any]:
    job = experiment_service.get_job(job_id)
    if not job:
        raise HTTPException(404, f"Job not found: {job_id}")
    return job.to_dict()


@router.get("/jobs")
def list_jobs() -> List[Dict[str, Any]]:
    return experiment_service.list_jobs()
