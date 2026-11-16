from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from urllib.parse import urlsplit

from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import llm
from .auth import can_access_job, internal_ok, verify_user_token
from .config import (
    LLM_API_KEY,
    LLM_BASE_URL,
    LLM_CHAT_MODEL,
    MAX_TWO_BOOKS_BYTES,
    MAX_TWO_BOOKS_PAGES,
    MAX_TWO_BOOKS_TOKENS,
    MAX_TRANSLATE_CHARS,
    MAX_UPLOAD_BYTES,
    MAX_UPLOAD_TEXT,
    WEB_ORIGIN,
)
from .db import Database
from .dictionary import Dictionary
from .jobs import JobBusy, JobManager
from .models import ChatJobBody, LlmModelsBody, LlmSaveBody, LlmSettingsView, LlmTestBody, TextImportBody

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("text-service")

db = Database()
dictionary = Dictionary()
jobs: JobManager | None = None


@asynccontextmanager
async def lifespan(_: FastAPI):
    global jobs
    await db.open()
    await db.execute(
        "update text_jobs set status='error', stage='error', progress=100, error='Сервис был перезапущен во время обработки' "
        "where status in ('queued', 'running')"
    )
    await dictionary.load(db)
    jobs = JobManager(db, dictionary)
    log.info("dictionary loaded: %s", dictionary.stats)
    yield
    await db.close()


