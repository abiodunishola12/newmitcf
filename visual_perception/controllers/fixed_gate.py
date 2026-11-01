"""
Experiment C: Fixed-Gate Controller.

Uses predetermined fixed thresholds (not tuned on test data) instead of
the fuzzy inference engine. Serves as a comparator for the fuzzy-gated MITCF.
"""

from __future__ import annotations

import time
from dataclasses import dataclass

from PIL import Image

from ..adapters.mitcf_visual_adapter import (
    VisualMITCFAdapter,
    VisualRunRecord,
    _normalise_binary,
    _answer_confidence_proxy,
)
from ..datasets.base import VisualBenchmarkItem
from ..models.base import VLMAdapter

FIXED_CONFIDENCE_THRESHOLD = 0.65
FIXED_REVISION_THRESHOLD = 0.55


@dataclass
class FixedGateDecision:
    action: str
    reason: str
    confidence_proxy: float
    threshold: float


def run_fixed_gate(
    item: VisualBenchmarkItem,
    image: Image.Image,
    vlm: VLMAdapter,
    adapter: VisualMITCFAdapter,
    *,
    confidence_threshold: float = FIXED_CONFIDENCE_THRESHOLD,
    max_revision_attempts: int = 1,
    run_id: str = "",
    perturbation_type: str = "",
    perturbation_severity: float = 0.0,
) -> VisualRunRecord:
    """
    Fixed-threshold gate: if confidence proxy < threshold, trigger revision.
    If still below threshold after revision, escalate (abstain).
    """
    t_start = time.perf_counter()
    initial_output = vlm.generate(image, item.question, item.image_path)
    initial_answer = initial_output.text
    current_answer = initial_answer
    revised_answer = ""
    total_latency = initial_output.latency_s

    confidence = _answer_confidence_proxy(current_answer, initial_output.tokens_out)
    gate_decision = _fixed_gate_decide(confidence, confidence_threshold)

    revisions = 0
    if gate_decision.action == "revise" and max_revision_attempts > 0:
        revision_prompt = (
            f"{item.question}\n\n"
            f"Your previous answer was '{current_answer}'. "
            f"Please look at the image carefully and answer only with 'Yes' or 'No'."
        )
        revised_output = vlm.generate(image, revision_prompt, item.image_path)
        revised_answer = revised_output.text
        current_answer = revised_answer
        total_latency += revised_output.latency_s
        revisions += 1

        confidence = _answer_confidence_proxy(current_answer, revised_output.tokens_out)
        gate_decision = _fixed_gate_decide(confidence, confidence_threshold)

    abstained = gate_decision.action in {"escalate", "refuse"}
    normalised = _normalise_binary(current_answer)

    verification = adapter.verify_visual(item, current_answer, enabled=True)
    critique = adapter.critique_visual(item, current_answer, verification, enabled=True)

    return VisualRunRecord(
        item_id=item.item_id,
        benchmark=item.benchmark,
        category=item.category,
        image_path=item.image_path,
        question=item.question,
        condition="fixed_gate",
        model_id=vlm.model_id,
        initial_answer=initial_answer,
        revised_answer=revised_answer,
        final_answer=current_answer,
        normalised_final=normalised,
        abstained=abstained,
        gate_action=gate_decision.action,
        gate_reason=gate_decision.reason,
        fuzzy_inputs={"confidence_proxy": confidence, "threshold": confidence_threshold},
        fuzzy_memberships=None,
        fuzzy_gate_score=None,
        verification_status=verification.status,
        verification_score=verification.score,
        verification_flagged=verification.flagged,
        critique_issues=len(critique.issues),
        max_severity=critique.max_severity,
        revisions=revisions,
        latency_s=time.perf_counter() - t_start,
        tokens_in=initial_output.tokens_in,
        tokens_out=initial_output.tokens_out,
        perturbation_type=perturbation_type,
        perturbation_severity=perturbation_severity,
        run_id=run_id,
        error=initial_output.error,
    )


def _fixed_gate_decide(confidence: float, threshold: float) -> FixedGateDecision:
    if confidence >= threshold:
        return FixedGateDecision("accept", f"confidence {confidence:.2f} >= threshold {threshold:.2f}", confidence, threshold)
    if confidence >= FIXED_REVISION_THRESHOLD:
        return FixedGateDecision("revise", f"confidence {confidence:.2f} below accept threshold {threshold:.2f}", confidence, threshold)
    return FixedGateDecision("escalate", f"confidence {confidence:.2f} below revision threshold {FIXED_REVISION_THRESHOLD:.2f}", confidence, threshold)
