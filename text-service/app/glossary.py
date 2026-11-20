from __future__ import annotations

import re

LABELS: dict[str, tuple[str, ...]] = {
    "NOUN": ("сущ.",),
    "PROPN": ("сущ.",),
    "VERB": ("гл.",),
    "AUX": ("гл.",),
    "ADJ": ("прил.",),
    "ADV": ("нареч.",),
    "PRON": ("мест.",),
    "DET": ("арт.", "мест."),
    "ADP": ("предл.",),
    "CCONJ": ("союз",),
    "SCONJ": ("союз",),
    "NUM": ("числ.",),
    "INTJ": ("межд.",),
    "PART": ("част.", "нареч."),
}

PUNCT = re.compile(r"[^\w\s-]", re.UNICODE)
SPACES = re.compile(r"\s+")

POS_FOR_LABEL: dict[str, list[str]] = {}
for _pos, _labels in LABELS.items():
    for _label in _labels:
        POS_FOR_LABEL.setdefault(_label, []).append(_pos)


def plain(value: str | None) -> str:
    return SPACES.sub(" ", PUNCT.sub(" ", (value or "").lower())).strip()


def pick_from(translation: str | None, texts: list[str]) -> str:
    unique = list(dict.fromkeys(texts))
    if not unique:
        return (translation or "").strip()
    base = plain(translation)
    if base:
        for text in unique:
            if plain(text) == base:
                return text
        for text in unique:
            value = plain(text)
            if value and (value in base or base in value):
                return text
    return unique[0]
