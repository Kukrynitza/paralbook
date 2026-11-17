from __future__ import annotations

import re

from . import morph

SPLIT_SPACE = re.compile(r"(\s+)")
BLOCK_SPLIT = re.compile(r"\n\s*\n")
SENTENCE_SPLIT = re.compile(r"(?<=[.!?…])\s+")


def word_count(text: str) -> int:
    return len(text.split())


def pieces(text: str) -> list[str]:
    return [part for part in SPLIT_SPACE.split(text) if part]


def bare(part: str) -> str:
    return morph.clean_word(part)


def words(text: str) -> list[str]:
    return text.split()


def split_blocks(text: str) -> list[str]:
    return [item.strip() for item in BLOCK_SPLIT.split(text) if item.strip()]


def split_sentences(text: str) -> list[str]:
    return [item.strip() for item in SENTENCE_SPLIT.split(text) if item.strip()]
