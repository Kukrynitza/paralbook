from __future__ import annotations

import asyncio
import logging
import re
from typing import Any

from . import llm, segment
from .align import align_pages
from .config import MAX_TRANSLATE_CHARS, MIN_UPLOAD_TEXT, WORDS_PER_MINUTE
from .db import Database
from .dictionary import Dictionary
from .lemmatize import annotate_pages
from .parsers import (
    Parsed,
    detect_language_info,
    language_sample,
    normalize_text,
    parse_file,
    title_from_text,
    validate_language,
    validate_text,
)

log = logging.getLogger("text-service.jobs")


def validate_output_language(text: str, field: str, allowed: tuple[str, ...]) -> None:
    value = (text or "").strip()
    if len(value) >= 80:
        validate_language(language_sample(value), field, allowed)


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


def require_translation(english: str, russian: str) -> None:
    if english.strip() and not russian.strip():
        raise ValueError(
            "Текст без перевода сохранить нельзя. Введите русский текст или укажите API-ключ в настройках"
        )


class JobManager:
    def __init__(self, db: Database, dictionary: Dictionary) -> None:
        self.db = db
        self.dictionary = dictionary
        self.tasks: dict[str, asyncio.Task] = {}
        self.cancelled: set[str] = set()

    async def _assert_idle(self, user_id: str, exclude: str | None = None) -> None:
        active = await self.db.fetch_one(
            "select id from text_jobs where user_id=%s "
            "and status in ('uploading', 'queued', 'running') "
            "and updated_at > now() - interval '30 minutes' "
            "and (%s::uuid is null or id <> %s::uuid) limit 1",
            (user_id, exclude, exclude),
        )
        if active:
            raise JobBusy("Дождитесь завершения текущей задачи")

    def _start(self, job_id: str, coro) -> None:
        task = asyncio.create_task(coro)
        self.tasks[job_id] = task

        def done(_: asyncio.Task) -> None:
            self.tasks.pop(job_id, None)
            self.cancelled.discard(job_id)

        task.add_done_callback(done)

    async def cancel(self, job_id: str) -> None:
        self.cancelled.add(job_id)
        task = self.tasks.get(job_id)
        log.info("cancel %s: task=%s", job_id, bool(task))
        if task and not task.done():
            task.cancel()
            try:
                await asyncio.wait_for(task, timeout=5)
            except (asyncio.CancelledError, asyncio.TimeoutError):
                pass
        await self._update(job_id, status="cancelled", stage="cancelled", progress=100, error="Задание отменено")

    async def create_import_job(self, *, user_id: str, text_id: str, filename: str = "",
                                data: bytes | None = None, text: str | None = None,
                                russian: str | None = None, translate: bool = True,
                                source: str = "upload", language: str = "auto",
                                job_id: str | None = None, chunk_unit: str = "tokens",
                                chunk_size: int = 1200) -> dict:
        await self._assert_idle(user_id, exclude=job_id)
        base: dict[str, Any] = {}
        if job_id:
            existing = await self.db.get_job(job_id)
            if existing and isinstance(existing.get("payload"), dict):
                base = dict(existing["payload"])
        payload = {
            **base,
            "filename": filename,
            "source": source,
            "translate": translate,
            "language": language,
            "parallel": bool((russian or "").strip()),
            "chunkUnit": chunk_unit,
            "chunkSize": chunk_size,
        }
        if text:
            payload["text"] = text[:MAX_TRANSLATE_CHARS]
        if russian:
            payload["russian"] = russian[:MAX_TRANSLATE_CHARS]
        if job_id:
            job = await self.db.claim_job(job_id, user_id, payload)
            if not job or str(job.get("text_id") or "") != text_id:
                raise JobBusy("Задача уже неактуальна. Начните загрузку заново")
        else:
            job = await self.db.create_job(user_id=user_id, text_id=text_id, job_type="import", payload=payload)
        current_id = str(job["id"])
        self._start(
            current_id,
            self._run_import(current_id, user_id, text_id, filename, data, text, russian,
                             translate, source, language, chunk_unit, chunk_size),
        )
        return job

    async def create_chat_job(self, *, user_id: str, text_id: str, topic: str, minutes: int, level: str) -> dict:
        await self._assert_idle(user_id)
        payload = {"topic": topic, "minutes": minutes, "level": level}
        job = await self.db.create_job(user_id=user_id, text_id=text_id, job_type="chat", payload=payload)
        current_id = str(job["id"])
        self._start(current_id, self._run_chat(current_id, user_id, text_id, topic, minutes, level))
        return job

    async def _update(self, job_id: str, progress: int | None = None, stage: str | None = None,
                      status: str | None = None, error: str | None = None, result: dict | None = None) -> None:
        if job_id in self.cancelled and status != "cancelled":
            log.info("skip update %s: %s", job_id, status)
            return
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

    async def _heartbeat(self, job_id: str) -> None:
        try:
            while True:
                await asyncio.sleep(30)
                await self.db.touch_job(job_id)
        except asyncio.CancelledError:
            return

    @staticmethod
    def friendly_error(exc: Exception) -> str:
        if isinstance(exc, UnicodeDecodeError):
            return "Не удалось определить кодировку файла"
        if isinstance(exc, (ValueError, JobBusy, llm.LlmError)):
            return str(exc) or "Не удалось обработать текст"
        return "Не удалось обработать текст. Попробуйте ещё раз"

    def _abort_if_cancelled(self, job_id: str) -> None:
        if job_id in self.cancelled:
            raise asyncio.CancelledError

    async def _run_import(self, job_id: str, user_id: str, text_id: str, filename: str,
                          data: bytes | None, text: str | None, russian: str | None,
                          translate: bool, source: str, language: str,
                          chunk_unit: str = "tokens", chunk_size: int = 1200) -> None:
        heartbeat = asyncio.create_task(self._heartbeat(job_id))
        try:
            await self._update(job_id, status="running", stage="parsing", progress=10)
            parsed: Parsed | None = None
            english = ""
            russian_text = ""
            if data is not None:
                parsed = parse_file(filename, data, self.dictionary)
                english = parsed.text
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
            if parsed and parsed.pages is not None:
                # .2books содержит готовую параллельную пару; язык исходника
                # не ограничиваем, чтобы можно было читать не-английские пары.
                pass
            elif english and russian_text:
                # Парный текст: пользователь уже предоставил перевод,
                # LLM не вызывается, язык не ограничиваем.
                pass
            elif english:
                validate_language(language_sample(english), "Текст", ("en", "ru"))
            elif russian_text:
                validate_language(language_sample(russian_text), "Текст", ("ru",))
            await self._update(job_id, stage="aligning", progress=25)
            text_row = await self.db.get_text(text_id) or {}
            if parsed and parsed.pages is not None:
                pages = parsed.pages
                await asyncio.to_thread(annotate_pages, pages)
                words = sum(1 for page in pages for item in page["en"] if item["text"].strip())
                minutes = max(1, round(words / WORDS_PER_MINUTE))
                current_title = (text_row.get("title") or "").strip()
                fallback_title = parsed.title or title_from_text(parsed.text or "")
                title = (
                    fallback_title
                    if fallback_title and current_title in ("", "Своя книга", "Свой текст", "Книга")
                    else current_title
                )
                await self.db.write_pages(
                    text_id,
                    pages,
                    minutes=minutes,
                    title=title or None,
                    excerpt=preview(parsed.text or parsed.title or "") or None,
                )
                await self._update(job_id, status="done", stage="done", progress=100, result={
                    "pages": len(pages), "words": words, "minutes": minutes, "format": parsed.format,
                    "warnings": parsed.warnings,
                })
                return
            detected = detect_language_info(language_sample(english or russian_text))["code"]

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
                english = await llm.translate_text(
                    config, russian_text, progress=progress, direction="ru-en",
                    unit=chunk_unit, size=chunk_size,
                )
                validate_output_language(english, "Перевод на английский", ("en",))
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
                    english = await llm.translate_text(
                        config, russian_text, progress=progress, direction="ru-en",
                        unit=chunk_unit, size=chunk_size,
                    )
                    validate_output_language(english, "Перевод на английский", ("en",))
                elif len(english) <= MAX_TRANSLATE_CHARS:
                    await self._update(job_id, stage="translating", progress=30)
                    config = await llm.load_config(self.db, user_id)
                    russian_text = await llm.translate_text(
                        config, english, progress=progress, direction="en-ru",
                        unit=chunk_unit, size=chunk_size,
                    )
                    validate_output_language(russian_text, "Перевод на русский", ("ru",))
                else:
                    raise ValueError(
                        f"Текст длиннее {MAX_TRANSLATE_CHARS:,} символов — автоматический перевод недоступен. ".replace(",", " ")
                        + "Разбейте книгу на части или загрузите .2books с готовым переводом"
                    )
            self._abort_if_cancelled(job_id)
            if not english.strip():
                raise ValueError("Не удалось получить английский текст")
            require_translation(english, russian_text)
            english = validate_text(english)
            await self._update(job_id, stage="aligning", progress=85)
            pages = await asyncio.to_thread(align_pages, english, russian_text, self.dictionary)
            self._abort_if_cancelled(job_id)
            words = segment.word_count(english)
            minutes = max(1, round(words / WORDS_PER_MINUTE))
            current_title = (text_row.get("title") or "").strip()
            fallback_title = (parsed.title if parsed and parsed.title else "") or title_from_text(english)
            title = (
                fallback_title
                if fallback_title and current_title in ("", "Своя книга", "Свой текст", "Книга")
                else None
            )
            excerpt = preview(english) or None
            await self._update(job_id, stage="saving", progress=92)
            await self.db.write_pages(text_id, pages, minutes=minutes, title=title, excerpt=excerpt)
            self._abort_if_cancelled(job_id)
            await self._update(job_id, status="done", stage="done", progress=100, result={
                "pages": len(pages), "words": words, "minutes": minutes,
                "format": parsed.format if parsed else ("text" if source == "text" else "txt"),
                "warnings": parsed.warnings if parsed else [],
            })
        except asyncio.CancelledError:
            await self._update(job_id, status="cancelled", stage="cancelled", progress=100, error="Задание отменено")
            raise
        except Exception as exc:
            log.exception("import job failed")
            await self._update(job_id, status="error", stage="error", progress=100, error=self.friendly_error(exc))
        finally:
            heartbeat.cancel()
            await asyncio.gather(heartbeat, return_exceptions=True)

    async def _run_chat(self, job_id: str, user_id: str, text_id: str, topic: str, minutes: int, level: str) -> None:
        heartbeat = asyncio.create_task(self._heartbeat(job_id))
        try:
            await self._update(job_id, status="running", stage="generating", progress=5)
            async def progress(value: int) -> None:
                await self._update(job_id, progress=max(5, min(80, value)))
            generated = await llm.generate_chat_text(self.db, user_id, topic, minutes, level, progress=progress)
            validate_language(generated["english"], "Сгенерированный текст", ("en",))
            validate_output_language(generated["russian"], "Сгенерированный перевод", ("ru",))
            self._abort_if_cancelled(job_id)
            await self._update(job_id, stage="aligning", progress=85)
            pages = align_pages(generated["english"], generated["russian"], self.dictionary)
            self._abort_if_cancelled(job_id)
            await self._update(job_id, stage="saving", progress=92)
            await self.db.write_pages(
                text_id,
                pages,
                minutes=generated["minutes"],
                title=generated["title"],
                excerpt=preview(generated["english"]),
            )
            self._abort_if_cancelled(job_id)
            await self._update(job_id, status="done", stage="done", progress=100, result={
                "pages": len(pages), "words": segment.word_count(generated["english"]),
                "minutes": generated["minutes"], "title": generated["title"],
            })
        except asyncio.CancelledError:
            await self._update(job_id, status="cancelled", stage="cancelled", progress=100, error="Задание отменено")
            raise
        except Exception as exc:
            log.exception("chat job failed")
            await self._update(job_id, status="error", stage="error", progress=100, error=self.friendly_error(exc))
        finally:
            heartbeat.cancel()
            await asyncio.gather(heartbeat, return_exceptions=True)
