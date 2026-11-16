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


def page_texts(english: str) -> list[str]:
    blocks = split_blocks(english)
    if not blocks:
        blocks = [english]
    chunks: list[str] = []
    for block in blocks:
        parts = words(block)
        if len(parts) <= 450:
            chunks.append(block)
            continue
        for index in range(0, len(parts), 400):
            chunks.append(" ".join(parts[index:index + 400]))
    pages: list[str] = []
    current: list[str] = []
    count = 0
    for block in chunks:
        size = word_count(block)
        if current and count + size > 450:
            pages.append("\n\n".join(current))
            current = [block]
            count = size
        else:
            current.append(block)
            count += size
    if current:
        pages.append("\n\n".join(current))
    return pages or [english]


def span_sizes(texts: list[str]) -> list[tuple[int, int]]:
    """Return [start, end) word ranges for each text fragment."""
    result = []
    cursor = 0
    for text in texts:
        size = word_count(text)
        result.append((cursor, cursor + size))
        cursor += size
    return result
