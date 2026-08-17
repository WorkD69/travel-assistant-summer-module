// Офлайн OCR / извлечение текста из файлов (без внешних сервисов).
// PDF parsing/OCR is intentionally unavailable server-side in this deployment.
// Image OCR -> tesseract.js (rus+eng).
// Картинки -> tesseract.js (rus+eng).
// Все тяжёлые зависимости подгружаются лениво и best-effort: если их нет,
// загрузка файла не ломается, а документ помечается «текст не найден» (можно ввести вручную).

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_OCR_TIMEOUT_MS = 45000;

let Tesseract = null;

function tesseractOptions() {
  const langPath = path.resolve(__dirname, '../..');
  for (const language of ['rus', 'eng']) {
    const languageFile = path.join(langPath, language + '.traineddata');
    if (!fs.existsSync(languageFile)) {
      const error = new Error('Missing packaged OCR language data: ' + language + '.traineddata');
      error.code = 'OCR_LANGUAGE_DATA_MISSING';
      throw error;
    }
  }
  return { langPath: langPath, gzip: false };
}

function ocrTimeoutMs() {
  const configured = Number(process.env.OCR_TIMEOUT_MS || DEFAULT_OCR_TIMEOUT_MS);
  return Number.isFinite(configured) && configured >= 1000
    ? Math.floor(configured)
    : DEFAULT_OCR_TIMEOUT_MS;
}