app = FastAPI(title="Paralbook text service", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[item.strip() for item in WEB_ORIGIN.split(",") if item.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(JobBusy)
async def job_busy_handler(_, exc: JobBusy) -> JSONResponse:
    return JSONResponse(status_code=409, content={"detail": str(exc)})


def user_from_auth(authorization: str | None) -> str:
    payload = verify_user_token(authorization)
    return str(payload["sub"])


def internal_or_user(authorization: str | None, x_service_token: str | None) -> tuple[str | None, bool]:
    if internal_ok(x_service_token):
        return None, True
    return user_from_auth(authorization), False


async def ensure_text_owner(text_id: str, user_id: str) -> dict:
    text = await db.get_text(text_id)
    if not text:
        raise HTTPException(status_code=404, detail="Текст не найден")
    if str(text.get("owner_id") or "") != str(user_id):
        raise HTTPException(status_code=403, detail="Нет доступа к тексту")
    return text


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "version": "1.0.0", "dictionary": dictionary.stats}


@app.get("/v1/config")
async def config() -> dict:
    return {
        "maxUploadBytes": MAX_UPLOAD_BYTES,
        "maxUploadText": MAX_UPLOAD_TEXT,
        "maxTwoBooksBytes": MAX_TWO_BOOKS_BYTES,
        "maxTwoBooksPages": MAX_TWO_BOOKS_PAGES,
        "maxTwoBooksTokens": MAX_TWO_BOOKS_TOKENS,
        "maxTranslateChars": MAX_TRANSLATE_CHARS,
    }


# ---------- LLM settings ----------

def validate_url(value: str) -> str:
    base = llm.normalize_base_url(value)
    if not base:
        raise HTTPException(status_code=400, detail="Укажите Base URL")
    if len(base) > 500:
        raise HTTPException(status_code=400, detail="Base URL слишком длинный")
    try:
        parsed = urlsplit(base)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Некорректный Base URL") from exc
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(status_code=400, detail="Адрес должен начинаться с https:// или http://")
    if parsed.username or parsed.password:
        raise HTTPException(status_code=400, detail="В адресе не должно быть логина и пароля")
    if parsed.scheme == "http" and not llm.is_local(base):
        raise HTTPException(status_code=400, detail="Для внешнего сервера используйте https://")
    return base


def validate_model(value: str) -> str:
    model = (value or "").strip()
    if not model:
        raise HTTPException(status_code=400, detail="Укажите название модели")
    if len(model) > 200:
        raise HTTPException(status_code=400, detail="Название модели слишком длинное")
    return model


def missing_table(exc: Exception) -> bool:
    return getattr(exc, "code", None) == "42P01" or getattr(exc, "sqlstate", None) == "42P01"


async def settings_view(user_id: str) -> LlmSettingsView:
    try:
        row = await db.get_llm_settings(user_id)
        table_ready = True
    except Exception as exc:
        if missing_table(exc):
            row = None
            table_ready = False
        else:
            raise
    api_key = None
    if row and row.get("api_key_ciphertext"):
        try:
            api_key, legacy = llm.decrypt_api_key(row["api_key_ciphertext"])
            if legacy:
                await db.set_llm_ciphertext(user_id, llm.encrypt_api_key(api_key))
        except llm.LlmError:
            api_key = None
    user_ready = bool(row and (api_key or llm.is_local(row.get("base_url") or "")))
    env = llm.env_config()
    return LlmSettingsView(
        baseUrl=row.get("base_url") if row else None,
        model=row.get("model") if row else None,
        hasKey=bool(row and row.get("api_key_ciphertext")),
        keyHint=llm.key_hint(api_key),
        source="user" if user_ready else ("env" if env else "none"),
        envModel=LLM_CHAT_MODEL or None,
        tableReady=table_ready,
    )


@app.get("/v1/llm/settings", response_model=LlmSettingsView)
async def get_llm_settings(authorization: str | None = Header(default=None)) -> LlmSettingsView:
    return await settings_view(user_from_auth(authorization))


@app.post("/v1/llm/settings", response_model=LlmSettingsView)
async def save_llm_settings(body: LlmSaveBody, authorization: str | None = Header(default=None)) -> LlmSettingsView:
    user_id = user_from_auth(authorization)
    base_url = validate_url(body.baseUrl)
    model = validate_model(body.model)
    api_key = (body.apiKey or "").strip()
    try:
        existing = await db.get_llm_settings(user_id)
    except Exception as exc:
        if missing_table(exc):
            raise HTTPException(status_code=400, detail="Таблица llm_settings ещё не создана в Supabase") from exc
        raise
    if api_key and len(api_key) > 500:
        raise HTTPException(status_code=400, detail="API-ключ слишком длинный")
    if api_key and ("\n" in api_key or "\r" in api_key):
        raise HTTPException(status_code=400, detail="API-ключ должен быть одной строкой")
    if not api_key and not (existing and existing.get("api_key_ciphertext")) and not llm.is_local(base_url):
        raise HTTPException(status_code=400, detail="Укажите API-ключ")
    ciphertext = existing.get("api_key_ciphertext") if existing else None
    if api_key:
        try:
            ciphertext = llm.encrypt_api_key(api_key)
        except llm.LlmError as exc:
            raise HTTPException(status_code=500, detail=exc.message) from exc
    await db.save_llm_settings(user_id, base_url, model, ciphertext)
    return await settings_view(user_id)


@app.delete("/v1/llm/settings")
async def clear_llm_settings(authorization: str | None = Header(default=None)) -> dict:
    await db.delete_llm_settings(user_from_auth(authorization))
    return {"ok": True}


async def config_for_test(user_id: str, body: LlmTestBody | None = None) -> llm.LlmConfig:
    try:
        row = await db.get_llm_settings(user_id)
    except Exception as exc:
        if not missing_table(exc):
            raise
        row = None
    base_url = validate_url((body.baseUrl if body else "") or (row or {}).get("base_url") or LLM_BASE_URL)
    model = validate_model((body.model if body else "") or (row or {}).get("model") or LLM_CHAT_MODEL)
    api_key = ((body.apiKey or "").strip() if body else "")
    if not api_key and row and row.get("api_key_ciphertext"):
        try:
            api_key, _ = llm.decrypt_api_key(row["api_key_ciphertext"])
        except llm.LlmError:
            api_key = ""
    if not api_key:
        api_key = (LLM_API_KEY or "").strip()
    if not api_key and not llm.is_local(base_url):
        raise HTTPException(status_code=400, detail="Укажите API-ключ")
    return llm.LlmConfig(base_url, model, api_key or None, "user")


@app.post("/v1/llm/test")
async def test_llm(body: LlmTestBody, authorization: str | None = Header(default=None)) -> dict:
    user_id = user_from_auth(authorization)
    config = await config_for_test(user_id, body)
    try:
        return await llm.test_config(config)
    except llm.LlmError as exc:
        return {"ok": False, "text": exc.message, "code": exc.code}


@app.post("/v1/llm/models")
async def llm_models(body: LlmModelsBody, authorization: str | None = Header(default=None)) -> dict:
    user_id = user_from_auth(authorization)
    config = await config_for_test(user_id, LlmTestBody(baseUrl=body.baseUrl, model="unknown", apiKey=body.apiKey))
    try:
        models = await llm.list_models(config)
        return {"ok": True, "models": models, "text": f"Найдено моделей: {len(models)}" if models else "Провайдер не вернул список моделей"}
    except llm.LlmError as exc:
        return {"ok": False, "models": [], "text": exc.message}


# ---------- jobs ----------

@app.post("/v1/jobs/import/file")
async def import_file(
    file: UploadFile = File(...),
    translate: bool = Form(True),
    source: str = Form("upload"),
    language: str = Form("auto"),
    authorization: str | None = Header(default=None),
) -> dict:
    payload = verify_user_token(authorization)
    user_id = str(payload["sub"])
    text_id = str(payload.get("textId") or "")
    if not text_id:
        raise HTTPException(status_code=400, detail="В токене нет textId")
    if language not in ("auto", "en", "ru"):
        raise HTTPException(status_code=400, detail="Неизвестный язык книги")
    await ensure_text_owner(text_id, user_id)
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Файл пустой")
    if len(data) > MAX_UPLOAD_BYTES and not (file.filename or "").lower().endswith(".2books"):
        raise HTTPException(status_code=413, detail=f"Файл больше {MAX_UPLOAD_BYTES // 1024 // 1024} МБ")
    assert jobs is not None
    job = await jobs.create_import_job(user_id=user_id, text_id=text_id, filename=file.filename or "file",
                                       data=data, translate=translate, source=source, language=language)
    return job_view(job)


@app.post("/v1/jobs/import/text")
async def import_text(body: TextImportBody, authorization: str | None = Header(default=None)) -> dict:
    payload = verify_user_token(authorization)
    user_id = str(payload["sub"])
    text_id = str(payload.get("textId") or "")
    if not text_id:
        raise HTTPException(status_code=400, detail="В токене нет textId")
    english = body.text.strip()
    russian = (body.russian or "").strip()
    if not english and not russian:
        raise HTTPException(status_code=400, detail="Введите английский или русский текст")
    if len(english) > MAX_TRANSLATE_CHARS or len(russian) > MAX_TRANSLATE_CHARS:
        raise HTTPException(
            status_code=400,
            detail=f"Лимит — {MAX_TRANSLATE_CHARS:,} символов на текст. Сократите отрывок или загрузите книгу файлом".replace(",", " "),
        )
    await ensure_text_owner(text_id, user_id)
    assert jobs is not None
    job = await jobs.create_import_job(user_id=user_id, text_id=text_id, text=english,
                                       russian=russian or None, translate=body.translate,
                                       source=body.source, language="auto")
    return job_view(job)


@app.post("/v1/jobs/chat")
async def chat_job(body: ChatJobBody, authorization: str | None = Header(default=None),
                   x_service_token: str | None = Header(default=None)) -> dict:
    user_id, internal = internal_or_user(authorization, x_service_token)
    if internal:
        if not body.userId:
            raise HTTPException(status_code=400, detail="Нужен userId")
        user_id = body.userId
    else:
        assert user_id is not None
        if body.userId and body.userId != user_id:
            raise HTTPException(status_code=403, detail="Нет доступа")
    await ensure_text_owner(body.textId, user_id)
    if body.level not in ("A1", "A2", "B1", "B2", "C1", "C2"):
        body.level = "B1"
    assert jobs is not None
    job = await jobs.create_chat_job(user_id=user_id, text_id=body.textId, topic=body.topic.strip(),
                                     minutes=body.minutes, level=body.level)
    return job_view(job)


def job_view(job: dict) -> dict:
    return {
        "id": str(job["id"]), "userId": str(job["user_id"]), "type": job["type"], "status": job["status"],
        "stage": job.get("stage"), "progress": job.get("progress") or 0,
        "textId": str(job["text_id"]) if job.get("text_id") else None,
        "error": job.get("error"), "payload": job.get("payload"), "result": job.get("result"),
    }


@app.get("/v1/jobs/{job_id}")
async def get_job(job_id: str, authorization: str | None = Header(default=None),
                  x_service_token: str | None = Header(default=None)) -> dict:
    user_id, internal = internal_or_user(authorization, x_service_token)
    job = await db.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Задание не найдено")
    if not internal and not can_access_job(job, user_id or ""):
        raise HTTPException(status_code=403, detail="Нет доступа к заданию")
    return job_view(job)


@app.post("/v1/jobs/{job_id}/cancel")
async def cancel_job(job_id: str, authorization: str | None = Header(default=None),
                     x_service_token: str | None = Header(default=None)) -> dict:
    user_id, internal = internal_or_user(authorization, x_service_token)
    job = await db.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Задание не найдено")
    if not internal and not can_access_job(job, user_id or ""):
        raise HTTPException(status_code=403, detail="Нет доступа")
    if job["status"] in ("queued", "running"):
        await db.update_job(job_id, status="cancelled", stage="cancelled", progress=100)
    return {"ok": True}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=False)
