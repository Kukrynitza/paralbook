from __future__ import annotations

from dataclasses import dataclass

from . import morph, segment
from .dictionary import Dictionary

PAGE_WORDS = 450


@dataclass
class Pair:
    en_start: int
    en_end: int
    ru_start: int
    ru_end: int
    en_block: int = 0


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
        for block_index, (en_block, ru_block) in enumerate(zip(en_blocks, ru_blocks)):
            en_sents = segment.split_sentences(en_block)
            ru_sents = segment.split_sentences(ru_block)
            en_sizes = [segment.word_count(item) for item in en_sents]
            ru_sizes = [segment.word_count(item) for item in ru_sents]
            for en_start, en_end, ru_start, ru_end in _map_sizes(en_sizes, ru_sizes):
                pairs.append(Pair(en_block_cursor + en_start, en_block_cursor + en_end,
                                  ru_block_cursor + ru_start, ru_block_cursor + ru_end,
                                  en_block=block_index))
            en_block_cursor += sum(en_sizes)
            ru_block_cursor += sum(ru_sizes)
        return pairs

    en_sents: list[str] = []
    en_blocks_of: list[int] = []
    for block_index, block in enumerate(en_blocks):
        sentences = segment.split_sentences(block)
        en_sents.extend(sentences)
        en_blocks_of.extend([block_index] * len(sentences))
    ru_sents = segment.split_sentences(russian)
    en_sizes = [segment.word_count(item) for item in en_sents]
    ru_sizes = [segment.word_count(item) for item in ru_sents]
    for en_start, en_end, ru_start, ru_end in _map_sizes(en_sizes, ru_sizes):
        block_index = en_blocks_of[en_start] if 0 <= en_start < len(en_blocks_of) else 0
        pairs.append(Pair(en_start, en_end, ru_start, ru_end, en_block=block_index))
    return pairs


def _english_pairs(english: str) -> list[Pair]:
    pairs: list[Pair] = []
    cursor = 0
    for block_index, block in enumerate(segment.split_blocks(english) or [english]):
        for sentence in segment.split_sentences(block) or [block]:
            size = segment.word_count(sentence)
            if size <= 0:
                continue
            pairs.append(Pair(cursor, cursor + size, 0, 0, en_block=block_index))
            cursor += size
    return pairs


def _pairs_to_pages(pairs: list[Pair], max_words: int = PAGE_WORDS) -> list[list[Pair]]:
    pages: list[list[Pair]] = []
    current: list[Pair] = []
    words = 0
    for pair in pairs:
        size = max(1, pair.en_end - pair.en_start)
        if current and words + size > max_words:
            pages.append(current)
            current = [pair]
            words = size
            continue
        current.append(pair)
        words += size
    if current:
        pages.append(current)
    return pages


def _page_text(pairs: list[Pair], en_words: list[str]) -> str:
    parts: list[str] = []
    previous_block: int | None = None
    for pair in pairs:
        chunk = " ".join(en_words[pair.en_start:pair.en_end]).strip()
        if not chunk:
            continue
        if parts:
            parts.append("\n\n" if pair.en_block != previous_block else " ")
        parts.append(chunk)
        previous_block = pair.en_block
    return "".join(parts)


def align_pages(english: str, russian: str, dictionary: Dictionary) -> list[dict]:
    en_texts = segment.words(english)
    en_words = [{"text": text, "norm": segment.bare(text)} for text in en_texts]
    for item in en_words:
        item["lemma"] = dictionary.resolve_lemma(item["norm"])

    has_translation = bool(russian.strip())
    ru_words: list[dict] = []
    targets: list[int | None] = [None] * len(en_words)

    if not has_translation:
        pairs = _english_pairs(english)
    else:
        pairs = _sentence_pairs(english, russian)
        if not pairs:
            pairs = _english_pairs(english)
            has_translation = False
        else:
            ru_texts = segment.words(russian)
            ru_words = [{"text": text, "norm": segment.bare(text), "forms": morph.normal_forms(text)}
                        for text in ru_texts]
            for pair in pairs:
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

    if not pairs:
        return []

    result: list[dict] = []
    for page_index, page_pairs in enumerate(_pairs_to_pages(pairs)):
        en_start = page_pairs[0].en_start
        en_end = page_pairs[-1].en_end
        ru_start = page_pairs[0].ru_start if has_translation else 0
        ru_end = page_pairs[-1].ru_end if has_translation else 0
        page_text = _page_text(page_pairs, en_texts)
        ru_slice = ru_words[ru_start:ru_end] if has_translation else []
        ru_tokens = segment.pieces(" ".join(item["text"] for item in ru_slice)) if ru_slice else []
        en_count = max(0, en_end - en_start)
        ru_count = max(0, ru_end - ru_start)
        en_tokens = []
        word_index = en_start
        for token_text in segment.pieces(page_text):
            if token_text.isspace():
                en_tokens.append({"text": token_text, "lemma": None, "align": None})
                continue
            item = en_words[word_index] if word_index < len(en_words) else {"text": token_text, "lemma": None}
            target = targets[word_index] if word_index < len(targets) else None
            align = None
            if has_translation and target is not None and ru_count:
                local = max(0, min(ru_count - 1, target - ru_start))
                align = min(en_count - 1, max(0, round(local * en_count / ru_count))) if en_count else None
            en_tokens.append({"text": token_text, "lemma": item.get("lemma"), "align": align})
            word_index += 1
        result.append({"position": page_index, "en": en_tokens, "ru": [{"text": item} for item in ru_tokens]})
    return result
