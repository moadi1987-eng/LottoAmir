import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from unittest import mock

from openpyxl import Workbook, load_workbook

from scripts.update_lotto_results import (
    DrawRecord,
    UpdateError,
    parse_csv,
    read_workbook,
    select_current_era,
    update_from_bytes,
    validate_records,
    write_workbook_atomic,
)


def official_csv_bytes(rows, encoding="cp1255"):
    header = (
        "\u05de\u05e1\u05e4\u05e8 \u05d4\u05d2\u05e8\u05dc\u05d4,"
        "\u05ea\u05d0\u05e8\u05d9\u05da,1,2,3,4,5,6,\u05d7\u05d6\u05e7,\u05e4\u05e8\u05e1,\u05d6\u05d5\u05db\u05d9\u05dd"
    )
    text = "\r\n".join([header, *[",".join(map(str, row)) for row in rows]])
    return text.encode(encoding)


def record(draw_number, draw_date, numbers, strong):
    return DrawRecord(draw_number, draw_date, tuple(numbers), strong)


class CsvParsingTests(unittest.TestCase):
    def setUp(self):
        self.rows = [
            (3944, "11/07/2026", 7, 14, 28, 30, 31, 37, 1, 0, 0),
            (3943, "07/07/2026", 5, 15, 16, 27, 32, 37, 2, 0, 1),
            (3942, "04/07/2026", 6, 7, 18, 19, 23, 34, 1, 2, 0),
        ]

    def test_parses_cp1255_official_rows_into_typed_records(self):
        records = parse_csv(official_csv_bytes(self.rows))

        self.assertEqual(len(records), 3)
        self.assertEqual(
            records[0],
            record(3944, "11/07/2026", (7, 14, 28, 30, 31, 37), 1),
        )
        self.assertEqual(records[-1].draw_number, 3942)

    def test_parses_utf8_with_bom(self):
        records = parse_csv(official_csv_bytes(self.rows, encoding="utf-8-sig"))

        self.assertEqual(records[1].draw_date, "07/07/2026")

    def test_rejects_malformed_data_row(self):
        bad_rows = [(3944, "11/07/2026", 7, 14, 28, "bad", 31, 37, 1, 0, 0)]

        with self.assertRaisesRegex(UpdateError, "CSV row 2"):
            parse_csv(official_csv_bytes(bad_rows))


class EraSelectionTests(unittest.TestCase):
    def setUp(self):
        self.records = [
            record(3944, "11/07/2026", (7, 14, 28, 30, 31, 37), 1),
            record(3943, "07/07/2026", (5, 15, 16, 27, 32, 37), 2),
            record(3942, "04/07/2026", (6, 7, 18, 19, 23, 34), 1),
            record(9934, "30/06/2026", (1, 2, 3, 4, 5, 49), 49),
        ]

    def test_selects_only_contiguous_prefix_down_to_existing_oldest_draw(self):
        selected = select_current_era(self.records, oldest_draw=3942)

        self.assertEqual([item.draw_number for item in selected], [3944, 3943, 3942])

    def test_rejects_gap_before_existing_oldest_draw(self):
        records_with_gap = [self.records[0], self.records[2]]

        with self.assertRaisesRegex(UpdateError, "expected draw 3943"):
            select_current_era(records_with_gap, oldest_draw=3942)

    def test_rejects_missing_existing_oldest_draw(self):
        with self.assertRaisesRegex(UpdateError, "did not contain existing oldest draw 3941"):
            select_current_era(self.records[:3], oldest_draw=3941)


