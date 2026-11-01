from __future__ import annotations

import hashlib
import time
from typing import List

from .controls import (
    CritiqueModule,
    DecisionGate,
    RevisionModule,
    VerificationModule,
    final_text_for_gate_action,
    should_revise,
)
from .models import ModelOutput, ModelRunner
from .schemas import (
    BenchmarkItem,
    ConditionConfig,
    CritiqueResult,
    ExperimentConfig,
    GateResult,
    RunRecord,
    VerificationResult,
)


class MITCFController:
    def __init__(self, config: ExperimentConfig) -> None:
        self.config = config
        self.verifier = VerificationModule(
            threshold=config.verification_threshold,
            use_label=config.use_label_for_verification,
        )
        self.critiquer = CritiqueModule()
        self.reviser = RevisionModule()
        self.gate = DecisionGate(threshold=config.verification_threshold)

    def run_condition(
        self,
        *,
        item: BenchmarkItem,
        condition: ConditionConfig,
        model: ModelRunner,
        prompt: str,
        candidate: ModelOutput,
    ) -> RunRecord:
        started = time.perf_counter()
        current_text = candidate.text
        revisions: List[str] = []
        verification_results: List[VerificationResult] = []
        critique_results: List[CritiqueResult] = []
        model_calls = 1
        token_usage = {
            "tokens_in": candidate.tokens_in,
            "tokens_out": candidate.tokens_out,
            "tokens_total": candidate.tokens_in + candidate.tokens_out,
        }
        model_latency = candidate.latency_s

        verification = self.verifier.verify(item, current_text, enabled=condition.verification)
        critique = self.critiquer.critique(
            item,
            current_text,
            verification=verification,
            enabled=condition.critique,
        )
        verification_results.append(verification)
        critique_results.append(critique)

        while (
            condition.revision
            and should_revise(verification, critique)
            and len(revisions) < self.config.max_revision_attempts
        ):
            revision = self.reviser.revise(
                model,
                item,
                prompt,
                current_text,
                verification,
                critique,
            )
            model_calls += 1
            model_latency += revision.latency_s
            token_usage["tokens_in"] += revision.tokens_in
            token_usage["tokens_out"] += revision.tokens_out
            token_usage["tokens_total"] += revision.tokens_in + revision.tokens_out
            current_text = revision.text
            revisions.append(current_text)

            verification = self.verifier.verify(item, current_text, enabled=condition.verification)
            critique = self.critiquer.critique(
                item,
                current_text,
                verification=verification,
                enabled=condition.critique,
            )
            verification_results.append(verification)
            critique_results.append(critique)

        gate_result = self.gate.decide(
            item,
            current_text,
            verification,
            critique,
            revisions_used=len(revisions),
            max_revisions=self.config.max_revision_attempts,
            enabled=condition.decision_gate,
        )
        final_output = final_text_for_gate_action(gate_result.action, gate_result.reason, current_text)
        elapsed = time.perf_counter() - started

        return RunRecord(
            run_id=_run_id(item.id, condition.name, candidate.text),
            item_id=item.id,
            dataset=item.dataset,
            task_type=item.task_type,
            condition=condition.name,
            model_name=model.name,
            prompt=prompt,
            candidate_output=candidate.text,
            final_output=final_output,
            verification_results=verification_results,
            critique_results=critique_results,
            gate_result=gate_result,
            revisions=revisions,
            timing={
                "candidate_latency_s": candidate.latency_s,
                "model_latency_s": model_latency,
                "pipeline_latency_s": elapsed,
            },
            token_usage=token_usage,
            model_calls=model_calls,
            verification_calls=sum(1 for result in verification_results if result.enabled),
            critique_calls=sum(1 for result in critique_results if result.enabled),
        )


def _run_id(item_id: str, condition: str, candidate_text: str) -> str:
    digest = hashlib.sha1(f"{item_id}:{condition}:{candidate_text}".encode("utf-8")).hexdigest()
    return digest[:16]
