from solver.hybrid import accept_mnemonic, decide_sense, filter_english, keep_level_sentences, mnemonic_of, next_schedule, overlap_score

RIVER = {"id": "river", "text": "берег", "cues": ["river", "water"], "examples": []}
FINANCE = {"id": "finance", "text": "банк", "cues": ["money", "cash"], "examples": ["money in a bank"]}


def test_river_bank_without_model():
    decision = decide_sense([RIVER, FINANCE], "The river bank was quiet.", None)
    assert decision["sense_id"] == "river"
    assert decision["disagreement"] is True


def test_money_bank_without_model():
    decision = decide_sense([RIVER, FINANCE], "I left the money in the bank.", None)
    assert decision["sense_id"] == "finance"


def test_invented_sense_is_rejected():
    decision = decide_sense(
        [RIVER, FINANCE],
        "The river bank was quiet.",
        {"sense_id": "made-up", "confidence": 0.9},
    )
    assert decision["sense_id"] == "river"
    assert decision["disagreement"] is True
    assert "вне базы" in decision["reason"]


def test_knowledge_base_wins_a_clash():
    decision = decide_sense(
        [RIVER, FINANCE],
        "The river bank was quiet.",
        {"sense_id": "finance", "confidence": 0.95},
    )
    assert decision["sense_id"] == "river"
    assert decision["disagreement"] is True


def test_trusted_neural_when_cues_are_silent():
    decision = decide_sense(
        [RIVER, FINANCE],
        "The bank was closed.",
        {"sense_id": "finance", "confidence": 0.9},
    )
    assert decision["sense_id"] == "finance"
    assert decision["disagreement"] is False


def test_cefr_drops_and_replaces():
    levels = {"photosynthesis": "C2", "plant": "A2"}
    dropped = filter_english("Photosynthesis is a plant.", "A2", levels, lambda _word: None)
    assert "photosynthesis" not in dropped["text"].lower()
    assert any("photosynthesis" in item for item in dropped["warnings"])
    replaced = filter_english(
        "Photosynthesis is a plant.",
        "A2",
        levels,
        lambda word: "plant" if word == "photosynthesis" else None,
    )
    assert "plant" in replaced["text"].lower()
    assert "photosynthesis" not in replaced["text"].lower()


def test_hard_sentence_is_dropped_whole():
    levels = {"photosynthesis": "C2", "plant": "A2", "grows": "A2"}
    kept = keep_level_sentences(
        "Photosynthesis is complex. A plant grows.",
        "A2",
        levels,
        lambda _word: None,
    )
    assert "photosynthesis" not in kept["text"].lower()
    assert "plant grows" in kept["text"].lower()
    assert "is complex" not in kept["text"].lower()


def test_schedule_and_mnemonic():
    again = next_schedule(1, 2.5, True)
    assert again["interval_days"] == 3
    reset = next_schedule(3, 2.5, False)
    assert reset["interval_days"] == 1
    assert reset["ease"] < 2.5
    memory = mnemonic_of(
        [
            {"kind": "prefix", "form": "un", "gloss": "не", "stem_translation": None},
            {"kind": "root", "form": "happy", "gloss": "счастливый", "stem_translation": "счастливый"},
        ]
    )
    assert memory == "un- + happy: не + счастливый"
    assert accept_mnemonic("совсем другое", memory) == memory
    assert accept_mnemonic("un + happy, не счастливый", memory) == "un + happy, не счастливый"
    assert mnemonic_of([{"kind": "prefix", "form": "un", "gloss": "не", "stem_translation": None}]) is None
    assert overlap_score("river bank", "The river bank was quiet.") > 0
