"""
Visual-perception evaluation metrics.

Ground-truth answers are accessed ONLY in this module.
All inference, verification, and gating are completed before scoring.
Label leakage prevention: the ground-truth column is withheld from
all DataFrames processed upstream; this module is the exclusive point
where predictions are compared to labels.
"""

from __future__ import annotations

from collections import defaultdict
from statistics import mean
from typing import Any, Dict, List, Sequence, Tuple

from ..adapters.mitcf_visual_adapter import VisualRunRecord
from ..datasets.base import VisualBenchmarkItem


VALID_BINARY = {"yes", "no"}


def score_visual_record(
    item: VisualBenchmarkItem,
    record: VisualRunRecord,
) -> Dict[str, Any]:
    """
    Score one VisualRunRecord against its ground-truth item.
    Ground truth is accessed here and ONLY here.
    """
    gt = item.normalised_ground_truth

    is_correct_initial = _is_correct(record.initial_answer, gt)
    is_correct_final = _is_correct(record.normalised_final, gt)
    is_hallucinated = _is_hallucinated(record.normalised_final, gt)
    is_abstained = record.abstained
    revision_changed = record.initial_answer.strip().lower() != record.normalised_final

    incorrect_corrected = (not is_correct_initial) and is_correct_final and not is_abstained
    correct_degraded = is_correct_initial and not is_correct_final and not is_abstained
    unnecessary_intervention = is_correct_initial and revision_changed and not is_abstained and is_correct_final

    return {
        "correct": int(is_correct_final and not is_abstained),
        "correct_initial": int(is_correct_initial),
        "correct_final": int(is_correct_final),
        "hallucinated": int(is_hallucinated and not is_abstained),
        "abstained": int(is_abstained),
        "abstained_correctly": int(is_abstained and not is_correct_initial),
        "abstained_incorrectly": int(is_abstained and is_correct_initial),
        "incorrect_corrected": int(incorrect_corrected),
        "correct_degraded": int(correct_degraded),
        "unnecessary_intervention": int(unnecessary_intervention),
        "revision_changed": int(revision_changed),
        "revisions": record.revisions,
        "latency_s": record.latency_s,
        "tokens_out": record.tokens_out,
        "tokens_in": record.tokens_in,
        "fuzzy_gate_score": record.fuzzy_gate_score or 0.0,
        "verification_score": record.verification_score,
        "verification_flagged": int(record.verification_flagged),
        "gate_action": record.gate_action,
    }


def aggregate_by_condition(
    items: List[VisualBenchmarkItem],
    records: List[VisualRunRecord],
    ti_weights: Dict[str, float],
) -> List[Dict[str, Any]]:
    by_id = {item.item_id: item for item in items}
    by_condition: Dict[str, List[Tuple[VisualBenchmarkItem, VisualRunRecord]]] = defaultdict(list)
    for record in records:
        item = by_id.get(record.item_id)
        if item:
            by_condition[record.condition].append((item, record))

    rows = []
    for condition, pairs in sorted(by_condition.items()):
        scored = [score_visual_record(item, rec) for item, rec in pairs]
        row = _aggregate_scored(condition, scored, pairs)
        from .trustworthiness import visual_trustworthiness_scores
        row.update(visual_trustworthiness_scores(row, ti_weights))
        rows.append(row)
    return rows


def aggregate_by_benchmark(
    items: List[VisualBenchmarkItem],
    records: List[VisualRunRecord],
    ti_weights: Dict[str, float],
) -> List[Dict[str, Any]]:
    by_id = {item.item_id: item for item in items}
    grouped: Dict[Tuple[str, str], List] = defaultdict(list)
    for record in records:
        item = by_id.get(record.item_id)
        if item:
            grouped[(item.benchmark, record.condition)].append((item, record))

    rows = []
    for (benchmark, condition), pairs in sorted(grouped.items()):
        scored = [score_visual_record(item, rec) for item, rec in pairs]
        row = _aggregate_scored(condition, scored, pairs)
        row["benchmark"] = benchmark
        from .trustworthiness import visual_trustworthiness_scores
        row.update(visual_trustworthiness_scores(row, ti_weights))
        rows.append(row)
    return rows


def aggregate_by_category(
    items: List[VisualBenchmarkItem],
    records: List[VisualRunRecord],
    ti_weights: Dict[str, float],
) -> List[Dict[str, Any]]:
    by_id = {item.item_id: item for item in items}
    grouped: Dict[Tuple[str, str, str], List] = defaultdict(list)
    for record in records:
        item = by_id.get(record.item_id)
        if item:
            grouped[(item.benchmark, item.category, record.condition)].append((item, record))

    rows = []
    for (benchmark, category, condition), pairs in sorted(grouped.items()):
        scored = [score_visual_record(item, rec) for item, rec in pairs]
        row = _aggregate_scored(condition, scored, pairs)
        row["benchmark"] = benchmark
        row["category"] = category
        from .trustworthiness import visual_trustworthiness_scores
        row.update(visual_trustworthiness_scores(row, ti_weights))
        rows.append(row)
    return rows


