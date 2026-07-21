"""Тесты SECURITY: rate limiter, idempotency, маскировка секретов в логах."""
from __future__ import annotations

from app.services.security.idempotency import new_idempotency_key
from app.services.security.masking import mask_sensitive
from app.services.security.rate_limiter import SlidingWindowRateLimiter


def test_rate_limiter_window_and_keys():
    rl = SlidingWindowRateLimiter(2, 60, time_func=lambda: 100.0)
    assert rl.allow("a") is True
    assert rl.allow("a") is True
    assert rl.allow("a") is False
    assert rl.allow("b") is True  # независимые ключи


def test_idempotency_keys_unique():
    keys = {new_idempotency_key() for _ in range(100)}
    assert len(keys) == 100


def test_mask_hides_bot_token():
    token = "123456789:AAABBBCCCDDDEEEFFFGGGHHHIIIJJJKK"
    masked = mask_sensitive(f"Ошибка запроса с токеном {token}")
    assert token not in masked
    assert "***" in masked


def test_mask_keeps_plain_text():
    text = "Во сколько завтра выезд из отеля?"
    assert mask_sensitive(text) == text
