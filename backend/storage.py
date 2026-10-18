import csv
import io
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone

from .settings import DB_PATH


@contextmanager
def connect():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH, timeout=10)
    connection.row_factory = sqlite3.Row
    try:
        yield connection
        connection.commit()
    finally:
        connection.close()


def init_db() -> None:
    with connect() as db:
        db.execute("""
            CREATE TABLE IF NOT EXISTS analyses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                image_name TEXT NOT NULL,
                predicted_species TEXT NOT NULL,
                confidence REAL NOT NULL,
                analysis_date TEXT NOT NULL,
                description TEXT NOT NULL,
                media_type TEXT NOT NULL CHECK (media_type IN ('image', 'audio'))
            )
        """)
        db.execute("CREATE INDEX IF NOT EXISTS idx_species ON analyses(predicted_species)")


def add_analysis(filename: str, species: str, score: float,
                 description: str, media_type: str) -> int:
    timestamp = datetime.now(timezone.utc).isoformat(timespec="seconds")
    with connect() as db:
        cursor = db.execute("""
            INSERT INTO analyses
            (image_name, predicted_species, confidence, analysis_date, description, media_type)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (filename, species, score, timestamp, description, media_type))
        return int(cursor.lastrowid)


def list_analyses(search: str = "") -> list[dict]:
    with connect() as db:
        if search.strip():
            # LIKE metacharacters are escaped so a user searches for literal text.
            term = search.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            rows = db.execute("""
                SELECT * FROM analyses WHERE predicted_species LIKE ? ESCAPE '\\'
                ORDER BY id DESC
            """, (f"%{term}%",)).fetchall()
        else:
            rows = db.execute("SELECT * FROM analyses ORDER BY id DESC").fetchall()
        return [dict(row) for row in rows]


def delete_analysis(item_id: int) -> bool:
    with connect() as db:
        cursor = db.execute("DELETE FROM analyses WHERE id = ?", (item_id,))
        return cursor.rowcount > 0


def statistics() -> dict:
    with connect() as db:
        summary = db.execute("""
            SELECT COUNT(*) AS total, MAX(confidence) AS max_confidence,
                   MIN(confidence) AS min_confidence FROM analyses
        """).fetchone()
        frequent = db.execute("""
            SELECT predicted_species AS species, COUNT(*) AS count
            FROM analyses GROUP BY predicted_species
            ORDER BY count DESC, species ASC LIMIT 10
        """).fetchall()
        return {"total": summary["total"],
                "max_confidence": summary["max_confidence"],
                "min_confidence": summary["min_confidence"],
                "frequent_species": [dict(row) for row in frequent]}


def export_csv() -> str:
    stream = io.StringIO(newline="")
    writer = csv.writer(stream)
    writer.writerow(["image_name", "predicted_species", "confidence",
                     "analysis_date", "description"])
    with connect() as db:
        rows = db.execute("""
            SELECT image_name, predicted_species, confidence, analysis_date, description
            FROM analyses ORDER BY id DESC
        """).fetchall()
        for row in rows:
            # Escape spreadsheet formulas in string cells on opening the CSV.
            def safe(value: str) -> str:
                return "'" + value if value.lstrip().startswith(("=", "+", "-", "@")) else value
            writer.writerow([safe(row["image_name"]), safe(row["predicted_species"]),
                             row["confidence"], row["analysis_date"], safe(row["description"])])
    return stream.getvalue()
