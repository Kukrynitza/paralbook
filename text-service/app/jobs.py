from __future__ import annotations

import asyncio
import logging
import re
from typing import Any

from . import llm, segment
from .align import align_pages
from .config import MAX_TRANSLATE_CHARS, MIN_UPLOAD_TEXT
from .db import Database
from .dictionary import Dictionary
from .parsers import Parsed, detect_language, normalize_text, parse_file, validate_text

log = logging.getLogger("text-service.jobs")


class JobBusy(Exception):
    pass


def preview(text: str, limit: int = 180) -> str:
    clean = re.sub(r"\s+", " ", text or "").strip()
    if not clean:
        return ""
    sentence = re.match(r"^[\s\S]*?[.!?…][\"»']?", clean)
    if sentence and len(sentence.group(0).strip()) <= limit and len(sentence.group(0).strip()) < len(clean):
        return sentence.group(0).strip()
    if len(clean) <= limit and re.search(r"[.!?…][\"»']?$", clean):
        return clean
    cut = clean[:limit + 1]
    at = cut.rfind(" ")
    return (cut[:at] if at > 0 else cut[:limit]).strip() + "…"


class JobManager:
    def __init__(self, db: Database, dictionary: Dictionary) -> None:
        self.db = db
        self.dictionary = dictionary
        self.tasks: set[asyncio.Task] = set()

    async def _assert_idle(self, user_id: str) -> None:
        active = await self.db.fetch_one(
            "select id from text_jobs where user_id=%s and status in ('queued', 'running') "
            "and updated_at > now() - interval '10 minutes' limit 1",
            (user_id,),
        )
        if active:
            raise JobBusy("Дождитесь завершения текущей задачи")

    async def create_import_job(self, *, user_id: str, text_id: str, filename: str = "",
                                data: bytes | None = None, text: str | None = None,
                                russian: str | None = None, translate: bool = True,
                                source: str = "upload", language: str = "auto") -> dict:
        await self._assert_idle(user_id)
        payload = {"filename": filename, "source": source, "translate": translate,
                   "language": language, "parallel": bool((russian or "").strip())}
        job = await self.db.create_job(user_id=user_id, text_id=text_id, job_type="import", payload=payload)
        task = asyncio.create_task(
            self._run_import(job["id"], user_id, text_id, filename, data, text, russian, translate, source, language)
        )
        self.tasks.add(task)
        task.add_done_callback(self.tasks.discard)
        return job

    async def create_chat_job(self, *, user_id: str, text_id: str, topic: str, minutes: int, level: str) -> dict:
        await self._assert_idle(user_id)
        payload = {"topic": topic, "minutes": minutes, "level": level}
        job = await self.db.create_job(user_id=user_id, text_id=text_id, job_type="chat", payload=payload)
        task = asyncio.create_task(self._run_chat(job["id"], user_id, text_id, topic, minutes, level))
        self.tasks.add(task)
        task.add_done_callback(self.tasks.discard)
        return job

    async def _update(self, job_id: str, progress: int | None = None, stage: str | None = None,
                      status: str | None = None, error: str | None = None, result: dict | None = None) -> None:
        fields: dict[str, Any] = {}
        if progress is not None:
            fields["progress"] = progress
        if stage is not None:
            fields["stage"] = stage
        if status is not None:
            fields["status"] = status
        if error is not None:
            fields["error"] = error
        if result is not None:
            fields["result"] = result
        if fields:
            await self.db.update_job(job_id, **fields)

    async def _run_import(self, job_id: str, user_id: str, text_id: str, filename: str,
                          data: bytes | None, text: str | None, russian: str | None,
                          translate: bool, source: str, language: str) -> None:
        try:
            await self._update(job_id, status="running", stage="parsing", progress=10)
            parsed: Parsed | None = None
            english = ""
            russian_text = ""
            if data is not None:
                parsed = parse_file(filename, data, self.dictionary)
                english = parsed.text
                russian_text = parsed.russian or ""
            else:
                raw_english = (text or "").strip()
                raw_russian = (russian or "").strip()
                if raw_english:
                    english = validate_text(raw_english)
                if raw_russian:
                    russian_text = normalize_text(raw_russian)
                    if russian_text and len(russian_text) < MIN_UPLOAD_TEXT:
                        raise ValueError("В русском тексте слишком мало текста")
                if not english and not russian_text:
                    raise ValueError("Введите английский или русский текст")
            await self._update(job_id, stage="aligning", progress=25)
            text_row = await self.db.get_text(text_id) or {}
            if parsed and parsed.pages is not None:
                pages = parsed.pages
                words = sum(1 for page in pages for item in page["en"] if item["text"].strip())
                minutes = max(1, round(words / 120))
                current_title = (text_row.get("title") or "").strip()
                title = parsed.title if parsed.title and current_title in ("", "Своя книга", "Свой текст") else current_title
                await self.db.write_pages(
                    text_id,
                    pages,
                    minutes=minutes,
                    title=title or None,
                    excerpt=preview(parsed.text or parsed.title or "") or None,
                )
                await self._update(job_id, status="done", stage="done", progress=100, result={
                    "pages": len(pages), "words": words, "minutes": minutes, "format": parsed.format,
                    "translationSkipped": False, "warnings": parsed.warnings,
                })
                return
            skipped = False
            detected = language if language in ("en", "ru") else detect_language(english or russian_text)

            async def progress(value_: int) -> None:
                await self._update(job_id, progress=max(30, min(80, value_)))

            if english and russian_text:
                pass
            elif russian_text:
                if len(russian_text) > MAX_TRANSLATE_CHARS:
                    raise ValueError(
                        f"Лимит — {MAX_TRANSLATE_CHARS:,} символов. Сократите текст или загрузите готовый английский перевод".replace(",", " ")
                    )
                if not translate:
                    raise ValueError("Для русского текста нужен перевод на английский")
                await self._update(job_id, stage="translating", progress=30)
                config = await llm.load_config(self.db, user_id)
                english = await llm.translate_text(config, russian_text, progress=progress, direction="ru-en")
            elif english and translate:
                if detected == "ru":
                    if len(english) > MAX_TRANSLATE_CHARS:
                        raise ValueError(
                            f"Русский текст длиннее {MAX_TRANSLATE_CHARS:,} символов. ".replace(",", " ")
                            + "Загрузите готовый английский перевод или разбейте книгу на части"
                        )
                    await self._update(job_id, stage="translating", progress=30)
                    config = await llm.load_config(self.db, user_id)
                    russian_text = english
                    english = await llm.translate_text(config, russian_text, progress=progress, direction="ru-en")
                elif len(english) <= MAX_TRANSLATE_CHARS:
                    await self._update(job_id, stage="translating", progress=30)
                    config = await llm.load_config(self.db, user_id)
                    russian_text = await llm.translate_text(config, english, progress=progress, direction="en-ru")
                else:
                    skipped = True
            if not english.strip():
                raise ValueError("Не удалось получить английский текст")
            english = validate_text(english)
            await self._update(job_id, stage="aligning", progress=85)
            pages = align_pages(english, russian_text, self.dictionary)
            words = segment.word_count(english)
            minutes = max(1, round(words / 120))
            current_title = (text_row.get("title") or "").strip()
            title = parsed.title if parsed and parsed.title and current_title in ("", "Своя книга", "Свой текст") else None
            excerpt = preview(english) or None
            await self._update(job_id, stage="saving", progress=92)
            await self.db.write_pages(text_id, pages, minutes=minutes, title=title, excerpt=excerpt)
            await self._update(job_id, status="done", stage="done", progress=100, result={
                "pages": len(pages), "words": words, "minutes": minutes,
                "format": parsed.format if parsed else ("text" if source == "text" else "txt"),
                "translationSkipped": skipped, "warnings": parsed.warnings if parsed else [],
            })
        except Exception as exc:
            log.exception("import job failed")
            await self._update(job_id, status="error", stage="error", progress=100, error=str(exc) or "Ошибка обработки")

    async def _run_chat(self, job_id: str, user_id: str, text_id: str, topic: str, minutes: int, level: str) -> None:
        try:
            await self._update(job_id, status="running", stage="generating", progress=5)
            async def progress(value: int) -> None:
                await self._update(job_id, progress=max(5, min(80, value)))
            generated = await llm.generate_chat_text(self.db, user_id, topic, minutes, level, progress=progress)
            await self._update(job_id, stage="aligning", progress=85)
            pages = align_pages(generated["english"], generated["russian"], self.dictionary)
            await self._update(job_id, stage="saving", progress=92)
            await self.db.write_pages(
                text_id,
                pages,
                minutes=generated["minutes"],
                title=generated["title"],
                excerpt=preview(generated["english"]),
            )
            await self._update(job_id, status="done", stage="done", progress=100, result={
                "pages": len(pages), "words": segment.word_count(generated["english"]),
                "minutes": generated["minutes"], "title": generated["title"],
            })
        except Exception as exc:
            log.exception("chat job failed")
            await self._update(job_id, status="error", stage="error", progress=100, error=str(exc) or "Модель не ответила")
