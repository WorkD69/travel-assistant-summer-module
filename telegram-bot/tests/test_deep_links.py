"""Тесты DEEP LINKS: точные форматы URL и отсутствие секретов."""
from __future__ import annotations

from app.services.deep_links.service import DeepLinkService

BASE = "http://localhost:8011"
svc = DeepLinkService(BASE)


def test_home_link():
    assert svc.home() == BASE + "/home.html"


def test_trip_link():
    assert svc.trip("t-1") == BASE + "/trip-overview.html?tripId=t-1"


def test_legacy_targets_resolve_to_the_single_canonical_trip_route():
    assert svc.monitoring("t-1") == BASE + "/trip-overview.html?tripId=t-1"
    assert svc.documents("t-1") == BASE + "/trip-overview.html?tripId=t-1"
    assert svc.messages("t-1") == BASE + "/trip-overview.html?tripId=t-1"
    assert svc.sos("t-1", "s-9") == BASE + "/trip-overview.html?tripId=t-1"


def test_no_secrets_in_urls():
    urls = [svc.home(), svc.trip("t-1"), svc.monitoring("t-1"),
            svc.documents("t-1"), svc.messages("t-1"), svc.sos("t-1", "s-9")]
    for url in urls:
        low = url.lower()
        for bad in ("token", "secret", "jwt", "password", "selectiontoken", "proposal"):
            assert bad not in low
