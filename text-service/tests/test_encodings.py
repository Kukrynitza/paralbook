from app.parsers import decode_bytes, normalize_text

TEXT = "Утка жила у озера. Это было тихое утро."


def test_decode_utf8():
    assert normalize_text(decode_bytes(TEXT.encode("utf-8"))) == TEXT


def test_decode_utf16_le():
    assert normalize_text(decode_bytes(TEXT.encode("utf-16"))) == TEXT


def test_decode_utf16_be():
    assert normalize_text(decode_bytes(b"\xfe\xff" + TEXT.encode("utf-16-be"))) == TEXT


def test_decode_windows_1251():
    assert normalize_text(decode_bytes(TEXT.encode("cp1251"))) == TEXT


def test_decode_koi8r():
    assert normalize_text(decode_bytes(TEXT.encode("koi8-r"))) == TEXT


def test_decode_xml_declaration():
    data = f'<?xml version="1.0" encoding="windows-1251"?><root>{TEXT}</root>'.encode("cp1251")
    assert TEXT in decode_bytes(data)
