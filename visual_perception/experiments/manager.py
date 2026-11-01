"""Experiment management: unique run IDs, result persistence, status tracking."""

from __future__ import annotations

import csv
import json
import random
import string
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import yaml

from ..adapters.mitcf_visual_adapter import VisualRunRecord
from ..config.settings import VPConfig


class RunManager:
    """Creates and manages experiment run directories."""

    def __init__(self, base_output_dir: str) -> None:
        self.base_output_dir = Path(base_output_dir)

    def new_run(self, config: VPConfig, label: str = "") -> "RunContext":
        run_id = _make_run_id(label)
        run_dir = self.base_output_dir / run_id
        run_dir.mkdir(parents=True, exist_ok=True)
        ctx = RunContext(run_id=run_id, run_dir=run_dir, config=config)
        ctx.save_config()
        return ctx

    def list_runs(self) -> List[Dict[str, Any]]:
        if not self.base_output_dir.exists():
            return []
        runs = []
        for sub in sorted(self.base_output_dir.iterdir()):
            if sub.is_dir():
                meta_file = sub / "run_metadata.json"
                if meta_file.exists():
                    with meta_file.open("r", encoding="utf-8") as handle:
                        meta = json.load(handle)
                    runs.append(meta)
        return runs


class RunContext:
    """Holds state for a single experiment run."""

    def __init__(self, run_id: str, run_dir: Path, config: VPConfig) -> None:
        self.run_id = run_id
        self.run_dir = run_dir
        self.config = config
        self.figures_dir = run_dir / "figures"
        self.figures_dir.mkdir(exist_ok=True)
        self._status = "initialised"

    def save_config(self) -> None:
        config_path = self.run_dir / "configuration.yaml"
        with config_path.open("w", encoding="utf-8") as handle:
            yaml.safe_dump(asdict(self.config), handle, default_flow_style=False, sort_keys=False)

    def save_metadata(self, metadata: Dict[str, Any]) -> None:
        meta = {
            "run_id": self.run_id,
            "run_dir": str(self.run_dir),
            "created_at": datetime.now(tz=timezone.utc).isoformat(),
            "status": self._status,
            **metadata,
        }
        meta_path = self.run_dir / "run_metadata.json"
        with meta_path.open("w", encoding="utf-8") as handle:
            json.dump(meta, handle, indent=2, default=str)

    def save_environment(self, env: Dict[str, Any]) -> None:
        env_path = self.run_dir / "environment.json"
        with env_path.open("w", encoding="utf-8") as handle:
            json.dump(env, handle, indent=2, default=str)

    def save_records(self, records: List[VisualRunRecord], filename: str = "item_level_predictions.csv") -> None:
        if not records:
            return
        path = self.run_dir / filename
        fields = list(asdict(records[0]).keys()) if records else []
        rows = [asdict(r) for r in records]
        _write_csv(path, rows, fields)

    def save_json(self, data: Any, filename: str) -> None:
        path = self.run_dir / filename
        with path.open("w", encoding="utf-8") as handle:
            json.dump(data, handle, indent=2, default=str)

    def save_csv(self, rows: List[Dict[str, Any]], filename: str) -> None:
        if not rows:
            return
        path = self.run_dir / filename
        _write_csv(path, rows, list(rows[0].keys()))

    def mark_status(self, status: str) -> None:
        self._status = status

    def report_path(self) -> Path:
        return self.run_dir / "experiment_report.md"


def _make_run_id(label: str = "") -> str:
    ts = datetime.now(tz=timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    suffix = "".join(random.choices(string.ascii_lowercase, k=4))
    parts = ["vp", ts, suffix]
    if label:
        safe_label = "".join(c if c.isalnum() else "_" for c in label)[:20]
        parts.insert(1, safe_label)
    return "_".join(parts)


def _write_csv(path: Path, rows: List[Dict[str, Any]], fields: List[str]) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)
