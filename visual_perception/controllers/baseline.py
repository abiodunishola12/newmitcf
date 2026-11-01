"""Experiment A: Unmodified VLM Baseline — no MITCF intervention."""

from __future__ import annotations

from PIL import Image

from ..adapters.mitcf_visual_adapter import VisualMITCFAdapter, _normalise_binary
from ..datasets.base import VisualBenchmarkItem
from ..models.base import VLMAdapter, VLMOutput
from ..adapters.mitcf_visual_adapter import VisualRunRecord


def run_baseline(
    item: VisualBenchmarkItem,
    image: Image.Image,
    vlm: VLMAdapter,
    adapter: VisualMITCFAdapter,
    *,
    run_id: str = "",
    perturbation_type: str = "",
    perturbation_severity: float = 0.0,
) -> VisualRunRecord:
    """Run VLM without any MITCF intervention and return a VisualRunRecord."""
    output: VLMOutput = vlm.generate(image, item.question, item.image_path)
    normalised = _normalise_binary(output.text)

    return VisualRunRecord(
        item_id=item.item_id,
        benchmark=item.benchmark,
        category=item.category,
        image_path=item.image_path,
        question=item.question,
        condition="baseline",
        model_id=vlm.model_id,
        initial_answer=output.text,
        revised_answer="",
        final_answer=output.text,
        normalised_final=normalised,
        abstained=False,
        gate_action="accept",
        gate_reason="baseline: no gate",
        fuzzy_inputs=None,
        fuzzy_memberships=None,
        fuzzy_gate_score=None,
        verification_status="disabled",
        verification_score=1.0,
        verification_flagged=False,
        critique_issues=0,
        max_severity="none",
        revisions=0,
        latency_s=output.latency_s,
        tokens_in=output.tokens_in,
        tokens_out=output.tokens_out,
        perturbation_type=perturbation_type,
        perturbation_severity=perturbation_severity,
        run_id=run_id,
        error=output.error,
    )
