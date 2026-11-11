import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from backend import storage
from backend.classifier import InvalidMedia, ModelUnavailable, NoBirdFound
from backend.main import app
from backend.settings import NOT_FOUND


INFO = {
    "scientific_name": "Testus avis",
    "family": NOT_FOUND,
    "range": NOT_FOUND,
    "diet": NOT_FOUND,
    "description": "Description for tests",
    "wikipedia_url": None,
    "wikidata_url": None,
}
PREDICTIONS = [{"species": "Test bird", "confidence": 0.91}]


class MainApiTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.db_patcher = patch.object(storage, "DB_PATH", Path(self.folder.name) / "test.sqlite3")
        self.db_patcher.start()
        self.addCleanup(self.db_patcher.stop)
        self.addCleanup(self.folder.cleanup)
        self.client_context = TestClient(app)
        self.client = self.client_context.__enter__()
        self.addCleanup(self.client_context.__exit__, None, None, None)

    def upload_image(self, filename="bird.jpg", content=b"fake-image"):
        return self.client.post("/api/analyze/image", files={"file": (filename, content, "image/jpeg")})

    def upload_audio(self, filename="bird.mp3", content=b"fake-audio"):
        return self.client.post("/api/analyze/audio", files={"file": (filename, content, "audio/mpeg")})

    def test_health(self):
        response = self.client.get("/api/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})

    def test_image_success_saves_result(self):
        with patch("backend.main.classify_image", return_value=PREDICTIONS) as classify, \
             patch("backend.main.bird_info", new_callable=AsyncMock, return_value=INFO) as wiki:
            response = self.upload_image()
        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertEqual(payload["filename"], "bird.jpg")
        self.assertEqual(payload["media_type"], "image")
        self.assertEqual(payload["predictions"], PREDICTIONS)
        self.assertEqual(payload["info"], INFO)
        self.assertIsInstance(payload["id"], int)
        classify.assert_called_once_with(b"fake-image")
        wiki.assert_awaited_once_with("Test bird")
        self.assertEqual(self.client.get("/api/stats").json()["total"], 1)

    def test_audio_success_passes_extension_and_saves_result(self):
        with patch("backend.main.classify_audio", return_value=PREDICTIONS) as classify, \
             patch("backend.main.bird_info", new_callable=AsyncMock, return_value=INFO):
            response = self.upload_audio("song.MP3")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["media_type"], "audio")
        classify.assert_called_once_with(b"fake-audio", ".mp3")
        self.assertEqual(self.client.get("/api/stats").json()["total"], 1)

    def test_missing_file_returns_422(self):
        for endpoint in ("image", "audio"):
            with self.subTest(endpoint=endpoint):
                response = self.client.post(f"/api/analyze/{endpoint}")
                self.assertEqual(response.status_code, 422)
        self.assertEqual(self.client.get("/api/stats").json()["total"], 0)

    def test_unsupported_extensions_return_415(self):
        self.assertEqual(self.upload_image("bird.gif").status_code, 415)
        self.assertEqual(self.upload_audio("bird.txt").status_code, 415)
        self.assertEqual(self.client.get("/api/stats").json()["total"], 0)

    def test_empty_upload_returns_400(self):
        self.assertEqual(self.upload_image(content=b"").status_code, 400)
        self.assertEqual(self.upload_audio(content=b"").status_code, 400)

    def test_file_too_large_returns_413(self):
        with patch("backend.main.MAX_IMAGE_BYTES", 4):
            response = self.upload_image(content=b"12345")
        self.assertEqual(response.status_code, 413)
        with patch("backend.main.MAX_AUDIO_BYTES", 4):
            response = self.upload_audio(content=b"12345")
        self.assertEqual(response.status_code, 413)

    def test_invalid_filename_returns_400(self):
        response = self.upload_image("a" * 201 + ".jpg")
        self.assertEqual(response.status_code, 400)

    def test_windows_path_is_reduced_to_basename(self):
        with patch("backend.main.classify_image", return_value=PREDICTIONS), \
             patch("backend.main.bird_info", new_callable=AsyncMock, return_value=INFO):
            response = self.upload_image("C:\\photos\\bird.jpg")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["filename"], "bird.jpg")

    def test_classifier_errors_map_to_http_and_do_not_save(self):
        errors = [(InvalidMedia("invalid"), 422),
                  (NoBirdFound("no bird"), 422),
                  (ModelUnavailable("model offline"), 503)]
        for error, code in errors:
            with self.subTest(error=type(error).__name__):
                with patch("backend.main.classify_image", side_effect=error):
                    response = self.upload_image()
                self.assertEqual(response.status_code, code)
                self.assertEqual(self.client.get("/api/stats").json()["total"], 0)

    def test_audio_classifier_errors_map_to_http(self):
        with patch("backend.main.classify_audio", side_effect=InvalidMedia("broken audio")):
            response = self.upload_audio()
        self.assertEqual(response.status_code, 422)
        self.assertEqual(self.client.get("/api/stats").json()["total"], 0)

    def test_history_search_and_delete(self):
        with patch("backend.main.classify_image", return_value=PREDICTIONS), \
             patch("backend.main.bird_info", new_callable=AsyncMock, return_value=INFO):
            item_id = self.upload_image().json()["id"]
        response = self.client.get("/api/history", params={"search": "Test"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()[0]["id"], item_id)
        self.assertEqual(self.client.get("/api/history", params={"search": "Unknown"}).json(), [])
        self.assertEqual(self.client.delete(f"/api/history/{item_id}").json(), {"deleted": True})
        self.assertEqual(self.client.delete(f"/api/history/{item_id}").status_code, 404)

    def test_history_search_longer_than_150_returns_422(self):
        response = self.client.get("/api/history", params={"search": "x" * 151})
        self.assertEqual(response.status_code, 422)

    def test_export_csv_headers_and_content(self):
        with patch("backend.main.classify_image", return_value=PREDICTIONS), \
             patch("backend.main.bird_info", new_callable=AsyncMock, return_value=INFO):
            self.upload_image()
        response = self.client.get("/api/export")
        self.assertEqual(response.status_code, 200)
        self.assertIn("text/csv", response.headers["content-type"])
        self.assertIn("bird_analysis.csv", response.headers["content-disposition"])
        self.assertTrue(response.content.startswith(b"\xef\xbb\xbf"))
        self.assertIn("Test bird", response.text)

    def test_empty_statistics(self):
        response = self.client.get("/api/stats")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["total"], 0)
        self.assertEqual(response.json()["frequent_species"], [])


if __name__ == "__main__":
    unittest.main()
