from __future__ import annotations

import math
import random
from statistics import mean, pstdev
from typing import Any, Dict, List, Sequence

from .schemas import RunRecord


METRIC_DIRECTIONS = {
    "correct": True,
    "hallucinated": False,
    "biased": False,
    "attack_success": False,
    "refused_or_escalated": False,
}


def paired_metric_tests(
    records: Sequence[RunRecord],
    *,
    baseline_condition: str = "baseline",
    target_condition: str = "full_mitcf",
    seed: int = 42,
    bootstrap_samples: int = 1000,
) -> List[Dict[str, Any]]:
    by_item: Dict[str, Dict[str, RunRecord]] = {}
    for record in records:
        by_item.setdefault(record.item_id, {})[record.condition] = record

    rows: List[Dict[str, Any]] = []
    for metric, higher_is_better in METRIC_DIRECTIONS.items():
        pairs = []
        for item_records in by_item.values():
            if baseline_condition not in item_records or target_condition not in item_records:
                continue
            baseline = item_records[baseline_condition].metrics.get(metric)
            target = item_records[target_condition].metrics.get(metric)
            if baseline is None or target is None:
                continue
            pairs.append((float(baseline), float(target)))

        if not pairs:
            continue

        baseline_values = [base for base, _ in pairs]
        target_values = [target for _, target in pairs]
        diffs = [target - base for base, target in pairs]
        ci_low, ci_high = bootstrap_ci(diffs, seed=seed, samples=bootstrap_samples)
        improved, worsened = _discordant_counts(pairs, higher_is_better)
        chi2, p_value = mcnemar_approx(improved, worsened)
        rows.append(
            {
                "metric": metric,
                "baseline_condition": baseline_condition,
                "target_condition": target_condition,
                "n_pairs": len(pairs),
                "baseline_mean": mean(baseline_values),
                "target_mean": mean(target_values),
                "mean_difference_target_minus_baseline": mean(diffs),
                "std_difference": pstdev(diffs) if len(diffs) > 1 else 0.0,
                "ci95_low": ci_low,
                "ci95_high": ci_high,
                "mcnemar_chi2": chi2,
                "p_value": p_value,
                "improved_pairs": improved,
                "worsened_pairs": worsened,
                "effect_odds_ratio_improved_to_worsened": (improved + 0.5) / (worsened + 0.5),
                "higher_is_better": higher_is_better,
            }
        )

    _apply_holm_correction(rows)
    return rows


def bootstrap_ci(values: Sequence[float], *, seed: int, samples: int = 1000, alpha: float = 0.05) -> tuple[float, float]:
    if not values:
        return 0.0, 0.0
    if len(values) == 1:
        return values[0], values[0]

    rng = random.Random(seed)
    boot_means = []
    n = len(values)
    for _ in range(samples):
        draw = [values[rng.randrange(n)] for _ in range(n)]
        boot_means.append(mean(draw))
    boot_means.sort()
    low_index = max(0, int((alpha / 2) * samples))
    high_index = min(samples - 1, int((1 - alpha / 2) * samples))
    return boot_means[low_index], boot_means[high_index]


def mcnemar_approx(improved: int, worsened: int) -> tuple[float, float]:
    discordant = improved + worsened
    if discordant == 0:
        return 0.0, 1.0
    chi2 = (abs(improved - worsened) - 1) ** 2 / discordant
    p_value = math.erfc(math.sqrt(chi2 / 2))
    return chi2, p_value


def _discordant_counts(pairs: Sequence[tuple[float, float]], higher_is_better: bool) -> tuple[int, int]:
    improved = 0
    worsened = 0
    for baseline, target in pairs:
        if target == baseline:
            continue
        if higher_is_better:
            improved += int(target > baseline)
            worsened += int(target < baseline)
        else:
            improved += int(target < baseline)
            worsened += int(target > baseline)
    return improved, worsened


def _apply_holm_correction(rows: List[Dict[str, Any]]) -> None:
    ordered = sorted(enumerate(rows), key=lambda item: item[1]["p_value"])
    adjusted_by_index: Dict[int, float] = {}
    running_max = 0.0
    total = len(ordered)
    for rank, (original_index, row) in enumerate(ordered):
        adjusted = min(1.0, (total - rank) * row["p_value"])
        running_max = max(running_max, adjusted)
        adjusted_by_index[original_index] = running_max
    for index, row in enumerate(rows):
        row["holm_adjusted_p_value"] = adjusted_by_index.get(index, row["p_value"])
