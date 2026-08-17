const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function read(relativePath) {
  assert.ok(fs.existsSync(relativePath), `${relativePath} must exist`);
  return fs.readFileSync(relativePath, 'utf8');
}

const iconNames = [
  'logo',
  'hotels',
  'flights',
  'rail',
  'buses',
  'electric',
  'tours',
  'car',
  'jarvel',
];

class FakeElement {
  constructor(attributes = {}) {
    this.attributes = new Map(Object.entries(attributes));
    this.dataset = {};
    this.listeners = new Map();
    this.textContent = '';
    this.value = '';
    this.focused = false;
    this.classList = {
      toggle() {},
    };
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatchEvent(event) {
    for (const listener of this.listeners.get(event.type) || []) listener(event);
    return true;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) || null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  focus() {
    this.focused = true;
  }
}

class FakeRoot extends FakeElement {
  set innerHTML(value) {
    this.renderedHtml = value;
    this.fields = Object.fromEntries(
      ['origin', 'destination', 'outbound', 'return', 'passengers'].map((name) => [name, new FakeElement({ name })]),
    );
    this.fields.passengers.value = '1 пассажир, эконом';
    this.status = new FakeElement();
    this.form = new FakeElement();
    this.modes = [new FakeElement({ 'aria-checked': 'true' })];
    this.modes[0].dataset.tutuMode = 'flights';
  }

  get innerHTML() {
    return this.renderedHtml || '';
  }

  querySelector(selector) {
    if (selector === '.tutu-search-form') return this.form;
    if (selector === '.tutu-search-status') return this.status;
    const field = selector.match(/^\[name="([^"]+)"\]$/);
    if (field) return this.fields[field[1]] || null;
    if (selector === '[data-tutu-mode][aria-checked="true"]') return this.modes[0];
    return null;
  }

  querySelectorAll(selector) {
    if (selector === '[aria-invalid="true"]') {
      return Object.values(this.fields).filter((field) => field.getAttribute('aria-invalid') === 'true');
    }
    if (selector === '[data-tutu-mode]') return this.modes;
    return [];
  }
}

class FakeCustomEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.detail = options.detail;
    this.bubbles = options.bubbles;
  }
}

test('Home route mounts only the scoped Tutu landing after authenticated init', () => {
  const html = read('home.html');

  assert.match(html, /<body class="[^"]*tutu-native-surface[^"]*"/);
  assert.match(html, /assets\/css\/tutu-native-shell\.css/);
  assert.match(html, /assets\/js\/tutu-search-shell\.js/);
  assert.match(html, /appShellInit\(\{\s*section:\s*"Главная",\s*variant:\s*"tutu"\s*\}\)/);
  assert.match(html, /tutuSearchShellInit/);
  assert.doesNotMatch(html, /home-root|trip-pages(?:-state)?\.js|trip-pages\.css|tripPagesHomeInit/);
});

