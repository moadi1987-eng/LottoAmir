# LottoAmir PIN Winnings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Calculate and display the official pre-tax regular-Lotto winnings for every open future draw in each of the four saved PIN forms.

**Architecture:** Add a focused Python updater that parses the official Pais regular-Lotto prize table into an atomic `LOTTO_PRIZES.json` file keyed by draw number. Extend the existing Windows scheduler to publish only `NUMBERS.xlsx` and `LOTTO_PRIZES.json`, then load the JSON in the static analyzer and calculate each saved combination's exact tier prize without changing PIN storage or existing scoring.

**Tech Stack:** Python 3 standard library, existing `openpyxl`, PowerShell scheduled task, static HTML/CSS/JavaScript, Node.js `assert`, Playwright with system Chrome, Git, GitHub Pages.

## Global Constraints

- Use the official regular-Lotto table only; never use Double Lotto, EXTRA, or another game.
- Display official gross prize amounts before tax; do not estimate tax or net winnings.
- Backfill every draw present in `NUMBERS.xlsx`, then fetch only missing draws during scheduled updates.
- Keep `NUMBERS.xlsx` results data and `LOTTO_PRIZES.json` prize data in separate files.
- A combination receives at most one prize, using the exact normalized tier present in that draw's official table.
- Do not hard-code that prizes begin at three matches; preserve historical tiers returned by Pais.
- Count a combination as winning only when its official `prizeIls` is greater than zero.
- A present tier with zero prize displays `₪0 · לא חולק`; a missing tier displays `ללא זכייה`.
- Missing or malformed draw-prize data displays `נתוני זכייה לא זמינים`, never a misleading zero.
- Do not change PIN storage, migration, anchors, combination snapshots, scoring, generation, transfer, or Double-Lotto behavior.
- Each of the four PIN cards remains independent, and the winnings follow only that card's currently open draw.
- Preserve the existing four open-draw metric boxes; render the approved winnings band above them.
- Keep the existing two-column desktop and one-column mobile PIN layout without page-level horizontal overflow.
- Add no runtime dependency or frontend build step.

## File Map

- Create `scripts/update_lotto_prizes.py`: official HTML parser, validated JSON store, retrying downloader, backfill/default update modes, and coverage verification.
- Create `tests/test_update_lotto_prizes.py`: deterministic parser, validation, persistence, retry, backfill, and coverage tests.
- Create `LOTTO_PRIZES.json`: generated, versioned prize data consumed by GitHub Pages.
- Modify `scripts/run_scheduled_update.ps1`: invoke both updaters and enforce a two-file data allowlist for recovery, commits, and pushes.
- Modify `scripts/install_lotto_update_task.ps1`: update the task description to mention results and prizes.
- Modify `tests/test_update_lotto_results.py`: scheduler contract and Windows recovery coverage for both allowed data files.
- Modify `lotto_analyzer.html`: prize loading, validation, line/form calculations, reactive winnings band, table column, source link, and responsive styling.
- Modify `tests/verify-pinned-forms.js`: static contracts for prize helpers and safe source-link rendering.
- Modify `tests/verify-pinned-forms-playwright.js`: deterministic four-card winnings behavior and responsive verification.
- Do not modify `Lotto_All_In_One.html`, PIN storage keys, or the results CSV format.

---

### Task 1: Build The Official Prize Parser And Atomic JSON Updater

**Files:**
- Create: `tests/test_update_lotto_prizes.py`
- Create: `scripts/update_lotto_prizes.py`
- Create: `LOTTO_PRIZES.json`

**Interfaces:**
- Consumes: `scripts.update_lotto_results.read_workbook(path)` and official pages at `https://www.pais.co.il/Lotto/CurrentLotto.aspx?lotteryId=<DRAW_NUMBER>`.
- Produces: `PrizeTier`, `DrawPrizeRecord`, `UpdateSummary`, `normalize_tier_label(value)`, `parse_prize_page(payload, expected_draw_number, source_url)`, `load_prize_document(path)`, `write_prize_document_atomic(path, document)`, `download_prize_page(draw_number, ...)`, `update_prize_file(workbook_path, prize_path, ...)`, and `verify_prize_coverage(workbook_path, prize_path)`.

- [ ] **Step 1: Add deterministic page, parser, and store tests**

Create `tests/test_update_lotto_prizes.py` with a minimal official-structure fixture. The Double-Lotto decoy is required so the test proves that only `regularLottoList` is parsed.

```python
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from openpyxl import Workbook

from scripts.update_lotto_prizes import (
    DrawPrizeRecord,
    PrizeTier,
    UpdateError,
    download_prize_page,
    load_prize_document,
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
        record = parse_prize_page(prize_page(), 3947, "source")
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
```

- [ ] **Step 2: Run the new tests and verify RED**

Run:

```powershell
& 'C:\Users\amirmoa\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -m unittest tests.test_update_lotto_prizes -v
```

Expected: import failure for `scripts.update_lotto_prizes` because the module does not exist.

- [ ] **Step 3: Implement the structured HTML parser and strict domain types**

Create `scripts/update_lotto_prizes.py` with these exact constants and types:

```python
#!/usr/bin/env python3
"""Safely cache official Pais regular-Lotto prize tables."""

from __future__ import annotations

import argparse
import copy
import json
import os
import re
import sys
import tempfile
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from typing import Callable, Mapping, Sequence
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

try:
    from scripts.update_lotto_results import read_workbook
except ModuleNotFoundError:
    from update_lotto_results import read_workbook


PRIZE_URL_TEMPLATE = "https://www.pais.co.il/Lotto/CurrentLotto.aspx?lotteryId={draw_number}"
DEFAULT_WORKBOOK = Path("NUMBERS.xlsx")
DEFAULT_PRIZE_FILE = Path("LOTTO_PRIZES.json")
SCHEMA_VERSION = 1
DOWNLOAD_TIMEOUT_SECONDS = 30
MAX_DOWNLOAD_ATTEMPTS = 3
BACKFILL_BATCH_SIZE = 25
DEFAULT_DELAY_SECONDS = 0.35


class UpdateError(RuntimeError):
    """Raised when official prize data is unsafe to publish."""


@dataclass(frozen=True)
class PrizeTier:
    winner_count: int
    prize_ils: int


@dataclass(frozen=True)
class DrawPrizeRecord:
    draw_number: int
    draw_date: str
    source_url: str
    regular: Mapping[str, PrizeTier]


@dataclass(frozen=True)
class UpdateSummary:
    added_draws: tuple[int, ...]
    failed_draws: tuple[int, ...]
    remaining_draws: tuple[int, ...]
```

Add the parser and normalization functions:

