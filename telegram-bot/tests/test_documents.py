"""Тесты DOCUMENTS: видимость по ролям и временные ссылки."""
from __future__ import annotations

from pathlib import Path

from app.schemas.models import DocumentDownload
from app.services.travel_api.errors import AccessDeniedError
from tests.helpers import ANNA_TG, ARTEM_TG, expect, link_both, make_env


async def test_anna_sees_shared_and_personal_docs():
    env = make_env()
    await link_both(env.api)
    ids = {d.id for d in await env.api.get_documents(ANNA_TG, "t-turkey")}
    assert {"d-tickets", "d-hotel", "d-anna-passport"} <= ids


async def test_anna_does_not_see_closed_foreign_revoked():
    env = make_env()
    await link_both(env.api)
    ids = {d.id for d in await env.api.get_documents(ANNA_TG, "t-turkey")}
    assert not ({"d-insurance-list", "d-artem-passport", "d-revoked"} & ids)


async def test_organizer_sees_closed_but_not_foreign_personal():
    env = make_env()
    await link_both(env.api)
    ids = {d.id for d in await env.api.get_documents(ARTEM_TG, "t-turkey")}
    assert "d-insurance-list" in ids and "d-anna-passport" not in ids


async def test_mock_document_is_a_real_local_pdf():
    env = make_env()
    await link_both(env.api)
    download = await env.api.get_document_download(ANNA_TG, "d-tickets")

    assert isinstance(download, DocumentDownload)
    assert download.kind == "file"
    assert download.filename == "demo-itinerary.pdf"
    assert download.title == "Авиабилеты туда-обратно"
    path = Path(download.location)
    assert path.is_file()
    content = path.read_bytes()
    assert content.startswith(b"%PDF-")
    assert content.rstrip().endswith(b"%%EOF")


async def test_closed_document_link_denied():
    env = make_env()
    await link_both(env.api)
    await expect(AccessDeniedError,
                 env.api.get_document_download(ANNA_TG, "d-insurance-list"))
