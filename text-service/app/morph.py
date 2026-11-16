from functools import lru_cache
import re

import pymorphy3

_analyzer = pymorphy3.MorphAnalyzer()
_LETTERS = re.compile(r"[^A-Za-zА-Яа-яЁё0-9-]", re.UNICODE)


def clean_word(word: str) -> str:
    return _LETTERS.sub("", word.lower().replace("ё", "е"))


@lru_cache(maxsize=200_000)
def parses(word: str) -> tuple[tuple[str, str], ...]:
    value = clean_word(word)
    if not value:
        return ()
    result = []
    for parse in _analyzer.parse(value)[:4]:
        pos = str(parse.tag.POS or "")
        result.append((parse.normal_form.replace("ё", "е"), pos))
    return tuple(result)


def normal_forms(word: str) -> frozenset[str]:
    return frozenset(item[0] for item in parses(word))


def first_normal(word: str) -> str:
    items = parses(word)
    return items[0][0] if items else clean_word(word)
