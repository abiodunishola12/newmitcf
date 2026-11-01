"""
Reproducible image perturbations for robustness evaluation.

These are controlled image corruptions, not adversarial attacks in the
threat-model sense. Perturbations are applied with fixed random seeds
and documented strengths to ensure reproducibility.
"""

from __future__ import annotations

import io
import random
from dataclasses import dataclass
from typing import List

from PIL import Image, ImageEnhance, ImageFilter


@dataclass
class PerturbationConfig:
    perturbation_type: str
    severity: float
    seed: int = 42


PERTURBATION_TYPES = [
    "gaussian_noise",
    "gaussian_blur",
    "brightness",
    "contrast",
    "jpeg_compression",
    "resolution_degradation",
]


def list_perturbations() -> List[str]:
    return list(PERTURBATION_TYPES)


def apply_perturbation(image: Image.Image, config: PerturbationConfig) -> Image.Image:
    """Apply a reproducible perturbation to an image.

    Args:
        image: PIL Image (RGB).
        config: Perturbation type, severity [0,1], and random seed.

    Returns:
        Perturbed PIL Image.

    Note: severity=0 returns the original image unchanged.
          severity=1 applies maximum perturbation.
    """
    if config.severity <= 0:
        return image.copy()

    ptype = config.perturbation_type
    rng = random.Random(config.seed)

    img = image.convert("RGB")

    if ptype == "gaussian_noise":
        return _gaussian_noise(img, config.severity, rng)
    elif ptype == "gaussian_blur":
        return _gaussian_blur(img, config.severity)
    elif ptype == "brightness":
        return _brightness(img, config.severity)
    elif ptype == "contrast":
        return _contrast(img, config.severity)
    elif ptype == "jpeg_compression":
        return _jpeg_compression(img, config.severity)
    elif ptype == "resolution_degradation":
        return _resolution_degradation(img, config.severity)
    else:
        raise ValueError(f"Unknown perturbation type: {ptype}")


def _gaussian_noise(img: Image.Image, severity: float, rng: random.Random) -> Image.Image:
    """Add Gaussian noise. severity ∈ [0,1] maps to std ∈ [0, 0.25]."""
    import numpy as np
    std = severity * 0.25
    arr = np.array(img, dtype=np.float32) / 255.0
    np_rng = np.random.default_rng(seed=rng.randint(0, 2**31))
    noise = np_rng.normal(0, std, arr.shape).astype(np.float32)
    noisy = np.clip(arr + noise, 0.0, 1.0)
    return Image.fromarray((noisy * 255).astype(np.uint8))


def _gaussian_blur(img: Image.Image, severity: float) -> Image.Image:
    """Apply Gaussian blur. severity ∈ [0,1] maps to sigma ∈ [0, 5]."""
    sigma = severity * 5.0
    return img.filter(ImageFilter.GaussianBlur(radius=sigma))


def _brightness(img: Image.Image, severity: float) -> Image.Image:
    """
    Alter brightness. severity ∈ [0, 0.5] = darken, (0.5, 1] = brighten.
    severity=0.5 is identity.
    """
    if severity <= 0.5:
        factor = 0.2 + 1.6 * severity
    else:
        factor = 0.2 + 1.6 * severity
    factor = max(0.1, min(3.0, factor))
    enhancer = ImageEnhance.Brightness(img)
    return enhancer.enhance(factor)


def _contrast(img: Image.Image, severity: float) -> Image.Image:
    """Alter contrast. severity ∈ [0,1] maps to factor ∈ [0.1, 3.0]."""
    factor = 0.1 + severity * 2.9
    enhancer = ImageEnhance.Contrast(img)
    return enhancer.enhance(factor)


def _jpeg_compression(img: Image.Image, severity: float) -> Image.Image:
    """JPEG compression artefacts. severity ∈ [0,1] → quality ∈ [5, 95]."""
    quality = max(5, int(95 - severity * 90))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=quality)
    buf.seek(0)
    return Image.open(buf).convert("RGB")


def _resolution_degradation(img: Image.Image, severity: float) -> Image.Image:
    """Downscale then upscale. severity ∈ [0,1] → scale ∈ [1.0, 0.1]."""
    scale = 1.0 - severity * 0.9
    scale = max(0.05, scale)
    orig_size = img.size
    small_w = max(1, int(orig_size[0] * scale))
    small_h = max(1, int(orig_size[1] * scale))
    small = img.resize((small_w, small_h), Image.BILINEAR)
    return small.resize(orig_size, Image.BILINEAR)
