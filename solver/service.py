import json
import re
from datetime import datetime, timedelta, timezone

from psycopg.errors import UndefinedTable, UniqueViolation
from psycopg.types.json import Json

from solver.db import db
from solver.errors import SolverError
from solver.hybrid import (
    LEVELS,
    as_vector,
    chunks_of,
    content_words,
    cosine,
    filter_english,
    keep_level_sentences,
    mnemonic_of,
    overlap_score,
    pieces,
)

REVIEW_STEPS = (
    timedelta(minutes=30),
    timedelta(hours=12),
    timedelta(days=1),
    timedelta(days=7),
    timedelta(days=30),
    timedelta(days=60),
)
BANDS = {"r100": (1, 100), "r1000": (101, 1000), "r3000": (1001, 3000)}
_SENTENCE = re.compile(r"(?<=[.!?])\s+")
from solver.llm import chat_text, configured, embed_text, parse_json

_EDGE = re.compile(r"^[^a-zа-яё]+|[^a-zа-яё]+$", re.IGNORECASE)


def _sid(value):
    return None if value is None else str(value)


def form_of(word: str) -> str:
    return _EDGE.sub("", (word or "").strip().lower())


def resolve_lemma(conn, word: str) -> str | None:
    form = form_of(word)
    if not form:
        return None
    rows = conn.execute(
        """
        select wf.lemma, l.rank
        from word_forms wf
        join lemmas l on l.lemma = wf.lemma
        where wf.form_norm = %s
        """,
        (form,),
    ).fetchall()
    exact = next((row for row in rows if row["lemma"] == form), None)
    if exact:
        return exact["lemma"]
    if not rows:
        return None
    return min(rows, key=lambda row: row["rank"])["lemma"]


def _optional_rows(conn, sql: str, params: tuple = ()) -> list[dict]:
    try:
        with conn.transaction():
            return conn.execute(sql, params).fetchall()
    except UndefinedTable:
        return []


def memory_line(conn, lemma: str) -> str | None:
    rows = _optional_rows(
        conn,
        """
        select m.kind, m.form, m.gloss
        from lemma_morphemes lm
        join morphemes m on m.id = lm.morpheme_id
        where lm.lemma = %s
        order by lm.position asc
        """,
        (lemma,),
    )
    if not rows:
        return None
    root = next((row for row in rows if row["kind"] == "root"), None)
    stem = None
    if root:
        found = conn.execute("select translation from lemmas where lemma = %s", (root["form"],)).fetchone()
        stem = found["translation"] if found else None
    return mnemonic_of(
        [
            {
                "kind": row["kind"],
                "form": row["form"],
                "gloss": row["gloss"],
                "stem_translation": stem if row["kind"] == "root" else None,
            }
            for row in rows
        ]
    )


def sense_for(word: str, sentence: str, sentence_ru: str = "") -> dict:
    sentence = sentence.strip()
    sentence_ru = (sentence_ru or "").strip()
    with db() as conn:
        lemma = resolve_lemma(conn, word)
        if not lemma:
            return {
                "inKb": False,
                "lemma": None,
                "senseId": None,
                "translation": None,
                "disagreement": True,
                "reason": "Слова нет в базе знаний",
                "memory": None,
                "sentence": sentence,
                "sentenceRu": sentence_ru,
            }
        senses = conn.execute(
            "select id, text, position from senses where lemma = %s order by position asc",
            (lemma,),
        ).fetchall()
        if not senses:
            row = conn.execute("select translation from lemmas where lemma = %s", (lemma,)).fetchone()
            return {
                "inKb": True,
                "lemma": lemma,
                "senseId": None,
                "translation": row["translation"] if row else None,
                "disagreement": True,
                "reason": "В базе знаний нет списка значений, показан общий перевод",
                "memory": memory_line(conn, lemma),
                "sentence": sentence,
                "sentenceRu": sentence_ru,
            }
        ids = [row["id"] for row in senses]
        cues = _optional_rows(conn, "select sense_id, cue from sense_cues where sense_id = any(%s)", (ids,))
        examples = conn.execute(
            "select sense_id, text_en from sense_examples where sense_id = any(%s)",
            (ids,),
        ).fetchall()
        choices = [
            {
                "id": _sid(sense["id"]),
                "text": sense["text"],
                "cues": [cue["cue"] for cue in cues if cue["sense_id"] == sense["id"]],
                "examples": [example["text_en"] for example in examples if example["sense_id"] == sense["id"]],
            }
            for sense in senses
        ]
        neural = _neural(lemma, sentence, choices)
        from solver.hybrid import decide_sense

        decision = decide_sense(choices, sentence, neural)
        chosen = next((sense for sense in senses if _sid(sense["id"]) == decision["sense_id"]), senses[0])
        return {
            "inKb": True,
            "lemma": lemma,
            "senseId": _sid(chosen["id"]) if chosen else None,
            "translation": chosen["text"] if chosen else None,
            "disagreement": decision["disagreement"] or not chosen,
            "reason": decision["reason"] if chosen else "В базе знаний нет значения, перевод не сохранён",
            "memory": memory_line(conn, lemma),
            "sentence": sentence,
            "sentenceRu": sentence_ru,
        }


def _neural(lemma: str, sentence: str, choices: list[dict]) -> dict | None:
    if not configured() or not choices:
        return None
    try:
        raw = chat_text(
            'Выбери одно значение слова из списка базы знаний. Верни только JSON {"senseId","confidence"} где confidence от 0 до 1. Не выдумывай перевод.',
            json_dumps({"word": lemma, "sentence": sentence, "senses": choices}),
        )
    except SolverError:
        return None
    if not raw:
        return None
    try:
        parsed = parse_json(raw)
    except (ValueError, TypeError):
        return None
    if not isinstance(parsed, dict) or not parsed.get("senseId"):
        return None
    return {"sense_id": str(parsed["senseId"]), "confidence": float(parsed.get("confidence") or 0)}


def json_dumps(value) -> str:
    return json.dumps(value, ensure_ascii=False)


