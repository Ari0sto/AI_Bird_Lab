"""Local Transformers pipelines; all model calls are serialized to limit RAM use."""
import io
import subprocess
import tempfile
import threading
from functools import lru_cache
from pathlib import Path

import numpy as np
import soundfile as sf
from PIL import Image, ImageOps, UnidentifiedImageError

from .settings import (AUDIO_MAX_SECONDS, AUDIO_MODEL, AUDIO_SAMPLE_RATE,
                       DETECTOR_MODEL, IMAGE_MODEL, MAX_IMAGE_PIXELS,
                       MIN_DETECTION_SCORE)


class InvalidMedia(Exception):
    pass


class NoBirdFound(Exception):
    pass


class ModelUnavailable(Exception):
    pass


MODEL_LOCK = threading.RLock()
Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS


@lru_cache(maxsize=3)
def get_pipeline(task: str, model: str):
    try:
        from transformers import pipeline
        return pipeline(task, model=model, device=-1)
    except Exception as exc:
        raise ModelUnavailable(
            f"Не удалось загрузить модель {model}. Проверьте интернет, память и установку зависимостей."
        ) from exc


def classify_image(data: bytes) -> list[dict]:
    try:
        with Image.open(io.BytesIO(data)) as original:
            original.verify()
        with Image.open(io.BytesIO(data)) as original:
            if original.width * original.height > MAX_IMAGE_PIXELS:
                raise InvalidMedia("Изображение слишком большое по разрешению.")
            image = ImageOps.exif_transpose(original).convert("RGB")
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError) as exc:
        raise InvalidMedia("Файл изображения повреждён или не поддерживается.") from exc

    try:
        with MODEL_LOCK:
            detector = get_pipeline("object-detection", DETECTOR_MODEL)
            objects = detector(image, threshold=MIN_DETECTION_SCORE)
            birds = [item for item in objects if str(item.get("label", "")).lower() == "bird"]
            if not birds:
                raise NoBirdFound("На фотографии не обнаружена птица. Попробуйте более чёткий снимок.")

            target = max(birds, key=lambda item: item["score"])
            bbox = target.get("box", {})
            left = max(0, int(bbox.get("xmin", 0)))
            top = max(0, int(bbox.get("ymin", 0)))
            right = min(image.width, int(bbox.get("xmax", image.width)))
            bottom = min(image.height, int(bbox.get("ymax", image.height)))
            crop = image.crop((left, top, right, bottom)) if right-left >= 32 and bottom-top >= 32 else image

            classifier = get_pipeline("image-classification", IMAGE_MODEL)
            result = classifier(crop, top_k=3)
    except (InvalidMedia, NoBirdFound, ModelUnavailable):
        raise
    except Exception as exc:
        raise ModelUnavailable("Ошибка выполнения модели распознавания фотографии.") from exc
    return [{"species": item["label"], "confidence": float(item["score"])}
            for item in result]


def decode_audio(data: bytes, extension: str) -> np.ndarray:
    # FFmpeg decodes MP3/M4A/OGG/FLAC/WAV into mono 16 kHz for Wav2Vec2.
    with tempfile.TemporaryDirectory(prefix="bird_lab_") as folder:
        source = Path(folder) / f"input{extension}"
        destination = Path(folder) / "normalized.wav"
        source.write_bytes(data)
        command = ["ffmpeg", "-nostdin", "-y", "-hide_banner", "-loglevel", "error",
                   "-i", str(source), "-t", str(AUDIO_MAX_SECONDS),
                   "-ac", "1", "-ar", str(AUDIO_SAMPLE_RATE),
                   "-c:a", "pcm_s16le", str(destination)]
        try:
            process = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                     timeout=45, check=False)
        except FileNotFoundError as exc:
            raise InvalidMedia("FFmpeg не установлен или отсутствует в PATH.") from exc
        except subprocess.TimeoutExpired as exc:
            raise InvalidMedia("Превышено время обработки аудио.") from exc
        if process.returncode != 0 or not destination.exists():
            raise InvalidMedia("Аудиофайл повреждён или его формат не поддерживается FFmpeg.")
        try:
            samples, sample_rate = sf.read(destination, dtype="float32", always_2d=False)
        except (OSError, RuntimeError) as exc:
            raise InvalidMedia("Не удалось декодировать аудио.") from exc
    if sample_rate != AUDIO_SAMPLE_RATE or samples.ndim != 1 or samples.size < AUDIO_SAMPLE_RATE:
        raise InvalidMedia("Требуется аудиозапись длительностью хотя бы 1 секунду.")
    if not np.all(np.isfinite(samples)) or float(np.sqrt(np.mean(samples ** 2))) < 0.001:
        raise InvalidMedia("В записи практически нет звука.")
    return samples


def classify_audio(data: bytes, extension: str) -> list[dict]:
    samples = decode_audio(data, extension)
    width = 5 * AUDIO_SAMPLE_RATE
    last = max(0, len(samples) - width)
    offsets = sorted({0, last // 2, last})
    scores: dict[str, float] = {}
    try:
        with MODEL_LOCK:
            classifier = get_pipeline("audio-classification", AUDIO_MODEL)
            for offset in offsets:
                segment = samples[offset:offset + width]
                result = classifier({"array": segment, "sampling_rate": AUDIO_SAMPLE_RATE},
                                    top_k=None)
                for item in result:
                    label = str(item["label"])
                    scores[label] = scores.get(label, 0.0) + float(item["score"])
    except ModelUnavailable:
        raise
    except Exception as exc:
        raise ModelUnavailable("Ошибка выполнения модели распознавания аудио.") from exc
    if not scores:
        raise ModelUnavailable("Нейросеть не вернула результатов.")
    count = len(offsets)
    ranked = sorted(scores.items(), key=lambda row: row[1], reverse=True)[:3]
    return [{"species": species, "confidence": score / count} for species, score in ranked]