function withTimeout(promise, timeoutMs) {
  const delay = Number.isFinite(Number(timeoutMs)) ? Number(timeoutMs) : ocrTimeoutMs();
  let timer;
  const timeout = new Promise(function (_, reject) {
    timer = setTimeout(function () {
      const error = new Error('OCR timeout after ' + delay + ' ms');
      error.code = 'OCR_TIMEOUT';
      reject(error);
    }, delay);
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(function () {
    clearTimeout(timer);
  });
}

function loadTesseract() {
  if (Tesseract === null) {
    try { Tesseract = require('tesseract.js'); }
    catch (e) { Tesseract = false; }
  }
  return Tesseract;
}
async function extractText(buffer, mimeType, filename) {
  const mt = String(mimeType || '').toLowerCase();
  const name = String(filename || '').toLowerCase();
  try {
    if (mt.indexOf('pdf') !== -1 || name.endsWith('.pdf')) {
      return {
        text: '',
        engine: 'unavailable',
        note: 'Server-side PDF OCR is disabled for this deployment.',
      };
    }
    if (mt.indexOf('image') !== -1 || /\.(png|jpe?g|webp|bmp|gif|tiff?)$/.test(name)) {
      const T = loadTesseract();
      if (!T) return { text: '', engine: 'none', note: 'tesseract.js не установлен' };
      const res = await withTimeout(
        T.recognize(buffer, 'rus+eng', tesseractOptions()),
        ocrTimeoutMs(),
      );
      const text = (res && res.data && res.data.text) ? res.data.text.trim() : '';
      return { text: text, engine: 'tesseract' };
    }
    if (mt.indexOf('text') !== -1 || name.endsWith('.txt') || name.endsWith('.csv')) {
      return { text: buffer.toString('utf8').trim(), engine: 'text' };
    }
  } catch (e) {
    return { text: '', engine: 'error', note: String((e && e.message) || e) };
  }
  return { text: '', engine: 'unsupported' };
}

// Сокращённые русские месяцы (первые 3 буквы) -> номер.
const RU_MONTHS = { 'янв': 1, 'фев': 2, 'мар': 3, 'апр': 4, 'май': 5, 'мая': 5, 'июн': 6, 'июл': 7, 'авг': 8, 'сен': 9, 'окт': 10, 'ноя': 11, 'дек': 12 };

function pad2(n) { return (n < 10 ? '0' : '') + n; }
function plausibleYear(y) { const now = new Date().getFullYear(); return y >= now - 1 && y <= now + 3; }

// Эвристическое извлечение сущностей из текста (офлайн).
// Цель — повысить точность: отсеиваем шум (даты из правил тарифа и т.п.),
// нормализуем даты, ищем номер рейса рядом с ключевым словом.
function extractFields(text) {
  const fields = {};
  if (!text) return fields;
  const t = String(text).replace(/[\u00a0]/g, ' ').replace(/\s+/g, ' ');
  const low = t.toLowerCase();

  if (/(boarding|посадочн|авиабилет|air ?ticket|маршрут следован|перевозчик|номер рейса|flight|airline|aeroflot|аэрофлот)/.test(low)) fields.type = 'Авиабилет';
  else if (/(электронный билет.*поезд|поезд|вагон| жд |ржд|railway|train)/.test(low)) fields.type = 'ЖД-билет';
  else if (/(отел|hotel|бронирование номер|заселен|check-?in|номер в отел)/.test(low)) fields.type = 'Отель';
  else if (/(трансфер|transfer)/.test(low)) fields.type = 'Трансфер';
  else if (/(страхов|insurance|полис)/.test(low)) fields.type = 'Страховка';
  else if (/(виз[аы]\b|visa)/.test(low)) fields.type = 'Виза';

  // Даты: собираем из разных форматов, нормализуем, оставляем только правдоподобные годы.
  const found = [];
  let m;
  const reNum = /\b(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})\b/g;
  while ((m = reNum.exec(t))) { const d = +m[1], mo = +m[2], y = +m[3]; if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && plausibleYear(y)) found.push({ key: y + '-' + pad2(mo) + '-' + pad2(d), disp: pad2(d) + '.' + pad2(mo) + '.' + y }); }
  const reIso = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
  while ((m = reIso.exec(t))) { const y = +m[1], mo = +m[2], d = +m[3]; if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && plausibleYear(y)) found.push({ key: y + '-' + pad2(mo) + '-' + pad2(d), disp: pad2(d) + '.' + pad2(mo) + '.' + y }); }
  const reRu = /\b(\d{1,2})\s*([а-яё]{3,})\.?\s*(\d{4})\b/gi;
  while ((m = reRu.exec(t))) { const d = +m[1], mon = RU_MONTHS[m[2].slice(0, 3).toLowerCase()], y = +m[3]; if (mon && d >= 1 && d <= 31 && plausibleYear(y)) found.push({ key: y + '-' + pad2(mon) + '-' + pad2(d), disp: pad2(d) + '.' + pad2(mon) + '.' + y }); }
  if (found.length) {
    found.sort(function (a, b) { return a.key < b.key ? -1 : (a.key > b.key ? 1 : 0); });
    const seen = {}, uniq = [];
    found.forEach(function (f) { if (!seen[f.key]) { seen[f.key] = 1; uniq.push(f.disp); } });
    fields.dates = uniq.slice(0, 4);
  }

  // Номер рейса: сначала рядом с ключевым словом, иначе общий паттерн латиницей.
  let fn = t.match(/(?:рейс|flight)[^A-ZА-Я0-9]{0,6}([A-ZА-Я]{2}\s?\d{2,4})/i);
  if (!fn) fn = t.match(/\b([A-Z]{2}\s?\d{3,4})\b/);
  if (fn) fields.flight = fn[1].toUpperCase().replace(/([A-ZА-Я]{2})\s?(\d+)/, '$1 $2').trim();

  // Маршрут (города через стрелку/тире).
  const route = t.match(/([А-ЯЁ][а-яёА-ЯЁ\-]+)\s*(?:→|—|–|>|-)\s*([А-ЯЁ][а-яёА-ЯЁ\-]+)/);
  if (route) fields.route = route[1] + ' → ' + route[2];

  const emails = t.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g);
  if (emails) { const es = {}; fields.emails = emails.map(function (e) { return e.toLowerCase(); }).filter(function (e) { if (es[e]) return false; es[e] = 1; return true; }).slice(0, 3); }

  return fields;
}

function buildSegment(fields) {
  if (!fields) return null;
  const head = fields.type || '';
  if (fields.dates && fields.dates.length) {
    const d = fields.dates.length > 1 ? (fields.dates[0] + ' – ' + fields.dates[fields.dates.length - 1]) : fields.dates[0];
    return (head ? head + ' · ' : '') + d;
  }
  if (fields.route) return (head ? head + ' · ' : '') + fields.route;
  return head || null;
}

module.exports = {
  extractText: extractText,
  extractFields: extractFields,
  buildSegment: buildSegment,
  tesseractOptions: tesseractOptions,
  withTimeout: withTimeout,
};
