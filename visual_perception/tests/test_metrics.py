"""Tests for metrics, trustworthiness scoring, and statistical analysis."""

from __future__ import annotations

from ..adapters.mitcf_visual_adapter import VisualRunRecord
from ..datasets.base import VisualBenchmarkItem
from ..metrics.visual_metrics import score_visual_record, aggregate_by_condition, _is_correct, _is_hallucinated
from ..metrics.trustworthiness import visual_trustworthiness_scores
from ..statistics.analysis import bootstrap_ci, mcnemar_test, paired_visual_tests


def _make_item(item_id: str, ground_truth: str = "yes") -> VisualBenchmarkItem:
    return VisualBenchmarkItem(
        item_id=item_id, benchmark="POPE", category="random",
        image_path="/fake.jpg", question="Is there a cat?",
        ground_truth=ground_truth,
    )


def _make_record(item_id: str, condition: str, final_answer: str, abstained: bool = False) -> VisualRunRecord:
    return VisualRunRecord(
        item_id=item_id, benchmark="POPE", category="random",
        image_path="/fake.jpg", question="Q?",
        condition=condition, model_id="test",
        initial_answer=final_answer, revised_answer="", final_answer=final_answer,
        normalised_final=final_answer.strip().lower(),
        abstained=abstained,
        gate_action="accept", gate_reason="",
        fuzzy_inputs=None, fuzzy_memberships=None, fuzzy_gate_score=0.8,
        verification_status="supported", verification_score=0.9,
        verification_flagged=False, critique_issues=0, max_severity="none",
        revisions=0, latency_s=1.0, tokens_in=10, tokens_out=5,
    )


def test_is_correct():
    assert _is_correct("yes", "yes")
    assert not _is_correct("yes", "no")
    assert _is_correct("no", "no")
    assert not _is_correct("", "yes")


def test_is_hallucinated():
    assert _is_hallucinated("yes", "no")
    assert not _is_hallucinated("yes", "yes")
    assert not _is_hallucinated("", "yes")


def test_score_record_correct():
    item = _make_item("i1", "yes")
    record = _make_record("i1", "baseline", "yes")
    scored = score_visual_record(item, record)
    assert scored["correct"] == 1
    assert scored["hallucinated"] == 0
    assert scored["abstained"] == 0


def test_score_record_hallucinated():
    item = _make_item("i2", "no")
    record = _make_record("i2", "baseline", "yes")
    scored = score_visual_record(item, record)
    assert scored["correct"] == 0
    assert scored["hallucinated"] == 1


def test_score_record_abstained():
    item = _make_item("i3", "yes")
    record = _make_record("i3", "full_mitcf", "yes", abstained=True)
    scored = score_visual_record(item, record)
    assert scored["abstained"] == 1
    assert scored["correct"] == 0


def test_aggregate_by_condition():
    items = [_make_item(f"i{k}", "yes" if k % 2 == 0 else "no") for k in range(4)]
    records = (
        [_make_record(f"i{k}", "baseline", "yes" if k % 2 == 0 else "no") for k in range(4)] +
        [_make_record(f"i{k}", "full_mitcf", "yes" if k % 2 == 0 else "no") for k in range(4)]
    )
    ti_weights = {"hallucination": 0.35, "bias": 0.10, "robustness": 0.30, "decision": 0.25}
    metrics = aggregate_by_condition(items, records, ti_weights)
    assert len(metrics) == 2
    conditions = {m["condition"] for m in metrics}
    assert "baseline" in conditions
    assert "full_mitcf" in conditions
    for m in metrics:
        assert 0.0 <= m["accuracy"] <= 1.0
        assert "trustworthiness_index" in m


def test_trustworthiness_scores_range():
    row = {"accuracy": 0.7, "hallucination_rate": 0.1, "selective_accuracy": 0.75, "coverage": 0.9}
    ti = visual_trustworthiness_scores(row, {"hallucination": 0.35, "bias": 0.10, "robustness": 0.30, "decision": 0.25})
    assert 0.0 <= ti["trustworthiness_index"] <= 1.0
    assert 0.0 <= ti["ti_hallucination"] <= 1.0


def test_bootstrap_ci_basic():
    values = [0.1, 0.2, 0.3, 0.4, 0.5]
    lo, hi = bootstrap_ci(values, seed=42, samples=500)
    assert lo <= hi
    assert 0.1 <= lo <= hi <= 0.5


def test_mcnemar_test():
    chi2, p = mcnemar_test(20, 5)
    assert chi2 > 0
    assert 0.0 <= p <= 1.0

    chi2_zero, p_zero = mcnemar_test(0, 0)
    assert chi2_zero == 0.0
    assert p_zero == 1.0


def test_paired_visual_tests_no_label_leakage():
    """
    Verify that paired_visual_tests uses score_visual_record (which
    accesses ground truth) but that all VisualRunRecord objects have
    no ground_truth field — leakage prevention check.
    """
    item = _make_item("i0", "yes")
    baseline_rec = _make_record("i0", "baseline", "yes")
    mitcf_rec = _make_record("i0", "full_mitcf", "yes")

    assert not hasattr(baseline_rec, "ground_truth"), \
        "VisualRunRecord must NOT carry a ground_truth field to prevent leakage"

    tests = paired_visual_tests(
        [item], [baseline_rec, mitcf_rec],
        baseline_condition="baseline",
        target_condition="full_mitcf",
        seed=42, bootstrap_samples=100,
    )
    assert isinstance(tests, list)
