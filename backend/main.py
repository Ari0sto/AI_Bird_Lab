"""FastAPI application endpoints."""
from contextlib import asynccontextmanager
from pathlib import PureWindowsPath

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response

from .classifier import (InvalidMedia, ModelUnavailable, NoBirdFound,
                         classify_audio, classify_image)
from .settings import MAX_AUDIO_BYTES, MAX_IMAGE_BYTES, NOT_FOUND
from .storage import (add_analysis, delete_analysis, export_csv, init_db,
                      list_analyses, statistics)
from .wiki import bird_info


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(title="AI Bird Lab", version="1.0.0", lifespan=lifespan)


async def read_upload(file: UploadFile, extensions: set[str], limit: int) -> tuple[str, bytes, str]:
    filename = PureWindowsPath(file.filename or "").name.strip()
    if not filename or len(filename) > 200 or any(ord(ch) < 32 for ch in filename):
        raise HTTPException(400, "Некорректное имя файла.")
    extension = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if extension not in extensions:
        raise HTTPException(415, "Неподдерживаемый формат файла.")
    data = await file.read(limit + 1)
    if not data:
        raise HTTPException(400, "Файл пустой.")
    if len(data) > limit:
        raise HTTPException(413, "Файл превышает допустимый размер.")
    return filename, data, extension


async def analyze(file: UploadFile, media_type: str) -> dict:
    try:
        if media_type == "image":
            filename, data, _ = await read_upload(file, {".jpg", ".jpeg", ".png"},
                                                   MAX_IMAGE_BYTES)
            predictions = await run_in_threadpool(classify_image, data)
        else:
            filename, data, extension = await read_upload(
                file, {".wav", ".flac", ".ogg", ".mp3", ".m4a"}, MAX_AUDIO_BYTES)
            predictions = await run_in_threadpool(classify_audio, data, extension)
    except InvalidMedia as exc:
        raise HTTPException(422, str(exc)) from exc
    except NoBirdFound as exc:
        raise HTTPException(422, str(exc)) from exc
    except ModelUnavailable as exc:
        raise HTTPException(503, str(exc)) from exc
    finally:
        await file.close()

    best = predictions[0]
    info = await bird_info(best["species"])
    description = info["description"] if info["description"] != NOT_FOUND else NOT_FOUND
    item_id = await run_in_threadpool(add_analysis, filename, best["species"],
                                      best["confidence"], description, media_type)
    return {"id": item_id, "filename": filename, "media_type": media_type,
            "predictions": predictions, "info": info,
            "notice": ("Модель знает ограниченный набор видов птиц; "
                       "неизвестная птица или другой звук могут быть классифицированы ошибочно.")}


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/api/analyze/image")
async def analyze_photo(file: UploadFile = File(...)) -> dict:
    return await analyze(file, "image")


@app.post("/api/analyze/audio")
async def analyze_sound(file: UploadFile = File(...)) -> dict:
    return await analyze(file, "audio")


@app.get("/api/history")
def history(search: str = Query("", max_length=150)) -> list[dict]:
    return list_analyses(search)


@app.delete("/api/history/{item_id}")
def remove(item_id: int) -> dict:
    if not delete_analysis(item_id):
        raise HTTPException(404, "Запись не найдена.")
    return {"deleted": True}


@app.get("/api/stats")
def stats() -> dict:
    return statistics()


@app.get("/api/export")
def export() -> Response:
    content = "\ufeff" + export_csv()
    return Response(content, media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": 'attachment; filename="bird_analysis.csv"'})
