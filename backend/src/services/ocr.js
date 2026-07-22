// Офлайн OCR / извлечение текста из файлов (без внешних сервисов).
// PDF с текстовым слоем -> pdf-parse.
// PDF-скан (без текста) -> растеризация через pdfjs-dist + @napi-rs/canvas, затем tesseract.js.
// Картинки -> tesseract.js (rus+eng).
// Все тяжёлые зависимости подгружаются лениво и best-effort: если их нет,
// загрузка файла не ломается, а документ помечается «текст не найден» (можно ввести вручную).

let pdfParse = null;
let Tesseract = null;
let pdfjsLib = null;
let napiCanvas = null;

function loadPdf() {
  if (pdfParse === null) {
    try { pdfParse = require('pdf-parse'); }
    catch (e) { pdfParse = false; }
  }
  return pdfParse;
}
function loadTesseract() {
  if (Tesseract === null) {
    try { Tesseract = require('tesseract.js'); }
    catch (e) { Tesseract = false; }
  }
  return Tesseract;
}
function loadPdfjs() {
  if (pdfjsLib === null) {
    try {
      // Подкладываем глобалы из @napi-rs/canvas ДО загрузки pdfjs, чтобы pdfjs не пытался
      // подключить нативный node-canvas (его бинарный билд часто заблокирован npm).
      const c = loadCanvas();
      if (c) {
        if (!globalThis.DOMMatrix && c.DOMMatrix) globalThis.DOMMatrix = c.DOMMatrix;
        if (!globalThis.Path2D && c.Path2D) globalThis.Path2D = c.Path2D;
        if (!globalThis.ImageData && c.ImageData) globalThis.ImageData = c.ImageData;
        if (!globalThis.DOMPoint && c.DOMPoint) globalThis.DOMPoint = c.DOMPoint;
      }
      pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
    }
    catch (e) {
      try { pdfjsLib = require('pdfjs-dist'); }
      catch (e2) { pdfjsLib = false; }
    }
  }
  return pdfjsLib;
}
function loadCanvas() {
  if (napiCanvas === null) {
    try { napiCanvas = require('@napi-rs/canvas'); }
    catch (e) { napiCanvas = false; }
  }
  return napiCanvas;
}

// Растеризация PDF в PNG постранично и OCR каждой страницы (best-effort).
async function ocrPdfViaImages(buffer, maxPages) {
  const pdfjs = loadPdfjs();
  const cv = loadCanvas();
  const T = loadTesseract();
  if (!pdfjs || !cv || !T) return { text: '', reason: 'deps' };
  try {
    const data = new Uint8Array(buffer);
    const doc = await pdfjs.getDocument({
      data: data,
      disableWorker: true,
      isEvalSupported: false,
      useSystemFonts: true,
    }).promise;
    const n = Math.min(doc.numPages || 1, maxPages || 5);
    const parts = [];
    for (let i = 1; i <= n; i++) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = cv.createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport: viewport }).promise;
      const png = canvas.toBuffer('image/png');
      const res = await T.recognize(png, 'rus+eng');
      const pageText = (res && res.data && res.data.text) ? res.data.text.trim() : '';
      if (pageText) parts.push(pageText);
    }
    return { text: parts.join('\n').trim() };
  } catch (e) {
    return { text: '', reason: String((e && e.message) || e) };
  }
}

async function extractText(buffer, mimeType, filename) {
  const mt = String(mimeType || '').toLowerCase();
  const name = String(filename || '').toLowerCase();
  try {
    if (mt.indexOf('pdf') !== -1 || name.endsWith('.pdf')) {
      const pp = loadPdf();
      let text = '';
      let pages;
      if (pp) {
        const parsed = await pp(buffer);
        text = (parsed && parsed.text) ? parsed.text.trim() : '';
        pages = parsed ? parsed.numpages : undefined;
      }
      // Есть нормальный текстовый слой — используем его.
      if (text && text.length >= 20) {
        return { text: text, engine: 'pdf-parse', pages: pages };
      }
      // PDF-скан без текстового слоя — пробуем растеризацию + OCR.
      const viaImg = await ocrPdfViaImages(buffer);
      if (viaImg.text) {
        return { text: viaImg.text, engine: 'pdf-ocr', pages: pages };
      }
      const note = viaImg.reason === 'deps'
        ? 'PDF без текстового слоя; для OCR сканов нужны pdfjs-dist и @napi-rs/canvas'
        : ('PDF без текстового слоя; OCR-растеризация не удалась: ' + (viaImg.reason || ''));
      return { text: '', engine: 'none', note: note };
    }
    if (mt.indexOf('image') !== -1 || /\.(png|jpe?g|webp|bmp|gif|tiff?)$/.test(name)) {
      const T = loadTesseract();
      if (!T) return { text: '', engine: 'none', note: 'tesseract.js не установлен' };
      const res = await T.recognize(buffer, 'rus+eng');
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

module.exports = { extractText: extractText, extractFields: extractFields, buildSegment: buildSegment };
