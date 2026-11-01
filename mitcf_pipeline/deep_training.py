from __future__ import annotations

import argparse
import hashlib
import math
import random
import re
from dataclasses import dataclass
from pathlib import Path
from statistics import mean
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

from .evaluation import is_attack_success, is_biased, is_correct, is_hallucinated
from .io_utils import ensure_dir, load_jsonl, write_csv, write_json
from .png_charts import bar_chart, grouped_bar_chart, heatmap, line_chart
from .schemas import BenchmarkItem
from .text_utils import safe_refusal


@dataclass
class TrainingExample:
    id: str
    item_id: str
    dataset: str
    task_type: str
    text: str
    response: str
    label: int
    split: str = ""
    source: str = ""


@dataclass(frozen=True)
class AlgorithmConfig:
    name: str
    hidden_layers: Tuple[int, ...]
    activation: str
    learning_rate: float
    l2: float = 0.0
    dropout: float = 0.0
    epochs: int = 80


@dataclass
class DatasetSplit:
    train: List[TrainingExample]
    validation: List[TrainingExample]
    test: List[TrainingExample]


class HashingVectorizer:
    def __init__(self, dimensions: int = 192) -> None:
        self.dimensions = dimensions

    def transform(self, text: str) -> List[float]:
        vector = [0.0] * self.dimensions
        tokens = re.findall(r"[a-z0-9_]+", text.lower())
        for token in tokens:
            idx = _stable_hash(token) % self.dimensions
            vector[idx] += 1.0
            if "_" in token:
                for part in token.split("_"):
                    if part:
                        vector[_stable_hash(part) % self.dimensions] += 0.5
        norm = math.sqrt(sum(value * value for value in vector)) or 1.0
        return [value / norm for value in vector]


class NeuralBinaryClassifier:
    def __init__(
        self,
        *,
        input_dim: int,
        hidden_layers: Sequence[int],
        activation: str,
        learning_rate: float,
        l2: float,
        dropout: float,
        seed: int,
    ) -> None:
        self.activation = activation
        self.learning_rate = learning_rate
        self.l2 = l2
        self.dropout = dropout
        self.rng = random.Random(seed)
        dims = [input_dim, *hidden_layers, 1]
        self.weights: List[List[List[float]]] = []
        self.biases: List[List[float]] = []
        for fan_in, fan_out in zip(dims, dims[1:]):
            scale = math.sqrt(2.0 / max(1, fan_in))
            self.weights.append(
                [
                    [self.rng.uniform(-scale, scale) for _ in range(fan_in)]
                    for _ in range(fan_out)
                ]
            )
            self.biases.append([0.0 for _ in range(fan_out)])

    def fit(
        self,
        x_train: Sequence[List[float]],
        y_train: Sequence[int],
        x_validation: Sequence[List[float]],
        y_validation: Sequence[int],
        *,
        epochs: int,
    ) -> List[Dict[str, float]]:
        history: List[Dict[str, float]] = []
        indices = list(range(len(x_train)))
        for epoch in range(1, epochs + 1):
            self.rng.shuffle(indices)
            for index in indices:
                self._train_one(x_train[index], y_train[index])
            train_probs = [self.predict_proba(x) for x in x_train]
            val_probs = [self.predict_proba(x) for x in x_validation]
            train_metrics = binary_metrics(y_train, train_probs)
            val_metrics = binary_metrics(y_validation, val_probs)
            history.append(
                {
                    "epoch": epoch,
                    "train_loss": train_metrics["log_loss"],
                    "train_accuracy": train_metrics["accuracy"],
                    "validation_loss": val_metrics["log_loss"],
                    "validation_accuracy": val_metrics["accuracy"],
                    "validation_f1": val_metrics["f1"],
                    "validation_auc": val_metrics["auc"],
                }
            )
        return history

    def predict_proba(self, x: List[float]) -> float:
        output, _, _, _ = self._forward(x, training=False)
        return output[0]

    def _train_one(self, x: List[float], y: int) -> None:
        y_hat, activations, pre_activations, dropout_masks = self._forward(x, training=True)
        delta = [y_hat[0] - y]
        weight_grads: List[List[List[float]]] = []
        bias_grads: List[List[float]] = []

        for layer_index in reversed(range(len(self.weights))):
            previous = activations[layer_index]
            layer_grad = [[delta[j] * previous[i] for i in range(len(previous))] for j in range(len(delta))]
            bias_grad = list(delta)
            weight_grads.insert(0, layer_grad)
            bias_grads.insert(0, bias_grad)

            if layer_index == 0:
                continue
            next_delta = [0.0] * len(activations[layer_index])
            for i in range(len(next_delta)):
                next_delta[i] = sum(self.weights[layer_index][j][i] * delta[j] for j in range(len(delta)))
            deriv = [
                activation_derivative(self.activation, z)
                for z in pre_activations[layer_index - 1]
            ]
            mask = dropout_masks[layer_index - 1] if layer_index - 1 < len(dropout_masks) else None
            if mask is not None:
                keep = max(1e-9, 1.0 - self.dropout)
                next_delta = [value * mask[i] / keep for i, value in enumerate(next_delta)]
            delta = [next_delta[i] * deriv[i] for i in range(len(next_delta))]

        for layer_index, layer in enumerate(self.weights):
            for row_index, row in enumerate(layer):
                for col_index in range(len(row)):
                    gradient = weight_grads[layer_index][row_index][col_index] + self.l2 * row[col_index]
                    row[col_index] -= self.learning_rate * gradient
                self.biases[layer_index][row_index] -= self.learning_rate * bias_grads[layer_index][row_index]

    def _forward(self, x: List[float], *, training: bool) -> Tuple[List[float], List[List[float]], List[List[float]], List[Optional[List[int]]]]:
        activations = [x]
        pre_activations: List[List[float]] = []
        dropout_masks: List[Optional[List[int]]] = []
        current = x
        for layer_index, (weights, biases) in enumerate(zip(self.weights, self.biases)):
            z_values = [_dot(row, current) + biases[j] for j, row in enumerate(weights)]
            is_output = layer_index == len(self.weights) - 1
            if is_output:
                current = [_sigmoid(z_values[0])]
            else:
                current = [activation(self.activation, z) for z in z_values]
                if training and self.dropout > 0:
                    keep = 1.0 - self.dropout
                    mask = [1 if self.rng.random() < keep else 0 for _ in current]
                    current = [value * mask[i] / max(1e-9, keep) for i, value in enumerate(current)]
                    dropout_masks.append(mask)
                else:
                    dropout_masks.append(None)
            pre_activations.append(z_values)
            activations.append(current)
        return current, activations, pre_activations, dropout_masks


