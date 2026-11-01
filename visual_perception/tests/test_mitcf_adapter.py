"""Tests for MITCF adapter: fuzzy gate, verification, and decision gate integration."""

from __future__ import annotations

from ..adapters.mitcf_visual_adapter import (
    VisualMITCFAdapter,
    VisualFuzzyInputBuilder,
    VisualInferenceSignals,
    _normalise_binary,
    _answer_confidence_proxy,
    _clip,
)
from ..datasets.base import VisualBenchmarkItem
from ..models.base import VLMOutput


def _make_item() -> VisualBenchmarkItem:
    return VisualBenchmarkItem(
        item_id="test_1", benchmark="POPE", category="random",
        image_path="/fake.jpg", question="Is there a cat?",
        ground_truth="yes",
    )


def _make_vlm_output(text: str, tokens_out: int = 5, latency: float = 1.0) -> VLMOutput:
    return VLMOutput(
        text=text, model_id="test", image_path="/fake.jpg",
        question="Is there a cat?", latency_s=latency,
        tokens_in=20, tokens_out=tokens_out,
    )


def test_normalise_binary():
    assert _normalise_binary("Yes, there is.") == "yes"
    assert _normalise_binary("No, I don't see one.") == "no"
    assert _normalise_binary("Yes") == "yes"
    assert _normalise_binary("NO") == "no"
    assert _normalise_binary("uncertain") == "uncertain"


def test_confidence_proxy_valid_binary():
    proxy = _answer_confidence_proxy("yes", tokens_out=3)
    assert proxy > 0.5


def test_confidence_proxy_hedge():
    proxy_hedge = _answer_confidence_proxy("maybe yes", tokens_out=5)
    proxy_clear = _answer_confidence_proxy("yes", tokens_out=3)
    assert proxy_clear > proxy_hedge


def test_clip():
    assert _clip(-0.5) == 0.0
    assert _clip(1.5) == 1.0
    assert _clip(0.5) == 0.5
    import math
    assert _clip(math.nan) == 0.0


def test_fuzzy_input_builder():
    builder = VisualFuzzyInputBuilder()
    signals = VisualInferenceSignals(
        normalised_answer="yes", is_valid_binary=True,
        answer_confidence_proxy=0.85, response_tokens=5, latency_s=1.2,
    )
    output = _make_vlm_output("yes", tokens_out=5)
    inputs = builder.build(signals, output)
    assert 0.0 <= inputs.quality <= 1.0
    assert 0.0 <= inputs.safety <= 1.0
    assert 0.0 <= inputs.risk <= 1.0
    assert 0.0 <= inputs.uncertainty <= 1.0
    assert 0.0 <= inputs.efficiency <= 1.0


def test_fuzzy_gate_produces_decision():
    adapter = VisualMITCFAdapter()
    output = _make_vlm_output("yes", tokens_out=3)
    signals = adapter.extract_signals(output)
    decision = adapter.run_fuzzy_gate(signals, output)
    assert decision.action in {"accept", "verify", "revise", "escalate", "refuse"}
    assert 0.0 <= decision.gate_score <= 1.0
    assert all(0.0 <= v <= 1.0 for v in decision.memberships.values())


def test_fuzzy_gate_uncertain_gets_lower_score():
    adapter = VisualMITCFAdapter()
    certain_out = _make_vlm_output("yes", tokens_out=3, latency=0.5)
    uncertain_out = _make_vlm_output("maybe I think so probably", tokens_out=25, latency=3.0)

    certain_signals = adapter.extract_signals(certain_out)
    uncertain_signals = adapter.extract_signals(uncertain_out)

    certain_decision = adapter.run_fuzzy_gate(certain_signals, certain_out)
    uncertain_decision = adapter.run_fuzzy_gate(uncertain_signals, uncertain_out)

    assert certain_decision.gate_score > uncertain_decision.gate_score


def test_verify_visual_no_label():
    """Verify that visual verification does not use the ground-truth label."""
    adapter = VisualMITCFAdapter()
    item = _make_item()
    result = adapter.verify_visual(item, "yes", enabled=True)
    assert result.enabled
    assert result.status in {"supported", "refuted", "insufficient"}
    assert 0.0 <= result.score <= 1.0


def test_visual_item_to_benchmark_item():
    adapter = VisualMITCFAdapter()
    item = _make_item()
    bench = adapter.visual_item_to_benchmark_item(item)
    assert bench.id == item.item_id
    assert bench.label == "", "Ground truth MUST NOT be passed to BenchmarkItem"
    assert bench.dataset == item.benchmark


def test_full_pipeline_integration():
    """Integration: full fuzzy MITCF pipeline on a mock output — no label access."""
    from ..controllers.full_mitcf import run_full_mitcf

    class MockVLM:
        model_id = "mock"
        revision = "test"
        is_loaded = True

        def generate(self, image, question, image_path=""):
            return VLMOutput(
                text="yes", model_id="mock", image_path=image_path,
                question=question, latency_s=0.1, tokens_in=10, tokens_out=3,
            )

    try:
        from PIL import Image
        import numpy as np
        img = Image.fromarray((np.zeros((224, 224, 3), dtype="uint8")), "RGB")
    except ImportError:
        import unittest
        raise unittest.SkipTest("Pillow not installed")

    item = _make_item()
    adapter = VisualMITCFAdapter()
    record = run_full_mitcf(item, img, MockVLM(), adapter, max_revision_attempts=1)

    assert record.item_id == item.item_id
    assert record.condition == "full_mitcf"
    assert record.fuzzy_inputs is not None
    assert record.fuzzy_memberships is not None
    assert record.gate_action in {"accept", "verify", "revise", "escalate", "refuse"}
    assert not hasattr(record, "ground_truth"), "Record must not carry ground_truth"
