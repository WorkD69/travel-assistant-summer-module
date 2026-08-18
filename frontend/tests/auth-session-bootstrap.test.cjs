'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const frontendRoot = path.resolve(__dirname, '..');
const bootstrapPath = path.join(frontendRoot, 'assets/js/auth-session-bootstrap.js');

function source(relativePath) {
  return fs.readFileSync(path.join(frontendRoot, relativePath), 'utf8');
}

function bootstrapModule() {
  assert.equal(fs.existsSync(bootstrapPath), true, 'shared auth session bootstrap must exist');
  delete require.cache[require.resolve(bootstrapPath)];
  return require(bootstrapPath);
}

function createElement(tagName, documentRef) {
  const element = {
    tagName: String(tagName).toUpperCase(),
    id: '',
    className: '',
    textContent: '',
    children: [],
    attributes: {},
    listeners: {},
    parentNode: null,
    setAttribute(name, value) { this.attributes[name] = String(value); },
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      if (child.id) documentRef.elements.set(child.id, child);
      return child;
    },
    addEventListener(name, listener) { this.listeners[name] = listener; },
    remove() {
      if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
      if (this.id) documentRef.elements.delete(this.id);
    },
  };
  return element;
}

function createDocument(environment) {
  const documentRef = {
    elements: new Map(),
    createElement(tagName) { return createElement(tagName, documentRef); },
    getElementById(id) { return documentRef.elements.get(id) || null; },
  };
  documentRef.body = createElement('body', documentRef);
  documentRef.body.getAttribute = (name) => name === 'data-app-environment' ? (environment || 'production') : null;
  return documentRef;
}

function createRoot(options) {
  const settings = options || {};
  const events = [];
  const redirects = [];
  const cleared = [];
  let state = {
    accountPages: { session: { isAuthenticated: false, userId: '', email: '', remember: false, lastLoginAt: '' }, users: {} },
    users: {},
    currentUser: { id: 'artem', name: 'Артём', currentTripRole: 'organizer' },
  };
  const document = createDocument(settings.environment);
  const root = {
    document,
    location: {
      hostname: settings.hostname || 'release.example.test',
      pathname: settings.pathname || '/home.html',
      search: settings.search || '',
      hash: '',
      replace(url) { redirects.push(url); },
    },
    TravelAuthStorage: {
      load() { return settings.token || null; },
      clear() { cleared.push('storage'); },
    },
    TravelApi: {
      async me() {
        events.push('me');
        if (settings.meError) throw settings.meError;
        return settings.meResponse || { user: { id: 'backend-user-1', email: 'traveler@example.com', name: 'Ирина Петрова' } };
      },
      clearAuth() { cleared.push('api'); },
    },
    TravelAppState: {
      getState() { return state; },
      setState(partial) { state = Object.assign({}, state, partial); return state; },
    },
    appShellInit() {
      events.push('shell');
      if (!state.accountPages.session.isAuthenticated) {
        root.location.replace('login.html?returnUrl=home.html');
        return false;
      }
      return true;
    },
  };
  return { root, events, redirects, cleared, state: () => state };
}

test('Home production boot validates backend session before shell and search init', async () => {
  const moduleApi = bootstrapModule();
  const harness = createRoot({ token: 'stored-jwt' });
  const session = moduleApi.createSessionBootstrap(harness.root);

  const result = await session.runProtected({ section: 'Главная', variant: 'tutu' }, () => {
    harness.events.push('search');
  });

  assert.equal(result.ok, true);
  assert.deepEqual(harness.events, ['me', 'shell', 'search']);
  assert.deepEqual(harness.redirects, []);
  assert.equal(harness.state().accountPages.session.isAuthenticated, true);
  assert.equal(harness.state().accountPages.session.userId, 'backend-user-1');
  assert.equal(harness.state().accountPages.session.email, 'traveler@example.com');
  assert.equal(harness.state().currentUser.id, 'backend-user-1');
  assert.equal(harness.state().currentUser.currentTripRole, undefined);
});

test('reload and direct protected entry remain authenticated only after a fresh backend me validation', async () => {
  const moduleApi = bootstrapModule();
  for (const pathname of ['/home.html', '/history.html']) {
    const harness = createRoot({ token: 'stored-jwt', pathname });
    const result = await moduleApi.createSessionBootstrap(harness.root).runProtected({ section: 'Protected' }, () => {
      harness.events.push('page');
    });
    assert.equal(result.ok, true);
    assert.deepEqual(harness.events, ['me', 'shell', 'page']);
    assert.deepEqual(harness.redirects, []);
  }
});

