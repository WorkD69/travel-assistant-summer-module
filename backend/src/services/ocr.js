const os = require('node:os');
const path = require('node:path');

const { OEM, createWorker } = require('tesseract.js');

const { ApiError } = require('../errors');

const MAX_OCR_FILE_BYTES = 4 * 1024 * 1024;
const MAX_EXTRACTED_TEXT_BYTES = 100 * 1024;
const MAX_IMAGE_DIMENSION = 12_000;
const MAX_IMAGE_PIXELS = 20_000_000;
const IMAGE_OCR_TIMEOUT_MS = 45_000;
const SUPPORTED_OCR_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'text/plain']);

function hasPrefix(buffer, bytes) {
  return bytes.every((value, index) => buffer[index] === value);
}

function imageDimensions(buffer, mimeType) {
  if (mimeType === 'image/png') {
    if (buffer.length < 24 || buffer.subarray(12, 16).toString('ascii') !== 'IHDR') return null;
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (mimeType !== 'image/jpeg') return null;
  const sofMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;
  while (offset + 8 < buffer.length) {
    if (buffer[offset] !== 0xff) { offset += 1; continue; }
    while (buffer[offset] === 0xff) offset += 1;
    const marker = buffer[offset++];
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > buffer.length) return null;
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) return null;
    if (sofMarkers.has(marker) && length >= 7) {
      return { height: buffer.readUInt16BE(offset + 3), width: buffer.readUInt16BE(offset + 5) };
    }
    offset += length;
  }
  return null;
}

function validateDocumentFile({ buffer, mimeType, fileName }) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 1 || buffer.length > MAX_OCR_FILE_BYTES) {
    throw new ApiError(422, 'validation_error', 'Файл должен быть непустым и не превышать 4 МБ.');
  }
  const type = String(mimeType || '').toLowerCase();
  const name = String(fileName || '').toLowerCase();
  if (!SUPPORTED_OCR_MIME_TYPES.has(type)) {
    throw new ApiError(422, 'validation_error', 'Поддерживаются PDF, JPEG, PNG и TXT до 4 МБ.');
  }
  const valid = (
    (type === 'application/pdf' && name.endsWith('.pdf') && buffer.subarray(0, 5).toString('ascii') === '%PDF-') ||
    (type === 'image/png' && name.endsWith('.png') && hasPrefix(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ||
    (type === 'image/jpeg' && /\.jpe?g$/.test(name) && hasPrefix(buffer, [0xff, 0xd8, 0xff])) ||
    (type === 'text/plain' && name.endsWith('.txt') && !buffer.includes(0))
  );
  if (!valid) throw new ApiError(422, 'validation_error', 'Содержимое файла не соответствует его формату.');
  if (type === 'image/png' || type === 'image/jpeg') {
    const dimensions = imageDimensions(buffer, type);
    if (
      !dimensions || dimensions.width < 1 || dimensions.height < 1 ||
      dimensions.width > MAX_IMAGE_DIMENSION || dimensions.height > MAX_IMAGE_DIMENSION ||
      dimensions.width * dimensions.height > MAX_IMAGE_PIXELS
    ) {
      throw new ApiError(422, 'validation_error', 'Размеры изображения не поддерживаются.');
    }
  }
  return { mimeType: type, fileName: name };
}

async function parsePdfDefault(buffer) {
  const pdfParse = require('pdf-parse');
  const result = await pdfParse(buffer, { max: 5 });
  return { text: result.text || '', pages: result.numrender || Math.min(result.numpages || 0, 5) };
}

async function recognizeImageDefault(buffer) {
  const worker = await createWorker(['rus', 'eng'], OEM.LSTM_ONLY, {
    cachePath: path.join(os.tmpdir(), 'travel-assistant-tesseract'),
    logger() {},
  });
  try {
    const result = await worker.recognize(buffer);
    return result?.data?.text || '';
  } finally {
    await worker.terminate();
  }
}

function withTimeout(factory, timeoutMs, code) {
  let timer;
  return Promise.race([
    Promise.resolve().then(factory),
    new Promise((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(code)), timeoutMs);
      if (typeof timer.unref === 'function') timer.unref();
    }),
  ]).finally(() => clearTimeout(timer));
}

function validIsoDate(day, month, year) {
  const value = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() + 1 === month && parsed.getUTCDate() === day ? value : null;
}

