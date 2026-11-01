"""
POPE (Polling-based Object Probing Evaluation) benchmark adapter.

POPE measures object hallucination in VLMs.
Official repository: https://github.com/AoiDragon/POPE
Dataset: POPE annotations + MSCOCO 2014 validation images.

Download instructions:
  Annotations: https://github.com/AoiDragon/POPE/tree/main/output/coco
  Images: http://images.cocodataset.org/zips/val2014.zip
  Place annotations under <pope_dir>/annotations/
  Place images under <pope_dir>/val2014/
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

from .base import VisualBenchmarkItem, verify_dataset_integrity

logger = logging.getLogger(__name__)

POPE_CATEGORIES = ("random", "popular", "adversarial")

EXPECTED_ANNOTATION_FILES = {
    "random": "coco_pope_random.json",
    "popular": "coco_pope_popular.json",
    "adversarial": "coco_pope_adversarial.json",
}


class POPEAdapter:
    """Loads POPE image-question pairs from a local directory."""

    def __init__(self, pope_dir: str, categories: Optional[List[str]] = None, max_samples: int = 500) -> None:
        self.pope_dir = Path(pope_dir)
        self.categories = categories or list(POPE_CATEGORIES)
        self.max_samples = max_samples

    def check_availability(self) -> Dict[str, Any]:
        """Report which POPE categories are available locally."""
        status: Dict[str, Any] = {
            "pope_dir": str(self.pope_dir),
            "exists": self.pope_dir.exists(),
            "categories": {},
            "images_dir": "",
            "available": False,
        }
        if not self.pope_dir.exists():
            status["message"] = (
                f"POPE directory not found: {self.pope_dir}\n"
                "To set up POPE:\n"
                "  1. Download POPE annotations from https://github.com/AoiDragon/POPE/tree/main/output/coco\n"
                "  2. Download MSCOCO val2014 images from http://images.cocodataset.org/zips/val2014.zip\n"
                f"  3. Place JSON files under {self.pope_dir}/annotations/\n"
                f"  4. Place images under {self.pope_dir}/val2014/"
            )
            return status

        ann_dir = self.pope_dir / "annotations"
        img_dir = self.pope_dir / "val2014"
        status["images_dir"] = str(img_dir)
        status["images_dir_exists"] = img_dir.exists()

        any_available = False
        for category in self.categories:
            ann_file = ann_dir / EXPECTED_ANNOTATION_FILES.get(category, f"coco_pope_{category}.json")
            available = ann_file.exists()
            status["categories"][category] = {
                "annotation_file": str(ann_file),
                "annotation_exists": available,
            }
            if available:
                any_available = True

        status["available"] = any_available and img_dir.exists()
        return status

    def load(self, categories: Optional[List[str]] = None) -> List[VisualBenchmarkItem]:
        """Load POPE items from local files. Raises FileNotFoundError if unavailable."""
        cats = categories or self.categories
        items: List[VisualBenchmarkItem] = []
        ann_dir = self.pope_dir / "annotations"
        img_dir = self.pope_dir / "val2014"

        for category in cats:
            ann_file = ann_dir / EXPECTED_ANNOTATION_FILES.get(category, f"coco_pope_{category}.json")
            if not ann_file.exists():
                raise FileNotFoundError(
                    f"POPE annotation file not found: {ann_file}\n"
                    "See data/pope/README.md for download instructions."
                )
            category_items = self._parse_annotation_file(ann_file, category, img_dir)
            items.extend(category_items[:self.max_samples])
            logger.info("POPE %s: loaded %d items", category, len(category_items))

        return items

    def _parse_annotation_file(
        self, ann_file: Path, category: str, img_dir: Path
    ) -> List[VisualBenchmarkItem]:
        items: List[VisualBenchmarkItem] = []
        with ann_file.open("r", encoding="utf-8") as handle:
            for line_num, line in enumerate(handle, start=1):
                line = line.strip()
                if not line:
                    continue
                try:
                    record = json.loads(line)
                except json.JSONDecodeError as exc:
                    logger.warning("POPE %s line %d: JSON error: %s", category, line_num, exc)
                    continue

                image_name = record.get("image")
                question = record.get("text", "")
                label = record.get("label", "")

                if not image_name or not question or not label:
                    logger.warning("POPE %s line %d: missing fields", category, line_num)
                    continue

                image_path = img_dir / image_name
                item_id = f"pope_{category}_{image_name}_{line_num}"

                items.append(VisualBenchmarkItem(
                    item_id=item_id,
                    benchmark="POPE",
                    category=category,
                    image_path=str(image_path),
                    question=question,
                    ground_truth=str(label).strip().lower(),
                    answer_type="binary",
                    choices=["yes", "no"],
                    metadata={
                        "source_file": str(ann_file.name),
                        "line_number": line_num,
                        "image_name": image_name,
                        "pope_category": category,
                    },
                ))
        return items

    def validate(self, items: Optional[List[VisualBenchmarkItem]] = None) -> Dict[str, Any]:
        if items is None:
            items = self.load()
        return verify_dataset_integrity(items)
