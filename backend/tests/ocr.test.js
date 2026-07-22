const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, test } = require('node:test');

const {
  MAX_OCR_FILE_BYTES,
  extractDocument,
  extractStructuredData,
  validateDocumentFile,
} = require('../src/services/ocr');

function textPdf(text) {
  const safe = String(text).replace(/([()\\])/g, '\\$1');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(`BT /F1 12 Tf 72 720 Td (${safe}) Tj ET`)} >>\nstream\nBT /F1 12 Tf 72 720 Td (${safe}) Tj ET\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let output = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach(function (body, index) {
    offsets.push(Buffer.byteLength(output));
    output += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(output);
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach(function (offset) { output += `${String(offset).padStart(10, '0')} 00000 n \n`; });
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(output);
}

function pngHeader(width, height) {
  const buffer = Buffer.alloc(32);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0);
  buffer.writeUInt32BE(13, 8);
  buffer.write('IHDR', 12, 'ascii');
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

describe('bounded document OCR', () => {
  test('keeps text PDF extraction independent of native canvas binaries', () => {
    const lock = fs.readFileSync(path.join(__dirname, '..', 'package-lock.json'), 'utf8');
    assert.doesNotMatch(lock, /node_modules\/@napi-rs\/canvas/);
  });

  test('extracts at most five pages from a real text-layer PDF', async () => {
    const fixture = fs.readFileSync(path.join(__dirname, '..', 'node_modules', 'pdf-parse', 'test', 'data', '04-valid.pdf'));
    const result = await extractDocument({
      buffer: fixture,
      mimeType: 'application/pdf',
      fileName: 'ticket.pdf',
    });
    assert.equal(result.engine, 'pdf-parse');
    assert.match(result.text, /Acute effect of speed exercise/);
    assert.equal(result.pages, 5);
  });

  test('uses bounded image OCR through an injected recognizer', async () => {
    const png = pngHeader(1200, 800);
    const result = await extractDocument({
      buffer: png,
      mimeType: 'image/png',
      fileName: 'boarding-pass.png',
      recognizeImage: async () => 'Flight TK 411 Moscow > Antalya 23.07.2026 09:10',
    });
    assert.equal(result.engine, 'tesseract');
    assert.equal(result.data.flightNumber, 'TK 411');
    assert.deepEqual(result.data.route, ['Moscow', 'Antalya']);
  });

  test('marks scanned PDFs for explicit manual review instead of pretending OCR succeeded', async () => {
    const result = await extractDocument({
      buffer: textPdf(' '), mimeType: 'application/pdf', fileName: 'scan.pdf',
      parsePdf: async () => ({ text: '', pages: 1 }),
    });
    assert.equal(result.status, 'manual_review');
    assert.equal(result.errorCode, 'scanned_pdf_unsupported');
  });

  test('rejects invalid signatures, unsupported formats, and oversized files', () => {
    assert.throws(
      () => validateDocumentFile({ buffer: Buffer.from('not png'), mimeType: 'image/png', fileName: 'fake.png' }),
      (error) => error.code === 'validation_error',
    );
    assert.throws(
      () => validateDocumentFile({ buffer: Buffer.from('MZ'), mimeType: 'application/octet-stream', fileName: 'file.exe' }),
      (error) => error.code === 'validation_error',
    );
    assert.throws(
      () => validateDocumentFile({ buffer: Buffer.alloc(MAX_OCR_FILE_BYTES + 1), mimeType: 'text/plain', fileName: 'large.txt' }),
      (error) => error.code === 'validation_error',
    );
    assert.throws(
      () => validateDocumentFile({ buffer: pngHeader(20_000, 20_000), mimeType: 'image/png', fileName: 'huge.png' }),
      (error) => error.code === 'validation_error',
    );
  });

  test('extracts only bounded non-secret travel metadata', () => {
    const data = extractStructuredData('Flight SU 2142 Moscow > Antalya 22.07.2026 14:20 18:40 john@example.test');
    assert.deepEqual(data.route, ['Moscow', 'Antalya']);
    assert.deepEqual(data.times, ['14:20', '18:40']);
    assert.equal(data.flightNumber, 'SU 2142');
    assert.doesNotMatch(JSON.stringify(data), /john@example\.test/);
  });
});
