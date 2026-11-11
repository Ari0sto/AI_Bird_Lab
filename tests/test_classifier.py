from pathlib import Path
import io
import subprocess
import unittest
from unittest.mock import Mock, patch

import numpy as np
from PIL import Image

from backend import classifier as c


def make_image(width=100, height=80):
    buffer = io.BytesIO()
    Image.new("RGB", (width, height), "green").save(buffer, format="PNG")
    return buffer.getvalue()


class ImageClassificationTests(unittest.TestCase):
    def setUp(self):
        self.data = make_image()

    def test_invalid_image(self):
        with self.assertRaises(c.InvalidMedia):
            c.classify_image(b"not an image")

    def test_too_many_pixels(self):
        with patch.object(c, "MAX_IMAGE_PIXELS", 50):
            with self.assertRaisesRegex(c.InvalidMedia, "слишком большое"):
                c.classify_image(self.data)

    def test_no_bird_detection(self):
        with patch.object(c, "get_pipeline", return_value=lambda *a, **kw: [{"label": "cat", "score": 0.95}]):
            with self.assertRaises(c.NoBirdFound):
                c.classify_image(self.data)

    def test_detection_is_case_insensitive_and_best_bird_is_cropped(self):
        detector = Mock(return_value=[
            {"label": "BIRD", "score": 0.71, "box": {"xmin": 0, "ymin": 0, "xmax": 60, "ymax": 50}},
            {"label": "bird", "score": 0.94, "box": {"xmin": -15, "ymin": 2, "xmax": 90, "ymax": 70}},
            {"label": "dog", "score": 0.99},
        ])
        model = Mock(return_value=[{"label": "Sparrow", "score": np.float32(0.8)}])
        with patch.object(c, "get_pipeline", side_effect=[detector, model]) as pipeline:
            result = c.classify_image(self.data)
        self.assertEqual(result, [{"species": "Sparrow", "confidence": float(np.float32(0.8))}])
        self.assertEqual(model.call_args.args[0].size, (90, 68))
        self.assertEqual(model.call_args.kwargs["top_k"], 3)
        self.assertEqual([call.args[0] for call in pipeline.call_args_list], ["object-detection", "image-classification"])

    def test_small_detection_uses_whole_image(self):
        detector = Mock(return_value=[{"label": "bird", "score": 0.9, "box": {"xmin": 5, "ymin": 5, "xmax": 20, "ymax": 20}}])
        model = Mock(return_value=[])
        with patch.object(c, "get_pipeline", side_effect=[detector, model]):
            self.assertEqual(c.classify_image(self.data), [])
        self.assertEqual(model.call_args.args[0].size, (100, 80))

    def test_missing_box_defaults_to_entire_image(self):
        detector = Mock(return_value=[{"label": "bird", "score": 0.9}])
        model = Mock(return_value=[{"label": "Crow", "score": 0.3}])
        with patch.object(c, "get_pipeline", side_effect=[detector, model]):
            self.assertEqual(c.classify_image(self.data)[0]["species"], "Crow")
        self.assertEqual(model.call_args.args[0].size, (100, 80))

    def test_model_error_is_wrapped(self):
        with patch.object(c, "get_pipeline", side_effect=RuntimeError("broken inference")):
            with self.assertRaises(c.ModelUnavailable) as error:
                c.classify_image(self.data)
        self.assertIsInstance(error.exception.__cause__, RuntimeError)

    def test_known_model_error_is_preserved(self):
        with patch.object(c, "get_pipeline", side_effect=c.ModelUnavailable("offline")):
            with self.assertRaisesRegex(c.ModelUnavailable, "offline"):
                c.classify_image(self.data)


