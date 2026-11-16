from app.align import align_pages
from app.parsers import detect_language


class FakeDictionary:
    def resolve_lemma(self, form):
        return form or None

    def candidates(self, lemma):
        return set()


def test_detect_language_english():
    assert detect_language("The duck lived by the lake.") == "en"


def test_detect_language_russian():
    assert detect_language("Утка жила у озера и смотрела на воду.") == "ru"


def test_detect_language_mixed_prefers_russian():
    assert detect_language("Hello, это русский текст.") == "ru"


def test_detect_language_empty_defaults_to_english():
    assert detect_language("") == "en"


def test_ready_parallel_texts_are_aligned_without_translation():
    english = "The duck lived by the lake.\n\nIt was a quiet morning."
    russian = "Утка жила у озера.\n\nЭто было тихое утро."
    pages = align_pages(english, russian, FakeDictionary())
    words = [token for token in pages[0]["en"] if token["text"].strip()]
    assert words
    assert any(token["align"] is not None for token in words)
    assert any(token["text"].strip() for token in pages[0]["ru"])
