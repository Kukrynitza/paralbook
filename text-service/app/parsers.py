from __future__ import annotations

import gzip
import io
import json
import math
import re
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from xml.etree import ElementTree

from bs4 import BeautifulSoup
from charset_normalizer import from_bytes

from . import segment
from .config import (
    MAX_TWO_BOOKS_BYTES,
    MAX_TWO_BOOKS_PAGES,
    MAX_TWO_BOOKS_TOKENS,
    MAX_UPLOAD_BYTES,
    MAX_UPLOAD_TEXT,
    MIN_UPLOAD_TEXT,
)
from .dictionary import Dictionary


@dataclass
class Parsed:
    title: str
    author: str | None
    text: str
    format: str
    warnings: list[str] = field(default_factory=list)
    pages: list[dict] | None = None


def normalize_text(text: str) -> str:
    text = text.replace("\ufeff", "")
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", text)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


RUS_LETTERS = set("абвгдеёжзийклмнопрстуфхцчшщъыьэюя")
RUS_FREQ = "оеаинтсрвлкмдпуяыьгзбчйхжшюцщэфъё"
RUS_BIGRAMS = (
    "ст", "но", "то", "на", "ен", "ов", "ни", "ра", "во", "ко", "пр", "ро", "ос", "го",
    "ер", "ре", "ал", "ли", "ть", "ка", "по", "ти", "ло", "вс", "де", "ит", "за", "из",
    "ел", "ль", "ан", "ор", "ат", "те", "ла", "бы", "ил", "та", "ет", "да", "ты", "ье",
    "ьн", "ся", "ий", "ый", "ая", "ое", "ые", "их", "ую", "ем", "ом", "ам", "ах", "ой",
    "ей", "эт", "чт", "как", "все", "она", "они", "его", "для", "или", "при", "над",
)
RUS_WORDS = (
    "и", "в", "не", "на", "что", "он", "с", "как", "а", "то", "все", "она", "так",
    "его", "но", "да", "ты", "к", "у", "же", "вы", "за", "бы", "по", "только", "ее",
    "мне", "было", "вот", "от", "меня", "еще", "нет", "о", "из", "ему", "теперь",
    "когда", "даже", "ну", "вдруг", "ли", "если", "уже", "или", "ни", "быть", "был",
    "него", "до", "вас", "нибудь", "опять", "уж", "вам", "ведь", "там", "потом",
    "себя", "ничего", "ей", "может", "они", "тут", "где", "есть", "надо", "ней",
    "для", "мы", "тебя", "их", "чем", "была", "сам", "чтоб", "без", "будто", "чего",
    "раз", "тоже", "себе", "под", "будет", "это", "этот", "эта", "эти", "очень",
)


def _russian_score(text: str) -> float:
    lower = text.lower()
    letters = [ch for ch in lower if ch.isalpha()]
    if not letters:
        return 0.0
    cyrillic = sum(1 for ch in letters if ch in RUS_LETTERS)
    if cyrillic < len(letters) * 0.5:
        return 0.0
    score = 0.0
    for ch in letters:
        index = RUS_FREQ.find(ch)
        if index >= 0:
            score += 1.0 / (index + 1)
    score += 2.0 * sum(1 for bigram in RUS_BIGRAMS if bigram in lower)
    words = set(lower.replace("—", " ").replace("–", " ").split())
    score += 5.0 * sum(1 for word in RUS_WORDS if word in words)
    return score


def decode_bytes(data: bytes) -> str:
    if data.startswith(b"\xef\xbb\xbf"):
        return data.decode("utf-8-sig")
    if data.startswith((b"\xff\xfe", b"\xfe\xff")):
        try:
            return data.decode("utf-16")
        except UnicodeDecodeError:
            pass
    sample = data[:512]
    if b"\x00" in sample:
        even = sample[0::2].count(0)
        odd = sample[1::2].count(0)
        even_total = max(1, len(sample[0::2]))
        odd_total = max(1, len(sample[1::2]))
        if odd / odd_total > 0.3:
            try:
                return data.decode("utf-16-le")
            except UnicodeDecodeError:
                pass
        if even / even_total > 0.3:
            try:
                return data.decode("utf-16-be")
            except UnicodeDecodeError:
                pass
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError:
        pass
    declaration = re.search(rb"""encoding\s*=\s*["']([A-Za-z0-9._-]+)["']""", data[:4096], re.IGNORECASE)
    if declaration:
        try:
            return data.decode(declaration.group(1).decode("ascii"))
        except (LookupError, UnicodeDecodeError):
            pass
    best_value = ""
    best_score = 0.0
    for encoding in ("cp1251", "koi8-r", "cp866", "mac_cyrillic", "iso8859-5"):
        try:
            value = data.decode(encoding)
        except (LookupError, UnicodeDecodeError):
            continue
        score = _russian_score(value)
        if score > best_score:
            best_score = score
            best_value = value
    if best_score > 0:
        return best_value
    best = from_bytes(data).best()
    if best is not None and best.encoding:
        try:
            return str(best)
        except Exception:
            pass
    try:
        return data.decode("cp1252")
    except UnicodeDecodeError as exc:
        raise ValueError("Не удалось определить кодировку файла") from exc