class PipelineTests(unittest.TestCase):
    def test_pipeline_configuration_and_cache(self):
        c.get_pipeline.cache_clear()
        fake = Mock(return_value="model")
        try:
            with patch.dict("sys.modules", {"transformers": Mock(pipeline=fake)}):
                self.assertEqual(c.get_pipeline("image-classification", "model1"), "model")
                self.assertEqual(c.get_pipeline("image-classification", "model1"), "model")
            fake.assert_called_once_with("image-classification", model="model1", device=-1)
        finally:
            c.get_pipeline.cache_clear()

    def test_pipeline_failure_is_wrapped(self):
        c.get_pipeline.cache_clear()
        try:
            with patch.dict("sys.modules", {"transformers": Mock(pipeline=Mock(side_effect=RuntimeError("offline")))}):
                with self.assertRaises(c.ModelUnavailable):
                    c.get_pipeline("object-detection", "missing")
        finally:
            c.get_pipeline.cache_clear()


class AudioDecodeTests(unittest.TestCase):
    def test_successful_conversion(self):
        samples = np.ones(c.AUDIO_SAMPLE_RATE, dtype=np.float32) * 0.1

        def ffmpeg(command, **kwargs):
            self.assertIn("-ac", command)
            self.assertEqual(command[command.index("-ac") + 1], "1")
            self.assertEqual(command[command.index("-ar") + 1], str(c.AUDIO_SAMPLE_RATE))
            self.assertEqual(command[command.index("-t") + 1], str(c.AUDIO_MAX_SECONDS))
            self.assertEqual(Path(command[command.index("-i") + 1]).name, "input.mp3")
            Path(command[-1]).touch()
            return Mock(returncode=0)

        with patch.object(c.subprocess, "run", side_effect=ffmpeg), \
             patch.object(c.sf, "read", return_value=(samples, c.AUDIO_SAMPLE_RATE)) as reader:
            result = c.decode_audio(b"sound", ".mp3")
        np.testing.assert_array_equal(result, samples)
        self.assertEqual(reader.call_args.kwargs, {"dtype": "float32", "always_2d": False})

    def test_ffmpeg_missing(self):
        with patch.object(c.subprocess, "run", side_effect=FileNotFoundError):
            with self.assertRaisesRegex(c.InvalidMedia, "FFmpeg не установлен"):
                c.decode_audio(b"x", ".mp3")

    def test_ffmpeg_timeout(self):
        with patch.object(c.subprocess, "run", side_effect=subprocess.TimeoutExpired("ffmpeg", 45)):
            with self.assertRaisesRegex(c.InvalidMedia, "Превышено время"):
                c.decode_audio(b"x", ".mp3")

    def test_ffmpeg_error_exit(self):
        with patch.object(c.subprocess, "run", return_value=Mock(returncode=1)):
            with self.assertRaisesRegex(c.InvalidMedia, "повреждён"):
                c.decode_audio(b"x", ".mp3")

    def test_ffmpeg_missing_output(self):
        with patch.object(c.subprocess, "run", return_value=Mock(returncode=0)):
            with self.assertRaises(c.InvalidMedia):
                c.decode_audio(b"x", ".mp3")

    def test_soundfile_read_error(self):
        def ffmpeg(command, **kwargs):
            Path(command[-1]).touch()
            return Mock(returncode=0)

        with patch.object(c.subprocess, "run", side_effect=ffmpeg), \
             patch.object(c.sf, "read", side_effect=OSError("decode failed")):
            with self.assertRaisesRegex(c.InvalidMedia, "Не удалось декодировать"):
                c.decode_audio(b"x", ".wav")

    def test_invalid_samples(self):
        def ffmpeg(command, **kwargs):
            Path(command[-1]).touch()
            return Mock(returncode=0)

        valid = np.ones(c.AUDIO_SAMPLE_RATE, dtype=np.float32) * .1
        problems = [
            (valid, c.AUDIO_SAMPLE_RATE + 1),
            (valid.reshape(-1, 2), c.AUDIO_SAMPLE_RATE),
            (valid[:100], c.AUDIO_SAMPLE_RATE),
            (np.zeros(c.AUDIO_SAMPLE_RATE, dtype=np.float32), c.AUDIO_SAMPLE_RATE),
            (np.full(c.AUDIO_SAMPLE_RATE, np.nan, dtype=np.float32), c.AUDIO_SAMPLE_RATE),
            (np.ones(c.AUDIO_SAMPLE_RATE, dtype=np.float32) * .0005, c.AUDIO_SAMPLE_RATE),
        ]
        for samples, rate in problems:
            with self.subTest(samples_shape=samples.shape, rate=rate, first=float(samples.flat[0])):
                with patch.object(c.subprocess, "run", side_effect=ffmpeg), \
                     patch.object(c.sf, "read", return_value=(samples, rate)):
                    with self.assertRaises(c.InvalidMedia):
                        c.decode_audio(b"x", ".wav")


