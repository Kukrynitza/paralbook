from solver.service import _page_texts, _paragraphs, _preview, _streak_count, repair_marks


def test_windows_marks_become_apostrophe_quotes_and_dash():
    broken = "This man\ufffds name was Albus. He didn\ufffdt go. He muttered, \ufffdI should have known.\ufffd It clicked again\ufffdthe next."
    fixed = repair_marks(broken)
    assert "\ufffd" not in fixed
    assert "man’s" in fixed
    assert "didn’t" in fixed
    assert "“I should have known.”" in fixed
    assert "again—the" in fixed


def test_indented_lines_become_paragraphs_and_wraps_join():
    book = "1. THE BOY WHO LIVED\n   Mr. and Mrs. Dursley were\n   proud.\n   They were the last people.\n"
    paragraphs = _paragraphs(book)
    assert paragraphs[0] == "1. THE BOY WHO LIVED"
    assert paragraphs[1] == "Mr. and Mrs. Dursley were proud."
    assert paragraphs[2] == "They were the last people."
    pages = _page_texts(book)
    assert "\n\n" in pages[0]


def test_cp1252_apostrophe_is_not_a_replacement_character():
    text = b"man\x92s name.\n   He didn\x92t stay.".decode("cp1252")
    assert "\ufffd" not in text
    assert len(_paragraphs(text)) == 2


def test_streak_keeps_yesterday_when_today_is_empty():
    assert _streak_count(["2026-10-28", "2026-10-27"], "2026-10-29") == 2
    assert _streak_count(["2026-10-29", "2026-10-28"], "2026-10-29") == 2
    assert _streak_count(["2026-10-27"], "2026-10-29") == 0
    assert _streak_count([], "2026-10-29") == 0


def test_preview_keeps_the_first_sentence():
    text = "Many students believe that studying for hours on end is the key to success. However, research shows that how you study is far more important than how long you sit."
    shown = _preview(text, 180)
    assert shown == "Many students believe that studying for hours on end is the key to success."


def test_preview_stops_on_a_whole_word():
    text = "Many students believe that studying for hours on end is the key to success and that sitting longer always helps more than a short focused session"
    shown = _preview(text, 80)
    assert not shown.endswith(" y")
    assert shown.endswith("…")
    assert " " not in shown[-2:]
    assert _preview("how long y") == "how long…"
