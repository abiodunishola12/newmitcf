"""
Adapter that bridges visual-perception VLM outputs to the original
MITCF fuzzy inference engine and trustworthiness scoring modules.

The MITCF fuzzy engine expects normalised [0,1] inputs for:
  quality, safety, risk, uncertainty, efficiency

This adapter derives those signals from observable VLM inference outputs
without accessing the ground-truth answer during inference or gating.

Observable inference-time signals (no label leakage):
  - Answer token distribution (binary: yes/no confidence proxy)
  - Response length (unusually short → low confidence proxy)
  - Response lexical consistency on repeated questions (if enabled)
  - Perturbation consistency (clean vs. perturbed prediction)

Post-hoc signals (used ONLY in evaluation metrics, not in gating):
  - Ground-truth correctness
  - Benchmark-specific accuracy
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from typing import Any, Dict, Optional, Tuple

from mitcf_pipeline.fuzzy_gate import FuzzyDecisionGate, FuzzyInputs, FuzzyDecision
from mitcf_pipeline.schemas import (
    BenchmarkItem,
    ConditionConfig,
    CritiqueResult,
    GateAction,
    GateResult,
    RunRecord,
    VerificationResult,
)
from mitcf_pipeline.controls import (
    CritiqueModule,
    DecisionGate,
    RevisionModule,
    VerificationModule,
    final_text_for_gate_action,
    should_revise,
)

from ..datasets.base import VisualBenchmarkItem
from ..models.base import VLMOutput


VALID_BINARY_ANSWERS = {"yes", "no"}


@dataclass
class VisualInferenceSignals:
    """Observable signals extracted from a VLM output — no ground-truth access."""

    normalised_answer: str
    is_valid_binary: bool
    answer_confidence_proxy: float  # [0,1] based on length + certainty markers
    response_tokens: int
    latency_s: float
    perturbation_consistent: Optional[bool] = None
    revision_changed: bool = False


@dataclass
class VisualRunRecord:
    """Complete record for one image-question pair under one condition."""

    item_id: str
    benchmark: str
    category: str
    image_path: str
    question: str
    condition: str
    model_id: str
    initial_answer: str
    revised_answer: str
    final_answer: str
    normalised_final: str
    abstained: bool
    gate_action: str
    gate_reason: str
    fuzzy_inputs: Optional[Dict[str, float]]
    fuzzy_memberships: Optional[Dict[str, float]]
    fuzzy_gate_score: Optional[float]
    verification_status: str
    verification_score: float
    verification_flagged: bool
    critique_issues: int
    max_severity: str
    revisions: int
    latency_s: float
    tokens_in: int
    tokens_out: int
    perturbation_type: str = ""
    perturbation_severity: float = 0.0
    run_id: str = ""
    error: Optional[str] = None

    @property
    def refused_or_escalated(self) -> bool:
        return self.gate_action in {GateAction.REFUSE.value, GateAction.ESCALATE.value}


class VisualFuzzyInputBuilder:
    """
    Constructs MITCF FuzzyInputs from visual inference signals only.

    All signals used here are observable at inference time without the label.
    """

    def build(self, signals: VisualInferenceSignals, vlm_output: VLMOutput) -> FuzzyInputs:
        quality = self._quality(signals)
        safety = self._safety(signals)
        uncertainty = self._uncertainty(signals)
        risk = self._risk(quality, uncertainty, signals)
        efficiency = self._efficiency(signals.latency_s)

        return FuzzyInputs(
            quality=_clip(quality),
            safety=_clip(safety),
            risk=_clip(risk),
            uncertainty=_clip(uncertainty),
            efficiency=_clip(efficiency),
        )

    def _quality(self, signals: VisualInferenceSignals) -> float:
        base = signals.answer_confidence_proxy
        if not signals.is_valid_binary:
            base *= 0.5
        return base

    def _safety(self, signals: VisualInferenceSignals) -> float:
        if signals.is_valid_binary:
            return 0.85
        if signals.normalised_answer in {"unsure", "maybe", "unknown", "i don't know"}:
            return 0.50
        return 0.70

    def _uncertainty(self, signals: VisualInferenceSignals) -> float:
        return 1.0 - signals.answer_confidence_proxy

    def _risk(self, quality: float, uncertainty: float, signals: VisualInferenceSignals) -> float:
        error_risk = 1.0 - quality
        loss_risk = uncertainty
        safety_risk = 1.0 - self._safety(signals)
        risk = 0.45 * error_risk + 0.35 * loss_risk + 0.20 * safety_risk
        if signals.perturbation_consistent is False:
            risk = min(1.0, risk + 0.15)
        return risk

    def _efficiency(self, latency_s: float) -> float:
        if latency_s <= 1.0:
            return 1.0
        if latency_s >= 30.0:
            return 0.1
        return 1.0 - (latency_s - 1.0) / 29.0


class VisualMITCFAdapter:
    """
    Integrates the original MITCF fuzzy gate and control modules with
    visual-perception VLM inference, bridging VisualBenchmarkItem to
    BenchmarkItem as required by the existing pipeline.
    """

    def __init__(
        self,
        verification_threshold: float = 0.70,
        max_revision_attempts: int = 2,
    ) -> None:
        self.verification_threshold = verification_threshold
        self.max_revision_attempts = max_revision_attempts
        self.fuzzy_gate = FuzzyDecisionGate()
        self.input_builder = VisualFuzzyInputBuilder()
        self._verifier = VerificationModule(threshold=verification_threshold, use_label=False)
        self._critiquer = CritiqueModule()
        self._decision_gate = DecisionGate(threshold=verification_threshold)

    def visual_item_to_benchmark_item(self, item: VisualBenchmarkItem) -> BenchmarkItem:
        """Convert a VisualBenchmarkItem to the MITCF BenchmarkItem schema."""
        return BenchmarkItem(
            id=item.item_id,
            dataset=item.benchmark,
            task_type="hallucination",
            prompt=item.question,
            label="",
            choices=item.choices,
            metadata={
                "category": item.category,
                "benchmark": item.benchmark,
                "image_path": item.image_path,
                "unsafe": False,
            },
        )

    def extract_signals(self, vlm_output: VLMOutput) -> VisualInferenceSignals:
        """Extract inference-time signals from a VLM output."""
        raw = vlm_output.text.strip().lower()
        normalised = _normalise_binary(raw)
        is_valid = normalised in VALID_BINARY_ANSWERS
        confidence = _answer_confidence_proxy(raw, vlm_output.tokens_out)
        return VisualInferenceSignals(
            normalised_answer=normalised,
            is_valid_binary=is_valid,
            answer_confidence_proxy=confidence,
            response_tokens=vlm_output.tokens_out,
            latency_s=vlm_output.latency_s,
        )

    def run_fuzzy_gate(self, signals: VisualInferenceSignals, vlm_output: VLMOutput) -> FuzzyDecision:
        inputs = self.input_builder.build(signals, vlm_output)
        return self.fuzzy_gate.evaluate(inputs)

    def verify_visual(
        self, item: VisualBenchmarkItem, answer: str, *, enabled: bool = True
    ) -> VerificationResult:
        """Run MITCF verification on a visual answer (no label access)."""
        bench_item = self.visual_item_to_benchmark_item(item)
        bench_item = BenchmarkItem(
            id=bench_item.id,
            dataset=bench_item.dataset,
            task_type=bench_item.task_type,
            prompt=bench_item.prompt,
            label="",
            choices=bench_item.choices,
            metadata={**bench_item.metadata},
        )
        return self._verifier.verify(bench_item, answer, enabled=enabled)

    def critique_visual(
        self,
        item: VisualBenchmarkItem,
        answer: str,
        verification: VerificationResult,
        *,
        enabled: bool = True,
    ) -> CritiqueResult:
        bench_item = self.visual_item_to_benchmark_item(item)
        return self._critiquer.critique(bench_item, answer, verification=verification, enabled=enabled)

    def decide(
        self,
        item: VisualBenchmarkItem,
        answer: str,
        verification: VerificationResult,
        critique: CritiqueResult,
        *,
        revisions_used: int = 0,
        enabled: bool = True,
    ) -> GateResult:
        bench_item = self.visual_item_to_benchmark_item(item)
        return self._decision_gate.decide(
            bench_item,
            answer,
            verification,
            critique,
            revisions_used=revisions_used,
            max_revisions=self.max_revision_attempts,
            enabled=enabled,
        )

    def final_answer_for_gate_action(self, gate_result: GateResult, current_answer: str) -> str:
        return final_text_for_gate_action(gate_result.action, gate_result.reason, current_answer)


def _normalise_binary(text: str) -> str:
    """Map raw VLM answer to 'yes', 'no', or the original cleaned text."""
    cleaned = text.strip().lower()
    if re.search(r"\byes\b", cleaned):
        return "yes"
    if re.search(r"\bno\b", cleaned):
        return "no"
    return cleaned[:80]


def _answer_confidence_proxy(text: str, tokens_out: int) -> float:
    """
    Heuristic confidence proxy from observable output features.

    High confidence markers: short decisive answer, clear yes/no.
    Low confidence markers: hedging language, long uncertain response.
    """
    normalised = _normalise_binary(text)
    if normalised in {"yes", "no"}:
        base = 0.82
    else:
        base = 0.45

    hedge_words = {"maybe", "perhaps", "might", "could", "possibly", "i think",
                   "i'm not sure", "uncertain", "unclear", "i cannot", "don't know"}
    if any(hedge in text.lower() for hedge in hedge_words):
        base -= 0.20

    if 1 <= tokens_out <= 10:
        length_bonus = 0.08
    elif tokens_out > 80:
        length_bonus = -0.10
    else:
        length_bonus = 0.0

    return _clip(base + length_bonus)


def _clip(value: float) -> float:
    if math.isnan(value):
        return 0.0
    return max(0.0, min(1.0, value))
