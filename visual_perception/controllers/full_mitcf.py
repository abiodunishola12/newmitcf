"""
Experiment D: Full Fuzzy-Gated MITCF.

Integrates the original MITCF fuzzy inference engine with visual-perception
inference. The pipeline:
  1. Generation: VLM produces initial answer
  2. Verification: MITCF VerificationModule checks output quality
  3. Critique: MITCF CritiqueModule identifies issues
  4. Fuzzy inputs: VisualFuzzyInputBuilder derives [0,1] signals
  5. Fuzzy gate: Original FuzzyDecisionGate (Mamdani + centroid defuzzification)
  6. Revision: If fuzzy gate action = revise, ask VLM to reconsider
  7. Final decision: MITCF DecisionGate determines accept/escalate/refuse
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


def run_full_mitcf(
    item: VisualBenchmarkItem,
    image: Image.Image,
    vlm: VLMAdapter,
    adapter: VisualMITCFAdapter,
    *,
    max_revision_attempts: int = 2,
    run_id: str = "",
    perturbation_type: str = "",
    perturbation_severity: float = 0.0,
) -> VisualRunRecord:
    """
    Full fuzzy-gated MITCF pipeline for one visual question-answering item.
    """
    t_start = time.perf_counter()

    initial_output = vlm.generate(image, item.question, item.image_path)
    initial_answer = initial_output.text
    current_answer = initial_answer
    revised_answer = ""
    total_tokens_in = initial_output.tokens_in
    total_tokens_out = initial_output.tokens_out

    signals = adapter.extract_signals(initial_output)
    fuzzy_decision = adapter.run_fuzzy_gate(signals, initial_output)

    verification = adapter.verify_visual(item, current_answer, enabled=True)
    critique = adapter.critique_visual(item, current_answer, verification, enabled=True)

    revisions = 0
    while (
        revisions < max_revision_attempts
        and _should_revise(fuzzy_decision.action, verification, critique)
    ):
        revision_prompt = _build_revision_prompt(item.question, current_answer, verification, critique, fuzzy_decision)
        revised_output = vlm.generate(image, revision_prompt, item.image_path)
        revised_answer = revised_output.text
        current_answer = revised_answer
        total_tokens_in += revised_output.tokens_in
        total_tokens_out += revised_output.tokens_out
        revisions += 1

        signals = adapter.extract_signals(revised_output)
        fuzzy_decision = adapter.run_fuzzy_gate(signals, revised_output)
        verification = adapter.verify_visual(item, current_answer, enabled=True)
        critique = adapter.critique_visual(item, current_answer, verification, enabled=True)

    gate_result = adapter.decide(
        item, current_answer, verification, critique,
        revisions_used=revisions, enabled=True
    )
    final_answer = adapter.final_answer_for_gate_action(gate_result, current_answer)
    normalised = _normalise_binary(final_answer)
    abstained = gate_result.action in {GateAction.REFUSE.value, GateAction.ESCALATE.value}

    fuzzy_inputs_dict = {
        "quality": fuzzy_decision.inputs.quality,
        "safety": fuzzy_decision.inputs.safety,
        "risk": fuzzy_decision.inputs.risk,
        "uncertainty": fuzzy_decision.inputs.uncertainty,
        "efficiency": fuzzy_decision.inputs.efficiency,
    }

    return VisualRunRecord(
        item_id=item.item_id,
        benchmark=item.benchmark,
        category=item.category,
        image_path=item.image_path,
        question=item.question,
        condition="full_mitcf",
        model_id=vlm.model_id,
        initial_answer=initial_answer,
        revised_answer=revised_answer,
        final_answer=final_answer,
        normalised_final=normalised,
        abstained=abstained,
        gate_action=gate_result.action,
        gate_reason=gate_result.reason,
        fuzzy_inputs=fuzzy_inputs_dict,
        fuzzy_memberships=dict(fuzzy_decision.memberships),
        fuzzy_gate_score=fuzzy_decision.gate_score,
        verification_status=verification.status,
        verification_score=verification.score,
        verification_flagged=verification.flagged,
        critique_issues=len(critique.issues),
        max_severity=critique.max_severity,
        revisions=revisions,
        latency_s=time.perf_counter() - t_start,
        tokens_in=total_tokens_in,
        tokens_out=total_tokens_out,
        perturbation_type=perturbation_type,
        perturbation_severity=perturbation_severity,
        run_id=run_id,
        error=initial_output.error,
    )


def _should_revise(fuzzy_action: str, verification, critique) -> bool:
    if fuzzy_action in {GateAction.REVISE.value, "revise"}:
        return True
    if verification.enabled and verification.flagged:
        return True
    return any(
        issue.action in {GateAction.REVISE.value, GateAction.REFUSE.value}
        for issue in critique.issues
    )


def _build_revision_prompt(question, current_answer, verification, critique, fuzzy_decision) -> str:
    parts = [
        f"{question}\n\n",
        f"Your previous answer was: '{current_answer}'. ",
    ]
    if verification.enabled:
        parts.append(f"Verification: {verification.status} (score={verification.score:.2f}). ")
    if critique.issues:
        issue_desc = "; ".join(f"{i.issue_type}: {i.reason}" for i in critique.issues[:2])
        parts.append(f"Issues detected: {issue_desc}. ")
    parts.append(
        f"The system has flagged uncertainty in your response (fuzzy risk={fuzzy_decision.inputs.risk:.2f}). "
        "Please carefully re-examine the image and answer only with 'Yes' or 'No'."
    )
    return "".join(parts)
