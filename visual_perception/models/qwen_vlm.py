"""
Qwen2.5-VL-3B-Instruct adapter for the visual-perception evaluation.

Uses the official Transformers implementation (AutoProcessor + Qwen2_5_VLForConditionalGeneration).
Supports float16 and 4-bit quantisation (bitsandbytes) to fit within 6GB VRAM.
"""

from __future__ import annotations

import logging
import time
from pathlib import Path
from typing import Any, Dict, Optional

from PIL import Image

from .base import VLMOutput
from ..config.settings import ModelConfig

logger = logging.getLogger(__name__)

MODEL_ID = "Qwen/Qwen2.5-VL-3B-Instruct"


def _get_torch_dtype(dtype_str: str):
    import torch
    dtype_map = {
        "float16": torch.float16,
        "bfloat16": torch.bfloat16,
        "float32": torch.float32,
        "auto": "auto",
    }
    return dtype_map.get(dtype_str, torch.float16)


class QwenVLMAdapter:
    """Wraps Qwen2.5-VL-3B-Instruct for image-question inference."""

    def __init__(self, config: Optional[ModelConfig] = None) -> None:
        self.config = config or ModelConfig()
        self.model_id = self.config.model_id
        self.revision = self.config.revision
        self._model = None
        self._processor = None
        self._device = None
        self._loaded = False

    @property
    def is_loaded(self) -> bool:
        return self._loaded

    def load(self) -> None:
        """Load model and processor onto the available device."""
        if self._loaded:
            return
        logger.info("Loading %s ...", self.model_id)
        try:
            import torch
            from transformers import AutoProcessor, Qwen2_5_VLForConditionalGeneration
        except ImportError as exc:
            raise RuntimeError(
                "Cannot load Qwen2.5-VL: required packages are missing. "
                f"Run: pip install transformers torch Pillow\nDetails: {exc}"
            ) from exc

        cache_dir = self.config.cache_dir or None
        torch_dtype = _get_torch_dtype(self.config.torch_dtype)

        load_kwargs: Dict[str, Any] = {
            "revision": self.revision,
            "torch_dtype": torch_dtype,
            "device_map": self.config.device_map,
        }
        if cache_dir:
            load_kwargs["cache_dir"] = cache_dir

        if self.config.load_in_4bit:
            from transformers import BitsAndBytesConfig
            load_kwargs["quantization_config"] = BitsAndBytesConfig(
                load_in_4bit=True,
                bnb_4bit_compute_dtype=torch.float16,
                bnb_4bit_use_double_quant=True,
                bnb_4bit_quant_type="nf4",
            )
            load_kwargs.pop("torch_dtype", None)
            logger.info("Using 4-bit quantisation (bitsandbytes)")
        elif self.config.load_in_8bit:
            from transformers import BitsAndBytesConfig
            load_kwargs["quantization_config"] = BitsAndBytesConfig(load_in_8bit=True)
            load_kwargs.pop("torch_dtype", None)

        self._model = Qwen2_5_VLForConditionalGeneration.from_pretrained(
            self.model_id, **load_kwargs
        )
        self._model.eval()

        self._processor = AutoProcessor.from_pretrained(
            self.model_id,
            revision=self.revision,
            cache_dir=cache_dir,
        )

        if torch.cuda.is_available():
            self._device = "cuda"
        else:
            self._device = "cpu"
            logger.warning("CUDA not available; inference will run on CPU (significantly slower)")

        self._loaded = True
        logger.info("Model loaded. Device: %s", self._device)

    def unload(self) -> None:
        """Release model weights and free GPU memory."""
        if not self._loaded:
            return
        try:
            import torch
            del self._model
            del self._processor
            self._model = None
            self._processor = None
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        except Exception as exc:
            logger.warning("Error during model unload: %s", exc)
        self._loaded = False

    def generate(self, image: Image.Image, question: str, image_path: str = "") -> VLMOutput:
        """Run inference for one image-question pair."""
        if not self._loaded:
            raise RuntimeError("Call load() before generate()")

        import torch

        started = time.perf_counter()
        gpu_mem_before = _gpu_memory_mb()

        try:
            messages = [
                {
                    "role": "user",
                    "content": [
                        {"type": "image", "image": image},
                        {"type": "text", "text": question},
                    ],
                }
            ]

            text_input = self._processor.apply_chat_template(
                messages, tokenize=False, add_generation_prompt=True
            )
            image_inputs, video_inputs = _process_vision_info(messages)

            inputs = self._processor(
                text=[text_input],
                images=image_inputs,
                videos=video_inputs,
                padding=True,
                return_tensors="pt",
            )
            if self._device == "cuda":
                inputs = inputs.to("cuda")

            gen_kwargs: Dict[str, Any] = {
                "max_new_tokens": self.config.max_new_tokens,
                "do_sample": self.config.do_sample,
            }
            if self.config.do_sample and self.config.temperature > 0:
                gen_kwargs["temperature"] = self.config.temperature

            with torch.no_grad():
                if not self.config.do_sample:
                    torch.manual_seed(0)
                output_ids = self._model.generate(**inputs, **gen_kwargs)

            generated_ids_trimmed = [
                out_ids[len(in_ids):]
                for in_ids, out_ids in zip(inputs.input_ids, output_ids)
            ]
            text_out = self._processor.batch_decode(
                generated_ids_trimmed,
                skip_special_tokens=True,
                clean_up_tokenization_spaces=False,
            )[0]

            tokens_in = int(inputs.input_ids.shape[-1])
            tokens_out = int(generated_ids_trimmed[0].shape[-1])
            latency = time.perf_counter() - started
            gpu_mem_used = max(0.0, _gpu_memory_mb() - gpu_mem_before)

            return VLMOutput(
                text=text_out.strip(),
                model_id=self.model_id,
                image_path=image_path,
                question=question,
                latency_s=latency,
                tokens_in=tokens_in,
                tokens_out=tokens_out,
                gpu_memory_mb=gpu_mem_used,
                generation_config={**gen_kwargs, "model_revision": self.revision},
            )

        except Exception as exc:
            latency = time.perf_counter() - started
            logger.error("VLM inference error: %s", exc)
            return VLMOutput(
                text="",
                model_id=self.model_id,
                image_path=image_path,
                question=question,
                latency_s=latency,
                error=str(exc),
            )


def _process_vision_info(messages):
    """Extract image/video content from message list for Qwen2.5-VL processor."""
    try:
        from qwen_vl_utils import process_vision_info
        return process_vision_info(messages)
    except ImportError:
        pass

    image_inputs = []
    video_inputs = []
    for msg in messages:
        content = msg.get("content", [])
        if isinstance(content, str):
            continue
        for item in content:
            if item.get("type") == "image":
                img = item.get("image")
                if img is not None:
                    image_inputs.append(img)
            elif item.get("type") == "video":
                vid = item.get("video")
                if vid is not None:
                    video_inputs.append(vid)
    return image_inputs if image_inputs else None, video_inputs if video_inputs else None


def _gpu_memory_mb() -> float:
    try:
        import torch
        if torch.cuda.is_available():
            return torch.cuda.memory_allocated() / 1024 / 1024
    except Exception:
        pass
    return 0.0
