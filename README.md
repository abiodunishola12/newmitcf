# MITCF Research Methodology Pipeline

This project implements the methodology in `chapter4v1 (1).tex` as a runnable Python pipeline.

Use the project virtualenv because `python` on this machine points to Python 2.7:

```powershell
.\.venv\Scripts\python.exe main.py --input data/sample_benchmark.jsonl --split test --calibrate-detector
```

The run writes a timestamped `outputs/mitcf_run_*` directory unless `--output-dir` is supplied. The generated artifacts are:

- `manifest.json`: environment, model, prompt, condition, and detector-calibration metadata.
- `records.jsonl`: item-level candidate output, MITCF trace, final output, and metrics.
- `metrics_by_condition.csv`: baseline, ablation, and full-MITCF aggregate metrics.
- `metrics_by_dataset.csv`: aggregate metrics grouped by benchmark and condition.
- `statistical_tests.csv`: paired baseline versus full-MITCF comparisons with CIs and Holm-adjusted p-values.
- `qualitative_errors.jsonl`: examples for manual error analysis.
- `report.md`: readable summary of the run.

## Input Schema

Benchmark files are JSONL. Each row uses the common methodology schema:

```json
{
  "id": "unique_item_id",
  "dataset": "TruthfulQA",
  "task_type": "hallucination",
  "prompt": "Question or task prompt",
  "context": "Optional evidence passage",
  "choices": ["A. First choice", "B. Second choice"],
  "label": "B",
  "metadata": {
    "split": "test",
    "baseline_answer": "Optional offline candidate response",
    "safe_answer": "Optional deterministic revision target",
    "unsupported_terms": ["known wrong term"],
    "biased_terms": ["known biased phrase"],
    "unsafe": false
  }
}
```

To evaluate real LLM outputs generated elsewhere, pass a precomputed response JSONL:

```powershell
.\.venv\Scripts\python.exe main.py --input data/your_benchmark.jsonl --precomputed-responses data/model_outputs.jsonl
```

Each precomputed response row should contain `item_id` and either `response` or `text`. An optional `purpose` field can distinguish `candidate` and `revision` responses.

## Train 20 Neural Model Variants

Run the dependency-free training job and write CSV/PNG outputs to `graph/`:

```powershell
.\.venv\Scripts\python.exe train_deep_models.py --input data/sample_benchmark.jsonl --graph-dir graph --seed 42
```

The training command writes `model_results.csv`, `training_history.csv`, `confusion_matrix.csv`, `dataset_summary.csv`, `test_predictions.csv`, `training_manifest.json`, and PNG charts for accuracy, metric comparison, metric heatmap, validation accuracy curves, and validation loss curves.

Create one 3D-style accuracy PNG per trained model:

```powershell
.\.venv\Scripts\python.exe plot_accuracy_3d.py --results-csv graph\model_results.csv --output-dir graph\accuracy_3d
```

Apply fuzzy logic to the decision gate across the 20 trained algorithms:

```powershell
.\.venv\Scripts\python.exe run_fuzzy_gate.py --results-csv graph\model_results.csv --output-dir graph\fuzzy_gate
```

The fuzzy gate uses test accuracy, precision, recall, F1, AUC, log loss, and parameter count to compute fuzzy quality, safety, risk, uncertainty, and efficiency inputs. It writes fuzzy gate scores, action memberships, action distributions, and PNG plots.
