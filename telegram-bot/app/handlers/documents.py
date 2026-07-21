"""/documents — только разрешённые роли документы + временные ссылки."""
from __future__ import annotations

from aiogram import F, Router
from aiogram.filters import Command
from aiogram.types import CallbackQuery, FSInputFile, Message

from app.keyboards.inline import documents_kb, pick_trip_kb
from app.keyboards.reply import BTN_DOCUMENTS
from app.services.deep_links.service import DeepLinkService
from app.services.travel_api.base import TravelApiClient
from app.utils.active_trip import resolve_active_trip
from app.utils.formatting import document_card

router = Router(name="documents")


async def send_documents(message: Message, api: TravelApiClient, deep_links: DeepLinkService,
                         tg_id: int, trip_id: str) -> None:
    trip = await api.get_trip(tg_id, trip_id)
    docs = await api.get_documents(tg_id, trip_id)
    if not docs:
        await message.answer(f"📄 {trip.title}\nДоступных документов нет.")
        return
    cards = [document_card(d, trip.title) for d in docs[:10]]
    await message.answer(
        "\n\n".join(cards),
        reply_markup=documents_kb([(d.id, d.title) for d in docs[:10]],
                                  deep_links.documents(trip_id)),
    )


@router.message(Command("documents"))
@router.message(F.text == BTN_DOCUMENTS)
async def cmd_documents(message: Message, api: TravelApiClient,
                        deep_links: DeepLinkService) -> None:
    trip, selectable = await resolve_active_trip(api, message.from_user.id)
    if trip is None:
        if not selectable:
            await message.answer("У вас пока нет доступных поездок.")
            return
        await message.answer("Выберите поездку:", reply_markup=pick_trip_kb(selectable, "docs"))
        return
    await send_documents(message, api, deep_links, message.from_user.id, trip.id)


@router.callback_query(F.data.startswith("pick:docs:"))
async def cb_pick_docs(callback: CallbackQuery, api: TravelApiClient,
                       deep_links: DeepLinkService) -> None:
    trip_id = callback.data.split(":")[2]
    await api.select_active_trip(callback.from_user.id, trip_id)
    if callback.message:
        await send_documents(callback.message, api, deep_links, callback.from_user.id, trip_id)
    await callback.answer()


@router.callback_query(F.data.startswith("doc:get:"))
async def cb_doc_get(callback: CallbackQuery, api: TravelApiClient) -> None:
    document_id = callback.data.split(":")[2]
    download = await api.get_document_download(callback.from_user.id, document_id)
    if callback.message:
        if download.kind == "file":
            await callback.message.answer_document(
                FSInputFile(download.location, filename=download.filename),
                caption=download.title,
            )
        else:
            await callback.message.answer(
                f"🔒 Временная ссылка (действует 10 минут):\n{download.location}"
            )
    await callback.answer()
