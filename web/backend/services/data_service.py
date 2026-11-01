"""Reads existing project CSV/JSON/JSONL output files and returns structured data."""
from __future__ import annotations

import csv
import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

PROJECT_ROOT = Path(__file__).parent.parent.parent.parent
GRAPH_DIR = PROJECT_ROOT / "graph"
OUTPUTS_DIR = PROJECT_ROOT / "outputs"
DATA_DIR = PROJECT_ROOT / "data"


def _read_csv(path: Path) -> List[Dict[str, str]]:
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8", newline="") as fh:
        reader = csv.DictReader(fh)
        return list(reader)


def _read_json(path: Path) -> Any:
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def _read_jsonl(path: Path, limit: int = 50) -> List[Dict[str, Any]]:
    if not path.exists():
        return []
    rows = []
    with path.open("r", encoding="utf-8") as fh:
        for line in fh:
            if line.strip():
                try:
                    rows.append(json.loads(line))
                except json.JSONDecodeError:
                    pass
            if len(rows) >= limit:
                break
    return rows


def get_model_results() -> List[Dict[str, str]]:
    return _read_csv(GRAPH_DIR / "model_results.csv")


def get_training_history() -> List[Dict[str, str]]:
    return _read_csv(GRAPH_DIR / "training_history.csv")


def get_confusion_matrix() -> List[Dict[str, str]]:
    return _read_csv(GRAPH_DIR / "confusion_matrix.csv")


def get_dataset_summary() -> List[Dict[str, str]]:
    return _read_csv(GRAPH_DIR / "dataset_summary.csv")


def get_test_predictions() -> List[Dict[str, str]]:
    return _read_csv(GRAPH_DIR / "test_predictions.csv")


def get_training_manifest() -> Dict[str, Any]:
    return _read_json(GRAPH_DIR / "training_manifest.json")


def get_fuzzy_gate_results() -> List[Dict[str, str]]:
    return _read_csv(GRAPH_DIR / "fuzzy_gate" / "fuzzy_gate_results.csv")


def get_fuzzy_action_distribution() -> List[Dict[str, str]]:
    return _read_csv(GRAPH_DIR / "fuzzy_gate" / "fuzzy_action_distribution.csv")


def get_fuzzy_action_memberships() -> List[Dict[str, str]]:
    return _read_csv(GRAPH_DIR / "fuzzy_gate" / "fuzzy_action_memberships.csv")


def get_fuzzy_gate_manifest() -> Dict[str, Any]:
    return _read_json(GRAPH_DIR / "fuzzy_gate" / "fuzzy_gate_manifest.json")


def list_experiment_runs() -> List[Dict[str, Any]]:
    if not OUTPUTS_DIR.exists():
        return []
    runs = []
    for d in sorted(OUTPUTS_DIR.iterdir()):
        if not d.is_dir():
            continue
        manifest_path = d / "manifest.json"
        manifest = _read_json(manifest_path) if manifest_path.exists() else {}
        metrics_path = d / "metrics_by_condition.csv"
        rows = _read_csv(metrics_path)
        full_mitcf = next((r for r in rows if r.get("condition") == "full_mitcf"), {})
        baseline = next((r for r in rows if r.get("condition") == "baseline"), {})
        runs.append({
            "run_id": d.name,
            "path": str(d),
            "created_at": manifest.get("created_at_utc", ""),
            "item_count": manifest.get("item_count", 0),
            "model_adapter": manifest.get("model_adapter", ""),
            "split": manifest.get("config", {}).get("split", ""),
            "seed": manifest.get("config", {}).get("seed", ""),
            "verification_threshold": manifest.get("config", {}).get("verification_threshold", ""),
            "full_mitcf_accuracy": float(full_mitcf.get("accuracy", 0)),
            "full_mitcf_ti": float(full_mitcf.get("trustworthiness_index", 0)),
            "baseline_accuracy": float(baseline.get("accuracy", 0)),
            "baseline_ti": float(baseline.get("trustworthiness_index", 0)),
        })
    return runs


def get_experiment_condition_metrics(run_id: str) -> List[Dict[str, str]]:
    return _read_csv(OUTPUTS_DIR / run_id / "metrics_by_condition.csv")


def get_experiment_dataset_metrics(run_id: str) -> List[Dict[str, str]]:
    return _read_csv(OUTPUTS_DIR / run_id / "metrics_by_dataset.csv")


def get_experiment_statistical_tests(run_id: str) -> List[Dict[str, str]]:
    return _read_csv(OUTPUTS_DIR / run_id / "statistical_tests.csv")


def get_experiment_manifest(run_id: str) -> Dict[str, Any]:
    return _read_json(OUTPUTS_DIR / run_id / "manifest.json")


def get_experiment_qualitative_errors(run_id: str) -> List[Dict[str, Any]]:
    return _read_jsonl(OUTPUTS_DIR / run_id / "qualitative_errors.jsonl", limit=25)


def get_latest_run_id() -> Optional[str]:
    runs = list_experiment_runs()
    if not runs:
        return None
    dated = [r for r in runs if r["created_at"]]
    if dated:
        return sorted(dated, key=lambda r: r["created_at"], reverse=True)[0]["run_id"]
    return runs[-1]["run_id"]


def get_chart_png_paths() -> Dict[str, List[str]]:
    result: Dict[str, List[str]] = {"main": [], "accuracy_3d": [], "fuzzy_gate": []}
    for name in ["accuracy_comparison.png", "f1_auc_precision_recall.png",
                 "metric_heatmap.png", "validation_accuracy_curves.png", "validation_loss_curves.png"]:
        p = GRAPH_DIR / name
        if p.exists():
            result["main"].append(str(p))
    a3d = GRAPH_DIR / "accuracy_3d"
    if a3d.exists():
        result["accuracy_3d"] = sorted(str(p) for p in a3d.glob("*.png"))
    fg = GRAPH_DIR / "fuzzy_gate"
    if fg.exists():
        result["fuzzy_gate"] = sorted(str(p) for p in fg.glob("*.png"))
    return result