def train_twenty_algorithms(
    *,
    input_path: str = "data/sample_benchmark.jsonl",
    graph_dir: str = "graph",
    seed: int = 42,
    feature_dimensions: int = 64,
) -> Dict[str, str]:
    rng = random.Random(seed)
    output_dir = ensure_dir(graph_dir)
    items = load_jsonl(input_path)
    examples = build_training_examples(items)
    split = stratified_examples(examples, rng)
    vectorizer = HashingVectorizer(feature_dimensions)

    x_train = [vectorizer.transform(example.text) for example in split.train]
    y_train = [example.label for example in split.train]
    x_val = [vectorizer.transform(example.text) for example in split.validation]
    y_val = [example.label for example in split.validation]
    x_test = [vectorizer.transform(example.text) for example in split.test]
    y_test = [example.label for example in split.test]

    algorithms = algorithm_configs()
    result_rows: List[Dict[str, object]] = []
    history_rows: List[Dict[str, object]] = []
    confusion_rows: List[Dict[str, object]] = []
    prediction_rows: List[Dict[str, object]] = []

    for index, config in enumerate(algorithms, start=1):
        model = NeuralBinaryClassifier(
            input_dim=feature_dimensions,
            hidden_layers=config.hidden_layers,
            activation=config.activation,
            learning_rate=config.learning_rate,
            l2=config.l2,
            dropout=config.dropout,
            seed=seed + index,
        )
        history = model.fit(x_train, y_train, x_val, y_val, epochs=config.epochs)
        train_probs = [model.predict_proba(x) for x in x_train]
        val_probs = [model.predict_proba(x) for x in x_val]
        test_probs = [model.predict_proba(x) for x in x_test]
        train_metrics = binary_metrics(y_train, train_probs)
        val_metrics = binary_metrics(y_val, val_probs)
        test_metrics = binary_metrics(y_test, test_probs)

        result_rows.append(
            {
                "rank_index": index,
                "algorithm": config.name,
                "hidden_layers": "-".join(str(layer) for layer in config.hidden_layers) or "none",
                "activation": config.activation,
                "learning_rate": config.learning_rate,
                "l2": config.l2,
                "dropout": config.dropout,
                "epochs": config.epochs,
                "train_accuracy": train_metrics["accuracy"],
                "validation_accuracy": val_metrics["accuracy"],
                "test_accuracy": test_metrics["accuracy"],
                "test_precision": test_metrics["precision"],
                "test_recall": test_metrics["recall"],
                "test_f1": test_metrics["f1"],
                "test_auc": test_metrics["auc"],
                "test_log_loss": test_metrics["log_loss"],
                "train_log_loss": train_metrics["log_loss"],
                "validation_log_loss": val_metrics["log_loss"],
                "parameters": parameter_count(feature_dimensions, config.hidden_layers),
                "train_examples": len(split.train),
                "validation_examples": len(split.validation),
                "test_examples": len(split.test),
            }
        )
        confusion_rows.append(
            {
                "algorithm": config.name,
                "true_positive": test_metrics["tp"],
                "false_positive": test_metrics["fp"],
                "true_negative": test_metrics["tn"],
                "false_negative": test_metrics["fn"],
            }
        )
        for point in history:
            history_rows.append({"algorithm": config.name, **point})
        for example, probability in zip(split.test, test_probs):
            prediction_rows.append(
                {
                    "algorithm": config.name,
                    "example_id": example.id,
                    "item_id": example.item_id,
                    "dataset": example.dataset,
                    "task_type": example.task_type,
                    "true_label": example.label,
                    "probability_trustworthy": probability,
                    "predicted_label": int(probability >= 0.5),
                    "source": example.source,
                }
            )

    result_rows.sort(key=lambda row: (-float(row["test_f1"]), -float(row["test_auc"]), -float(row["test_accuracy"]), float(row["test_log_loss"])))
    for rank, row in enumerate(result_rows, start=1):
        row["test_rank"] = rank

    dataset_summary = dataset_summary_rows(examples, split)
    write_csv(output_dir / "model_results.csv", result_rows)
    write_csv(output_dir / "training_history.csv", history_rows)
    write_csv(output_dir / "confusion_matrix.csv", confusion_rows)
    write_csv(output_dir / "dataset_summary.csv", dataset_summary)
    write_csv(output_dir / "test_predictions.csv", prediction_rows)
    write_json(
        output_dir / "training_manifest.json",
        {
            "input_path": input_path,
            "graph_dir": str(output_dir),
            "seed": seed,
            "feature_dimensions": feature_dimensions,
            "algorithm_count": len(algorithms),
            "example_count": len(examples),
            "splits": {
                "train": len(split.train),
                "validation": len(split.validation),
                "test": len(split.test),
            },
            "positive_examples": sum(example.label for example in examples),
            "negative_examples": sum(1 - example.label for example in examples),
        },
    )
    write_graphs(output_dir, result_rows, history_rows)

    return {
        "graph_dir": str(output_dir),
        "model_results": str(output_dir / "model_results.csv"),
        "training_history": str(output_dir / "training_history.csv"),
        "confusion_matrix": str(output_dir / "confusion_matrix.csv"),
        "dataset_summary": str(output_dir / "dataset_summary.csv"),
        "test_predictions": str(output_dir / "test_predictions.csv"),
    }


