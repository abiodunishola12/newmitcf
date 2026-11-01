"""
MME (Multimodal Model Evaluation) benchmark adapter.

MME evaluates VLMs across 14 perception and cognition subtasks.
Official: https://github.com/BradyFU/Awesome-Multimodal-Large-Language-Models/tree/Evaluation

Download instructions:
  Request download access: https://github.com/BradyFU/Awesome-Multimodal-Large-Language-Models/tree/Evaluation
  Place images and questions under <mme_dir>/<category>/
  Each category directory contains images and a questions_answers_YN.txt or *.txt file.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

from .base import VisualBenchmarkItem, verify_dataset_integrity

logger = logging.getLogger(__name__)

MME_PERCEPTION_CATEGORIES = (
    "existence", "count", "position", "color",
    "posters", "celebrity", "scene", "landmark", "artwork", "OCR"
)

MME_COGNITION_CATEGORIES = (
    "commonsense_reasoning", "numerical_calculation",
    "text_translation", "code_reasoning"
)

MME_ALL_CATEGORIES = MME_PERCEPTION_CATEGORIES + MME_COGNITION_CATEGORIES


class MMEAdapter:
    """Loads MME image-question pairs from a local directory."""

    def __init__(self, mme_dir: str, categories: Optional[List[str]] = None, max_samples: int = 500) -> None:
        self.mme_dir = Path(mme_dir)
        self.categories = categories or list(MME_PERCEPTION_CATEGORIES)
        self.max_samples = max_samples

    def check_availability(self) -> Dict[str, Any]:
        """Report which MME categories are available locally."""
        status: Dict[str, Any] = {
            "mme_dir": str(self.mme_dir),
            "exists": self.mme_dir.exists(),
            "categories": {},
            "available": False,
        }
        if not self.mme_dir.exists():
            status["message"] = (
                f"MME directory not found: {self.mme_dir}\n"
                "To set up MME:\n"
                "  1. Request access at https://github.com/BradyFU/Awesome-Multimodal-Large-Language-Models/tree/Evaluation\n"
                f"  2. Extract into {self.mme_dir}/ with one subdirectory per category\n"
                "  3. Each category directory should contain images + a .txt annotation file"
            )
            return status

        any_available = False
        for category in self.categories:
            cat_dir = self.mme_dir / category
            ann_file = self._find_annotation_file(cat_dir)
            available = cat_dir.exists() and ann_file is not None
            status["categories"][category] = {
                "directory": str(cat_dir),
                "directory_exists": cat_dir.exists(),
                "annotation_file": str(ann_file) if ann_file else None,
            }
            if available:
                any_available = True

        status["available"] = any_available
        return status

    def load(self, categories: Optional[List[str]] = None) -> List[VisualBenchmarkItem]:
        """Load MME items from local files."""
        cats = categories or self.categories
        items: List[VisualBenchmarkItem] = []

        for category in cats:
            cat_dir = self.mme_dir / category
            if not cat_dir.exists():
                raise FileNotFoundError(
                    f"MME category directory not found: {cat_dir}\n"
                    "See data/mme/README.md for download instructions."
                )
            ann_file = self._find_annotation_file(cat_dir)
            if ann_file is None:
                raise FileNotFoundError(
                    f"No annotation file found in MME category {category} at {cat_dir}"
                )
            category_items = self._parse_category(ann_file, category, cat_dir)
            items.extend(category_items[:self.max_samples])
            logger.info("MME %s: loaded %d items", category, len(category_items))

        return items

    def _find_annotation_file(self, cat_dir: Path) -> Optional[Path]:
        """Find the annotation .txt file in a category directory."""
        if not cat_dir.exists():
            return None
        candidates = [
            cat_dir / "questions_answers_YN.txt",
            cat_dir / f"{cat_dir.name}.txt",
        ]
        for candidate in candidates:
            if candidate.exists():
                return candidate
        txt_files = list(cat_dir.glob("*.txt"))
        return txt_files[0] if txt_files else None

    def _parse_category(self, ann_file: Path, category: str, cat_dir: Path) -> List[VisualBenchmarkItem]:
        """Parse MME annotation file.

        MME format per line: <image_filename>\t<question>\t<answer>
        """
        items: List[VisualBenchmarkItem] = []
        with ann_file.open("r", encoding="utf-8") as handle:
            for line_num, line in enumerate(handle, start=1):
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                parts = line.split("\t")
                if len(parts) < 3:
                    logger.warning("MME %s line %d: expected 3 tab-separated fields, got %d", category, line_num, len(parts))
                    continue

                image_name = parts[0].strip()
                question = parts[1].strip()
                answer = parts[2].strip().lower()

                image_path = cat_dir / image_name
                item_id = f"mme_{category}_{image_name}_{line_num}"

                items.append(VisualBenchmarkItem(
                    item_id=item_id,
                    benchmark="MME",
                    category=category,
                    image_path=str(image_path),
                    question=question,
                    ground_truth=answer,
                    answer_type="binary",
                    choices=["yes", "no"],
                    metadata={
                        "mme_category": category,
                        "image_name": image_name,
                        "annotation_file": str(ann_file.name),
                        "line_number": line_num,
                        "perception": category in MME_PERCEPTION_CATEGORIES,
                        "cognition": category in MME_COGNITION_CATEGORIES,
                    },
                ))
        return items

    def validate(self, items: Optional[List[VisualBenchmarkItem]] = None) -> Dict[str, Any]:
        if items is None:
            items = self.load()
        return verify_dataset_integrity(items)

    @staticmethod
    def score_mme(items: List[VisualBenchmarkItem], predictions: List[str]) -> Dict[str, Any]:
        """
        Official MME scoring: per category, score = accuracy * 100 + plus_score * 100.
        Plus score: both questions for the same image are correct.
        """
        from collections import defaultdict

        assert len(items) == len(predictions), "items and predictions must match"

        per_category: Dict[str, List[Dict]] = defaultdict(list)
        for item, pred in zip(items, predictions):
            per_category[item.category].append({
                "item": item,
                "pred": pred.strip().lower(),
                "gt": item.normalised_ground_truth,
            })

        results: Dict[str, Any] = {}
        total_score = 0.0
        for category, rows in per_category.items():
            correct = sum(1 for r in rows if r["pred"] == r["gt"])
            accuracy = correct / len(rows) if rows else 0.0

            by_image: Dict[str, List[bool]] = defaultdict(list)
            for r in rows:
                img_key = r["item"].metadata.get("image_name", r["item"].item_id)
                by_image[img_key].append(r["pred"] == r["gt"])

            plus_correct = sum(1 for correctness_list in by_image.values() if all(correctness_list))
            plus_total = len(by_image)
            plus_score = plus_correct / plus_total if plus_total else 0.0

            score = accuracy * 100 + plus_score * 100
            total_score += score
            results[category] = {
                "n": len(rows),
                "correct": correct,
                "accuracy": accuracy,
                "plus_score": plus_score,
                "mme_score": score,
            }

        results["total_score"] = total_score
        return results
