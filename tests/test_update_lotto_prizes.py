import contextlib
import copy
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import URLError

from openpyxl import Workbook

from scripts.update_lotto_prizes import (
    DrawPrizeRecord,
    PrizeTier,
    UpdateError,
    download_prize_page,
    load_prize_document,
    main as prize_main,
    merge_record,
    normalize_tier_label,
    parse_prize_page,
    update_prize_file,
    verify_prize_coverage,
    write_prize_document_atomic,
)


REGULAR_3947 = (
    ("6 + חזק", "0", "0 ₪"),
    ("6", "1", "250,000 ₪"),
    ("5 + חזק", "16", "8,418 ₪"),
    ("5", "119", "1,252 ₪"),
    ("4 + חזק", "724", "265 ₪"),
    ("4", "4,471", "85 ₪"),
    ("3 + חזק", "11,352", "59 ₪"),
    ("3", "65,488", "15 ₪"),
)


PRIZE_SCHEMA_CONTRACT_FIXTURES_JSON = r"""
{
  "base": {
    "schemaVersion": 1,
    "updatedAt": null,
    "draws": {
      "3947": {
        "drawNumber": 3947,
        "drawDate": "18/07/2026",
        "sourceUrl": "https://www.pais.co.il/Lotto/CurrentLotto.aspx?lotteryId=3947",
        "regular": {
          "6": {"winnerCount": 1, "prizeIls": 250000}
        }
      }
    }
  },
  "cases": [
    {"name": "valid numeric document", "accepted": true, "changes": []},
    {
      "name": "valid canonical decimal strings",
      "accepted": true,
      "changes": [
        {"path": ["draws", "3947", "drawNumber"], "value": "3947"},
        {"path": ["draws", "3947", "regular", "6", "winnerCount"], "value": "1"},
        {"path": ["draws", "3947", "regular", "6", "prizeIls"], "value": "250000"}
      ]
    },
    {
      "name": "invalid date shape",
      "accepted": false,
      "changes": [{"path": ["draws", "3947", "drawDate"], "value": "2026-07-18"}]
    },
    {
      "name": "impossible calendar date",
      "accepted": false,
      "changes": [{"path": ["draws", "3947", "drawDate"], "value": "31/02/2026"}]
    },
    {
      "name": "leading-zero winner count",
      "accepted": false,
      "changes": [{"path": ["draws", "3947", "regular", "6", "winnerCount"], "value": "01"}]
    },
    {
      "name": "scientific prize string",
      "accepted": false,
      "changes": [{"path": ["draws", "3947", "regular", "6", "prizeIls"], "value": "1e3"}]
    },
    {
      "name": "hex winner string",
      "accepted": false,
      "changes": [{"path": ["draws", "3947", "regular", "6", "winnerCount"], "value": "0x10"}]
    },
    {
      "name": "unicode winner digits",
      "accepted": false,
      "changes": [{"path": ["draws", "3947", "regular", "6", "winnerCount"], "value": "1١"}]
    },
    {
      "name": "boolean prize",
      "accepted": false,
      "changes": [{"path": ["draws", "3947", "regular", "6", "prizeIls"], "value": true}]
    },
    {
      "name": "fractional winner count",
      "accepted": false,
      "changes": [{"path": ["draws", "3947", "regular", "6", "winnerCount"], "value": 1.5}]
    },
    {
      "name": "negative-zero winner count",
      "accepted": false,
      "changes": [{"path": ["draws", "3947", "regular", "6", "winnerCount"], "value": -0.0}]
    },
    {
      "name": "unsafe winner count",
      "accepted": false,
      "changes": [{"path": ["draws", "3947", "regular", "6", "winnerCount"], "value": 9007199254740992}]
    },
    {
      "name": "unsafe prize total",
      "accepted": false,
      "changes": [{"path": ["draws", "3947", "regular", "6", "prizeIls"], "value": 9007199254740992}]
    },
    {
      "name": "unsafe draw number",
      "accepted": false,
      "drawKey": "9007199254740992",
      "changes": [
        {"path": ["draws", "3947", "drawNumber"], "value": 9007199254740992},
        {
          "path": ["draws", "3947", "sourceUrl"],
          "value": "https://www.pais.co.il/Lotto/CurrentLotto.aspx?lotteryId=9007199254740992"
        }
      ]
    },
    {
      "name": "leading-zero draw number",
      "accepted": false,
      "drawKey": "1",
      "changes": [
        {"path": ["draws", "3947", "drawNumber"], "value": "01"},
        {
          "path": ["draws", "3947", "sourceUrl"],
          "value": "https://www.pais.co.il/Lotto/CurrentLotto.aspx?lotteryId=1"
        }
      ]
    },
    {
      "name": "boolean schema version",
      "accepted": false,
      "changes": [{"path": ["schemaVersion"], "value": true}]
    },
    {
      "name": "numeric updated timestamp",
      "accepted": false,
      "changes": [{"path": ["updatedAt"], "value": 123}]
    },
    {
      "name": "empty regular table",
      "accepted": false,
      "changes": [{"path": ["draws", "3947", "regular"], "value": {}}]
    }
  ]
}
"""


