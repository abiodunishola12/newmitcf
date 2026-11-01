"""Tests for dataset adapters and label-leakage prevention."""

from __future__ import annotations

import json
import tempfile
from pathlib import Path

from ..datasets.base import VisualBenchmarkItem, verify_dataset_integrity, _normalise_answer
from ..datasets.pope_adapter import POPEAdapter
from ..datasets.mme_adapter import MMEAdapter


def test_normalise_answer_binary():
    assert _normalise_answer("Yes", "binary") == "yes"
    assert _normalise_answer("NO", "binary") == "no"
    assert _normalise_answer("1", "binary") == "yes"
    assert _normalise_answer("0", "binary") == "no"
    assert _normalise_answer("true", "binary") == "yes"


def test_visual_benchmark_item_image_exists(tmp_path):
    image_path = tmp_path / "test_img.jpg"
    image_path.write_bytes(b"fake")
    item = VisualBenchmarkItem(
        item_id="test_1", benchmark="POPE", category="random",
        image_path=str(image_path), question="Is there a cat?",
        ground_truth="yes", answer_type="binary",
    )
    assert item.image_exists()
    assert item.normalised_ground_truth == "yes"


def test_visual_benchmark_item_missing_image():
    item = VisualBenchmarkItem(
        item_id="test_2", benchmark="POPE", category="random",
        image_path="/nonexistent/path/img.jpg", question="Q?",
        ground_truth="no",
    )
    assert not item.image_exists()


def test_verify_dataset_integrity_all_present(tmp_path):
    items = []
    for i in range(3):
        p = tmp_path / f"img_{i}.jpg"
        p.write_bytes(b"x")
        items.append(VisualBenchmarkItem(
            item_id=f"i_{i}", benchmark="POPE", category="random",
            image_path=str(p), question="Q?", ground_truth="yes",
        ))
    result = verify_dataset_integrity(items)
    assert result["integrity_ok"]
    assert result["images_missing"] == 0


def test_verify_dataset_integrity_missing(tmp_path):
    items = [
        VisualBenchmarkItem(
            item_id="i_0", benchmark="POPE", category="random",
            image_path="/nonexistent/img.jpg", question="Q?", ground_truth="yes",
        )
    ]
    result = verify_dataset_integrity(items)
    assert not result["integrity_ok"]
    assert result["images_missing"] == 1


def test_pope_adapter_unavailable(tmp_path):
    adapter = POPEAdapter(str(tmp_path / "nonexistent"))
    status = adapter.check_availability()
    assert not status["available"]
    assert "message" in status


def test_pope_adapter_load_creates_items(tmp_path):
    """Test POPE adapter parses a synthetic annotation file."""
    ann_dir = tmp_path / "annotations"
    img_dir = tmp_path / "val2014"
    ann_dir.mkdir()
    img_dir.mkdir()

    img_file = img_dir / "COCO_val2014_000000001.jpg"
    img_file.write_bytes(b"fake_image")

    ann_file = ann_dir / "coco_pope_random.json"
    records = [
        {"image": "COCO_val2014_000000001.jpg", "text": "Is there a cat?", "label": "yes"},
        {"image": "COCO_val2014_000000001.jpg", "text": "Is there a dog?", "label": "no"},
    ]
    with ann_file.open("w") as handle:
        for r in records:
            handle.write(json.dumps(r) + "\n")

    adapter = POPEAdapter(str(tmp_path), categories=["random"])
    items = adapter.load()
    assert len(items) == 2
    assert items[0].benchmark == "POPE"
    assert items[0].ground_truth in {"yes", "no"}
    assert items[0].question == "Is there a cat?"
    assert items[1].ground_truth == "no"


def test_label_not_in_question():
    """Verify ground truth is not embedded in the question field."""
    item = VisualBenchmarkItem(
        item_id="x", benchmark="POPE", category="random",
        image_path="/img.jpg", question="Is there a cat?",
        ground_truth="yes",
    )
    assert item.ground_truth not in item.question


def test_mme_adapter_unavailable(tmp_path):
    adapter = MMEAdapter(str(tmp_path / "nonexistent"))
    status = adapter.check_availability()
    assert not status["available"]


