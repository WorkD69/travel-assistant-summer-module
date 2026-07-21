"""Простой rate limiter со скользящим окном (в памяти процесса бота)."""
from __future__ import annotations

import time
from collections import defaultdict, deque


class SlidingWindowRateLimiter:
    def __init__(self, max_calls: int, window_seconds: float,
                 time_func=time.monotonic) -> None:
        self._max_calls = max_calls
        self._window = window_seconds
        self._time = time_func
        self._calls: dict[str, deque[float]] = defaultdict(deque)

    def allow(self, key: str) -> bool:
        now = self._time()
        calls = self._calls[key]
        while calls and now - calls[0] > self._window:
            calls.popleft()
        if len(calls) >= self._max_calls:
            return False
        calls.append(now)
        return True

    def reset(self, key: str | None = None) -> None:
        if key is None:
            self._calls.clear()
        else:
            self._calls.pop(key, None)
