"""Tests for image perturbations and reproducibility."""

from __future__ import annotations

import pytest

from ..robustness.perturbations import apply_perturbation, PerturbationConfig, list_perturbations


def _make_test_image():
    try:
        from PIL import Image
        import numpy as np
        arr = (np.random.RandomState(0).rand(224, 224, 3) * 255).astype("uint8")
        return Image.fromarray(arr, "RGB")
    except ImportError:
        pytest.skip("Pillow not installed")


def test_list_perturbations():
    types = list_perturbations()
    assert len(types) >= 6
    assert "gaussian_noise" in types
    assert "jpeg_compression" in types


def test_gaussian_noise_reproducible():
    img = _make_test_image()
    cfg = PerturbationConfig("gaussian_noise", 0.1, seed=42)
    out1 = apply_perturbation(img, cfg)
    out2 = apply_perturbation(img, cfg)
    assert list(out1.getdata()) == list(out2.getdata()), "Same seed must produce same output"


def test_gaussian_noise_different_seeds():
    img = _make_test_image()
    out1 = apply_perturbation(img, PerturbationConfig("gaussian_noise", 0.2, seed=1))
    out2 = apply_perturbation(img, PerturbationConfig("gaussian_noise", 0.2, seed=2))
    assert list(out1.getdata()) != list(out2.getdata()), "Different seeds should produce different outputs"


def test_zero_severity_identity():
    img = _make_test_image()
    for ptype in list_perturbations():
        out = apply_perturbation(img, PerturbationConfig(ptype, 0.0))
        assert list(out.getdata()) == list(img.convert("RGB").getdata()), \
            f"{ptype} with severity=0 should return original image"


def test_jpeg_compression_changes_image():
    img = _make_test_image()
    out = apply_perturbation(img, PerturbationConfig("jpeg_compression", 0.9, seed=0))
    assert out.size == img.size
    assert list(out.getdata()) != list(img.convert("RGB").getdata())


def test_resolution_degradation_preserves_size():
    img = _make_test_image()
    out = apply_perturbation(img, PerturbationConfig("resolution_degradation", 0.5, seed=0))
    assert out.size == img.size


def test_gaussian_blur():
    img = _make_test_image()
    out = apply_perturbation(img, PerturbationConfig("gaussian_blur", 0.5, seed=0))
    assert out.size == img.size


def test_all_perturbations_produce_rgb(tmp_path):
    img = _make_test_image()
    for ptype in list_perturbations():
        out = apply_perturbation(img, PerturbationConfig(ptype, 0.5, seed=42))
        assert out.mode == "RGB", f"{ptype} must output RGB"
        assert out.size == img.size, f"{ptype} must preserve image dimensions"
