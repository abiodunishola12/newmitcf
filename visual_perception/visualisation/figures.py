"""
Publication-quality scientific figures for the visual-perception evaluation.

All figures are generated only from actual experimental results.
Exports PNG, PDF, and SVG.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

CONDITION_LABELS = {
    "baseline": "Baseline VLM",
    "revision_only": "Revision Only",
    "fixed_gate": "Fixed Gate",
    "full_mitcf": "Full MITCF",
}

CONDITION_COLORS = {
    "baseline": "#4C72B0",
    "revision_only": "#55A868",
    "fixed_gate": "#C44E52",
    "full_mitcf": "#DD8452",
}


def generate_all_figures(
    run_dir: str | Path,
    condition_metrics: List[Dict[str, Any]],
    robustness_records: Optional[List[Dict[str, Any]]] = None,
    ablation_metrics: Optional[List[Dict[str, Any]]] = None,
    statistical_tests: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, str]:
    """Generate all publication figures. Returns dict of figure name → file path."""
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        logger.warning("matplotlib not available; cannot generate figures")
        return {}

    run_dir = Path(run_dir)
    fig_dir = run_dir / "figures"
    fig_dir.mkdir(exist_ok=True)

    generated: Dict[str, str] = {}

    try:
        path = _accuracy_comparison(fig_dir, condition_metrics, plt)
        if path:
            generated["accuracy_comparison"] = path
    except Exception as exc:
        logger.warning("accuracy_comparison failed: %s", exc)

    try:
        path = _hallucination_comparison(fig_dir, condition_metrics, plt)
        if path:
            generated["hallucination_comparison"] = path
    except Exception as exc:
        logger.warning("hallucination_comparison failed: %s", exc)

    try:
        path = _coverage_accuracy(fig_dir, condition_metrics, plt)
        if path:
            generated["coverage_accuracy"] = path
    except Exception as exc:
        logger.warning("coverage_accuracy failed: %s", exc)

    try:
        path = _latency_comparison(fig_dir, condition_metrics, plt)
        if path:
            generated["latency_comparison"] = path
    except Exception as exc:
        logger.warning("latency_comparison failed: %s", exc)

    try:
        path = _trustworthiness_radar(fig_dir, condition_metrics, plt)
        if path:
            generated["trustworthiness_radar"] = path
    except Exception as exc:
        logger.warning("trustworthiness_radar failed: %s", exc)

    if statistical_tests:
        try:
            path = _ci_plot(fig_dir, statistical_tests, plt)
            if path:
                generated["confidence_intervals"] = path
        except Exception as exc:
            logger.warning("ci_plot failed: %s", exc)

    if robustness_records:
        try:
            path = _robustness_degradation(fig_dir, robustness_records, plt)
            if path:
                generated["robustness_degradation"] = path
        except Exception as exc:
            logger.warning("robustness_degradation failed: %s", exc)

    if ablation_metrics:
        try:
            path = _ablation_comparison(fig_dir, ablation_metrics, plt)
            if path:
                generated["ablation_comparison"] = path
        except Exception as exc:
            logger.warning("ablation_comparison failed: %s", exc)

    return generated


def _save_figure(fig, fig_dir: Path, name: str, plt) -> str:
    """Save figure in PNG, PDF, and SVG formats."""
    for ext in ("png", "pdf", "svg"):
        fig.savefig(fig_dir / f"{name}.{ext}", bbox_inches="tight", dpi=200)
    plt.close(fig)
    return str(fig_dir / f"{name}.png")


def _accuracy_comparison(fig_dir: Path, metrics: List[Dict], plt) -> Optional[str]:
    conditions = [m["condition"] for m in metrics]
    accuracy = [m.get("accuracy", 0.0) for m in metrics]
    labels = [CONDITION_LABELS.get(c, c) for c in conditions]
    colors = [CONDITION_COLORS.get(c, "#999999") for c in conditions]

    fig, ax = plt.subplots(figsize=(8, 5))
    bars = ax.bar(labels, accuracy, color=colors, edgecolor="black", linewidth=0.8)
    ax.set_ylim(0, 1.05)
    ax.set_ylabel("Accuracy", fontsize=12)
    ax.set_title("Visual-Perception Accuracy by Condition", fontsize=13, fontweight="bold")
    ax.axhline(accuracy[0] if accuracy else 0, color="gray", linestyle="--", linewidth=0.8, alpha=0.6, label="Baseline")
    for bar, val in zip(bars, accuracy):
        ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 0.01, f"{val:.3f}",
                ha="center", va="bottom", fontsize=9)
    ax.legend(fontsize=9)
    fig.tight_layout()
    return _save_figure(fig, fig_dir, "accuracy_comparison", plt)


def _hallucination_comparison(fig_dir: Path, metrics: List[Dict], plt) -> Optional[str]:
    conditions = [m["condition"] for m in metrics]
    rates = [m.get("hallucination_rate", 0.0) for m in metrics]
    labels = [CONDITION_LABELS.get(c, c) for c in conditions]
    colors = [CONDITION_COLORS.get(c, "#999999") for c in conditions]

    fig, ax = plt.subplots(figsize=(8, 5))
    bars = ax.bar(labels, rates, color=colors, edgecolor="black", linewidth=0.8)
    ax.set_ylim(0, max(rates + [0.1]) * 1.2)
    ax.set_ylabel("Hallucination Rate", fontsize=12)
    ax.set_title("Visual Hallucination Rate by Condition", fontsize=13, fontweight="bold")
    for bar, val in zip(bars, rates):
        ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 0.002, f"{val:.3f}",
                ha="center", va="bottom", fontsize=9)
    fig.tight_layout()
    return _save_figure(fig, fig_dir, "hallucination_comparison", plt)


def _coverage_accuracy(fig_dir: Path, metrics: List[Dict], plt) -> Optional[str]:
    fig, ax = plt.subplots(figsize=(7, 6))
    for m in metrics:
        cond = m["condition"]
        coverage = m.get("coverage", 1.0)
        sel_acc = m.get("selective_accuracy", m.get("accuracy", 0.0))
        color = CONDITION_COLORS.get(cond, "#999999")
        label = CONDITION_LABELS.get(cond, cond)
        ax.scatter(coverage, sel_acc, color=color, s=120, zorder=5, label=label)
        ax.annotate(label, (coverage, sel_acc), textcoords="offset points", xytext=(6, 4), fontsize=8)
    ax.set_xlabel("Coverage", fontsize=12)
    ax.set_ylabel("Selective Accuracy", fontsize=12)
    ax.set_title("Coverage vs. Selective Accuracy", fontsize=13, fontweight="bold")
    ax.set_xlim(0, 1.05)
    ax.set_ylim(0, 1.05)
    ax.legend(fontsize=8)
    fig.tight_layout()
    return _save_figure(fig, fig_dir, "coverage_accuracy", plt)


def _latency_comparison(fig_dir: Path, metrics: List[Dict], plt) -> Optional[str]:
    conditions = [m["condition"] for m in metrics]
    latencies = [m.get("avg_latency_s", 0.0) for m in metrics]
    labels = [CONDITION_LABELS.get(c, c) for c in conditions]
    colors = [CONDITION_COLORS.get(c, "#999999") for c in conditions]

    fig, ax = plt.subplots(figsize=(8, 5))
    ax.barh(labels, latencies, color=colors, edgecolor="black", linewidth=0.8)
    ax.set_xlabel("Mean Latency (s)", fontsize=12)
    ax.set_title("Inference Latency by Condition", fontsize=13, fontweight="bold")
    for i, (val, label) in enumerate(zip(latencies, labels)):
        ax.text(val + 0.01, i, f"{val:.2f}s", va="center", fontsize=9)
    fig.tight_layout()
    return _save_figure(fig, fig_dir, "latency_comparison", plt)


def _trustworthiness_radar(fig_dir: Path, metrics: List[Dict], plt) -> Optional[str]:
    import numpy as np
    dims = ["ti_hallucination", "ti_robustness", "ti_decision", "accuracy"]
    dim_labels = ["Hallucination\nResistance", "Robustness", "Decision\nReliability", "Accuracy"]
    angles = np.linspace(0, 2 * np.pi, len(dims), endpoint=False).tolist()
    angles += angles[:1]

    fig, ax = plt.subplots(figsize=(7, 7), subplot_kw={"polar": True})
    for m in metrics:
        cond = m["condition"]
        values = [float(m.get(d, 0.0)) for d in dims]
        values += values[:1]
        color = CONDITION_COLORS.get(cond, "#999999")
        label = CONDITION_LABELS.get(cond, cond)
        ax.plot(angles, values, "o-", linewidth=1.5, color=color, label=label)
        ax.fill(angles, values, alpha=0.08, color=color)

    ax.set_xticks(angles[:-1])
    ax.set_xticklabels(dim_labels, fontsize=9)
    ax.set_ylim(0, 1)
    ax.set_title("Trustworthiness Profile by Condition", fontsize=12, fontweight="bold", pad=15)
    ax.legend(loc="upper right", bbox_to_anchor=(1.3, 1.1), fontsize=8)
    fig.tight_layout()
    return _save_figure(fig, fig_dir, "trustworthiness_radar", plt)


def _ci_plot(fig_dir: Path, tests: List[Dict], plt) -> Optional[str]:
    metrics = [t["metric"] for t in tests]
    means = [t.get("mean_diff_target_minus_baseline", 0.0) for t in tests]
    ci_lows = [t.get("ci95_low", 0.0) for t in tests]
    ci_highs = [t.get("ci95_high", 0.0) for t in tests]

    fig, ax = plt.subplots(figsize=(8, 5))
    y_pos = range(len(metrics))
    for i, (metric, mean, lo, hi) in enumerate(zip(metrics, means, ci_lows, ci_highs)):
        color = "#2ecc71" if mean > 0 else "#e74c3c"
        ax.barh(i, mean, color=color, alpha=0.7, height=0.4)
        ax.errorbar(mean, i, xerr=[[mean - lo], [hi - mean]], fmt="none", color="black", capsize=4)
    ax.set_yticks(list(y_pos))
    ax.set_yticklabels(metrics, fontsize=10)
    ax.axvline(0, color="black", linewidth=1.0)
    ax.set_xlabel("Mean Difference (MITCF − Baseline)", fontsize=11)
    ax.set_title("Paired Metric Differences with 95% Bootstrap CI", fontsize=12, fontweight="bold")
    fig.tight_layout()
    return _save_figure(fig, fig_dir, "confidence_intervals", plt)


def _robustness_degradation(fig_dir: Path, records: List[Dict], plt) -> Optional[str]:
    import numpy as np
    from collections import defaultdict

    by_type: Dict[str, Dict[str, List]] = defaultdict(lambda: defaultdict(list))
    for r in records:
        ptype = r.get("perturbation_type", "")
        sev = float(r.get("perturbation_severity", 0.0))
        correct = int(r.get("correct", 0))
        cond = r.get("condition", "")
        if ptype:
            by_type[ptype][cond].append((sev, correct))

    if not by_type:
        return None

    n_types = len(by_type)
    fig, axes = plt.subplots(1, n_types, figsize=(5 * n_types, 5), squeeze=False)
    for ax, (ptype, cond_data) in zip(axes[0], sorted(by_type.items())):
        for cond, pairs in cond_data.items():
            if not pairs:
                continue
            pairs.sort(key=lambda x: x[0])
            sevs = [p[0] for p in pairs]
            unique_sevs = sorted(set(sevs))
            acc_by_sev = {s: [] for s in unique_sevs}
            for s, c in pairs:
                acc_by_sev[s].append(c)
            sev_list = sorted(unique_sevs)
            acc_list = [np.mean(acc_by_sev[s]) for s in sev_list]
            color = CONDITION_COLORS.get(cond, "#999999")
            label = CONDITION_LABELS.get(cond, cond)
            ax.plot(sev_list, acc_list, "o-", color=color, label=label, linewidth=1.5)
        ax.set_xlabel("Severity", fontsize=10)
        ax.set_ylabel("Accuracy", fontsize=10)
        ax.set_title(ptype.replace("_", " ").title(), fontsize=10, fontweight="bold")
        ax.set_ylim(0, 1.05)
        ax.legend(fontsize=7)

    fig.suptitle("Robustness: Accuracy vs. Perturbation Severity", fontsize=12, fontweight="bold")
    fig.tight_layout()
    return _save_figure(fig, fig_dir, "robustness_degradation", plt)


def _ablation_comparison(fig_dir: Path, ablation_metrics: List[Dict], plt) -> Optional[str]:
    ablations = [m.get("condition", m.get("ablation", "?")) for m in ablation_metrics]
    accuracy = [m.get("accuracy", 0.0) for m in ablation_metrics]

    fig, ax = plt.subplots(figsize=(9, 5))
    colors = ["#DD8452" if "full_mitcf" in a else "#aaaaaa" for a in ablations]
    bars = ax.bar(ablations, accuracy, color=colors, edgecolor="black", linewidth=0.8)
    ax.set_ylim(0, 1.05)
    ax.set_ylabel("Accuracy", fontsize=12)
    ax.set_title("Ablation Study: Accuracy by Configuration", fontsize=13, fontweight="bold")
    plt.xticks(rotation=30, ha="right", fontsize=9)
    for bar, val in zip(bars, accuracy):
        ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 0.01, f"{val:.3f}",
                ha="center", va="bottom", fontsize=8)
    fig.tight_layout()
    return _save_figure(fig, fig_dir, "ablation_comparison", plt)
