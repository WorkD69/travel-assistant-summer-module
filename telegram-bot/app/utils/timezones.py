"""Cross-platform timezone helpers with a safe UTC fallback."""
from __future__ import annotations

from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


def safe_zoneinfo(name: str | None) -> ZoneInfo:
    try:
        return ZoneInfo(name or "UTC")
    except (ZoneInfoNotFoundError, ValueError, TypeError):
        return ZoneInfo("UTC")
