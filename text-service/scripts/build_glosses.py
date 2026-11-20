"""Precompute Russian glosses for every lemma and part of speech.

Run from the text-service directory:

    .venv/Scripts/python.exe scripts/build_glosses.py
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import psycopg

from app import config
from app.glossary import POS_FOR_LABEL, pick_from

SCHEMA = config.DATABASE_SCHEMA


def pick(translation: str | None, texts: list[str]) -> str:
    return pick_from(translation, texts)


def main() -> int:
    with psycopg.connect(
        config.DATABASE_URL,
        prepare_threshold=None,
        options="-c statement_timeout=0",
    ) as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""create table if not exists {SCHEMA}.lemma_glosses (
                      lemma text not null,
                      pos text not null,
                      gloss text not null,
                      primary key (lemma, pos)
                    )"""
            )
            cur.execute(f"truncate {SCHEMA}.lemma_glosses")
            cur.execute(f"select lemma, translation from {SCHEMA}.lemmas")
            translations = {
                str(lemma).lower(): translation
                for lemma, translation in cur.fetchall()
                if lemma
            }
            cur.execute(
                f"select lemma, pos, text from {SCHEMA}.senses order by lemma, position"
            )
            groups: dict[tuple[str, str], list[str]] = {}
            for lemma, pos, text in cur.fetchall():
                if not lemma or not text:
                    continue
                groups.setdefault((lemma.lower(), pos or ""), []).append(text)
            rows: list[tuple[str, str, str]] = []
            for lemma, translation in translations.items():
                value = (translation or "").strip()
                if value:
                    rows.append((lemma, "*", value))
            for (lemma, pos), texts in groups.items():
                gloss = pick(translations.get(lemma), texts)
                for upos in POS_FOR_LABEL.get(pos, []):
                    rows.append((lemma, upos, gloss))
            cur.execute(
                "create temp table tmp_glosses (lemma text, pos text, gloss text) "
                "on commit drop"
            )
            with cur.copy("copy tmp_glosses (lemma, pos, gloss) from stdin") as copy:
                for row in rows:
                    copy.write_row(row)
            cur.execute(
                f"""insert into {SCHEMA}.lemma_glosses (lemma, pos, gloss)
                    select lemma, pos, gloss from tmp_glosses
                    on conflict (lemma, pos) do update set gloss = excluded.gloss"""
            )
            conn.commit()
    print(f"gloss rows: {len(rows)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
