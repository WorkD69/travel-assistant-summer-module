'use strict';

// Единая политика паролей и нормализации email.
// Логика продублирована в frontend/assets/js/password-policy.js
// (браузерная сборка без бандлера), паритет проверяется тестами.

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;
const EMAIL_MAX_LENGTH = 254;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SERVICE_TERMS = [
  'travel',
  'travelassistant',
  'travelhelper',
  'assistant',
  'тревел',
  'тревелпомощник',
  'помощник',
];

// Короткий список очевидных паролей. Не претендует на полноту:
// цель — отсечь самые распространённые варианты, а не имитировать HIBP.
const COMMON_PASSWORDS = [
  '12345678', '123456789', '1234567890', '123456', '1234567', '11111111',
  '00000000', '87654321', '12341234', '12121212', 'password', 'password1',
  'password123', 'passw0rd', 'p@ssword', 'p@ssw0rd', 'qwerty', 'qwerty123',
  'qwertyui', 'qwerty12', 'qwertyuiop', 'asdfghjk', 'zxcvbnm', 'iloveyou',
  'letmein', 'welcome', 'welcome1', 'admin', 'admin123', 'administrator',
  'abc12345', 'abcd1234', 'football', 'baseball', 'superman', 'starwars',
  'dragon', 'monkey', 'sunshine', 'princess', 'trustno1', 'master',
  'freedom', 'whatever', 'computer', 'internet', 'samsung', 'google',
  'facebook', 'qazwsxedc', '1q2w3e4r', '1qaz2wsx', 'q1w2e3r4', 'zaq12wsx',
  'йцукен', 'йцукенг', 'йцукенгш', 'пароль', 'пароль123', 'парольпароль',
  'привет', 'привет123', 'россия', 'москва', 'любовь', 'солнышко',
  'наташа', 'сергей', 'андрей', 'алексей',
];

const COMMON_SET = new Set(COMMON_PASSWORDS);

function foldPassword(value) {
  return String(value == null ? '' : value)
    .toLowerCase()
    .replace(/\s+/g, '');
}

function leetFold(value) {
  return foldPassword(value)
    .replace(/[@]/g, 'a')
    .replace(/[0]/g, 'o')
    .replace(/[1!|]/g, 'l')
    .replace(/[3]/g, 'e')
    .replace(/[5$]/g, 's')
    .replace(/[7]/g, 't')
    .replace(/[^a-zа-яё]/g, '');
}

function isCommonPassword(password) {
  const folded = foldPassword(password);
  if (!folded) return false;
  if (COMMON_SET.has(folded)) return true;
  const stripped = folded.replace(/[^a-zа-яё0-9]/g, '').replace(/\d+$/, '');
  if (stripped.length >= 5 && COMMON_SET.has(stripped)) return true;
  const leet = leetFold(password);
  if (leet.length >= 5 && COMMON_SET.has(leet)) return true;
  if (/^(.)\1+$/.test(folded)) return true;
  return false;
}

function identityTokens(identity) {
  const source = identity || {};
  const raw = [];
  if (source.email) {
    const email = String(source.email).trim().toLowerCase();
    raw.push(email);
    const local = email.split('@')[0];
    if (local) raw.push(local);
  }
  if (source.name) {
    const name = String(source.name).trim().toLowerCase();
    raw.push(name);
    name.split(/[\s._-]+/).forEach((part) => raw.push(part));
  }
  SERVICE_TERMS.forEach((term) => raw.push(term));
  return raw
    .map((token) => foldPassword(token))
    .filter((token) => token.length >= 4);
}

function isSimilarToIdentity(password, identity) {
  const folded = foldPassword(password);
  if (!folded) return false;
  const strippedDigits = folded.replace(/\d+$/, '');
  return identityTokens(identity).some((token) => {
    if (folded === token) return true;
    if (strippedDigits.length >= 4 && strippedDigits === token) return true;
    if (token.length >= 5 && folded.includes(token)) return true;
    return false;
  });
}

