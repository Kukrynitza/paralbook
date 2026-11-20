import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")
load_dotenv(Path(__file__).resolve().parents[1] / ".env")


def env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


def env_int(name: str, default: int) -> int:
    try:
        return int(env(name, str(default)))
    except ValueError:
        return default


DATABASE_URL = env("DATABASE_CONNECTION_STRING")
DATABASE_SCHEMA = env("DATABASE_SCHEMA", "public")

SERVICE_HOST = env("TEXT_SERVICE_HOST", "127.0.0.1")
SERVICE_PORT = env_int("TEXT_SERVICE_PORT", 8000)
SERVICE_TOKEN = env("TEXT_SERVICE_TOKEN", "dev-service-token")
JWT_SECRET = env("TEXT_SERVICE_JWT_SECRET") or env("JWT_SECRET_KEY")
WEB_ORIGIN = env("WEB_ORIGIN", "http://localhost:5173")

LLM_SETTINGS_SECRET = env("LLM_SETTINGS_SECRET") or env("JWT_SECRET_KEY")
LLM_LEGACY_SECRET = env("LLM_LEGACY_SECRET") or env("JWT_SECRET_KEY")
LLM_BASE_URL = env("LLM_BASE_URL", "https://api.openai.com/v1")
LLM_API_KEY = env("LLM_API_KEY")
LLM_CHAT_MODEL = env("LLM_CHAT_MODEL", "gpt-4o-mini")

MIN_UPLOAD_TEXT = env_int("MIN_UPLOAD_TEXT", 20)
MAX_UPLOAD_TEXT = env_int("MAX_UPLOAD_TEXT", 2_000_000)
MAX_UPLOAD_BYTES = env_int("MAX_UPLOAD_BYTES", 30 * 1024 * 1024)
MAX_TWO_BOOKS_BYTES = env_int("MAX_TWO_BOOKS_BYTES", 4 * 1024 * 1024)
MAX_TWO_BOOKS_PAGES = env_int("MAX_TWO_BOOKS_PAGES", 2000)
MAX_TWO_BOOKS_TOKENS = env_int("MAX_TWO_BOOKS_TOKENS", 600_000)
MAX_TRANSLATE_CHARS = env_int("MAX_TRANSLATE_CHARS", 200_000)
MAX_WORDS_PER_PAGE = env_int("MAX_WORDS_PER_PAGE", 450)

LLM_TIMEOUT_SECONDS = env_int("LLM_TIMEOUT_SECONDS", 90)
TTS_VOICE = env("TTS_VOICE", "en-US-AriaNeural")
TTS_MAX_CHARS = env_int("TTS_MAX_CHARS", 240)
TRANSLATE_BLOCK_CHARS = env_int("TRANSLATE_BLOCK_CHARS", 3500)
TRANSLATE_CONCURRENCY = env_int("TRANSLATE_CONCURRENCY", 3)
WORDS_PER_MINUTE = env_int("WORDS_PER_MINUTE", 75)
CHAT_CHUNK_WORDS = env_int("CHAT_CHUNK_WORDS", 500)
CHAT_MAX_TOKENS = env_int("CHAT_MAX_TOKENS", 3000)
