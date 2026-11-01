from __future__ import annotations

from dataclasses import asdict, dataclass, field, is_dataclass
from enum import Enum
from typing import Any, Dict, List, Optional


class TaskType(str, Enum):
    HALLUCINATION = "hallucination"
    BIAS = "bias"
    ROBUSTNESS = "robustness"
    REASONING = "reasoning"
    VERIFICATION = "verification"


class GateAction(str, Enum):
    ACCEPT = "accept"
    REVISE = "revise"
    REFUSE = "refuse"
    ESCALATE = "escalate"


class Severity(str, Enum):
    NONE = "none"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


SEVERITY_SCORE = {
    Severity.NONE.value: 0,
    Severity.LOW.value: 1,
    Severity.MEDIUM.value: 2,
    Severity.HIGH.value: 3,
}


@dataclass(frozen=True)
class ConditionConfig:
    name: str
    verification: bool = False
    critique: bool = False
    revision: bool = False
    decision_gate: bool = False


DEFAULT_CONDITIONS: List[ConditionConfig] = [
    ConditionConfig("baseline"),
    ConditionConfig("mitcf_1_verification", verification=True),
    ConditionConfig("mitcf_2_verification_critique", verification=True, critique=True),
    ConditionConfig(
        "mitcf_3_verification_critique_revision",
        verification=True,
        critique=True,
        revision=True,
    ),
    ConditionConfig(
        "full_mitcf",
        verification=True,
        critique=True,
        revision=True,
        decision_gate=True,
    ),
]


@dataclass
class ExperimentConfig:
    input_path: str = "data/sample_benchmark.jsonl"
    output_dir: str = ""
    seed: int = 42
    max_revision_attempts: int = 2
    verification_threshold: float = 0.70
    high_risk_threshold: str = Severity.HIGH.value
    model_name: str = "heuristic-local-model"
    prompt_template_version: str = "v1"
    split: str = "all"
    bootstrap_samples: int = 1000
    calibrate_detector: bool = False
    use_label_for_verification: bool = True
    ti_weights: Dict[str, float] = field(
        default_factory=lambda: {
            "hallucination": 0.25,
            "bias": 0.25,
            "robustness": 0.25,
            "decision": 0.25,
        }
    )


@dataclass
class BenchmarkItem:
    id: str
    dataset: str
    task_type: str
    prompt: str
    label: str = ""
    context: str = ""
    choices: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_mapping(cls, row: Dict[str, Any]) -> "BenchmarkItem":
        missing = [key for key in ("id", "dataset", "task_type", "prompt") if not row.get(key)]
        if missing:
            raise ValueError(f"Benchmark item is missing required field(s): {', '.join(missing)}")

        choices = row.get("choices") or []
        if isinstance(choices, dict):
            choices = [f"{key}. {value}" for key, value in choices.items()]
        if not isinstance(choices, list):
            raise ValueError(f"Item {row.get('id')} has invalid choices; expected list or mapping")

        return cls(
            id=str(row["id"]).strip(),
            dataset=str(row["dataset"]).strip(),
            task_type=str(row["task_type"]).strip(),
            prompt=_clean_text(row["prompt"]),
            label=_clean_text(row.get("label", "")),
            context=_clean_text(row.get("context", "")),
            choices=[_clean_text(str(choice)) for choice in choices],
            metadata=dict(row.get("metadata") or {}),
        )


@dataclass
class ModelOutput:
    text: str
    model_name: str
    purpose: str
    latency_s: float = 0.0
    tokens_in: int = 0
    tokens_out: int = 0


@dataclass
class VerificationResult:
    enabled: bool
    status: str
    score: float
    supported_claims: int = 0
    refuted_claims: int = 0
    insufficient_claims: int = 0
    flagged: bool = False
    reasons: List[str] = field(default_factory=list)


@dataclass
class CritiqueIssue:
    issue_type: str
    severity: str
    span: str
    action: str
    reason: str


@dataclass
class CritiqueResult:
    enabled: bool
    issues: List[CritiqueIssue] = field(default_factory=list)

    @property
    def max_severity(self) -> str:
        if not self.issues:
            return Severity.NONE.value
        return max(self.issues, key=lambda issue: SEVERITY_SCORE.get(issue.severity, 0)).severity


@dataclass
class GateResult:
    enabled: bool
    action: str
    reason: str


@dataclass
class RunRecord:
    run_id: str
    item_id: str
    dataset: str
    task_type: str
    condition: str
    model_name: str
    prompt: str
    candidate_output: str
    final_output: str
    verification_results: List[VerificationResult] = field(default_factory=list)
    critique_results: List[CritiqueResult] = field(default_factory=list)
    gate_result: GateResult = field(default_factory=lambda: GateResult(False, GateAction.ACCEPT.value, "not enabled"))
    revisions: List[str] = field(default_factory=list)
    metrics: Dict[str, Any] = field(default_factory=dict)
    timing: Dict[str, float] = field(default_factory=dict)
    token_usage: Dict[str, int] = field(default_factory=dict)
    model_calls: int = 0
    verification_calls: int = 0
    critique_calls: int = 0
    error: Optional[str] = None


def to_plain(value: Any) -> Any:
    if is_dataclass(value):
        return {key: to_plain(val) for key, val in asdict(value).items()}
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, dict):
        return {str(key): to_plain(val) for key, val in value.items()}
    if isinstance(value, list):
        return [to_plain(item) for item in value]
    return value


def _clean_text(value: Any) -> str:
    text = "" if value is None else str(value)
    return " ".join(text.replace("\r", "\n").split())
