"""Configuration dataclasses and YAML I/O for the visual-perception evaluation."""

from __future__ import annotations

import os
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

import yaml


@dataclass
class ModelConfig:
    model_id: str = "Qwen/Qwen2.5-VL-3B-Instruct"
    revision: str = "main"
    torch_dtype: str = "float16"
    device_map: str = "auto"
    load_in_4bit: bool = False
    load_in_8bit: bool = False
    max_new_tokens: int = 128
    temperature: float = 0.0
    do_sample: bool = False
    cache_dir: str = ""


@dataclass
class DatasetConfig:
    pope_dir: str = "data/pope"
    pope_categories: List[str] = field(default_factory=lambda: ["random", "popular", "adversarial"])
    pope_max_samples: int = 500

    mme_dir: str = "data/mme"
    mme_categories: List[str] = field(default_factory=lambda: [
        "existence", "count", "position", "color", "posters",
        "celebrity", "scene", "landmark", "artwork", "OCR"
    ])
    mme_max_samples: int = 500


@dataclass
class ExperimentConfig:
    seed: int = 42
    output_dir: str = "results/visual_perception"
    run_id: str = ""
    max_revision_attempts: int = 2
    verification_threshold: float = 0.70
    fixed_gate_confidence_threshold: float = 0.65
    bootstrap_samples: int = 2000
    significance_level: float = 0.05
    conditions: List[str] = field(default_factory=lambda: [
        "baseline", "revision_only", "fixed_gate", "full_mitcf"
    ])


@dataclass
class RobustnessConfig:
    enabled: bool = True
    perturbations: List[str] = field(default_factory=lambda: [
        "gaussian_noise", "gaussian_blur", "brightness", "contrast",
        "jpeg_compression", "resolution_degradation"
    ])
    noise_std_values: List[float] = field(default_factory=lambda: [0.05, 0.10, 0.20])
    blur_sigma_values: List[float] = field(default_factory=lambda: [1.0, 2.0, 4.0])
    brightness_factors: List[float] = field(default_factory=lambda: [0.5, 1.5, 2.0])
    contrast_factors: List[float] = field(default_factory=lambda: [0.3, 0.7, 1.5])
    jpeg_quality_values: List[int] = field(default_factory=lambda: [20, 40, 60])
    resolution_scale_values: List[float] = field(default_factory=lambda: [0.25, 0.5, 0.75])
    seed: int = 42


@dataclass
class AblationConfig:
    enabled: bool = True
    ablations: List[str] = field(default_factory=lambda: [
        "full_mitcf",
        "no_fuzzy_gate",
        "no_verification",
        "no_agent_refinement",
        "no_uncertainty_signals",
        "no_hallucination_signals",
        "fixed_thresholds",
    ])


@dataclass
class VPConfig:
    model: ModelConfig = field(default_factory=ModelConfig)
    datasets: DatasetConfig = field(default_factory=DatasetConfig)
    experiment: ExperimentConfig = field(default_factory=ExperimentConfig)
    robustness: RobustnessConfig = field(default_factory=RobustnessConfig)
    ablation: AblationConfig = field(default_factory=AblationConfig)
    ti_weights: Dict[str, float] = field(default_factory=lambda: {
        "hallucination": 0.35,
        "bias": 0.15,
        "robustness": 0.25,
        "decision": 0.25,
    })


def default_config() -> VPConfig:
    return VPConfig()


def load_config(path: str | Path) -> VPConfig:
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"Config file not found: {path}")
    with path.open("r", encoding="utf-8") as handle:
        raw = yaml.safe_load(handle) or {}
    return _dict_to_config(raw)


def save_config(config: VPConfig, path: str | Path) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        yaml.safe_dump(asdict(config), handle, default_flow_style=False, sort_keys=False)


def _dict_to_config(raw: Dict[str, Any]) -> VPConfig:
    config = VPConfig()
    if "model" in raw:
        for key, value in raw["model"].items():
            if hasattr(config.model, key):
                setattr(config.model, key, value)
    if "datasets" in raw:
        for key, value in raw["datasets"].items():
            if hasattr(config.datasets, key):
                setattr(config.datasets, key, value)
    if "experiment" in raw:
        for key, value in raw["experiment"].items():
            if hasattr(config.experiment, key):
                setattr(config.experiment, key, value)
    if "robustness" in raw:
        for key, value in raw["robustness"].items():
            if hasattr(config.robustness, key):
                setattr(config.robustness, key, value)
    if "ablation" in raw:
        for key, value in raw["ablation"].items():
            if hasattr(config.ablation, key):
                setattr(config.ablation, key, value)
    if "ti_weights" in raw:
        config.ti_weights = raw["ti_weights"]
    return config
