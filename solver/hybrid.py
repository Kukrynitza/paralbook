import json
import math
import re
from datetime import datetime, timedelta, timezone

LEVELS = ("A1", "A2", "B1", "B2", "C1", "C2")
STOP = set(
    "a an the of to in on and or for with from at by is are was were be been being it this that as not but if so we you he she they i my your his her our their about into after before than then too very can will just".split()
)
_EDGE = re.compile(r"^[^A-Za-zА-Яа-яЁё]+|[^A-Za-zА-Яа-яЁё]+$")
_SPLIT = re.compile(r"(\s+)")
_SPACE = re.compile(r"[ ]{2,}")
_PUNCT = re.compile(r"\s+([,.!?])")
_BOUNDARY = re.compile(r"[.!?]")


def level_rank(level: str) -> int:
    try:
        return LEVELS.index(level) + 1
    except ValueError:
        return 0


def bare(part: str) -> str:
    return _EDGE.sub("", part).lower()


def pieces(sentence: str) -> list[str]:
    return [part for part in _SPLIT.split(sentence) if part]


def content_words(text: str) -> list[str]:
    return [word for word in (bare(part) for part in pieces(text)) if len(word) > 2 and word not in STOP]


def _round_half_up(value: float) -> int:
    return int(math.floor(value + 0.5))


def decide_sense(senses: list[dict], sentence: str, neural: dict | None) -> dict:
    if not senses:
        return {"sense_id": None, "disagreement": True, "reason": "В базе знаний нет значений"}
    words = set(content_words(sentence))
    scored = []
    for sense in senses:
        cues = sum(1 for cue in sense.get("cues") or [] if cue.lower() in words)
        examples = sum(1 for example in sense.get("examples") or [] for word in content_words(example) if word in words)
        scored.append({"sense": sense, "score": cues * 3 + examples})
    scored.sort(key=lambda item: item["score"], reverse=True)
    symbolic = scored[0]
    known_neural = bool(neural and any(sense["id"] == neural.get("sense_id") for sense in senses))
    if neural and not known_neural:
        fallback = symbolic["sense"] if symbolic["score"] > 0 else senses[0]
        return {
            "sense_id": fallback["id"],
            "disagreement": True,
            "reason": "Модель назвала значение вне базы знаний",
        }
    neural_ok = bool(neural and known_neural and float(neural.get("confidence") or 0) >= 0.6)
    if neural_ok and neural:
        if symbolic["score"] >= 3 and symbolic["sense"]["id"] != neural["sense_id"]:
            return {
                "sense_id": symbolic["sense"]["id"],
                "disagreement": True,
                "reason": "Подсказки базы знаний расходятся с моделью",
            }
        return {"sense_id": neural["sense_id"], "disagreement": False, "reason": "Значение модели есть в базе знаний"}
    if symbolic["score"] > 0:
        reason = (
            "Уверенность модели низкая, взято значение из базы знаний"
            if neural
            else "Модель недоступна, значение выбрано по базе знаний"
        )
        return {"sense_id": symbolic["sense"]["id"], "disagreement": True, "reason": reason}
    return {
        "sense_id": senses[0]["id"],
        "disagreement": True,
        "reason": "Нет уверенного значения, показано первое из базы знаний",
    }


def filter_english(text: str, level: str, known: dict[str, str], replacement_for) -> dict:
    target = level_rank(level)
    warnings: list[str] = []
    out: list[str] = []
    for part in pieces(text):
        if part.isspace():
            out.append(part)
            continue
        word = bare(part)
        if not word or word in STOP or len(word) < 3:
            out.append(part)
            continue
        word_level = known.get(word)
        if not word_level or level_rank(word_level) <= target:
            out.append(part)
            continue
        replacement = replacement_for(word)
        replacement_level = known.get(replacement) if replacement else None
        if replacement and replacement_level and level_rank(replacement_level) <= target:
            warnings.append(f"{word} заменено на {replacement}")
            out.append(re.sub(re.escape(word), replacement, part, count=1, flags=re.IGNORECASE))
        else:
            warnings.append(f"{word} убрано: выше уровня {level}")
            out.append("")
    cleaned = _PUNCT.sub(r"\1", _SPACE.sub(" ", "".join(out))).strip()
    return {"text": cleaned, "warnings": warnings}


