"""Генерация idempotency-ключей для изменяющих запросов (SOS и т.п.)."""
from __future__ import annotations

import uuid


def new_idempotency_key() -> str:
    return uuid.uuid4().hex


# Совместимый псевдоним
generate_idempotency_key = new_idempotency_key
