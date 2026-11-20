from __future__ import annotations

import re
import threading
from typing import Any

CLITIC = re.compile(r"^(?:n['’]t|['’]?(?:s|re|ve|ll|d|m|t))$", re.IGNORECASE)
PIECE = re.compile(r"\S+")
SKIP_POS = {"PUNCT", "SPACE", "SYM", "X"}
LETTERS = re.compile(r"^[^A-Za-zА-Яа-яЁё]+|[^A-Za-zА-Яа-яЁё]+$")

_lock = threading.Lock()
_nlp: Any = None
_failed = False


def _analyzer() -> Any:
    global _nlp, _failed
    if _nlp is not None or _failed:
        return _nlp
    try:
        import spacy
        _nlp = spacy.load("en_core_web_sm", disable=["parser", "ner", "textcat"])
    except Exception:
        _failed = True
        _nlp = None
    return _nlp


def available() -> bool:
    return _analyzer() is not None


def annotate(tokens: list[dict[str, Any]], spaced: bool = False) -> bool:
    """Fill lemma and pos for token dicts that carry a text.

    Tokens are joined as-is (stored tokens already contain whitespace) or with a
    single space (plain word lists). spaCy may split or merge pieces, so every
    stored token receives the first word that overlaps its character span; the
    last word is used for hyphenated tokens. Pure clitics stay without a lemma.
    """
    nlp = _analyzer()
    if nlp is None or not tokens:
        return False
    texts = [str(token.get("text") or "") for token in tokens]
    separator = " " if spaced else ""
    text = separator.join(texts)
    if not text.strip():
        return False
    starts: list[int] = []
    offset = 0
    for value in texts:
        starts.append(offset)
        offset += len(value) + len(separator)
    with _lock:
        doc = nlp(text)
    changed = False
    for index, token in enumerate(tokens):
        token["lemma"] = None
        token["pos"] = None
        value = texts[index]
        if not value.strip():
            continue
        start = starts[index]
        end = start + len(value)
        parts = [item for item in doc if item.idx < end and item.idx + len(item.text) > start]
        words = [item for item in parts if item.pos_ not in SKIP_POS and item.text.strip()]
        bare = LETTERS.sub("", value)
        if not words or CLITIC.match(value.strip()) or CLITIC.match(bare):
            token["lemma"] = None
            token["pos"] = None
            continue
        picked = words[-1] if "-" in value else words[0]
        lemma = picked.lemma_.lower().strip()
        if not lemma or not LETTERS.sub("", lemma):
            token["lemma"] = None
            token["pos"] = None
            continue
        token["lemma"] = lemma
        token["pos"] = picked.pos_
        changed = True
    return changed


def annotate_pages(pages: list[dict[str, Any]]) -> int:
    """Annotate English tokens of parsed pages; return the number of pages changed."""
    changed = 0
    for page in pages:
        if annotate(page.get("en") or []):
            changed += 1
    return changed