def parse_txt(data: bytes) -> Parsed:
    return Parsed(title="", author=None, text=normalize_text(decode_bytes(data)), format="txt")


def parse_markdown(data: bytes) -> Parsed:
    text = decode_bytes(data)
    text = re.sub(r"```[\s\S]*?```", " ", text)
    text = re.sub(r"`([^`]*)`", r"\1", text)
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", text)
    text = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"^[ \t]{0,3}#{1,6}[ \t]*", "", text, flags=re.MULTILINE)
    text = re.sub(r"[*_~]{1,3}", "", text)
    return Parsed(title="", author=None, text=normalize_text(text), format="md")


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _child_text(node: ElementTree.Element, name: str) -> str:
    for child in node.iter():
        if _local(child.tag) == name and child.text:
            return child.text.strip()
    return ""


def parse_fb2(data: bytes) -> Parsed:
    try:
        root = ElementTree.fromstring(data)
    except ElementTree.ParseError as exc:
        raise ValueError(f"Не удалось прочитать FB2: {exc}") from exc
    title = author = ""
    for node in root.iter():
        name = _local(node.tag)
        if name == "book-title" and not title:
            title = (node.text or "").strip()
        if name == "author" and not author:
            parts = []
            for child in node:
                if _local(child.tag) in ("first-name", "middle-name", "last-name") and child.text:
                    parts.append(child.text.strip())
            author = " ".join(parts).strip()
    body = next((node for node in root.iter() if _local(node.tag) == "body"), None)
    if body is None:
        raise ValueError("В FB2 не найдено тело книги")
    paragraphs = []
    for node in body.iter():
        if _local(node.tag) in ("p", "subtitle", "title", "v") and node.text:
            value = "".join(node.itertext()).strip()
            if value:
                paragraphs.append(value)
    return Parsed(title=title, author=author or None, text=normalize_text("\n\n".join(paragraphs)), format="fb2")


def _epub_text(html: bytes) -> str:
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "nav"]):
        tag.decompose()
    blocks = []
    for tag in soup.find_all(["h1", "h2", "h3", "p", "li", "blockquote"]):
        value = tag.get_text(" ", strip=True)
        if value:
            blocks.append(value)
    return "\n\n".join(blocks)


def parse_epub(data: bytes) -> Parsed:
    try:
        archive = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile as exc:
        raise ValueError("Не удалось открыть EPUB") from exc
    names = {name.lower(): name for name in archive.namelist()}
    container_name = names.get("meta-inf/container.xml")
    if not container_name:
        raise ValueError("В EPUB нет META-INF/container.xml")
    container = ElementTree.fromstring(archive.read(container_name))
    rootfile = next((node.attrib.get("full-path") for node in container.iter() if _local(node.tag) == "rootfile"), None)
    if not rootfile:
        raise ValueError("В EPUB не найден OPF-файл")
    opf_name = names.get(rootfile.lower(), rootfile)
    opf = ElementTree.fromstring(archive.read(opf_name))
    title = ""
    author = ""
    manifest: dict[str, str] = {}
    spine: list[str] = []
    for node in opf.iter():
        name = _local(node.tag)
        if name == "title" and node.text and not title:
            title = node.text.strip()
        elif name == "creator" and node.text and not author:
            author = node.text.strip()
        elif name == "item":
            item_id = node.attrib.get("id")
            href = node.attrib.get("href")
            if item_id and href and "html" in (node.attrib.get("media-type") or ""):
                manifest[item_id] = href
        elif name == "itemref":
            ref = node.attrib.get("idref")
            if ref:
                spine.append(ref)
    base = str(Path(opf_name).parent)
    blocks = []
    for item_id in spine:
        href = manifest.get(item_id)
        if not href:
            continue
        path = str((Path(base) / href).as_posix()) if base not in ("", ".") else href
        actual = names.get(path.lower())
        if not actual:
            continue
        blocks.append(_epub_text(archive.read(actual)))
    return Parsed(title=title, author=author or None, text=normalize_text("\n\n".join(blocks)), format="epub")