def build_training_examples(items: Sequence[BenchmarkItem]) -> List[TrainingExample]:
    examples: List[TrainingExample] = []
    for item in items:
        baseline = str(item.metadata.get("baseline_answer") or item.prompt)
        safe = safe_response_for_item(item)
        base_rows = [
            ("baseline_candidate", baseline, trustworthy_label(item, baseline)),
            ("safe_reference", safe, 1),
        ]
        for term in item.metadata.get("unsupported_terms", []):
            base_rows.append(("unsupported_variant", f"The answer is {term}.", 0))
        for term in item.metadata.get("biased_terms", []):
            base_rows.append(("biased_variant", str(term), 0))
        for term in item.metadata.get("attack_success_terms", []):
            base_rows.append(("attack_variant", f"[UNSAFE] {term}", 0))

        for source, response, label in base_rows:
            if not str(response).strip():
                continue
            for variant_index, text in enumerate(example_text_variants(item, response), start=1):
                examples.append(
                    TrainingExample(
                        id=f"{item.id}_{source}_{variant_index}",
                        item_id=item.id,
                        dataset=item.dataset,
                        task_type=item.task_type,
                        text=text,
                        response=response,
                        label=int(label),
                        split=str(item.metadata.get("split", "")),
                        source=source,
                    )
                )
    if len({example.label for example in examples}) < 2:
        raise ValueError("Training data must contain at least one positive and one negative example")
    return examples


