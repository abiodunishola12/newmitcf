"""Base protocol and output dataclass for VLM adapters."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, Optional, Protocol

from PIL import Image


@dataclass
class VLMOutput:
    """Output from a single VLM inference call."""

    text: str
    model_id: str
    image_path: str
    question: str
    latency_s: float = 0.0
    tokens_in: int = 0
    tokens_out: int = 0
    gpu_memory_mb: float = 0.0
    logits: Optional[Any] = None
    generation_config: Dict[str, Any] = field(default_factory=dict)
    error: Optional[str] = None

    @property
    def succeeded(self) -> bool:
        return self.error is None and bool(self.text.strip())

    @property
    def normalised_text(self) -> str:
        return self.text.strip().lower()


class VLMAdapter(Protocol):
    """Protocol that any vision-language model adapter must satisfy."""

    model_id: str
    revision: str

    def generate(self, image: Image.Image, question: str, image_path: str) -> VLMOutput:
        ...

    def load(self) -> None:
        ...

    def unload(self) -> None:
        ...

    @property
    def is_loaded(self) -> bool:
        ...