def keep_level_sentences(text: str, level: str, known: dict[str, str], replacement_for) -> dict:
    sentences = [part.strip() for part in re.split(r"(?<=[.!?])\s+", text.strip()) if part.strip()]
    if not sentences:
        return {"text": "", "warnings": []}
    kept: list[str] = []
    warnings: list[str] = []
    for sentence in sentences:
        filtered = filter_english(sentence, level, known, replacement_for)
        if any("убрано" in item for item in filtered["warnings"]):
            warnings.extend(filtered["warnings"])
            continue
        if filtered["text"]:
            kept.append(filtered["text"])
        warnings.extend(item for item in filtered["warnings"] if "убрано" not in item)
    return {"text": " ".join(kept).strip(), "warnings": warnings}


def next_schedule(interval_days: float, ease: float, remembered: bool) -> dict:
    if not remembered:
        return {"interval_days": 1, "ease": max(1.3, _round_half_up((ease - 0.2) * 100) / 100)}
    if interval_days < 1:
        nxt = 1
    elif interval_days == 1:
        nxt = 3
    else:
        nxt = max(1, _round_half_up(interval_days * ease))
    return {"interval_days": nxt, "ease": min(3, _round_half_up((ease + 0.1) * 100) / 100)}


def due_from(interval_days: int, now: datetime | None = None) -> datetime:
    base = now or datetime.now(timezone.utc)
    return base + timedelta(days=interval_days)


def overlap_score(query: str, body: str) -> float:
    left = set(content_words(query))
    if not left:
        return 0
    hit = sum(1 for word in content_words(body) if word in left)
    return hit / len(left)


def cosine(left: list[float], right: list[float]) -> float:
    if not left or len(left) != len(right):
        return 0
    dot = left_norm = right_norm = 0.0
    for a, b in zip(left, right):
        dot += a * b
        left_norm += a * a
        right_norm += b * b
    if not left_norm or not right_norm:
        return 0
    return dot / (math.sqrt(left_norm) * math.sqrt(right_norm))


def sentence_at(tokens: list[str], index: int) -> str:
    start = end = index
    while start > 0 and not _BOUNDARY.search(tokens[start - 1] or ""):
        start -= 1
    while end < len(tokens) - 1 and not _BOUNDARY.search(tokens[end] or ""):
        end += 1
    return "".join(tokens[start : end + 1])


def chunks_of(body: str, size: int = 480) -> list[str]:
    clean = body.replace("\r", "").strip()
    if not clean:
        return []
    sentences = re.split(r"(?<=[.!?])\s+", clean)
    chunks: list[str] = []
    current = ""
    for sentence in sentences:
        joined = f"{current} {sentence}".strip()
        if len(joined) > size and current:
            chunks.append(current.strip())
            current = sentence
        else:
            current = joined
    if current:
        chunks.append(current.strip())
    return chunks


def mnemonic_of(parts: list[dict]) -> str | None:
    prefix = next((part for part in parts if part["kind"] == "prefix"), None)
    root = next((part for part in parts if part["kind"] == "root"), None)
    if not prefix or not root:
        return None
    stem = f": {prefix['gloss']} + {root['stem_translation']}" if root.get("stem_translation") else ""
    return f"{prefix['form']}- + {root['form']}{stem}"[:80]


def accept_mnemonic(proposed: str | None, kb: str | None) -> str | None:
    if not kb:
        return None
    if not proposed:
        return kb
    forms = [re.sub(r"[^a-z]", "", part, flags=re.I).lower() for part in kb.split(":")[0].split("+")]
    forms = [form for form in forms if form]
    hay = proposed.lower()
    if forms and all(form in hay for form in forms):
        return proposed.strip()[:80]
    return kb


def as_vector(value) -> list[float] | None:
    if isinstance(value, list) and all(isinstance(item, (int, float)) and not isinstance(item, bool) for item in value):
        return [float(item) for item in value]
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return None
        return as_vector(parsed)
    return None
