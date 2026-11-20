from app.align import align_pages
from app.parsers import detect_language, language_samples_from_pages, validate_language, validate_pages_language


class FakeDictionary:
    def resolve_lemma(self, form):
        return form or None

    def candidates(self, lemma):
        return {
            "duck": {"утка", "утку"},
            "lake": {"озеро", "озера"},
            "morning": {"утро", "утра"},
            "quiet": {"тихий", "тихое"},
        }.get(lemma, set())


def test_detect_language_english():
    assert detect_language("The duck lived by the lake.") == "en"


def test_detect_language_russian():
    assert detect_language("Утка жила у озера и смотрела на воду.") == "ru"


def test_detect_language_mixed_prefers_russian():
    assert detect_language("Hello, это русский текст.") == "ru"


def test_detect_language_short_phrases():
    assert detect_language("I love you.") == "en"
    assert detect_language("test") == "en"
    assert detect_language("Привет мир") == "ru"


def test_russian_text_with_foreign_name_or_quote_stays_russian():
    assert detect_language("Русский текст про Київ и Украину. Это предложение на русском языке.") == "ru"
    assert detect_language("Русский текст с белорусским словом «ў» в цитате. Остальное на русском.") == "ru"
    assert detect_language("Это русский текст, в котором встретилось слово «ґанок».") == "ru"
    assert detect_language("Мы говорили о Київі. Это было давно.") == "ru"
    assert detect_language("Київ — красивый город.") == "ru"
    assert detect_language("Київ — столица.") == "ru"
    assert detect_language("Київ — столиця.") == "uk"


def test_other_cyrillic_languages_are_still_detected():
    assert detect_language("Це український текст про маленьку книгу. Він містить слова та речення.") == "uk"
    assert detect_language("Гэта беларускі тэкст пра маленькую кнігу. Ён змяшчае словы і сказы.") == "be"
    assert detect_language("Ово је српски текст о малој књизи. Он садржи речи и реченице.") == "sr"
    assert detect_language("Ова е македонски текст за мала книга. Тој содржи зборови и реченици.") == "mk"
    assert detect_language("Това е български текст за една малка книга. Той съдържа думи и изречения.") == "bg"


def test_detect_language_digits_are_unknown():
    assert detect_language("12345") == "unknown"


def test_detect_language_other_languages():
    assert detect_language("Die Ente lebte am See und schaute auf das Wasser. Es war ein ruhiger Morgen.") == "de"
    assert detect_language("Le canard vivait près du lac et regardait l'eau. C'était un matin calme.") == "fr"
    assert detect_language("El pato vivía junto al lago y miraba el agua. Era una mañana tranquila.") == "es"


def test_validate_language_rejects_german():
    try:
        validate_language(
            "Die Ente lebte am See und schaute auf das Wasser. Es war ein ruhiger Morgen.",
            "Текст",
        )
    except ValueError as exc:
        assert "немецкий" in str(exc)
    else:
        raise AssertionError("немецкий текст должен быть отклонён")


def test_detect_language_empty_is_unknown():
    assert detect_language("") == "unknown"


def test_page_language_samples_cover_start_middle_and_end():
    def page(english: str, russian: str):
        return {"en": [{"text": english}], "ru": [{"text": russian}]}

    pages = [
        page("English start.", "Русское начало."),
        page("English second.", "Русская середина."),
        page("English middle.", "Русская середина два."),
        page("English fourth.", "Русский конец."),
        page("Deutsch Ende.", "Русский финал."),
    ]
    english, russian = language_samples_from_pages(pages)
    assert "English start." in english
    assert "English middle." in english
    assert "Deutsch Ende." in english
    assert "Русское начало." in russian

    try:
        validate_pages_language(pages)
    except ValueError as exc:
        assert "немецкий" in str(exc)
    else:
        raise AssertionError("немецкий текст в конце книги должен быть отклонён")


def test_page_language_validation_checks_all_small_books():
    def page(english: str, russian: str):
        return {"en": [{"text": english}], "ru": [{"text": russian}]}

    pages = [page("English page text.", "Русский текст страницы.") for _ in range(100)]
    pages[40] = page("Deutsch Seite Text.", "Русский текст страницы.")
    try:
        validate_pages_language(pages)
    except ValueError as exc:
        assert "немецкий" in str(exc)
    else:
        raise AssertionError("немецкая страница в середине книги должна быть отклонена")


def test_ready_parallel_texts_are_aligned_without_translation():
    english = "The duck lived by the lake.\n\nIt was a quiet morning."
    russian = "Утка жила у озера.\n\nЭто было тихое утро."
    pages = align_pages(english, russian, FakeDictionary())
    words = [token for token in pages[0]["en"] if token["text"].strip()]
    assert words
    assert any(token["align"] is not None for token in words)
    assert any(token["text"].strip() for token in pages[0]["ru"])
