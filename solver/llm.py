import json
import os

import httpx

from solver.db import load_env
from solver.errors import SolverError


def configured() -> bool:
    load_env()
    return bool(os.environ.get("LLM_API_KEY"))


def _base() -> str:
    return (os.environ.get("LLM_BASE_URL") or "https://api.openai.com/v1").rstrip("/")


def _headers() -> dict:
    headers = {"Authorization": f"Bearer {os.environ.get('LLM_API_KEY', '')}", "Content-Type": "application/json"}
    if "openrouter.ai" in _base():
        headers["HTTP-Referer"] = "http://127.0.0.1:5173"
        headers["X-Title"] = "Paralbook"
    return headers


def _content(message: dict) -> str:
    content = message.get("content")
    if isinstance(content, list):
        parts = []
        for part in content:
            if isinstance(part, dict):
                parts.append(str(part.get("text") or ""))
            else:
                parts.append(str(part))
        return "".join(parts)
    return str(content or "")


def chat_text(system: str, user: str) -> str | None:
    if not configured():
        return None
    response = httpx.post(
        f"{_base()}/chat/completions",
        headers=_headers(),
        json={
            "model": os.environ.get("LLM_CHAT_MODEL") or "gpt-4o-mini",
            "temperature": 0.3,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        },
        timeout=90,
    )
    if response.status_code >= 400:
        raise SolverError("Модель не ответила")
    data = response.json()
    choices = data.get("choices") or [{}]
    return _content(choices[0].get("message") or {})


def embed_text(text: str) -> list[float] | None:
    if not configured() or os.environ.get("LLM_EMBED_MODEL") == "off":
        return None
    try:
        response = httpx.post(
            f"{_base()}/embeddings",
            headers=_headers(),
            json={"model": os.environ.get("LLM_EMBED_MODEL") or "text-embedding-3-small", "input": text},
            timeout=40,
        )
    except httpx.HTTPError:
        return None
    if response.status_code >= 400:
        return None
    vector = ((response.json().get("data") or [{}])[0]).get("embedding")
    return vector if isinstance(vector, list) else None


def parse_json(raw: str):
    trimmed = raw.strip()
    if trimmed.lower().startswith("```json"):
        trimmed = trimmed[7:]
    elif trimmed.startswith("```"):
        trimmed = trimmed[3:]
    if trimmed.endswith("```"):
        trimmed = trimmed[:-3]
    return json.loads(trimmed.strip())
