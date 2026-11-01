"""Detect and record the execution environment."""

from __future__ import annotations

import platform
import sys
from dataclasses import asdict, dataclass, field
from typing import Any, Dict, Optional


@dataclass
class EnvironmentInfo:
    python_version: str = ""
    platform_str: str = ""
    torch_version: str = ""
    cuda_available: bool = False
    cuda_version: str = ""
    device_name: str = ""
    total_vram_mb: float = 0.0
    transformers_version: str = ""
    pil_version: str = ""
    numpy_version: str = ""
    warnings: list = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def detect_environment() -> EnvironmentInfo:
    info = EnvironmentInfo(
        python_version=sys.version,
        platform_str=platform.platform(),
    )

    try:
        import torch
        info.torch_version = torch.__version__
        info.cuda_available = torch.cuda.is_available()
        if info.cuda_available:
            info.cuda_version = torch.version.cuda or ""
            info.device_name = torch.cuda.get_device_name(0)
            props = torch.cuda.get_device_properties(0)
            info.total_vram_mb = props.total_memory / 1024 / 1024
        else:
            info.warnings.append("CUDA not available; VLM inference will use CPU (very slow)")
    except ImportError:
        info.warnings.append("PyTorch not installed")

    try:
        import transformers
        info.transformers_version = transformers.__version__
    except ImportError:
        info.warnings.append("transformers not installed")

    try:
        from PIL import Image, __version__ as pil_ver
        info.pil_version = pil_ver
    except ImportError:
        info.warnings.append("Pillow not installed")

    try:
        import numpy as np
        info.numpy_version = np.__version__
    except ImportError:
        info.warnings.append("numpy not installed")

    return info


def check_vram_sufficient(required_mb: float = 3500.0) -> tuple[bool, str]:
    """Check if available VRAM is sufficient for Qwen2.5-VL-3B-Instruct."""
    try:
        import torch
        if not torch.cuda.is_available():
            return False, "CUDA not available; model will run on CPU"
        props = torch.cuda.get_device_properties(0)
        total_mb = props.total_memory / 1024 / 1024
        if total_mb < required_mb:
            return False, (
                f"GPU has {total_mb:.0f}MB VRAM; Qwen2.5-VL-3B-Instruct in float16 needs "
                f"~{required_mb:.0f}MB. Consider load_in_4bit=True (~1800MB)."
            )
        return True, f"GPU has {total_mb:.0f}MB VRAM — sufficient"
    except Exception as exc:
        return False, f"Could not check VRAM: {exc}"