def parse_docx(data: bytes) -> Parsed:
    try:
        import docx
        document = docx.Document(io.BytesIO(data))
    except Exception as exc:
        raise ValueError(f"Не удалось прочитать DOCX: {exc}") from exc
    paragraphs = [p.text.strip() for p in document.paragraphs if p.text.strip()]
    title = ""
    try:
        title = (document.core_properties.title or "").strip()
    except Exception:
        pass
    return Parsed(title=title, author=None, text=normalize_text("\n\n".join(paragraphs)), format="docx")


def _read_token(value) -> tuple[str, str, str, object]:
    parts = value if isinstance(value, list) else []
    word = parts[0] if len(parts) > 0 and isinstance(parts[0], str) else ""
    prefix = parts[1] if len(parts) > 1 and isinstance(parts[1], str) else ""
    suffix = parts[2] if len(parts) > 2 and isinstance(parts[2], str) else ""
    link = parts[3] if len(parts) > 3 else None
    return word, prefix, suffix, link


def _gzip_size(data: bytes) -> int:
    if len(data) < 4:
        return 0
    return int.from_bytes(data[-4:], "little")


def _zip_offset(data: bytes) -> int:
    for index in range(0, min(len(data) - 4, 4096) + 1):
        if data[index:index + 4] == b"PK\x03\x04":
            return index
    raise ValueError("Файл .2books повреждён: не найден ZIP")


def _decode_2books_page(data: bytes, position: int, dictionary: Dictionary) -> dict:
    if _gzip_size(data) > 20 * 1024 * 1024:
        raise ValueError(f"Страница {position + 1} слишком большая")
    try:
        raw = json.loads(gzip.decompress(data).decode("utf-8"))
    except Exception as exc:
        raise ValueError(f"Не удалось прочитать страницу {position + 1}") from exc
    ru_raw = raw.get("tokens2") if isinstance(raw, dict) else []
    en_raw = raw.get("tokens1") if isinstance(raw, dict) else []
    ru_raw = ru_raw if isinstance(ru_raw, list) else []
    en_raw = en_raw if isinstance(en_raw, list) else []
    ru_words = []
    for item in ru_raw:
        word, prefix, suffix, _ = _read_token(item)
        text = f"{prefix}{word}{suffix}".strip()
        if text:
            ru_words.append({"text": text})
    en_count = len(en_raw)
    ru_count = len(ru_words)
    en_tokens = []
    for item in en_raw:
        word, prefix, suffix, link = _read_token(item)
        text = f"{prefix}{word}{suffix}"
        if not text.strip():
            continue
        ru_index = link if isinstance(link, int) and 0 <= link < ru_count else None
        align = None
        if ru_index is not None and en_count and ru_count:
            align = min(en_count - 1, max(0, math.ceil(ru_index * en_count / ru_count)))
        for part in segment.pieces(text):
            if part.isspace():
                en_tokens.append({"text": part, "lemma": None, "align": None})
            else:
                en_tokens.append({"text": part, "lemma": dictionary.resolve_lemma(segment.bare(part)), "align": align})
    return {"position": position, "en": en_tokens, "ru": ru_words}


