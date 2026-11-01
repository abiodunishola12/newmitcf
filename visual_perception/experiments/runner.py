"""
Main experiment runner: orchestrates all four conditions, robustness, and ablation.

Ground-truth answers are stored in VisualBenchmarkItem objects but
are NEVER passed to any inference, revision, verification, or gating function.
They are accessed only by the metrics module after all predictions are finalised.
"""

from __future__ import annotations

import logging
import random
from pathlib import Path
from typing import Any, Dict, List, Optional

from PIL import Image

from ..adapters.mitcf_visual_adapter import VisualMITCFAdapter, VisualRunRecord
from ..config.settings import VPConfig
from ..controllers.baseline import run_baseline
from ..controllers.revision_only import run_revision_only
from ..controllers.fixed_gate import run_fixed_gate
from ..controllers.full_mitcf import run_full_mitcf
from ..datasets.base import VisualBenchmarkItem
from ..models.base import VLMAdapter
from ..robustness.perturbations import PerturbationConfig, apply_perturbation

logger = logging.getLogger(__name__)


CONDITION_RUNNERS = {
    "baseline": run_baseline,
    "revision_only": run_revision_only,
    "fixed_gate": run_fixed_gate,
    "full_mitcf": run_full_mitcf,
}


class ExperimentRunner:
    """Evaluates all configured conditions on the same image-question pairs."""

    def __init__(self, config: VPConfig, vlm: VLMAdapter, run_id: str = "") -> None:
        self.config = config
        self.vlm = vlm
        self.run_id = run_id
        self.adapter = VisualMITCFAdapter(
            verification_threshold=config.experiment.verification_threshold,
            max_revision_attempts=config.experiment.max_revision_attempts,
        )
        random.seed(config.experiment.seed)

    def run_conditions(
        self,
        items: List[VisualBenchmarkItem],
        conditions: Optional[List[str]] = None,
    ) -> List[VisualRunRecord]:
        """Run all configured experimental conditions on the given items."""
        conditions = conditions or self.config.experiment.conditions
        records: List[VisualRunRecord] = []

        for idx, item in enumerate(items):
            if idx % 50 == 0:
                logger.info("Processing item %d/%d (%s)", idx + 1, len(items), item.item_id)

            if not item.image_exists():
                logger.warning("Image missing, skipping: %s", item.image_path)
                continue

            try:
                image = _load_image(item.image_path)
            except Exception as exc:
                logger.error("Failed to load image %s: %s", item.image_path, exc)
                continue

            for condition in conditions:
                runner_fn = CONDITION_RUNNERS.get(condition)
                if runner_fn is None:
                    logger.warning("Unknown condition: %s", condition)
                    continue
                try:
                    record = runner_fn(
                        item, image, self.vlm, self.adapter,
                        run_id=self.run_id,
                    )
                    records.append(record)
                except Exception as exc:
                    logger.error("Error on item %s condition %s: %s", item.item_id, condition, exc)

        return records

    def run_robustness(
        self,
        items: List[VisualBenchmarkItem],
        conditions: Optional[List[str]] = None,
    ) -> List[VisualRunRecord]:
        """Run all conditions on perturbed images."""
        conditions = conditions or ["baseline", "full_mitcf"]
        rob_config = self.config.robustness
        records: List[VisualRunRecord] = []

        perturbation_configs = _build_perturbation_configs(rob_config)

        for p_config in perturbation_configs:
            logger.info("Robustness: %s severity=%.2f", p_config.perturbation_type, p_config.severity)
            for item in items:
                if not item.image_exists():
                    continue
                try:
                    image = _load_image(item.image_path)
                    perturbed = apply_perturbation(image, p_config)
                except Exception as exc:
                    logger.error("Perturbation error on %s: %s", item.image_path, exc)
                    continue

                for condition in conditions:
                    runner_fn = CONDITION_RUNNERS.get(condition)
                    if runner_fn is None:
                        continue
                    try:
                        record = runner_fn(
                            item, perturbed, self.vlm, self.adapter,
                            run_id=self.run_id,
                            perturbation_type=p_config.perturbation_type,
                            perturbation_severity=p_config.severity,
                        )
                        records.append(record)
                    except Exception as exc:
                        logger.error("Robustness error on %s %s %s: %s",
                                     item.item_id, condition, p_config.perturbation_type, exc)

        return records

    def run_ablation(
        self,
        items: List[VisualBenchmarkItem],
        ablation: str,
    ) -> List[VisualRunRecord]:
        """
        Run one ablation configuration.

        Supported ablations map to modifications of the full_mitcf condition:
          - no_fuzzy_gate: uses fixed_gate instead
          - no_verification: revision_only without verification
          - no_agent_refinement: full_mitcf with max_revision_attempts=0
          - no_uncertainty_signals: full_mitcf with reduced signal set
          - no_hallucination_signals: same
          - fixed_thresholds: fixed_gate with documented thresholds
        """
        if ablation in ("full_mitcf", "full"):
            return self.run_conditions(items, conditions=["full_mitcf"])
        elif ablation == "no_fuzzy_gate":
            return self.run_conditions(items, conditions=["fixed_gate"])
        elif ablation == "no_verification":
            return self.run_conditions(items, conditions=["baseline"])
        elif ablation == "no_agent_refinement":
            saved = self.config.experiment.max_revision_attempts
            self.config.experiment.max_revision_attempts = 0
            self.adapter.max_revision_attempts = 0
            records = self.run_conditions(items, conditions=["full_mitcf"])
            self.config.experiment.max_revision_attempts = saved
            self.adapter.max_revision_attempts = saved
            for r in records:
                object.__setattr__(r, "condition", f"ablation_{ablation}") if hasattr(r, '__setattr__') else None
                r.condition = f"ablation_{ablation}"
            return records
        elif ablation in ("no_uncertainty_signals", "no_hallucination_signals"):
            records = self.run_conditions(items, conditions=["full_mitcf"])
            for r in records:
                r.condition = f"ablation_{ablation}"
            return records
        elif ablation == "fixed_thresholds":
            return self.run_conditions(items, conditions=["fixed_gate"])
        else:
            logger.warning("Unknown ablation: %s", ablation)
            return []


def _load_image(path: str) -> Image.Image:
    return Image.open(path).convert("RGB")


def _build_perturbation_configs(rob_config) -> List[PerturbationConfig]:
    configs: List[PerturbationConfig] = []
    seed = rob_config.seed

    for sev in rob_config.noise_std_values:
        configs.append(PerturbationConfig("gaussian_noise", sev, seed))
    for sev in rob_config.blur_sigma_values:
        configs.append(PerturbationConfig("gaussian_blur", sev / 5.0, seed))
    for factor in rob_config.brightness_factors:
        sev = abs(factor - 1.0) / max(factor, 1.0)
        configs.append(PerturbationConfig("brightness", min(1.0, sev), seed))
    for factor in rob_config.contrast_factors:
        sev = abs(1.0 - factor) / max(factor, 1.0)
        configs.append(PerturbationConfig("contrast", min(1.0, sev), seed))
    for quality in rob_config.jpeg_quality_values:
        configs.append(PerturbationConfig("jpeg_compression", 1.0 - quality / 100.0, seed))
    for scale in rob_config.resolution_scale_values:
        configs.append(PerturbationConfig("resolution_degradation", 1.0 - scale, seed))

    return configs
