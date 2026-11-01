"""Wraps the FuzzyDecisionGate for interactive API evaluation."""
from __future__ import annotations

import math
import sys
from pathlib import Path
from typing import Any, Dict, List

# Add project root to path so mitcf_pipeline is importable
PROJECT_ROOT = Path(__file__).parent.parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from mitcf_pipeline.fuzzy_gate import (
    ACTION_CENTROIDS,
    FuzzyDecisionGate,
    FuzzyInputs,
)


def evaluate_fuzzy(
    quality: float,
    safety: float,
    risk: float,
    uncertainty: float,
    efficiency: float,
) -> Dict[str, Any]:
    gate = FuzzyDecisionGate()
    inputs = FuzzyInputs(
        quality=_clip(quality),
        safety=_clip(safety),
        risk=_clip(risk),
        uncertainty=_clip(uncertainty),
        efficiency=_clip(efficiency),
    )
    decision = gate.evaluate(inputs)
    return {
        "action": decision.action,
        "gate_score": decision.gate_score,
        "memberships": decision.memberships,
        "inputs": {
            "quality": inputs.quality,
            "safety": inputs.safety,
            "risk": inputs.risk,
            "uncertainty": inputs.uncertainty,
            "efficiency": inputs.efficiency,
        },
        "centroids": ACTION_CENTROIDS,
    }


def get_membership_curves(mf_type: str = "quality") -> Dict[str, List[Dict[str, float]]]:
    """Return x,y data for the 3 membership functions of the given type."""
    n_points = 200
    xs = [i / (n_points - 1) for i in range(n_points)]

    if mf_type == "quality":
        curves = {
            "low": [{"x": x, "y": _left_shoulder(x, 0.35, 0.55)} for x in xs],
            "medium": [{"x": x, "y": _triangle(x, 0.35, 0.58, 0.80)} for x in xs],
            "high": [{"x": x, "y": _right_shoulder(x, 0.65, 0.85)} for x in xs],
        }
    else:  # risk
        curves = {
            "low": [{"x": x, "y": _left_shoulder(x, 0.15, 0.35)} for x in xs],
            "medium": [{"x": x, "y": _triangle(x, 0.20, 0.45, 0.70)} for x in xs],
            "high": [{"x": x, "y": _right_shoulder(x, 0.55, 0.80)} for x in xs],
        }
    return curves


def get_membership_at_value(value: float, mf_type: str = "quality") -> Dict[str, float]:
    """Return membership degrees for all sets at a given crisp value."""
    v = _clip(value)
    if mf_type == "quality":
        return {
            "low": _left_shoulder(v, 0.35, 0.55),
            "medium": _triangle(v, 0.35, 0.58, 0.80),
            "high": _right_shoulder(v, 0.65, 0.85),
        }
    else:
        return {
            "low": _left_shoulder(v, 0.15, 0.35),
            "medium": _triangle(v, 0.20, 0.45, 0.70),
            "high": _right_shoulder(v, 0.55, 0.80),
        }


def _left_shoulder(value: float, a: float, b: float) -> float:
    if value <= a:
        return 1.0
    if value >= b:
        return 0.0
    return (b - value) / (b - a)


def _right_shoulder(value: float, a: float, b: float) -> float:
    if value <= a:
        return 0.0
    if value >= b:
        return 1.0
    return (value - a) / (b - a)


def _triangle(value: float, a: float, b: float, c: float) -> float:
    if value <= a or value >= c:
        return 0.0
    if value == b:
        return 1.0
    if value < b:
        return (value - a) / (b - a)
    return (c - value) / (c - b)


def _clip(value: float) -> float:
    if math.isnan(value):
        return 0.0
    return max(0.0, min(1.0, value))