```python
class RegularLottoTableParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.page_text: list[str] = []
        self.rows: list[tuple[str, str, str]] = []
        self._in_regular = False
        self._in_row = False
        self._capture = False
        self._buffer: list[str] = []
        self._row: list[str] = []

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if tag == "ol" and attributes.get("id") == "regularLottoList":
            self._in_regular = True
        elif self._in_regular and tag == "li":
            self._in_row = True
            self._row = []
        elif self._in_row and tag == "div" and "tabindex" in attributes:
            self._capture = True
            self._buffer = []

    def handle_data(self, data):
        self.page_text.append(data)
        if self._capture:
            self._buffer.append(data)

    def handle_endtag(self, tag):
        if tag == "div" and self._capture:
            self._row.append(" ".join(self._buffer).strip())
            self._capture = False
            self._buffer = []
        elif tag == "li" and self._in_row:
            if len(self._row) == 3:
                self.rows.append(tuple(self._row))
            elif self._row:
                raise UpdateError("regular Lotto row did not contain exactly three values")
            self._in_row = False
            self._row = []
        elif tag == "ol" and self._in_regular:
            self._in_regular = False


def normalize_tier_label(value: object) -> str:
    text = re.sub(r"\s+", "", str(value)).replace("＋", "+")
    match = re.fullmatch(r"([0-6])(?:\+חזק)?", text)
    if not match:
        raise UpdateError(f"invalid prize tier {value!r}")
    return match.group(1) + ("+strong" if "חזק" in text else "")


def parse_nonnegative_integer(value: object, context: str) -> int:
    text = str(value).replace(",", "").replace("₪", "").strip()
    if not re.fullmatch(r"\d+", text):
        raise UpdateError(f"{context}: expected a non-negative integer, got {value!r}")
    return int(text)


def parse_prize_page(
    payload: bytes,
    expected_draw_number: int,
    source_url: str,
) -> DrawPrizeRecord:
    try:
        html = payload.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise UpdateError("official prize page was not valid UTF-8") from exc
    parser = RegularLottoTableParser()
    parser.feed(html)
    page_text = re.sub(r"\s+", " ", " ".join(parser.page_text))
    draw_match = re.search(r"תוצאות הגרלה מס['׳]?\s*(\d+)", page_text)
    if not draw_match or int(draw_match.group(1)) != expected_draw_number:
        actual = draw_match.group(1) if draw_match else "missing"
        raise UpdateError(
            f"expected draw {expected_draw_number}, official page reported {actual}"
        )
    date_match = re.search(r"לתאריך\s*(\d{2}/\d{2}/\d{4})", page_text)
    if not date_match:
        raise UpdateError("official prize page did not contain a draw date")
    if not parser.rows:
        raise UpdateError("official regular Lotto table is empty")
    regular: dict[str, PrizeTier] = {}
    for row_number, (tier_text, winners_text, prize_text) in enumerate(parser.rows, 1):
        key = normalize_tier_label(tier_text)
        if key in regular:
            raise UpdateError(f"duplicate regular Lotto tier {key}")
        regular[key] = PrizeTier(
            parse_nonnegative_integer(winners_text, f"row {row_number} winner count"),
            parse_nonnegative_integer(prize_text, f"row {row_number} prize"),
        )
    return DrawPrizeRecord(
        expected_draw_number,
        date_match.group(1),
        source_url,
        regular,
    )
```

- [ ] **Step 4: Implement validated JSON loading, immutable merge, and atomic writes**

Add these functions to the same module:

```python
def empty_prize_document() -> dict:
    return {"schemaVersion": SCHEMA_VERSION, "updatedAt": None, "draws": {}}


def record_as_json(record: DrawPrizeRecord) -> dict:
    return {
        "drawNumber": record.draw_number,
        "drawDate": record.draw_date,
        "sourceUrl": record.source_url,
        "regular": {
            key: {
                "winnerCount": tier.winner_count,
                "prizeIls": tier.prize_ils,
            }
            for key, tier in sorted(record.regular.items())
        },
    }


def validate_prize_document(document: object) -> dict:
    if not isinstance(document, dict) or document.get("schemaVersion") != SCHEMA_VERSION:
        raise UpdateError("unsupported prize document schema")
    draws = document.get("draws")
    if not isinstance(draws, dict):
        raise UpdateError("prize document draws must be an object")
    for key, draw in draws.items():
        if not str(key).isdigit() or not isinstance(draw, dict):
            raise UpdateError(f"invalid prize draw entry {key!r}")
        draw_number = parse_nonnegative_integer(draw.get("drawNumber"), f"draw {key}")
        if str(draw_number) != str(key):
            raise UpdateError(f"prize draw key {key} does not match drawNumber")
        expected_url = PRIZE_URL_TEMPLATE.format(draw_number=draw_number)
        if draw.get("sourceUrl") != expected_url:
            raise UpdateError(f"draw {key}: invalid source URL")
        regular = draw.get("regular")
        if not isinstance(regular, dict) or not regular:
            raise UpdateError(f"draw {key}: regular prize table is empty")
        for tier_key, tier in regular.items():
            if normalize_tier_label(tier_key.replace("+strong", "+חזק")) != tier_key:
                raise UpdateError(f"draw {key}: invalid tier key {tier_key}")
            if not isinstance(tier, dict):
                raise UpdateError(f"draw {key}: invalid tier payload")
            parse_nonnegative_integer(tier.get("winnerCount"), "winner count")
            parse_nonnegative_integer(tier.get("prizeIls"), "prize")
    return document


def load_prize_document(path: Path | str) -> dict:
    prize_path = Path(path)
    if not prize_path.exists():
        return empty_prize_document()
    try:
        parsed = json.loads(prize_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise UpdateError(f"could not read prize document: {exc}") from exc
    return validate_prize_document(parsed)


def merge_record(document: dict, record: DrawPrizeRecord) -> bool:
    key = str(record.draw_number)
    candidate = record_as_json(record)
    existing = document["draws"].get(key)
    if existing is None:
        document["draws"][key] = candidate
        return True
    if existing != candidate:
        raise UpdateError(f"draw {key}: existing prize history differs")
    return False


def write_prize_document_atomic(path: Path | str, document: dict) -> None:
    prize_path = Path(path)
    validate_prize_document(document)
    serialized = json.dumps(
        document,
        ensure_ascii=False,
        indent=2,
        sort_keys=True,
    ) + "\n"
    prize_path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            newline="\n",
            prefix=f".{prize_path.name}.",
            suffix=".tmp",
            dir=prize_path.parent,
            delete=False,
        ) as handle:
            handle.write(serialized)
            handle.flush()
            os.fsync(handle.fileno())
            temporary_path = Path(handle.name)
        validate_prize_document(json.loads(temporary_path.read_text(encoding="utf-8")))
        os.replace(temporary_path, prize_path)
        temporary_path = None
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)
```

- [ ] **Step 5: Add downloader, retries, resumable backfill, verification, and CLI tests**

Append tests that inject a deterministic downloader and prove normal mode is all-or-nothing while backfill mode checkpoints valid progress:

```python
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
```

- [ ] **Step 6: Run the expanded tests and verify RED**

Run the Task 1 test command again. Expected: failures for undefined downloader, update, and coverage functions.

