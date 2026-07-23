const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

test('weather waits for the deep-linked trip to hydrate before requesting data', () => {
  const source = fs.readFileSync('assets/js/weather-map.js', 'utf8');
  let currentTrip = {
    id: 'trip-turkey-2026',
    routePoints: ['Сыктывкар', 'Москва', 'Анталья'],
  };
  let storeSubscriber = null;
  let authCalls = 0;
  let domReady = null;

  const store = {
    getState: () => ({ trip: currentTrip }),
    subscribe: (listener) => {
      storeSubscriber = listener;
      return () => {};
    },
    updateTrip: () => {},
  };
  const document = {
    readyState: 'loading',
    head: { appendChild: () => {} },
    addEventListener: (name, listener) => {
      if (name === 'DOMContentLoaded') domReady = listener;
    },
    getElementById: () => null,
    createElement: () => ({ style: {}, setAttribute: () => {} }),
    querySelector: () => null,
  };
  const window = {
    location: { href: 'https://preview.example/trip-overview?tripId=trip-b2' },
    TravelAppState: store,
    TravelApi: {
      ensureAuth: () => {
        authCalls += 1;
        return Promise.resolve();
      },
      geoSearch: () => Promise.resolve({ results: [] }),
    },
    addEventListener: () => {},
  };

  vm.runInNewContext(source, {
    console,
    document,
    window,
    URL,
    setInterval: () => 1,
    clearInterval: () => {},
    setTimeout: (listener) => {
      listener();
      return 1;
    },
  });

  assert.equal(typeof domReady, 'function');
  domReady();
  assert.equal(authCalls, 0, 'must not request weather for the default demo trip');
  assert.equal(typeof storeSubscriber, 'function');

  currentTrip = {
    id: 'trip-b2',
    route: 'Санкт-Петербург → Москва',
    routePoints: ['Санкт-Петербург', 'Москва'],
  };
  storeSubscriber();
  assert.equal(authCalls, 1, 'must start after the requested trip is hydrated');
});