test('all transport artwork is local SVG with stable viewBox geometry', () => {
  for (const name of iconNames) {
    const relativePath = path.join('assets', 'icons', 'tutu-native', `${name}.svg`);
    const svg = read(relativePath);

    assert.match(svg, /<svg\b/);
    assert.match(svg, /viewBox="0 0 24 24"|viewBox="0 0 128 48"/);
    assert.doesNotMatch(svg, /(?:href|src)="https?:\/\//);
    assert.doesNotMatch(svg, /<script\b/i);
  }
});

test('header uses the exact two-tone official inline Tutu logo geometry', () => {
  const logo = read('assets/icons/tutu-native/logo.svg');

  assert.match(logo, /viewBox="0 0 128 48"/);
  assert.equal((logo.match(/<path\b/g) || []).length, 2);
  assert.match(logo, /fill="#eff0ff"/i);
  assert.match(logo, /fill="#6f5df6"/i);
  assert.match(logo, /M11\.54 40\.752c2\.112 1\.152 4\.48 1\.728/);
  assert.match(logo, /M72\.47 40\.992c1\.855\.992 3\.951 1\.488/);
});

test('search shell exposes the required accessible controls and one submit path', () => {
  const source = read('assets/js/tutu-search-shell.js');

  for (const label of [
    'Откуда',
    'Куда',
    'Когда',
    'Обратно',
    'Кто летит',
    'Найти авиабилеты',
    'Поменять местами отправление и прибытие',
  ]) {
    assert.match(source, new RegExp(label));
  }

  assert.match(source, /window\.tutuSearchShellInit\s*=/);
  assert.equal((source.match(/addEventListener\("submit"/g) || []).length, 1);
  assert.equal((source.match(/new CustomEvent\("tutu-native:search"/g) || []).length, 1);
  assert.match(source, /aria-live="polite"/);
});

test('search controller validates and dispatches exactly once after repeated init', () => {
  const source = read('assets/js/tutu-search-shell.js');
  const context = {
    AbortController,
    CustomEvent: FakeCustomEvent,
    window: {},
  };
  vm.runInNewContext(source, context);
  const root = new FakeRoot();
  const events = [];

  context.window.tutuSearchShellInit(root);
  root.addEventListener('tutu-native:search', (event) => events.push(event.detail));
  root.form.dispatchEvent({ type: 'submit', preventDefault() {} });
  assert.equal(events.length, 0);
  assert.equal(root.fields.origin.getAttribute('aria-invalid'), 'true');
  assert.equal(root.fields.origin.focused, true);
  assert.equal(root.status.textContent, 'Укажите город отправления');

  root.fields.origin.value = 'Москва';
  root.fields.destination.value = 'Казань';
  root.form.dispatchEvent({ type: 'submit', preventDefault() {} });
  assert.equal(events.length, 1);
  assert.equal(events[0].origin, 'Москва');
  assert.equal(events[0].destination, 'Казань');

  context.window.tutuSearchShellInit(root);
  root.fields.origin.value = 'Сочи';
  root.fields.destination.value = 'Москва';
  root.form.dispatchEvent({ type: 'submit', preventDefault() {} });
  assert.equal(events.length, 2);
  assert.equal(events[1].origin, 'Сочи');
});

test('empty route and date fields keep full-size Tutu placeholder labels', () => {
  const source = read('assets/js/tutu-search-shell.js');
  const emptyPlaceholders = source.match(/placeholder=" "/g) || [];

  assert.equal(emptyPlaceholders.length, 4);
});

test('search shell defines all eight modes without captured icon fonts', () => {
  const source = read('assets/js/tutu-search-shell.js');

  for (const label of [
    'Отели',
    'Авиабилеты',
    'Ж/д билеты',
    'Автобусы',
    'Электрички',
    'Туры',
    'Аренда авто',
    'Джарвел',
  ]) {
    assert.match(source, new RegExp(label));
  }

  assert.doesNotMatch(source, /TutuMIcons|TutuSIcons|\.eot\b/);
});

test('desktop shell exposes live quick suggestions and a local hotel toggle', () => {
  const source = read('assets/js/tutu-search-shell.js');

  assert.match(source, /class="tutu-destination-hints"/);
  assert.match(source, /Искать отели в новой вкладке/);
  assert.match(source, /class="tutu-hotel-toggle"/);
  assert.match(source, /type="checkbox"/);
  assert.match(source, /class="tutu-native-deal-proof"/);
  assert.match(source, /Это выгодно!/);
});

test('transport selector uses radio semantics for its single active mode', () => {
  const source = read('assets/js/tutu-search-shell.js');

  assert.match(source, /role="radiogroup"/);
  assert.match(source, /role="radio"/);
  assert.match(source, /aria-checked=/);
  assert.doesNotMatch(source, /role="tablist"|role="tab"|aria-selected=/);
});

test('Tutu AppShell variant preserves production account actions', () => {
  const source = read('assets/js/app-shell.js');

  assert.match(source, /options\.variant\s*===\s*"tutu"/);
  for (const action of [
    'home',
    'notifications',
    'user-menu',
    'go-home',
    'go-history',
    'go-profile',
    'logout',
  ]) {
    assert.match(source, new RegExp(`data-shell-action="${action}"`));
  }
});

test('Tutu header anchors navigate only through the existing AppRoutes handlers', () => {
  const source = read('assets/js/app-shell.js');

  assert.match(source, /action === "go-history"\) \{\s*event\.preventDefault\(\);\s*window\.AppRoutes\.goToHistory\(\)/);
  assert.match(source, /action === "go-profile"\) \{\s*event\.preventDefault\(\);\s*window\.AppRoutes\.goToProfile\(\)/);
});

test('scoped CSS owns desktop and mobile geometry without React or Vite', () => {
  const css = read('assets/css/tutu-native-shell.css');
  const home = read('home.html');
  const searchShell = read('assets/js/tutu-search-shell.js');
  const combined = `${css}\n${home}\n${searchShell}`;

  assert.match(css, /\.tutu-native-surface/);
  assert.match(css, /@media\s*\(max-width:\s*640px\)/);
  assert.match(css, /--tutu-search-height:\s*56px/);
  assert.match(css, /overflow-x:\s*clip/);
  assert.match(css, /\.tutu-search-field:focus-within\s*\{[^}]*box-shadow:\s*inset 0 0 0 2px/s);
  assert.match(css, /\.tutu-native-container:has\(\.tutu-search-status:not\(:empty\)\)\s*\{[^}]*min-height:\s*590px/s);
  assert.doesNotMatch(combined, /\bReact\b|react-dom|vite(?:\.config)?/i);
});

test('tablet search columns may shrink before the mobile breakpoint', () => {
  const css = read('assets/css/tutu-native-shell.css');

  assert.match(css, /grid-template-columns:\s*minmax\(0,\s*2\.35fr\)\s+minmax\(0,\s*1\.95fr\)\s+minmax\(120px,\s*\.8fr\)\s+174px/);
  assert.match(css, /@media\s*\(max-width:\s*820px\)/);
  assert.match(css, /\.tutu-mode\[data-tutu-mode="jarvel"\] \.tutu-mode-badge\s*\{[^}]*right:\s*0;[^}]*left:\s*auto;/s);
});

test('desktop route geometry reserves an independent live-size swap column', () => {
  const css = read('assets/css/tutu-native-shell.css');

  assert.match(css, /\.tutu-search-form\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*468fr\)\s+minmax\(0,\s*393fr\)\s+minmax\(0,\s*153fr\)\s+187px/s);
  assert.match(css, /\.tutu-route-group\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+56px\s+minmax\(0,\s*1fr\)/s);
  assert.match(css, /\.tutu-swap\s*\{[^}]*position:\s*relative;[^}]*width:\s*56px;[^}]*height:\s*56px/s);
  assert.doesNotMatch(css, /\.tutu-search-hints > span:nth-child\(2\)\s*\{\s*display:\s*none;/s);
});