// Классы символов влияют на оценку, но не являются отдельными требованиями.
function scorePassword(password) {
  const value = String(password == null ? '' : password);
  if (!value) return { score: 0, level: 'weak', label: 'Слабый' };
  let score = 0;
  if (value.length >= 8) score += 1;
  if (value.length >= 12) score += 1;
  if (value.length >= 16) score += 1;
  const classes = [
    /[a-zа-яё]/.test(value),
    /[A-ZА-ЯЁ]/.test(value),
    /\d/.test(value),
    /[^\p{L}\p{N}]/u.test(value),
  ].filter(Boolean).length;
  if (classes >= 2) score += 1;
  if (classes >= 3) score += 1;
  const unique = new Set(value.toLowerCase().split('')).size;
  if (unique >= 8) score += 1;
  if (isCommonPassword(value) || value.length < 8) score = Math.min(score, 1);
  let level = 'weak';
  if (score >= 5) level = 'strong';
  else if (score >= 3) level = 'medium';
  const label =
    level === 'strong' ? 'Надёжный' : level === 'medium' ? 'Средний' : 'Слабый';
  return { score, level, label };
}

function evaluatePassword(password, identity) {
  const value = String(password == null ? '' : password);
  const errors = [];
  const checks = {
    length:
      value.length >= PASSWORD_MIN_LENGTH && value.length <= PASSWORD_MAX_LENGTH,
    notCommon: !isCommonPassword(value),
    notSimilar: !isSimilarToIdentity(value, identity),
  };
  if (value.length < PASSWORD_MIN_LENGTH) {
    errors.push({
      field: 'password',
      code: 'too_short',
      message: 'Пароль должен содержать не менее 8 символов',
    });
  } else if (value.length > PASSWORD_MAX_LENGTH) {
    errors.push({
      field: 'password',
      code: 'too_long',
      message: 'Пароль не должен быть длиннее 128 символов',
    });
  }
  if (!checks.notCommon) {
    errors.push({
      field: 'password',
      code: 'too_common',
      message: 'Этот пароль слишком распространённый. Выберите другой',
    });
  }
  if (!checks.notSimilar) {
    errors.push({
      field: 'password',
      code: 'too_similar',
      message: 'Пароль не должен совпадать с email, именем или названием сервиса',
    });
  }
  const strength = scorePassword(value);
  return {
    ok: errors.length === 0,
    errors,
    checks,
    score: strength.score,
    level: strength.level,
    label: strength.label,
  };
}

function normalizeEmail(email) {
  const raw = String(email == null ? '' : email)
    .replace(/\s+/g, '')
    .toLowerCase();
  if (!raw) {
    return {
      ok: false,
      value: '',
      error: { field: 'email', code: 'required', message: 'Укажите e-mail' },
    };
  }
  if (raw.length > EMAIL_MAX_LENGTH) {
    return {
      ok: false,
      value: raw,
      error: { field: 'email', code: 'too_long', message: 'E-mail слишком длинный' },
    };
  }
  if (!EMAIL_PATTERN.test(raw)) {
    return {
      ok: false,
      value: raw,
      error: { field: 'email', code: 'invalid', message: 'Введите корректный e-mail' },
    };
  }
  return { ok: true, value: raw, error: null };
}

function normalizeName(name) {
  const value = String(name == null ? '' : name)
    .replace(/\s+/g, ' ')
    .trim();
  if (!value) {
    return {
      ok: false,
      value: '',
      error: { field: 'name', code: 'required', message: 'Укажите имя' },
    };
  }
  if (value.length > 100) {
    return {
      ok: false,
      value,
      error: { field: 'name', code: 'too_long', message: 'Имя слишком длинное' },
    };
  }
  return { ok: true, value, error: null };
}

module.exports = {
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  EMAIL_MAX_LENGTH,
  EMAIL_PATTERN,
  COMMON_PASSWORDS,
  SERVICE_TERMS,
  isCommonPassword,
  isSimilarToIdentity,
  scorePassword,
  evaluatePassword,
  normalizeEmail,
  normalizeName,
};
