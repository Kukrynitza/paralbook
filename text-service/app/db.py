from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from psycopg_pool import AsyncConnectionPool

from .config import DATABASE_URL, DATABASE_SCHEMA


def _connection_url() -> str:
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_CONNECTION_STRING не задан")
    parts = urlsplit(DATABASE_URL)
    query = dict(parse_qsl(parts.query))
    if "supabase" in parts.netloc and "sslmode" not in query:
        query["sslmode"] = "require"
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


SCHEMA_SQL = f"""
create table if not exists {DATABASE_SCHEMA}.text_jobs (
  id uuid primary key,
  user_id uuid not null references {DATABASE_SCHEMA}.profiles(id) on delete cascade,
  text_id uuid references {DATABASE_SCHEMA}.texts(id) on delete cascade,
  type text not null,
  status text not null,
  stage text,
  progress integer not null default 0,
  error text,
  payload jsonb,
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table {DATABASE_SCHEMA}.text_jobs add column if not exists payload jsonb;
alter table {DATABASE_SCHEMA}.text_jobs add column if not exists result jsonb;
"""


class Database:
    def __init__(self) -> None:
        self.pool = AsyncConnectionPool(
            _connection_url(),
            min_size=1,
            max_size=6,
            open=False,
            kwargs={"prepare_threshold": None, "autocommit": False},
        )

    async def open(self) -> None:
        await self.pool.open()
        async with self.pool.connection() as conn:
            for statement in SCHEMA_SQL.split(";"):
                if statement.strip():
                    await conn.execute(statement)
            await conn.commit()

    async def close(self) -> None:
        await self.pool.close()

    async def fetch_all(self, sql: str, params: tuple | list = ()) -> list[dict[str, Any]]:
        async with self.pool.connection() as conn:
            async with conn.cursor(row_factory=dict_row) as cur:
                await cur.execute(sql, params)
                return list(await cur.fetchall())

    async def fetch_one(self, sql: str, params: tuple | list = ()) -> dict[str, Any] | None:
        async with self.pool.connection() as conn:
            async with conn.cursor(row_factory=dict_row) as cur:
                await cur.execute(sql, params)
                return await cur.fetchone()

    async def execute(self, sql: str, params: tuple | list = ()) -> None:
        async with self.pool.connection() as conn:
            await conn.execute(sql, params)
            await conn.commit()

    async def get_text(self, text_id: str) -> dict[str, Any] | None:
        return await self.fetch_one(
            f"select id, owner_id, title, excerpt, minutes, level, topic from {DATABASE_SCHEMA}.texts where id=%s",
            (text_id,),
        )

    async def get_interests(self, user_id: str) -> list[str]:
        row = await self.fetch_one(f"select interests from {DATABASE_SCHEMA}.profiles where id=%s", (user_id,))
        return list((row or {}).get("interests") or [])

    async def write_pages(self, text_id: str, pages: list[dict], *, minutes: int, title: str | None = None,
                          excerpt: str | None = None) -> None:
        async with self.pool.connection() as conn:
            async with conn.transaction():
                old = await conn.execute(
                    f"select id from {DATABASE_SCHEMA}.pages where text_id=%s", (text_id,)
                )
                page_ids = [row[0] for row in await old.fetchall()]
                if page_ids:
                    await conn.execute(
                        f"delete from {DATABASE_SCHEMA}.en_tokens where page_id = any(%s)", (page_ids,)
                    )
                    await conn.execute(
                        f"delete from {DATABASE_SCHEMA}.ru_tokens where page_id = any(%s)", (page_ids,)
                    )
                    await conn.execute(f"delete from {DATABASE_SCHEMA}.pages where text_id=%s", (text_id,))
                for page in pages:
                    cur = await conn.execute(
                        f"insert into {DATABASE_SCHEMA}.pages (text_id, position) values (%s, %s) returning id",
                        (text_id, page["position"]),
                    )
                    page_id = (await cur.fetchone())[0]
                    en = page.get("en") or []
                    ru = page.get("ru") or []
                    if en:
                        async with conn.cursor() as cur:
                            await cur.executemany(
                                f"insert into {DATABASE_SCHEMA}.en_tokens (page_id, position, text, lemma, align) "
                                "values (%s, %s, %s, %s, %s)",
                                [(page_id, i, t["text"], t.get("lemma"), t.get("align")) for i, t in enumerate(en)],
                            )
                    if ru:
                        async with conn.cursor() as cur:
                            await cur.executemany(
                                f"insert into {DATABASE_SCHEMA}.ru_tokens (page_id, position, text) values (%s, %s, %s)",
                                [(page_id, i, t["text"]) for i, t in enumerate(ru)],
                            )
                fields = ["minutes=%s", "ready=true"]
                values: list[Any] = [minutes]
                if title is not None:
                    fields.append("title=%s")
                    values.append(title[:80])
                if excerpt is not None:
                    fields.append("excerpt=%s")
                    values.append(excerpt[:500])
                values.append(text_id)
                await conn.execute(
                    f"update {DATABASE_SCHEMA}.texts set {', '.join(fields)} where id=%s", tuple(values)
                )

    async def delete_text(self, text_id: str, user_id: str) -> None:
        async with self.pool.connection() as conn:
            async with conn.transaction():
                owned = await conn.execute(
                    f"select id from {DATABASE_SCHEMA}.texts where id=%s and owner_id=%s",
                    (text_id, user_id),
                )
                if not await owned.fetchone():
                    return
                await conn.execute(
                    f"delete from {DATABASE_SCHEMA}.en_tokens where page_id in "
                    f"(select id from {DATABASE_SCHEMA}.pages where text_id=%s)", (text_id,)
                )
                await conn.execute(
                    f"delete from {DATABASE_SCHEMA}.ru_tokens where page_id in "
                    f"(select id from {DATABASE_SCHEMA}.pages where text_id=%s)", (text_id,)
                )
                await conn.execute(f"delete from {DATABASE_SCHEMA}.pages where text_id=%s", (text_id,))
                await conn.execute(f"delete from {DATABASE_SCHEMA}.votes where text_id=%s", (text_id,))
                await conn.execute(f"delete from {DATABASE_SCHEMA}.collection_items where text_id=%s", (text_id,))
                await conn.execute(f"delete from {DATABASE_SCHEMA}.chat_messages where text_id=%s", (text_id,))
                await conn.execute(f"delete from {DATABASE_SCHEMA}.texts where id=%s", (text_id,))

    async def get_llm_settings(self, user_id: str) -> dict[str, Any] | None:
        return await self.fetch_one(
            f"select user_id, base_url, model, api_key_ciphertext from {DATABASE_SCHEMA}.llm_settings where user_id=%s",
            (user_id,),
        )

    async def save_llm_settings(self, user_id: str, base_url: str, model: str, ciphertext: str | None) -> None:
        await self.execute(
            f"""insert into {DATABASE_SCHEMA}.llm_settings (user_id, base_url, model, api_key_ciphertext, updated_at)
                values (%s, %s, %s, %s, now())
                on conflict (user_id) do update set base_url=excluded.base_url, model=excluded.model,
                  api_key_ciphertext=excluded.api_key_ciphertext, updated_at=now()""",
            (user_id, base_url, model, ciphertext),
        )

    async def set_llm_ciphertext(self, user_id: str, ciphertext: str) -> None:
        await self.execute(
            f"update {DATABASE_SCHEMA}.llm_settings set api_key_ciphertext=%s, updated_at=now() where user_id=%s",
            (ciphertext, user_id),
        )

    async def delete_llm_settings(self, user_id: str) -> None:
        await self.execute(f"delete from {DATABASE_SCHEMA}.llm_settings where user_id=%s", (user_id,))

    async def create_job(self, *, user_id: str, text_id: str | None, job_type: str, payload: dict) -> dict[str, Any]:
        job_id = str(uuid.uuid4())
        await self.execute(
            f"""insert into {DATABASE_SCHEMA}.text_jobs
                (id, user_id, text_id, type, status, stage, progress, payload)
                values (%s, %s, %s, %s, 'queued', 'queued', 0, %s)""",
            (job_id, user_id, text_id, job_type, Jsonb(payload)),
        )
        return await self.get_job(job_id)

    async def get_job(self, job_id: str) -> dict[str, Any] | None:
        query = (
            f"select id, user_id, text_id, type, status, stage, progress, error, payload, result, updated_at "
            f"from {DATABASE_SCHEMA}.text_jobs where id=%s"
        )
        job = await self.fetch_one(query, (job_id,))
        if job and job.get("status") in ("uploading", "queued", "running") and job.get("updated_at"):
            updated = job["updated_at"]
            limit = 30 if job.get("status") == "uploading" else 15
            if isinstance(updated, datetime) and datetime.now(timezone.utc) - updated > timedelta(minutes=limit):
                await self.update_job(
                    job_id, status="error", stage="error", progress=100,
                    error="Задание зависло: нет обновлений слишком долго",
                )
                job = await self.fetch_one(query, (job_id,))
        return job

    async def touch_job(self, job_id: str) -> None:
        await self.execute(
            f"update {DATABASE_SCHEMA}.text_jobs set updated_at=now() where id=%s", (job_id,)
        )

    async def claim_job(self, job_id: str, user_id: str, payload: dict) -> dict[str, Any] | None:
        await self.execute(
            f"""update {DATABASE_SCHEMA}.text_jobs
                set status='queued', stage='queued', progress=0, error=null, payload=%s, updated_at=now()
                where id=%s and user_id=%s and status='uploading'""",
            (Jsonb(payload), job_id, user_id),
        )
        return await self.get_job(job_id)

    async def sweep(self) -> dict[str, int]:
        stale = await self.fetch_all(
            f"""update {DATABASE_SCHEMA}.text_jobs
                set status='error', stage='error', progress=100, error='Задание зависло: нет обновлений слишком долго'
                where status in ('queued', 'running')
                  and updated_at < now() - interval '15 minutes'
                returning id, text_id, user_id"""
        )
        stale_uploads = await self.fetch_all(
            f"""update {DATABASE_SCHEMA}.text_jobs
                set status='error', stage='error', progress=100, error='Загрузка файла не завершилась'
                where status='uploading'
                  and updated_at < now() - interval '30 minutes'
                returning id, text_id, user_id"""
        )
        orphans = await self.fetch_all(
            f"""select t.id, t.owner_id
                from {DATABASE_SCHEMA}.texts t
                where t.ready = false
                  and t.created_at < now() - interval '30 minutes'
                  and not exists (
                    select 1 from {DATABASE_SCHEMA}.text_jobs j
                    where j.text_id = t.id and j.status in ('uploading', 'queued', 'running')
                  )"""
        )
        for row in orphans:
            await self.delete_text(str(row["id"]), str(row["owner_id"]))
        pruned = await self.execute(
            f"""delete from {DATABASE_SCHEMA}.text_jobs
                where status in ('done', 'error', 'cancelled')
                  and updated_at < now() - interval '7 days'"""
        )
        return {
            "stale": len(stale) + len(stale_uploads),
            "orphans": len(orphans),
            "pruned": 0,
        }

    async def update_job(self, job_id: str, **fields: Any) -> None:
        allowed = {"status", "stage", "progress", "error", "text_id", "result", "payload"}
        sets = []
        values: list[Any] = []
        for key, value in fields.items():
            if key not in allowed:
                continue
            sets.append(f"{key}=%s")
            values.append(Jsonb(value) if key in ("result", "payload") else value)
        if not sets:
            return
        sets.append("updated_at=now()")
        values.append(job_id)
        await self.execute(
            f"update {DATABASE_SCHEMA}.text_jobs set {', '.join(sets)} where id=%s", tuple(values)
        )

