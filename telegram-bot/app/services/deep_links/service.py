"""DeepLinkService — ссылки на страницы сайта. Без секретов в URL:
tripId в адресе не даёт доступа без авторизации на сайте."""
from __future__ import annotations

from typing import Optional


class DeepLinkService:
    def __init__(self, base_url: str) -> None:
        self._base = base_url.rstrip("/")

    def home(self) -> str:
        return f"{self._base}/home.html"

    def trip(self, trip_id: str) -> str:
        return f"{self._base}/trip-overview.html?tripId={trip_id}"

    def monitoring(self, trip_id: str) -> str:
        return self.trip(trip_id)

    def documents(self, trip_id: str) -> str:
        return self.trip(trip_id)

    def messages(self, trip_id: str) -> str:
        return self.trip(trip_id)

    def sos(self, trip_id: str, sos_id: str) -> str:
        return self.trip(trip_id)

    def for_target(self, target: str, trip_id: Optional[str] = None,
                   sos_id: Optional[str] = None) -> str:
        if target == "home" or not trip_id:
            return self.home()
        if target == "monitoring":
            return self.monitoring(trip_id)
        if target == "documents":
            return self.documents(trip_id)
        if target == "messages":
            return self.messages(trip_id)
        if target == "sos" and sos_id:
            return self.sos(trip_id, sos_id)
        return self.trip(trip_id)
