import os
from contextlib import contextmanager
from pathlib import Path

import psycopg
from dotenv import dotenv_values
from psycopg.rows import dict_row

ROOT = Path(__file__).resolve().parents[1]


def load_env() -> None:
    for path in (ROOT / ".env", Path(__file__).resolve().parent / ".env"):
        if not path.exists():
            continue
        for key, value in dotenv_values(path).items():
            if value is not None and not os.environ.get(key):
                os.environ[key] = value


def connection_string() -> str:
    load_env()
    raw = os.environ.get("DATABASE_CONNECTION_STRING")
    if not raw:
        raise RuntimeError("DATABASE_CONNECTION_STRING не задан")
    if "supabase" in raw and "sslmode=" not in raw:
        raw = f"{raw}{'&' if '?' in raw else '?'}sslmode=require"
    return raw


def connect():
    return psycopg.connect(connection_string(), row_factory=dict_row)


@contextmanager
def db():
    conn = connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
