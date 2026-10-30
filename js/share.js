/* ===========================================================================
   share.js — talking to the sharing database (Firebase Realtime Database).

   A shared session lives at /sessions/<code> while it is shared, and is
   deleted when you stop sharing or finish it. The code is long and random,
   and is the only way in: the database's rules (firebase-rules.json) let
   anyone who has a code read and change that session, and nothing else.

     /sessions/<code>
       title, date, owner, createdAt
       items/<key>   text, notes, goal, order, done, doneBy, at, addedBy
                     key: a task's id (t_…), or x_… for something a helper
                     added, which waits for you to keep or discard it

   Plain fetch and EventSource on Firebase's REST interface, no library.
   EventSource keeps a connection open, and Firebase sends every change
   down it as it happens, so everyone looking sees ticks straight away.

   Used by the app (live.js) and by the shared page (session.html).
   =========================================================================== */

(function (global) {
  'use strict';

  // The database's address, from the Firebase console (Realtime Database →
  // Data, at the top). Empty means sharing isn't set up yet. Not a secret.
  var DATABASE = '';

  var ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
  var CODE_LENGTH = 24;

  function configured() {
    return !!DATABASE;
  }

  function url(path) {
    return DATABASE.replace(/\/+$/, '') + '/sessions/' + path + '.json';
  }

  /** A new random code: 24 letters and digits, about 124 bits. */
  function newCode() {
    var bytes = new Uint8Array(CODE_LENGTH);
    crypto.getRandomValues(bytes);
    var out = '';
    for (var i = 0; i < bytes.length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
    return out;
  }

  /** A new key for something a helper adds. */
  function newItemKey() {
    return 'x_' + Date.now().toString(36) + newCode().slice(0, 6);
  }

  /** Codes are letters and digits only; anything else isn't a code. */
  function validCode(code) {
    return /^[a-z0-9]{20,40}$/.test(code || '');
  }

  /** The link to the shared page for a code. */
  function link(code) {
    return location.origin + location.pathname.replace(/[^/]*$/, '') + 'session.html#' + code;
  }

  function request(method, path, body) {
    var opts = { method: method, headers: { 'Content-Type': 'application/json' } };
    if (body !== undefined) opts.body = JSON.stringify(body);
    return fetch(url(path), opts).catch(function () {
      throw new Error('Couldn’t reach the sharing database. Check your connection and try again.');
    }).then(function (res) {
      if (!res.ok) {
        var err = new Error(res.status === 401 || res.status === 403
          ? 'The sharing database refused this. Check its rules (see the README).'
          : 'The sharing database answered ' + res.status + '.');
        err.status = res.status;
        throw err;
      }
      return res.json();
    });
  }

  /** Write a whole session. */
  function put(code, value) {
    return request('PUT', code, value);
  }

  /**
   * Change parts of a session. Keys are paths inside it, e.g.
   * { 'items/t_x/done': true, 'items/x_y': null } — null removes.
   */
  function patch(code, changes) {
    return request('PATCH', code, changes);
  }

  /** Delete a session: its link stops working. */
  function remove(code) {
    return request('DELETE', code);
  }

  // ---- watching ------------------------------------------------------------------

  /** Set a value at a path ("/items/t_x/done") in a copy of the session. */
  function setAt(root, path, value) {
    var parts = path.split('/').filter(Boolean);
    if (!parts.length) return value;
    if (!root || typeof root !== 'object') root = {};
    var node = root;
    for (var i = 0; i < parts.length - 1; i++) {
      if (!node[parts[i]] || typeof node[parts[i]] !== 'object') node[parts[i]] = {};
      node = node[parts[i]];
    }
    var last = parts[parts.length - 1];
    if (value === null) delete node[last];
    else node[last] = value;
    return root;
  }

  /**
   * Keep up with a session. onData(session) is called with the whole session
   * each time anything in it changes (null if it doesn't exist); onStatus(s)
   * with 'connecting', 'live', 'offline' or 'refused'. Returns a function
   * that stops watching.
   */
  function watch(code, onData, onStatus) {
    var snap = null;
    var stopped = false;
    var source = new EventSource(url(code));
    onStatus('connecting');

    function data(ev) {
      try { return JSON.parse(ev.data); } catch (e) { return null; }
    }

    source.addEventListener('put', function (ev) {
      var msg = data(ev);
      if (!msg || stopped) return;
      snap = setAt(snap, msg.path, msg.data);
      onStatus('live');
      onData(snap);
    });
    source.addEventListener('patch', function (ev) {
      var msg = data(ev);
      if (!msg || !msg.data || stopped) return;
      Object.keys(msg.data).forEach(function (key) {
        snap = setAt(snap, msg.path.replace(/\/$/, '') + '/' + key, msg.data[key]);
      });
      onData(snap);
    });
    // The rules turned the connection down
    source.addEventListener('cancel', function () {
      if (stopped) return;
      source.close();
      onStatus('refused');
    });
    source.onerror = function () {
      // EventSource tries again by itself; this says so in the meantime
      if (!stopped && source.readyState !== 2) onStatus('offline');
      else if (!stopped) onStatus('refused');
    };

    return function stop() {
      stopped = true;
      source.close();
    };
  }

  /** The items of a session as a list, in order, each with its key. */
  function items(session) {
    var map = (session && session.items) || {};
    return Object.keys(map).map(function (key) {
      var item = map[key];
      return {
        key: key,
        text: item.text || '',
        notes: item.notes || '',
        goal: item.goal || '',
        order: typeof item.order === 'number' ? item.order : 0,
        done: !!item.done,
        doneBy: item.doneBy || '',
        at: item.at || '',
        addedBy: item.addedBy || ''
      };
    }).sort(function (a, b) {
      return a.order - b.order || (a.at < b.at ? -1 : 1);
    });
  }

  global.Share = {
    configured: configured,
    newCode: newCode,
    newItemKey: newItemKey,
    validCode: validCode,
    link: link,
    put: put,
    patch: patch,
    remove: remove,
    watch: watch,
    items: items
  };
}(window));
