from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List, Sequence


def write_markdown_report(
    output_dir: str | Path,
    *,
    manifest: Dict[str, Any],
    condition_metrics: Sequence[Dict[str, Any]],
    dataset_metrics: Sequence[Dict[str, Any]],
    statistical_tests: Sequence[Dict[str, Any]],
) -> Path:
    target = Path(output_dir) / "report.md"
    lines: List[str] = [
        "# MITCF Research Methodology Run",
        "",
        "## Environment",
        "",
        f"- Created: `{manifest.get('created_at_utc')}`",
        f"- Python: `{str(manifest.get('python', '')).splitlines()[0]}`",
        f"- Platform: `{manifest.get('platform')}`",
        f"- Items: `{manifest.get('item_count')}`",
        "",
        "## Metrics By Condition",
        "",
    ]
    lines.extend(_markdown_table(condition_metrics, _condition_columns()))
    lines.extend(["", "## Metrics By Dataset And Condition", ""])
    lines.extend(_markdown_table(dataset_metrics, _dataset_columns()))
    lines.extend(["", "## Paired Statistical Tests", ""])
    lines.extend(_markdown_table(statistical_tests, _stats_columns()))
    lines.extend(
        [
            "",
            "## Artifact Map",
            "",
            "- `manifest.json`: reproducibility metadata and experiment configuration.",
            "- `records.jsonl`: item-level candidate output, MITCF trace, final output, and metrics.",
            "- `metrics_by_condition.csv`: aggregate metrics for each experimental condition.",
            "- `metrics_by_dataset.csv`: aggregate metrics grouped by dataset and condition.",
            "- `statistical_tests.csv`: paired baseline versus full-MITCF comparisons.",
            "- `qualitative_errors.jsonl`: stratified examples for manual error analysis.",
            "",
        ]
    )
    target.write_text("\n".join(lines), encoding="utf-8")
    return target


def _markdown_table(rows: Sequence[Dict[str, Any]], columns: Sequence[str]) -> List[str]:
    if not rows:
        return ["No rows."]
    lines = [
        "| " + " | ".join(columns) + " |",
        "| " + " | ".join("---" for _ in columns) + " |",
    ]
    for row in rows:
        lines.append("| " + " | ".join(_format(row.get(column, "")) for column in columns) + " |")
    return lines


def _condition_columns() -> List[str]:
    return [
        "condition",
        "n",
        "accuracy",
        "hallucination_rate",
        "bias_rate",
        "attack_success_rate",
        "robustness_score",
        "decision_reliability",
        "trustworthiness_index",
        "avg_model_calls",
        "avg_latency_s",
    ]


def _dataset_columns() -> List[str]:
    return [
        "dataset",
        "condition",
        "n",
        "accuracy",
        "hallucination_rate",
        "bias_rate",
        "attack_success_rate",
        "trustworthiness_index",
    ]


def _stats_columns() -> List[str]:
    return [
        "metric",
        "n_pairs",
        "baseline_mean",
        "target_mean",
        "mean_difference_target_minus_baseline",
        "ci95_low",
        "ci95_high",
        "p_value",
        "holm_adjusted_p_value",
        "effect_odds_ratio_improved_to_worsened",
    ]


def _format(value: Any) -> str:
    if isinstance(value, float):
        return f"{value:.4f}"
    return str(value)
