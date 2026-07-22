"""Ошибки TravelApiClient. user_message безопасно показывается пользователю."""
from __future__ import annotations


class TravelApiError(Exception):
    code: str = "internal_error"
    default_message: str = "Сервис временно недоступен. Попробуйте позже."

    def __init__(self, user_message: str | None = None, detail: str | None = None) -> None:
        self.user_message = user_message or self.default_message
        self.detail = detail
        super().__init__(self.user_message)


class NotLinkedError(TravelApiError):
    code = "not_linked"
    default_message = "Подключите Telegram к аккаунту Тревел-помощника. Нажмите /start."


class AccessDeniedError(TravelApiError):
    code = "access_denied"
    default_message = "Недостаточно прав для этого действия."


class NotFoundError(TravelApiError):
    code = "not_found"
    default_message = "Не найдено."


class LinkTokenInvalidError(TravelApiError):
    code = "link_token_invalid"
    default_message = "Ссылка недействительна. Создайте новую в профиле на сайте."


class LinkTokenExpiredError(TravelApiError):
    code = "link_token_expired"
    default_message = "Ссылка устарела. Вернитесь на сайт и создайте новую ссылку подключения."


class LinkTokenUsedError(TravelApiError):
    code = "link_token_used"
    default_message = "Эта ссылка уже была использована. Проверьте статус подключения на сайте или создайте новую ссылку."


class LinkConflictError(TravelApiError):
    code = "link_conflict"
    default_message = "Этот аккаунт уже привязан к другому Telegram. Сначала отвяжите его на сайте."


class RateLimitedError(TravelApiError):
    code = "rate_limited"
    default_message = "Слишком много запросов. Попробуйте позже."


class ApiValidationError(TravelApiError):
    code = "validation_error"
    default_message = "Некорректные данные."


class ApiUnavailableError(TravelApiError):
    code = "internal_error"
    default_message = "Сервис временно недоступен. Попробуйте позже."


ERROR_BY_CODE: dict[str, type[TravelApiError]] = {
    cls.code: cls
    for cls in (
        NotLinkedError, AccessDeniedError, NotFoundError, LinkTokenInvalidError,
        LinkTokenExpiredError, LinkTokenUsedError, LinkConflictError, RateLimitedError,
        ApiValidationError,
    )
}


def error_from_code(code: str, message: str | None = None) -> TravelApiError:
    cls = ERROR_BY_CODE.get(code, ApiUnavailableError)
    return cls(message)
