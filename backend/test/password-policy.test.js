const test = require('node:test');
const assert = require('node:assert/strict');

const policy = require('../src/services/passwordPolicy');

test('пароль короче 8 символов отклоняется', () => {
  const result = policy.evaluatePassword('short12');
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, 'too_short');
  assert.equal(result.checks.length, false);
});

test('пароль ровно из 8 символов принимается', () => {
  const result = policy.evaluatePassword('kfz8mqrt');
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.checks.length, true);
});

test('длинная парольная фраза с пробелами и Unicode принимается', () => {
  const phrase = 'жёлтый чемодан едет в Барселону через Лиссабон';
  const result = policy.evaluatePassword(phrase);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.level, 'strong');
});

test('пароль длиной 128 символов принимается, 129 — нет', () => {
  const base = 'aй9-Zq7 ';
  const long = base.repeat(64).slice(0, 128);
  assert.equal(long.length, 128);
  assert.equal(policy.evaluatePassword(long).ok, true);

  const tooLong = long + 'x';
  const result = policy.evaluatePassword(tooLong);
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, 'too_long');
});

test('распространённые пароли отклоняются', () => {
  for (const value of ['password', 'qwerty12', '12345678', 'йцукенг1']) {
    const result = policy.evaluatePassword(value);
    assert.equal(result.ok, false, value + ' должен быть отклонён');
    assert.equal(result.errors[0].code, 'too_common');
  }
});

test('пароль не может совпадать с email, именем или названием сервиса', () => {
  const byEmail = policy.evaluatePassword('artem2006', {
    email: 'artem2006@example.com',
  });
  assert.equal(byEmail.ok, false);
  assert.equal(byEmail.errors[0].code, 'too_similar');

  const byName = policy.evaluatePassword('ivanpetrov', { name: 'Иван Petrov' });
  assert.equal(byName.ok, false);
  assert.equal(byName.errors[0].code, 'too_similar');

  const byService = policy.evaluatePassword('travelassistant');
  assert.equal(byService.ok, false);
  assert.ok(['too_similar', 'too_common'].includes(byService.errors[0].code));
});

test('заглавные, цифры и спецсимволы не являются обязательными по отдельности', () => {
  assert.equal(policy.evaluatePassword('пешеходныйквартал').ok, true);
  assert.equal(policy.evaluatePassword('lowercaseonlyphrase').ok, true);
  assert.equal(policy.evaluatePassword('9184736255').ok, true);
});

test('оценка надёжности повышается от разнообразия символов', () => {
  const weak = policy.evaluatePassword('kfz8mqrt');
  const strong = policy.evaluatePassword('Kfz8-mqrt Полёт!');
  assert.ok(strong.score > weak.score);
  assert.equal(strong.label, 'Надёжный');
  assert.ok(['Слабый', 'Средний', 'Надёжный'].includes(weak.label));
});

test('email нормализуется: обрезка пробелов и нижний регистр', () => {
  const result = policy.normalizeEmail('   Test.User@Example.COM  ');
  assert.equal(result.ok, true);
  assert.equal(result.value, 'test.user@example.com');
});

test('некорректный и слишком длинный email отклоняется понятной ошибкой', () => {
  const invalid = policy.normalizeEmail('not-an-email');
  assert.equal(invalid.ok, false);
  assert.equal(invalid.error.code, 'invalid');
  assert.match(invalid.error.message, /[А-Яа-яЁё]/);

  const long = policy.normalizeEmail('a'.repeat(250) + '@example.com');
  assert.equal(long.ok, false);
  assert.equal(long.error.code, 'too_long');

  const empty = policy.normalizeEmail('   ');
  assert.equal(empty.ok, false);
  assert.equal(empty.error.code, 'required');
});

test('имя нормализуется и не может быть пустым', () => {
  const ok = policy.normalizeName('  Иван   Петров  ');
  assert.equal(ok.ok, true);
  assert.equal(ok.value, 'Иван Петров');

  const empty = policy.normalizeName('   ');
  assert.equal(empty.ok, false);
  assert.equal(empty.error.code, 'required');
});

test('сообщения об ошибках на русском и не содержат внутренних подробностей', () => {
  const result = policy.evaluatePassword('123');
  for (const item of result.errors) {
    assert.match(item.message, /[А-Яа-яЁё]/);
    assert.doesNotMatch(item.message, /Error|stack|at .*\.js/i);
  }
});
