"""Visual-perception data service — reads run results from results/visual_perception/."""
from __future__ import annotations

import csv
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

PROJECT_ROOT = Path(__file__).parent.parent.parent.parent
VP_RESULTS_DIR = PROJECT_ROOT / "results" / "visual_perception"


def _read_json(path: Path) -> Any:
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def _read_csv(path: Path) -> List[Dict[str, str]]:
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8", newline="") as fh:
        return list(csv.DictReader(fh))


def _read_text(path: Path) -> str:
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8")


# ─── Run listing ──────────────────────────────────────────────────────────────

def list_vp_runs() -> List[Dict[str, Any]]:
    """Return summary of all VP runs, newest first."""
    if not VP_RESULTS_DIR.exists():
        return []
    runs = []
    for sub in sorted(VP_RESULTS_DIR.iterdir(), reverse=True):
        if not sub.is_dir():
            continue
        meta = _read_json(sub / "run_metadata.json")
        if not meta:
            continue
        # Compute summary stats from item-level CSV if available
        items = _read_csv(sub / "item_level_predictions.csv")
        cond_rows = _read_csv(sub / "condition_metrics.csv")
        stat_data = _read_json(sub / "statistical_analysis.json")

        baseline_acc = None
        full_acc = None
        for row in cond_rows:
            c = row.get("condition", "")
            if c == "baseline":
                try:
                    baseline_acc = float(row.get("accuracy", 0))
                except Exception:
                    pass
            elif c == "full_mitcf":
                try:
                    full_acc = float(row.get("accuracy", 0))
                except Exception:
                    pass

        runs.append({
            "run_id": meta.get("run_id", sub.name),
            "created_at": meta.get("created_at", ""),
            "status": meta.get("status", "unknown"),
            "item_count": len(items),
            "baseline_accuracy": baseline_acc,
            "full_mitcf_accuracy": full_acc,
            "has_robustness": (sub / "robustness_metrics.csv").exists(),
            "has_ablation": (sub / "ablation_metrics.csv").exists(),
            "has_figures": (sub / "figures").exists(),
        })
    return runs


def get_vp_run_metadata(run_id: str) -> Dict[str, Any]:
    return _read_json(VP_RESULTS_DIR / run_id / "run_metadata.json")


def get_vp_environment(run_id: str) -> Dict[str, Any]:
    return _read_json(VP_RESULTS_DIR / run_id / "environment.json")


def get_vp_condition_metrics(run_id: str) -> List[Dict[str, str]]:
    return _read_csv(VP_RESULTS_DIR / run_id / "condition_metrics.csv")


def get_vp_benchmark_metrics(run_id: str) -> List[Dict[str, str]]:
    return _read_csv(VP_RESULTS_DIR / run_id / "benchmark_metrics.csv")


def get_vp_category_metrics(run_id: str) -> List[Dict[str, str]]:
    return _read_csv(VP_RESULTS_DIR / run_id / "category_metrics.csv")


def get_vp_statistical_analysis(run_id: str) -> Dict[str, Any]:
    return _read_json(VP_RESULTS_DIR / run_id / "statistical_analysis.json")


def get_vp_robustness_metrics(run_id: str) -> List[Dict[str, str]]:
    return _read_csv(VP_RESULTS_DIR / run_id / "robustness_metrics.csv")


def get_vp_ablation_metrics(run_id: str) -> List[Dict[str, str]]:
    return _read_csv(VP_RESULTS_DIR / run_id / "ablation_metrics.csv")


def get_vp_item_predictions(run_id: str, limit: int = 100) -> List[Dict[str, str]]:
    rows = _read_csv(VP_RESULTS_DIR / run_id / "item_level_predictions.csv")
    return rows[:limit]


def get_vp_report_markdown(run_id: str) -> str:
    return _read_text(VP_RESULTS_DIR / run_id / "experiment_report.md")


def get_vp_latex_tables(run_id: str) -> str:
    return _read_text(VP_RESULTS_DIR / run_id / "latex_tables.tex")


def get_vp_latest_run_id() -> Optional[str]:
    runs = list_vp_runs()
    if not runs:
        return None
    dated = [r for r in runs if r.get("created_at")]
    if dated:
        return sorted(dated, key=lambda r: r["created_at"], reverse=True)[0]["run_id"]
    return runs[0]["run_id"]


# ─── Dataset and environment status ───────────────────────────────────────────

def get_vp_dataset_status() -> Dict[str, Any]:
    """Quick check for POPE + MME dataset presence."""
    pope_dir = PROJECT_ROOT / "data" / "pope"
    mme_dir = PROJECT_ROOT / "data" / "mme"

    def _pope_status() -> Dict[str, Any]:
        ann = pope_dir / "annotations"
        imgs = pope_dir / "val2014"
        categories = ["coco_pope_random", "coco_pope_popular", "coco_pope_adversarial"]
        ann_files = {c: (ann / f"{c}.json").exists() for c in categories}
        img_count = len(list(imgs.glob("*.jpg"))) if imgs.exists() else 0
        return {
            "annotations_found": all(ann_files.values()),
            "annotation_files": ann_files,
            "image_count": img_count,
            "images_found": img_count > 0,
            "ready": all(ann_files.values()) and img_count > 0,
        }

    def _mme_status() -> Dict[str, Any]:
        categories = [
            "existence", "count", "position", "color", "posters", "celebrity",
            "scene", "landmark", "artwork", "OCR",
            "commonsense_reasoning", "numerical_calculation",
            "text_translation", "code_reasoning",
        ]
        found = {c: (mme_dir / c / "questions_answers_YN.txt").exists() for c in categories}
        return {
            "categories_found": sum(found.values()),
            "categories_total": len(categories),
            "category_status": found,
            "ready": sum(found.values()) >= 10,
        }

    return {
        "pope": _pope_status(),
        "mme": _mme_status(),
    }


def get_vp_inspect_output() -> Dict[str, Any]:
    """Run `python -m visual_perception.cli inspect` and return parsed output."""
    try:
        result = subprocess.run(
            [sys.executable, "-m", "visual_perception.cli", "inspect"],
            capture_output=True, text=True, timeout=30,
            cwd=str(PROJECT_ROOT),
        )
        return {
            "exit_code": result.returncode,
            "stdout": result.stdout,
            "stderr": result.stderr,
        }
    except Exception as e:
        return {"exit_code": -1, "stdout": "", "stderr": str(e)}