def article_for(word: str) -> dict:
    with db() as conn:
        lemma = resolve_lemma(conn, word)
        if not lemma:
            raise SolverError("Слова нет в словарной статье")
        entry = conn.execute(
            "select lemma, ipa, translation, rank, example, hint from lemmas where lemma = %s",
            (lemma,),
        ).fetchone()
        if not entry:
            raise SolverError("Слова нет в словарной статье")
        senses = conn.execute(
            "select id, pos, text, position from senses where lemma = %s order by position asc",
            (entry["lemma"],),
        ).fetchall()
        examples = []
        if senses:
            examples = conn.execute(
                "select sense_id, text_en, text_ru, position from sense_examples where sense_id = any(%s) order by position asc",
                ([row["id"] for row in senses],),
            ).fetchall()
        if senses:
            packed = [
                {
                    "id": _sid(sense["id"]),
                    "pos": sense["pos"],
                    "text": sense["text"],
                    "examples": [
                        {"textEn": item["text_en"], "textRu": item["text_ru"]}
                        for item in examples
                        if item["sense_id"] == sense["id"]
                    ],
                }
                for sense in senses
            ]
        elif entry["translation"]:
            packed = [
                {
                    "id": "",
                    "pos": "сл.",
                    "text": entry["translation"],
                    "examples": [{"textEn": entry["example"], "textRu": None}] if entry["example"] else [],
                }
            ]
        else:
            packed = []
        return {
            "lemma": entry["lemma"],
            "ipa": entry["ipa"],
            "translation": entry["translation"],
            "rank": entry["rank"],
            "example": entry["example"],
            "hint": entry["hint"],
            "senses": packed,
        }


def save_word(
    user_id: str,
    lemma: str,
    count_today: bool = False,
    sense_id: str | None = None,
    context_en: str | None = None,
    context_ru: str | None = None,
    disagreement: bool | None = None,
) -> str:
    with db() as conn:
        known = conn.execute(
            "select lemma, hint from lemmas where lemma = %s",
            (lemma.strip().lower(),),
        ).fetchone()
        if not known:
            raise SolverError("Слова нет в словарной статье")
        memory = memory_line(conn, known["lemma"])
        existing = conn.execute(
            "select id from user_words where user_id = %s and lemma = %s",
            (user_id, known["lemma"]),
        ).fetchone()
        if existing:
            if context_en or sense_id:
                conn.execute(
                    """
                    update user_words
                    set context_en = case when %s then %s else context_en end,
                        context_ru = case when %s then %s else context_ru end,
                        sense_id = case when %s then %s else sense_id end,
                        disagreement = %s,
                        hint = case when %s is not null then %s else hint end
                    where id = %s
                    """,
                    (
                        context_en is not None,
                        context_en,
                        context_ru is not None,
                        context_ru,
                        sense_id is not None,
                        sense_id,
                        bool(disagreement),
                        memory,
                        (memory or "")[:80],
                        existing["id"],
                    ),
                )
            return _sid(existing["id"])
        try:
            created = conn.execute(
                """
                insert into user_words (
                  user_id, lemma, hint, correct, wrong, mastered,
                  context_en, context_ru, sense_id, disagreement, due_at, interval_days, ease
                ) values (%s, %s, %s, 0, 0, false, %s, %s, %s, %s, now(), 0, 2.5)
                on conflict (user_id, lemma) do nothing
                returning id
                """,
                (
                    user_id,
                    known["lemma"],
                    (memory or known["hint"] or "")[:80],
                    context_en,
                    context_ru,
                    sense_id,
                    bool(disagreement),
                ),
            ).fetchone()
        except UniqueViolation:
            conn.rollback()
            created = None
        if not created:
            existing = conn.execute(
                "select id from user_words where user_id = %s and lemma = %s",
                (user_id, known["lemma"]),
            ).fetchone()
            if not existing:
                raise SolverError("Слова нет в словарной статье")
            return _sid(existing["id"])
        if count_today:
            _activity(conn, user_id, 0, 1)
        return _sid(created["id"])


def seed_words(user_id: str, level: str) -> list[str]:
    level = level if level in LEVELS else "B1"
    with db() as conn:
        rows = conn.execute(
            """
            insert into user_words (
              user_id, lemma, hint, correct, wrong, mastered, due_at, interval_days, ease
            )
            select %s, l.lemma, left(coalesce(l.hint, ''), 80), 0, 0, false, now(), 0, 2.5
            from lemmas l
            where l.level = %s
              and not exists (
                select 1 from user_words uw
                where uw.user_id = %s and uw.lemma = l.lemma
              )
            on conflict (user_id, lemma) do nothing
            returning id
            """,
            (user_id, level, user_id),
        ).fetchall()
        ids = [_sid(row["id"]) for row in rows]
        if ids:
            _activity(conn, user_id, 0, len(ids))
        return ids


def review_word(user_id: str, lemma: str, remembered: bool) -> dict:
    lemma = lemma.strip().lower()
    now = datetime.now(timezone.utc)
    with db() as conn:
        known = conn.execute("select lemma, hint from lemmas where lemma = %s", (lemma,)).fetchone()
        if not known:
            raise SolverError("Слова нет в словарной статье")
        word = conn.execute(
            """
            select id, correct, wrong, interval_days, ease, mastered
            from user_words
            where user_id = %s and lemma = %s
            """,
            (user_id, known["lemma"]),
        ).fetchone()
        ease = float(word["ease"] or 2.5) if word else 2.5
        if word and word["mastered"]:
            return {"intervalDays": 6, "ease": ease, "dueAt": now.isoformat(), "mastered": True, "correct": 6}
        if remembered:
            correct = (int(word["correct"] or 0) if word else 0) + 1
            wrong = int(word["wrong"] or 0) if word else 0
            if correct >= 6:
                due, mastered, step = now, True, 6
                correct = 6
            else:
                due, mastered, step = now + REVIEW_STEPS[correct - 1], False, correct
        elif word:
            correct = int(word["correct"] or 0)
            wrong = int(word["wrong"] or 0) + 1
            due, mastered, step = now, False, int(word["interval_days"] or 0)
        else:
            correct, wrong, due, mastered, step = 0, 1, now, False, 0
        if word:
            conn.execute(
                """
                update user_words
                set correct = %s, wrong = %s, interval_days = %s, ease = %s,
                    due_at = %s, mastered = %s
                where id = %s
                """,
                (correct, wrong, step, ease, due, mastered, word["id"]),
            )
        else:
            memory = memory_line(conn, known["lemma"])
            conn.execute(
                """
                insert into user_words (
                  user_id, lemma, hint, correct, wrong, mastered, due_at, interval_days, ease
                ) values (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                on conflict (user_id, lemma) do update
                set correct = excluded.correct,
                    wrong = excluded.wrong,
                    mastered = excluded.mastered,
                    due_at = excluded.due_at,
                    interval_days = excluded.interval_days
                """,
                (
                    user_id,
                    known["lemma"],
                    (memory or known["hint"] or "")[:80],
                    correct,
                    wrong,
                    mastered,
                    due,
                    step,
                    ease,
                ),
            )
            _activity(conn, user_id, 0, 1)
        return {
            "intervalDays": step,
            "ease": ease,
            "dueAt": due.isoformat(),
            "mastered": mastered,
            "correct": correct,
        }