- [ ] **Step 7: Implement downloader, update modes, verification, and CLI**

Add the following behavior to `scripts/update_lotto_prizes.py`:

```python
def download_prize_page(
    draw_number: int,
    timeout: int = DOWNLOAD_TIMEOUT_SECONDS,
    attempts: int = MAX_DOWNLOAD_ATTEMPTS,
) -> bytes:
    source_url = PRIZE_URL_TEMPLATE.format(draw_number=draw_number)
    last_error = None
    for attempt in range(attempts):
        request = Request(
            source_url,
            headers={
                "User-Agent": "Mozilla/5.0 (compatible; LottoAmir-Updater/1.0)",
                "Referer": "https://www.pais.co.il/lotto/archive.aspx",
                "Accept": "text/html,application/xhtml+xml",
            },
        )
        try:
            with urlopen(request, timeout=timeout) as response:
                if getattr(response, "status", 200) != 200:
                    raise UpdateError(f"draw {draw_number}: HTTP {response.status}")
                payload = response.read()
                if not payload:
                    raise UpdateError(f"draw {draw_number}: empty prize page")
                return payload
        except (HTTPError, URLError, TimeoutError, UpdateError) as exc:
            last_error = exc
            if attempt + 1 < attempts:
                time.sleep(2 ** attempt)
    raise UpdateError(f"draw {draw_number}: prize download failed: {last_error}")


def verify_prize_coverage(
    workbook_path: Path | str,
    prize_path: Path | str,
) -> tuple[int, ...]:
    workbook = read_workbook(Path(workbook_path))
    document = load_prize_document(prize_path)
    return tuple(
        record.draw_number
        for record in workbook.records
        if str(record.draw_number) not in document["draws"]
    )


def update_prize_file(
    workbook_path: Path | str,
    prize_path: Path | str,
    *,
    downloader: Callable[[int], bytes] = download_prize_page,
    delay_seconds: float = DEFAULT_DELAY_SECONDS,
    backfill_all: bool = False,
    checkpoint_every: int = BACKFILL_BATCH_SIZE,
) -> UpdateSummary:
    workbook = read_workbook(Path(workbook_path))
    original = load_prize_document(prize_path)
    working = copy.deepcopy(original)
    missing = [
        record.draw_number
        for record in workbook.records
        if str(record.draw_number) not in working["draws"]
    ]
    added: list[int] = []
    failed: list[int] = []
    for draw_number in missing:
        source_url = PRIZE_URL_TEMPLATE.format(draw_number=draw_number)
        try:
            record = parse_prize_page(downloader(draw_number), draw_number, source_url)
            merge_record(working, record)
            added.append(draw_number)
            if backfill_all and len(added) % checkpoint_every == 0:
                working["updatedAt"] = datetime.now(timezone.utc).isoformat()
                write_prize_document_atomic(prize_path, working)
        except UpdateError:
            if not backfill_all:
                raise
            failed.append(draw_number)
        if delay_seconds > 0:
            time.sleep(delay_seconds)
    if added:
        working["updatedAt"] = datetime.now(timezone.utc).isoformat()
        write_prize_document_atomic(prize_path, working)
    remaining = tuple(
        record.draw_number
        for record in workbook.records
        if str(record.draw_number) not in working["draws"]
    )
    return UpdateSummary(tuple(added), tuple(failed), remaining)


def build_argument_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Update official Lotto prize tables")
    parser.add_argument("--workbook", type=Path, default=DEFAULT_WORKBOOK)
    parser.add_argument("--prizes", type=Path, default=DEFAULT_PRIZE_FILE)
    parser.add_argument("--backfill-all", action="store_true")
    parser.add_argument("--verify-only", action="store_true")
    parser.add_argument("--delay-seconds", type=float, default=DEFAULT_DELAY_SECONDS)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_argument_parser().parse_args(argv)
    try:
        if args.verify_only:
            missing = verify_prize_coverage(args.workbook, args.prizes)
            if missing:
                print("Missing prize draws: " + ", ".join(map(str, missing)), file=sys.stderr)
                return 1
            print("LOTTO_PRIZES.json covers every NUMBERS.xlsx draw")
            return 0
        summary = update_prize_file(
            args.workbook,
            args.prizes,
            backfill_all=args.backfill_all,
            delay_seconds=args.delay_seconds,
        )
        print(
            f"LOTTO_PRIZES.json added {len(summary.added_draws)} draw(s); "
            f"{len(summary.remaining_draws)} missing"
        )
        return 1 if summary.remaining_draws else 0
    except (OSError, UpdateError) as exc:
        print(f"Lotto prize update failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
```

Create the initial `LOTTO_PRIZES.json`:

```json
{
  "draws": {},
  "schemaVersion": 1,
  "updatedAt": null
}
```

- [ ] **Step 8: Run Task 1 tests and existing updater tests**

Run:

```powershell
& 'C:\Users\amirmoa\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -m unittest tests.test_update_lotto_prizes -v
& 'C:\Users\amirmoa\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -m unittest tests.test_update_lotto_results -v
```

Expected: all new prize tests and all existing updater tests pass; `NUMBERS.xlsx` remains unchanged.

- [ ] **Step 9: Commit Task 1**

```powershell
git add scripts/update_lotto_prizes.py tests/test_update_lotto_prizes.py LOTTO_PRIZES.json
git commit -m "feat: add official lotto prize updater"
```

---

### Task 2: Publish Results And Prizes Through The Safe Scheduler

**Files:**
- Modify: `tests/test_update_lotto_results.py:282-470`
- Modify: `scripts/run_scheduled_update.ps1:1-205`
- Modify: `scripts/install_lotto_update_task.ps1:80-90`

**Interfaces:**
- Consumes: `scripts/update_lotto_results.py`, `scripts/update_lotto_prizes.py`, `NUMBERS.xlsx`, and `LOTTO_PRIZES.json`.
- Produces: `$AllowedDataPaths`, `Test-OnlyAllowedDataPaths`, a single safe data commit, and recovery that accepts only the two approved data paths.

- [ ] **Step 1: Change the scheduler contract test first**

Update `runner_fragments` in `LocalSchedulerContractTests` to require:

```python
runner_fragments = (
    "LottoAmirUpdater",
    "Archive-AutomationClone",
    "git clone",
    "git pull --ff-only origin main",
    "origin/main...main",
    '$AllowedDataPaths = @("LOTTO_PRIZES.json", "NUMBERS.xlsx")',
    "Test-OnlyAllowedDataPaths",
    "scripts/update_lotto_results.py",
    "scripts/update_lotto_prizes.py",
    "git add -- $AllowedDataPaths",
    "git push origin main",
)
```

In `WindowsSchedulerRecoveryTests.setUp`, create the second updater and data file:

```python
(self.seed / "scripts" / "update_lotto_prizes.py").write_text(
    "print('fixture prize updater: no changes')\n", encoding="utf-8"
)
(self.seed / "LOTTO_PRIZES.json").write_text(
    '{"draws":{},"schemaVersion":1,"updatedAt":null}\n',
    encoding="utf-8",
)
```

