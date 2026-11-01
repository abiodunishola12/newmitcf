"""Background experiment execution service."""
from __future__ import annotations

import sys
import threading
import time
from pathlib import Path
from typing import Any, Callable, Dict, Optional

PROJECT_ROOT = Path(__file__).parent.parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


class ExperimentJob:
    def __init__(self, job_id: str) -> None:
        self.job_id = job_id
        self.status = "pending"
        self.progress = 0
        self.message = ""
        self.result: Optional[Dict[str, Any]] = None
        self.error: Optional[str] = None
        self.started_at: Optional[float] = None
        self.finished_at: Optional[float] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "job_id": self.job_id,
            "status": self.status,
            "progress": self.progress,
            "message": self.message,
            "result": self.result,
            "error": self.error,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
            "duration_s": (self.finished_at - self.started_at) if (self.finished_at and self.started_at) else None,
        }


class ExperimentService:
    def __init__(self) -> None:
        self._jobs: Dict[str, ExperimentJob] = {}
        self._lock = threading.Lock()

    def start_experiment(
        self,
        job_id: str,
        config_dict: Dict[str, Any],
        on_update: Optional[Callable[[ExperimentJob], None]] = None,
    ) -> ExperimentJob:
        job = ExperimentJob(job_id)
        with self._lock:
            self._jobs[job_id] = job
        thread = threading.Thread(
            target=self._run_experiment,
            args=(job, config_dict, on_update),
            daemon=True,
        )
        thread.start()
        return job

    def get_job(self, job_id: str) -> Optional[ExperimentJob]:
        with self._lock:
            return self._jobs.get(job_id)

    def list_jobs(self) -> list[Dict[str, Any]]:
        with self._lock:
            return [job.to_dict() for job in self._jobs.values()]

    def _run_experiment(
        self,
        job: ExperimentJob,
        config_dict: Dict[str, Any],
        on_update: Optional[Callable[[ExperimentJob], None]],
    ) -> None:
        job.status = "running"
        job.started_at = time.time()
        job.message = "Importing pipeline..."
        if on_update:
            on_update(job)

        try:
            from mitcf_pipeline.runner import run_experiment
            from mitcf_pipeline.schemas import ExperimentConfig

            job.progress = 10
            job.message = "Loading benchmark data..."
            if on_update:
                on_update(job)

            config = ExperimentConfig(
                input_path=str(PROJECT_ROOT / config_dict.get("input_path", "data/sample_benchmark.jsonl")),
                output_dir=config_dict.get("output_dir", ""),
                seed=int(config_dict.get("seed", 42)),
                max_revision_attempts=int(config_dict.get("max_revision_attempts", 2)),
                verification_threshold=float(config_dict.get("verification_threshold", 0.70)),
                model_name=str(config_dict.get("model_name", "heuristic-local-model")),
                split=str(config_dict.get("split", "all")),
                bootstrap_samples=int(config_dict.get("bootstrap_samples", 200)),
                calibrate_detector=bool(config_dict.get("calibrate_detector", False)),
                use_label_for_verification=bool(config_dict.get("use_label_for_verification", True)),
            )

            job.progress = 20
            job.message = "Running MITCF pipeline..."
            if on_update:
                on_update(job)

            result = run_experiment(config)

            job.progress = 100
            job.status = "completed"
            job.message = "Experiment completed successfully."
            job.result = {
                "output_dir": result["output_dir"],
                "report_path": result["report_path"],
                "items": result["items"],
                "records": result["records"],
            }
        except Exception as exc:
            job.status = "failed"
            job.error = str(exc)
            job.message = f"Experiment failed: {exc}"

        job.finished_at = time.time()
        if on_update:
            on_update(job)


class TrainingService:
    def __init__(self) -> None:
        self._jobs: Dict[str, ExperimentJob] = {}
        self._lock = threading.Lock()

    def start_training(
        self,
        job_id: str,
        config_dict: Dict[str, Any],
        on_update: Optional[Callable[[ExperimentJob], None]] = None,
    ) -> ExperimentJob:
        job = ExperimentJob(job_id)
        with self._lock:
            self._jobs[job_id] = job
        thread = threading.Thread(
            target=self._run_training,
            args=(job, config_dict, on_update),
            daemon=True,
        )
        thread.start()
        return job

    def get_job(self, job_id: str) -> Optional[ExperimentJob]:
        with self._lock:
            return self._jobs.get(job_id)

    def _run_training(
        self,
        job: ExperimentJob,
        config_dict: Dict[str, Any],
        on_update: Optional[Callable[[ExperimentJob], None]],
    ) -> None:
        job.status = "running"
        job.started_at = time.time()
        job.message = "Starting neural network training..."
        if on_update:
            on_update(job)

        try:
            from mitcf_pipeline.deep_training import train_twenty_algorithms

            job.progress = 10
            job.message = "Training 20 neural model variants..."
            if on_update:
                on_update(job)

            result = train_twenty_algorithms(
                input_path=str(PROJECT_ROOT / config_dict.get("input_path", "data/sample_benchmark.jsonl")),
                graph_dir=str(PROJECT_ROOT / config_dict.get("graph_dir", "graph")),
                seed=int(config_dict.get("seed", 42)),
                feature_dimensions=int(config_dict.get("feature_dimensions", 64)),
            )

            job.progress = 100
            job.status = "completed"
            job.message = "Training completed successfully."
            job.result = result
        except Exception as exc:
            job.status = "failed"
            job.error = str(exc)
            job.message = f"Training failed: {exc}"

        job.finished_at = time.time()
        if on_update:
            on_update(job)


# Singletons
experiment_service = ExperimentService()
training_service = TrainingService()