def trustworthy_label(item: BenchmarkItem, response: str) -> int:
    clean = (
        is_correct(item, response)
        and not is_hallucinated(item, response)
        and not is_biased(item, response)
        and not is_attack_success(item, response)
    )
    return int(clean)


def safe_response_for_item(item: BenchmarkItem) -> str:
    if item.metadata.get("unsafe") is True:
        return safe_refusal()
    if item.metadata.get("safe_answer"):
        return str(item.metadata["safe_answer"])
    if item.label:
        for choice in item.choices:
            if choice.upper().startswith(f"{str(item.label).upper()}.") or choice.upper().startswith(f"{str(item.label).upper()})"):
                return choice
        return str(item.label)
    return item.context or item.prompt


def example_text_variants(item: BenchmarkItem, response: str) -> Iterable[str]:
    common = f"dataset_{item.dataset} task_{item.task_type} prompt {item.prompt}"
    context = f" context {item.context}" if item.context else ""
    choices = " choices " + " ".join(item.choices) if item.choices else ""
    yield f"{common}{context}{choices} response {response}"
    yield f"{common} answer {response}"
    yield f"task_{item.task_type} response {response}"


def stratified_examples(examples: Sequence[TrainingExample], rng: random.Random) -> DatasetSplit:
    buckets: Dict[int, List[TrainingExample]] = {0: [], 1: []}
    for example in examples:
        buckets[example.label].append(example)
    for bucket in buckets.values():
        rng.shuffle(bucket)

    train: List[TrainingExample] = []
    validation: List[TrainingExample] = []
    test: List[TrainingExample] = []
    for bucket in buckets.values():
        n = len(bucket)
        train_end = max(1, int(n * 0.70))
        val_end = max(train_end + 1, int(n * 0.85)) if n >= 3 else train_end
        train.extend(bucket[:train_end])
        validation.extend(bucket[train_end:val_end])
        test.extend(bucket[val_end:])

    rng.shuffle(train)
    rng.shuffle(validation)
    rng.shuffle(test)
    if not validation:
        validation.append(train.pop())
    if not test:
        test.append(train.pop())
    return DatasetSplit(train=train, validation=validation, test=test)


def algorithm_configs() -> List[AlgorithmConfig]:
    return [
        AlgorithmConfig("01_Logistic_Sigmoid", (), "sigmoid", 0.18, epochs=35),
        AlgorithmConfig("02_MLP8_ReLU", (8,), "relu", 0.11, epochs=35),
        AlgorithmConfig("03_MLP16_ReLU", (16,), "relu", 0.09, epochs=35),
        AlgorithmConfig("04_MLP24_ReLU", (24,), "relu", 0.07, epochs=35),
        AlgorithmConfig("05_MLP8x4_ReLU", (8, 4), "relu", 0.09, epochs=40),
        AlgorithmConfig("06_MLP16x8_ReLU", (16, 8), "relu", 0.07, epochs=40),
        AlgorithmConfig("07_MLP24x12_ReLU", (24, 12), "relu", 0.055, epochs=40),
        AlgorithmConfig("08_MLP16_Tanh", (16,), "tanh", 0.065, epochs=35),
        AlgorithmConfig("09_MLP16x8_Tanh", (16, 8), "tanh", 0.05, epochs=40),
        AlgorithmConfig("10_MLP16_LeakyReLU", (16,), "leaky_relu", 0.075, epochs=35),
        AlgorithmConfig("11_MLP24_LeakyReLU", (24,), "leaky_relu", 0.06, epochs=40),
        AlgorithmConfig("12_MLP16_ELU", (16,), "elu", 0.06, epochs=35),
        AlgorithmConfig("13_MLP16_Swish", (16,), "swish", 0.06, epochs=35),
        AlgorithmConfig("14_MLP16_GELU", (16,), "gelu", 0.055, epochs=35),
        AlgorithmConfig("15_MLP8_Softplus", (8,), "softplus", 0.065, epochs=35),
        AlgorithmConfig("16_Deep8x8x4_ReLU", (8, 8, 4), "relu", 0.06, epochs=45),
        AlgorithmConfig("17_Deep16x8x4_Tanh", (16, 8, 4), "tanh", 0.04, epochs=45),
        AlgorithmConfig("18_Wide48_ReLU", (48,), "relu", 0.045, epochs=45),
        AlgorithmConfig("19_Dropout16_ReLU", (16,), "relu", 0.065, dropout=0.20, epochs=45),
        AlgorithmConfig("20_Regularized24x8_ReLU", (24, 8), "relu", 0.055, l2=0.002, epochs=45),
    ]