function uniqueMatches(text, expression, mapper, limit) {
  const values = [];
  let match;
  while ((match = expression.exec(text)) && values.length < limit) {
    const value = mapper(match);
    if (value && !values.includes(value)) values.push(value);
  }
  return values;
}

function extractStructuredData(text) {
  const normalized = String(text || '').replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').slice(0, MAX_EXTRACTED_TEXT_BYTES);
  const flight = normalized.match(/(?:flight|рейс)?[^A-ZА-ЯЁ0-9]{0,8}\b([A-ZА-ЯЁ]{2})\s?(\d{2,4})\b/i);
  const route = normalized.match(/\b([A-ZА-ЯЁ][A-Za-zА-Яа-яЁё-]{2,})\s*(?:→|>|—|–)\s*([A-ZА-ЯЁ][A-Za-zА-Яа-яЁё-]{2,})\b/);
  const dates = uniqueMatches(normalized, /\b(\d{1,2})[./](\d{1,2})[./](\d{4})\b/g, function (match) {
    return validIsoDate(Number(match[1]), Number(match[2]), Number(match[3]));
  }, 8);
  const isoDates = uniqueMatches(normalized, /\b(\d{4})-(\d{2})-(\d{2})\b/g, function (match) {
    return validIsoDate(Number(match[3]), Number(match[2]), Number(match[1]));
  }, 8);
  isoDates.forEach(function (value) { if (!dates.includes(value)) dates.push(value); });
  const times = uniqueMatches(normalized, /\b([01]\d|2[0-3]):([0-5]\d)\b/g, function (match) { return `${match[1]}:${match[2]}`; }, 8);
  const lower = normalized.toLowerCase();
  let documentType = 'document';
  if (/flight|рейс|boarding|авиабилет/.test(lower)) documentType = 'flight_ticket';
  else if (/hotel|отел|check-?in/.test(lower)) documentType = 'hotel';
  else if (/transfer|трансфер/.test(lower)) documentType = 'transfer';
  else if (/train|поезд|ржд/.test(lower)) documentType = 'train_ticket';
  return {
    documentType,
    ...(flight ? { flightNumber: `${flight[1].toUpperCase()} ${flight[2]}` } : {}),
    ...(route ? { route: [route[1], route[2]] } : {}),
    ...(dates.length ? { dates: dates.slice(0, 8) } : {}),
    ...(times.length ? { times } : {}),
  };
}

async function extractDocument({ buffer, mimeType, fileName, parsePdf = parsePdfDefault, recognizeImage = recognizeImageDefault, timeoutMs = IMAGE_OCR_TIMEOUT_MS }) {
  const file = validateDocumentFile({ buffer, mimeType, fileName });
  let text = '';
  let engine;
  let pages;

  if (file.mimeType === 'text/plain') {
    text = buffer.toString('utf8');
    engine = 'text';
  } else if (file.mimeType === 'application/pdf') {
    const parsed = await parsePdf(buffer);
    text = String(parsed?.text || '');
    pages = parsed?.pages;
    engine = 'pdf-parse';
    if (!text.trim()) {
      return { status: 'manual_review', errorCode: 'scanned_pdf_unsupported', engine: 'none', text: '', data: {}, pages };
    }
  } else {
    text = await withTimeout(() => recognizeImage(buffer), Math.min(Math.max(Number(timeoutMs) || IMAGE_OCR_TIMEOUT_MS, 1000), IMAGE_OCR_TIMEOUT_MS), 'ocr_timeout');
    engine = 'tesseract';
    if (!String(text).trim()) {
      return { status: 'manual_review', errorCode: 'empty_ocr_result', engine, text: '', data: {} };
    }
  }

  const bounded = Buffer.from(String(text), 'utf8').subarray(0, MAX_EXTRACTED_TEXT_BYTES).toString('utf8').trim();
  return { status: bounded ? 'extracted' : 'manual_review', errorCode: bounded ? null : 'empty_ocr_result', engine, text: bounded, data: extractStructuredData(bounded), pages };
}

module.exports = {
  IMAGE_OCR_TIMEOUT_MS,
  MAX_EXTRACTED_TEXT_BYTES,
  MAX_IMAGE_DIMENSION,
  MAX_IMAGE_PIXELS,
  MAX_OCR_FILE_BYTES,
  SUPPORTED_OCR_MIME_TYPES,
  extractDocument,
  extractStructuredData,
  imageDimensions,
  parsePdfDefault,
  recognizeImageDefault,
  validateDocumentFile,
  withTimeout,
};