class RecordValidationTests(unittest.TestCase):
    def valid_records(self):
        return [
            record(3944, "11/07/2026", (7, 14, 28, 30, 31, 37), 1),
            record(3943, "07/07/2026", (5, 15, 16, 27, 32, 37), 8),
        ]

    def test_accepts_historical_strong_eight(self):
        validate_records(self.valid_records(), existing_newest=3943, existing_count=1)

    def test_rejects_duplicate_regular_numbers(self):
        rows = self.valid_records()
        rows[1] = record(3943, "07/07/2026", (5, 5, 16, 27, 32, 37), 2)

        with self.assertRaisesRegex(UpdateError, "six unique regular numbers"):
            validate_records(rows, existing_newest=3943, existing_count=1)

    def test_rejects_regular_number_outside_current_game_range(self):
        rows = self.valid_records()
        rows[1] = record(3943, "07/07/2026", (5, 15, 16, 27, 32, 38), 2)

        with self.assertRaisesRegex(UpdateError, "regular number outside 1..37"):
            validate_records(rows, existing_newest=3943, existing_count=1)

    def test_rejects_historical_strong_outside_one_through_eight(self):
        rows = self.valid_records()
        rows[1] = record(3943, "07/07/2026", (5, 15, 16, 27, 32, 37), 9)

        with self.assertRaisesRegex(UpdateError, "strong number outside 1..8"):
            validate_records(rows, existing_newest=3943, existing_count=1)

    def test_rejects_newest_strong_eight(self):
        rows = self.valid_records()
        rows[0] = record(3944, "11/07/2026", (7, 14, 28, 30, 31, 37), 8)

        with self.assertRaisesRegex(UpdateError, "newest draw strong number outside 1..7"):
            validate_records(rows, existing_newest=3943, existing_count=1)

    def test_rejects_download_older_or_shorter_than_workbook(self):
        with self.assertRaisesRegex(UpdateError, "older than workbook"):
            validate_records(self.valid_records(), existing_newest=3945, existing_count=1)

        with self.assertRaisesRegex(UpdateError, "shorter than workbook"):
            validate_records(self.valid_records(), existing_newest=3943, existing_count=3)


class WorkbookUpdateTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.workbook_path = Path(self.temp_dir.name) / "NUMBERS.xlsx"

        workbook = Workbook()
        sheet = workbook.active
        sheet.title = "111"
        sheet.append([3943, datetime(2026, 7, 7), 5, 15, 16, 27, 32, 37, 2])
        sheet.append([3942, "04/07/2026", 6, 7, 18, 19, 23, 34, 1])
        sheet["A10"].number_format = "0"
        workbook.save(self.workbook_path)

        self.csv_bytes = official_csv_bytes(
            [
                (3944, "11/07/2026", 7, 14, 28, 30, 31, 37, 1, 0, 0),
                (3943, "07/07/2026", 5, 15, 16, 27, 32, 37, 2, 0, 1),
                (3942, "04/07/2026", 6, 7, 18, 19, 23, 34, 1, 2, 0),
            ]
        )

    def test_updates_workbook_atomically_in_existing_format(self):
        changed = update_from_bytes(self.workbook_path, self.csv_bytes)

        self.assertTrue(changed)
        workbook = load_workbook(self.workbook_path, read_only=True, data_only=True)
        self.assertEqual(workbook.sheetnames, ["111"])
        sheet = workbook["111"]
        values = list(sheet.iter_rows(values_only=True))
        self.assertEqual(len(values), 3)
        self.assertEqual(values[0], (3944, "11/07/2026", 7, 14, 28, 30, 31, 37, 1))
        self.assertEqual(values[-1][0], 3942)
        self.assertTrue(all(len(row) == 9 for row in values))
        workbook.close()

        styled_workbook = load_workbook(self.workbook_path, read_only=False)
        styled_sheet = styled_workbook["111"]
        self.assertEqual(styled_sheet.column_dimensions["A"].width, 10)
        self.assertEqual(styled_sheet.column_dimensions["B"].width, 14)
        for column in "CDEFGHI":
            self.assertEqual(styled_sheet.column_dimensions[column].width, 7)
        styled_workbook.close()

    def test_does_not_rewrite_identical_normalized_data(self):
        self.assertTrue(update_from_bytes(self.workbook_path, self.csv_bytes))
        first_bytes = self.workbook_path.read_bytes()

        changed = update_from_bytes(self.workbook_path, self.csv_bytes)

        self.assertFalse(changed)
        self.assertEqual(self.workbook_path.read_bytes(), first_bytes)

    def test_invalid_download_leaves_existing_workbook_untouched(self):
        original_bytes = self.workbook_path.read_bytes()
        bad_csv = official_csv_bytes(
            [(3944, "11/07/2026", 7, 7, 28, 30, 31, 37, 1, 0, 0)]
        )

        with self.assertRaises(UpdateError):
            update_from_bytes(self.workbook_path, bad_csv)

        self.assertEqual(self.workbook_path.read_bytes(), original_bytes)

    def test_rejects_valid_looking_changes_to_existing_draw_history(self):
        original_bytes = self.workbook_path.read_bytes()
        changed_history = official_csv_bytes(
            [
                (3944, "11/07/2026", 7, 14, 28, 30, 31, 37, 1, 0, 0),
                (3943, "07/07/2026", 4, 15, 16, 27, 32, 37, 2, 0, 1),
                (3942, "04/07/2026", 6, 7, 18, 19, 23, 34, 1, 2, 0),
            ]
        )

        with self.assertRaisesRegex(UpdateError, "changed existing draw 3943"):
            update_from_bytes(self.workbook_path, changed_history)

        self.assertEqual(self.workbook_path.read_bytes(), original_bytes)

    def test_replace_failure_leaves_original_workbook_and_cleans_temporary_file(self):
        original_bytes = self.workbook_path.read_bytes()
        snapshot = read_workbook(self.workbook_path)

        with mock.patch(
            "scripts.update_lotto_results.os.replace",
            side_effect=OSError("simulated replace failure"),
        ):
            with self.assertRaisesRegex(UpdateError, "Could not write workbook atomically"):
                write_workbook_atomic(
                    self.workbook_path, snapshot.records, snapshot.sheet_name
                )

        self.assertEqual(self.workbook_path.read_bytes(), original_bytes)
        self.assertEqual(list(self.workbook_path.parent.glob(".NUMBERS-*.xlsx")), [])

    def test_temporary_save_failure_leaves_original_workbook_untouched(self):
        original_bytes = self.workbook_path.read_bytes()
        snapshot = read_workbook(self.workbook_path)

        with mock.patch.object(
            Workbook, "save", side_effect=OSError("simulated save failure")
        ):
            with self.assertRaisesRegex(UpdateError, "Could not write workbook atomically"):
                write_workbook_atomic(
                    self.workbook_path, snapshot.records, snapshot.sheet_name
                )

        self.assertEqual(self.workbook_path.read_bytes(), original_bytes)
        self.assertEqual(list(self.workbook_path.parent.glob(".NUMBERS-*.xlsx")), [])

    def test_temporary_verification_failure_leaves_original_workbook_untouched(self):
        original_bytes = self.workbook_path.read_bytes()
        snapshot = read_workbook(self.workbook_path)
        mismatched_snapshot = mock.Mock(sheet_name="111", records=())

        with mock.patch(
            "scripts.update_lotto_results.read_workbook",
            return_value=mismatched_snapshot,
        ):
            with self.assertRaisesRegex(
                UpdateError, "Temporary workbook verification did not match"
            ):
                write_workbook_atomic(
                    self.workbook_path, snapshot.records, snapshot.sheet_name
                )

        self.assertEqual(self.workbook_path.read_bytes(), original_bytes)
        self.assertEqual(list(self.workbook_path.parent.glob(".NUMBERS-*.xlsx")), [])


