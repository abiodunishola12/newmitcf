# MITCF Visual-Perception Evaluation

A scientifically rigorous visual-perception evaluation for the
**Modular Inference-Time Control Framework (MITCF)**, targeting the
Elsevier *Displays* Special Issue:
*"Perceptual AI Systems in the Era of Large Models."*

## Overview

This package evaluates **Qwen2.5-VL-3B-Instruct** on POPE and MME benchmarks
under four paired experimental conditions, integrating the original MITCF
Mamdani fuzzy inference engine and trustworthiness scoring modules.

## Quick Start

```bash
# From the project root (C:\Users\ABIODUN\PycharmProjects\newmitcf)

# 1. Inspect project and environment
python -m visual_perception.cli inspect

# 2. Set up datasets (see data/pope/README.md and data/mme/README.md)

# 3. Validate data
python -m visual_perception.cli validate-data

# 4. Smoke test (1 image, requires POPE + transformers)
python -m visual_perception.cli smoke-test

# 5. Full evaluation
python -m visual_perception.cli evaluate

# 6. Robustness evaluation
python -m visual_perception.cli robustness

# 7. Ablation studies
python -m visual_perception.cli ablation

# 8. Generate report from existing run
python -m visual_perception.cli report --run-dir results/visual_perception/<run_id>
```

## Experimental Conditions

| Condition | Description |
|-----------|-------------|
| **baseline** | Unmodified Qwen2.5-VL-3B-Instruct — no MITCF intervention |
| **revision_only** | MITCF verification + critique + revision, no fuzzy gate |
| **fixed_gate** | Fixed-threshold confidence gate (comparator) |
| **full_mitcf** | Full Mamdani fuzzy-gated MITCF pipeline |

## MITCF Integration

The original fuzzy inference engine (`mitcf_pipeline/fuzzy_gate.py`) is preserved
without modification. The `VisualMITCFAdapter` bridges VLM outputs to the
existing MITCF schemas, deriving fuzzy inputs from observable inference signals
(response format, confidence proxy, latency) without accessing ground-truth labels.

## Label Leakage Prevention

Ground-truth answers are stored in `VisualBenchmarkItem.ground_truth`.
They are accessed **only** in `visual_perception/metrics/visual_metrics.py`,
after all inference, revision, and gating is complete.
`VisualRunRecord` carries no `ground_truth` field.

## Hardware Requirements

- NVIDIA GPU with ≥ 4GB VRAM (RTX 3050 6GB confirmed)
- CUDA 12.8 + PyTorch 2.11.0+cu128
- Qwen2.5-VL-3B-Instruct in float16 requires ~5.5GB VRAM
- Use `load_in_4bit: true` in config for ~2GB VRAM footprint

## Running Tests

```bash
python -m pytest visual_perception/tests/ -v
```

38 tests, all passing.

## Output Structure

```
results/visual_perception/
  vp_<timestamp>_<suffix>/
    run_metadata.json
    configuration.yaml
    environment.json
    item_level_predictions.csv
    baseline_results.csv
    statistical_analysis.json
    experiment_report.md
    latex_tables.tex
    figures/
      accuracy_comparison.{png,pdf,svg}
      hallucination_comparison.{png,pdf,svg}
      coverage_accuracy.{png,pdf,svg}
      latency_comparison.{png,pdf,svg}
      trustworthiness_radar.{png,pdf,svg}
      confidence_intervals.{png,pdf,svg}
```
