"""One-off, idempotent cleanup of dictionary rows that produced wrong glosses.

Run from the text-service directory:

    .venv/Scripts/python.exe scripts/fix_dictionary.py
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import psycopg

from app import config

LEGACY = {
    "am": "be",
    "is": "be",
    "was": "be",
    "were": "be",
    "aged": "age",
    "associated": "associate",
    "coloured": "colour",
    "injured": "injure",
    "located": "locate",
}


def main() -> int:
    with psycopg.connect(config.DATABASE_URL, prepare_threshold=None) as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""insert into {config.DATABASE_SCHEMA}.word_forms (lemma, form, form_norm, kind, source)
                    select 'be', 'am', 'am', '1sg', 'manual'
                    where not exists (
                      select 1 from {config.DATABASE_SCHEMA}.word_forms
                      where form_norm = 'am' and lemma = 'be'
                    )"""
            )
            for old, new in LEGACY.items():
                cur.execute(
                    f"""delete from {config.DATABASE_SCHEMA}.user_words a
                        using {config.DATABASE_SCHEMA}.user_words b
                        where a.user_id = b.user_id and a.lemma = %s and b.lemma = %s""",
                    (old, new),
                )
                cur.execute(
                    f"update {config.DATABASE_SCHEMA}.user_words set lemma = %s where lemma = %s",
                    (new, old),
                )
            cur.execute(
                f"update {config.DATABASE_SCHEMA}.lemmas set translation = %s where lemma = 'overjoyed'",
                ("очень обрадованный, вне себя от радости",),
            )
            cur.execute(
                f"""delete from {config.DATABASE_SCHEMA}.word_forms
                    where (form_norm = 'been' and lemma = 'been')
                       or (form_norm = 'are' and lemma = 'are')
                       or (form_norm = 's' and lemma in ('honey', 'pond', 'cement'))
                       or (lemma in ('a', 'i') and length(form_norm) > 1)"""
            )
            cur.execute(
                f"""delete from {config.DATABASE_SCHEMA}.word_forms
                    where lemma = any(%s)""",
                (list(LEGACY.keys()),),
            )
            conn.commit()
    print("dictionary cleanup done")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
