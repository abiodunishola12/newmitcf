"""Base classes for visual benchmark datasets."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional


class BenchmarkSplit(str, Enum):
    ALL = "all"
    TRAIN = "train"
    VAL = "val"
    TEST = "test"


@dataclass
class VisualBenchmarkItem:
    """One image-question pair from a visual benchmark."""

    item_id: str
    benchmark: str
    category: str
    image_path: str
    question: str
    ground_truth: str
    answer_type: str = "binary"
    choices: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)

    def image_exists(self) -> bool:
        return Path(self.image_path).exists()

    @property
    def normalised_ground_truth(self) -> str:
        return _normalise_answer(self.ground_truth, self.answer_type)


def _normalise_answer(text: str, answer_type: str) -> str:
    """Canonical normalisation for benchmark answers."""
    cleaned = str(text or "").strip().lower()
    if answer_type == "binary":
        if cleaned in {"yes", "1", "true"}:
            return "yes"
        if cleaned in {"no", "0", "false"}:
            return "no"
    return cleaned


def verify_dataset_integrity(items: List[VisualBenchmarkItem]) -> Dict[str, Any]:
    """Check all images exist and return a summary with any missing files."""
    total = len(items)
    missing: List[str] = []
    present = 0
    for item in items:
        if item.image_exists():
            present += 1
        else:
            missing.append(item.image_path)
    return {
        "total_items": total,
        "images_present": present,
        "images_missing": len(missing),
        "missing_paths": missing[:20],
        "integrity_ok": len(missing) == 0,
    }
