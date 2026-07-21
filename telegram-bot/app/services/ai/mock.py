"""MockAIProvider — работает без ключа Gemini, отвечает по контексту поездки."""
from __future__ import annotations

from app.services.ai.base import AIProvider

FOOTER = "\n\n🤖 Демо-режим AI (MockAIProvider, без ключа Gemini)."

_KEYWORD_HINTS = [
    (("документ", "билет", "ваучер"), "Доступные документы"),
    (("план б", "plan b", "планб"), "План Б"),
    (("сообщен", "организатор"), "Сообщения организатора"),
    (("измен",), "Последние изменения"),
    (("sos", "сос"), "Ваши SOS"),
]


class MockAIProvider(AIProvider):
    name = "mock"

    async def generate(self, question: str, context_text: str,
                       history: list[tuple[str, str]]) -> str:
        if not context_text.strip():
            return ("По выбранной поездке пока нет данных, которые я могу показать." + FOOTER)
        q = question.lower()
        section = None
        for keywords, title in _KEYWORD_HINTS:
            if any(k in q for k in keywords):
                section = title
                break
        lines = [line for line in context_text.splitlines() if line.strip()]
        if section:
            picked: list[str] = []
            capture = False
            for line in lines:
                if line.startswith(section):
                    capture = True
                    picked.append(line)
                    continue
                if capture:
                    if line.startswith("- "):
                        picked.append(line)
                    else:
                        break
            if picked:
                return "\n".join(picked[:8]) + FOOTER
        return (
            "Вот что я знаю по вашей поездке:\n" + "\n".join(lines[:10]) + FOOTER
        )
