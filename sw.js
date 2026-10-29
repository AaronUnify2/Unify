/* ===========================================================================
   sw.js — lets Unify open without a connection.

   The app's own files are fetched fresh when there's a connection (so an
   update shows straight away) and kept, so they're there when there isn't.
   The language model's files never change, so they're read from the cache
   first. Nothing from api.github.com is ever touched here: your data is
   kept by the app itself, in this browser's storage.
   =========================================================================== */

var CACHE = 'unify-shell-v1';
var VENDOR = 'unify-vendor-v1';
var TIMEOUT = 4000;

var SHELL = [
  './', 'index.html', 'css/app.css', 'manifest.webmanifest', 'icons/icon.svg',
  'js/util.js', 'js/model.js', 'js/merge.js', 'js/github.js', 'js/store.js', 'js/sync.js',
  'js/semantic.js', 'js/semantic-worker.js', 'js/probe.js', 'js/handlers.js', 'js/ui.js',
  'js/views-problems.js', 'js/views-goals.js', 'js/views-tasks.js', 'js/views-journal.js',
  'js/views-probe.js', 'js/views-insights.js', 'js/views-settings.js', 'js/app.js'
];

self.addEventListener('install', function (ev) {
  ev.waitUntil(caches.open(CACHE).then(function (cache) { return cache.addAll(SHELL); }).then(function () {
    return self.skipWaiting();
  }));
});

self.addEventListener('activate', function (ev) {
  ev.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE && k !== VENDOR; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function networkFirst(request) {
  return caches.open(CACHE).then(function (cache) {
    var network = fetch(request).then(function (res) {
      if (res.ok) cache.put(request, res.clone());
      return res;
    });
    var timeout = new Promise(function (resolve) {
      setTimeout(function () { cache.match(request, { ignoreSearch: true }).then(resolve); }, TIMEOUT);
    });
    return Promise.race([network, timeout]).then(function (res) {
      return res || network;
    }).catch(function () {
      return cache.match(request, { ignoreSearch: true }).then(function (res) { return res || Response.error(); });
    });
  });
}

function cacheFirst(request) {
  return caches.open(VENDOR).then(function (cache) {
    return cache.match(request).then(function (hit) {
      return hit || fetch(request).then(function (res) {
        if (res.ok) cache.put(request, res.clone());
        return res;
      });
    });
  });
}

self.addEventListener('fetch', function (ev) {
  var url = new URL(ev.request.url);
  if (ev.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.indexOf('/vendor/') >= 0) ev.respondWith(cacheFirst(ev.request));
  else ev.respondWith(networkFirst(ev.request));
});
