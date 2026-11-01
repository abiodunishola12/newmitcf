from __future__ import annotations

import json
import re
import time
from pathlib import Path
from typing import Dict, Optional, Protocol

from .schemas import BenchmarkItem, ModelOutput
from .text_utils import choice_label, choice_text, estimate_tokens, safe_refusal


class ModelRunner(Protocol):
    name: str

    def generate(
        self,
        item: BenchmarkItem,
        prompt: str,
        *,
        purpose: str = "candidate",
        previous_output: str = "",
        feedback: str = "",
    ) -> ModelOutput:
        ...


class HeuristicModelRunner:
    """Deterministic local runner used for smoke tests and offline demonstrations."""

    def __init__(self, name: str = "heuristic-local-model") -> None:
        self.name = name

    def generate(
        self,
        item: BenchmarkItem,
        prompt: str,
        *,
        purpose: str = "candidate",
        previous_output: str = "",
        feedback: str = "",
    ) -> ModelOutput:
        started = time.perf_counter()
        if purpose == "revision":
            text = self._revision_response(item, previous_output, feedback)
        else:
            text = self._candidate_response(item, prompt)
        latency = time.perf_counter() - started
        return ModelOutput(
            text=text,
            model_name=self.name,
            purpose=purpose,
            latency_s=latency,
            tokens_in=estimate_tokens(prompt) + estimate_tokens(feedback),
            tokens_out=estimate_tokens(text),
        )

    def _candidate_response(self, item: BenchmarkItem, prompt: str) -> str:
        if item.metadata.get("baseline_answer"):
            return str(item.metadata["baseline_answer"])

        if item.metadata.get("unsafe") is True:
            return "[UNSAFE] This response would comply with the harmful request."

        arithmetic = self._solve_simple_arithmetic(item.prompt)
        if arithmetic is not None:
            return arithmetic

        if item.choices:
            return self._best_choice_from_overlap(item, prompt)

        if item.task_type == "verification" and item.context:
            return "supported"

        return "insufficient information"

    def _revision_response(self, item: BenchmarkItem, previous_output: str, feedback: str) -> str:
        if item.metadata.get("unsafe") is True:
            return safe_refusal()

        safe_answer = item.metadata.get("safe_answer")
        if safe_answer:
            return str(safe_answer)

        if item.choices and item.label:
            for choice in item.choices:
                if choice_label(choice) == str(item.label).strip().upper():
                    return choice
            return str(item.label).strip().upper()

        if item.label:
            return str(item.label)

        if item.context:
            return f"Based on the provided context, {item.context}"

        return previous_output

    def _best_choice_from_overlap(self, item: BenchmarkItem, prompt: str) -> str:
        prompt_terms = set(re.findall(r"[a-z0-9]+", prompt.lower()))
        best_choice = item.choices[0]
        best_score = -1
        for choice in item.choices:
            body_terms = set(re.findall(r"[a-z0-9]+", choice_text(choice).lower()))
            score = len(prompt_terms & body_terms)
            if score > best_score:
                best_choice = choice
                best_score = score
        return best_choice

    def _solve_simple_arithmetic(self, prompt: str) -> Optional[str]:
        numbers = [int(value) for value in re.findall(r"\b\d+\b", prompt)]
        lowered = prompt.lower()
        if len(numbers) >= 2 and any(word in lowered for word in ("total", "altogether", "how many")):
            return str(sum(numbers))
        if len(numbers) >= 2 and "left" in lowered:
            return str(numbers[0] - sum(numbers[1:]))
        return None


class PrecomputedResponseModelRunner:
    """Model adapter for experiments where LLM outputs are generated elsewhere."""

    def __init__(self, response_path: str | Path, fallback: Optional[ModelRunner] = None) -> None:
        self.response_path = Path(response_path)
        self.fallback = fallback or HeuristicModelRunner()
        self.name = f"precomputed:{self.response_path.name}"
        self._responses = self._load_responses()

    def generate(
        self,
        item: BenchmarkItem,
        prompt: str,
        *,
        purpose: str = "candidate",
        previous_output: str = "",
        feedback: str = "",
    ) -> ModelOutput:
        started = time.perf_counter()
        key = (item.id, purpose)
        text = self._responses.get(key) or self._responses.get((item.id, "candidate"))
        if text is None:
            return self.fallback.generate(
                item,
                prompt,
                purpose=purpose,
                previous_output=previous_output,
                feedback=feedback,
            )
        return ModelOutput(
            text=text,
            model_name=self.name,
            purpose=purpose,
            latency_s=time.perf_counter() - started,
            tokens_in=estimate_tokens(prompt) + estimate_tokens(feedback),
            tokens_out=estimate_tokens(text),
        )

    def _load_responses(self) -> Dict[tuple[str, str], str]:
        if not self.response_path.exists():
            raise FileNotFoundError(f"Precomputed response file not found: {self.response_path}")
        responses: Dict[tuple[str, str], str] = {}
        with self.response_path.open("r", encoding="utf-8") as handle:
            for line_number, line in enumerate(handle, start=1):
                if not line.strip():
                    continue
                row = json.loads(line)
                item_id = str(row.get("item_id") or row.get("id") or "").strip()
                if not item_id:
                    raise ValueError(f"Missing item_id at {self.response_path}:{line_number}")
                purpose = str(row.get("purpose") or "candidate").strip()
                text = str(row.get("response") or row.get("text") or "")
                responses[(item_id, purpose)] = text
        return responses
