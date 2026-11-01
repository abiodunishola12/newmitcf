"""
Paired statistical analysis for visual-perception experiments.

Extends the original MITCF statistics module (mitcf_pipeline/statistics.py)
with visual-perception-specific paired comparisons.

All four experimental conditions evaluate the same image-question pairs,
enabling paired tests with higher statistical power than unpaired comparisons.

Implements:
  - Paired bootstrap confidence intervals (percentile method)
  - McNemar's test with continuity correction (binary correctness)
  - Holm-Bonferroni multiple-comparison correction
  - Cohen's h effect size for paired proportions
"""

from __future__ import annotations

import math
import random
from collections import defaultdict
from statistics import mean, pstdev
from typing import Any, Dict, List, Sequence, Tuple

from ..adapters.mitcf_visual_adapter import VisualRunRecord
from ..datasets.base import VisualBenchmarkItem
from ..metrics.visual_metrics import score_visual_record


METRIC_DIRECTIONS = {
    "correct": True,
    "hallucinated": False,
    "abstained": None,
    "incorrect_corrected": True,
    "correct_degraded": False,
}


def paired_visual_tests(
    items: List[VisualBenchmarkItem],
    records: List[VisualRunRecord],
    *,
    baseline_condition: str = "baseline",
    target_condition: str = "full_mitcf",
    seed: int = 42,
    bootstrap_samples: int = 2000,
    significance_level: float = 0.05,
) -> List[Dict[str, Any]]:
    """
    Compute paired statistical comparisons between baseline and target condition.

    Returns a list of per-metric comparison rows, sorted by metric name.
    """
    by_id = {item.item_id: item for item in items}

    by_item_condition: Dict[str, Dict[str, VisualRunRecord]] = defaultdict(dict)
    for record in records:
        by_item_condition[record.item_id][record.condition] = record

    rows: List[Dict[str, Any]] = []
    for metric, higher_is_better in METRIC_DIRECTIONS.items():
        pairs: List[Tuple[float, float]] = []

        for item_id, condition_records in by_item_condition.items():
            if baseline_condition not in condition_records or target_condition not in condition_records:
                continue
            item = by_id.get(item_id)
            if item is None:
                continue

            base_score = score_visual_record(item, condition_records[baseline_condition])
            target_score = score_visual_record(item, condition_records[target_condition])

            base_val = base_score.get(metric)
            target_val = target_score.get(metric)
            if base_val is None or target_val is None:
                continue
            pairs.append((float(base_val), float(target_val)))

        if not pairs:
            continue

        base_vals = [b for b, _ in pairs]
        target_vals = [t for _, t in pairs]
        diffs = [t - b for b, t in pairs]

        ci_low, ci_high = bootstrap_ci(diffs, seed=seed, samples=bootstrap_samples)

        if higher_is_better is not None:
            improved, worsened = _count_improvements(pairs, higher_is_better)
        else:
            improved = sum(1 for b, t in pairs if t > b)
            worsened = sum(1 for b, t in pairs if t < b)

        chi2, p_value = mcnemar_test(improved, worsened)
        effect_h = cohen_h(mean(target_vals), mean(base_vals)) if pairs else 0.0

        rows.append({
            "metric": metric,
            "baseline_condition": baseline_condition,
            "target_condition": target_condition,
            "n_pairs": len(pairs),
            "baseline_mean": mean(base_vals),
            "target_mean": mean(target_vals),
            "mean_diff_target_minus_baseline": mean(diffs),
            "std_diff": pstdev(diffs) if len(diffs) > 1 else 0.0,
            "ci95_low": ci_low,
            "ci95_high": ci_high,
            "mcnemar_chi2": chi2,
            "p_value": p_value,
            "improved_pairs": improved,
            "worsened_pairs": worsened,
            "odds_ratio": (improved + 0.5) / (worsened + 0.5),
            "cohen_h": effect_h,
            "higher_is_better": higher_is_better,
        })

    _apply_holm_correction(rows, significance_level)
    rows.sort(key=lambda r: r["metric"])
    return rows


def bootstrap_ci(
    values: Sequence[float],
    *,
    seed: int,
    samples: int = 2000,
    alpha: float = 0.05,
) -> Tuple[float, float]:
    if not values:
        return 0.0, 0.0
    if len(values) == 1:
        return float(values[0]), float(values[0])

    rng = random.Random(seed)
    n = len(values)
    boot_means = []
    for _ in range(samples):
        draw = [values[rng.randrange(n)] for _ in range(n)]
        boot_means.append(mean(draw))
    boot_means.sort()

    low_idx = max(0, int((alpha / 2) * samples))
    high_idx = min(samples - 1, int((1 - alpha / 2) * samples))
    return boot_means[low_idx], boot_means[high_idx]


def mcnemar_test(improved: int, worsened: int) -> Tuple[float, float]:
    """McNemar's test with continuity correction for binary paired comparisons."""
    discordant = improved + worsened
    if discordant == 0:
        return 0.0, 1.0
    corrected = (abs(improved - worsened) - 1) ** 2 / discordant
    p = math.erfc(math.sqrt(corrected / 2))
    return corrected, p


def cohen_h(p1: float, p2: float) -> float:
    """Cohen's h effect size for comparing two proportions."""
    p1 = max(0.0, min(1.0, p1))
    p2 = max(0.0, min(1.0, p2))
    return 2 * math.asin(math.sqrt(p1)) - 2 * math.asin(math.sqrt(p2))


def _count_improvements(
    pairs: Sequence[Tuple[float, float]], higher_is_better: bool
) -> Tuple[int, int]:
    improved = worsened = 0
    for base, target in pairs:
        if higher_is_better:
            improved += int(target > base)
            worsened += int(target < base)
        else:
            improved += int(target < base)
            worsened += int(target > base)
    return improved, worsened


def _apply_holm_correction(rows: List[Dict[str, Any]], alpha: float = 0.05) -> None:
    ordered = sorted(enumerate(rows), key=lambda x: x[1]["p_value"])
    total = len(ordered)
    running_max = 0.0
    adjusted: Dict[int, float] = {}
    for rank, (original_idx, row) in enumerate(ordered):
        adj = min(1.0, (total - rank) * row["p_value"])
        running_max = max(running_max, adj)
        adjusted[original_idx] = running_max
    for idx, row in enumerate(rows):
        row["holm_p"] = adjusted.get(idx, row["p_value"])
        row["significant"] = adjusted.get(idx, row["p_value"]) < alpha
