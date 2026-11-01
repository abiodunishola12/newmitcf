from __future__ import annotations

import argparse
import csv
import re
from pathlib import Path
from typing import Dict, List, Optional

from .io_utils import ensure_dir
from .png_charts import accuracy_bar_chart_3d


def generate_accuracy_3d_graphs(
    *,
    results_csv: str = "graph/model_results.csv",
    output_dir: str = "graph/accuracy_3d",
) -> Dict[str, object]:
    source = Path(results_csv)
    if not source.exists():
        raise FileNotFoundError(f"Model results CSV not found: {source}")

    target_dir = ensure_dir(output_dir)
    rows = _read_result_rows(source)
    if len(rows) < 20:
        raise ValueError(f"Expected at least 20 model rows in {source}, found {len(rows)}")

    generated: List[str] = []
    for index, row in enumerate(rows[:20], start=1):
        algorithm = row["algorithm"]
        filename = f"{index:02d}_{_slug(algorithm)}_accuracy_3d.png"
        output_path = target_dir / filename
        accuracy_bar_chart_3d(
            output_path,
            model_name=algorithm,
            train_accuracy=float(row["train_accuracy"]),
            validation_accuracy=float(row["validation_accuracy"]),
            test_accuracy=float(row["test_accuracy"]),
        )
        generated.append(str(output_path))

    return {
        "results_csv": str(source),
        "output_dir": str(target_dir),
        "png_count": len(generated),
        "files": generated,
    }


def _read_result_rows(path: Path) -> List[Dict[str, str]]:
    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        rows = list(reader)
    required = {"algorithm", "train_accuracy", "validation_accuracy", "test_accuracy"}
    missing = required - set(reader.fieldnames or [])
    if missing:
        raise ValueError(f"{path} is missing required column(s): {', '.join(sorted(missing))}")
    rows.sort(key=lambda row: int(row.get("test_rank") or row.get("rank_index") or 9999))
    return rows


def _slug(value: str) -> str:
    return re.sub(r"[^a-zA-Z0-9]+", "_", value).strip("_").lower()


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Create one 3D accuracy PNG per trained model.")
    parser.add_argument("--results-csv", default="graph/model_results.csv", help="Path to model_results.csv.")
    parser.add_argument("--output-dir", default="graph/accuracy_3d", help="Directory for 3D PNG files.")
    return parser


def main(argv: Optional[List[str]] = None) -> int:
    args = build_arg_parser().parse_args(argv)
    result = generate_accuracy_3d_graphs(results_csv=args.results_csv, output_dir=args.output_dir)
    print(f"Generated {result['png_count']} 3D accuracy PNG files.")
    print(f"Output directory: {result['output_dir']}")
    return 0
