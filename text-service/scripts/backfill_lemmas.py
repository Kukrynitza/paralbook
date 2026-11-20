"""Backfill spaCy lemmas and parts of speech for existing English tokens.

Run from the text-service directory:

    .venv/Scripts/python.exe scripts/backfill_lemmas.py
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
try:
    sys.stdout.reconfigure(errors="replace")
except Exception:
    pass

import psycopg

from app import config
from app.lemmatize import annotate, available

SCHEMA = config.DATABASE_SCHEMA


def connect() -> psycopg.Connection:
    return psycopg.connect(
        config.DATABASE_URL,
        prepare_threshold=None,
        connect_timeout=20,
        options="-c statement_timeout=0",
    )


def pending_pages() -> list[tuple]:
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""select p.id
                    from {SCHEMA}.pages p
                    where exists (
                      select 1 from {SCHEMA}.en_tokens e
                      where e.page_id = p.id
                        and e.pos is null
                        and btrim(e.text) <> ''
                        and e.text ~ '[A-Za-z]'
                        and e.text !~* '^(n[''’]t|[''’]?(s|re|ve|ll|d|m|t))$'
                    )
                    order by p.text_id, p.position"""
            )
            return cur.fetchall()


def process_batch(page_ids: list) -> int:
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"select page_id, id, text from {SCHEMA}.en_tokens "
                "where page_id = any(%s) order by page_id, position",
                (page_ids,),
            )
            by_page: dict = {}
            for page_id, token_id, text in cur.fetchall():
                by_page.setdefault(page_id, []).append((token_id, text))
            pages: list[tuple[list[tuple], list[dict]]] = []
            for items in by_page.values():
                tokens = [{"text": text} for _, text in items]
                if not annotate(tokens):
                    continue
                pages.append((items, tokens))
            if not pages:
                return 0
            payload = [
                (row[0], token["lemma"], token["pos"])
                for rows, tokens in pages
                for token, row in zip(tokens, rows)
            ]
            cur.execute(
                "create temp table tmp_lemmas (id uuid primary key, lemma text, pos text) "
                "on commit drop"
            )
            with cur.copy("copy tmp_lemmas (id, lemma, pos) from stdin") as copy:
                for item in payload:
                    copy.write_row(item)
            cur.execute(
                f"""update {SCHEMA}.en_tokens e
                    set lemma = t.lemma, pos = t.pos
                    from tmp_lemmas t
                    where e.id = t.id"""
            )
            conn.commit()
            return len(pages)


def main() -> int:
    if not available():
        print("spaCy model is not installed, nothing to do")
        return 1
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute(f"alter table {SCHEMA}.en_tokens add column if not exists pos text")
            conn.commit()
    pages = pending_pages()
    print(f"pages to annotate: {len(pages)}")
    updated = 0
    batch_size = 50
    for start in range(0, len(pages), batch_size):
        batch = pages[start:start + batch_size]
        for attempt in range(3):
            try:
                updated += process_batch([row[0] for row in batch])
                break
            except psycopg.OperationalError as exc:
                print(f"reconnect after {exc!r}", flush=True)
                time.sleep(2)
        print(
            f"pages {min(start + batch_size, len(pages))}/{len(pages)}",
            flush=True,
        )
    print(f"pages updated: {updated}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
