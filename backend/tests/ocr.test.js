const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

const { buildSegment, extractFields, extractText } = require('../src/services/ocr');

describe('canonical teammate OCR helpers', () => {
  test('extracts plain text without an external provider', async () => {
    const result = await extractText(Buffer.from('Flight SU 2142 Moscow - Antalya'), 'text/plain', 'ticket.txt');
    assert.equal(result.engine, 'text');
    assert.match(result.text, /SU 2142/);
  });

  test('derives the original bounded trip fields and segment label', () => {
    const fields = extractFields('Flight SU 2142 Moscow - Antalya 22.07.2026');
    assert.equal(fields.flight, 'SU 2142');
    assert.deepEqual(fields.dates, ['22.07.2026']);
    assert.equal(typeof buildSegment(fields), 'string');
  });
});
