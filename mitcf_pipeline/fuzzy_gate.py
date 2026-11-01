from __future__ import annotations

import argparse
import csv
import math
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Sequence

from .io_utils import ensure_dir, write_csv, write_json
from .png_charts import bar_chart, grouped_bar_chart, heatmap


ACTION_CENTROIDS = {
    "refuse": 0.05,
    "escalate": 0.25,
    "revise": 0.45,
    "verify": 0.65,
    "accept": 0.90,
}


@dataclass
class FuzzyInputs:
    quality: float
    safety: float
    risk: float
    uncertainty: float
    efficiency: float


@dataclass
class FuzzyDecision:
    action: str
    gate_score: float
    memberships: Dict[str, float]
    inputs: FuzzyInputs


class FuzzyDecisionGate:
    """Mamdani-style fuzzy gate for model-selection and MITCF decision analysis."""

    def evaluate(self, inputs: FuzzyInputs) -> FuzzyDecision:
        quality = self._quality_membership(inputs.quality)
        safety = self._quality_membership(inputs.safety)
        risk = self._risk_membership(inputs.risk)
        uncertainty = self._risk_membership(inputs.uncertainty)
        efficiency = self._quality_membership(inputs.efficiency)

        accept = max(
            min(quality["high"], safety["high"], risk["low"], uncertainty["low"]),
            min(quality["high"], safety["high"], risk["low"], efficiency["high"]),
        )
        verify = max(
            min(quality["high"], risk["medium"]),
            min(quality["medium"], safety["high"], risk["low"]),
            min(quality["medium"], risk["medium"], uncertainty["medium"]),
            min(quality["high"], uncertainty["medium"]),
        )
        revise = max(
            min(quality["medium"], risk["high"]),
            min(quality["low"], risk["medium"]),
            min(safety["medium"], uncertainty["high"]),
            min(quality["medium"], safety["medium"]),
        )
        escalate = max(
            min(quality["low"], risk["high"]),
            min(safety["low"], uncertainty["high"]),
            min(quality["low"], uncertainty["medium"]),
        )
        refuse = max(
            min(safety["low"], risk["high"]),
            min(quality["low"], safety["low"], uncertainty["high"]),
        )

        memberships = {
            "accept": accept,
            "verify": verify,
            "revise": revise,
            "escalate": escalate,
            "refuse": refuse,
        }
        gate_score = self._defuzzify(memberships)
        action = self._select_action(memberships, gate_score)
        return FuzzyDecision(action=action, gate_score=gate_score, memberships=memberships, inputs=inputs)

    def _quality_membership(self, value: float) -> Dict[str, float]:
        value = _clip(value)
        return {
            "low": _left_shoulder(value, 0.35, 0.55),
            "medium": _triangle(value, 0.35, 0.58, 0.80),
            "high": _right_shoulder(value, 0.65, 0.85),
        }

    def _risk_membership(self, value: float) -> Dict[str, float]:
        value = _clip(value)
        return {
            "low": _left_shoulder(value, 0.15, 0.35),
            "medium": _triangle(value, 0.20, 0.45, 0.70),
            "high": _right_shoulder(value, 0.55, 0.80),
        }

    def _defuzzify(self, memberships: Dict[str, float]) -> float:
        numerator = sum(memberships[action] * ACTION_CENTROIDS[action] for action in memberships)
        denominator = sum(memberships.values())
        if denominator <= 0:
            return 0.25
        return _clip(numerator / denominator)

    def _select_action(self, memberships: Dict[str, float], gate_score: float) -> str:
        max_degree = max(memberships.values())
        if max_degree <= 0:
            if gate_score >= 0.75:
                return "accept"
            if gate_score >= 0.55:
                return "verify"
            if gate_score >= 0.35:
                return "revise"
            if gate_score >= 0.15:
                return "escalate"
            return "refuse"
        priority = ["refuse", "escalate", "revise", "verify", "accept"]
        winners = [action for action, degree in memberships.items() if abs(degree - max_degree) < 1e-9]
        return min(winners, key=priority.index)


