from app.parsers import title_from_text


def test_title_from_first_sentence():
    assert title_from_text("The duck lived by the lake. It was a quiet morning.") == "The duck lived by the lake"


def test_title_without_punctuation():
    assert title_from_text("A very short title") == "A very short title"


def test_title_is_limited_at_word_boundary():
    value = title_from_text("word " * 40)
    assert value.endswith("…")
    assert len(value) <= 61
    assert "  " not in value


def test_title_empty():
    assert title_from_text("   ") == ""