def build_prize_schema_contract_documents():
    fixtures = json.loads(PRIZE_SCHEMA_CONTRACT_FIXTURES_JSON)
    documents = []
    for case in fixtures["cases"]:
        document = copy.deepcopy(fixtures["base"])
        for change in case["changes"]:
            target = document
            for part in change["path"][:-1]:
                target = target[part]
            target[change["path"][-1]] = change["value"]
        if "drawKey" in case:
            document["draws"][case["drawKey"]] = document["draws"].pop("3947")
        documents.append((case, document))
    return documents


def prize_page(draw_number=3947, draw_date="18/07/2026", regular=REGULAR_3947):
    def rows(values):
        return "".join(
            '<li class="archive_list_item current">'
            f'<div tabindex="0">{tier}</div>'
            f'<div tabindex="0">{winners}</div>'
            f'<div tabindex="0">{prize}</div>'
            "</li>"
            for tier, winners, prize in values
        )

    return (
        "<!doctype html><html><body>"
        f"<h3>תוצאות הגרלה מס' {draw_number}</h3>"
        f"<div>לתאריך</div><div>{draw_date}</div>"
        f'<ol id="regularLottoList">{rows(regular)}</ol>'
        f'<ol id="doubleLottoList">{rows((("6", "9", "999,999 ₪"),))}</ol>'
        "</body></html>"
    ).encode("utf-8")


def write_workbook(path, draw_numbers):
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Lotto"
    for draw_number in draw_numbers:
        sheet.append([draw_number, "18/07/2026", 1, 2, 3, 4, 5, 6, 1])
    workbook.save(path)
    workbook.close()


class PrizeParserTests(unittest.TestCase):
    def test_parses_regular_3947_and_ignores_double_lotto(self):
        source = "https://www.pais.co.il/Lotto/CurrentLotto.aspx?lotteryId=3947"
        record = parse_prize_page(prize_page(), 3947, source)
        self.assertEqual(record.draw_number, 3947)
        self.assertEqual(record.draw_date, "18/07/2026")
        self.assertEqual(record.source_url, source)
        self.assertEqual(record.regular["6"], PrizeTier(1, 250000))
        self.assertEqual(record.regular["3+strong"], PrizeTier(11352, 59))
        self.assertNotEqual(record.regular["6"].prize_ils, 999999)

    def test_normalizes_historical_and_spaced_tiers(self):
        self.assertEqual(normalize_tier_label(" 2 "), "2")
        self.assertEqual(normalize_tier_label("  4  +  חזק "), "4+strong")

    def test_rejects_wrong_draw_empty_table_and_invalid_amount(self):
        with self.assertRaisesRegex(UpdateError, "expected draw 3948"):
            parse_prize_page(prize_page(), 3948, "source")
        with self.assertRaisesRegex(UpdateError, "regular Lotto table is empty"):
            parse_prize_page(prize_page(regular=()), 3947, "source")
        invalid = (("3", "1", "-15 ₪"),)
        with self.assertRaisesRegex(UpdateError, "prize"):
            parse_prize_page(prize_page(regular=invalid), 3947, "source")

    def test_rejects_empty_row_in_regular_lotto_table(self):
        malformed = prize_page().replace(
            b"</ol>",
            b'<li class="archive_list_item current"></li></ol>',
            1,
        )

        with self.assertRaisesRegex(UpdateError, "exactly three values"):
            parse_prize_page(malformed, 3947, "source")

    def test_rejects_malformed_numeric_punctuation(self):
        for invalid in ("1₪2", "1,2,3"):
            with self.subTest(invalid=invalid):
                with self.assertRaisesRegex(UpdateError, "prize"):
                    parse_prize_page(
                        prize_page(regular=(("3", "1", invalid),)),
                        3947,
                        "source",
                    )

    def test_rejects_impossible_draw_date(self):
        with self.assertRaisesRegex(UpdateError, "draw date"):
            parse_prize_page(
                prize_page(draw_date="31/02/2026"),
                3947,
                "source",
            )


class PrizeStoreTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.root = Path(self.temp_dir.name)
        self.prizes = self.root / "LOTTO_PRIZES.json"

    def test_writes_and_loads_valid_document_atomically(self):
        source = "https://www.pais.co.il/Lotto/CurrentLotto.aspx?lotteryId=3947"
        record = parse_prize_page(prize_page(), 3947, source)
        document = {"schemaVersion": 1, "updatedAt": None, "draws": {}}
        self.assertTrue(merge_record(document, record))
        write_prize_document_atomic(self.prizes, document)
        loaded = load_prize_document(self.prizes)
        self.assertEqual(loaded["draws"]["3947"]["regular"]["5"]["prizeIls"], 1252)
        self.assertFalse(any(self.root.glob("*.tmp")))

    def test_existing_history_is_immutable_in_normal_merge(self):
        source = "https://www.pais.co.il/Lotto/CurrentLotto.aspx?lotteryId=3947"
        record = parse_prize_page(prize_page(), 3947, source)
        document = {"schemaVersion": 1, "updatedAt": None, "draws": {}}
        merge_record(document, record)
        changed = DrawPrizeRecord(
            draw_number=3947,
            draw_date="18/07/2026",
            source_url=source,
            regular={"3": PrizeTier(1, 999)},
        )
        with self.assertRaisesRegex(UpdateError, "existing prize history differs"):
            merge_record(document, changed)

    def test_rejects_invalid_or_missing_persisted_draw_date(self):
        source = "https://www.pais.co.il/Lotto/CurrentLotto.aspx?lotteryId=3947"
        record = parse_prize_page(prize_page(), 3947, source)
        document = {"schemaVersion": 1, "updatedAt": None, "draws": {}}
        merge_record(document, record)

        for draw_date in (None, "31/02/2026"):
            with self.subTest(draw_date=draw_date):
                invalid = json.loads(json.dumps(document))
                if draw_date is None:
                    del invalid["draws"]["3947"]["drawDate"]
                else:
                    invalid["draws"]["3947"]["drawDate"] = draw_date
                with self.assertRaisesRegex(UpdateError, "draw date"):
                    write_prize_document_atomic(self.prizes, invalid)


class PrizeSchemaContractTests(unittest.TestCase):
    def test_verify_only_matches_shared_browser_schema_contract(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            workbook = root / "NUMBERS.xlsx"
            prizes = root / "LOTTO_PRIZES.json"
            write_workbook(workbook, [3947])

            for case, document in build_prize_schema_contract_documents():
                with self.subTest(case=case["name"]):
                    prizes.write_text(json.dumps(document), encoding="utf-8")
                    with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(
                        io.StringIO()
                    ):
                        result = prize_main(
                            [
                                "--workbook",
                                str(workbook),
                                "--prizes",
                                str(prizes),
                                "--verify-only",
                            ]
                        )
                    self.assertEqual(result == 0, case["accepted"])


class PrizeUpdateTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.root = Path(self.temp_dir.name)
        self.workbook = self.root / "NUMBERS.xlsx"
        self.prizes = self.root / "LOTTO_PRIZES.json"
        write_workbook(self.workbook, [3947, 3946])

    def test_fetches_only_missing_draws_and_verifies_coverage(self):
        calls = []

        def downloader(draw_number):
            calls.append(draw_number)
            return prize_page(draw_number=draw_number)

        summary = update_prize_file(
            self.workbook,
            self.prizes,
            downloader=downloader,
            delay_seconds=0,
        )
        self.assertEqual(summary.added_draws, (3947, 3946))
        self.assertEqual(calls, [3947, 3946])
        self.assertEqual(verify_prize_coverage(self.workbook, self.prizes), ())
        update_prize_file(self.workbook, self.prizes, downloader=downloader, delay_seconds=0)
        self.assertEqual(calls, [3947, 3946])

    def test_normal_mode_does_not_write_partial_failure(self):
        def downloader(draw_number):
            if draw_number == 3946:
                raise UpdateError("simulated failure")
            return prize_page(draw_number=draw_number)

        with self.assertRaisesRegex(UpdateError, "simulated failure"):
            update_prize_file(
                self.workbook,
                self.prizes,
                downloader=downloader,
                delay_seconds=0,
            )
        self.assertFalse(self.prizes.exists())

    def test_backfill_checkpoints_success_and_reports_failure(self):
        def downloader(draw_number):
            if draw_number == 3946:
                raise UpdateError("simulated failure")
            return prize_page(draw_number=draw_number)

        summary = update_prize_file(
            self.workbook,
            self.prizes,
            downloader=downloader,
            delay_seconds=0,
            backfill_all=True,
            checkpoint_every=1,
        )
        self.assertEqual(summary.added_draws, (3947,))
        self.assertEqual(summary.failed_draws, (3946,))
        self.assertEqual(verify_prize_coverage(self.workbook, self.prizes), (3946,))

    @patch("scripts.update_lotto_prizes.time.sleep")
    @patch("scripts.update_lotto_prizes.urlopen")
    def test_download_retries_transient_error(self, mocked_urlopen, mocked_sleep):
        response = unittest.mock.MagicMock()
        response.__enter__.return_value.status = 200
        response.__enter__.return_value.read.return_value = prize_page()
        mocked_urlopen.side_effect = [URLError("temporary"), response]
        self.assertEqual(download_prize_page(3947), prize_page())
        self.assertEqual(mocked_urlopen.call_count, 2)
        mocked_sleep.assert_called_once()
