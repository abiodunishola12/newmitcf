"""
Command-line interface for the MITCF Visual-Perception Evaluation.

Usage:
  python -m visual_perception.cli inspect
  python -m visual_perception.cli download-data [--dataset pope|mme|all] [--images]
  python -m visual_perception.cli validate-data
  python -m visual_perception.cli smoke-test
  python -m visual_perception.cli evaluate
  python -m visual_perception.cli robustness
  python -m visual_perception.cli ablation
  python -m visual_perception.cli report --run-dir <path>
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path


logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("vp.cli")


def cmd_inspect(args: argparse.Namespace) -> int:
    """Print a summary of the existing project and execution environment."""
    from .models.environment import detect_environment
    from .datasets.pope_adapter import POPEAdapter
    from .datasets.mme_adapter import MMEAdapter
    from .config.settings import load_config, default_config

    print("\n=== MITCF Visual-Perception Evaluation — Project Inspection ===\n")

    env = detect_environment()
    print(f"Python:        {env.python_version.splitlines()[0]}")
    print(f"Platform:      {env.platform_str}")
    print(f"PyTorch:       {env.torch_version or 'NOT INSTALLED'}")
    print(f"CUDA:          {'available v' + env.cuda_version if env.cuda_available else 'not available'}")
    print(f"GPU:           {env.device_name or 'N/A'}  ({env.total_vram_mb:.0f} MB VRAM)")
    print(f"Transformers:  {env.transformers_version or 'NOT INSTALLED'}")
    print(f"Pillow:        {env.pil_version or 'NOT INSTALLED'}")
    print(f"numpy:         {env.numpy_version or 'NOT INSTALLED'}")
    if env.warnings:
        print("\nWarnings:")
        for w in env.warnings:
            print(f"  ! {w}")

    config_path = Path(args.config) if args.config else None
    if config_path and config_path.exists():
        config = load_config(config_path)
        print(f"\nConfig loaded: {config_path}")
    else:
        config = default_config()
        print("\nUsing default configuration.")

    print("\n--- Dataset Availability ---")
    pope = POPEAdapter(config.datasets.pope_dir)
    pope_status = pope.check_availability()
    print(f"POPE ({config.datasets.pope_dir}): {'AVAILABLE' if pope_status['available'] else 'NOT FOUND'}")
    if not pope_status["available"] and "message" in pope_status:
        for line in pope_status["message"].splitlines():
            print(f"  {line}")

    mme = MMEAdapter(config.datasets.mme_dir)
    mme_status = mme.check_availability()
    print(f"MME ({config.datasets.mme_dir}): {'AVAILABLE' if mme_status['available'] else 'NOT FOUND'}")
    if not mme_status["available"] and "message" in mme_status:
        for line in mme_status["message"].splitlines():
            print(f"  {line}")

    print("\n--- MITCF Components ---")
    _check_mitcf_components()
    return 0


def cmd_validate_data(args: argparse.Namespace) -> int:
    """Validate that benchmark datasets are correctly structured."""
    from .config.settings import load_config, default_config
    from .datasets.pope_adapter import POPEAdapter
    from .datasets.mme_adapter import MMEAdapter

    config = _load_config(args.config)

    all_ok = True
    for name, adapter_cls, adapter_dir in [
        ("POPE", POPEAdapter, config.datasets.pope_dir),
        ("MME", MMEAdapter, config.datasets.mme_dir),
    ]:
        print(f"\n--- Validating {name} ---")
        if name == "POPE":
            adapter = POPEAdapter(adapter_dir, categories=config.datasets.pope_categories, max_samples=20)
        else:
            adapter = MMEAdapter(adapter_dir, categories=config.datasets.mme_categories, max_samples=20)
        status = adapter.check_availability()
        if not status["available"]:
            print(f"  SKIP: {name} not available at {adapter_dir}")
            continue
        try:
            items = adapter.load()
            result = adapter.validate(items)
            print(f"  Loaded {result['total_items']} items")
            print(f"  Images present: {result['images_present']}")
            print(f"  Images missing: {result['images_missing']}")
            if result["images_missing"] > 0:
                print(f"  Missing: {result['missing_paths'][:3]}")
                all_ok = False
            else:
                print(f"  OK: all images present")
        except FileNotFoundError as exc:
            print(f"  ERROR: {exc}")
            all_ok = False
    return 0 if all_ok else 1


def cmd_smoke_test(args: argparse.Namespace) -> int:
    """Run a real image-grounded smoke test on 1 image if resources are available."""
    from .models.environment import detect_environment, check_vram_sufficient
    from .config.settings import load_config, default_config
    from .datasets.pope_adapter import POPEAdapter

    config = _load_config(args.config)
    env = detect_environment()

    if not env.transformers_version:
        print("ERROR: transformers is not installed. Run: pip install -r visual_perception/requirements.txt")
        return 1

    pope = POPEAdapter(config.datasets.pope_dir, max_samples=1)
    status = pope.check_availability()
    if not status["available"]:
        print("ERROR: POPE dataset not available. Run: python -m visual_perception.cli inspect")
        return 1

    items = pope.load()
    if not items:
        print("ERROR: No POPE items loaded.")
        return 1

    item = items[0]
    if not item.image_exists():
        print(f"ERROR: Image not found: {item.image_path}")
        return 1

    ok, msg = check_vram_sufficient(required_mb=3500.0)
    print(f"VRAM check: {msg}")

    print(f"\nSmoke test: {item.item_id}")
    print(f"Image: {item.image_path}")
    print(f"Question: {item.question}")
    print(f"Ground truth (held out from model): {item.ground_truth}")

    from .models.qwen_vlm import QwenVLMAdapter
    from .adapters.mitcf_visual_adapter import VisualMITCFAdapter
    from .controllers.baseline import run_baseline

    vlm = QwenVLMAdapter(config.model)
    print(f"\nLoading {config.model.model_id} ...")
    try:
        vlm.load()
    except Exception as exc:
        print(f"ERROR loading model: {exc}")
        return 1

    from PIL import Image as PILImage
    image = PILImage.open(item.image_path).convert("RGB")
    adapter = VisualMITCFAdapter(config.experiment.verification_threshold)

    record = run_baseline(item, image, vlm, adapter)
    vlm.unload()

    print(f"\nModel answer: {record.final_answer!r}")
    print(f"Normalised:   {record.normalised_final!r}")
    print(f"Latency:      {record.latency_s:.2f}s")
    print(f"Tokens out:   {record.tokens_out}")
    print("\nSmoke test PASSED: VLM inference working.")
    return 0


def cmd_evaluate(args: argparse.Namespace) -> int:
    """Run the full four-condition evaluation."""
    from .config.settings import load_config, default_config
    from .models.environment import detect_environment
    from .models.qwen_vlm import QwenVLMAdapter
    from .datasets.pope_adapter import POPEAdapter
    from .datasets.mme_adapter import MMEAdapter
    from .adapters.mitcf_visual_adapter import VisualMITCFAdapter
    from .experiments.runner import ExperimentRunner
    from .experiments.manager import RunManager
    from .metrics.visual_metrics import aggregate_by_condition
    from .statistics.analysis import paired_visual_tests
    from .experiments.report import write_report, write_latex_tables
    from .visualisation.figures import generate_all_figures

    config = _load_config(args.config)
    env = detect_environment()

    run_manager = RunManager(config.experiment.output_dir)
    ctx = run_manager.new_run(config, label="evaluate")
    ctx.save_environment(env.to_dict())
    logger.info("Run ID: %s", ctx.run_id)
    print(f"Run directory: {ctx.run_dir}")

    items = _load_all_items(config)
    if not items:
        print("ERROR: No benchmark items loaded. Check dataset paths.")
        return 1
    print(f"Loaded {len(items)} items total.")

    vlm = QwenVLMAdapter(config.model)
    vlm.load()

    runner = ExperimentRunner(config, vlm, run_id=ctx.run_id)
    records = runner.run_conditions(items)
    ctx.save_records(records)

    vlm.unload()

    condition_metrics = aggregate_by_condition(items, records, config.ti_weights)
    ctx.save_csv(condition_metrics, "baseline_results.csv")

    tests = paired_visual_tests(
        items, records,
        seed=config.experiment.seed,
        bootstrap_samples=config.experiment.bootstrap_samples,
        significance_level=config.experiment.significance_level,
    )
    ctx.save_json(tests, "statistical_analysis.json")

    figures = generate_all_figures(ctx.run_dir, condition_metrics, statistical_tests=tests)

    report_path = write_report(ctx.run_dir, {
        "run_id": ctx.run_id,
        "model_id": config.model.model_id,
        "total_items": len(items),
    }, env.to_dict(), condition_metrics, tests)
    write_latex_tables(ctx.run_dir, condition_metrics, tests)

    ctx.mark_status("completed")
    ctx.save_metadata({
        "model_id": config.model.model_id,
        "total_items": len(items),
        "conditions": config.experiment.conditions,
    })

    print(f"\nEvaluation complete.")
    print(f"Report: {report_path}")
    print(f"Figures: {len(figures)} generated")
    return 0


def cmd_robustness(args: argparse.Namespace) -> int:
    """Run the robustness evaluation with image perturbations."""
    from .config.settings import load_config, default_config
    from .models.qwen_vlm import QwenVLMAdapter
    from .experiments.runner import ExperimentRunner
    from .experiments.manager import RunManager
    from .metrics.visual_metrics import aggregate_by_condition

    config = _load_config(args.config)
    items = _load_all_items(config)
    if not items:
        print("ERROR: No benchmark items. Check dataset paths.")
        return 1

    run_manager = RunManager(config.experiment.output_dir)
    ctx = run_manager.new_run(config, label="robustness")
    vlm = QwenVLMAdapter(config.model)
    vlm.load()
    runner = ExperimentRunner(config, vlm, run_id=ctx.run_id)
    rob_records = runner.run_robustness(items[:50])
    vlm.unload()

    ctx.save_records(rob_records, "robustness_results.csv")
    print(f"Robustness evaluation complete: {len(rob_records)} records in {ctx.run_dir}")
    return 0


def cmd_ablation(args: argparse.Namespace) -> int:
    """Run ablation studies."""
    from .config.settings import load_config, default_config
    from .models.qwen_vlm import QwenVLMAdapter
    from .experiments.runner import ExperimentRunner
    from .experiments.manager import RunManager
    from .metrics.visual_metrics import aggregate_by_condition

    config = _load_config(args.config)
    items = _load_all_items(config)
    if not items:
        print("ERROR: No benchmark items. Check dataset paths.")
        return 1

    run_manager = RunManager(config.experiment.output_dir)
    ctx = run_manager.new_run(config, label="ablation")
    vlm = QwenVLMAdapter(config.model)
    vlm.load()
    runner = ExperimentRunner(config, vlm, run_id=ctx.run_id)

    all_ablation_records = []
    for ablation in config.ablation.ablations:
        records = runner.run_ablation(items[:100], ablation)
        all_ablation_records.extend(records)

    vlm.unload()
    ctx.save_records(all_ablation_records, "ablation_results.csv")
    print(f"Ablation complete: {len(all_ablation_records)} records in {ctx.run_dir}")
    return 0


def cmd_report(args: argparse.Namespace) -> int:
    """(Re-)generate the report from existing run results."""
    run_dir = Path(args.run_dir)
    if not run_dir.exists():
        print(f"ERROR: Run directory not found: {run_dir}")
        return 1

    import csv, json
    from .experiments.report import write_report, write_latex_tables

    condition_metrics = _read_csv(run_dir / "baseline_results.csv")
    tests_path = run_dir / "statistical_analysis.json"
    tests = json.loads(tests_path.read_text("utf-8")) if tests_path.exists() else []
    meta_path = run_dir / "run_metadata.json"
    meta = json.loads(meta_path.read_text("utf-8")) if meta_path.exists() else {}
    env_path = run_dir / "environment.json"
    env = json.loads(env_path.read_text("utf-8")) if env_path.exists() else {}

    report_path = write_report(run_dir, meta, env, condition_metrics, tests)
    latex_path = write_latex_tables(run_dir, condition_metrics, tests)
    print(f"Report: {report_path}")
    print(f"LaTeX:  {latex_path}")
    return 0


def _load_config(config_path):
    from .config.settings import load_config, default_config
    if config_path:
        p = Path(config_path)
        if p.exists():
            return load_config(p)
    return default_config()


def _load_all_items(config):
    from .datasets.pope_adapter import POPEAdapter
    from .datasets.mme_adapter import MMEAdapter
    items = []
    pope = POPEAdapter(config.datasets.pope_dir, categories=config.datasets.pope_categories,
                       max_samples=config.datasets.pope_max_samples)
    if pope.check_availability()["available"]:
        items.extend(pope.load())
    mme = MMEAdapter(config.datasets.mme_dir, categories=config.datasets.mme_categories,
                     max_samples=config.datasets.mme_max_samples)
    if mme.check_availability()["available"]:
        items.extend(mme.load())
    return items


def _check_mitcf_components() -> None:
    components = [
        ("mitcf_pipeline.fuzzy_gate", "FuzzyDecisionGate", "Mamdani fuzzy inference engine"),
        ("mitcf_pipeline.controller", "MITCFController", "Main MITCF controller"),
        ("mitcf_pipeline.controls", "VerificationModule", "Verification module"),
        ("mitcf_pipeline.controls", "CritiqueModule", "Critique module"),
        ("mitcf_pipeline.controls", "RevisionModule", "Revision module"),
        ("mitcf_pipeline.controls", "DecisionGate", "Decision gate"),
        ("mitcf_pipeline.detectors", "LexicalHallucinationDetector", "Hallucination detector"),
        ("mitcf_pipeline.evaluation", "trustworthiness_scores", "Trustworthiness scoring"),
        ("mitcf_pipeline.statistics", "paired_metric_tests", "Statistical analysis"),
    ]
    for module, cls_name, desc in components:
        try:
            mod = __import__(module, fromlist=[cls_name])
            getattr(mod, cls_name)
            print(f"  [OK] {desc}")
        except (ImportError, AttributeError) as exc:
            print(f"  [MISSING] {desc}: {exc}")


def cmd_download_data(args: argparse.Namespace) -> int:
    """Download POPE annotations and set up dataset directories.

    POPE annotations are fetched directly from GitHub (MIT Licence).
    COCO val2014 images (6.6 GB) are downloaded only when --images is passed.
    MME requires manual access request — this command creates the directory
    structure and prints the access URL.
    """
    import urllib.request
    import zipfile
    import shutil

    config = _load_config(args.config)
    datasets = ["pope", "mme"] if args.dataset == "all" else [args.dataset]

    ok = True
    if "pope" in datasets:
        ok = _download_pope(config.datasets.pope_dir, download_images=args.images) and ok
    if "mme" in datasets:
        ok = _setup_mme_dirs(config.datasets.mme_dir) and ok

    return 0 if ok else 1


def _download_pope(pope_dir: str, download_images: bool = False) -> bool:
    import urllib.request
    import zipfile

    pope_path = Path(pope_dir)
    ann_dir = pope_path / "annotations"
    img_dir = pope_path / "val2014"
    ann_dir.mkdir(parents=True, exist_ok=True)
    img_dir.mkdir(parents=True, exist_ok=True)
    print(f"\n--- POPE: {pope_path} ---")

    base_url = "https://raw.githubusercontent.com/AoiDragon/POPE/main/output/coco"
    annotation_files = [
        "coco_pope_random.json",
        "coco_pope_popular.json",
        "coco_pope_adversarial.json",
    ]

    all_ok = True
    for fname in annotation_files:
        dest = ann_dir / fname
        if dest.exists():
            print(f"  [SKIP] {fname} already present")
            continue
        url = f"{base_url}/{fname}"
        print(f"  Downloading {fname} ...", end=" ", flush=True)
        try:
            urllib.request.urlretrieve(url, dest)
            print("OK")
        except Exception as exc:
            print(f"FAILED: {exc}")
            all_ok = False

    if download_images:
        zip_path = pope_path / "val2014.zip"
        if img_dir.exists() and any(img_dir.iterdir()):
            print("  [SKIP] val2014/ already populated")
        else:
            coco_url = "http://images.cocodataset.org/zips/val2014.zip"
            print(f"  Downloading val2014.zip (6.6 GB) from {coco_url}")
            print("  This may take a long time depending on your connection ...")
            try:
                urllib.request.urlretrieve(coco_url, zip_path)
                print(f"  Extracting {zip_path} ...")
                with zipfile.ZipFile(zip_path, "r") as zf:
                    zf.extractall(pope_path)
                zip_path.unlink()
                print("  val2014/ extracted OK")
            except Exception as exc:
                print(f"  ERROR downloading/extracting val2014: {exc}")
                all_ok = False
    else:
        print(
            "  NOTE: COCO val2014 images not downloaded (pass --images to include them).\n"
            "  Manual alternative:\n"
            f"    wget http://images.cocodataset.org/zips/val2014.zip\n"
            f"    unzip val2014.zip -d {pope_path}/"
        )

    return all_ok


def _setup_mme_dirs(mme_dir: str) -> bool:
    from .datasets.mme_adapter import MME_ALL_CATEGORIES

    mme_path = Path(mme_dir)
    print(f"\n--- MME: {mme_path} ---")
    print(
        "  MME requires manual access request.\n"
        "  Request dataset access at:\n"
        "    https://github.com/BradyFU/Awesome-Multimodal-Large-Language-Models/tree/Evaluation\n"
        "  After downloading, extract the archive so each category is a subdirectory of:\n"
        f"    {mme_path}/\n"
        "  Expected subdirectories:"
    )
    for cat in MME_ALL_CATEGORIES:
        cat_dir = mme_path / cat
        cat_dir.mkdir(parents=True, exist_ok=True)
        status = "[EXISTS]" if any(cat_dir.iterdir()) else "[CREATED — needs data]"
        print(f"    {status} {cat_dir}")
    return True


def _read_csv(path: Path):
    import csv
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="MITCF Visual-Perception Evaluation CLI",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--config", default="", help="Path to YAML config file.")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("inspect", help="Inspect project and environment.")
    sub.add_parser("validate-data", help="Validate benchmark datasets.")

    dl_p = sub.add_parser("download-data", help="Download POPE annotations and create MME directories.")
    dl_p.add_argument(
        "--dataset", choices=["pope", "mme", "all"], default="all",
        help="Which dataset to set up (default: all).",
    )
    dl_p.add_argument(
        "--images", action="store_true",
        help="Also download COCO val2014 images for POPE (6.6 GB).",
    )

    sub.add_parser("smoke-test", help="Run a 1-image smoke test.")
    sub.add_parser("evaluate", help="Run the full four-condition evaluation.")
    sub.add_parser("robustness", help="Run robustness evaluation with image perturbations.")
    sub.add_parser("ablation", help="Run ablation studies.")

    report_p = sub.add_parser("report", help="Generate report from an existing run.")
    report_p.add_argument("--run-dir", required=True, help="Path to run directory.")

    return parser


def main(argv=None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    dispatch = {
        "inspect": cmd_inspect,
        "validate-data": cmd_validate_data,
        "download-data": cmd_download_data,
        "smoke-test": cmd_smoke_test,
        "evaluate": cmd_evaluate,
        "robustness": cmd_robustness,
        "ablation": cmd_ablation,
        "report": cmd_report,
    }
    fn = dispatch.get(args.command)
    if fn is None:
        parser.print_help()
        return 1
    return fn(args)


if __name__ == "__main__":
    sys.exit(main())
