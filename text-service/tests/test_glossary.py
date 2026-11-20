from app.glossary import POS_FOR_LABEL, pick_from, plain


def test_plain_normalizes_punctuation_and_spaces():
    assert plain("  Правильный;  правый, верный! ") == "правильный правый верный"


def test_pos_for_label_covers_parts_of_speech():
    assert POS_FOR_LABEL["сущ."] == ["NOUN", "PROPN"]
    assert POS_FOR_LABEL["гл."] == ["VERB", "AUX"]
    assert POS_FOR_LABEL["нареч."] == ["ADV", "PART"]


def test_pick_from_keeps_the_translation_when_it_matches():
    senses = ["прямой (не согнутый)", "правильный; правый, верный, справедливый"]
    assert (
        pick_from("правильный; правый, верный; справедливый", senses)
        == "правильный; правый, верный, справедливый"
    )


def test_pick_from_takes_the_first_sense_of_the_group():
    assert pick_from("позволение, разрешение", ["покидать, оставлять"]) == "покидать, оставлять"
    assert pick_from("колодец, скважина", ["хорошо"]) == "хорошо"


def test_pick_from_handles_missing_values():
    assert pick_from(None, ["свет"]) == "свет"
    assert pick_from("свет", []) == "свет"
    assert pick_from(None, []) == ""
