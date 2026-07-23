"use strict";

const CACHE_NAME = "travel-assistant-version-b2-staging-20260723";
const CACHE_PREFIX = "travel-assistant-";
const PRECACHE = [
  "/",
  "/index.html",
  "/login.html",
  "/assets/js/api-client.js",
];

self.addEventListener("install", function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) { return cache.addAll(PRECACHE); })
      .then(function() { return self.skipWaiting(); }),
  );
});

self.addEventListener("activate", function(event) {
  event.waitUntil(
    caches.keys()
      .then(function(keys) {
        return Promise.all(keys.map(function(key) {
          if (key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME) {
            return caches.delete(key);
          }
          return undefined;
        }));
      })
      .then(function() { return self.clients.claim(); }),
  );
});

self.addEventListener("fetch", function(event) {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  event.respondWith(
    fetch(event.request)
      .then(function(response) {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            return cache.put(event.request, copy);
          });
        }
        return response;
      })
      .catch(function() { return caches.match(event.request); }),
  );
});
