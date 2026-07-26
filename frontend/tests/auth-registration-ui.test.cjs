const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const vm = require('node:vm');

const FRONTEND_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(FRONTEND_ROOT, '..');
const PAGES = fs.readFileSync(
  path.join(FRONTEND_ROOT, 'assets/js/account-pages.js'),
  'utf8',
);
const BACKEND_AUTH = fs.readFileSync(
  path.join(REPO_ROOT, 'backend/src/routes/auth.js'),
  'utf8',
);

function extractFunction(source, name) {
  const marker = 'function ' + name + '(';
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, 'не найдена функция ' + name);
  const declarationStart =
    source.slice(Math.max(0, start - 6), start) === 'async '
      ? start - 6
      : start;
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(declarationStart, index + 1);
    }
  }
  throw new Error('не удалось разобрать функцию ' + name);
}

function compile(name, sandbox = {}) {
  return vm.runInNewContext('(' + extractFunction(PAGES, name) + ')', sandbox);
}

function loadMirror() {
  const context = { window: {} };
  vm.runInNewContext(
    fs.readFileSync(
      path.join(FRONTEND_ROOT, 'assets/js/password-policy.js'),
      'utf8',
    ),
    context,
  );
  return context.window.TravelPasswordPolicy;
}

test('фиктивные согласия удалены из регистрации', () => {
  assert.doesNotMatch(PAGES, /register-terms|register-data|register-consents/);
  assert.doesNotMatch(PAGES, /Принимаю условия сервиса|Согласен на обработку данных/);
  assert.doesNotMatch(BACKEND_AUTH, /\bconsent|acceptTerms|termsAccepted/i);
});

test('нейтральное предупреждение присутствует и не блокирует регистрацию', () => {
  const notice =
    'Приватная тестовая версия. Пока не загружайте чувствительные документы.';
  assert.ok(PAGES.includes(notice));
  assert.match(
    PAGES,
    /<p class="account-meta" data-od-id="register-private-notice">/,
  );
  const form = PAGES.slice(PAGES.indexOf('id="register-form"'));
  const markup = form.slice(0, form.indexOf('</form>'));
  assert.match(markup, /type="submit"/);
  assert.doesNotMatch(markup, /type="submit"[^>]*disabled/);
});

test('на входе используется текст «Оставаться в системе»', () => {
  assert.ok(PAGES.includes('Оставаться в системе'));
  assert.doesNotMatch(PAGES, /Запомнить пароль|Запомнить меня/);
  assert.match(PAGES, /id="login-remember" name="remember" type="checkbox"/);
  assert.ok(PAGES.includes('пароль не сохраняется никогда'));
});

test('восстановление пароля честно помечено недоступным', () => {
  assert.ok(PAGES.includes('Восстановление пароля пока недоступно'));
  assert.match(PAGES, /data-recovery-unavailable/);
  assert.match(PAGES, /aria-disabled="true"/);
  assert.doesNotMatch(PAGES, /data-route="recovery"/);
  const recovery = PAGES.slice(PAGES.indexOf('function recoveryTemplate'));
  const body = recovery.slice(0, recovery.indexOf('\n  function '));
  assert.doesNotMatch(body, /отправили|письмо на|recovery-form/i);
});

