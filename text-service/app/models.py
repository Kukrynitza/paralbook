from typing import Literal

from pydantic import BaseModel, Field


class LlmSaveBody(BaseModel):
    baseUrl: str = ""
    model: str = ""
    apiKey: str | None = None


class LlmTestBody(BaseModel):
    baseUrl: str = ""
    model: str = ""
    apiKey: str | None = None


class LlmModelsBody(BaseModel):
    baseUrl: str = ""
    apiKey: str | None = None


class ChatJobBody(BaseModel):
    userId: str | None = None
    textId: str
    topic: str
    minutes: int = Field(default=5, ge=1, le=60)
    level: str = "B1"


class TextImportBody(BaseModel):
    text: str = ""
    russian: str | None = None
    translate: bool = True
    source: Literal["upload", "text"] = "text"


class JobView(BaseModel):
    id: str
    type: str
    status: str
    stage: str | None = None
    progress: int = 0
    textId: str | None = None
    error: str | None = None
    result: dict | None = None


class LlmSettingsView(BaseModel):
    baseUrl: str | None = None
    model: str | None = None
    hasKey: bool = False
    keyHint: str | None = None
    source: Literal["user", "env", "none"] = "none"
    envModel: str | None = None
    tableReady: bool = True
