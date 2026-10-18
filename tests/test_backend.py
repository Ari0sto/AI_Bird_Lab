"""Tests run without downloading the real Hugging Face weights."""
import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient
from PIL import Image

from backend import storage
from backend.classifier import NoBirdFound, InvalidMedia, classify_image
from backend.main import app
from backend.wiki import NOT_FOUND


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.original_db = storage.DB_PATH
        storage.DB_PATH = Path(self.folder.name) / "db.sqlite3"
        self.client_context = TestClient(app)
        self.client = self.client_context.__enter__()

    def tearDown(self):
        self.client_context.__exit__(None, None, None)
        storage.DB_PATH = self.original_db
        self.folder.cleanup()

    def test_workflow(self):
        info = {"scientific_name": "Testus avis", "family": NOT_FOUND,
                "range": NOT_FOUND, "diet": NOT_FOUND, "description": "Verified text",
                "wikipedia_url": None, "wikidata_url": None}
        with patch('backend.main.classify_image', return_value=[
            {"species": "Test bird", "confidence": 0.92},
            {"species": "Bird B", "confidence": 0.05},
            {"species": "Bird C", "confidence": 0.03},
        ]), patch('backend.main.bird_info', new_callable=AsyncMock, return_value=info):
            response = self.client.post('/api/analyze/image',
                                        files={'file': ('bird.jpg', b'image', 'image/jpeg')})
        self.assertEqual(response.status_code, 200, response.text)
        identifier = response.json()['id']
        self.assertEqual(len(response.json()['predictions']), 3)
        self.assertEqual(self.client.get('/api/history?search=Test').json()[0]['id'], identifier)
        self.assertEqual(self.client.get('/api/stats').json()['total'], 1)
        csv_text = self.client.get('/api/export').text
        self.assertIn('image_name,predicted_species,confidence,analysis_date,description', csv_text)
        self.assertIn('Test bird', csv_text)
        self.assertEqual(self.client.delete(f'/api/history/{identifier}').status_code, 200)
        self.assertEqual(self.client.get('/api/stats').json()['total'], 0)
        self.assertEqual(self.client.delete(f'/api/history/{identifier}').status_code, 404)

    def test_invalid_extension(self):
        response = self.client.post('/api/analyze/image',
                                    files={'file': ('data.exe', b'bad', 'application/octet-stream')})
        self.assertEqual(response.status_code, 415)
        self.assertEqual(self.client.get('/api/stats').json()['total'], 0)

    def test_no_bird_not_saved(self):
        with patch('backend.main.classify_image', side_effect=NoBirdFound('No bird')):
            response = self.client.post('/api/analyze/image',
                                        files={'file': ('a.png', b'a', 'image/png')})
        self.assertEqual(response.status_code, 422)
        self.assertEqual(self.client.get('/api/stats').json()['total'], 0)


class ImageTests(unittest.TestCase):
    def test_invalid_image(self):
        with self.assertRaises(InvalidMedia):
            classify_image(b'not an image')

    def test_empty_detection(self):
        stream = io.BytesIO()
        Image.new('RGB', (100, 100), 'green').save(stream, format='PNG')
        with patch('backend.classifier.get_pipeline', return_value=lambda *args, **kwargs: []):
            with self.assertRaises(NoBirdFound):
                classify_image(stream.getvalue())


if __name__ == '__main__':
    unittest.main()
