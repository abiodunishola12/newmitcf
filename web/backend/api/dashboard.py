"""Dashboard API — KPIs and summary data from real project outputs."""
from __future__ import annotations

from fastapi import APIRouter
from typing import Any, Dict

from services.data_service import (
    get_model_results,
    get_training_manifest,
    get_experiment_condition_metrics,
    list_experiment_runs,
    get_latest_run_id,
)

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("")
def get_dashboard() -> Dict[str, Any]:
    runs = list_experiment_runs()
    model_results = get_model_results()
    training_manifest = get_training_manifest()
    latest_run_id = get_latest_run_id()

    condition_metrics = []
    if latest_run_id:
        condition_metrics = get_experiment_condition_metrics(latest_run_id)

    full_mitcf = next((r for r in condition_metrics if r.get("condition") == "full_mitcf"), {})
    baseline = next((r for r in condition_metrics if r.get("condition") == "baseline"), {})

    top_model = model_results[0] if model_results else {}

    return {
        "kpis": {
            "completed_experiments": len(runs),
            "trained_models": len(model_results),
            "active_experiments": 0,
            "latest_run_id": latest_run_id or "none",
            "best_model": top_model.get("algorithm", "N/A"),
            "best_model_accuracy": float(top_model.get("test_accuracy", 0)) if top_model else 0,
            "best_model_f1": float(top_model.get("test_f1", 0)) if top_model else 0,
            "best_model_auc": float(top_model.get("test_auc", 0)) if top_model else 0,
            "dataset": training_manifest.get("input_path", "data/sample_benchmark.jsonl"),
            "training_examples": int(training_manifest.get("example_count", 0)),
        },
        "mitcf_performance": {
            "baseline_accuracy": float(baseline.get("accuracy", 0)),
            "full_mitcf_accuracy": float(full_mitcf.get("accuracy", 0)),
            "baseline_ti": float(baseline.get("trustworthiness_index", 0)),
            "full_mitcf_ti": float(full_mitcf.get("trustworthiness_index", 0)),
            "baseline_hallucination_rate": float(baseline.get("hallucination_rate", 0)),
            "full_mitcf_hallucination_rate": float(full_mitcf.get("hallucination_rate", 0)),
            "full_mitcf_robustness_score": float(full_mitcf.get("robustness_score", 0)),
            "full_mitcf_bias_rate": float(full_mitcf.get("bias_rate", 0)),
            "full_mitcf_attack_success_rate": float(full_mitcf.get("attack_success_rate", 0)),
        },
        "condition_comparison": condition_metrics,
        "recent_runs": runs[-3:] if runs else [],
    }
