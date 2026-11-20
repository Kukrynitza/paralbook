from __future__ import annotations

import hashlib
import logging
from collections import OrderedDict

try:
    import edge_tts
except ImportError:  # сервис текста должен работать и без необязательной озвучки
    edge_tts = None

from .config import TTS_MAX_CHARS, TTS_VOICE

log = logging.getLogger("text-service.tts")

_CACHE: OrderedDict[str, bytes] = OrderedDict()
_CACHE_BYTES = 0
_CACHE_LIMIT = 48 * 1024 * 1024


def _limit(text: str) -> str:
    clean = " ".join(text.split())
    if len(clean) <= TTS_MAX_CHARS:
        return clean
    cut = clean[:TTS_MAX_CHARS]
    space = cut.rfind(" ")
    if space > TTS_MAX_CHARS // 2:
        cut = cut[:space]
    return cut.strip()


async def synthesize(text: str) -> bytes:
    global _CACHE_BYTES
    clean = _limit(text)
    if not clean:
        raise ValueError("Пустой текст")
    key = hashlib.sha1(f"{TTS_VOICE}\0{clean}".encode("utf-8")).hexdigest()
    cached = _CACHE.get(key)
    if cached is not None:
        _CACHE.move_to_end(key)
        return cached
    if edge_tts is None:
        raise RuntimeError("Модуль edge-tts не установлен")
    communicate = edge_tts.Communicate(clean, TTS_VOICE)
    chunks: list[bytes] = []
    async for chunk in communicate.stream():
        if chunk.get("type") == "audio" and chunk.get("data"):
            chunks.append(chunk["data"])
    audio = b"".join(chunks)
    if not audio:
        raise RuntimeError("Сервис озвучки не вернул аудио")
    while _CACHE and _CACHE_BYTES + len(audio) > _CACHE_LIMIT:
        _, old = _CACHE.popitem(last=False)
        _CACHE_BYTES -= len(old)
    _CACHE[key] = audio
    _CACHE_BYTES += len(audio)
    return audio
