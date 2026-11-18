from app.align import _page_targets, align_pages
from app.dictionary import Dictionary


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


class MatchDictionary:
    def __init__(self):
        self.values = {
            "cat": {"кошка", "кошку", "кошки"},
            "the": {"кошка", "кошку", "кошки"},
        }

    def resolve_lemma(self, form):
        return (form or "").lower() or None

    def candidates(self, lemma):
        return self.values.get(lemma, set())


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


def test_alignment_keeps_ru_index_for_matched_words():
    english = "The cat saw the cat."
    russian = "Кошка увидела кошку."
    pages = align_pages(english, russian, MatchDictionary())
    words = [token for token in pages[0]["en"] if token["text"].strip()]
    ru = [token["text"] for token in pages[0]["ru"] if token["text"].strip()]
    cats = [token for token in words if token["text"].lower().startswith("cat")]
    assert len(cats) == 2
    assert [token["ru_align"] for token in cats] == [0, 2]
    assert ru[cats[0]["ru_align"]].startswith("Кошка")
    assert ru[cats[1]["ru_align"]].startswith("кошку")
    for token in words:
        if token["ru_align"] is not None:
            assert 0 <= token["ru_align"] < len(ru)


def test_alignment_falls_back_to_nearest_word():
    english = "The cat saw the cat."
    russian = "Кошка увидела кошку."
    pages = align_pages(english, russian, MatchDictionary())
    words = [token for token in pages[0]["en"] if token["text"].strip()]
    ru = [token["text"] for token in pages[0]["ru"] if token["text"].strip()]
    for token in words:
        assert token["ru_align"] is not None
        assert 0 <= token["ru_align"] < len(ru)
    articles = [token for token in words if token["text"].lower() == "the"]
    assert articles[0]["ru_align"] == 0
    assert articles[1]["ru_align"] == 2


def test_alignment_skips_punctuation():
    english = "Hello — world."
    russian = "Привет — мир."
    pages = align_pages(english, russian, MatchDictionary())
    dashes = [token for token in pages[0]["en"] if token["text"].strip() == "—"]
    assert dashes
    assert all(token["ru_align"] is None and token["align"] is None for token in dashes)


def test_function_word_uses_position_not_candidate():
    ru_words = [{"text": "слово", "forms": {"слово"}} for _ in range(42)]
    ru_words[24] = {"text": "кошка", "forms": {"кошка"}}
    en_words = [{"text": "word", "lemma": None} for _ in range(41)]
    en_words[20] = {"text": "the", "lemma": "the"}
    targets = _page_targets(ru_words, en_words, 0, 41, 0, 42, MatchDictionary())
    assert targets[20] == 20


def test_alignment_different_sentence_counts():
    english = "First sentence. Second sentence. Third sentence."
    russian = "Первое предложение. Второе предложение. Третье предложение. Четвёртое предложение."
    pages = align_pages(english, russian, FakeDictionary())
    assert len(pages) == 1
    assert any(token["text"].strip() for token in pages[0]["ru"])


def test_alignment_without_translation():
    pages = align_pages("Hello world.", "", FakeDictionary())
    assert pages[0]["ru"] == []
    assert all(token["align"] is None and token["ru_align"] is None for token in pages[0]["en"])


def test_resolve_lemma_prefers_word_form_mapping():
    dictionary = Dictionary()
    dictionary.lemma_set = {"was", "be", "claimed", "claim"}
    dictionary.form_to_lemma = {"was": "be", "claimed": "claim"}
    assert dictionary.resolve_lemma("was") == "be"
    assert dictionary.resolve_lemma("claimed") == "claim"
    assert dictionary.resolve_lemma("be") == "be"
    assert dictionary.resolve_lemma("unknown") is None
