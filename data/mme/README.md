# MME Dataset Setup

MME (Multimodal Model Evaluation) evaluates VLMs across 14 perception and cognition tasks.

## Directory Structure

```
data/mme/
  existence/
    questions_answers_YN.txt
    img001.jpg  ...
  count/
    questions_answers_YN.txt
    img001.jpg  ...
  position/   color/   posters/   celebrity/
  scene/      landmark/ artwork/  OCR/
  commonsense_reasoning/   numerical_calculation/
  text_translation/        code_reasoning/
```

## Download Instructions

### Step 1: Request Access
Access the MME dataset by following instructions at:
https://github.com/BradyFU/Awesome-Multimodal-Large-Language-Models/tree/Evaluation

### Step 2: Place Data
Extract the downloaded archive into `data/mme/` so each category is a subdirectory.

### Step 3: Verify
```
python -m visual_perception.cli validate-data
```

## Annotation Format

Each `questions_answers_YN.txt` has one line per question:
```
<image_filename>\t<question>\t<yes_or_no_answer>
```

## Scoring

MME uses its own scoring convention: accuracy × 100 + plus_score × 100 per category,
where plus_score counts image pairs where both questions are answered correctly.

The `MMEAdapter.score_mme()` method implements this official scoring.

## Licence

Follow the licensing terms provided with the MME download.