test('401 and 403 clear the credential, project unauthenticated state, and redirect without bypass', async () => {
  const moduleApi = bootstrapModule();
  for (const status of [401, 403]) {
    const harness = createRoot({ token: 'stored-jwt', meError: Object.assign(new Error('unauthorized'), { status }) });
    const result = await moduleApi.createSessionBootstrap(harness.root).runProtected({ section: 'Главная' }, () => {
      harness.events.push('search');
    });
    assert.equal(result.ok, false);
    assert.equal(result.kind, 'unauthorized');
    assert.deepEqual(harness.events, ['me', 'shell']);
    assert.deepEqual(harness.cleared, ['api']);
    assert.equal(harness.state().accountPages.session.isAuthenticated, false);
    assert.equal(harness.redirects.length, 1);
    assert.doesNotMatch(harness.events.join(','), /search/);
  }
});

test('network and 5xx failures stop protected init with a recoverable error and preserve credentials', async () => {
  const moduleApi = bootstrapModule();
  for (const error of [new Error('network'), Object.assign(new Error('backend'), { status: 503 })]) {
    const harness = createRoot({ token: 'stored-jwt', meError: error });
    const result = await moduleApi.createSessionBootstrap(harness.root).runProtected({ section: 'Главная' }, () => {
      harness.events.push('search');
    });
    assert.equal(result.ok, false);
    assert.equal(result.kind, 'unavailable');
    assert.deepEqual(harness.events, ['me']);
    assert.deepEqual(harness.redirects, []);
    assert.deepEqual(harness.cleared, []);
    const errorSurface = harness.root.document.getElementById('auth-session-error');
    assert.ok(errorSurface);
    assert.match(errorSurface.textContent, /Не удалось проверить сессию/);
  }
});

test('token presence alone never marks the session authenticated', async () => {
  const moduleApi = bootstrapModule();
  const harness = createRoot({ token: 'present-but-invalid', meError: Object.assign(new Error('expired'), { status: 401 }) });
  const result = await moduleApi.createSessionBootstrap(harness.root).hydrate();

  assert.equal(result.ok, false);
  assert.equal(result.kind, 'unauthorized');
  assert.deepEqual(harness.events, ['me']);
  assert.equal(harness.state().accountPages.session.isAuthenticated, false);
});

test('explicit local fixture preview keeps its existing state while production never restores fixtures', async () => {
  const moduleApi = bootstrapModule();
  const preview = createRoot({
    environment: 'development',
    hostname: '127.0.0.1',
    search: '?preview=legacy-fixtures',
    meError: new Error('must not call backend in explicit preview'),
  });
  preview.root.TravelAppState.setState({
    accountPages: { session: { isAuthenticated: true, userId: 'fixture-user', email: 'fixture@example.test' }, users: {} },
  });
  const previewResult = await moduleApi.createSessionBootstrap(preview.root).runProtected({ section: 'Preview' }, () => {
    preview.events.push('page');
  });
  assert.equal(previewResult.ok, true);
  assert.deepEqual(preview.events, ['shell', 'page']);

  const production = createRoot({
    environment: 'development',
    hostname: 'release.example.test',
    search: '?preview=legacy-fixtures',
  });
  await moduleApi.createSessionBootstrap(production.root).hydrate();
  assert.deepEqual(production.events, ['me']);
});

test('all appShell protected pages await the shared auth bootstrap after API initialization', () => {
  const pages = ['home.html', 'history.html', 'search-results.html', 'trip-wizard.html', 'profile.html'];
  for (const page of pages) {
    const html = source(page);
    const storage = html.indexOf('assets/js/auth-storage.js');
    const runtime = html.indexOf('assets/js/runtime-config.js');
    const api = html.indexOf('assets/js/api-client.js');
    const bootstrap = html.indexOf('assets/js/auth-session-bootstrap.js');
    assert.ok(storage > -1 && storage < runtime && runtime < api && api < bootstrap, page);
    assert.match(html, /TravelAuthSession\.runProtected\(/, page);
    assert.doesNotMatch(html, /if \(window\.appShellInit\(/, page);
  }

  const home = source('home.html');
  assert.match(home, /runProtected\([\s\S]*tutuSearchShellInit/);
});

test('Trip Workspace waits for the same backend validation and keeps Smart Workspace preview explicit', () => {
  const html = source('trip-overview.html');
  assert.ok(html.indexOf('assets/js/api-client.js') < html.indexOf('assets/js/auth-session-bootstrap.js'));
  assert.ok(html.indexOf('assets/js/auth-session-bootstrap.js') < html.indexOf('assets/js/workspace-integration.js'));
  const integration = source('assets/js/workspace-integration.js');
  assert.match(integration, /await window\.TravelAuthSession\.hydrate\(\)/);
  assert.match(integration, /smartWorkspacePreview[\s\S]*return;/);
});

test('bootstrap creates no persistent boolean authentication authority', () => {
  bootstrapModule();
  const bootstrap = source('assets/js/auth-session-bootstrap.js');
  assert.doesNotMatch(bootstrap, /(localStorage|sessionStorage)\.setItem/);
  assert.doesNotMatch(bootstrap, /getToken\(\)[\s\S]{0,80}isAuthenticated\s*=\s*true/);
  assert.match(bootstrap, /TravelApi[\s\S]*\.me\(/);
});