test('autocomplete настроен для email и паролей', () => {
  const passwordField = compile('passwordField');
  assert.match(
    passwordField('login-password', 'Пароль', 'current-password'),
    /autocomplete="current-password"/,
  );
  assert.match(
    passwordField('register-password', 'Пароль', 'new-password'),
    /autocomplete="new-password"/,
  );
  assert.match(PAGES, /id="login-email"[^>]*autocomplete="email"/);
  assert.match(PAGES, /field\("register-email", "Email", "email", "email"/);
});

test('ARIA-атрибуты присутствуют у полей и индикатора надёжности', () => {
  const passwordField = compile('passwordField');
  const rendered = passwordField(
    'register-password',
    'Пароль',
    'new-password',
    { describedBy: 'register-password-rules' },
  );
  assert.match(rendered, /aria-invalid="false"/);
  assert.match(rendered, /aria-describedby="register-password-rules"/);
  assert.match(rendered, /<label for="register-password">/);
  assert.match(PAGES, /role="status" aria-live="polite" data-password-strength/);
});

test('кнопка показа пароля доступна с клавиатуры', () => {
  const passwordField = compile('passwordField');
  const rendered = passwordField(
    'login-password',
    'Пароль',
    'current-password',
  );
  assert.match(rendered, /<button[^>]*type="button"/);
  assert.match(rendered, /aria-controls="login-password"/);
  assert.match(rendered, /aria-pressed="false"/);
  assert.match(rendered, /aria-label="Показать пароль"/);
  assert.match(rendered, /data-toggle-password="login-password"/);
  assert.ok(PAGES.includes('Скрыть пароль'));
});

test('повтор пароля присутствует и проверяется', () => {
  assert.match(
    PAGES,
    /passwordField\("register-password-confirm", "Повторите пароль", "new-password"\)/,
  );
  const passwordField = compile('passwordField');
  const rendered = passwordField(
    'register-password-confirm',
    'Повторите пароль',
    'new-password',
  );
  assert.match(rendered, /id="register-password-confirm"/);
  assert.match(rendered, /maxlength="128"/);
  assert.ok(PAGES.includes('Пароли совпадают'));
  assert.ok(PAGES.includes('Не менее 8 символов'));
});

test('двойная отправка формы блокируется во время запроса', () => {
  const submit = {
    dataset: { loadingLabel: 'Загрузка' },
    disabled: false,
    textContent: 'Войти',
    attrs: {},
    setAttribute(key, value) { this.attrs[key] = value; },
  };
  const form = {
    attrs: {},
    setAttribute(key, value) { this.attrs[key] = value; },
    querySelector() { return submit; },
  };
  const setFormBusy = compile('setFormBusy', {
    qs(root, selector) {
      assert.equal(selector, '#login-form');
      return form;
    },
  });
  const context = { root: {} };
  setFormBusy(context, 'login-form', true);
  assert.equal(submit.disabled, true);
  assert.equal(submit.attrs['aria-disabled'], 'true');
  assert.equal(form.attrs['aria-busy'], 'true');
  setFormBusy(context, 'login-form', false);
  assert.equal(submit.disabled, false);
  const submitHandler = PAGES.slice(PAGES.indexOf('function handleSubmit'));
  assert.match(submitHandler.slice(0, 400), /login-form.*register-form/s);
  assert.match(submitHandler.slice(0, 400), /preventDefault\(\);\s*\n\s*return;/);
});

test('frontend и backend password policy совпадают по основному поведению', () => {
  const mirror = loadMirror();
  const backend = require(
    path.join(REPO_ROOT, 'backend/src/services/passwordPolicy.js'),
  );
  assert.equal(mirror.PASSWORD_MIN_LENGTH, backend.PASSWORD_MIN_LENGTH);
  assert.equal(mirror.PASSWORD_MAX_LENGTH, backend.PASSWORD_MAX_LENGTH);
  assert.equal(mirror.EMAIL_MAX_LENGTH, backend.EMAIL_MAX_LENGTH);
  assert.deepEqual(
    Array.from(mirror.COMMON_PASSWORDS),
    Array.from(backend.COMMON_PASSWORDS),
  );
  assert.deepEqual(
    Array.from(mirror.SERVICE_TERMS),
    Array.from(backend.SERVICE_TERMS),
  );
  assert.equal(mirror.EMAIL_PATTERN.source, backend.EMAIL_PATTERN.source);
  assert.equal(mirror.EMAIL_PATTERN.flags, backend.EMAIL_PATTERN.flags);

  const identity = { email: 'traveller@example.com', name: 'Артём Малышев' };
  const samples = [
    'short',
    'abcdefgh',
    'password',
    '123456789',
    'traveller@example.com',
    'Артём Малышев',
    'тревел-помощник',
    'долгая парольная фраза с пробелами и Unicode 😀',
    'K9!vurma-plot_42',
    'x'.repeat(129),
  ];
  for (const sample of samples) {
    const browserResult = mirror.evaluatePassword(sample, identity);
    const backendResult = backend.evaluatePassword(sample, identity);
    assert.deepEqual(
      JSON.parse(JSON.stringify(browserResult)),
      JSON.parse(JSON.stringify(backendResult)),
      'policy расходится для: ' + sample,
    );
  }

  for (const raw of [
    '  User@Example.COM ',
    'not-an-email',
    '',
    'a'.repeat(250) + '@e.co',
  ]) {
    assert.deepEqual(
      JSON.parse(JSON.stringify(mirror.normalizeEmail(raw))),
      JSON.parse(JSON.stringify(backend.normalizeEmail(raw))),
    );
  }

  for (const raw of ['  Иван   Петров  ', '', 'x'.repeat(101)]) {
    assert.deepEqual(
      JSON.parse(JSON.stringify(mirror.normalizeName(raw))),
      JSON.parse(JSON.stringify(backend.normalizeName(raw))),
    );
  }

  const primaryCodes = [
    mirror.evaluatePassword('short', identity).errors[0].code,
    mirror.evaluatePassword('x'.repeat(129), identity).errors[0].code,
    mirror.evaluatePassword('password', identity).errors[0].code,
    mirror.evaluatePassword('traveller', identity).errors[0].code,
  ];
  assert.deepEqual(primaryCodes, [
    'too_short',
    'too_long',
    'too_common',
    'too_similar',
  ]);
  assert.deepEqual(
    ['abcdefgh', 'abcdefgh1234', 'Abcdefgh-1234-Я'].map(
      (value) => mirror.evaluatePassword(value).level,
    ),
    ['weak', 'medium', 'strong'],
  );
});

test('изменённые AUTH-исходники сохраняют UTF-8 без replacement character', () => {
  const changedSources = [
    'assets/js/account-pages.js',
    'assets/js/auth-storage.js',
    'assets/js/password-policy.js',
    'register.html',
    'login.html',
    'password-recovery.html',
    'profile.html',
    'dev-preview/account-pages-preview.html',
  ];
  for (const relative of changedSources) {
    const source = fs.readFileSync(path.join(FRONTEND_ROOT, relative), 'utf8');
    assert.doesNotMatch(source, /\uFFFD/, relative);
  }
  assert.ok(PAGES.includes('Не сохранять исходные письма'));
  assert.ok(PAGES.includes('В будущем почтовое подключение'));
});

test('dev-preview загружает единственное каноническое зеркало policy по HTTP 200', async () => {
  const previewPath = path.join(
    FRONTEND_ROOT,
    'dev-preview/account-pages-preview.html',
  );
  const preview = fs.readFileSync(previewPath, 'utf8');
  const matches = Array.from(
    preview.matchAll(/<script[\s\S]*?src="([^"]*password-policy\.js)"[\s\S]*?<\/script>/g),
  );
  assert.equal(matches.length, 1);
  assert.equal(matches[0][1], '../assets/js/password-policy.js');
  assert.match(preview, /dataset\.passwordPolicyLoaded/);
  assert.equal(
    fs.existsSync(path.join(FRONTEND_ROOT, 'dev-preview/password-policy.js')),
    false,
  );

  const server = http.createServer((request, response) => {
    const requestPath = decodeURIComponent(
      new URL(request.url, 'http://127.0.0.1').pathname,
    );
    const localPath = path.resolve(
      FRONTEND_ROOT,
      requestPath.replace(/^[/\\]+/, ''),
    );
    if (!localPath.startsWith(FRONTEND_ROOT + path.sep)) {
      response.writeHead(403).end();
      return;
    }
    fs.readFile(localPath, (error, content) => {
      if (error) {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
      response.end(content);
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    const scriptUrl = new URL(
      matches[0][1],
      `http://127.0.0.1:${address.port}/dev-preview/account-pages-preview.html`,
    );
    const response = await fetch(scriptUrl);
    assert.equal(response.status, 200);
    const context = { window: {} };
    vm.runInNewContext(await response.text(), context);
    assert.equal(
      typeof context.window.TravelPasswordPolicy.evaluatePassword,
      'function',
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('без browser policy регистрация fail-closed и не показывает зелёные правила', async () => {
  const unavailable = compile('evaluatePassword', {
    policy() { return null; },
  })('A-valid-looking-password');
  assert.equal(unavailable.ok, false);
  assert.equal(
    unavailable.errors[0].message,
    'Не удалось загрузить проверку пароля. Обновите страницу',
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(unavailable.checks)),
    { length: false, notCommon: false, notSimilar: false },
  );

  const passwordRulesHtml = compile('passwordRulesHtml', {
    passwordChecks() {
      return {
        length: false,
        notCommon: false,
        notSimilar: false,
        level: 'unavailable',
        label: 'Проверка недоступна',
      };
    },
    esc(value) { return value; },
  });
  const markup = passwordRulesHtml('A-valid-looking-password', {
    confirm: 'A-valid-looking-password',
  });
  assert.doesNotMatch(markup, /data-ok="true"/);
  assert.match(markup, /data-policy-available="false"/);

  const values = {
    '#register-first-name': { value: 'Иван' },
    '#register-last-name': { value: 'Петров' },
    '#register-email': { value: 'ivan@example.com' },
    '#register-password': { value: 'A-valid-looking-password' },
    '#register-password-confirm': { value: 'A-valid-looking-password' },
  };
  const fieldErrors = [];
  let apiCalls = 0;
  const handleRegisterSubmit = compile('handleRegisterSubmit', {
    clearErrors() {},
    guardOnline() { return true; },
    qs(root, selector) { return values[selector]; },
    policy() { return null; },
    emailPattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    evaluatePassword() { return unavailable; },
    setFieldError(root, field, message) {
      fieldErrors.push({ field, message });
      return { focus() {} };
    },
    punctuate(message) {
      return /[.!?…]$/.test(message) ? message : message + '.';
    },
    refreshRegisterRules() {},
    focusFirst() {},
    setFormBusy() {},
    toast() {},
    setTimer() {},
    window: {
      TravelApi: {
        async register() { apiCalls += 1; },
      },
    },
  });
  await handleRegisterSubmit(
    { preventDefault() {} },
    { root: {}, registerScenario: '' },
  );
  assert.equal(apiCalls, 0);
  assert.deepEqual(fieldErrors, [{
    field: 'register-password',
    message: 'Не удалось загрузить проверку пароля. Обновите страницу',
  }]);
});

test('несовпадающие пароли блокируют реальную отправку регистрации', async () => {
  const values = {
    '#register-first-name': { value: 'Иван' },
    '#register-last-name': { value: 'Петров' },
    '#register-email': { value: 'ivan@example.com' },
    '#register-password': { value: 'K9!vurma-plot_42' },
    '#register-password-confirm': { value: 'different-password' },
  };
  const errors = [];
  let apiCalls = 0;
  const handleRegisterSubmit = compile('handleRegisterSubmit', {
    clearErrors() {},
    guardOnline() { return true; },
    qs(root, selector) { return values[selector]; },
    policy() {
      return {
        normalizeEmail(email) {
          return { ok: true, value: email, error: null };
        },
      };
    },
    emailPattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    evaluatePassword() {
      return {
        ok: true,
        errors: [],
        checks: { length: true, notCommon: true, notSimilar: true },
      };
    },
    setFieldError(root, field, message) {
      errors.push({ field, message });
      return field;
    },
    punctuate(message) { return message; },
    refreshRegisterRules() {},
    focusFirst() {},
    setFormBusy() {},
    toast() {},
    setTimer() {},
    window: {
      TravelApi: {
        async register() { apiCalls += 1; },
      },
    },
  });
  await handleRegisterSubmit(
    { preventDefault() {} },
    { root: {}, registerScenario: '' },
  );
  assert.equal(apiCalls, 0);
  assert.deepEqual(errors, [{
    field: 'register-password-confirm',
    message: 'Пароли не совпадают.',
  }]);
});

test('два быстрых login submit создают только один API-запрос', async () => {
  const values = {
    '#login-email': { value: 'user@example.com' },
    '#login-password': { value: 'valid-passphrase' },
    '#login-remember': { checked: false },
  };
  let resolveLogin;
  const pendingLogin = new Promise((resolve) => { resolveLogin = resolve; });
  let apiCalls = 0;
  const handleLoginSubmit = compile('handleLoginSubmit', {
    clearErrors() {},
    qs(root, selector) { return values[selector]; },
    emailPattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    setFieldError() { return null; },
    focusFirst() {},
    setFormBusy() {},
    window: {
      TravelApi: {
        login() {
          apiCalls += 1;
          return pendingLogin;
        },
      },
    },
  });
  const handleSubmit = compile('handleSubmit', {
    handleLoginSubmit,
    handleRegisterSubmit() {},
    handleRecoverySubmit() {},
    handleRecoveryResetSubmit() {},
    handleEditSubmit() {},
    handlePasswordSubmit() {},
    handleAvatarSubmit() {},
    handleDeleteSubmit() {},
  });
  const context = {
    root: {},
    loginScenario: '',
    adapter: {
      adoptBackendUser() { return { ok: true }; },
    },
    routes: {
      routeAfterAuth() {},
    },
  };
  let secondPrevented = false;
  handleSubmit({ target: { id: 'login-form' }, preventDefault() {} }, context);
  handleSubmit({
    target: { id: 'login-form' },
    preventDefault() { secondPrevented = true; },
  }, context);
  assert.equal(apiCalls, 1);
  assert.equal(secondPrevented, true);
  resolveLogin({ user: { id: 'user-1' } });
  await pendingLogin;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(context.authPending, false);
});

test('structured backend errors попадают в свои поля без двойной пунктуации', () => {
  const punctuate = compile('punctuate');
  const registrationFieldId = compile('registrationFieldId');
  const fieldErrors = [];
  const generalErrors = [];
  const focused = [];
  const apply = compile('applyRegistrationBackendErrors', {
    registrationFieldId,
    punctuate,
    setFieldError(root, field, message) {
      fieldErrors.push({ field, message });
      return field;
    },
    focusFirst(targets) { focused.push(...targets); },
    toast(ctx, message) { generalErrors.push(message); },
  });

  apply(
    { root: {} },
    {
      status: 400,
      data: {
        error: 'first message',
        errors: [
          { field: 'email', message: 'Email уже неверен.' },
          { field: 'name', message: 'Укажите имя' },
          { field: 'password', message: 'Пароль слабый!' },
          { field: 'server', message: 'Общая ошибка?' },
        ],
      },
    },
  );
  assert.deepEqual(fieldErrors, [
    { field: 'register-email', message: 'Email уже неверен.' },
    { field: 'register-first-name', message: 'Укажите имя.' },
    { field: 'register-password', message: 'Пароль слабый!' },
  ]);
  assert.deepEqual(generalErrors, ['Общая ошибка?']);
  assert.deepEqual(focused, [
    'register-email',
    'register-first-name',
    'register-password',
  ]);
  assert.doesNotMatch(JSON.stringify(fieldErrors), /\.\./);

  fieldErrors.length = 0;
  generalErrors.length = 0;
  apply(
    { root: {} },
    { status: 400, data: { error: 'Старый формат ошибки' } },
  );
  assert.deepEqual(fieldErrors, []);
  assert.deepEqual(generalErrors, ['Старый формат ошибки.']);

  fieldErrors.length = 0;
  apply(
    { root: {} },
    { status: 409, data: { error: 'Email уже занят.' } },
  );
  assert.deepEqual(fieldErrors, [
    { field: 'register-email', message: 'Email уже занят.' },
  ]);
});

test('комментарий browser mirror указывает на реальный parity test', () => {
  const source = fs.readFileSync(
    path.join(FRONTEND_ROOT, 'assets/js/password-policy.js'),
    'utf8',
  );
  assert.match(source, /frontend\/tests\/auth-registration-ui\.test\.cjs/);
  assert.doesNotMatch(source, /frontend\/tests\/password-policy\.test\.cjs/);
});
