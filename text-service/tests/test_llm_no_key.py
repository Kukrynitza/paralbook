import asyncio

import pytest

from app import llm
from app.jobs import require_translation


class FakeDb:
    async def get_llm_settings(self, user_id):
        return None


def run(coro):
    return asyncio.run(coro)


def test_load_config_without_key(monkeypatch):
    monkeypatch.setattr(llm, "LLM_API_KEY", "")
    with pytest.raises(llm.LlmError) as error:
        run(llm.load_config(FakeDb(), "user"))
    assert error.value.code == "no_key"
    assert "API-ключ" in error.value.message


def test_list_models_without_key():
    config = llm.LlmConfig("https://openrouter.ai/api/v1", "gpt-4o-mini", None, "user")
    with pytest.raises(llm.LlmError) as error:
        run(llm.list_models(config))
    assert error.value.code == "unauthorized"
    assert "API-ключ" in error.value.message


def test_settings_view_reports_no_key(monkeypatch):
    import app.main as main

    monkeypatch.setattr(llm, "LLM_API_KEY", "")
    monkeypatch.setattr(main, "LLM_API_KEY", "")
    monkeypatch.setattr(main, "db", FakeDb())
    view = run(main.settings_view("user"))
    assert view.source == "none"
    assert view.hasKey is False


def test_english_without_translation_is_rejected():
    with pytest.raises(ValueError):
        require_translation("The duck lived by the lake.", "")


def test_ready_pair_is_allowed():
    require_translation("The duck lived by the lake.", "Утка жила у озера.")
