"""Тесты привязки/отвязки Telegram (раздел START)."""
from __future__ import annotations

from app.services.travel_api.errors import (
    LinkTokenExpiredError, LinkTokenInvalidError, LinkTokenUsedError, NotLinkedError,
)
from tests.helpers import ARTEM_TG, expect, make_env


async def test_unlinked_user_gets_not_linked():
    env = make_env()
    await expect(NotLinkedError, env.api.get_trips(ARTEM_TG))


async def test_valid_token_links_account():
    env = make_env()
    result = await env.api.consume_link_token(ARTEM_TG, "demo-artem")
    assert result.name == "Артём"
    me = await env.api.get_me(ARTEM_TG)
    assert me.name == "Артём"


async def test_expired_token_rejected():
    env = make_env()
    await expect(LinkTokenExpiredError,
                 env.api.consume_link_token(ARTEM_TG, "demo-expired"))


async def test_used_token_rejected():
    env = make_env()
    await expect(LinkTokenUsedError,
                 env.api.consume_link_token(ARTEM_TG, "demo-used"))


async def test_invalid_token_rejected():
    env = make_env()
    await expect(LinkTokenInvalidError,
                 env.api.consume_link_token(ARTEM_TG, "no-such-token"))


async def test_token_is_one_time():
    env = make_env()
    await env.api.consume_link_token(ARTEM_TG, "demo-artem")
    await expect(LinkTokenUsedError,
                 env.api.consume_link_token(333, "demo-artem"))


async def test_unlink_disconnects():
    env = make_env()
    await env.api.consume_link_token(ARTEM_TG, "demo-artem")
    await env.api.unlink(ARTEM_TG)
    await expect(NotLinkedError, env.api.get_trips(ARTEM_TG))