Rename the recovery test to `test_recovers_allowed_data_changes_and_diverged_data_commit`, dirty both allowed files before the first recovery, and create the pending commit with both files:

```python
(managed_repo / "NUMBERS.xlsx").write_text("interrupted\n", encoding="utf-8")
(managed_repo / "LOTTO_PRIZES.json").write_text("interrupted\n", encoding="utf-8")
# after recovery
self.assertEqual((managed_repo / "NUMBERS.xlsx").read_text(encoding="utf-8"), "3944\n")
self.assertIn('"schemaVersion":1', (managed_repo / "LOTTO_PRIZES.json").read_text(encoding="utf-8"))

(managed_repo / "NUMBERS.xlsx").write_text("pending push\n", encoding="utf-8")
(managed_repo / "LOTTO_PRIZES.json").write_text("pending prizes\n", encoding="utf-8")
self.run_command(["git", "add", "NUMBERS.xlsx", "LOTTO_PRIZES.json"], managed_repo)
```

- [ ] **Step 2: Run the scheduler tests and verify RED**

Run:

```powershell
& 'C:\Users\amirmoa\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -m unittest tests.test_update_lotto_results.LocalSchedulerContractTests tests.test_update_lotto_results.WindowsSchedulerRecoveryTests -v
```

Expected: contract failure because the runner still invokes only the results updater and allows only `NUMBERS.xlsx`.

- [ ] **Step 3: Add the exact two-file allowlist and helpers**

Near the top of `scripts/run_scheduled_update.ps1`, add:

```powershell
$AllowedDataPaths = @("LOTTO_PRIZES.json", "NUMBERS.xlsx")

function Test-OnlyAllowedDataPaths {
    param([string[]]$Paths)

    if ($Paths.Count -eq 0) { return $false }
    foreach ($path in $Paths) {
        if ($path -notin $AllowedDataPaths) { return $false }
    }
    return $true
}
```

Replace both one-file recovery checks with `Test-OnlyAllowedDataPaths`. Use these exact messages:

```powershell
if (Test-OnlyAllowedDataPaths $workingPaths) {
    Archive-AutomationClone "Recovering an interrupted validated data update."
    continue
}
throw "Automation clone has unexpected local changes; refusing recovery."
```

```powershell
if (Test-OnlyAllowedDataPaths $localCommitPaths) {
    Archive-AutomationClone "Recovering a validated data commit after origin/main advanced."
    continue
}
throw "Automation clone diverged with changes outside the allowed data files."
```

- [ ] **Step 4: Invoke both updaters and commit only allowed changes**

Replace the result-only diff block with:

```powershell
& $PythonExecutable scripts/update_lotto_results.py
Assert-LastExitCode "official results update"

& $PythonExecutable scripts/update_lotto_prizes.py
Assert-LastExitCode "official prize update"

$changedEntries = @(& git status --porcelain --untracked-files=all)
Assert-LastExitCode "git status after data update"
$changedPaths = @(Get-ChangedPaths $changedEntries)

if ($changedPaths.Count -gt 0) {
    if (-not (Test-OnlyAllowedDataPaths $changedPaths)) {
        throw "Updater changed files outside the allowed data files; refusing to commit."
    }
    & git config user.name "LottoAmir Updater"
    Assert-LastExitCode "git user-name configuration"
    & git config user.email "moadi1987-eng@users.noreply.github.com"
    Assert-LastExitCode "git user-email configuration"
    & git add -- $AllowedDataPaths
    Assert-LastExitCode "git add allowed data"
    & git commit -m "data: update lotto results and prizes"
    Assert-LastExitCode "git commit"
    Write-UpdateLog "Committed newly validated results and prize data."
}
```

Change the no-change and push log messages to mention both results and prizes. In `scripts/install_lotto_update_task.ps1`, set the description to:

```powershell
-Description "Downloads validated Pais lotto results and prize tables and publishes the approved data files to LottoAmir." `
```

- [ ] **Step 5: Run scheduler and updater suites**

Run the focused scheduler command from Step 2, then:

```powershell
& 'C:\Users\amirmoa\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -m unittest tests.test_update_lotto_results tests.test_update_lotto_prizes -v
```

Expected: all tests pass. The Windows recovery test must archive dirty/diverged clones when either or both allowed files changed and must still reject unrelated paths.

- [ ] **Step 6: Commit Task 2**

```powershell
git add scripts/run_scheduled_update.ps1 scripts/install_lotto_update_task.ps1 tests/test_update_lotto_results.py
git commit -m "feat: publish lotto prizes with scheduled updates"
```

---

### Task 3: Load Prize Data And Calculate Per-Combination Winnings

**Files:**
- Modify: `tests/verify-pinned-forms.js:1-90`
- Modify: `tests/verify-pinned-forms-playwright.js:1-240`
- Modify: `lotto_analyzer.html:1370-1390, 1960-2140, 2310-2350`

**Interfaces:**
- Consumes: `LOTTO_PRIZES.json`, `scorePinnedFormAgainstDraw(pin, drawRow)`, and strict numeric parsing.
- Produces: `ensureDefaultPrizeData()`, `normalizeLottoPrizeDocument(parsed)`, `getPinnedPrizeTierKey(result)`, `calculatePinnedDrawWinnings(score, draw)`, `formatPrizeIls(value)`, and a winnings object with `status`, `totalPrizeIls`, `winningCombinationCount`, `sourceUrl`, and `lines`.

- [ ] **Step 1: Add failing static contracts**

Add these strings to `requiredText` in `tests/verify-pinned-forms.js`:

```js
  "const DEFAULT_PRIZES_FILE = 'LOTTO_PRIZES.json'",
  'function ensureDefaultPrizeData()',
  'function normalizeLottoPrizeDocument(parsed)',
  'function getPinnedPrizeTierKey(result)',
  'function calculatePinnedDrawWinnings(score, draw)',
  'function formatPrizeIls(value)',
