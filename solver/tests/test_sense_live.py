import pytest
from fastapi.testclient import TestClient

from solver.app import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


def test_sense_picks_river_bank(client):
    response = client.post(
        "/sense",
        json={"word": "bank", "sentence": "The river bank was quiet.", "sentenceRu": "Берег реки был тихим."},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["inKb"] is True
    assert body["lemma"] == "bank"
    assert "берег" in body["translation"]
    assert body["senseId"]


def test_unknown_word_is_not_for_saving(client):
    response = client.post("/sense", json={"word": "qqqqzzzznotaword", "sentence": "A qqqqzzzznotaword sat."})
    assert response.status_code == 200
    body = response.json()
    assert body["inKb"] is False
    assert body["translation"] is None


def test_invented_sense_stays_inside_the_base(client):
    response = client.post("/sense", json={"word": "bank", "sentence": "The river bank was quiet."})
    chosen = response.json()["senseId"]
    assert chosen
    assert chosen != "made-up"


def test_unhappy_memory(client):
    response = client.get("/memory", params={"lemma": "unhappy"})
    assert response.status_code == 200
    memory = response.json()["memory"] or ""
    if not memory:
        return
    assert "un-" in memory
    assert "happy" in memory
