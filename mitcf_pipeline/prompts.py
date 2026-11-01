from __future__ import annotations

from .schemas import BenchmarkItem


class PromptBuilder:
    def __init__(self, template_version: str = "v1") -> None:
        self.template_version = template_version

    def build(self, item: BenchmarkItem) -> str:
        parts = [f"Task type: {item.task_type}", "Instruction:", item.prompt]
        if item.context:
            parts.extend(["Context:", item.context])
        if item.choices:
            parts.append("Choices:")
            parts.extend(item.choices)
            parts.append("Return only the best option label and a brief answer.")
        else:
            parts.append("Return a concise answer.")
        return "\n".join(parts)
