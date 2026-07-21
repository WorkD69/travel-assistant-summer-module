const { ApiError } = require('./errors');

function encodeCursor(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function decodeCursor(cursor) {
  if (typeof cursor !== 'string' || cursor.length === 0 || cursor.length > 2048) {
    throw new ApiError(400, 'invalid_cursor', 'Некорректный курсор пагинации');
  }

  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    const value = JSON.parse(decoded);
    if (value === null || (typeof value !== 'object' && typeof value !== 'string')) {
      throw new Error('unsupported cursor payload');
    }
    return value;
  } catch {
    throw new ApiError(400, 'invalid_cursor', 'Некорректный курсор пагинации');
  }
}

function pageResult(rows, limit, cursorValue) {
  const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 20;
  const hasNext = rows.length > safeLimit;
  const items = rows.slice(0, safeLimit);
  const last = items.at(-1);
  return {
    items,
    next_cursor: hasNext && last ? encodeCursor(cursorValue(last)) : null,
  };
}

module.exports = { decodeCursor, encodeCursor, pageResult };