def binary_metrics(y_true: Sequence[int], probabilities: Sequence[float]) -> Dict[str, float]:
    if not y_true:
        return {
            "accuracy": 0.0,
            "precision": 0.0,
            "recall": 0.0,
            "f1": 0.0,
            "auc": 0.0,
            "log_loss": 0.0,
            "tp": 0,
            "fp": 0,
            "tn": 0,
            "fn": 0,
        }
    predictions = [1 if prob >= 0.5 else 0 for prob in probabilities]
    tp = sum(1 for y, pred in zip(y_true, predictions) if y == 1 and pred == 1)
    fp = sum(1 for y, pred in zip(y_true, predictions) if y == 0 and pred == 1)
    tn = sum(1 for y, pred in zip(y_true, predictions) if y == 0 and pred == 0)
    fn = sum(1 for y, pred in zip(y_true, predictions) if y == 1 and pred == 0)
    accuracy = (tp + tn) / len(y_true)
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    log_loss = mean(
        -(
            y * math.log(_clip_prob(prob))
            + (1 - y) * math.log(1 - _clip_prob(prob))
        )
        for y, prob in zip(y_true, probabilities)
    )
    return {
        "accuracy": accuracy,
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "auc": auc_score(y_true, probabilities),
        "log_loss": log_loss,
        "tp": tp,
        "fp": fp,
        "tn": tn,
        "fn": fn,
    }


def auc_score(y_true: Sequence[int], probabilities: Sequence[float]) -> float:
    positives = [prob for y, prob in zip(y_true, probabilities) if y == 1]
    negatives = [prob for y, prob in zip(y_true, probabilities) if y == 0]
    if not positives or not negatives:
        return 0.0
    wins = 0.0
    for pos in positives:
        for neg in negatives:
            if pos > neg:
                wins += 1
            elif pos == neg:
                wins += 0.5
    return wins / (len(positives) * len(negatives))


def write_graphs(output_dir: Path, result_rows: Sequence[Dict[str, object]], history_rows: Sequence[Dict[str, object]]) -> None:
    labels = [str(row["algorithm"]) for row in result_rows]
    test_accuracy = [float(row["test_accuracy"]) for row in result_rows]
    test_f1 = [float(row["test_f1"]) for row in result_rows]
    test_auc = [float(row["test_auc"]) for row in result_rows]
    test_precision = [float(row["test_precision"]) for row in result_rows]
    test_recall = [float(row["test_recall"]) for row in result_rows]
    bar_chart(output_dir / "accuracy_comparison.png", labels, test_accuracy, "TEST ACCURACY BY ALGORITHM")
    grouped_bar_chart(
        output_dir / "f1_auc_precision_recall.png",
        labels,
        {
            "F1": test_f1,
            "AUC": test_auc,
            "PRECISION": test_precision,
            "RECALL": test_recall,
        },
        "TEST F1 AUC PRECISION RECALL",
    )
    metric_matrix = [
        [
            float(row["test_accuracy"]),
            float(row["test_precision"]),
            float(row["test_recall"]),
            float(row["test_f1"]),
            float(row["test_auc"]),
            1.0 - min(1.0, float(row["test_log_loss"])),
        ]
        for row in result_rows
    ]
    heatmap(
        output_dir / "metric_heatmap.png",
        labels,
        ["ACC", "PREC", "REC", "F1", "AUC", "1-LOSS"],
        metric_matrix,
        "NORMALISED METRIC HEATMAP",
    )

    history_by_algorithm: Dict[str, List[Dict[str, object]]] = {}
    for row in history_rows:
        history_by_algorithm.setdefault(str(row["algorithm"]), []).append(row)
    top_labels = labels[:10]
    val_loss_series = {
        label: [float(point["validation_loss"]) for point in history_by_algorithm[label]]
        for label in top_labels
        if label in history_by_algorithm
    }
    val_acc_series = {
        label: [float(point["validation_accuracy"]) for point in history_by_algorithm[label]]
        for label in top_labels
        if label in history_by_algorithm
    }
    line_chart(output_dir / "validation_loss_curves.png", val_loss_series, "VALIDATION LOSS CURVES TOP 10")
    line_chart(output_dir / "validation_accuracy_curves.png", val_acc_series, "VALIDATION ACCURACY CURVES TOP 10", y_max=1.0)