test('desktop vertical rhythm centers empty labels and keeps the first deal within the live fold', () => {
  const css = read('assets/css/tutu-native-shell.css');

  assert.match(css, /\.app-header\.tutu-app-header\s*\{[^}]*height:\s*62px/s);
  assert.match(css, /\.tutu-native-container\s*\{[^}]*min-height:\s*443px;[^}]*padding:\s*23px 0 36px/s);
  assert.match(css, /\.tutu-search-form\s*\{[^}]*margin-top:\s*16px/s);
  assert.match(css, /\.tutu-search-field > span\s*\{[^}]*position:\s*absolute;[^}]*top:\s*50%;[^}]*left:\s*16px;[^}]*transform:\s*translateY\(-50%\)/s);
  assert.match(css, /\.tutu-native-deal-inner\s*\{[^}]*height:\s*158px/s);
  assert.match(css, /\.tutu-native-deal button\s*\{[^}]*min-height:\s*32px/s);
  assert.match(css, /\.tutu-native-deal h2\s*\{[^}]*line-height:\s*1\.2/s);
  assert.match(css, /\.tutu-native-deal p\s*\{[^}]*line-height:\s*1\.2/s);
});

test('mobile lower section overlaps the hero with the live card height and swap offset', () => {
  const css = read('assets/css/tutu-native-shell.css');
  const mobile = css.slice(css.indexOf('@media (max-width: 640px)'));

  assert.match(mobile, /\.tutu-swap\s*\{[^}]*right:\s*20px;[^}]*width:\s*42px;/s);
  assert.match(mobile, /\.tutu-swap svg\s*\{[^}]*transform:\s*rotate\(90deg\)/s);
  assert.match(mobile, /\.tutu-native-deal\s*\{[^}]*margin-top:\s*-24px;/s);
  assert.match(mobile, /\.tutu-native-deal-inner\s*\{[^}]*height:\s*119px;/s);
});
