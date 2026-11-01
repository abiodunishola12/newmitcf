"""Deep learning API — model results, training history, architecture."""
from __future__ import annotations

import uuid
from fastapi import APIRouter, HTTPException
from typing import Any, Dict, List, Optional
from pydantic import BaseModel

from services.data_service import (
    get_model_results,
    get_training_history,
    get_confusion_matrix,
    get_dataset_summary,
    get_test_predictions,
    get_training_manifest,
)
from services.experiment_service import training_service

router = APIRouter(prefix="/api/deep-learning", tags=["deep-learning"])


@router.get("/models")
def get_models() -> List[Dict[str, Any]]:
    rows = get_model_results()
    result = []
    for row in rows:
        result.append({
            "rank": int(row.get("test_rank", 0)),
            "algorithm": row.get("algorithm", ""),
            "hidden_layers": row.get("hidden_layers", "none"),
            "activation": row.get("activation", ""),
            "learning_rate": float(row.get("learning_rate", 0)),
            "l2": float(row.get("l2", 0)),
            "dropout": float(row.get("dropout", 0)),
            "epochs": int(row.get("epochs", 0)),
            "parameters": int(float(row.get("parameters", 0))),
            "train_accuracy": float(row.get("train_accuracy", 0)),
            "validation_accuracy": float(row.get("validation_accuracy", 0)),
            "test_accuracy": float(row.get("test_accuracy", 0)),
            "test_precision": float(row.get("test_precision", 0)),
            "test_recall": float(row.get("test_recall", 0)),
            "test_f1": float(row.get("test_f1", 0)),
            "test_auc": float(row.get("test_auc", 0)),
            "test_log_loss": float(row.get("test_log_loss", 0)),
            "train_log_loss": float(row.get("train_log_loss", 0)),
            "validation_log_loss": float(row.get("validation_log_loss", 0)),
            "train_examples": int(float(row.get("train_examples", 0))),
            "validation_examples": int(float(row.get("validation_examples", 0))),
            "test_examples": int(float(row.get("test_examples", 0))),
        })
    return result


@router.get("/models/{algorithm}/history")
def get_model_history(algorithm: str) -> List[Dict[str, Any]]:
    rows = get_training_history()
    history = [r for r in rows if r.get("algorithm") == algorithm]
    if not history:
        raise HTTPException(404, f"No training history for algorithm: {algorithm}")
    return [
        {
            "epoch": int(r.get("epoch", 0)),
            "train_loss": float(r.get("train_loss", 0)),
            "train_accuracy": float(r.get("train_accuracy", 0)),
            "validation_loss": float(r.get("validation_loss", 0)),
            "validation_accuracy": float(r.get("validation_accuracy", 0)),
            "validation_f1": float(r.get("validation_f1", 0)),
            "validation_auc": float(r.get("validation_auc", 0)),
        }
        for r in history
    ]


@router.get("/history/all")
def get_all_history_for_top_n(n: int = 10) -> Dict[str, List[Dict[str, Any]]]:
    """Return training curves for top N models by test rank."""
    model_results = get_model_results()
    top = sorted(model_results, key=lambda r: int(r.get("test_rank", 99)))[:n]
    top_names = [r["algorithm"] for r in top]
    rows = get_training_history()
    by_algo: Dict[str, List[Dict[str, Any]]] = {}
    for row in rows:
        algo = row.get("algorithm", "")
        if algo in top_names:
            entry = {
                "epoch": int(row.get("epoch", 0)),
                "train_loss": float(row.get("train_loss", 0)),
                "validation_loss": float(row.get("validation_loss", 0)),
                "train_accuracy": float(row.get("train_accuracy", 0)),
                "validation_accuracy": float(row.get("validation_accuracy", 0)),
            }
            by_algo.setdefault(algo, []).append(entry)
    return by_algo


@router.get("/confusion")
def get_confusion() -> List[Dict[str, Any]]:
    rows = get_confusion_matrix()
    return [
        {
            "algorithm": r.get("algorithm", ""),
            "true_positive": int(r.get("true_positive", 0)),
            "false_positive": int(r.get("false_positive", 0)),
            "true_negative": int(r.get("true_negative", 0)),
            "false_negative": int(r.get("false_negative", 0)),
        }
        for r in rows
    ]


@router.get("/dataset-summary")
def get_data_summary() -> List[Dict[str, str]]:
    return get_dataset_summary()


@router.get("/manifest")
def get_manifest() -> Dict[str, Any]:
    return get_training_manifest()


@router.get("/predictions")
def get_predictions(algorithm: Optional[str] = None) -> List[Dict[str, Any]]:
    rows = get_test_predictions()
    if algorithm:
        rows = [r for r in rows if r.get("algorithm") == algorithm]
    return [
        {
            "algorithm": r.get("algorithm", ""),
            "example_id": r.get("example_id", ""),
            "dataset": r.get("dataset", ""),
            "task_type": r.get("task_type", ""),
            "true_label": int(r.get("true_label", 0)),
            "probability_trustworthy": float(r.get("probability_trustworthy", 0)),
            "predicted_label": int(r.get("predicted_label", 0)),
        }
        for r in rows
    ]


class TrainingConfig(BaseModel):
    input_path: str = "data/sample_benchmark.jsonl"
    graph_dir: str = "graph"
    seed: int = 42
    feature_dimensions: int = 64


@router.post("/train")
def start_training(config: TrainingConfig) -> Dict[str, Any]:
    job_id = str(uuid.uuid4())[:8]
    job = training_service.start_training(job_id, config.model_dump())
    return {"job_id": job_id, "status": job.status, "message": job.message}


@router.get("/train/{job_id}")
def get_training_status(job_id: str) -> Dict[str, Any]:
    job = training_service.get_job(job_id)
    if not job:
        raise HTTPException(404, f"Job not found: {job_id}")
    return job.to_dict()
