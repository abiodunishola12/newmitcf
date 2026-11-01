"""
Experiment B: Revision-Only — verification and refinement, no fuzzy gate.

The model may reconsider its initial prediction using the same image and question.
Ground-truth answer is not accessed at any point.
"""

from __future__ import annotations

import time
from typing import Optional

from PIL import Image

from mitcf_pipeline.schemas import GateAction

from ..adapters.mitcf_visual_adapter import (
    VisualMITCFAdapter,
    VisualRunRecord,
    _normalise_binary,
)
from ..datasets.base import VisualBenchmarkItem
from ..models.base import VLMAdapter


def run_revision_only(
    item: VisualBenchmarkItem,
    image: Image.Image,
    vlm: VLMAdapter,
    adapter: VisualMITCFAdapter,
    *,
    max_revision_attempts: int = 1,
    run_id: str = "",
    perturbation_type: str = "",
    perturbation_severity: float = 0.0,
) -> VisualRunRecord:
    """
    Revision-only condition: verification + critique + up to one revision.
    No fuzzy gate applied.
    """
    t_start = time.perf_counter()
    initial_output = vlm.generate(image, item.question, item.image_path)
    initial_answer = initial_output.text
    current_answer = initial_answer
    revised_answer = ""
    total_latency = initial_output.latency_s

    verification = adapter.verify_visual(item, current_answer, enabled=True)
    critique = adapter.critique_visual(item, current_answer, verification, enabled=True)

    revisions = 0
    while (
        revisions < max_revision_attempts
        and _needs_revision(verification, critique)
    ):
        revision_question = _build_revision_prompt(item.question, current_answer, verification, critique)
        revised_output = vlm.generate(image, revision_question, item.image_path)
        revised_answer = revised_output.text
        current_answer = revised_answer
        total_latency += revised_output.latency_s
        revisions += 1

        verification = adapter.verify_visual(item, current_answer, enabled=True)
        critique = adapter.critique_visual(item, current_answer, verification, enabled=True)

    normalised = _normalise_binary(current_answer)

    return VisualRunRecord(
        item_id=item.item_id,
        benchmark=item.benchmark,
        category=item.category,
        image_path=item.image_path,
        question=item.question,
        condition="revision_only",
        model_id=vlm.model_id,
        initial_answer=initial_answer,
        revised_answer=revised_answer,
        final_answer=current_answer,
        normalised_final=normalised,
        abstained=False,
        gate_action="accept",
        gate_reason="revision_only: no gate applied",
        fuzzy_inputs=None,
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


def _needs_revision(verification, critique) -> bool:
    if verification.enabled and verification.flagged:
        return True
    from mitcf_pipeline.schemas import GateAction
    return any(
        issue.action in {GateAction.REVISE.value, GateAction.REFUSE.value}
        for issue in critique.issues
    )


def _build_revision_prompt(
    original_question: str,
    previous_answer: str,
    verification,
    critique,
) -> str:
    feedback_parts = []
    if verification.enabled:
        feedback_parts.append(
            f"Your previous answer was: '{previous_answer}'. "
            f"Verification status: {verification.status} (score={verification.score:.2f})."
        )
    for issue in critique.issues:
        feedback_parts.append(f"Issue: {issue.issue_type} — {issue.reason}.")
    feedback = " ".join(feedback_parts)
    return (
        f"{original_question}\n\n"
        f"Please reconsider. {feedback} "
        f"Look carefully at the image and answer with only 'Yes' or 'No'."
    )
