/* ===========================================================================
   account.js — signing in with Google, and each person's data in Firebase.

   Signing in uses Firebase Authentication (the Firebase library in
   vendor/firebase-12.19.0). It's loaded only on the first screen, in
   Settings, and for someone who has signed in; nothing anyone writes goes
   to Firebase unless they've signed in. Each person's data is
   one file, kept as text in the Realtime Database at /users/<uid>/file —
   the same file that otherwise lives on GitHub — and the rules
   (firebase-rules.json) let only that signed-in person read or write it.

   getFile and putFile work like GitHub's (github.js), so Sync treats the
   two the same: a version tag (the database's ETag) comes with every read,
   and a write naming an older one is refused, so Sync reads, merges and
   tries again.
   =========================================================================== */

(function (global) {
  'use strict';

  // From the Firebase console: Project settings → General → Your apps → the
  // web app's config. None of it is secret; the database's rules are what
  // protect each person's data. Empty apiKey means accounts aren't set up.
  var CONFIG = {
    apiKey: 'AIzaSyAMv8yD8yYeoHN2USc-w8WQ1vhEt1Z_0no',
    authDomain: 'unify-sessions.firebaseapp.com',
    projectId: 'unify-sessions',
    appId: '1:475397974408:web:a0bf90904025638fe5323d',
    databaseURL: 'https://unify-sessions-default-rtdb.asia-southeast1.firebasedatabase.app'
  };

  var SCRIPTS = [
    'vendor/firebase-12.19.0/firebase-app-compat.js',
    'vendor/firebase-12.19.0/firebase-auth-compat.js'
  ];

  // Set by tests to use the Firebase emulators instead
  var EMULATOR = null;   // { auth: 'http://127.0.0.1:9099', database: 'http://…' }

  var auth = null;
  var user = null;
  var known = false;      // whether Firebase has said who's signed in yet
  var loading = null;
  var listeners = [];

  function configured() {
    return !!CONFIG.apiKey;
  }

  function databaseURL() {
    return (EMULATOR && EMULATOR.database) || CONFIG.databaseURL;
  }

  function notify() {
    listeners.forEach(function (fn) { fn(user); });
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var el = document.createElement('script');
      el.src = src;
      el.onload = resolve;
      el.onerror = function () { reject(new Error('Couldn’t load ' + src)); };
      document.head.appendChild(el);
    });
  }

  /**
   * Load the Firebase library and find out who's signed in on this device.
   * Resolves with the user (or null) once Firebase knows.
   */
  function load() {
    if (loading) return loading;
    if (!configured()) return Promise.resolve(null);
    loading = SCRIPTS.reduce(function (p, src) {
      return p.then(function () { return loadScript(src); });
    }, Promise.resolve()).then(function () {
      var app = global.firebase.initializeApp(CONFIG);
      auth = app.auth();
      if (EMULATOR && EMULATOR.auth) auth.useEmulator(EMULATOR.auth, { disableWarnings: true });
      return new Promise(function (resolve) {
        auth.onAuthStateChanged(function (u) {
          user = u || null;
          var first = !known;
          known = true;
          if (first) {
            resolve(user);
            // Sign-in buttons drawn before now can open Google's window at once
            document.querySelectorAll('.google-btn[disabled]').forEach(function (btn) { btn.disabled = false; });
          }
          notify();
        });
      });
    });
    loading.catch(function () { loading = null; });
    return loading;
  }

  /** Sign in with Google: a popup, or a full-page redirect where popups can't open. */
  function signIn() {
    return load().then(function () {
      var provider = new global.firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      return auth.signInWithPopup(provider).catch(function (e) {
        if (e && (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment')) {
          return auth.signInWithRedirect(provider);
        }
        throw e;
      });
    }).then(function () { return user; });
  }

  /** What went wrong signing in, in words; null if it was just closed. */
  function errorText(e) {
    var code = e && e.code;
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return null;
    if (code === 'auth/network-request-failed') return 'Couldn’t reach Google. Check your connection and try again.';
    if (code === 'auth/unauthorized-domain') return 'This address isn’t allowed to sign in yet (Firebase → Authentication → Settings → Authorized domains).';
    return (e && e.message) || 'Signing in didn’t work.';
  }

  function signOut() {
    return auth ? auth.signOut() : Promise.resolve();
  }

  function token() {
    if (!user) return Promise.reject(new Error('Not signed in.'));
    return user.getIdToken();
  }

  // ---- the data file -------------------------------------------------------------

  function fileUrl(idToken) {
    return databaseURL().replace(/\/+$/, '') + '/users/' + encodeURIComponent(user.uid) + '/file.json?auth=' + encodeURIComponent(idToken);
  }

  function request(method, body, headers, keepalive) {
    return token().then(function (idToken) {
      var opts = { method: method, headers: headers || {} };
      if (body !== undefined) opts.body = body;
      if (keepalive) opts.keepalive = true;
      return fetch(fileUrl(idToken), opts);
    });
  }

  function failure(res) {
    var err = new Error(res.status === 401 || res.status === 403
      ? 'Your account refused this. Try signing out and in again.'
      : 'Saving to your account didn’t work (' + res.status + ').');
    err.status = res.status;
    return err;
  }

  /** The data file: { exists, sha (the version tag), text }, as github.js gives it. */
  function getFile() {
    return request('GET', undefined, { 'X-Firebase-ETag': 'true' }).then(function (res) {
      if (!res.ok) throw failure(res);
      var etag = res.headers.get('ETag');
      return res.json().then(function (value) {
        if (typeof value !== 'string') return { exists: false, sha: etag };
        return { exists: true, sha: etag, text: value };
      });
    });
  }

  /**
   * Write the data file over the version last read (sha). Resolves to the
   * new version tag; a rejection with .conflict set means it changed since.
   */
  function putFile(text, sha, keepalive) {
    var headers = { 'Content-Type': 'application/json', 'X-Firebase-ETag': 'true' };
    if (sha) headers['if-match'] = sha;
    var body = JSON.stringify(text);
    return request('PUT', body, headers, !!keepalive && body.length < 60000).then(function (res) {
      if (res.status === 412) {
        var err = new Error('Your data changed on another device.');
        err.conflict = true;
        throw err;
      }
      if (!res.ok) throw failure(res);
      return res.headers.get('ETag');
    });
  }

  /** Delete this person's data, then their account. */
  function deleteEverything() {
    return request('DELETE').then(function (res) {
      if (!res.ok) throw failure(res);
      return user.delete().catch(function (e) {
        // Deleting an account needs a recent sign-in: ask once more, then delete
        if (e && e.code === 'auth/requires-recent-login') {
          var provider = new global.firebase.auth.GoogleAuthProvider();
          return user.reauthenticateWithPopup(provider).then(function () { return user.delete(); });
        }
        throw e;
      });
    });
  }

  global.Account = {
    configured: configured,
    load: load,
    signIn: signIn,
    signOut: signOut,
    errorText: errorText,
    getFile: getFile,
    putFile: putFile,
    deleteEverything: deleteEverything,
    on: function (fn) { listeners.push(fn); },
    get user() { return user; },
    get ready() { return !!auth; },
    get known() { return known; },
    set emulator(value) { EMULATOR = value; }
  };
}(window));
