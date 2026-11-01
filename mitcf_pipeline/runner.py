from __future__ import annotations

import argparse
import random
from pathlib import Path
from typing import Any, Dict, Optional

from .controller import MITCFController
from .evaluation import (
    aggregate_by_condition,
    aggregate_by_dataset,
    is_hallucinated,
    qualitative_error_sample,
    score_records,
)
from .io_utils import (
    default_output_dir,
    ensure_dir,
    environment_manifest,
    load_jsonl,
    write_csv,
    write_json,
    write_jsonl,
)
from .models import HeuristicModelRunner, PrecomputedResponseModelRunner
from .prompts import PromptBuilder
from .reporting import write_markdown_report
from .schemas import DEFAULT_CONDITIONS, ExperimentConfig, to_plain
from .statistics import paired_metric_tests


def run_experiment(
    config: ExperimentConfig,
    *,
    precomputed_responses: Optional[str] = None,
) -> Dict[str, Any]:
    random.seed(config.seed)
    output_dir = Path(config.output_dir) if config.output_dir else default_output_dir()
    ensure_dir(output_dir)

    all_items = load_jsonl(config.input_path)
    items = _filter_split(all_items, config.split)

    prompt_builder = PromptBuilder(config.prompt_template_version)
    base_model = HeuristicModelRunner(config.model_name)
    model = (
        PrecomputedResponseModelRunner(precomputed_responses, fallback=base_model)
        if precomputed_responses
        else base_model
    )
    controller = MITCFController(config)
    detector_calibration = None
    if config.calibrate_detector:
        detector_calibration = _calibrate_detector(
            controller=controller,
            model=model,
            prompt_builder=prompt_builder,
            all_items=all_items,
            fallback_items=items,
        )

    records = []
    for item in items:
        prompt = prompt_builder.build(item)
        candidate = model.generate(item, prompt, purpose="candidate")
        for condition in DEFAULT_CONDITIONS:
            records.append(
                controller.run_condition(
                    item=item,
                    condition=condition,
                    model=model,
                    prompt=prompt,
                    candidate=candidate,
                )
            )

    records = score_records(items, records)
    condition_metrics = aggregate_by_condition(records, config.ti_weights)
    dataset_metrics = aggregate_by_dataset(records, config.ti_weights)
    statistical_tests = paired_metric_tests(
        records,
        baseline_condition="baseline",
        target_condition="full_mitcf",
        seed=config.seed,
        bootstrap_samples=config.bootstrap_samples,
    )
    qualitative_errors = qualitative_error_sample(records)

    manifest = environment_manifest(config, len(items))
    manifest["conditions"] = [to_plain(condition) for condition in DEFAULT_CONDITIONS]
    manifest["model_adapter"] = model.name
    if detector_calibration:
        manifest["detector_calibration"] = to_plain(detector_calibration)

    write_json(output_dir / "manifest.json", manifest)
    write_jsonl(output_dir / "records.jsonl", records)
    write_csv(output_dir / "metrics_by_condition.csv", condition_metrics)
    write_csv(output_dir / "metrics_by_dataset.csv", dataset_metrics)
    write_csv(output_dir / "statistical_tests.csv", statistical_tests)
    write_jsonl(output_dir / "qualitative_errors.jsonl", qualitative_errors)
    report_path = write_markdown_report(
        output_dir,
        manifest=manifest,
        condition_metrics=condition_metrics,
        dataset_metrics=dataset_metrics,
        statistical_tests=statistical_tests,
    )

    return {
        "output_dir": str(output_dir),
        "report_path": str(report_path),
        "items": len(items),
        "records": len(records),
        "condition_metrics": condition_metrics,
        "dataset_metrics": dataset_metrics,
        "statistical_tests": statistical_tests,
    }


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run the MITCF research-methodology pipeline.")
    parser.add_argument("--input", default="data/sample_benchmark.jsonl", help="Benchmark JSONL input path.")
    parser.add_argument("--output-dir", default="", help="Directory for generated reports and logs.")
    parser.add_argument("--seed", type=int, default=42, help="Random seed for reproducible analysis.")
    parser.add_argument("--split", default="all", help="Split to evaluate: all, train, validation, or test.")
    parser.add_argument("--model-name", default="heuristic-local-model", help="Model identifier for the manifest.")
    parser.add_argument("--revision-attempts", type=int, default=2, help="Maximum MITCF revision attempts per item.")
    parser.add_argument("--verification-threshold", type=float, default=0.70, help="Verification acceptance threshold.")
    parser.add_argument("--bootstrap-samples", type=int, default=1000, help="Bootstrap samples for confidence intervals.")
    parser.add_argument(
        "--calibrate-detector",
        action="store_true",
        help="Tune hallucination-detector threshold using train/validation examples when available.",
    )
    parser.add_argument(
        "--precomputed-responses",
        default="",
        help="Optional JSONL file with item_id, purpose, and response/text fields.",
    )
    parser.add_argument(
        "--no-label-verification",
        action="store_true",
        help="Disable benchmark-label access inside the verification module.",
    )
    return parser


def config_from_args(args: argparse.Namespace) -> ExperimentConfig:
    return ExperimentConfig(
        input_path=args.input,
        output_dir=args.output_dir,
        seed=args.seed,
        max_revision_attempts=args.revision_attempts,
        verification_threshold=args.verification_threshold,
        model_name=args.model_name,
        split=args.split,
        bootstrap_samples=args.bootstrap_samples,
        calibrate_detector=args.calibrate_detector,
        use_label_for_verification=not args.no_label_verification,
    )


def main(argv: Optional[list[str]] = None) -> int:
    parser = build_arg_parser()
    args = parser.parse_args(argv)
    result = run_experiment(
        config_from_args(args),
        precomputed_responses=args.precomputed_responses or None,
    )
    print(f"MITCF run complete: {result['items']} items, {result['records']} records")
    print(f"Output directory: {result['output_dir']}")
    print(f"Report: {result['report_path']}")
    return 0


def _filter_split(items, split: str):
    requested = str(split or "all").lower()
    if requested == "all":
        return items
    aliases = {"val": "validation"}
    requested = aliases.get(requested, requested)
    filtered = [
        item
        for item in items
        if aliases.get(str(item.metadata.get("split", "")).lower(), str(item.metadata.get("split", "")).lower())
        == requested
    ]
    if not filtered:
        raise ValueError(f"No benchmark items found for split '{split}'")
    return filtered


def _calibrate_detector(*, controller, model, prompt_builder, all_items, fallback_items):
    calibration_items = [
        item
        for item in all_items
        if str(item.metadata.get("split", "")).lower() in {"train", "validation", "val"}
    ]
    if not calibration_items:
        calibration_items = list(fallback_items)

    examples = []
    for item in calibration_items:
        prompt = prompt_builder.build(item)
        candidate = model.generate(item, prompt, purpose="candidate")
        examples.append((item, candidate.text, is_hallucinated(item, candidate.text)))
    return controller.verifier.detector.calibrate(examples)
