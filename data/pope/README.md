# POPE Dataset Setup

POPE (Polling-based Object Probing Evaluation) measures object hallucination in VLMs.

## Directory Structure

```
data/pope/
  annotations/
    coco_pope_random.json
    coco_pope_popular.json
    coco_pope_adversarial.json
  val2014/
    COCO_val2014_000000001234.jpg
    ...  (82,783 images)
```

## Download Instructions

### Step 1: Download POPE Annotations
```
git clone https://github.com/AoiDragon/POPE.git
cp POPE/output/coco/coco_pope_random.json     data/pope/annotations/
cp POPE/output/coco/coco_pope_popular.json    data/pope/annotations/
cp POPE/output/coco/coco_pope_adversarial.json data/pope/annotations/
```

### Step 2: Download MSCOCO val2014 Images
```
# Download (6.6 GB)
wget http://images.cocodataset.org/zips/val2014.zip
unzip val2014.zip -d data/pope/
```

## Licence

POPE annotations: MIT Licence  
MSCOCO images: Creative Commons Attribution 4.0 Licence  
https://cocodataset.org/#termsofuse

## Verification

```
python -m visual_perception.cli validate-data
```
