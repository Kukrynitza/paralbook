import pytest

from app import lemmatize

pytestmark = pytest.mark.skipif(
    not lemmatize.available(), reason="spaCy English model is not installed"
)


def annotated(words: list[str]) -> dict[str, dict]:
    tokens = [{"text": word} for word in words]
    lemmatize.annotate(tokens, spaced=True)
    return {token["text"]: token for token in tokens}


def test_irregular_past_forms():
    tokens = annotated(["I", "saw", "him", "and", "he", "left", "the", "room", "."])
    assert tokens["saw"]["lemma"] == "see"
    assert tokens["saw"]["pos"] == "VERB"
    assert tokens["left"]["lemma"] == "leave"
    assert tokens["left"]["pos"] == "VERB"


def test_auxiliary_forms():
    tokens = annotated(["She", "has", "been", "and", "they", "were", "late", "."])
    assert tokens["has"]["lemma"] == "have"
    assert tokens["been"]["lemma"] == "be"
    assert tokens["were"]["lemma"] == "be"


def test_contractions():
    tokens = annotated(["I", "can't", "go", "and", "it", "won't", "work", "."])
    assert tokens["can't"]["lemma"] == "can"
    assert tokens["won't"]["lemma"] == "will"


def test_possessive_and_hyphen():
    tokens = annotated(["The", "artist's", "real-life", "story"])
    assert tokens["artist's"]["lemma"] == "artist"
    assert tokens["real-life"]["lemma"] == "life"


def test_standalone_clitic_stays_empty():
    tokens = annotated(["everyone", "'s", "here"])
    assert tokens["everyone"]["lemma"] == "everyone"
    assert tokens["'s"]["lemma"] is None


def test_stored_tokens_with_whitespace():
    tokens = [{"text": "The"}, {"text": " "}, {"text": "dog's"}, {"text": " "}, {"text": "bowl."}]
    assert lemmatize.annotate(tokens)
    assert tokens[2]["lemma"] == "dog"
    assert tokens[4]["lemma"] == "bowl"
