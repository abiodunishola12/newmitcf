"""Fuzzy inference API."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Any, Dict, List

from services.data_service import (
    get_fuzzy_gate_results,
    get_fuzzy_action_distribution,
    get_fuzzy_action_memberships,
    get_fuzzy_gate_manifest,
)
from services.fuzzy_service import (
    evaluate_fuzzy,
    get_membership_curves,
    get_membership_at_value,
)

router = APIRouter(prefix="/api/fuzzy", tags=["fuzzy"])


@router.get("/gate-results")
def gate_results() -> List[Dict[str, Any]]:
    rows = get_fuzzy_gate_results()
    result = []
    for r in rows:
        result.append({
            "rank": r.get("rank", ""),
            "algorithm": r.get("algorithm", ""),
            "test_accuracy": float(r.get("test_accuracy", 0)),
            "test_f1": float(r.get("test_f1", 0)),
            "test_auc": float(r.get("test_auc", 0)),
            "test_log_loss": float(r.get("test_log_loss", 0)),
            "parameters": int(float(r.get("parameters", 0))),
            "fuzzy_quality": float(r.get("fuzzy_quality", 0)),
            "fuzzy_safety": float(r.get("fuzzy_safety", 0)),
            "fuzzy_risk": float(r.get("fuzzy_risk", 0)),
            "fuzzy_uncertainty": float(r.get("fuzzy_uncertainty", 0)),
            "fuzzy_efficiency": float(r.get("fuzzy_efficiency", 0)),
            "accept_membership": float(r.get("accept_membership", 0)),
            "verify_membership": float(r.get("verify_membership", 0)),
            "revise_membership": float(r.get("revise_membership", 0)),
            "escalate_membership": float(r.get("escalate_membership", 0)),
            "refuse_membership": float(r.get("refuse_membership", 0)),
            "fuzzy_gate_score": float(r.get("fuzzy_gate_score", 0)),
            "decision_action": r.get("decision_action", ""),
            "fuzzy_rank": r.get("fuzzy_rank", ""),
        })
    return result


@router.get("/action-distribution")
def action_distribution() -> List[Dict[str, Any]]:
    rows = get_fuzzy_action_distribution()
    return [
        {
            "decision_action": r.get("decision_action", ""),
            "count": int(float(r.get("count", 0))),
            "proportion": float(r.get("proportion", 0)),
        }
        for r in rows
    ]


@router.get("/memberships")
def action_memberships() -> List[Dict[str, Any]]:
    return get_fuzzy_action_memberships()


@router.get("/manifest")
def fuzzy_manifest() -> Dict[str, Any]:
    return get_fuzzy_gate_manifest()


@router.get("/membership-curves/{mf_type}")
def membership_curves(mf_type: str) -> Dict[str, Any]:
    if mf_type not in ("quality", "risk"):
        raise HTTPException(400, "mf_type must be 'quality' or 'risk'")
    return {
        "type": mf_type,
        "description": "quality/safety/efficiency" if mf_type == "quality" else "risk/uncertainty",
        "curves": get_membership_curves(mf_type),
    }


@router.get("/membership-at/{mf_type}/{value}")
def membership_at_value(mf_type: str, value: float) -> Dict[str, Any]:
    if mf_type not in ("quality", "risk"):
        raise HTTPException(400, "mf_type must be 'quality' or 'risk'")
    return {
        "type": mf_type,
        "input_value": value,
        "memberships": get_membership_at_value(value, mf_type),
    }


class FuzzyEvalRequest(BaseModel):
    quality: float = Field(ge=0.0, le=1.0)
    safety: float = Field(ge=0.0, le=1.0)
    risk: float = Field(ge=0.0, le=1.0)
    uncertainty: float = Field(ge=0.0, le=1.0)
    efficiency: float = Field(ge=0.0, le=1.0)


@router.post("/evaluate")
def evaluate(req: FuzzyEvalRequest) -> Dict[str, Any]:
    return evaluate_fuzzy(
        quality=req.quality,
        safety=req.safety,
        risk=req.risk,
        uncertainty=req.uncertainty,
        efficiency=req.efficiency,
    )
