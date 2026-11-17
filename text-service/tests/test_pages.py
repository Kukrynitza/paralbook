from app.align import align_pages


class FakeDictionary:
    def resolve_lemma(self, form):
        return form or None

    def candidates(self, lemma):
        return set()


def ends_sentence(text: str) -> bool:
    return text.strip()[-1:] in ".!?…"


def sentences(word: str, count: int, size: int) -> str:
    return " ".join(f"{word} number {index} " + " ".join([word] * size) + "." for index in range(1, count + 1))


def test_pages_end_at_sentence_boundary():
    english = sentences("english", 6, 90)
    russian = sentences("русский", 6, 80)
    pages = align_pages(english, russian, FakeDictionary())
    assert len(pages) > 1
    for page in pages:
        words = [token["text"] for token in page["en"] if token["text"].strip()]
        assert words
        assert ends_sentence(words[-1])
        assert any(token["text"].strip() for token in page["ru"])


def test_pages_without_translation_end_at_sentence_boundary():
    english = sentences("english", 6, 90)
    pages = align_pages(english, "", FakeDictionary())
    assert len(pages) > 1
    for page in pages:
        words = [token["text"] for token in page["en"] if token["text"].strip()]
        assert words
        assert ends_sentence(words[-1])
        assert page["ru"] == []


def test_long_sentence_gets_its_own_page():
    long_sentence = " ".join(["word"] * 600) + "."
    english = f"{long_sentence} Short sentence follows."
    pages = align_pages(english, "", FakeDictionary())
    assert len(pages) == 2
    first = [token["text"] for token in pages[0]["en"] if token["text"].strip()]
    assert len(first) == 600
    assert ends_sentence(first[-1])


def test_all_words_are_kept_once():
    english = sentences("english", 6, 90)
    russian = sentences("русский", 6, 80)
    pages = align_pages(english, russian, FakeDictionary())
    en_total = sum(1 for page in pages for token in page["en"] if token["text"].strip())
    ru_total = sum(1 for page in pages for token in page["ru"] if token["text"].strip())
    assert en_total == len(english.split())
    assert ru_total == len(russian.split())
