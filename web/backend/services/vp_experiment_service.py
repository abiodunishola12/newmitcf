"""Background job runner for visual-perception evaluations."""
from __future__ import annotations

import subprocess
import sys
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

PROJECT_ROOT = Path(__file__).parent.parent.parent.parent


@dataclass
class VPJob:
    job_id: str
    command: str
    status: str = "pending"
    message: str = ""
    started_at: str = ""
    finished_at: str = ""
    error: str = ""
    stdout_tail: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "job_id": self.job_id,
            "command": self.command,
            "status": self.status,
            "message": self.message,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
            "error": self.error,
            "stdout_tail": self.stdout_tail[-30:],
        }


class VPExperimentService:
    def __init__(self) -> None:
        self._jobs: Dict[str, VPJob] = {}
        self._lock = threading.Lock()

    def start_job(self, job_id: str, subcommand: str, extra_args: List[str] | None = None) -> VPJob:
        cmd = [sys.executable, "-m", "visual_perception.cli", subcommand] + (extra_args or [])
        job = VPJob(
            job_id=job_id,
            command=" ".join(cmd[2:]),
            status="running",
            message=f"Running: visual_perception.cli {subcommand}",
            started_at=datetime.now(tz=timezone.utc).isoformat(),
        )
        with self._lock:
            self._jobs[job_id] = job
        thread = threading.Thread(target=self._run, args=(job, cmd), daemon=True)
        thread.start()
        return job

    def _run(self, job: VPJob, cmd: List[str]) -> None:
        try:
            proc = subprocess.Popen(
                cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                text=True, cwd=str(PROJECT_ROOT),
            )
            lines: List[str] = []
            assert proc.stdout is not None
            for line in proc.stdout:
                stripped = line.rstrip()
                lines.append(stripped)
                with self._lock:
                    job.stdout_tail = lines[-50:]
            proc.wait()
            with self._lock:
                if proc.returncode == 0:
                    job.status = "completed"
                    job.message = "Evaluation completed successfully."
                else:
                    job.status = "failed"
                    job.error = f"Exit code {proc.returncode}"
                    job.message = "Evaluation failed — see stdout_tail for details."
                job.finished_at = datetime.now(tz=timezone.utc).isoformat()
        except Exception as exc:
            with self._lock:
                job.status = "failed"
                job.error = str(exc)
                job.finished_at = datetime.now(tz=timezone.utc).isoformat()

    def get_job(self, job_id: str) -> Optional[VPJob]:
        with self._lock:
            return self._jobs.get(job_id)

    def list_jobs(self) -> List[Dict[str, Any]]:
        with self._lock:
            return [j.to_dict() for j in reversed(list(self._jobs.values()))]


vp_experiment_service = VPExperimentService()
