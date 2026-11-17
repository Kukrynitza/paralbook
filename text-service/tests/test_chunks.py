from app.llm import _translation_blocks


def test_sentence_chunks():
    chunks = _translation_blocks("One. Two. Three. Four.", "sentences", 2, "en-ru")
    assert [chunk for _, chunk in chunks] == ["One. Two.", "Three. Four."]
    assert all(index == 0 for index, _ in chunks)


def test_blocks_stay_separate():
    chunks = _translation_blocks("One. Two.\n\nThree. Four.", "sentences", 3, "en-ru")
    assert [index for index, _ in chunks] == [0, 1]
    assert [chunk for _, chunk in chunks] == ["One. Two.", "Three. Four."]


def test_token_chunks_do_not_split_sentences():
    text = " ".join(["First sentence here.", "Second sentence here.", "Third sentence here."])
    chunks = _translation_blocks(text, "tokens", 300, "en-ru")
    assert chunks
    for _, chunk in chunks:
        assert chunk.endswith(".")


def test_single_long_sentence_is_one_chunk():
    text = " ".join(["word"] * 1000) + "."
    chunks = _translation_blocks(text, "tokens", 300, "en-ru")
    assert len(chunks) == 1
    assert chunks[0][1].endswith(".")