```

Append:

```js
assert(
  html.includes("fetch(DEFAULT_PRIZES_FILE, { cache: 'no-store' })"),
  'Prize data must load from the versioned static JSON without browser caching',
);
assert(
  !html.includes('doubleLottoList'),
  'The analyzer must not contain a Double-Lotto prize path',
);
```

- [ ] **Step 2: Add a failing pure browser calculation scenario**

First extend the local Playwright server's content-type map so `.json` responses use `application/json`; keep the existing `.html`, `.js`, and `.xlsx` mappings unchanged:

```js
'.json': 'application/json; charset=utf-8',
```

Inside `verifyResponsiveGroups`, before rendering the PIN comparisons, inject this normalized prize fixture and deterministic baseline combinations:

```js
pins.main.baseline.combinations = [
  { comboNum: 1, strategy: '3 + strong', numbers: [1, 2, 3, 20, 21, 22], strong: 1 },
  { comboNum: 2, strategy: '3', numbers: [1, 2, 3, 23, 24, 25], strong: 2 },
  { comboNum: 3, strategy: '3 second', numbers: [4, 5, 6, 26, 27, 28], strong: 2 },
  ...Array.from({ length: 11 }, (_, index) => ({
    comboNum: index + 4,
    strategy: `no prize ${index + 4}`,
    numbers: [20, 21, 22, 23, 24, 25],
    strong: 2,
  })),
];
```

In the existing `page.evaluate`, set:

```js
lottoPrizeDocument = normalizeLottoPrizeDocument({
  schemaVersion: 1,
  updatedAt: '2026-07-19T00:00:00Z',
  draws: {
    4002: {
      drawNumber: 4002,
      drawDate: '20/07/2026',
      sourceUrl: 'https://www.pais.co.il/Lotto/CurrentLotto.aspx?lotteryId=4002',
      regular: {
        '3+strong': { winnerCount: 10, prizeIls: 59 },
        3: { winnerCount: 20, prizeIls: 15 },
        '6+strong': { winnerCount: 0, prizeIls: 0 },
      },
    },
  },
});
lottoPrizeLoadState = 'ready';
```

Before UI assertions, add a pure calculation assertion:

```js
const calculated = await session.page.evaluate(pin => {
  const draw = { drawNumber: 4002, numbers: [1, 2, 3, 4, 5, 6], strong: 1 };
  const score = scorePinnedFormAgainstDraw(pin, draw);
  return calculatePinnedDrawWinnings(score, draw);
}, pins.main.baseline);
assert.strictEqual(calculated.status, 'available');
assert.strictEqual(calculated.totalPrizeIls, 89);
assert.strictEqual(calculated.winningCombinationCount, 3);
assert.deepStrictEqual(
  calculated.lines.slice(0, 3).map(line => [line.tierKey, line.prizeIls, line.status]),
  [
    ['3+strong', 59, 'won'],
    ['3', 15, 'won'],
    ['3', 15, 'won'],
  ],
);
```

- [ ] **Step 3: Run static and Playwright tests to verify RED**

Run:

```powershell
node tests\verify-pinned-forms.js
$env:NODE_PATH='C:\Users\amirmoa\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules;C:\Users\amirmoa\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\.pnpm\node_modules'
$env:PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'
node tests\verify-pinned-forms-playwright.js
```

Expected: static missing-helper failure and Playwright reference failure for prize calculation state.

- [ ] **Step 4: Add prize state, validation, and idempotent loading**

Near `DEFAULT_NUMBERS_FILE`, add:

```js
const DEFAULT_PRIZES_FILE = 'LOTTO_PRIZES.json';
const PAIS_PRIZE_URL_PREFIX = 'https://www.pais.co.il/Lotto/CurrentLotto.aspx?lotteryId=';
let lottoPrizeDocument = null;
let lottoPrizeLoadState = 'idle';
let lottoPrizeLoadPromise = null;
```

Add strict client normalization. Invalid draws are skipped so one malformed record cannot hide valid draws:

```js
function normalizePrizeInteger(value) {
    if (value == null || (typeof value === 'string' && value.trim() === '')) return null;
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function normalizeLottoPrizeDocument(parsed) {
    if (!parsed || parsed.schemaVersion !== 1 || !parsed.draws || typeof parsed.draws !== 'object') {
        return null;
    }
    const draws = {};
    Object.keys(parsed.draws).forEach(function(key) {
        const raw = parsed.draws[key];
        const drawNumber = normalizePrizeInteger(raw && raw.drawNumber);
        if (drawNumber == null || String(drawNumber) !== String(key)) return;
        const sourceUrl = PAIS_PRIZE_URL_PREFIX + drawNumber;
        if (raw.sourceUrl !== sourceUrl || !raw.regular || typeof raw.regular !== 'object') return;
        const regular = {};
        let valid = true;
        Object.keys(raw.regular).forEach(function(tierKey) {
            if (!/^[0-6](?:\+strong)?$/.test(tierKey)) {
                valid = false;
                return;
            }
            const tier = raw.regular[tierKey];
            const winnerCount = normalizePrizeInteger(tier && tier.winnerCount);
            const prizeIls = normalizePrizeInteger(tier && tier.prizeIls);
            if (winnerCount == null || prizeIls == null) {
                valid = false;
                return;
            }
            regular[tierKey] = { winnerCount: winnerCount, prizeIls: prizeIls };
        });
        if (!valid || Object.keys(regular).length === 0) return;
        draws[String(drawNumber)] = {
            drawNumber: drawNumber,
            drawDate: typeof raw.drawDate === 'string' ? raw.drawDate : '',
            sourceUrl: sourceUrl,
            regular: regular
        };
    });
    return { schemaVersion: 1, updatedAt: parsed.updatedAt || null, draws: draws };
}

function ensureDefaultPrizeData() {
    if (lottoPrizeLoadPromise) return lottoPrizeLoadPromise;
    lottoPrizeLoadState = 'loading';
    lottoPrizeLoadPromise = fetch(DEFAULT_PRIZES_FILE, { cache: 'no-store' })
        .then(function(response) {
            if (!response.ok) throw new Error('לא ניתן לטעון נתוני זכיות');
            return response.json();
        })
        .then(function(parsed) {
            const normalized = normalizeLottoPrizeDocument(parsed);
            if (!normalized) throw new Error('קובץ הזכיות אינו תקין');
            lottoPrizeDocument = normalized;
            lottoPrizeLoadState = 'ready';
            return true;
        })
        .catch(function() {
            lottoPrizeDocument = null;
            lottoPrizeLoadState = 'unavailable';
            return false;
        });
    return lottoPrizeLoadPromise;
}
```

Start `ensureDefaultPrizeData()` at the beginning of `loadDefaultNumbersFile`. Make the Analyze click handler `async`, await the same promise before calling either `runAnalysisWithRows` or `runAnalysisWithFile`, and keep prize-load failures nonfatal.

- [ ] **Step 5: Implement exact line and form calculations**

Add:

```js
function getPinnedPrizeTierKey(result) {
    if (!result) return null;
    const matches = normalizePrizeInteger(result.regularMatches);
    if (matches == null || matches > 6) return null;
    return String(matches) + (result.strongMatch ? '+strong' : '');
}

function calculatePinnedDrawWinnings(score, draw) {
    const drawNumber = getValidPinnedDrawNumber(draw && draw.drawNumber);
    const prizeDraw = drawNumber != null
        && lottoPrizeDocument
        && lottoPrizeDocument.draws
        ? lottoPrizeDocument.draws[String(drawNumber)]
        : null;
    if (!prizeDraw || !score || !Array.isArray(score.results)) {
        return {
            status: 'unavailable',
            totalPrizeIls: null,
            winningCombinationCount: null,
            sourceUrl: null,
            lines: (score && score.results || []).map(function() {
                return { status: 'unavailable', tierKey: null, prizeIls: null };
            })
        };
    }
    let totalPrizeIls = 0;
    let winningCombinationCount = 0;
    const lines = score.results.map(function(result) {
        const tierKey = getPinnedPrizeTierKey(result);
        const tier = tierKey ? prizeDraw.regular[tierKey] : null;
        if (!tier) return { status: 'no-prize', tierKey: tierKey, prizeIls: null };
        if (tier.prizeIls === 0) {
            return { status: 'not-distributed', tierKey: tierKey, prizeIls: 0 };
        }
        totalPrizeIls += tier.prizeIls;
        winningCombinationCount++;
        return { status: 'won', tierKey: tierKey, prizeIls: tier.prizeIls };
    });
    return {
        status: 'available',
        totalPrizeIls: totalPrizeIls,
        winningCombinationCount: winningCombinationCount,
        sourceUrl: prizeDraw.sourceUrl,
        lines: lines
    };
}

function formatPrizeIls(value) {
    const amount = normalizePrizeInteger(value);
    return amount == null ? null : '₪' + amount.toLocaleString('he-IL');
}
```

In `renderPinnedFutureSource`, calculate and attach winnings next to each score before rendering:

```js
scoredItem.winnings = calculatePinnedDrawWinnings(score, item.draw);
```

- [ ] **Step 6: Run focused tests and commit Task 3**

Run both focused commands from Step 3. Expected: static and Playwright tests pass.

```powershell
git add lotto_analyzer.html tests/verify-pinned-forms.js tests/verify-pinned-forms-playwright.js
git commit -m "feat: calculate PIN winnings by draw"
```

---

### Task 4: Render The Reactive Winnings Band And Per-Line Prize Column

**Files:**
- Modify: `tests/verify-pinned-forms.js`
- Modify: `tests/verify-pinned-forms-playwright.js`
- Modify: `lotto_analyzer.html:740-820, 1980-2320`

**Interfaces:**
- Consumes: Task 3 winnings objects and the existing captured `toggle` handler.
- Produces: `renderPinnedWinningsAttributes(winnings)`, `readPinnedDrawWinnings(detail)`, `getPinnedWinningsDisplay(winnings)`, `renderPinnedWinningsBand(winnings)`, `renderPinnedOpenDrawSummary(metrics, winnings)`, and `updatePinnedOpenDrawSummary(card, detail)`.

- [ ] **Step 1: Add failing UI contracts and Playwright helpers**

Add these static hooks:

```js
  'function renderPinnedWinningsAttributes(winnings)',
  'function readPinnedDrawWinnings(detail)',
  'function getPinnedWinningsDisplay(winnings)',
  'function renderPinnedWinningsBand(winnings)',
  'function renderPinnedOpenDrawSummary(metrics, winnings)',
  'function updatePinnedOpenDrawSummary(card, detail)',
  'data-pin-winnings-band',
  'data-pin-winning-combination-count',
  'data-pin-line-prize',
  'לפי טבלת מפעל הפיס',
```

Add a browser helper:

```js
async function readPinnedWinnings(card) {
  const band = card.locator('[data-pin-winnings-band]');
  return {
    value: (await band.locator('[data-pin-winnings="value"]').textContent()).trim(),
    meta: (await band.locator('[data-pin-winnings="meta"]').textContent()).trim(),
  };
}
```

After opening draw `#4002`, assert:

```js
assert.deepStrictEqual(await readPinnedWinnings(baselineCard), {
  value: '₪89',
  meta: '3 קומבינציות זוכות',
});
assert.deepStrictEqual(
  await olderNumberedDraw.locator('[data-pin-line-prize]').evaluateAll(nodes =>
    nodes.slice(0, 4).map(node => node.textContent.trim())
  ),
  ['₪59', '₪15', '₪15', 'ללא זכייה'],
);
const sourceLink = olderNumberedDraw.locator('[data-pin-prize-source]');
assert.strictEqual(
  await sourceLink.getAttribute('href'),
  'https://www.pais.co.il/Lotto/CurrentLotto.aspx?lotteryId=4002',
);
assert.strictEqual(await sourceLink.getAttribute('target'), '_blank');
assert.ok((await sourceLink.getAttribute('rel')).includes('noopener'));
```

Capture winnings in `readPinnedOpenDrawCardState` and prove Form 1 improved and Form 2 baseline remain unchanged after a Form 1 baseline toggle.

After closing all details, assert the band shows `—` and `פתח הגרלה להצגת נתונים`. For the date-only draw without a draw number, assert `נתוני זכייה לא זמינים`.

- [ ] **Step 2: Run focused tests and verify RED**

Run static and Playwright PIN tests. Expected: missing winnings-band hooks and locator failures.

- [ ] **Step 3: Add stable winnings attributes and display helpers**

Add:

```js
function renderPinnedWinningsAttributes(winnings) {
    if (!winnings) return 'data-pin-winnings-status="unavailable"';
    return [
        'data-pin-winnings-status="' + escapeBacktestText(winnings.status) + '"',
        'data-pin-total-prize-ils="' + (winnings.totalPrizeIls == null ? '' : winnings.totalPrizeIls) + '"',
        'data-pin-winning-combination-count="' + (winnings.winningCombinationCount == null ? '' : winnings.winningCombinationCount) + '"',
        'data-pin-prize-source-url="' + escapeBacktestText(winnings.sourceUrl || '') + '"'
    ].join(' ');
}

function readPinnedDrawWinnings(detail) {
    if (!detail || !detail.dataset) return null;
    if (detail.dataset.pinWinningsStatus !== 'available') {
        return { status: 'unavailable', totalPrizeIls: null, winningCombinationCount: null };
    }
    const totalPrizeIls = normalizePrizeInteger(detail.dataset.pinTotalPrizeIls);
    const winningCombinationCount = normalizePrizeInteger(
        detail.dataset.pinWinningCombinationCount
    );
    if (totalPrizeIls == null || winningCombinationCount == null) return null;
    return {
        status: 'available',
        totalPrizeIls: totalPrizeIls,
        winningCombinationCount: winningCombinationCount
    };
}

function getPinnedWinningsDisplay(winnings, hasOpenDraw) {
    if (!hasOpenDraw) return { value: '—', meta: 'פתח הגרלה להצגת נתונים' };
    if (!winnings || winnings.status !== 'available') {
        return { value: '—', meta: 'נתוני זכייה לא זמינים' };
    }
    return {
        value: formatPrizeIls(winnings.totalPrizeIls),
        meta: winnings.winningCombinationCount === 0
            ? 'אין קומבינציות זוכות'
            : winnings.winningCombinationCount + ' קומבינציות זוכות'
    };
}

function renderPinnedWinningsBand(winnings, hasOpenDraw) {
    const display = getPinnedWinningsDisplay(winnings, hasOpenDraw);
    return `
        <div class="pinned-winnings-band" data-pin-winnings-band>
            <div>
                <div class="pinned-winnings-label">זכייה בטופס</div>
                <div class="pinned-winnings-meta" data-pin-winnings="meta">${escapeBacktestText(display.meta)}</div>
            </div>
            <div class="pinned-winnings-value" data-pin-winnings="value">${escapeBacktestText(display.value)}</div>
        </div>
    `;
}
```

- [ ] **Step 4: Render one shared live summary and update it per card**

Wrap the approved band and existing stats in one live region:

```js
function renderPinnedOpenDrawSummary(metrics, winnings) {
    return `
        <div data-pin-open-draw-summary aria-live="polite">
            ${renderPinnedWinningsBand(winnings, true)}
            ${renderPinnedOpenDrawStats(metrics)}
        </div>
    `;
}

function updatePinnedOpenDrawSummary(card, detail) {
    updatePinnedOpenDrawStats(card, detail);
    const display = getPinnedWinningsDisplay(
        readPinnedDrawWinnings(detail),
        Boolean(detail)
    );
    const value = card.querySelector('[data-pin-winnings="value"]');
    const meta = card.querySelector('[data-pin-winnings="meta"]');
    if (value) value.textContent = display.value;
    if (meta) meta.textContent = display.meta;
}
```

Remove `aria-live` from the inner `.pinned-open-draw-stats` and update the existing test to assert it on `[data-pin-open-draw-summary]`. Change `handlePinnedFutureToggle` to call `updatePinnedOpenDrawSummary` for both open and close events.

In `renderPinnedFutureSource`, render:

```js
${renderPinnedOpenDrawSummary(scoredRows[0].metrics, scoredRows[0].winnings)}
```

In `renderFutureDrawDetails`, add both attribute renderers to `<details>`:

```js
<details class="future-draw" ${renderPinnedDrawMetricAttributes(metrics)} ${renderPinnedWinningsAttributes(item.winnings)} ${shouldOpen ? 'open' : ''}>
```

- [ ] **Step 5: Add line-prize rendering and the official source link**

Before mapping score rows, define:

```js
const winnings = item.winnings || { status: 'unavailable', lines: [] };

function renderPinnedLinePrize(line) {
    if (!line || line.status === 'unavailable') {
        return '<span class="pinned-line-prize-unavailable">לא זמין</span>';
    }
    if (line.status === 'no-prize') {
        return '<span class="pinned-line-prize-none">ללא זכייה</span>';
    }
    if (line.status === 'not-distributed') {
        return '<span class="pinned-line-prize-none">₪0 · לא חולק</span>';
    }
    return '<span class="pinned-line-prize-won">' + escapeBacktestText(formatPrizeIls(line.prizeIls)) + '</span>';
}
```

Append this cell to each result row:

```js
'<td data-pin-line-prize>' + renderPinnedLinePrize(winnings.lines[rank]) + '</td>'
```

Append `<th>זכייה</th>` to the header. Under the table, render the source only when `winnings.sourceUrl` is available:

```js
const prizeSource = winnings.sourceUrl
    ? '<div class="pinned-prize-source">לפי <a data-pin-prize-source href="' +
        escapeBacktestText(winnings.sourceUrl) +
        '" target="_blank" rel="noopener noreferrer">טבלת מפעל הפיס</a> · לוטו רגיל · לפני מס</div>'
    : '<div class="pinned-prize-source">נתוני זכייה לא זמינים</div>';
```

- [ ] **Step 6: Add the approved responsive styles**

Add focused CSS next to existing PIN styles:

```css
.pinned-winnings-band {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 14px;
    margin-bottom: 10px;
    border: 1px solid rgba(16, 185, 129, 0.55);
    border-radius: 6px;
    background: rgba(16, 185, 129, 0.10);
}
.pinned-winnings-label { color: var(--text-muted); font-size: 12px; }
.pinned-winnings-meta { color: #a7f3d0; font-size: 12px; margin-top: 3px; }
.pinned-winnings-value {
    color: #34d399;
    font-size: 24px;
    font-weight: 800;
    white-space: nowrap;
}
.pinned-line-prize-won { color: #34d399; font-weight: 800; white-space: nowrap; }
.pinned-line-prize-none,
.pinned-line-prize-unavailable { color: var(--text-muted); white-space: nowrap; }
.pinned-prize-source { margin-top: 8px; color: var(--text-muted); font-size: 11px; }
.pinned-prize-source a { color: #60a5fa; }
@media (max-width: 520px) {
    .pinned-winnings-band { align-items: flex-start; flex-direction: column; }
    .pinned-winnings-value { font-size: 22px; }
}
```

- [ ] **Step 7: Run focused tests and inspect responsive screenshots**

Run static and Playwright PIN tests. Then inspect:

- `test-results/pin-slots-desktop.png`
- `test-results/pin-slots-mobile.png`

Confirm the band is above the four metrics, `₪89` fits without resizing the card, the new table column is readable, the mobile page has no page-level horizontal overflow, and another PIN card does not change when the baseline draw changes.

- [ ] **Step 8: Commit Task 4**

```powershell
git add lotto_analyzer.html tests/verify-pinned-forms.js tests/verify-pinned-forms-playwright.js
git commit -m "feat: show PIN winnings by open draw"
```

---

### Task 5: Backfill Every Existing Draw Prize Table

**Files:**
- Modify generated data: `LOTTO_PRIZES.json`
- Do not modify source or tests unless a failing official page exposes a confirmed parser defect; any such defect requires a fixture-based failing test before the correction.

**Interfaces:**
- Consumes: Task 1 `--backfill-all` and `--verify-only` CLI modes plus current `NUMBERS.xlsx`.
- Produces: complete validated prize coverage for every workbook draw.

- [ ] **Step 1: Record the workbook coverage target**

Run:

```powershell
& 'C:\Users\amirmoa\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -c "from scripts.update_lotto_results import read_workbook; s=read_workbook('NUMBERS.xlsx'); print(f'{s.record_count} draws: {s.oldest_draw}..{s.newest_draw}')"
```

Expected: one contiguous current-era range and count. Save the exact output in the Task 5 implementation report.

- [ ] **Step 2: Run resumable official backfill**

Run with network permission:

```powershell
& 'C:\Users\amirmoa\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' scripts\update_lotto_prizes.py --backfill-all --delay-seconds 0.35
```

Expected: the command may report temporary missing draws on the first pass but writes only validated batches. Re-run the same command until it exits zero. Do not lower the delay below `0.35` seconds.

- [ ] **Step 3: Verify complete workbook coverage**

Run:

```powershell
& 'C:\Users\amirmoa\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' scripts\update_lotto_prizes.py --verify-only
```

Expected: `LOTTO_PRIZES.json covers every NUMBERS.xlsx draw` and exit zero.

- [ ] **Step 4: Verify draw 3947 against the approved official example**

Run:

```powershell
& 'C:\Users\amirmoa\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -c "import json; d=json.load(open('LOTTO_PRIZES.json',encoding='utf-8'))['draws']['3947']; print(d['regular'])"
```

Expected values include:

```text
6+strong: winnerCount 0, prizeIls 0
6: winnerCount 1, prizeIls 250000
5+strong: winnerCount 16, prizeIls 8418
5: winnerCount 119, prizeIls 1252
4+strong: winnerCount 724, prizeIls 265
4: winnerCount 4471, prizeIls 85
3+strong: winnerCount 11352, prizeIls 59
3: winnerCount 65488, prizeIls 15
```

- [ ] **Step 5: Validate generated JSON and repository scope**

Run:

```powershell
& 'C:\Users\amirmoa\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -m json.tool LOTTO_PRIZES.json > $null
git status --short
git diff --stat -- LOTTO_PRIZES.json
```

Expected: JSON validation succeeds and only `LOTTO_PRIZES.json` is modified in Task 5.

- [ ] **Step 6: Commit the verified historical data**

```powershell
git add LOTTO_PRIZES.json
git commit -m "data: backfill official lotto prize tables"
```

---

### Task 6: Full Regression, Review, Integration, And Publication

**Files:**
- Modify only when a confirmed review finding requires a focused correction to files from Tasks 1-4.

**Interfaces:**
- Consumes: complete prize updater, scheduler integration, frontend calculation/UI, and backfilled data.
- Produces: reviewed commits integrated into `main`, pushed to `origin/main`, and verified on GitHub Pages.

- [ ] **Step 1: Run every JavaScript and browser test**

```powershell
$tests = @(
  'tests/test-lotto-combos.js',
  'tests/verify-strategy-core.js',
  'tests/verify-analyzer-core-integration.js',
  'tests/verify-backtest-core.js',
  'tests/verify-optimized-forms.js',
  'tests/verify-backtest-worker.js',
  'tests/verify-backtest-ui.js',
  'tests/verify-backtest-review-fixes.js',
  'tests/verify-backtest-shell.js',
  'tests/verify-form2-diversity.js',
  'tests/verify-pinned-forms.js'
)
foreach ($test in $tests) {
  node $test
  if ($LASTEXITCODE -ne 0) { throw "$test failed with exit code $LASTEXITCODE" }
}
$env:NODE_PATH='C:\Users\amirmoa\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules;C:\Users\amirmoa\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\.pnpm\node_modules'
$env:PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'
node tests\verify-backtest-playwright.js
if ($LASTEXITCODE -ne 0) { throw 'Backtest Playwright failed' }
node tests\verify-pinned-forms-playwright.js
if ($LASTEXITCODE -ne 0) { throw 'PIN Playwright failed' }
```

Expected: all 13 JavaScript/Chrome scripts exit zero and print their final passed messages.

- [ ] **Step 2: Run all Python updater suites and verify coverage**

```powershell
& 'C:\Users\amirmoa\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -m unittest tests.test_update_lotto_results tests.test_update_lotto_prizes -v
& 'C:\Users\amirmoa\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' scripts\update_lotto_prizes.py --verify-only
```

Expected: both modules pass, `NUMBERS.xlsx` remains unmodified, and prize coverage is complete.

- [ ] **Step 3: Verify repository integrity**

```powershell
git diff --check
git status --short
git log --oneline -12
```

Expected: no whitespace errors, no generated screenshots staged, no unrelated paths changed, and focused commits for updater, scheduler, calculation, UI, and data.

- [ ] **Step 4: Perform task and whole-branch reviews**

Invoke `superpowers:requesting-code-review` after each implementation task, then once across the full branch. The full review must explicitly verify:

- regular-Lotto parsing excludes Double Lotto;
- existing prize history cannot change silently;
- scheduled recovery accepts only the two approved data files;
- missing data never becomes zero;
- `prizeIls: 0` is distinct from no tier and unavailable data;
- positive-prize combination count and total are correct;
- four-card toggle isolation and rerender behavior remain correct;
- source URLs are exact Pais URLs and rendered with safe link attributes;
- no PIN storage, scoring, or `Lotto_All_In_One.html` change exists;
- responsive screenshots have no overlap or page-level overflow.

For every confirmed finding, add the smallest failing test first, observe RED, implement the correction, rerun the covering suite, and commit with `fix: harden PIN winnings calculation`.

- [ ] **Step 5: Finish and integrate the development branch**

Invoke `superpowers:finishing-a-development-branch` and use the already approved local-integration path. Before merging, fetch `origin/main`. If the scheduled updater advanced it with only approved data files, rebase the feature branch onto `origin/main`, rerun Steps 1-3, then fast-forward local main.

```powershell
git fetch origin main
git switch main
git pull --ff-only origin main
git merge --ff-only codex/lottoamir-pin-winnings
```

Expected: local `main` contains the approved spec, plan, source, tests, and complete prize data without a merge commit.

- [ ] **Step 6: Reverify merged main and push**

Run focused verification from `main`:

```powershell
node tests\verify-pinned-forms.js
$env:NODE_PATH='C:\Users\amirmoa\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules;C:\Users\amirmoa\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\.pnpm\node_modules'
$env:PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'
node tests\verify-pinned-forms-playwright.js
& 'C:\Users\amirmoa\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' scripts\update_lotto_prizes.py --verify-only
git status --short --branch
git push origin main
```

Expected: focused tests pass, coverage is complete, `main` is clean, and `origin/main` advances.

- [ ] **Step 7: Verify GitHub Pages and live behavior**

Poll with a cache-busting query until the deployed analyzer contains all final markers:

```powershell
$baseUri = 'https://moadi1987-eng.github.io/LottoAmir/lotto_analyzer.html?feature=pin-winnings'
$markers = @(
  'LOTTO_PRIZES.json',
  'data-pin-winnings-band',
  'function calculatePinnedDrawWinnings',
  'data-pin-line-prize'
)
$ready = $false
for ($attempt = 1; $attempt -le 18; $attempt++) {
  $uri = "$baseUri&ts=$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())"
  $response = Invoke-WebRequest -UseBasicParsing -Uri $uri -Headers @{ 'Cache-Control' = 'no-cache' }
  if ($response.StatusCode -eq 200 -and -not ($markers | Where-Object { -not $response.Content.Contains($_) })) {
    $ready = $true
    break
  }
  Start-Sleep -Seconds 10
}
if (-not $ready) { throw 'GitHub Pages did not publish PIN winnings in time' }
```

Also request `https://moadi1987-eng.github.io/LottoAmir/LOTTO_PRIZES.json`, validate JSON, and confirm draw `3947` contains `regular.3.prizeIls = 15`.

Open `https://moadi1987-eng.github.io/LottoAmir/Lotto_All_In_One.html`, enter the PIN comparison section, and confirm:

- the approved winnings band appears above the four metrics;
- opening a draw with data updates the total and line prizes;
- a different PIN card remains unchanged;
- closing all draws shows the prompt state;
- the official source link opens the matching draw;
- the page remains usable at desktop and phone widths.
