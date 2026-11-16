from __future__ import annotations

from dataclasses import dataclass

from . import morph, segment
from .dictionary import Dictionary


@dataclass
class Pair:
    en_start: int
    en_end: int
    ru_start: int
    ru_end: int


def _ranges(sizes: list[int], offset: int = 0) -> list[tuple[int, int]]:
    result = []
    cursor = offset
    for size in sizes:
        result.append((cursor, cursor + size))
        cursor += size
    return result


def _map_sizes(en_sizes: list[int], ru_sizes: list[int]) -> list[tuple[int, int, int, int]]:
    """Map local English sentence word ranges to local Russian sentence ranges."""
    if not en_sizes or not ru_sizes:
        return []
    if len(en_sizes) == len(ru_sizes):
        result = []
        en_cursor = 0
        ru_cursor = 0
        for en_size, ru_size in zip(en_sizes, ru_sizes):
            result.append((en_cursor, en_cursor + en_size, ru_cursor, ru_cursor + ru_size))
            en_cursor += en_size
            ru_cursor += ru_size
        return result
    total_en = sum(en_sizes)
    total_ru = sum(ru_sizes)
    result = []
    en_cursor = 0
    for size in en_sizes:
        en_start = en_cursor
        en_cursor += size
        ru_start = round(en_start / max(1, total_en) * total_ru)
        ru_end = round(en_cursor / max(1, total_en) * total_ru)
        if ru_end <= ru_start and total_ru:
            ru_end = min(total_ru, ru_start + 1)
        result.append((en_start, en_cursor, ru_start, ru_end))
    return result


def _sentence_pairs(english: str, russian: str) -> list[Pair]:
    en_blocks = segment.split_blocks(english)
    ru_blocks = segment.split_blocks(russian)
    if not en_blocks or not ru_blocks:
        return []
    pairs: list[Pair] = []
    if len(en_blocks) == len(ru_blocks):
        en_block_cursor = 0
        ru_block_cursor = 0
        for en_block, ru_block in zip(en_blocks, ru_blocks):
            en_sents = segment.split_sentences(en_block)
            ru_sents = segment.split_sentences(ru_block)
            en_sizes = [segment.word_count(item) for item in en_sents]
            ru_sizes = [segment.word_count(item) for item in ru_sents]
            for en_start, en_end, ru_start, ru_end in _map_sizes(en_sizes, ru_sizes):
                pairs.append(Pair(en_block_cursor + en_start, en_block_cursor + en_end,
                                  ru_block_cursor + ru_start, ru_block_cursor + ru_end))
            en_block_cursor += sum(en_sizes)
            ru_block_cursor += sum(ru_sizes)
        return pairs

    en_sents = segment.split_sentences(english)
    ru_sents = segment.split_sentences(russian)
    en_sizes = [segment.word_count(item) for item in en_sents]
    ru_sizes = [segment.word_count(item) for item in ru_sents]
    for en_start, en_end, ru_start, ru_end in _map_sizes(en_sizes, ru_sizes):
        pairs.append(Pair(en_start, en_end, ru_start, ru_end))
    return pairs


def align_pages(english: str, russian: str, dictionary: Dictionary) -> list[dict]:
    pages = segment.page_texts(english)
    en_texts = segment.words(english)
    en_words = [{"text": text, "norm": segment.bare(text)} for text in en_texts]
    for item in en_words:
        item["lemma"] = dictionary.resolve_lemma(item["norm"])

    if not russian.strip() or not en_words:
        return [
            _page_without_translation(page, index, en_words, dictionary)
            for index, page in enumerate(pages)
        ]

    ru_texts = segment.words(russian)
    ru_words = [{"text": text, "norm": segment.bare(text), "forms": morph.normal_forms(text)} for text in ru_texts]
    targets: list[int | None] = [None] * len(en_words)
    for pair in _sentence_pairs(english, russian):
        ru_start = max(0, min(len(ru_words), pair.ru_start))
        ru_end = max(ru_start, min(len(ru_words), pair.ru_end))
        if not (ru_start < ru_end):
            continue
        cursor = ru_start
        span = max(1, pair.en_end - pair.en_start)
        for en_index in range(max(0, pair.en_start), min(len(en_words), pair.en_end)):
            offset = en_index - pair.en_start
            candidates = dictionary.candidates(en_words[en_index].get("lemma"))
            match = None
            if candidates:
                for ru_index in range(cursor, ru_end):
                    if ru_words[ru_index]["forms"] & candidates:
                        match = ru_index
                        break
                if match is None:
                    expected = ru_start + round(offset * (ru_end - ru_start) / span)
                    for distance in range(0, ru_end - ru_start):
                        for ru_index in (expected - distance, expected + distance):
                            if ru_start <= ru_index < ru_end and ru_words[ru_index]["forms"] & candidates:
                                match = ru_index
                                break
                        if match is not None:
                            break
            if match is None:
                match = min(ru_end - 1, ru_start + round(offset * (ru_end - ru_start) / span))
            targets[en_index] = match
            cursor = max(cursor, match + 1)

    page_sizes = [segment.word_count(page) for page in pages]
    page_ranges = _ranges(page_sizes)
    total_en = max(1, len(en_words))
    total_ru = len(ru_words)
    result: list[dict] = []
    for page_index, (page_text, (page_start, page_end)) in enumerate(zip(pages, page_ranges)):
        page_targets = [targets[i] for i in range(page_start, page_end) if targets[i] is not None]
        if page_targets:
            ru_start = max(0, min(page_targets))
            ru_end = min(total_ru, max(page_targets) + 1)
        else:
            ru_start = round(page_start / total_en * total_ru)
            ru_end = round(page_end / total_en * total_ru)
            if ru_end <= ru_start and total_ru:
                ru_end = min(total_ru, ru_start + 1)
        ru_slice = ru_words[ru_start:ru_end]
        ru_tokens = segment.pieces(" ".join(item["text"] for item in ru_slice))
        en_tokens = []
        word_index = page_start
        en_count = max(0, page_end - page_start)
        ru_count = max(0, len(ru_slice))
        for token_text in segment.pieces(page_text):
            if token_text.isspace():
                en_tokens.append({"text": token_text, "lemma": None, "align": None})
                continue
            item = en_words[word_index] if word_index < len(en_words) else {"text": token_text, "lemma": None}
            target = targets[word_index] if word_index < len(targets) else None
            if target is not None and ru_count:
                local = max(0, min(ru_count - 1, target - ru_start))
                align = min(en_count - 1, max(0, round(local * en_count / ru_count))) if en_count else None
            else:
                align = None
            en_tokens.append({"text": token_text, "lemma": item.get("lemma"), "align": align})
            word_index += 1
        result.append({"position": page_index, "en": en_tokens, "ru": [{"text": item} for item in ru_tokens]})
    return result


def _page_without_translation(page: str, index: int, en_words: list[dict], dictionary: Dictionary) -> dict:
    tokens = []
    for token_text in segment.pieces(page):
        if token_text.isspace():
            tokens.append({"text": token_text, "lemma": None, "align": None})
        else:
            tokens.append({"text": token_text, "lemma": dictionary.resolve_lemma(segment.bare(token_text)), "align": None})
    return {"position": index, "en": tokens, "ru": []}
