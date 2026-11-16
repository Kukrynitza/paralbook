from app.align import align_pages
from app import segment


class FakeDictionary:
    def __init__(self):
        self.values = {
            "music": {"музыка"},
            "friend": {"друг"},
            "trust": {"доверять"},
            "best": {"лучший"},
            "all": {"все"},
        }

    def resolve_lemma(self, form):
        return form if form in self.values else form or None

    def candidates(self, lemma):
        return self.values.get(lemma, set())


def test_page_texts_keeps_blocks():
    pages = segment.page_texts("One two.\n\nThree four.")
    assert len(pages) == 1
    assert "One two." in pages[0]
    assert "Three four." in pages[0]


def test_alignment_sets_align_for_words():
    english = "Music is all around us. My best friend is someone I trust."
    russian = "Музыка повсюду вокруг нас. Мой лучший друг — это тот, кому я доверяю."
    pages = align_pages(english, russian, FakeDictionary())
    assert len(pages) == 1
    words = [token for token in pages[0]["en"] if token["text"].strip()]
    assert any(token["text"] == "Music" and token["align"] is not None for token in words)
    assert any(token["text"] == "friend" and token["align"] is not None for token in words)
    assert any(token["text"].strip() for token in pages[0]["ru"])
    assert max(token["align"] or 0 for token in words) < len(words)


def test_alignment_equal_sentence_counts():
    english = "First sentence. Second sentence."
    russian = "Первое предложение. Второе предложение."
    pages = align_pages(english, russian, FakeDictionary())
    assert len(pages) == 1
    words = [token for token in pages[0]["en"] if token["text"].strip()]
    assert all(token["align"] is not None for token in words)


def test_alignment_different_sentence_counts():
    english = "First sentence. Second sentence. Third sentence."
    russian = "Первое предложение. Второе предложение. Третье предложение. Четвёртое предложение."
    pages = align_pages(english, russian, FakeDictionary())
    assert len(pages) == 1
    assert any(token["text"].strip() for token in pages[0]["ru"])


def test_alignment_without_translation():
    pages = align_pages("Hello world.", "", FakeDictionary())
    assert pages[0]["ru"] == []
    assert all(token["align"] is None for token in pages[0]["en"])
