"""Маскировка секретов и персональных данных в логах и сообщениях."""
from __future__ import annotations

import re

_BOT_TOKEN_RE = re.compile(r"\b\d{6,12}:[A-Za-z0-9_-]{30,}\b")
_BEARER_RE = re.compile(r"(?i)(bearer\s+)[A-Za-z0-9._~+/=-]{8,}")
_LONG_TOKEN_RE = re.compile(r"\b[A-Za-z0-9_-]{28,}\b")
_LINK_TOKEN_RE = re.compile(r"(link_)[A-Za-z0-9_-]{4,}")


def mask_token(value: str, keep: int = 4) -> str:
    if not value:
        return ""
    return value[:keep] + "***"


def mask_email(value: str) -> str:
    if "@" not in value:
        return "***"
    name, _, domain = value.partition("@")
    return (name[:1] + "***@" + domain) if name else "***@" + domain


def mask_sensitive(text: str) -> str:
    """Маскирует токены бота, bearer-токены, длинные секреты и link-токены."""
    masked = _BOT_TOKEN_RE.sub("***", text)
    masked = _BEARER_RE.sub(r"\1***", masked)
    masked = _LINK_TOKEN_RE.sub(r"\1***", masked)
    masked = _LONG_TOKEN_RE.sub("***", masked)
    return masked
