/* ===========================================================================
   semantic.js — matching by meaning, with a small language model.

   The model (all-MiniLM-L6-v2, self-hosted under vendor/) reads a piece of
   text and returns a fingerprint: 384 numbers that place it by meaning. Two
   texts that mean the same thing get fingerprints pointing the same way, so
   "I can never get to sleep" lands next to "lying awake at night", even
   though they share no words. It runs entirely in this browser: nothing you
   write is sent anywhere to be read.

   This file is the plumbing (the same as Process Hub's, minus the FAQ
   seeds):

     - the model, run in a worker (semantic-worker.js), loaded on first use
     - fingerprints, kept by a hash of the exact text they were made from, in
       IndexedDB, so each text is read once per browser until it changes
     - keyword helpers, so exact words still count alongside meaning
   =========================================================================== */

(function (global) {
  'use strict';

  var MODEL = 'Xenova/all-MiniLM-L6-v2';

  // Passages longer than this are split, so one sentence deep in a long
  // journal entry can still be found.
  function chunk(text) {
    var sentences = String(text).match(/[^.!?\n]+[.!?]*\s*|\n+/g) || [text];
    var out = [], cur = '';
    sentences.forEach(function (s) {
      if (!s.trim()) return;
      if (cur && (cur + s).length > 380) { out.push(cur.trim()); cur = ''; }
      cur += s + ' ';
    });
    if (cur.trim()) out.push(cur.trim());
    return out.slice(0, 24);
  }

  // A 53-bit string hash (cyrb53): the key a fingerprint is kept under.
  function hash(str) {
    var h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (var i = 0; i < str.length; i++) {
      var ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }

  // ---- keywords ------------------------------------------------------------

  var STOP = {};
  ('a an and are as at be by can could do does for from had has have how i if in into is it its ' +
    'me my of on or our should so that the their them then there these they this to was we what when where ' +
    'which who why will with would you your yours am get got im ive dont cant about any some need want ' +
    'just much many also really very feel feeling been being not no').split(' ').forEach(function (w) { STOP[w] = true; });

  function stem(w) {
    if (w.length > 5 && /ing$/.test(w)) return w.slice(0, -3);
    if (w.length > 4 && /ies$/.test(w)) return w.slice(0, -3) + 'y';
    if (w.length > 4 && /ed$/.test(w)) return w.slice(0, -2);
    if (w.length > 3 && /s$/.test(w) && !/ss$/.test(w)) return w.slice(0, -1);
    return w;
  }

  /** The distinct, stemmed content words in a text, as a set. */
  function terms(text) {
    var out = {};
    (String(text).toLowerCase().replace(/[’']/g, '').match(/[a-z0-9]+/g) || []).forEach(function (w) {
      if (!STOP[w] && w.length > 1) out[stem(w)] = true;
    });
    return out;
  }

  function dot(a, b) {
    var s = 0;
    for (var i = 0; i < a.length; i++) s += a[i] * b[i];
    return s;
  }

  // ---- packing fingerprints ------------------------------------------------
  // Stored, each of the 384 numbers is squeezed into one byte and the lot
  // written as base64: about 0.5 KB each.

  function pack(vec) {
    var max = 0;
    for (var i = 0; i < vec.length; i++) max = Math.max(max, Math.abs(vec[i]));
    var bytes = new Int8Array(vec.length);
    for (var j = 0; j < vec.length; j++) bytes[j] = Math.round(vec[j] / (max || 1) * 127);
    var s = '';
    var u = new Uint8Array(bytes.buffer);
    for (var k = 0; k < u.length; k++) s += String.fromCharCode(u[k]);
    return btoa(s);
  }

  function unpack(b64) {
    var s = atob(b64);
    var vec = new Float32Array(s.length);
    var len = 0;
    for (var i = 0; i < s.length; i++) {
      var b = s.charCodeAt(i);
      vec[i] = b > 127 ? b - 256 : b;
      len += vec[i] * vec[i];
    }
    len = Math.sqrt(len) || 1;
    for (var j = 0; j < vec.length; j++) vec[j] /= len;
    return vec;
  }

  // ---- the fingerprint store -----------------------------------------------

  var computed = {};   // key -> Float32Array

  function lookup(key) {
    return computed[key] || null;
  }

  // Kept in their own IndexedDB database, apart from the data: losing them
  // costs only the time to work them out again.
  var DB_NAME = 'unify-vectors';
  var STORE = 'vectors';
  var RECORD = 'computed';

  function openDb() {
    return new Promise(function (resolve, reject) {
      var request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = function () {
        if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error); };
    });
  }

  function loadComputed() {
    return openDb().then(function (db) {
      return new Promise(function (resolve) {
        var request = db.transaction(STORE, 'readonly').objectStore(STORE).get(RECORD);
        request.onsuccess = function () { resolve(request.result); };
        request.onerror = function () { resolve(null); };
      });
    }).then(function (saved) {
      if (saved && saved.model === MODEL && saved.items) {
        Object.keys(saved.items).forEach(function (k) { computed[k] = unpack(saved.items[k]); });
      }
    }).catch(function (err) {
      console.warn('Saved fingerprints unavailable:', err);
    });
  }

  /** Keep what this browser worked out, but only what is still in use. */
  function saveComputed(keys) {
    var items = {};
    keys.forEach(function (k) { if (computed[k]) items[k] = pack(computed[k]); });
    return openDb().then(function (db) {
      return new Promise(function (resolve) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put({ model: MODEL, items: items }, RECORD);
        tx.oncomplete = resolve;
        tx.onerror = resolve;
      });
    }).catch(function () { /* a cache: nothing is lost but time */ });
  }

  /** Forget every fingerprint kept in this browser (on signing out). */
  function clearComputed() {
    computed = {};
    try { indexedDB.deleteDatabase(DB_NAME); } catch (e) { /* nothing to do */ }
  }

  // ---- the model -----------------------------------------------------------

  var worker = null;
  var pending = {};
  var nextId = 1;
  var started = null;
  var status = 'idle';          // idle · loading · ready · failed
  var statusText = '';
  var listeners = [];

  function setStatus(s, text) {
    status = s;
    statusText = text || '';
    listeners.forEach(function (fn) { fn(status, statusText); });
  }

  function onStatus(fn) {
    listeners.push(fn);
  }

  function send(msg) {
    return new Promise(function (resolve, reject) {
      msg.id = nextId++;
      pending[msg.id] = { resolve: resolve, reject: reject };
      worker.postMessage(msg);
    });
  }

  /** Load the model (once) and the saved fingerprints. Resolves when ready. */
  function start() {
    if (started) return started;
    setStatus('loading', 'Loading the language model…');
    started = loadComputed().then(function () {
      worker = new Worker('js/semantic-worker.js', { type: 'module' });
      worker.onmessage = function (ev) {
        var msg = ev.data;
        if (msg.type === 'progress') {
          if (msg.status === 'progress' && /onnx$/.test(msg.file)) {
            setStatus('loading', 'Loading the language model… ' + Math.round(msg.progress) + '%');
          }
          return;
        }
        var p = pending[msg.id];
        delete pending[msg.id];
        if (p) { if (msg.ok) p.resolve(msg); else p.reject(new Error(msg.error)); }
      };
      worker.onerror = function (ev) {
        var err = new Error(ev.message || 'The language model could not start');
        Object.keys(pending).forEach(function (id) { pending[id].reject(err); delete pending[id]; });
      };
      return send({ type: 'load' });
    }).then(function () {
      setStatus('ready', 'Matching by meaning');
    });
    started.catch(function (err) {
      console.warn('Language model unavailable:', err);
      started = null;
      if (worker) { worker.terminate(); worker = null; }
      setStatus('failed', 'The language model couldn’t load, so matching is by words only.');
    });
    return started;
  }

  // The model runs one job at a time; calls queue up here.
  var queue = Promise.resolve();

  function embed(texts) {
    var job = queue.then(function () {
      return send({ type: 'embed', texts: texts });
    }).then(function (out) {
      var dim = out.dims[out.dims.length - 1];
      var vecs = [];
      for (var i = 0; i < texts.length; i++) vecs.push(out.data.slice(i * dim, (i + 1) * dim));
      return vecs;
    });
    queue = job.catch(function () {});
    return job;
  }

  /** Make sure every job ({ key, text }) has a fingerprint, in batches. */
  function ensure(jobs, batch) {
    var seen = {};
    var missing = jobs.filter(function (j) {
      if (lookup(j.key) || seen[j.key]) return false;
      seen[j.key] = true;
      return true;
    });
    var step = function (i) {
      if (i >= missing.length) return Promise.resolve(missing.length);
      var slice = missing.slice(i, i + batch);
      return embed(slice.map(function (j) { return j.text; })).then(function (vecs) {
        slice.forEach(function (j, n) { computed[j.key] = vecs[n]; });
        return step(i + batch);
      });
    };
    return step(0);
  }

  /** The fingerprint of one text, worked out now if it isn't known. */
  function vectorOf(text) {
    var key = hash(text);
    if (computed[key]) return Promise.resolve(computed[key]);
    return embed([text]).then(function (vecs) {
      computed[key] = vecs[0];
      return vecs[0];
    });
  }

  global.Semantic = {
    MODEL: MODEL,
    chunk: chunk,
    hash: hash,
    terms: terms,
    dot: dot,
    start: start,
    ensure: ensure,
    lookup: lookup,
    vectorOf: vectorOf,
    saveComputed: saveComputed,
    clearComputed: clearComputed,
    onStatus: onStatus,
    get status() { return status; },
    get statusText() { return statusText; }
  };
}(window));