def test_mme_adapter_load_creates_items(tmp_path):
    """Test MME adapter parses a synthetic annotation file."""
    cat_dir = tmp_path / "existence"
    cat_dir.mkdir()

    img = cat_dir / "scene_001.jpg"
    img.write_bytes(b"fake")

    ann = cat_dir / "questions_answers_YN.txt"
    ann.write_text("scene_001.jpg\tIs there any object in the image?\tyes\n")

    adapter = MMEAdapter(str(tmp_path), categories=["existence"])
    items = adapter.load()
    assert len(items) == 1
    assert items[0].benchmark == "MME"
    assert items[0].ground_truth == "yes"


def test_mme_score_mme_accuracy_and_plus(tmp_path):
    """score_mme computes per-category accuracy*100 + plus_score*100."""
    cat_dir = tmp_path / "existence"
    cat_dir.mkdir()

    # Two images, two questions each — only image A has both correct.
    lines = (
        "imgA.jpg\tIs there a cat?\tyes\n"
        "imgA.jpg\tIs there a dog?\tno\n"
        "imgB.jpg\tIs there a cat?\tyes\n"
        "imgB.jpg\tIs there a dog?\tno\n"
    )
    (cat_dir / "questions_answers_YN.txt").write_text(lines)
    for name in ("imgA.jpg", "imgB.jpg"):
        (cat_dir / name).write_bytes(b"x")

    adapter = MMEAdapter(str(tmp_path), categories=["existence"])
    items = adapter.load()
    assert len(items) == 4

    # Predictions: all correct for imgA, wrong first answer for imgB
    predictions = ["yes", "no", "no", "no"]  # imgB Q1 wrong
    scores = MMEAdapter.score_mme(items, predictions)

    cat = scores["existence"]
    assert cat["correct"] == 3
    assert abs(cat["accuracy"] - 0.75) < 1e-9
    # Only imgA has both correct → plus_score = 1/2
    assert abs(cat["plus_score"] - 0.5) < 1e-9
    expected_score = 0.75 * 100 + 0.5 * 100
    assert abs(cat["mme_score"] - expected_score) < 1e-9
    assert abs(scores["total_score"] - expected_score) < 1e-9


def test_mme_score_mme_all_correct(tmp_path):
    """When all predictions match, accuracy and plus_score both equal 1.0."""
    cat_dir = tmp_path / "count"
    cat_dir.mkdir()

    lines = (
        "img1.jpg\tHow many cats?\tyes\n"
        "img1.jpg\tMore than one?\tno\n"
    )
    (cat_dir / "questions_answers_YN.txt").write_text(lines)
    for name in ("img1.jpg",):
        (cat_dir / name).write_bytes(b"x")

    adapter = MMEAdapter(str(tmp_path), categories=["count"])
    items = adapter.load()
    predictions = ["yes", "no"]
    scores = MMEAdapter.score_mme(items, predictions)

    cat = scores["count"]
    assert cat["accuracy"] == 1.0
    assert cat["plus_score"] == 1.0
    assert cat["mme_score"] == 200.0


def test_setup_mme_dirs_creates_subdirectories(tmp_path):
    """_setup_mme_dirs creates all 14 MME category subdirectories."""
    from ..cli import _setup_mme_dirs
    from ..datasets.mme_adapter import MME_ALL_CATEGORIES

    _setup_mme_dirs(str(tmp_path / "mme"))
    for cat in MME_ALL_CATEGORIES:
        assert (tmp_path / "mme" / cat).is_dir(), f"Missing dir: {cat}"


def test_download_pope_creates_annotation_dirs(tmp_path):
    """_download_pope creates annotations/ and val2014/ directories."""
    # Intercept urllib.request.urlretrieve to avoid real network calls
    import unittest.mock as mock
    import json

    pope_path = tmp_path / "pope"

    def fake_retrieve(url, dest):
        # Write a minimal valid POPE JSON line
        Path(dest).write_text(
            json.dumps({"image": "COCO_val2014_000000001.jpg",
                        "text": "Is there a cat?", "label": "yes"}) + "\n"
        )

    from .. import cli
    with mock.patch("urllib.request.urlretrieve", side_effect=fake_retrieve):
        result = cli._download_pope(str(pope_path), download_images=False)

    assert result is True
    assert (pope_path / "annotations").is_dir()
    assert (pope_path / "val2014").is_dir()
    for fname in ("coco_pope_random.json", "coco_pope_popular.json", "coco_pope_adversarial.json"):
        assert (pope_path / "annotations" / fname).exists(), f"Missing {fname}"
