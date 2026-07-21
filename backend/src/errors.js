const SAFE_STATUS_CODES = new Set([400, 401, 403, 404, 409, 422, 429, 500, 503]);
const BOT_ERROR_CODES = new Set([
  'not_linked',
  'access_denied',
  'not_found',
  'link_token_invalid',
  'link_token_expired',
  'link_token_used',
  'link_conflict',
  'rate_limited',
  'validation_error',
  'internal_error',
]);

const BOT_ERROR_ALIASES = new Map([
  ['trip_not_found', 'not_found'],
  ['document_not_found', 'not_found'],
  ['sos_not_found', 'not_found'],
  ['invalid_telegram_user_id', 'validation_error'],
  ['invalid_cursor', 'validation_error'],
  ['origin_denied', 'access_denied'],
  ['service_unauthorized', 'access_denied'],
]);

function errorEnvelope(code, messageRu) {
  return {
    error: {
      code: String(code),
      message_ru: String(messageRu),
    },
  };
}

class ApiError extends Error {
  constructor(status, code, messageRu, options = {}) {
    super(String(messageRu), options);
    this.name = 'ApiError';
    this.status = SAFE_STATUS_CODES.has(status) ? status : 500;
    this.code = String(code);
    this.messageRu = String(messageRu);
  }

  toJSON() {
    return errorEnvelope(this.code, this.messageRu);
  }
}

function botErrorCode(code) {
  const value = String(code);
  if (BOT_ERROR_CODES.has(value)) return value;
  return BOT_ERROR_ALIASES.get(value) || 'internal_error';
}

module.exports = { ApiError, botErrorCode, errorEnvelope };