def parse_2books(data: bytes, dictionary: Dictionary) -> Parsed:
    if len(data) > MAX_TWO_BOOKS_BYTES:
        raise ValueError("Файл .2books слишком большой")
    try:
        archive = zipfile.ZipFile(io.BytesIO(data[_zip_offset(data):]))
    except zipfile.BadZipFile as exc:
        raise ValueError("Не удалось открыть .2books") from exc
    names = {name.lower(): name for name in archive.namelist()}
    meta_name = names.get("meta.json")
    if not meta_name:
        raise ValueError("В файле .2books нет meta.json")
    try:
        meta = json.loads(archive.read(meta_name).decode("utf-8"))
    except Exception as exc:
        raise ValueError("Не удалось прочитать meta.json") from exc
    main = meta.get("main") if isinstance(meta, dict) else {}
    secondary = meta.get("secondary") if isinstance(meta, dict) else {}
    if isinstance(meta, dict) and meta.get("isMonolingual"):
        raise ValueError("В книге нет параллельного перевода")
    main_lang = str((main or {}).get("lang") or "").upper()
    secondary_lang = str((secondary or {}).get("lang") or "").upper()
    if main_lang and main_lang != "EN":
        raise ValueError("Поддерживаются только книги с основным языком EN")
    if secondary_lang and secondary_lang != "RU":
        raise ValueError("Поддерживаются только книги с переводом RU")
    page_entries = []
    for name in archive.namelist():
        match = re.match(r"pages/(\d+)\.json\.gz$", name, re.IGNORECASE)
        if match:
            page_entries.append((int(match.group(1)), name))
    page_entries.sort()
    if not page_entries:
        raise ValueError("В файле .2books не найдены страницы")
    if len(page_entries) > MAX_TWO_BOOKS_PAGES:
        raise ValueError(f"В книге слишком много страниц. Максимум — {MAX_TWO_BOOKS_PAGES}")
    pages = []
    total = 0
    for position, (_, name) in enumerate(page_entries):
        page = _decode_2books_page(archive.read(name), position, dictionary)
        total += len(page["en"]) + len(page["ru"])
        if total > MAX_TWO_BOOKS_TOKENS:
            raise ValueError("В книге слишком много токенов")
        pages.append(page)
    title = str((main or {}).get("title") or "").strip()
    author = str((main or {}).get("author") or "").strip() or None
    description = str((main or {}).get("description") or "").strip()
    return Parsed(title=title, author=author, text=description, format="2books", pages=pages)


def parse_file(filename: str, data: bytes, dictionary: Dictionary) -> Parsed:
    if not data:
        raise ValueError("Файл пустой")
    extension = Path(filename or "").suffix.lower()
    head = data[:4096]
    if extension == ".2books":
        return parse_2books(data, dictionary)
    if len(data) > MAX_UPLOAD_BYTES:
        raise ValueError(f"Файл слишком большой. Максимум — {MAX_UPLOAD_BYTES // 1024 // 1024} МБ")
    if head.startswith(b"%PDF-"):
        raise ValueError("PDF не поддерживается. Сохраните текст в EPUB, DOCX или текстовом файле.")
    if data[:4] == b"PK\x03\x04":
        names = {name.lower() for name in zipfile.ZipFile(io.BytesIO(data)).namelist()}
        if "meta-inf/container.xml" in names:
            return parse_epub(data)
        if "word/document.xml" in names:
            return parse_docx(data)
        raise ValueError("Не удалось определить формат архива. Поддерживаются EPUB и DOCX.")
    if re.search(rb"<FictionBook[\s>]", head, re.IGNORECASE):
        return parse_fb2(data)
    if extension in (".md", ".markdown") or b"\n#" in head:
        return parse_markdown(data)
    if extension in (".txt", ".text", "") or b"\n" in head:
        return parse_txt(data)
    return parse_txt(data)


def validate_text(text: str) -> str:
    value = normalize_text(text)
    if not value:
        raise ValueError("В файле не нашлось текста")
    if len(value) < MIN_UPLOAD_TEXT:
        raise ValueError("В файле слишком мало текста")
    if len(value) > MAX_UPLOAD_TEXT:
        raise ValueError(f"Текст слишком длинный. Максимум — {MAX_UPLOAD_TEXT} символов")
    return value


def detect_language(text: str) -> str:
    latin = len(re.findall(r"[A-Za-z]", text or ""))
    cyrillic = len(re.findall(r"[А-Яа-яЁё]", text or ""))
    if not latin and not cyrillic:
        return "en"
    return "ru" if cyrillic > latin else "en"


def title_from_text(text: str, limit: int = 60) -> str:
    clean = re.sub(r"\s+", " ", text or "").strip()
    if not clean:
        return ""
    sentence = re.match(r"^[\s\S]*?[.!?…][\"»']?", clean)
    value = (sentence.group(0) if sentence else clean).strip().rstrip(" .!?…\"»'")
    if len(value) <= limit:
        return value
    cut = value[:limit + 1]
    at = cut.rfind(" ")
    return (cut[:at] if at > 0 else cut[:limit]).rstrip(" ,;:—-") + "…"
