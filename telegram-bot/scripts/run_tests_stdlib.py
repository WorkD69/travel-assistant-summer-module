"""Запуск тестов без pytest (stdlib-раннер для сред без зависимостей).

В обычной среде используйте: pytest -q
"""
from __future__ import annotations

import asyncio
import importlib
import inspect
import sys
import traceback
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

TEST_MODULES = [
    "tests.test_linking",
    "tests.test_trips",
    "tests.test_today_next",
    "tests.test_documents",
    "tests.test_sos",
    "tests.test_notifications",
    "tests.test_assistant",
    "tests.test_deep_links",
    "tests.test_security",
]


def main() -> int:
    passed = 0
    failed = 0
    for module_name in TEST_MODULES:
        try:
            module = importlib.import_module(module_name)
        except Exception:
            print(f"FAIL {module_name} (import error)")
            traceback.print_exc()
            failed += 1
            continue
        for name in dir(module):
            if not name.startswith("test_"):
                continue
            fn = getattr(module, name)
            if not callable(fn):
                continue
            try:
                if inspect.iscoroutinefunction(fn):
                    asyncio.run(fn())
                else:
                    fn()
                print(f"PASS {module_name}.{name}")
                passed += 1
            except Exception:
                print(f"FAIL {module_name}.{name}")
                traceback.print_exc()
                failed += 1
    print(f"\nИтого: {passed} passed, {failed} failed")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
