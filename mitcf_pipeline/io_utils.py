from __future__ import annotations

import csv
import json
import platform
import random
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Sequence

from .schemas import BenchmarkItem, ExperimentConfig, to_plain


def load_jsonl(path: str | Path) -> List[BenchmarkItem]:
    source = Path(path)
    if not source.exists():
        raise FileNotFoundError(f"Benchmark file not found: {source}")

    items: List[BenchmarkItem] = []
    seen_ids = set()
    with source.open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            stripped = line.strip()
            if not stripped:
                continue
            try:
                row = json.loads(stripped)
                item = BenchmarkItem.from_mapping(row)
            except Exception as exc:
                raise ValueError(f"Invalid JSONL item at {source}:{line_number}: {exc}") from exc
            if item.id in seen_ids:
                raise ValueError(f"Duplicate item id found in {source}: {item.id}")
            seen_ids.add(item.id)
            items.append(item)
    if not items:
        raise ValueError(f"No benchmark items found in {source}")
    return items


def write_json(path: str | Path, payload: Any) -> None:
    target = Path(path)
    ensure_dir(target.parent)
    with target.open("w", encoding="utf-8") as handle:
        json.dump(to_plain(payload), handle, indent=2, ensure_ascii=True, sort_keys=True)
        handle.write("\n")


def write_jsonl(path: str | Path, rows: Iterable[Any]) -> None:
    target = Path(path)
    ensure_dir(target.parent)
    with target.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(to_plain(row), ensure_ascii=True, sort_keys=True))
            handle.write("\n")


def write_csv(path: str | Path, rows: Sequence[Dict[str, Any]]) -> None:
    target = Path(path)
    ensure_dir(target.parent)
    if not rows:
        target.write_text("", encoding="utf-8")
        return

    fieldnames: List[str] = []
    for row in rows:
        for key in row:
            if key not in fieldnames:
                fieldnames.append(key)

    with target.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow({key: _csv_value(row.get(key, "")) for key in fieldnames})


def ensure_dir(path: str | Path) -> Path:
    target = Path(path)
    target.mkdir(parents=True, exist_ok=True)
    return target


def default_output_dir(base: str | Path = "outputs") -> Path:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return Path(base) / f"mitcf_run_{stamp}"


def environment_manifest(config: ExperimentConfig, item_count: int) -> Dict[str, Any]:
    return {
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "python": sys.version,
        "platform": platform.platform(),
        "processor": platform.processor(),
        "machine": platform.machine(),
        "item_count": item_count,
        "config": to_plain(config),
    }


def stratified_split(
    items: Sequence[BenchmarkItem],
    seed: int,
    train_ratio: float = 0.70,
    validation_ratio: float = 0.15,
) -> Dict[str, List[BenchmarkItem]]:
    """Create deterministic train/validation/test splits when official splits are absent."""
    rng = random.Random(seed)
    buckets: Dict[str, List[BenchmarkItem]] = {}
    for item in items:
        split = str(item.metadata.get("split", "")).lower()
        if split in {"train", "validation", "val", "test"}:
            key = "validation" if split == "val" else split
            buckets.setdefault(key, []).append(item)

    if buckets:
        return {
            "train": buckets.get("train", []),
            "validation": buckets.get("validation", []),
            "test": buckets.get("test", []),
        }

    by_label: Dict[str, List[BenchmarkItem]] = {}
    for item in items:
        key = f"{item.task_type}:{item.label}"
        by_label.setdefault(key, []).append(item)

    splits = {"train": [], "validation": [], "test": []}
    for bucket in by_label.values():
        shuffled = list(bucket)
        rng.shuffle(shuffled)
        n = len(shuffled)
        train_end = int(n * train_ratio)
        validation_end = train_end + int(n * validation_ratio)
        if n >= 3 and train_end == 0:
            train_end = 1
        if n >= 4 and validation_end == train_end:
            validation_end += 1
        splits["train"].extend(shuffled[:train_end])
        splits["validation"].extend(shuffled[train_end:validation_end])
        splits["test"].extend(shuffled[validation_end:])
    return splits


def _csv_value(value: Any) -> Any:
    if isinstance(value, (dict, list)):
        return json.dumps(to_plain(value), ensure_ascii=True, sort_keys=True)
    return value
