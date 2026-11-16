from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import logging
import os
import re
import time
from dataclasses import dataclass
from urllib.parse import urlsplit

import httpx
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from . import segment
from .config import (
    CHAT_CHUNK_WORDS,
    CHAT_MAX_TOKENS,
    LLM_API_KEY,
    LLM_BASE_URL,
    LLM_CHAT_MODEL,
    LLM_LEGACY_SECRET,
    LLM_SETTINGS_SECRET,
    LLM_TIMEOUT_SECONDS,
    TRANSLATE_BLOCK_CHARS,
    TRANSLATE_CONCURRENCY,
    WORDS_PER_MINUTE,
)
from .db import Database

log = logging.getLogger("text-service.llm")


class LlmError(Exception):
    def __init__(self, message: str, code: str = "error", status: int | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.code = code
        self.status = status


@dataclass
class LlmConfig:
    base_url: str
    model: str
    api_key: str | None
    source: str = "env"


def _derive(secret: str) -> bytes:
    return hashlib.sha256(secret.encode("utf-8")).digest()


def encrypt_api_key(api_key: str) -> str:
    secret = LLM_SETTINGS_SECRET
    if not secret:
        raise LlmError("Не задан LLM_SETTINGS_SECRET", "no_key")
    iv = os.urandom(12)
    cipher = AESGCM(_derive(secret)).encrypt(iv, api_key.encode("utf-8"), None)
    tag, ciphertext = cipher[-16:], cipher[:-16]
    return ":".join(["v2", base64.b64encode(iv).decode(), base64.b64encode(tag).decode(), base64.b64encode(ciphertext).decode()])


def decrypt_api_key(stored: str) -> tuple[str, bool]:
    parts = stored.split(":")
    if len(parts) != 4 or parts[0] not in ("v1", "v2"):
        raise LlmError("Ключ сохранён в неизвестном формате", "bad_key")
    version, iv, tag, ciphertext = parts
    secret = LLM_SETTINGS_SECRET if version == "v2" else (LLM_LEGACY_SECRET or LLM_SETTINGS_SECRET)
    if not secret:
        raise LlmError("Не задан секрет для хранения ключей", "no_key")
    try:
        value = AESGCM(_derive(secret)).decrypt(
            base64.b64decode(iv),
            base64.b64decode(ciphertext) + base64.b64decode(tag),
            None,
        )
    except Exception as exc:
        raise LlmError("Не удалось расшифровать API-ключ", "bad_key") from exc
    return value.decode("utf-8"), version == "v1"


def key_hint(api_key: str | None) -> str | None:
    value = (api_key or "").strip()
    if not value:
        return None
    return "••••" if len(value) <= 8 else value[-4:]


def normalize_base_url(value: str) -> str:
    return (value or "").strip().rstrip("/")


def chat_endpoint(base_url: str) -> str:
    base = normalize_base_url(base_url)
    return base if re.search(r"/chat/completions$", base, re.I) else f"{base}/chat/completions"


def models_endpoint(base_url: str) -> str:
    return re.sub(r"/chat/completions$", "", normalize_base_url(base_url), flags=re.I) + "/models"


def is_local(base_url: str) -> bool:
    try:
        host = urlsplit(base_url).hostname or ""
        return host in ("localhost", "127.0.0.1", "::1", "0.0.0.0", "host.docker.internal") or host.endswith(".local")
    except Exception:
        return False


def env_config() -> LlmConfig | None:
    key = (LLM_API_KEY or "").strip() or None
    if not key:
        return None
    return LlmConfig(LLM_BASE_URL, LLM_CHAT_MODEL, key, "env")


def _missing_table(exc: Exception) -> bool:
    return getattr(exc, "code", None) == "42P01" or getattr(exc, "sqlstate", None) == "42P01"


async def load_config(db: Database, user_id: str) -> LlmConfig:
    try:
        row = await db.get_llm_settings(user_id)
    except Exception as exc:
        if not _missing_table(exc):
            raise
        row = None
    if row:
        api_key = None
        if row.get("api_key_ciphertext"):
            try:
                api_key, legacy = decrypt_api_key(row["api_key_ciphertext"])
                if legacy:
                    await db.set_llm_ciphertext(user_id, encrypt_api_key(api_key))
            except LlmError:
                api_key = None
        config = LlmConfig(row["base_url"], row["model"], api_key, "user")
        if api_key or is_local(config.base_url):
            return config
    default = env_config()
    if default:
        return default
    raise LlmError("Модель не настроена. Укажите API-ключ в настройках.", "no_key")


def _response_error(status: int, detail: str) -> LlmError:
    clean = re.sub(r"\s+", " ", detail or "").strip()[:300]
    if status in (401, 403):
        return LlmError("Неверный API-ключ или нет доступа", "unauthorized", status)
    if status == 404:
        return LlmError("Модель или адрес не найдены. Проверьте Base URL и название модели.", "not_found", status)
    if status == 429:
        return LlmError("Превышен лимит запросов. Попробуйте позже.", "rate_limit", status)
    if status >= 500:
        return LlmError("Сервер модели вернул ошибку. Попробуйте позже.", "network", status)
    return LlmError(f"Провайдер отклонил запрос: {clean}" if clean else "Провайдер отклонил запрос", "bad_request", status)


async def chat_completion(config: LlmConfig, system: str, user: str, *, max_tokens: int | None = None,
                          temperature: float = 0.7, timeout: int | None = None,
                          client: httpx.AsyncClient | None = None) -> str:
    if not config.base_url or not config.model:
        raise LlmError("Модель не настроена. Укажите Base URL и название модели.", "no_key")
    if not config.api_key and not is_local(config.base_url):
        raise LlmError("Не указан API-ключ модели.", "unauthorized")
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if config.api_key:
        headers["Authorization"] = f"Bearer {config.api_key}"
    payload = {
        "model": config.model,
        "temperature": temperature,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
    }
    if max_tokens:
        payload["max_tokens"] = max_tokens
    own_client = client is None
    http_client = client or httpx.AsyncClient(timeout=timeout or LLM_TIMEOUT_SECONDS)
    try:
        response = await http_client.post(chat_endpoint(config.base_url), headers=headers, json=payload)
    except httpx.TimeoutException as exc:
        raise LlmError("Сервер модели не ответил вовремя", "timeout") from exc
    except httpx.HTTPError as exc:
        raise LlmError("Не удалось подключиться к серверу модели", "network") from exc
    finally:
        if own_client:
            await http_client.aclose()
    if response.status_code >= 400:
        raise _response_error(response.status_code, response.text)
    try:
        data = response.json()
    except Exception as exc:
        raise LlmError("Модель вернула некорректный ответ", "empty") from exc
    content = ((data.get("choices") or [{}])[0].get("message") or {}).get("content")
    if not isinstance(content, str) or not content.strip():
        raise LlmError("Модель не вернула текст. Попробуйте другую модель.", "empty")
    return content


def read_object(raw: str) -> dict | None:
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?", "", cleaned, flags=re.I).strip()
        cleaned = re.sub(r"```$", "", cleaned).strip()
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start < 0 or end <= start:
        return None
    try:
        value = json.loads(cleaned[start:end + 1])
        return value if isinstance(value, dict) else None
    except Exception:
        return None


def _interest_note(interests: list[str]) -> str:
    names = [item.strip() for item in interests if item and item.strip()]
    if not names:
        return ""
    return f" Интересы читателя: {', '.join(names)}. Вплетай их в примеры. Явно заданную тему не подменяй."


def _repeats(previous: str, piece: str) -> bool:
    if not previous or not piece:
        return False
    sample = re.sub(r"\s+", " ", piece).strip()[:80].lower()
    return bool(sample) and sample in re.sub(r"\s+", " ", previous).lower()


async def _next_piece(config: LlmConfig, topic: str, level: str, need: int, english: str,
                      strict: bool, interests: list[str], client: httpx.AsyncClient) -> dict:
    note = _interest_note(interests)
    if english:
        prefix = ('Предыдущий ответ повторил уже написанное. Напиши следующие предложения того же текста, которых ещё нет.'
                  if strict else
                  'Продолжи тот же учебный текст следующим фрагментом из 4–5 абзацев, всего около addWords английских слов. Не повторяй уже написанное, не заканчивай историю и не начинай новую.')
        system = (f"{prefix} Верни только JSON {{\"english\",\"russian\"}} — только новый кусок, уровень CEFR не выше заданного.{note}")
        payload = {"level": level, "addWords": need, "english": english[-1800:]}
    else:
        system = (f"Ты пишешь один связный учебный английский текст. Верни только JSON {{\"title\",\"english\",\"russian\"}}. "
                  f"russian — перевод этой части. Около words слов, уровень CEFR не выше заданного. Каждое предложение закончено. Это начало текста.{note}")
        payload = {"topic": topic, "words": need, "level": level}
    raw = await chat_completion(
        config,
        system,
        json.dumps(payload, ensure_ascii=False),
        temperature=0.7,
        max_tokens=CHAT_MAX_TOKENS,
        client=client,
    )
    parsed = read_object(raw) or {}
    return {
        "english": str(parsed.get("english") or "").strip(),
        "russian": str(parsed.get("russian") or "").strip(),
        "title": str(parsed.get("title") or "").strip(),
    }


async def generate_chat_text(db: Database, user_id: str, topic: str, minutes: int, level: str,
                             progress=None) -> dict:
    config = await load_config(db, user_id)
    interests = await db.get_interests(user_id)
    target = minutes * WORDS_PER_MINUTE
    english = ""
    russian = ""
    title = topic if len(topic) <= 42 else topic[:40] + "…"
    async with httpx.AsyncClient(timeout=LLM_TIMEOUT_SECONDS) as client:
        for step in range(24):
            if progress:
                await progress(min(80, 10 + step * 3))
            have = segment.word_count(english)
            if have >= int(target * 0.95):
                break
            need = min(CHAT_CHUNK_WORDS, max(40, target - have))
            started = time.perf_counter()
            piece = await _next_piece(config, topic, level, need, english, False, interests, client)
            if piece["english"] and _repeats(english, piece["english"]):
                retry = await _next_piece(config, topic, level, need, english, True, interests, client)
                piece = {key: retry.get(key) or piece.get(key) for key in ("english", "russian", "title")}
            log.info("chat step %s: %.1fs, words=%s", step, time.perf_counter() - started, segment.word_count(piece["english"]))
            if not piece["english"]:
                break
            before = have
            english = f"{english}\n\n{piece['english']}" if english else piece["english"]
            if piece["title"] and before == 0:
                title = piece["title"][:80]
            if piece["russian"]:
                russian = f"{russian}\n\n{piece['russian']}" if russian else piece["russian"]
            if segment.word_count(english) <= before + 20:
                break
    if not english:
        raise LlmError("Модель не ответила. Повторите ещё раз.", "empty")
    return {
        "title": title[:80],
        "english": english,
        "russian": russian or english,
        "minutes": max(1, round(segment.word_count(english) / WORDS_PER_MINUTE)),
    }


def _translation_blocks(text: str) -> list[str]:
    blocks = segment.split_blocks(text)
    result = []
    for block in blocks or [text]:
        if len(block) <= TRANSLATE_BLOCK_CHARS:
            result.append(block)
            continue
        current = ""
        for sentence in segment.split_sentences(block):
            if current and len(current) + len(sentence) > TRANSLATE_BLOCK_CHARS:
                result.append(current.strip())
                current = sentence
            else:
                current = f"{current} {sentence}".strip()
        if current:
            result.append(current.strip())
    return [item for item in result if item]


async def translate_text(config: LlmConfig, text: str, progress=None, direction: str = "en-ru") -> str:
    blocks = _translation_blocks(text)
    if not blocks:
        return ""
    if direction == "ru-en":
        system = ("Переведи русский текст на английский язык. Сохраняй абзацы и смысл. "
                  "Верни только перевод, без пояснений, кавычек и markdown.")
    else:
        system = ("Переведи английский текст на русский язык. Сохраняй абзацы и смысл. "
                  "Верни только перевод, без пояснений, кавычек и markdown.")
    out: list[str | None] = [None] * len(blocks)
    semaphore = asyncio.Semaphore(max(1, TRANSLATE_CONCURRENCY))
    completed = 0

    async with httpx.AsyncClient(timeout=LLM_TIMEOUT_SECONDS) as client:
        async def translate_one(index: int, block: str) -> tuple[int, str]:
            async with semaphore:
                value = await chat_completion(config, system, block, temperature=0.2, client=client)
                return index, value.strip().strip("`")

        tasks = [asyncio.create_task(translate_one(index, block)) for index, block in enumerate(blocks)]
        try:
            for future in asyncio.as_completed(tasks):
                index, value = await future
                out[index] = value
                completed += 1
                if progress:
                    await progress(30 + round(50 * completed / len(blocks)))
        except Exception:
            for task in tasks:
                if not task.done():
                    task.cancel()
            raise
    return "\n\n".join(item or "" for item in out).strip()


async def list_models(config: LlmConfig) -> list[str]:
    if not config.base_url:
        raise LlmError("Укажите Base URL", "no_key")
    if not config.api_key and not is_local(config.base_url):
        raise LlmError("Укажите API-ключ", "unauthorized")
    headers = {"Accept": "application/json"}
    if config.api_key:
        headers["Authorization"] = f"Bearer {config.api_key}"
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.get(models_endpoint(config.base_url), headers=headers)
    except httpx.HTTPError as exc:
        raise LlmError("Не удалось подключиться к серверу модели", "network") from exc
    if response.status_code >= 400:
        raise _response_error(response.status_code, response.text)
    data = response.json()
    items = data.get("data") or data.get("models") or []
    result = []
    for item in items:
        value = item.get("id") if isinstance(item, dict) else None
        if isinstance(value, str):
            result.append(value)
    return result


async def test_config(config: LlmConfig) -> dict:
    started = time.perf_counter()
    await chat_completion(config, "Ты проверяешь подключение к модели. Ответь одним словом OK.", "ping",
                          max_tokens=5, temperature=0, timeout=20)
    return {"ok": True, "latencyMs": round((time.perf_counter() - started) * 1000), "model": config.model}
