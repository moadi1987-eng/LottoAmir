#!/usr/bin/env python3
"""Safely cache official Pais regular-Lotto prize tables."""

from __future__ import annotations

import argparse
import copy
import json
import math
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
MAX_SAFE_INTEGER = 9_007_199_254_740_991


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
            if len(self._row) != 3:
                raise UpdateError("regular Lotto row did not contain exactly three values")
            self.rows.append(tuple(self._row))
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
    if isinstance(value, bool):
        raise UpdateError(f"{context}: expected a non-negative integer, got {value!r}")
    text = str(value).strip()
    if text.endswith("₪"):
        text = text[:-1].rstrip()
    if not re.fullmatch(r"(?:0|[1-9][0-9]*)|(?:[1-9][0-9]{0,2}(?:,[0-9]{3})+)", text):
        raise UpdateError(f"{context}: expected a non-negative integer, got {value!r}")
    parsed = int(text.replace(",", ""))
    if parsed > MAX_SAFE_INTEGER:
        raise UpdateError(f"{context}: integer exceeds JavaScript safe range")
    return parsed


def parse_schema_nonnegative_integer(value: object, context: str) -> int:
    if isinstance(value, bool):
        raise UpdateError(f"{context}: expected a canonical non-negative integer")
    if isinstance(value, int):
        parsed = value
    elif (
        isinstance(value, float)
        and value.is_integer()
        and not (value == 0 and math.copysign(1, value) < 0)
    ):
        parsed = int(value)
    elif isinstance(value, str) and re.fullmatch(r"(?:0|[1-9][0-9]*)", value):
        parsed = int(value)
    else:
        raise UpdateError(f"{context}: expected a canonical non-negative integer")
    if parsed < 0 or parsed > MAX_SAFE_INTEGER:
        raise UpdateError(f"{context}: integer is outside the JavaScript safe range")
    return parsed


def parse_draw_date(value: object, context: str) -> str:
    if not isinstance(value, str) or not re.fullmatch(
        r"[0-9]{2}/[0-9]{2}/[0-9]{4}", value
    ):
        raise UpdateError(f"{context}: expected a DD/MM/YYYY draw date, got {value!r}")
    try:
        datetime.strptime(value, "%d/%m/%Y")
    except ValueError as exc:
        raise UpdateError(f"{context}: invalid draw date {value!r}") from exc
    return value


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
        parse_draw_date(date_match.group(1), "official draw date"),
        source_url,
        regular,
    )


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
    if not isinstance(document, dict):
        raise UpdateError("unsupported prize document schema")
    schema_version = document.get("schemaVersion")
    if (
        isinstance(schema_version, bool)
        or not isinstance(schema_version, (int, float))
        or schema_version != SCHEMA_VERSION
    ):
        raise UpdateError("unsupported prize document schema")
    updated_at = document.get("updatedAt")
    if updated_at is not None and not isinstance(updated_at, str):
        raise UpdateError("prize document updatedAt must be a string or null")
    draws = document.get("draws")
    if not isinstance(draws, dict):
        raise UpdateError("prize document draws must be an object")
    for key, draw in draws.items():
        if (
            not isinstance(key, str)
            or not re.fullmatch(r"(?:0|[1-9][0-9]*)", key)
            or not isinstance(draw, dict)
        ):
            raise UpdateError(f"invalid prize draw entry {key!r}")
        draw_number = parse_schema_nonnegative_integer(draw.get("drawNumber"), f"draw {key}")
        if str(draw_number) != key:
            raise UpdateError(f"prize draw key {key} does not match drawNumber")
        parse_draw_date(draw.get("drawDate"), f"draw {key} draw date")
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
            parse_schema_nonnegative_integer(tier.get("winnerCount"), "winner count")
            parse_schema_nonnegative_integer(tier.get("prizeIls"), "prize")
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
