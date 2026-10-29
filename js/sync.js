/* ===========================================================================
   sync.js — keeping this device and GitHub in step.

   This device's copy is saved on every change (store.js), so Unify opens
   and works without a connection. Sync then:

     - on opening, on coming back to the page, and when back online: reads
       the file on GitHub, merges it with this copy (merge.js), and uploads
       the result if it has anything GitHub's doesn't
     - after a change: uploads a moment later, once typing has paused
     - when the page is hidden or closed: uploads straight away

   An upload names the version it replaces (its sha). If the file changed on
   GitHub in the meantime — the other device saved — GitHub refuses it, and
   Sync reads, merges and tries again.

   State, shown in the header: off · loading · pending · saving · saved ·
   offline · error.
   =========================================================================== */

(function (global) {
  'use strict';

  var SYNC_KEY = 'unify.sync';      // { sha, dirty, lastSyncedAt }
  var SAVE_DELAY = 1500;
  var PULL_GAP = 15000;             // don't re-read on focus more often than this

  var meta = U.readJson(SYNC_KEY, { sha: null, dirty: false, lastSyncedAt: null });
  var state = 'off';
  var detail = '';
  var busy = false;
  var timer = null;
  var lastPull = 0;
  var conflicts = 0;
  var listeners = [];

  function saveMeta() {
    U.writeJson(SYNC_KEY, meta);
  }

  function setState(s, text) {
    state = s;
    detail = text || '';
    listeners.forEach(function (fn) { fn(state, detail); });
  }

  function on(fn) {
    listeners.push(fn);
  }

  function enabled() {
    return !!GitHub.config();
  }

  function fileText() {
    var d = Store.data;
    var out = {
      app: 'Unify',
      schema: Model.SCHEMA,
      updatedAt: d.updatedAt,
      problems: d.problems,
      goals: d.goals,
      tasks: d.tasks,
      journal: d.journal,
      deleted: d.deleted
    };
    return JSON.stringify(out, null, 2) + '\n';
  }

  function handleError(err) {
    if (err && err.fatal) {
      setState('error', err.message);
    } else if (!navigator.onLine || err instanceof TypeError) {
      setState('offline', 'Saved on this device. It will upload when you’re back online.');
    } else {
      setState('error', (err && err.message) || 'Something went wrong while syncing.');
    }
  }

  /** Called by the store after every change. */
  function changed() {
    meta.dirty = true;
    saveMeta();
    if (!enabled()) return;
    if (state !== 'saving' && state !== 'loading') setState('pending');
    schedule(SAVE_DELAY);
  }

  function schedule(delay) {
    clearTimeout(timer);
    timer = setTimeout(function () {
      timer = null;
      push();
    }, delay);
  }

  /** Read GitHub's copy, merge it with this one, and upload if needed. */
  function pull() {
    if (!enabled()) return Promise.resolve();
    if (busy) { schedule(1000); return Promise.resolve(); }
    busy = true;
    lastPull = Date.now();
    setState('loading');
    var cfg = GitHub.config();
    return GitHub.getFile(cfg).then(function (remote) {
      busy = false;
      if (!remote.exists) {
        // The first sync to this repository: create the file from this copy
        meta.sha = null;
        meta.dirty = true;
        saveMeta();
        return push();
      }
      var remoteData;
      try {
        remoteData = Model.normalise(JSON.parse(remote.text));
      } catch (e) {
        var err = new Error('The data file on GitHub (' + cfg.path + ') isn’t valid JSON, so it wasn’t loaded or overwritten. Fix it on GitHub, then sync again.');
        err.fatal = true;
        throw err;
      }
      var local = Store.data;
      var merged = Merge.merge(local, remoteData);
      if (!Merge.same(merged, local)) Store.replace(merged, { remote: true });
      meta.sha = remote.sha;
      meta.dirty = !Merge.same(merged, remoteData);
      if (!meta.dirty) meta.lastSyncedAt = U.nowIso();
      saveMeta();
      if (meta.dirty) return push();
      conflicts = 0;
      setState('saved');
    }).catch(function (err) {
      busy = false;
      handleError(err);
    });
  }

  /** Upload this copy, replacing the version last read. */
  function push(keepalive) {
    if (!enabled()) return Promise.resolve();
    if (busy) { schedule(1000); return Promise.resolve(); }
    if (!meta.dirty) { setState('saved'); return Promise.resolve(); }
    clearTimeout(timer);
    timer = null;
    busy = true;
    setState('saving');
    var revAtStart = Store.rev;
    return GitHub.putFile(GitHub.config(), fileText(), meta.sha, keepalive).then(function (sha) {
      busy = false;
      conflicts = 0;
      meta.sha = sha;
      meta.lastSyncedAt = U.nowIso();
      if (Store.rev === revAtStart) meta.dirty = false;
      saveMeta();
      if (meta.dirty) {
        setState('pending');
        schedule(SAVE_DELAY);
      } else {
        setState('saved');
      }
    }).catch(function (err) {
      busy = false;
      if (err && err.conflict) {
        // The other device saved first: read its copy, merge, upload again
        conflicts++;
        if (conflicts > 3) {
          setState('error', 'GitHub kept refusing the upload because the file keeps changing. Try Sync now in Settings.');
          return;
        }
        return pull();
      }
      handleError(err);
    });
  }

  /** Sync now: read, merge, upload. */
  function now() {
    conflicts = 0;
    return pull();
  }

  function start() {
    if (!enabled()) {
      setState('off');
      return;
    }
    pull();
  }

  /** Forget the sync state (on signing out or changing repository). */
  function reset() {
    clearTimeout(timer);
    meta = { sha: null, dirty: Store.data.updatedAt !== null, lastSyncedAt: null };
    saveMeta();
    setState(enabled() ? 'pending' : 'off');
  }

  document.addEventListener('visibilitychange', function () {
    if (!enabled()) return;
    if (document.visibilityState === 'hidden') {
      if (meta.dirty && !busy) push(true);
    } else if (Date.now() - lastPull > PULL_GAP) {
      pull();
    }
  });

  global.addEventListener('pagehide', function () {
    if (enabled() && meta.dirty && !busy) push(true);
  });

  global.addEventListener('online', function () {
    if (enabled()) pull();
  });

  global.Sync = {
    on: on,
    start: start,
    changed: changed,
    now: now,
    reset: reset,
    get state() { return state; },
    get detail() { return detail; },
    get dirty() { return meta.dirty; },
    get lastSyncedAt() { return meta.lastSyncedAt; }
  };
}(window));