def generate_fuzzy_gate_artifacts(
    *,
    results_csv: str = "graph/model_results.csv",
    output_dir: str = "graph/fuzzy_gate",
) -> Dict[str, object]:
    source = Path(results_csv)
    if not source.exists():
        raise FileNotFoundError(f"Model results CSV not found: {source}")

    target_dir = ensure_dir(output_dir)
    model_rows = _read_model_results(source)
    fuzzy_rows = score_algorithm_rows(model_rows)
    action_rows = _action_score_rows(fuzzy_rows)
    distribution_rows = _distribution_rows(fuzzy_rows)

    write_csv(target_dir / "fuzzy_gate_results.csv", fuzzy_rows)
    write_csv(target_dir / "fuzzy_action_memberships.csv", action_rows)
    write_csv(target_dir / "fuzzy_action_distribution.csv", distribution_rows)
    write_json(
        target_dir / "fuzzy_gate_manifest.json",
        {
            "results_csv": str(source),
            "output_dir": str(target_dir),
            "algorithm_count": len(fuzzy_rows),
            "actions": list(ACTION_CENTROIDS.keys()),
            "method": "Mamdani fuzzy inference with centroid defuzzification",
        },
    )
    _plot_fuzzy_outputs(target_dir, fuzzy_rows, action_rows, distribution_rows)

    return {
        "output_dir": str(target_dir),
        "algorithm_count": len(fuzzy_rows),
        "fuzzy_gate_results": str(target_dir / "fuzzy_gate_results.csv"),
        "fuzzy_action_memberships": str(target_dir / "fuzzy_action_memberships.csv"),
        "fuzzy_action_distribution": str(target_dir / "fuzzy_action_distribution.csv"),
    }


def score_algorithm_rows(rows: Sequence[Dict[str, str]]) -> List[Dict[str, object]]:
    max_loss = max(float(row["test_log_loss"]) for row in rows) or 1.0
    max_parameters = max(float(row["parameters"]) for row in rows) or 1.0
    gate = FuzzyDecisionGate()
    output_rows: List[Dict[str, object]] = []

    for row in rows:
        inputs = _inputs_from_row(row, max_loss=max_loss, max_parameters=max_parameters)
        decision = gate.evaluate(inputs)
        output_rows.append(
            {
                "rank": row.get("test_rank") or row.get("rank_index"),
                "algorithm": row["algorithm"],
                "test_accuracy": float(row["test_accuracy"]),
                "test_precision": float(row["test_precision"]),
                "test_recall": float(row["test_recall"]),
                "test_f1": float(row["test_f1"]),
                "test_auc": float(row["test_auc"]),
                "test_log_loss": float(row["test_log_loss"]),
                "parameters": int(float(row["parameters"])),
                "fuzzy_quality": inputs.quality,
                "fuzzy_safety": inputs.safety,
                "fuzzy_risk": inputs.risk,
                "fuzzy_uncertainty": inputs.uncertainty,
                "fuzzy_efficiency": inputs.efficiency,
                "accept_membership": decision.memberships["accept"],
                "verify_membership": decision.memberships["verify"],
                "revise_membership": decision.memberships["revise"],
                "escalate_membership": decision.memberships["escalate"],
                "refuse_membership": decision.memberships["refuse"],
                "fuzzy_gate_score": decision.gate_score,
                "decision_action": decision.action,
            }
        )

    output_rows.sort(key=lambda item: (-float(item["fuzzy_gate_score"]), str(item["algorithm"])))
    for rank, row in enumerate(output_rows, start=1):
        row["fuzzy_rank"] = rank
    return output_rows


def _inputs_from_row(row: Dict[str, str], *, max_loss: float, max_parameters: float) -> FuzzyInputs:
    accuracy = float(row["test_accuracy"])
    precision = float(row["test_precision"])
    recall = float(row["test_recall"])
    f1 = float(row["test_f1"])
    auc = float(row["test_auc"])
    loss = float(row["test_log_loss"])
    parameters = float(row["parameters"])

    quality = _clip(0.40 * accuracy + 0.30 * f1 + 0.30 * auc)
    safety = _clip(0.35 * precision + 0.35 * recall + 0.30 * auc)
    uncertainty = _clip(loss / max_loss)
    error_risk = _clip(1.0 - quality)
    loss_risk = uncertainty
    safety_risk = _clip(1.0 - safety)
    risk = _clip(0.45 * error_risk + 0.35 * loss_risk + 0.20 * safety_risk)
    efficiency = _clip(1.0 - parameters / max_parameters)
    return FuzzyInputs(
        quality=quality,
        safety=safety,
        risk=risk,
        uncertainty=uncertainty,
        efficiency=efficiency,
    )


def _read_model_results(path: Path) -> List[Dict[str, str]]:
    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        rows = list(reader)
    required = {
        "algorithm",
        "test_accuracy",
        "test_precision",
        "test_recall",
        "test_f1",
        "test_auc",
        "test_log_loss",
        "parameters",
    }
    missing = required - set(reader.fieldnames or [])
    if missing:
        raise ValueError(f"{path} is missing required column(s): {', '.join(sorted(missing))}")
    rows.sort(key=lambda row: int(row.get("test_rank") or row.get("rank_index") or 9999))
    return rows[:20]