def due_cards(user_id: str, new_words: int, total: int) -> list[str]:
    if new_words < 0 or new_words > 30 or total < 5 or total > 50 or new_words > total:
        raise SolverError("Новых от 0 до 30, всего от 5 до 50, новых не больше всего")
    with db() as conn:
        owned = conn.execute("select lemma from user_words where user_id = %s", (user_id,)).fetchall()
        owned_lemmas = {row["lemma"] for row in owned}
        due = conn.execute(
            """
            select lemma from user_words
            where user_id = %s and mastered = false and (due_at is null or due_at <= now())
            order by due_at asc
            """,
            (user_id,),
        ).fetchall()
        fresh = conn.execute("select lemma from lemmas order by rank asc limit 400").fetchall()
    fresh_cards = [row["lemma"] for row in fresh if row["lemma"] not in owned_lemmas][:new_words]
    due_only = [row["lemma"] for row in due if row["lemma"] not in fresh_cards]
    cards = [*due_only[: max(0, total - len(fresh_cards))], *fresh_cards][:total]
    if not cards:
        raise SolverError("На сегодня нет карточек. Добавьте слово из текста.")
    return cards


def study_lemmas(user_id: str, packs: list[str], limit: int = 30, fresh_only: bool = False) -> list[str]:
    allowed = {"own", "texts", *BANDS, *LEVELS}
    chosen: list[str] = []
    for pack in packs:
        name = "r100" if pack == "frequent" else pack
        if name in allowed and name not in chosen:
            chosen.append(name)
    if not chosen:
        raise SolverError("Выберите хотя бы одну пачку")
    saved = ""
    fresh: list[str] = []
    params: list = []
    if "texts" in chosen:
        saved = """
            select uw.lemma
            from user_words uw
            where uw.user_id = %s
              and uw.mastered = false
              and (
                nullif(btrim(coalesce(uw.context_en, '')), '') is not null
                or exists (
                    select 1
                    from en_tokens e
                    join pages p on p.id = e.page_id
                    join collection_items c on c.text_id = p.text_id and c.user_id = uw.user_id
                    where c.source in ('upload', 'chat') and e.lemma = uw.lemma
                )
              )
        """
        params.append(user_id)
    if "own" in chosen:
        fresh.append("select lemma from user_words where user_id = %s and mastered = false")
        params.append(user_id)
    for level in LEVELS:
        if level not in chosen:
            continue
        fresh.append("select lemma from lemmas where level = %s")
        params.append(level)
    for pack, (low, high) in BANDS.items():
        if pack not in chosen:
            continue
        fresh.append("select lemma from lemmas where rank between %s and %s")
        params.extend([low, high])
    parts: list[str] = []
    if saved:
        parts.append(saved)
    if fresh:
        inner = " union ".join(fresh)
        if fresh_only:
            inner = f"select pool.lemma from ({inner}) pool where not exists (select 1 from user_words uw where uw.user_id = %s and uw.lemma = pool.lemma)"
            params.append(user_id)
        parts.append(inner)
    if not parts:
        return []
    params.append(max(1, limit))
    query = f"""
        select pool.lemma
        from (
          {' union '.join(parts)}
        ) pool
        order by random()
        limit %s
    """
    with db() as conn:
        rows = conn.execute(query, params).fetchall()
    return [row["lemma"] for row in rows if row["lemma"]]


def _due_scope(packs: list[str]) -> tuple[str, list]:
    chosen: list[str] = []
    for pack in packs:
        name = "r100" if pack == "frequent" else pack
        if name in {"own", "texts", *BANDS, *LEVELS} and name not in chosen:
            chosen.append(name)
    if not chosen or "own" in chosen:
        return "", []
    parts: list[str] = []
    params: list = []
    if "texts" in chosen:
        parts.append(
            """
            (
              nullif(btrim(coalesce(uw.context_en, '')), '') is not null
              or exists (
                select 1
                from en_tokens e
                join pages p on p.id = e.page_id
                join collection_items c on c.text_id = p.text_id and c.user_id = uw.user_id
                where c.source in ('upload', 'chat') and e.lemma = uw.lemma
              )
            )
            """
        )
    for level in LEVELS:
        if level not in chosen:
            continue
        parts.append("l.level = %s")
        params.append(level)
    for pack, (low, high) in BANDS.items():
        if pack not in chosen:
            continue
        parts.append("l.rank between %s and %s")
        params.extend([low, high])
    if not parts:
        return "", []
    return " and (" + " or ".join(parts) + ")", params


