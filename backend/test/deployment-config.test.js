const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const backendRoot = path.resolve(__dirname, '..');

test('production start initializes the mounted SQLite database before serving', () => {
  const packageJson = require('../package.json');
  const start = packageJson.scripts.start;

  assert.match(start, /^prisma db push --skip-generate && node src\/server\.js$/);
});

test('Railway upload exclusions cover secrets, databases, logs, and temporary files', () => {
  const ignore = fs.readFileSync(path.join(backendRoot, '.railwayignore'), 'utf8');

  for (const requiredPattern of ['.env', 'cookies.txt', '*.db', '*.log', 'tmp/', 'temp/']) {
    assert.equal(ignore.includes(requiredPattern), true, 'missing ignore pattern: ' + requiredPattern);
  }
});