def _action_score_rows(fuzzy_rows: Sequence[Dict[str, object]]) -> List[Dict[str, object]]:
    actions = ["accept", "verify", "revise", "escalate", "refuse"]
    rows: List[Dict[str, object]] = []
    for row in fuzzy_rows:
        for action in actions:
            rows.append(
                {
                    "algorithm": row["algorithm"],
                    "action": action,
                    "membership": row[f"{action}_membership"],
                    "fuzzy_gate_score": row["fuzzy_gate_score"],
                    "decision_action": row["decision_action"],
                }
            )
    return rows


def _distribution_rows(fuzzy_rows: Sequence[Dict[str, object]]) -> List[Dict[str, object]]:
    counts = Counter(str(row["decision_action"]) for row in fuzzy_rows)
    total = len(fuzzy_rows) or 1
    return [
        {
            "decision_action": action,
            "count": counts.get(action, 0),
            "proportion": counts.get(action, 0) / total,
        }
        for action in ["accept", "verify", "revise", "escalate", "refuse"]
    ]


def _plot_fuzzy_outputs(
    output_dir: Path,
    fuzzy_rows: Sequence[Dict[str, object]],
    action_rows: Sequence[Dict[str, object]],
    distribution_rows: Sequence[Dict[str, object]],
) -> None:
    labels = [str(row["algorithm"]) for row in fuzzy_rows]
    gate_scores = [float(row["fuzzy_gate_score"]) for row in fuzzy_rows]
    bar_chart(output_dir / "fuzzy_gate_score_by_algorithm.png", labels, gate_scores, "FUZZY GATE SCORE BY ALGORITHM")

    grouped_bar_chart(
        output_dir / "fuzzy_inputs_by_algorithm.png",
        labels,
        {
            "QUALITY": [float(row["fuzzy_quality"]) for row in fuzzy_rows],
            "SAFETY": [float(row["fuzzy_safety"]) for row in fuzzy_rows],
            "RISK": [float(row["fuzzy_risk"]) for row in fuzzy_rows],
            "UNCERT": [float(row["fuzzy_uncertainty"]) for row in fuzzy_rows],
            "EFF": [float(row["fuzzy_efficiency"]) for row in fuzzy_rows],
        },
        "FUZZY INPUTS BY ALGORITHM",
    )

    actions = ["accept", "verify", "revise", "escalate", "refuse"]
    matrix = [[float(row[f"{action}_membership"]) for action in actions] for row in fuzzy_rows]
    heatmap(
        output_dir / "fuzzy_action_membership_heatmap.png",
        labels,
        [action.upper()[:4] for action in actions],
        matrix,
        "FUZZY ACTION MEMBERSHIPS",
    )

    distribution_labels = [str(row["decision_action"]) for row in distribution_rows]
    distribution_values = [float(row["count"]) / max(1.0, float(len(fuzzy_rows))) for row in distribution_rows]
    bar_chart(
        output_dir / "fuzzy_action_distribution.png",
        distribution_labels,
        distribution_values,
        "FUZZY DECISION ACTION DISTRIBUTION",
    )


def _left_shoulder(value: float, a: float, b: float) -> float:
    if value <= a:
        return 1.0
    if value >= b:
        return 0.0
    return (b - value) / (b - a)


def _right_shoulder(value: float, a: float, b: float) -> float:
    if value <= a:
        return 0.0
    if value >= b:
        return 1.0
    return (value - a) / (b - a)


def _triangle(value: float, a: float, b: float, c: float) -> float:
    if value <= a or value >= c:
        return 0.0
    if value == b:
        return 1.0
    if value < b:
        return (value - a) / (b - a)
    return (c - value) / (c - b)


def _clip(value: float) -> float:
    if math.isnan(value):
        return 0.0
    return max(0.0, min(1.0, value))


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Apply fuzzy decision gating to 20 deep-learning algorithms.")
    parser.add_argument("--results-csv", default="graph/model_results.csv", help="Path to model_results.csv.")
    parser.add_argument("--output-dir", default="graph/fuzzy_gate", help="Directory for fuzzy-gate CSV and PNG outputs.")
    return parser


def main(argv: Optional[List[str]] = None) -> int:
    args = build_arg_parser().parse_args(argv)
    result = generate_fuzzy_gate_artifacts(results_csv=args.results_csv, output_dir=args.output_dir)
    print(f"Fuzzy decision gate evaluated {result['algorithm_count']} algorithms.")
    print(f"Output directory: {result['output_dir']}")
    print(f"Results CSV: {result['fuzzy_gate_results']}")
    return 0
