from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "data" / "birds.sqlite3"

IMAGE_MODEL = "dima806/bird_species_image_detection"
DETECTOR_MODEL = "facebook/detr-resnet-50"
AUDIO_MODEL = "dima806/bird_sounds_classification"

MAX_IMAGE_BYTES = 12 * 1024 * 1024
MAX_AUDIO_BYTES = 20 * 1024 * 1024
MAX_IMAGE_PIXELS = 24_000_000
MIN_DETECTION_SCORE = 0.65
AUDIO_SAMPLE_RATE = 16_000
AUDIO_MAX_SECONDS = 60

NOT_FOUND = "Информация не найдена"
