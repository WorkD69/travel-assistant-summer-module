const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { extractText, tesseractOptions, withTimeout } = require('../src/services/ocr');

const TEXT_LAYER_PDF = Buffer.from(
  'JVBERi0xLjMKJZOMi54gUmVwb3J0TGFiIEdlbmVyYXRlZCBQREYgZG9jdW1lbnQgKG9wZW5zb3VyY2UpCjEgMCBvYmoKPDwKL0YxIDIgMCBSIC9GMiAzIDAgUgo+PgplbmRvYmoKMiAwIG9iago8PAovQmFzZUZvbnQgL0hlbHZldGljYSAvRW5jb2RpbmcgL1dpbkFuc2lFbmNvZGluZyAvTmFtZSAvRjEgL1N1YnR5cGUgL1R5cGUxIC9UeXBlIC9Gb250Cj4+CmVuZG9iagozIDAgb2JqCjw8Ci9CYXNlRm9udCAvSGVsdmV0aWNhLUJvbGQgL0VuY29kaW5nIC9XaW5BbnNpRW5jb2RpbmcgL05hbWUgL0YyIC9TdWJ0eXBlIC9UeXBlMSAvVHlwZSAvRm9udAo+PgplbmRvYmoKNCAwIG9iago8PAovQ29udGVudHMgOCAwIFIgL01lZGlhQm94IFsgMCAwIDU5NS4yNzU2IDg0MS44ODk4IF0gL1BhcmVudCA3IDAgUiAvUmVzb3VyY2VzIDw8Ci9Gb250IDEgMCBSIC9Qcm9jU2V0IFsgL1BERiAvVGV4dCAvSW1hZ2VCIC9JbWFnZUMgL0ltYWdlSSBdCj4+IC9Sb3RhdGUgMCAvVHJhbnMgPDwKCj4+IAogIC9UeXBlIC9QYWdlCj4+CmVuZG9iago1IDAgb2JqCjw8Ci9QYWdlTW9kZSAvVXNlTm9uZSAvUGFnZXMgNyAwIFIgL1R5cGUgL0NhdGFsb2cKPj4KZW5kb2JqCjYgMCBvYmoKPDwKL0F1dGhvciAoYW5vbnltb3VzKSAvQ3JlYXRpb25EYXRlIChEOjIwMjYwNzIyMTg0MDM1KzAzJzAwJykgL0NyZWF0b3IgKGFub255bW91cykgL0tleXdvcmRzICgpIC9Nb2REYXRlIChEOjIwMjYwNzIyMTg0MDM1KzAzJzAwJykgL1Byb2R1Y2VyIChSZXBvcnRMYWIgUERGIExpYnJhcnkgLSBcKG9wZW5zb3VyY2VcKSkgCiAgL1N1YmplY3QgKHVuc3BlY2lmaWVkKSAvVGl0bGUgKHVudGl0bGVkKSAvVHJhcHBlZCAvRmFsc2UKPj4KZW5kb2JqCjcgMCBvYmoKPDwKL0NvdW50IDEgL0tpZHMgWyA0IDAgUiBdIC9UeXBlIC9QYWdlcwo+PgplbmRvYmoKOCAwIG9iago8PAovRmlsdGVyIFsgL0FTQ0lJODVEZWNvZGUgL0ZsYXRlRGVjb2RlIF0gL0xlbmd0aCAzMzQKPj4Kc3RyZWFtCkdhc0pMOkoxZEUmQjQsOidecXRlZScpV2tjMGQwbEJlQTAvYiVBKjFaZmpdUiNKXjtUMWwwWEcuIk8mXG82dFc3JjlOQSNybDVbay5wL2taYC9uVm47JFBHbGIsazRRPmwqZT5xdCxHWT9LbT11Qz9xK24zX3U4Yi0iQXBRNE5TMkA/MStHOzI3bVlGJGZwRmBTLi8xSWJmVy9jZysoRm8oW3NDWCZtTTBsOjYoKjgoYnMnWzhCXXM4KFNSMkIqUShzRm1rZSswbmpFWWltXkFUSEMhVVM/OEo7bDliKyZCX1crbzxrW09SNTkzOkIzUUBHOlZsbnFVN0lXbTlVdTliTHUvL0wyW1pDMDQ3LmZMbF8mJiVJWzEpWiVmKG8uTGNqLCttT0dnXnBSW2ItNUZvVC1PME9LLkMhQmtRWXMkODJKS0ghUGApWFc7fj5lbmRzdHJlYW0KZW5kb2JqCnhyZWYKMCA5CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDA2MSAwMDAwMCBuIAowMDAwMDAwMTAyIDAwMDAwIG4gCjAwMDAwMDAyMDkgMDAwMDAgbiAKMDAwMDAwMDMyMSAwMDAwMCBuIAowMDAwMDAwNTI0IDAwMDAwIG4gCjAwMDAwMDA1OTIgMDAwMDAgbiAKMDAwMDAwMDg1MyAwMDAwMCBuIAowMDAwMDAwOTEyIDAwMDAwIG4gCnRyYWlsZXIKPDwKL0lEIApbPDgxYjBlYTEyNWVjZjYzZDQyZTQzMWM0ODk4MzFjNzdmPjw4MWIwZWExMjVlY2Y2M2Q0MmU0MzFjNDg5ODMxYzc3Zj5dCiUgUmVwb3J0TGFiIGdlbmVyYXRlZCBQREYgZG9jdW1lbnQgLS0gZGlnZXN0IChvcGVuc291cmNlKQoKL0luZm8gNiAwIFIKL1Jvb3QgNSAwIFIKL1NpemUgOQo+PgpzdGFydHhyZWYKMTMzNgolJUVPRgo=',
  'base64',
);

test('tesseract uses the packaged uncompressed rus and eng language data', () => {
  const options = tesseractOptions();

  assert.equal(options.gzip, false);
  assert.equal(path.isAbsolute(options.langPath), true);
  assert.equal(fs.existsSync(path.join(options.langPath, 'rus.traineddata')), true);
  assert.equal(fs.existsSync(path.join(options.langPath, 'eng.traineddata')), true);
});

test('OCR work is rejected with a stable timeout error', async () => {
  await assert.rejects(
    withTimeout(new Promise(() => {}), 15),
    (error) => error && error.code === 'OCR_TIMEOUT' && /OCR timeout/.test(error.message),
  );
});

test('PDF text extraction falls back when pdf-parse rejects a valid text-layer PDF', async () => {
  const result = await extractText(TEXT_LAYER_PDF, 'application/pdf', 'ticket.pdf');

  assert.equal(result.engine, 'pdfjs-text');
  assert.match(result.text, /TRAVEL E2E TICKET 2026/);
});
