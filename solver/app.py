from contextlib import asynccontextmanager

from fastapi import FastAPI, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from solver.errors import SolverError
from solver.service import (
    article_for,
    due_cards,
    ensure_examples,
    generate_text,
    memory_for,
    review_word,
    save_word,
    seed_words,
    sense_for,
    study_deck,
    upload_text,
)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    yield


app = FastAPI(lifespan=lifespan)


@app.exception_handler(SolverError)
def solver_error(_request, exc: SolverError):
    return JSONResponse(status_code=400, content={"detail": exc.message})


class SenseIn(BaseModel):
    word: str
    sentence: str
    sentenceRu: str = ""


class VocabIn(BaseModel):
    userId: str
    lemma: str
    countToday: bool = False
    senseId: str | None = None
    contextEn: str | None = None
    contextRu: str | None = None
    disagreement: bool | None = None


class SeedIn(BaseModel):
    userId: str
    level: str = "B1"


class ReviewIn(BaseModel):
    userId: str
    lemma: str
    remembered: bool


class UploadIn(BaseModel):
    userId: str
    title: str
    topic: str = ""
    level: str = "B1"
    body: str


class ExamplesIn(BaseModel):
    lemmas: list[str]


class GenerateIn(BaseModel):
    userId: str
    topic: str
    minutes: int = 5
    level: str = "B1"
    interests: list[str] = []


@app.post("/sense")
def sense(body: SenseIn):
    return sense_for(body.word, body.sentence, body.sentenceRu)


@app.post("/vocabulary")
def vocabulary(body: VocabIn):
    return {
        "id": save_word(
            body.userId,
            body.lemma,
            body.countToday,
            body.senseId,
            body.contextEn,
            body.contextRu,
            body.disagreement,
        )
    }


@app.post("/vocabulary/seed")
def vocabulary_seed(body: SeedIn):
    return {"ids": seed_words(body.userId, body.level)}


@app.post("/review")
def review(body: ReviewIn):
    return review_word(body.userId, body.lemma, body.remembered)


@app.get("/study")
def study(
    userId: str = Query(),
    packs: str = Query(""),
    mode: str = Query(""),
    daily: int = Query(10),
    extra: int = Query(0),
):
    names = [part.strip() for part in packs.split(",") if part.strip()]
    return study_deck(userId, names, mode, daily, extra=bool(extra))


@app.get("/due")
def due(
    userId: str = Query(),
    newWords: int = Query(0),
    total: int = Query(10),
):
    return {"lemmas": due_cards(userId, newWords, total)}


@app.post("/upload")
def upload(body: UploadIn):
    return {"textId": upload_text(body.userId, body.title, body.topic, body.level, body.body)}


@app.post("/examples")
def examples(body: ExamplesIn):
    return {"written": ensure_examples(body.lemmas)}


@app.post("/generate")
def generate(body: GenerateIn):
    return generate_text(body.userId, body.topic, body.minutes, body.level, body.interests)


@app.get("/memory")
def memory(lemma: str = Query()):
    return {"memory": memory_for(lemma)}


@app.get("/article")
def article(word: str = Query()):
    return article_for(word)


@app.get("/")
def root():
    return {"ok": True, "ui": "http://127.0.0.1:5173"}


@app.get("/health")
def health():
    return {"ok": True}