def study_deck(user_id: str, packs: list[str], mode: str, daily: int, extra: bool = False) -> dict:
    daily = min(60, max(5, int(daily or 10)))
    mode = mode if mode in {"learn", "review", "mixed"} else ""
    with db() as conn:
        streak = _touch_streak(conn, user_id)
        activity = conn.execute(
            "select words from activity_days where user_id = %s and day = current_date",
            (user_id,),
        ).fetchone()
        scope, scope_params = _due_scope(packs)
        nxt = conn.execute(
            f"""
            select uw.due_at
            from user_words uw
            join lemmas l on l.lemma = uw.lemma
            where uw.user_id = %s and uw.mastered = false and uw.due_at > now()
            {scope}
            order by uw.due_at asc
            limit 1
            """,
            [user_id, *scope_params],
        ).fetchone()
        reviewed = conn.execute(
            """
            select count(*) as n
            from (
              select due_at - case interval_days
                when 1 then interval '30 minutes'
                when 2 then interval '12 hours'
                when 3 then interval '1 day'
                when 4 then interval '7 days'
                when 5 then interval '30 days'
                else interval '60 days'
              end as reviewed_at
              from user_words
              where user_id = %s and mastered = false and interval_days between 1 and 6
                and not (correct = 1 and wrong = 0 and interval_days = 1)
            ) steps
            where reviewed_at >= date_trunc('day', now())
              and reviewed_at < date_trunc('day', now()) + interval '1 day'
            """,
            (user_id,),
        ).fetchone()
        known = conn.execute(
            """
            select count(*) as n from user_words
            where user_id = %s
              and correct = 1 and wrong = 0 and interval_days = 1 and mastered = false
              and (due_at - interval '30 minutes') >= date_trunc('day', now())
              and (due_at - interval '30 minutes') < date_trunc('day', now()) + interval '1 day'
            """,
            (user_id,),
        ).fetchone()
        mastered = conn.execute(
            """
            select count(*) as n from user_words
            where user_id = %s and mastered = true
              and due_at >= date_trunc('day', now())
              and due_at < date_trunc('day', now()) + interval '1 day'
            """,
            (user_id,),
        ).fetchone()
        due = conn.execute(
            f"""
            select uw.lemma, uw.correct
            from user_words uw
            join lemmas l on l.lemma = uw.lemma
            where uw.user_id = %s and uw.mastered = false and (uw.due_at is null or uw.due_at <= now())
            {scope}
            order by uw.due_at asc nulls first, random()
            limit 500
            """,
            [user_id, *scope_params],
        ).fetchall()
    next_minutes = None
    next_due_at = None
    if nxt and nxt["due_at"]:
        due_at = nxt["due_at"]
        if due_at.tzinfo is None:
            due_at = due_at.replace(tzinfo=timezone.utc)
        seconds = (due_at - datetime.now(timezone.utc)).total_seconds()
        if seconds > 0:
            next_minutes = max(1, int((seconds + 59) // 60))
            next_due_at = due_at.isoformat()
    due_lemmas = [row["lemma"] for row in due]
    blocked = bool(mode) and not extra and not due_lemmas and next_minutes
    fresh: list[str] = []
    if extra or (mode in {"learn", "mixed"} and packs and not blocked):
        if not packs:
            raise SolverError("Выберите хотя бы одну пачку")
        fresh = study_lemmas(user_id, packs, daily, fresh_only=True)
        if (extra or mode == "learn") and not fresh:
            raise SolverError("В выбранных пачках нет новых слов")
    if extra:
        lemmas = fresh
    elif blocked:
        lemmas = []
    elif mode == "review":
        lemmas = due_lemmas
    elif mode == "learn":
        lemmas = fresh
    elif mode == "mixed":
        seen: set[str] = set()
        lemmas = []
        for lemma in [*due_lemmas, *fresh]:
            if lemma in seen:
                continue
            seen.add(lemma)
            lemmas.append(lemma)
    else:
        lemmas = []
    if lemmas and (mode or extra):
        try:
            head = lemmas[:24]
            ensure_examples(head)
            fill_example_ru(head)
        except Exception:
            pass
    return {
        "lemmas": lemmas,
        "mode": "learn" if extra else mode,
        "nextMinutes": next_minutes,
        "nextDueAt": next_due_at,
        "newToday": max(0, (int(activity["words"]) if activity else 0) - (int(known["n"]) if known else 0)),
        "streak": streak,
        "today": {
            "new": max(0, (int(activity["words"]) if activity else 0) - (int(known["n"]) if known else 0)),
            "reviewed": int(reviewed["n"]) if reviewed else 0,
            "known": int(known["n"]) if known else 0,
            "mastered": int(mastered["n"]) if mastered else 0,
        },
    }


def ensure_examples(lemmas: list[str]) -> int:
    unique = []
    seen: set[str] = set()
    for lemma in lemmas:
        word = lemma.strip().lower()
        if not word or word in seen:
            continue
        seen.add(word)
        unique.append(word)
    if not unique or not configured():
        return 0
    with db() as conn:
        missing = []
        for lemma in unique:
            ready = conn.execute(
                """
                select 1
                from sense_examples e
                join senses s on s.id = e.sense_id
                where s.lemma = %s
                limit 1
                """,
                (lemma,),
            ).fetchone()
            row = conn.execute(
                "select example, level from lemmas where lemma = %s",
                (lemma,),
            ).fetchone()
            if ready or (row and row["example"]):
                continue
            sense = conn.execute(
                "select id from senses where lemma = %s order by position asc limit 1",
                (lemma,),
            ).fetchone()
            if not sense:
                continue
            missing.append({"lemma": lemma, "level": (row or {}).get("level") or "B1", "senseId": sense["id"]})
    if not missing:
        return 0
    written = 0
    for start in range(0, len(missing), 20):
        batch = missing[start : start + 20]
        try:
            raw = chat_text(
                "Составь учебные примеры. Верни только JSON {\"items\":[{\"lemma\",\"examples\":[{\"en\",\"ru\"}]}]}. Для каждого слова ровно два коротких предложения его уровня CEFR. В en слово стоит в естественной форме. ru — перевод всего предложения.",
                json_dumps({"words": [{"lemma": item["lemma"], "level": item["level"]} for item in batch]}),
            )
        except SolverError:
            continue
        parsed = _object(raw) if raw else None
        items = parsed.get("items") if isinstance(parsed, dict) else None
        if not isinstance(items, list):
            continue
        by_lemma = {
            str(item.get("lemma") or "").strip().lower(): item
            for item in items
            if isinstance(item, dict)
        }
        with db() as conn:
            for item in batch:
                found = by_lemma.get(item["lemma"])
                examples = found.get("examples") if isinstance(found, dict) else None
                if not isinstance(examples, list):
                    continue
                position = 0
                for example in examples:
                    if position >= 2 or not isinstance(example, dict):
                        continue
                    english = str(example.get("en") or "").strip()
                    russian = str(example.get("ru") or "").strip()
                    if len(english) < 8:
                        continue
                    conn.execute(
                        """
                        insert into sense_examples (sense_id, position, text_en, text_ru, source)
                        values (%s, %s, %s, %s, 'solver')
                        """,
                        (item["senseId"], position, english[:400], russian[:400] or None),
                    )
                    position += 1
                    written += 1
    return written


def fill_example_ru(lemmas: list[str]) -> int:
    unique: list[str] = []
    seen: set[str] = set()
    for lemma in lemmas:
        word = lemma.strip().lower()
        if not word or word in seen:
            continue
        seen.add(word)
        unique.append(word)
    if not unique or not configured():
        return 0
    with db() as conn:
        rows = conn.execute(
            """
            select s.lemma, s.id as sense_id, s.position as sense_pos,
                   e.id as example_id, e.position as example_pos, e.text_en, e.text_ru
            from senses s
            left join sense_examples e on e.sense_id = s.id
            where s.lemma = any(%s)
            order by s.lemma, s.position nulls last, e.position nulls last
            """,
            (unique,),
        ).fetchall()
        stored = conn.execute(
            "select lemma, example from lemmas where lemma = any(%s)",
            (unique,),
        ).fetchall()
    grouped: dict[str, list] = {}
    for row in rows:
        grouped.setdefault(row["lemma"], []).append(row)
    examples = {row["lemma"]: row["example"] for row in stored}
    jobs: list[dict] = []
    for lemma in unique:
        group = grouped.get(lemma) or []
        picked = []
        per_sense: dict[str, int] = {}
        for row in group:
            english = (row["text_en"] or "").strip()
            if not row["example_id"] or len(english) < 8:
                continue
            sense_id = str(row["sense_id"])
            count = per_sense.get(sense_id, 0)
            if count >= 2 or len(picked) >= 6:
                continue
            per_sense[sense_id] = count + 1
            picked.append(row)
        missing = [row for row in picked if not (row["text_ru"] or "").strip()]
        if missing:
            for row in missing:
                jobs.append({"kind": "update", "id": row["example_id"], "en": row["text_en"].strip()})
            continue
        if picked:
            continue
        sample = (examples.get(lemma) or "").strip()
        sense_id = next((row["sense_id"] for row in group if row["sense_id"]), None)
        if sense_id and len(sample) >= 8:
            jobs.append({"kind": "insert", "senseId": sense_id, "en": sample})
    if not jobs:
        return 0
    written = 0
    batch = jobs[:20]
    if batch:
        try:
            raw = chat_text(
                "Переведи учебные английские предложения на русский. Верни только JSON {\"items\":[{\"key\",\"ru\"}]}. key верни как получил. ru — перевод всего предложения, без пояснений.",
                json_dumps({"items": [{"key": str(index), "en": item["en"][:400]} for index, item in enumerate(batch)]}),
            )
        except SolverError:
            return 0
        parsed = _object(raw) if raw else None
        items = parsed.get("items") if isinstance(parsed, dict) else None
        if not isinstance(items, list):
            return 0
        rus: dict[str, str] = {}
        for item in items:
            if not isinstance(item, dict):
                continue
            key = str(item.get("key") if item.get("key") is not None else "")
            russian = str(item.get("ru") or "").strip()
            if key and russian:
                rus[key] = russian[:400]
        with db() as conn:
            for index, job in enumerate(batch):
                russian = rus.get(str(index))
                if not russian:
                    continue
                if job["kind"] == "update":
                    conn.execute(
                        """
                        update sense_examples
                        set text_ru = %s
                        where id = %s and (text_ru is null or btrim(text_ru) = '')
                        """,
                        (russian, job["id"]),
                    )
                else:
                    conn.execute(
                        """
                        insert into sense_examples (sense_id, position, text_en, text_ru, source)
                        select %s,
                               coalesce((select max(position) + 1 from sense_examples where sense_id = %s), 0),
                               %s, %s, 'solver'
                        where not exists (
                          select 1 from sense_examples where sense_id = %s and text_en = %s
                        )
                        """,
                        (job["senseId"], job["senseId"], job["en"][:400], russian, job["senseId"], job["en"][:400]),
                    )
                written += 1
    return written


def memory_for(lemma: str) -> str | None:
    with db() as conn:
        return memory_line(conn, lemma)


def upload_text(user_id: str, title: str, topic: str, level: str, body: str) -> str:
    body = repair_marks(body.replace("\r\n", "\n").replace("\r", "\n")).strip()
    if len(body) < 20:
        raise SolverError("Текст слишком короткий")
    if len(body) > 2_000_000:
        raise SolverError("Текст длиннее 2000000 символов")
    title = title.strip()[:80]
    if not title:
        raise SolverError("Напишите название")
    topic = (topic.strip() or title)[:80]
    level = level if level in LEVELS else "B1"
    minutes = max(1, round(len(content_words(body)) / 120))
    excerpt = _preview(body)
    with db() as conn:
        return _persist(
            conn,
            user_id=user_id,
            title=title,
            excerpt=excerpt,
            minutes=minutes,
            level=level,
            topic=topic,
            english=body,
            russian="Загруженный текст",
            source="upload",
        )


def generate_text(user_id: str, topic: str, minutes: int, level: str, interests: list[str] | None = None) -> str:
    topic = topic.strip()
    if not topic:
        raise SolverError("Напишите тему")
    level = level if level in LEVELS else "B1"
    minutes = min(60, max(1, round(minutes or 5)))
    label = f"{topic}, {minutes} минут, уровень {level}"
    with db() as conn:
        last = conn.execute(
            "select role from chat_messages where user_id = %s order by created_at desc limit 1",
            (user_id,),
        ).fetchone()
    last_role = last["role"] if last else None
    if topic.lower() == "error":
        _fail(user_id, topic, minutes, level, last_role)
        return {"textId": None}
    if not configured():
        _fail(user_id, topic, minutes, level, last_role, "Модель не настроена. Повторите, когда она будет доступна.")
        return {"textId": None}
    found = _retrieve(user_id, topic)
    fragments = "\n".join(item["body"] for item in found)
    title = f"{topic[:40]}…" if len(topic) > 42 else topic[:1].upper() + topic[1:]
    saved: dict[str, str | None] = {"id": None}

    def save(english: str, russian: str, current_title: str) -> None:
        shown_minutes = max(1, round(_word_count(english) / 90))
        lead = _preview(english)
        text_id = saved["id"]
        with db() as conn:
            if text_id is None:
                if last_role != "error":
                    conn.execute(
                        "insert into chat_messages (user_id, role, body) values (%s, 'user', %s)",
                        (user_id, label),
                    )
                text_id = _persist(
                    conn,
                    user_id=user_id,
                    title=current_title,
                    excerpt=lead,
                    minutes=shown_minutes,
                    level=level,
                    topic=topic,
                    english=english,
                    russian=russian or lead,
                    source="chat",
                )
                conn.execute(
                    "insert into chat_messages (user_id, role, text_id) values (%s, 'result', %s)",
                    (user_id, text_id),
                )
            else:
                conn.execute(
                    "update texts set title = %s, excerpt = %s, minutes = %s where id = %s",
                    (current_title[:80], lead[:500], shown_minutes, text_id),
                )
                _rewrite_pages(conn, text_id, english, russian or lead)
        saved["id"] = text_id

    try:
        _write_parts(topic, level, minutes * 90, fragments, title, save, interests or [])
    except Exception:
        if not saved["id"]:
            _fail(user_id, topic, minutes, level, last_role, "Модель не ответила. Повторите ещё раз.")
            return {"textId": None}
        return {"textId": saved["id"]}
    if not saved["id"]:
        _fail(user_id, topic, minutes, level, last_role, "Модель не ответила. Повторите ещё раз.")
        return {"textId": None}
    return {"textId": saved["id"]}


def _write_parts(topic: str, level: str, target: int, fragments: str, title: str, save, interests: list[str]) -> None:
    english = ""
    russian = ""
    for _step in range(20):
        have = _word_count(english)
        if have >= int(target * 0.85):
            break
        need = min(350, max(40, target - have))
        piece, extra_ru, extra_title = _next_piece(topic, level, need, fragments, english, strict=False, interests=interests)
        if piece and _repeats(english, piece):
            piece, retry_ru, retry_title = _next_piece(topic, level, need, fragments, english, strict=True, interests=interests)
            extra_ru = retry_ru or extra_ru
            extra_title = retry_title or extra_title
        if not piece:
            break
        piece = _soften(piece, level)
        before = have
        english = f"{english}\n\n{piece}".strip() if english else piece
        if extra_title and before == 0:
            title = extra_title[:80]
        if extra_ru:
            russian = f"{russian}\n\n{extra_ru}".strip() if russian else extra_ru
        if _word_count(english) <= before + 20:
            if before == 0:
                save(english, russian, title)
            break
        save(english, russian, title)


def _interest_note(interests: list[str] | None) -> str:
    names = [item.strip() for item in (interests or []) if item and item.strip()]
    if not names:
        return ""
    return (
        " Интересы читателя: "
        + ", ".join(names)
        + ". Вплетай их в примеры. Явно заданную тему не подменяй."
    )


def _next_piece(
    topic: str,
    level: str,
    need: int,
    fragments: str,
    english: str,
    strict: bool,
    interests: list[str] | None = None,
) -> tuple[str, str, str]:
    note = _interest_note(interests)
    try:
        if not english:
            raw = chat_text(
                "Ты пишешь один связный учебный английский текст. Верни только JSON {\"title\",\"english\",\"russian\"}. russian — перевод этой части. Около words слов, уровень CEFR не выше заданного. Каждое предложение закончено. Это начало текста."
                + note,
                json_dumps({"topic": topic, "words": need, "level": level, "fragments": fragments[:2000]}),
            )
        else:
            system = "Продолжи тот же учебный текст следующим абзацем. Не повторяй уже написанное и не начинай новую историю. Верни только JSON {\"english\",\"russian\"} — только новый кусок, около addWords слов, уровень CEFR не выше заданного."
            if strict:
                system = "Предыдущий ответ повторил уже написанное. Напиши только следующие предложения того же текста, которых ещё нет. Верни только JSON {\"english\",\"russian\"}."
            raw = chat_text(system + note, json_dumps({"level": level, "addWords": need, "english": english[-900:]}))
    except SolverError:
        return "", "", ""
    parsed = _object(raw)
    if not parsed:
        return "", "", ""
    return (
        str(parsed.get("english") or "").strip(),
        str(parsed.get("russian") or "").strip(),
        str(parsed.get("title") or "").strip(),
    )


def _repeats(previous: str, piece: str) -> bool:
    if not previous or not piece:
        return False
    sample = re.sub(r"\s+", " ", piece).strip()[:80].lower()
    return bool(sample) and sample in re.sub(r"\s+", " ", previous).lower()


def _soften(english: str, level: str) -> str:
    sentences = [part.strip() for part in _SENTENCE.split(english.strip()) if part.strip()]
    if not sentences:
        return english
    hard: list[str] = []
    with db() as conn:
        known_rows = _known_levels(conn, content_words(english))
    levels = {form: row["level"] for form, row in known_rows.items()}

    def replacement_for(_word: str):
        return None

    for sentence in sentences:
        filtered = filter_english(sentence, level, levels, replacement_for)
        for warning in filtered["warnings"]:
            word = warning.split(" ", 1)[0]
            if "убрано" in warning and word not in hard:
                hard.append(word)
    if not hard:
        return english
    try:
        raw = chat_text(
            "Замени в тексте слова из списка на более простые того же уровня CEFR. Не удаляй предложения и не меняй смысл. Верни только JSON {\"english\"}.",
            json_dumps({"level": level, "replace": hard[:24], "english": english[:6000]}),
        )
    except SolverError:
        return english
    parsed = _object(raw)
    rewritten = str(parsed.get("english") or "").strip() if parsed else ""
    if not rewritten or _word_count(rewritten) < int(_word_count(english) * 0.7):
        return english
    return rewritten


def _object(raw: str | None) -> dict | None:
    if not raw:
        return None
    try:
        parsed = parse_json(raw)
    except (ValueError, TypeError):
        return None
    return parsed if isinstance(parsed, dict) else None


def _word_count(text: str) -> int:
    return sum(1 for part in pieces(text) if not part.isspace() and form_of(part))


def _fail(user_id: str, topic: str, minutes: int, level: str, last_role: str | None, message: str | None = None) -> None:
    text = message or "Не получилось составить текст. Повторите ещё раз."
    with db() as conn:
        if last_role != "error":
            conn.execute(
                "insert into chat_messages (user_id, role, body) values (%s, 'user', %s)",
                (user_id, f"{topic}, {minutes} минут, уровень {level}"),
            )
        conn.execute(
            """
            insert into chat_messages (user_id, role, body, retry_topic, retry_minutes, retry_level)
            values (%s, 'error', %s, %s, %s, %s)
            """,
            (user_id, text, topic, minutes, level),
        )


def _retrieve(user_id: str, topic: str) -> list[dict]:
    try:
        with db() as conn:
            rows = conn.execute(
                """
                select c.body, c.embedding
                from text_chunks c
                join texts t on t.id = c.text_id
                where t.owner_id = %s or t.published = true
                order by t.created_at desc
                limit 200
                """,
                (user_id,),
            ).fetchall()
    except UndefinedTable:
        return []
    try:
        vector = embed_text(topic)
    except SolverError:
        vector = None
    ranked = []
    for row in rows:
        embedding = as_vector(row["embedding"])
        score = cosine(vector, embedding) if vector and embedding else overlap_score(topic, row["body"])
        if score > 0:
            ranked.append({"body": row["body"], "score": score})
    ranked.sort(key=lambda item: item["score"], reverse=True)
    return ranked[:4]


def _level_ok(word_level: str, target: str) -> bool:
    return LEVELS.index(word_level) <= LEVELS.index(target) if word_level in LEVELS and target in LEVELS else False


def _apply_filter(english: str, level: str, pool_text: str) -> dict:
    words = content_words(f"{english} {pool_text}")
    with db() as conn:
        known = _known_levels(conn, words)
    levels = {form: row["level"] for form, row in known.items()}
    pool = [word for word in content_words(pool_text) if word in known and _level_ok(known[word]["level"], level)]

    def replacement_for(word: str):
        prefix = word[:4]
        return next(
            (item for item in pool if item != word and item.startswith(prefix) and _level_ok(known[item]["level"], level)),
            None,
        )

    return keep_level_sentences(english, level, levels, replacement_for)


def _known_levels(conn, words: list[str]) -> dict:
    unique = list({word for word in words if word})
    found: dict = {}
    if not unique:
        return found
    rows = conn.execute(
        """
        select wf.form_norm, wf.lemma, l.rank, l.level
        from word_forms wf
        join lemmas l on l.lemma = wf.lemma
        where wf.form_norm = any(%s)
        """,
        (unique,),
    ).fetchall()
    for row in rows:
        if not row["level"]:
            continue
        previous = found.get(row["form_norm"])
        if not previous or row["rank"] < previous["rank"]:
            found[row["form_norm"]] = {"level": row["level"], "rank": row["rank"], "lemma": row["lemma"]}
    return found


def _preview(text: str, limit: int = 180) -> str:
    clean = re.sub(r"\s+", " ", text or "").strip()
    if not clean:
        return ""
    sentence = re.match(r"^.*?[.!?…][\"»']?", clean)
    if sentence and len(sentence.group(0).strip()) <= limit and len(sentence.group(0).strip()) < len(clean):
        return sentence.group(0).strip()
    if len(clean) <= limit and re.search(r"[.!?…][\"»']?$", clean):
        return clean
    slice_ = clean[: limit + 1]
    cut = slice_.rfind(" ")
    word = slice_[:cut].strip() if cut > 0 else clean[:limit].rstrip()
    return word if word.endswith("…") else f"{word}…"


def repair_marks(text: str) -> str:
    mark = "\ufffd"
    if mark not in text:
        return text
    text = re.sub(rf"(?<=[A-Za-z]){mark}(?=(?:s|t|re|ve|ll|d|m|clock)\b)", "’", text, flags=re.IGNORECASE)
    text = re.sub(rf"(^|[\s\n]){mark}(?=[A-Za-z])", r"\1“", text)
    text = re.sub(rf"(?<=[A-Za-z.,!?]){mark}(?=[\s\n]|$)", "”", text)
    return re.sub(rf"\s*{mark}\s*", "—", text)


def repair_stored_marks() -> int:
    mark = "\ufffd"
    steps = (
        (f"([A-Za-z]){mark}((?:s|t|re|ve|ll|d|m|clock))\\M", "\\1’\\2", "gi"),
        (f"(^|[[:space:]]){mark}([A-Za-z])", "\\1“\\2", "g"),
        (f"([A-Za-z.,!?]){mark}([[:space:]]|$)", "\\1”\\2", "g"),
        (f"[[:space:]]*{mark}[[:space:]]*", "—", "g"),
    )
    changed = 0
    with db() as conn:
        for table, column in (("en_tokens", "text"), ("texts", "excerpt")):
            expr = column
            params: list = []
            for pattern, repl, flags in steps:
                expr = f"regexp_replace({expr}, %s, %s, %s)"
                params.extend([pattern, repl, flags])
            params.append(f"%{mark}%")
            cursor = conn.execute(
                f"update {table} set {column} = {expr} where {column} like %s",
                params,
            )
            changed += cursor.rowcount
    return changed


def _sentence_done(text: str) -> bool:
    return bool(re.search(r"[.!?…][\"”»']?$", text.rstrip()))


def _heading(line: str) -> bool:
    text = line.strip()
    if not text or len(text) > 80:
        return False
    letters = [char for char in text if char.isalpha()]
    if letters and len(letters) >= 3 and sum(char.isupper() for char in letters) / len(letters) >= 0.8:
        return True
    return bool(re.match(r"^\d+\.\s+\S", text))


def _paragraphs(english: str) -> list[str]:
    paragraphs: list[str] = []
    current = ""
    for raw in english.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        if not raw.strip():
            if current:
                paragraphs.append(current.strip())
                current = ""
            continue
        piece = raw.strip()
        if _heading(piece):
            if current:
                paragraphs.append(current.strip())
                current = ""
            paragraphs.append(piece)
            continue
        if not current:
            current = piece
            continue
        if _sentence_done(current):
            paragraphs.append(current.strip())
            current = piece
        else:
            current = f"{current} {piece}"
    if current:
        paragraphs.append(current.strip())
    return [item for item in paragraphs if item]


def _pack_sentences(text: str) -> list[str]:
    sentences = [part.strip() for part in _SENTENCE.split(text.strip()) if part.strip()]
    if not sentences:
        return [text] if text.strip() else []
    pages: list[str] = []
    current: list[str] = []
    count = 0
    for sentence in sentences:
        words = _word_count(sentence)
        if current and count + words > 450:
            pages.append(" ".join(current))
            current = [sentence]
            count = words
        else:
            current.append(sentence)
            count += words
    if current:
        pages.append(" ".join(current))
    return pages


def _page_texts(english: str) -> list[str]:
    blocks = _paragraphs(english)
    if not blocks:
        return [english]
    pages: list[str] = []
    current: list[str] = []
    count = 0
    for block in blocks:
        words = _word_count(block)
        if words > 450:
            if current:
                pages.append("\n\n".join(current))
                current = []
                count = 0
            pages.extend(_pack_sentences(block))
            continue
        if current and count + words > 450:
            pages.append("\n\n".join(current))
            current = [block]
            count = words
        else:
            current.append(block)
            count += words
    if current:
        pages.append("\n\n".join(current))
    return pages or [english]


def _write_pages(conn, text_id, english: str, russian: str) -> None:
    pages = _page_texts(english)
    for position, page_text in enumerate(pages):
        page = conn.execute(
            "insert into pages (text_id, position) values (%s, %s) returning id",
            (text_id, position),
        ).fetchone()
        ru_parts = pieces(russian if position == 0 and russian else " ")
        en_parts = pieces(page_text)
        if ru_parts:
            with conn.cursor() as cur:
                cur.executemany(
                    "insert into ru_tokens (page_id, position, text) values (%s, %s, %s)",
                    [(page["id"], index, token) for index, token in enumerate(ru_parts)],
                )
        forms = list({bare for part in en_parts if (bare := form_of(part))})
        known = _known_levels(conn, forms)
        align = 0
        en_rows = []
        for index, token in enumerate(en_parts):
            if token.isspace():
                en_rows.append((page["id"], index, token, None, None))
                continue
            word = form_of(token)
            en_rows.append((page["id"], index, token, (known.get(word) or {}).get("lemma"), align))
            align += 1
        if en_rows:
            with conn.cursor() as cur:
                cur.executemany(
                    "insert into en_tokens (page_id, position, text, lemma, align) values (%s, %s, %s, %s, %s)",
                    en_rows,
                )


def _rewrite_pages(conn, text_id, english: str, russian: str) -> None:
    rows = conn.execute("select id from pages where text_id = %s", (text_id,)).fetchall()
    ids = [row["id"] for row in rows]
    if ids:
        conn.execute("delete from en_tokens where page_id = any(%s)", (ids,))
        conn.execute("delete from ru_tokens where page_id = any(%s)", (ids,))
        conn.execute("delete from pages where text_id = %s", (text_id,))
    _write_pages(conn, text_id, english, russian)


def _persist(conn, user_id, title, excerpt, minutes, level, topic, english, russian, source) -> str:
    text = conn.execute(
        """
        insert into texts (owner_id, title, excerpt, minutes, level, topic, base_rating, published)
        values (%s, %s, %s, %s, %s, %s, 0, false)
        returning id
        """,
        (user_id, title, _preview(excerpt), minutes, level, topic),
    ).fetchone()
    _write_pages(conn, text["id"], english, russian)
    conn.execute(
        "insert into collection_items (user_id, text_id, source, progress, credited) values (%s, %s, %s, 0, false)",
        (user_id, text["id"], source),
    )
    try:
        with conn.transaction():
            for position, chunk in enumerate(chunks_of(english)[:12]):
                try:
                    embedding = embed_text(chunk)
                except SolverError:
                    embedding = None
                conn.execute(
                    "insert into text_chunks (text_id, position, body, embedding) values (%s, %s, %s, %s)",
                    (text["id"], position, chunk, Json(embedding) if embedding else None),
                )
    except UndefinedTable:
        pass
    return _sid(text["id"])


def _activity(conn, user_id: str, minutes: int, words: int) -> None:
    if not minutes and not words:
        return
    conn.execute(
        """
        insert into activity_days (user_id, day, minutes, words)
        values (%s, current_date, %s, %s)
        on conflict (user_id, day) do update
        set minutes = activity_days.minutes + excluded.minutes,
            words = activity_days.words + excluded.words
        """,
        (user_id, minutes, words),
    )
    _touch_streak(conn, user_id)


def _touch_streak(conn, user_id: str) -> int:
    today = str(conn.execute("select current_date::text as day").fetchone()["day"])[:10]
    rows = conn.execute(
        """
        select day::text as day
        from activity_days
        where user_id = %s and (minutes > 0 or words > 0)
        order by day desc
        """,
        (user_id,),
    ).fetchall()
    streak = _streak_count([str(row["day"])[:10] for row in rows], today)
    conn.execute("update profiles set streak = %s where id = %s", (streak, user_id))
    return streak


def _streak_count(days: list[str], today: str) -> int:
    unique = sorted(set(days), reverse=True)
    if not unique or not today:
        return 0
    start = unique[0]
    yesterday = (datetime.fromisoformat(today) - timedelta(days=1)).date().isoformat()
    if start != today and start != yesterday:
        return 0
    seen = set(unique)
    cursor = start
    count = 0
    while cursor in seen:
        count += 1
        cursor = (datetime.fromisoformat(cursor) - timedelta(days=1)).date().isoformat()
    return count

