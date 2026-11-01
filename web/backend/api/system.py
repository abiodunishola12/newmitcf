"""System monitoring API — CPU, RAM, platform info."""
from __future__ import annotations

import platform
import sys
from pathlib import Path
from fastapi import APIRouter
from typing import Any, Dict

import psutil

router = APIRouter(prefix="/api/system", tags=["system"])

PROJECT_ROOT = Path(__file__).parent.parent.parent.parent


@router.get("")
def get_system_stats() -> Dict[str, Any]:
    mem = psutil.virtual_memory()
    disk = psutil.disk_usage(str(PROJECT_ROOT))

    gpu_info = _try_gpu()

    return {
        "cpu": {
            "percent": psutil.cpu_percent(interval=0.1),
            "count_logical": psutil.cpu_count(logical=True),
            "count_physical": psutil.cpu_count(logical=False),
        },
        "memory": {
            "total_gb": round(mem.total / 1e9, 2),
            "used_gb": round(mem.used / 1e9, 2),
            "available_gb": round(mem.available / 1e9, 2),
            "percent": mem.percent,
        },
        "disk": {
            "total_gb": round(disk.total / 1e9, 2),
            "used_gb": round(disk.used / 1e9, 2),
            "free_gb": round(disk.free / 1e9, 2),
            "percent": disk.percent,
        },
        "gpu": gpu_info,
        "platform": {
            "system": platform.system(),
            "version": platform.version(),
            "machine": platform.machine(),
            "processor": platform.processor(),
            "python": sys.version,
        },
        "project": {
            "root": str(PROJECT_ROOT),
            "outputs_count": len(list((PROJECT_ROOT / "outputs").iterdir())) if (PROJECT_ROOT / "outputs").exists() else 0,
        },
    }


def _try_gpu() -> Dict[str, Any]:
    try:
        import pynvml
        pynvml.nvmlInit()
        count = pynvml.nvmlDeviceGetCount()
        devices = []
        for i in range(count):
            handle = pynvml.nvmlDeviceGetHandleByIndex(i)
            name = pynvml.nvmlDeviceGetName(handle)
            mem = pynvml.nvmlDeviceGetMemoryInfo(handle)
            util = pynvml.nvmlDeviceGetUtilizationRates(handle)
            devices.append({
                "index": i,
                "name": name if isinstance(name, str) else name.decode(),
                "memory_total_gb": round(mem.total / 1e9, 2),
                "memory_used_gb": round(mem.used / 1e9, 2),
                "memory_percent": round(mem.used / mem.total * 100, 1),
                "gpu_utilization_percent": util.gpu,
            })
        pynvml.nvmlShutdown()
        return {"available": True, "devices": devices}
    except Exception:
        return {"available": False, "note": "NVIDIA GPU monitoring not available (pynvml not installed or no NVIDIA GPU)"}