def selective_metrics(
    items: List[VisualBenchmarkItem],
    records: List[VisualRunRecord],
    n_points: int = 20,
) -> Dict[str, Any]:
    """
    Compute selective prediction metrics: risk-coverage tradeoffs.
    Returns per-condition risk-coverage curve data.
    """
    by_id = {item.item_id: item for item in items}
    by_condition: Dict[str, List[Tuple[VisualBenchmarkItem, VisualRunRecord]]] = defaultdict(list)
    for record in records:
        item = by_id.get(record.item_id)
        if item:
            by_condition[record.condition].append((item, record))

    results: Dict[str, Any] = {}
    for condition, pairs in by_condition.items():
        scored = [score_visual_record(item, rec) for item, rec in pairs]
        results[condition] = {
            "risk_coverage": risk_coverage_curve(scored, n_points),
            "aurc": _aurc(scored),
        }
    return results


def risk_coverage_curve(
    scored: List[Dict[str, Any]],
    n_points: int = 20,
) -> List[Dict[str, float]]:
    """
    Risk-coverage curve: rank by confidence proxy (fuzzy_gate_score descending),
    compute selective risk (1-accuracy) and coverage at each threshold.
    """
    if not scored:
        return []

    sorted_scored = sorted(scored, key=lambda r: r.get("fuzzy_gate_score", 0.5), reverse=True)
    points = []
    for i in range(1, n_points + 1):
        cutoff = int(len(sorted_scored) * i / n_points)
        if cutoff == 0:
            continue
        subset = sorted_scored[:cutoff]
        coverage = cutoff / len(sorted_scored)
        errors = sum(1 for r in subset if not r.get("correct") and not r.get("abstained"))
        risk = errors / cutoff
        points.append({"coverage": coverage, "selective_risk": risk})
    return points


def _aurc(scored: List[Dict[str, Any]]) -> float:
    """Area under the risk-coverage curve via trapezoidal integration."""
    curve = risk_coverage_curve(scored, n_points=100)
    if len(curve) < 2:
        return 0.0
    total = 0.0
    for i in range(1, len(curve)):
        dx = curve[i]["coverage"] - curve[i - 1]["coverage"]
        avg_y = (curve[i]["selective_risk"] + curve[i - 1]["selective_risk"]) / 2
        total += dx * avg_y
    return total


def _aggregate_scored(
    condition: str,
    scored: List[Dict[str, Any]],
    pairs: List,
) -> Dict[str, Any]:
    if not scored:
        return {"condition": condition, "n": 0}
    n = len(scored)
    n_answered = n - sum(r["abstained"] for r in scored)
    coverage = n_answered / n if n else 0.0

    return {
        "condition": condition,
        "n": n,
        "accuracy": _rate(scored, "correct"),
        "selective_accuracy": (
            sum(r["correct"] for r in scored) / n_answered if n_answered > 0 else 0.0
        ),
        "coverage": coverage,
        "abstention_rate": _rate(scored, "abstained"),
        "hallucination_rate": _rate(scored, "hallucinated"),
        "incorrect_corrected_rate": _rate(scored, "incorrect_corrected"),
        "correct_degraded_rate": _rate(scored, "correct_degraded"),
        "unnecessary_intervention_rate": _rate(scored, "unnecessary_intervention"),
        "revision_rate": _rate(scored, "revision_changed"),
        "avg_revisions": _mean(scored, "revisions"),
        "avg_latency_s": _mean(scored, "latency_s"),
        "avg_tokens_out": _mean(scored, "tokens_out"),
        "aurc": _aurc(scored),
    }


def _rate(scored: List[Dict], key: str) -> float:
    if not scored:
        return 0.0
    return sum(float(r.get(key, 0)) for r in scored) / len(scored)


def _mean(scored: List[Dict], key: str) -> float:
    values = [float(r.get(key, 0.0)) for r in scored]
    return mean(values) if values else 0.0


def _is_correct(predicted: str, ground_truth: str) -> bool:
    pred = str(predicted or "").strip().lower()
    gt = str(ground_truth or "").strip().lower()
    return pred == gt


def _is_hallucinated(predicted: str, ground_truth: str) -> bool:
    pred = str(predicted or "").strip().lower()
    gt = str(ground_truth or "").strip().lower()
    if pred not in VALID_BINARY or gt not in VALID_BINARY:
        return False
    return pred != gt