class RepositoryWorkbookContractTests(unittest.TestCase):
    def test_repository_workbook_keeps_the_current_game_era_boundary(self):
        workbook_path = Path(__file__).resolve().parents[1] / "NUMBERS.xlsx"
        snapshot = read_workbook(workbook_path)

        self.assertEqual(snapshot.sheet_name, "111")
        self.assertGreaterEqual(snapshot.newest_draw, 3944)
        self.assertEqual(snapshot.oldest_draw, 2233)
        self.assertEqual(
            snapshot.record_count, snapshot.newest_draw - snapshot.oldest_draw + 1
        )

        workbook = load_workbook(workbook_path, read_only=True, data_only=True)
        sheet = workbook[snapshot.sheet_name]
        self.assertEqual(sheet.max_column, 9)
        workbook.close()


class WorkflowContractTests(unittest.TestCase):
    def test_scheduled_workflow_runs_tests_and_commits_only_workbook_changes(self):
        workflow_path = (
            Path(__file__).resolve().parents[1]
            / ".github"
            / "workflows"
            / "update-lotto-results.yml"
        )

        self.assertTrue(workflow_path.is_file(), "Updater workflow must exist")
        workflow = workflow_path.read_text(encoding="utf-8")
        required_fragments = (
            "schedule:",
            'cron: "17 */6 * * *"',
            "workflow_dispatch:",
            "contents: write",
            "pages: write",
            "concurrency:",
            "ref: main",
            "python -m unittest tests/test_update_lotto_results.py -v",
            "python scripts/update_lotto_results.py",
            "git diff --quiet -- NUMBERS.xlsx",
            "git add NUMBERS.xlsx",
            "git push origin HEAD:main",
            "pages/builds",
            "pages/builds/latest",
            'status" == "built',
        )
        for fragment in required_fragments:
            with self.subTest(fragment=fragment):
                self.assertIn(fragment, workflow)


if __name__ == "__main__":
    unittest.main()
