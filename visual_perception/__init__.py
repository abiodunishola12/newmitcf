"""
Visual Perception Evaluation Package for MITCF.

Implements a scientifically rigorous evaluation of Qwen2.5-VL-3B-Instruct
under four experimental conditions using POPE and MME benchmarks, with
full integration of the existing MITCF fuzzy inference engine and
trustworthiness scoring modules.
"""

__version__ = "1.0.0"
__benchmark_targets__ = ["POPE", "MME"]
__model_target__ = "Qwen/Qwen2.5-VL-3B-Instruct"
