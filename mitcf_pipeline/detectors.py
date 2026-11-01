from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, List, Sequence, Tuple

from .schemas import BenchmarkItem
from .text_utils import contains_any, is_escalation, is_refusal, label_matches_output, normalize_text


@dataclass
class DetectorCalibration:
    threshold: float
    precision: float
    recall: float
    f1: float
    auc: float
    n_examples: int


class LexicalHallucinationDetector:
    """Calibratable detector used as a transparent local verification signal."""

    def __init__(self, threshold: float = 0.70) -> None:
        self.threshold = threshold
        self.calibration: DetectorCalibration | None = None

    def score(self, item: BenchmarkItem, response: str) -> float:
        if item.metadata.get("unsafe") is True or is_refusal(response) or is_escalation(response):
            return 0.0
        if contains_any(response, item.metadata.get("unsupported_terms", [])):
            return 1.0
        if item.task_type in {"hallucination", "verification"} and item.label and not label_matches_output(item, response):
            return 0.85
        if item.task_type in {"hallucination", "verification"} and item.context:
            return 0.65 if not _context_overlap(item.context, response) else 0.10
        return 0.0

    def predict(self, item: BenchmarkItem, response: str) -> bool:
        return self.score(item, response) >= self.threshold

    def calibrate(
        self,
        examples: Sequence[Tuple[BenchmarkItem, str, bool]],
        *,
        thresholds: Iterable[float] = (0.10, 0.25, 0.50, 0.65, 0.70, 0.85, 0.95),
    ) -> DetectorCalibration:
        if not examples:
            self.calibration = DetectorCalibration(self.threshold, 0.0, 0.0, 0.0, 0.0, 0)
            return self.calibration

        scores = [(self.score(item, response), truth) for item, response, truth in examples]
        best = None
        for threshold in thresholds:
            metrics = _binary_metrics(scores, threshold)
            if best is None or metrics["f1"] > best["f1"]:
                best = {"threshold": threshold, **metrics}

        assert best is not None
        self.threshold = float(best["threshold"])
        self.calibration = DetectorCalibration(
            threshold=self.threshold,
            precision=best["precision"],
            recall=best["recall"],
            f1=best["f1"],
            auc=_auc(scores),
            n_examples=len(examples),
        )
        return self.calibration


def _binary_metrics(scores: Sequence[Tuple[float, bool]], threshold: float):
    tp = fp = tn = fn = 0
    for score, truth in scores:
        predicted = score >= threshold
        if predicted and truth:
            tp += 1
        elif predicted and not truth:
            fp += 1
        elif not predicted and truth:
            fn += 1
        else:
            tn += 1
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return {"precision": precision, "recall": recall, "f1": f1, "tp": tp, "fp": fp, "tn": tn, "fn": fn}


def _auc(scores: Sequence[Tuple[float, bool]]) -> float:
    positives = [score for score, truth in scores if truth]
    negatives = [score for score, truth in scores if not truth]
    if not positives or not negatives:
        return 0.0
    wins = 0.0
    total = len(positives) * len(negatives)
    for pos in positives:
        for neg in negatives:
            if pos > neg:
                wins += 1
            elif pos == neg:
                wins += 0.5
    return wins / total


def _context_overlap(context: str, response: str) -> bool:
    context_terms = {term for term in normalize_text(context).split() if len(term) > 3}
    response_terms = [term for term in normalize_text(response).split() if len(term) > 3]
    if not response_terms:
        return False
    return sum(1 for term in response_terms if term in context_terms) / len(response_terms) >= 0.35