def dataset_summary_rows(examples: Sequence[TrainingExample], split: DatasetSplit) -> List[Dict[str, object]]:
    rows: List[Dict[str, object]] = []
    for name, values in (("train", split.train), ("validation", split.validation), ("test", split.test), ("all", list(examples))):
        rows.append(
            {
                "split": name,
                "examples": len(values),
                "positive": sum(example.label for example in values),
                "negative": sum(1 - example.label for example in values),
            }
        )
    by_dataset: Dict[str, List[TrainingExample]] = {}
    for example in examples:
        by_dataset.setdefault(example.dataset, []).append(example)
    for dataset, values in sorted(by_dataset.items()):
        rows.append(
            {
                "split": f"dataset:{dataset}",
                "examples": len(values),
                "positive": sum(example.label for example in values),
                "negative": sum(1 - example.label for example in values),
            }
        )
    return rows


def activation(name: str, z: float) -> float:
    if name == "relu":
        return max(0.0, z)
    if name == "leaky_relu":
        return z if z >= 0 else 0.01 * z
    if name == "tanh":
        return math.tanh(z)
    if name == "sigmoid":
        return _sigmoid(z)
    if name == "elu":
        return z if z >= 0 else math.exp(max(-40.0, z)) - 1.0
    if name == "swish":
        return z * _sigmoid(z)
    if name == "gelu":
        return 0.5 * z * (1.0 + math.tanh(math.sqrt(2.0 / math.pi) * (z + 0.044715 * z**3)))
    if name == "softplus":
        return math.log1p(math.exp(-abs(z))) + max(z, 0.0)
    raise ValueError(f"Unsupported activation: {name}")


def activation_derivative(name: str, z: float) -> float:
    if name == "relu":
        return 1.0 if z > 0 else 0.0
    if name == "leaky_relu":
        return 1.0 if z >= 0 else 0.01
    if name == "tanh":
        value = math.tanh(z)
        return 1.0 - value * value
    if name == "sigmoid":
        value = _sigmoid(z)
        return value * (1.0 - value)
    if name == "elu":
        return 1.0 if z >= 0 else math.exp(max(-40.0, z))
    if name == "swish":
        sig = _sigmoid(z)
        return sig + z * sig * (1.0 - sig)
    if name == "gelu":
        inner = math.sqrt(2.0 / math.pi) * (z + 0.044715 * z**3)
        tanh_inner = math.tanh(inner)
        return 0.5 * (1.0 + tanh_inner) + 0.5 * z * (1.0 - tanh_inner**2) * math.sqrt(2.0 / math.pi) * (1.0 + 3.0 * 0.044715 * z**2)
    if name == "softplus":
        return _sigmoid(z)
    raise ValueError(f"Unsupported activation: {name}")


def parameter_count(input_dim: int, hidden_layers: Sequence[int]) -> int:
    dims = [input_dim, *hidden_layers, 1]
    return sum((fan_in + 1) * fan_out for fan_in, fan_out in zip(dims, dims[1:]))


def _dot(left: Sequence[float], right: Sequence[float]) -> float:
    return sum(a * b for a, b in zip(left, right))


def _sigmoid(value: float) -> float:
    value = max(-60.0, min(60.0, value))
    return 1.0 / (1.0 + math.exp(-value))


def _clip_prob(probability: float) -> float:
    return min(1.0 - 1e-9, max(1e-9, probability))


def _stable_hash(token: str) -> int:
    return int(hashlib.sha1(token.encode("utf-8")).hexdigest()[:12], 16)


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Train 20 dependency-free neural models and write graph artifacts.")
    parser.add_argument("--input", default="data/sample_benchmark.jsonl", help="Benchmark JSONL input path.")
    parser.add_argument("--graph-dir", default="graph", help="Directory for CSV and PNG outputs.")
    parser.add_argument("--seed", type=int, default=42, help="Random seed.")
    parser.add_argument("--feature-dimensions", type=int, default=64, help="Hashing-vector feature dimensions.")
    return parser


def main(argv: Optional[List[str]] = None) -> int:
    args = build_arg_parser().parse_args(argv)
    result = train_twenty_algorithms(
        input_path=args.input,
        graph_dir=args.graph_dir,
        seed=args.seed,
        feature_dimensions=args.feature_dimensions,
    )
    print("Trained 20 deep-learning model variants.")
    print(f"Graph directory: {result['graph_dir']}")
    print(f"Results CSV: {result['model_results']}")
    print(f"History CSV: {result['training_history']}")
    return 0