class AudioClassificationTests(unittest.TestCase):
    def test_three_segments_average_rank_and_top_three(self):
        samples = np.ones(12 * c.AUDIO_SAMPLE_RATE, dtype=np.float32)
        responses = [
            [{"label": "A", "score": .9}, {"label": "B", "score": .2}],
            [{"label": "A", "score": .3}, {"label": "C", "score": .8}],
            [{"label": "D", "score": .7}, {"label": "B", "score": .9}],
        ]
        model = Mock(side_effect=responses)
        with patch.object(c, "decode_audio", return_value=samples) as decoder, \
             patch.object(c, "get_pipeline", return_value=model):
            result = c.classify_audio(b"audio", ".ogg")
        decoder.assert_called_once_with(b"audio", ".ogg")
        self.assertEqual([v["species"] for v in result], ["A", "B", "C"])
        self.assertAlmostEqual(result[0]["confidence"], .4)
        self.assertAlmostEqual(result[1]["confidence"], 1.1 / 3)
        self.assertEqual(model.call_count, 3)
        offsets = [0, 3 * c.AUDIO_SAMPLE_RATE + c.AUDIO_SAMPLE_RATE // 2, 7 * c.AUDIO_SAMPLE_RATE]
        self.assertEqual([call.args[0]["array"].size for call in model.call_args_list], [5*c.AUDIO_SAMPLE_RATE]*3)
        self.assertTrue(all(call.kwargs["top_k"] is None for call in model.call_args_list))

    def test_short_audio_single_segment(self):
        model = Mock(return_value=[{"label": "Robin", "score": .75}])
        with patch.object(c, "decode_audio", return_value=np.ones(c.AUDIO_SAMPLE_RATE)), \
             patch.object(c, "get_pipeline", return_value=model):
            result = c.classify_audio(b"x", ".wav")
        self.assertEqual(result, [{"species": "Robin", "confidence": .75}])
        self.assertEqual(model.call_count, 1)

    def test_no_scores_raises(self):
        with patch.object(c, "decode_audio", return_value=np.ones(c.AUDIO_SAMPLE_RATE)), \
             patch.object(c, "get_pipeline", return_value=Mock(return_value=[])):
            with self.assertRaisesRegex(c.ModelUnavailable, "не вернула результатов"):
                c.classify_audio(b"x", ".wav")

    def test_audio_model_error_is_wrapped(self):
        with patch.object(c, "decode_audio", return_value=np.ones(c.AUDIO_SAMPLE_RATE)), \
             patch.object(c, "get_pipeline", return_value=Mock(side_effect=RuntimeError("crash"))):
            with self.assertRaisesRegex(c.ModelUnavailable, "Ошибка выполнения модели"):
                c.classify_audio(b"x", ".wav")

    def test_audio_model_unavailable_is_preserved(self):
        with patch.object(c, "decode_audio", return_value=np.ones(c.AUDIO_SAMPLE_RATE)), \
             patch.object(c, "get_pipeline", side_effect=c.ModelUnavailable("offline")):
            with self.assertRaisesRegex(c.ModelUnavailable, "offline"):
                c.classify_audio(b"x", ".wav")

    def test_audio_decode_error_is_preserved(self):
        with patch.object(c, "decode_audio", side_effect=c.InvalidMedia("bad input")):
            with self.assertRaisesRegex(c.InvalidMedia, "bad input"):
                c.classify_audio(b"x", ".wav")


if __name__ == "__main__":
    unittest.main()
