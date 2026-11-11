import unittest
from pathlib import Path

from backend import settings


class SettingsTests(unittest.TestCase):
    def test_root_points_to_project_directory(self):
        expected = Path(settings.__file__).resolve().parents[1]
        self.assertIsInstance(settings.ROOT, Path)
        self.assertEqual(settings.ROOT, expected)
        self.assertTrue(settings.ROOT.is_absolute())

    def test_database_path_is_inside_project_data_directory(self):
        self.assertIsInstance(settings.DB_PATH, Path)
        self.assertEqual(settings.DB_PATH, settings.ROOT / "data" / "birds.sqlite3")
        self.assertEqual(settings.DB_PATH.suffix, ".sqlite3")

    def test_model_names_are_nonempty_hugging_face_identifiers(self):
        names = (settings.IMAGE_MODEL, settings.DETECTOR_MODEL, settings.AUDIO_MODEL)
        self.assertEqual(len(names), len(set(names)))
        for name in names:
            with self.subTest(model=name):
                self.assertIsInstance(name, str)
                self.assertEqual(len(name.split("/")), 2)
                self.assertTrue(all(part.strip() for part in name.split("/")))

    def test_upload_limits_are_positive_integer_bytes(self):
        for name in ("MAX_IMAGE_BYTES", "MAX_AUDIO_BYTES"):
            with self.subTest(setting=name):
                limit = getattr(settings, name)
                self.assertIsInstance(limit, int)
                self.assertGreater(limit, 0)
        self.assertLessEqual(settings.MAX_IMAGE_BYTES, settings.MAX_AUDIO_BYTES)

    def test_image_pixel_limit_is_positive_integer(self):
        self.assertIsInstance(settings.MAX_IMAGE_PIXELS, int)
        self.assertGreater(settings.MAX_IMAGE_PIXELS, 0)

    def test_detection_threshold_is_valid_probability(self):
        self.assertIsInstance(settings.MIN_DETECTION_SCORE, (int, float))
        self.assertGreaterEqual(settings.MIN_DETECTION_SCORE, 0)
        self.assertLessEqual(settings.MIN_DETECTION_SCORE, 1)

    def test_audio_parameters_are_positive_integers(self):
        for name in ("AUDIO_SAMPLE_RATE", "AUDIO_MAX_SECONDS"):
            with self.subTest(setting=name):
                value = getattr(settings, name)
                self.assertIsInstance(value, int)
                self.assertGreater(value, 0)

    def test_not_found_is_nonempty_message(self):
        self.assertIsInstance(settings.NOT_FOUND, str)
        self.assertTrue(settings.NOT_FOUND.strip())


if __name__ == "__main__":
    unittest.main()
