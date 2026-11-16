from __future__ import annotations

import re
from collections import defaultdict

from . import morph
from .db import Database

VARIANT_SPLIT = re.compile(r"[,;/|]")
PAREN = re.compile(r"\([^)]*\)")
WORD_SPLIT = re.compile(r"\s+")


class Dictionary:
    def __init__(self) -> None:
        self.lemma_set: set[str] = set()
        self.form_to_lemma: dict[str, str] = {}
        self.form_rank: dict[str, int] = {}
        self.translations: dict[str, set[str]] = defaultdict(set)

    async def load(self, db: Database) -> None:
        forms = await db.fetch_all(
            """select w.form_norm, w.lemma, l.rank
               from public.word_forms w
               join public.lemmas l on l.lemma = w.lemma"""
        )
        for row in forms:
            form = morph.clean_word(row["form_norm"] or "")
            lemma = (row["lemma"] or "").lower()
            if not form or not lemma:
                continue
            rank = int(row["rank"] or 0)
            current = self.form_rank.get(form)
            if current is None or rank < current:
                self.form_rank[form] = rank
                self.form_to_lemma[form] = lemma

        lemmas = await db.fetch_all("select lemma, translation from public.lemmas")
        for row in lemmas:
            lemma = (row["lemma"] or "").lower()
            if not lemma:
                continue
            self.lemma_set.add(lemma)
            self._add_translation(lemma, row.get("translation"))

        senses = await db.fetch_all("select lemma, text from public.senses")
        for row in senses:
            lemma = (row["lemma"] or "").lower()
            if lemma:
                self._add_translation(lemma, row.get("text"))

    def _add_translation(self, lemma: str, text: str | None) -> None:
        if not text:
            return
        for variant in VARIANT_SPLIT.split(str(text)):
            variant = PAREN.sub(" ", variant)
            for word in WORD_SPLIT.split(variant.strip()):
                for normal in morph.normal_forms(word):
                    if len(normal) >= 2:
                        self.translations[lemma].add(normal)

    def resolve_lemma(self, form: str) -> str | None:
        value = morph.clean_word(form)
        if not value:
            return None
        if value in self.lemma_set:
            return value
        return self.form_to_lemma.get(value)

    def candidates(self, lemma: str | None) -> set[str]:
        if not lemma:
            return set()
        return self.translations.get(lemma, set())

    @property
    def stats(self) -> dict:
        return {
            "lemmas": len(self.lemma_set),
            "wordForms": len(self.form_to_lemma),
            "translatedLemmas": len(self.translations),
        }
