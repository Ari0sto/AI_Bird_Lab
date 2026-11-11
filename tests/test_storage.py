from contextlib import closing
import csv
import io
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from backend import storage


class StorageTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.db_path = Path(self.directory.name) / 'nested' / 'bird_test.sqlite3'
        self.path_patch = patch.object(storage, 'DB_PATH', self.db_path)
        self.path_patch.start()
        storage.init_db()

    def tearDown(self):
        self.path_patch.stop()
        self.directory.cleanup()

    def add(self, filename='bird.jpg', species='Robin', score=0.9,
            description='Small bird', media_type='image'):
        return storage.add_analysis(filename, species, score, description, media_type)

    def test_database_and_directory_created(self):
        self.assertTrue(self.db_path.is_file())
        with storage.connect() as db:
            tables = db.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
            self.assertIn('analyses', [row['name'] for row in tables])

    def test_init_db_is_repeatable_and_keeps_data(self):
        item_id = self.add()
        storage.init_db()
        self.assertEqual(storage.list_analyses()[0]['id'], item_id)

    def test_old_schema_migration_adds_user_id(self):
        self.db_path.unlink()
        with closing(sqlite3.connect(self.db_path)) as db:
            db.execute('''CREATE TABLE analyses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                image_name TEXT NOT NULL,
                predicted_species TEXT NOT NULL,
                confidence REAL NOT NULL,
                analysis_date TEXT NOT NULL,
                description TEXT NOT NULL,
                media_type TEXT NOT NULL CHECK (media_type IN ('image', 'audio'))
            )''')
            db.execute("INSERT INTO analyses (image_name,predicted_species,confidence,analysis_date,description,media_type) VALUES ('old.jpg','Sparrow',0.8,'date','old entry','image')")
            db.commit()
        storage.init_db()
        with storage.connect() as db:
            columns = [row['name'] for row in db.execute('PRAGMA table_info(analyses)')]
            indexes = [row['name'] for row in db.execute('PRAGMA index_list(analyses)')]
        self.assertIn('user_id', columns)
        self.assertIn('idx_species', indexes)
        self.assertIn('idx_user_id', indexes)
        self.assertEqual(storage.list_analyses()[0]['predicted_species'], 'Sparrow')

    def test_add_analysis_returns_id_and_saves_fields(self):
        item_id = self.add(filename='song.wav', species='Nightingale', score=0.75,
                           description='Sings', media_type='audio')
        record = storage.list_analyses()[0]
        self.assertEqual(record['id'], item_id)
        self.assertEqual(record['image_name'], 'song.wav')
        self.assertEqual(record['predicted_species'], 'Nightingale')
        self.assertAlmostEqual(record['confidence'], 0.75)
        self.assertEqual(record['description'], 'Sings')
        self.assertEqual(record['media_type'], 'audio')
        self.assertIsNone(record['user_id'])
        self.assertRegex(record['analysis_date'], r'^\d{4}-\d\d-\d\dT')

    def test_add_analysis_auto_increments_ids(self):
        first = self.add()
        second = self.add()
        self.assertGreater(second, first)

    def test_invalid_media_type_is_rejected(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.add(media_type='video')
        self.assertEqual(storage.list_analyses(), [])

    def test_list_empty(self):
        self.assertEqual(storage.list_analyses(), [])

    def test_list_newest_first(self):
        first = self.add(species='A')
        second = self.add(species='B')
        self.assertEqual([r['id'] for r in storage.list_analyses()], [second, first])

    def test_search_is_case_insensitive_and_trimmed(self):
        self.add(species='European Robin')
        self.add(species='Sparrow')
        self.assertEqual([x['predicted_species'] for x in storage.list_analyses('  robin  ')], ['European Robin'])

    def test_search_escapes_percent_and_underscore(self):
        self.add(species='Bird_100%')
        self.add(species='BirdX100Y')
        self.assertEqual([x['predicted_species'] for x in storage.list_analyses('_100%')], ['Bird_100%'])

    def test_search_escapes_backslash(self):
        self.add(species=r'Bird\test')
        self.add(species='Bird_test')
        self.assertEqual([x['predicted_species'] for x in storage.list_analyses('Bird\\')], [r'Bird\test'])

    def test_whitespace_search_lists_all(self):
        self.add(species='Robin')
        self.add(species='Sparrow')
        self.assertEqual(len(storage.list_analyses('   ')), 2)

    def test_delete_existing(self):
        item_id = self.add()
        self.assertTrue(storage.delete_analysis(item_id))
        self.assertEqual(storage.list_analyses(), [])

    def test_delete_missing(self):
        self.assertFalse(storage.delete_analysis(12345))

    def test_statistics_empty(self):
        stats = storage.statistics()
        self.assertEqual(stats, {'total': 0, 'max_confidence': None,
                                 'min_confidence': None, 'frequent_species': []})

    def test_statistics_counts_confidence_and_tie_order(self):
        self.add(species='Zebra finch', score=0.2)
        self.add(species='Robin', score=0.95)
        self.add(species='Robin', score=0.5)
        self.add(species='Albatross', score=0.8)
        stats = storage.statistics()
        self.assertEqual(stats['total'], 4)
        self.assertAlmostEqual(stats['max_confidence'], 0.95)
        self.assertAlmostEqual(stats['min_confidence'], 0.2)
        self.assertEqual(stats['frequent_species'], [
            {'species': 'Robin', 'count': 2},
            {'species': 'Albatross', 'count': 1},
            {'species': 'Zebra finch', 'count': 1},
        ])

    def test_statistics_limits_to_ten_species(self):
        for index in range(12):
            self.add(species=f'Bird {index:02d}')
        stats = storage.statistics()
        self.assertEqual(stats['total'], 12)
        self.assertEqual(len(stats['frequent_species']), 10)

    def test_export_empty_csv_header(self):
        rows = list(csv.reader(io.StringIO(storage.export_csv())))
        self.assertEqual(rows, [['image_name', 'predicted_species', 'confidence',
                                 'analysis_date', 'description']])

    def test_export_data_and_newest_first(self):
        self.add(filename='first.jpg', species='Robin', score=0.5, description='First')
        self.add(filename='second.wav', species='Sparrow', score=0.7, description='Second', media_type='audio')
        rows = list(csv.DictReader(io.StringIO(storage.export_csv())))
        self.assertEqual(len(rows), 2)
        self.assertEqual([row['image_name'] for row in rows], ['second.wav', 'first.jpg'])
        self.assertEqual(rows[0]['predicted_species'], 'Sparrow')
        self.assertEqual(float(rows[0]['confidence']), 0.7)
        self.assertEqual(rows[0]['description'], 'Second')

    def test_export_csv_preserves_unicode_and_commas(self):
        self.add(filename='птица,1.jpg', species='Синица', description='Описание, с запятой')
        record = next(csv.DictReader(io.StringIO(storage.export_csv())))
        self.assertEqual(record['image_name'], 'птица,1.jpg')
        self.assertEqual(record['predicted_species'], 'Синица')
        self.assertEqual(record['description'], 'Описание, с запятой')

    def test_export_escapes_spreadsheet_formulas(self):
        self.add(filename='=HYPERLINK("x")', species='+SUM(1,1)', description='  @cmd')
        row = next(csv.DictReader(io.StringIO(storage.export_csv())))
        self.assertEqual(row['image_name'], '\'=HYPERLINK("x")')
        self.assertEqual(row['predicted_species'], "'+SUM(1,1)")
        self.assertEqual(row['description'], "'  @cmd")

    def test_connection_commits_changes(self):
        with storage.connect() as db:
            db.execute("INSERT INTO analyses (image_name,predicted_species,confidence,analysis_date,description,media_type) VALUES ('a','b',0.5,'date','desc','image')")
        with storage.connect() as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM analyses').fetchone()[0], 1)

    def test_connection_closes_after_context(self):
        with storage.connect() as db:
            db.execute('SELECT 1')
        with self.assertRaises(sqlite3.ProgrammingError):
            db.execute('SELECT 1')


if __name__ == '__main__':
    unittest.main()
