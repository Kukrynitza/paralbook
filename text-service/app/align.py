from __future__ import annotations

from dataclasses import dataclass

from . import morph, segment
from .dictionary import Dictionary

PAGE_WORDS = 450

FUNCTION_WORDS = frozenset("""
a an the and or but if then than so because as of in on at to from by with without
for about into over under between after before during is are was were be been being am
do does did done have has had having can could may might must shall should will would
i you he she it we they me him her us them my your his its our their this that these those
there here who which what when where why how not no yes all any some each every both few
many much more most other another such own same only too very just also up out off again
once ever never always often sometimes now still yet already even well back away down further
""".split())


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


def _ru_form_index(ru_words: list[dict], start: int, end: int) -> dict[str, list[int]]:
    index: dict[str, list[int]] = {}
    for local, item in enumerate(ru_words[start:end]):
        for form in item["forms"]:
            index.setdefault(form, []).append(local)
    return index


def _page_targets(ru_words: list[dict], en_words: list[dict], en_start: int, en_end: int,
                  ru_start: int, ru_end: int, dictionary: Dictionary) -> dict[int, int]:
    en_count = max(0, en_end - en_start)
    ru_count = max(0, ru_end - ru_start)
    if not en_count or not ru_count:
        return {}
    forms = _ru_form_index(ru_words, ru_start, ru_end)
    targets: dict[int, int] = {}
    for en_index in range(max(0, en_start), min(len(en_words), en_end)):
        lemma = en_words[en_index].get("lemma")
        if not lemma:
            continue
        offset = en_index - en_start
        expected = offset / max(1, en_count - 1) * max(0, ru_count - 1)
        nearest = min(ru_count - 1, max(0, round(expected)))
        candidates = set() if lemma in FUNCTION_WORDS else dictionary.candidates(lemma)
        positions: set[int] = set()
        for form in candidates:
            positions.update(forms.get(form, ()))
        if positions:
            targets[en_index] = min(positions, key=lambda local: (abs(local - expected), local))
        else:
            targets[en_index] = nearest
    return targets


def align_pages(english: str, russian: str, dictionary: Dictionary) -> list[dict]:
    en_texts = segment.words(english)
    en_words = [{"text": text, "norm": segment.bare(text)} for text in en_texts]
    for item in en_words:
        item["lemma"] = dictionary.resolve_lemma(item["norm"])

    has_translation = bool(russian.strip())
    ru_words: list[dict] = []

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
        targets = _page_targets(ru_words, en_words, en_start, en_end, ru_start, ru_end, dictionary) \
            if has_translation and ru_count else {}
        en_tokens = []
        word_index = en_start
        for token_text in segment.pieces(page_text):
            if token_text.isspace():
                en_tokens.append({"text": token_text, "lemma": None, "align": None,
                                  "ru_align": None})
                continue
            item = en_words[word_index] if word_index < len(en_words) else {"text": token_text, "lemma": None}
            local = targets.get(word_index)
            align = None
            if local is not None and ru_count:
                align = min(en_count - 1, max(0, round(local * en_count / ru_count)))
            en_tokens.append({
                "text": token_text,
                "lemma": item.get("lemma"),
                "align": align,
                "ru_align": local,
            })
            word_index += 1
        result.append({"position": page_index, "en": en_tokens, "ru": [{"text": item} for item in ru_tokens]})
    return result
