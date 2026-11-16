from __future__ import annotations

import hmac

import jwt
from fastapi import Header, HTTPException

from .config import JWT_SECRET, SERVICE_TOKEN


def verify_user_token(authorization: str | None) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Нужен токен пользователя")
    token = authorization.split(" ", 1)[1].strip()
    if not JWT_SECRET:
        raise HTTPException(status_code=500, detail="Не задан TEXT_SERVICE_JWT_SECRET")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail="Неверный или истёкший токен") from exc
    if not payload.get("sub"):
        raise HTTPException(status_code=401, detail="В токене нет пользователя")
    return payload


def internal_ok(header: str | None) -> bool:
    return bool(header) and hmac.compare_digest(header, SERVICE_TOKEN)


def require_internal(x_service_token: str | None = Header(default=None)) -> bool:
    if not internal_ok(x_service_token):
        raise HTTPException(status_code=401, detail="Нет доступа к сервису")
    return True


def can_access_job(job: dict, user_id: str) -> bool:
    return str(job.get("user_id") or "") == str(user_id)
