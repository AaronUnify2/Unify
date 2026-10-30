/* ===========================================================================
   live.js — keeping a shared session and your tasks in step.

   While the open session is shared (session.shareId) and Unify is open,
   this watches the shared copy (share.js) and, each time either side
   changes, brings them together:

     - your tasks, in the session's order, are written to the shared copy:
       text, notes, the goal's title if you chose to show goals, the order
     - ticks go both ways. When a task is ticked on one side and not the
       other, the side that changed more recently wins: the shared item's
       `at` against the task's fieldsAt.done. A tick from a helper ticks
       your task quietly, without asking for a reflection
     - something a helper added (an x_ item) waits for you: keep() makes it
       a task in Unify, discard() removes it
     - an item for a task that's no longer in the session is removed

   Everything goes through Store, so the merge between your devices keeps
   working as usual.
   =========================================================================== */

(function (global) {
  'use strict';

  var code = null;          // the shared session being watched
  var stop = null;
  var snap = null;          // the shared copy as last seen
  var status = 'off';       // off · connecting · live · offline · refused · missing
  var seen = {};            // helper additions already announced on this page
  var timer = null;
  var listeners = [];

  function ownerName() {
    return Prefs.get('shareName') || '';
  }

  function notify() {
    listeners.forEach(function (fn) { fn(); });
    if (global.App) App.requestRender();
  }

  function setStatus(s) {
    if (s === status) return;
    status = s;
    notify();
  }

  // ---- watching ----------------------------------------------------------------

  /** Watch the open session if it's shared, and stop watching anything else. */
  function ensure() {
    var s = Store.openSession();
    var want = s && s.shareId && Share.configured() ? s.shareId : null;
    if (want === code) return;
    if (stop) stop();
    stop = null;
    snap = null;
    code = want;
    if (!code) {
      setStatus('off');
      return;
    }
    stop = Share.watch(code, onData, function (st) {
      // A session that's gone stays reported as gone, even as it reconnects
      if (st === 'live' && snap === null) return;
      setStatus(st);
    });
  }

  function onData(data) {
    snap = data;
    if (snap === null) {
      setStatus('missing');
      return;
    }
    status = 'live';
    announce();
    reconcile();
    notify();
  }

  /** Say once when helpers have added something. */
  function announce() {
    var fresh = pending().filter(function (item) { return !seen[item.key]; });
    if (!fresh.length) return;
    fresh.forEach(function (item) { seen[item.key] = true; });
    var names = [];
    fresh.forEach(function (item) {
      var name = item.addedBy || 'Someone';
      if (names.indexOf(name) < 0) names.push(name);
    });
    var s = Store.openSession();
    UI.toast(names.join(' and ') + ' added ' + U.plural(fresh.length, 'task') +
      (s && s.title ? ' to ' + s.title : '') + ' — check Session');
  }

  // ---- bringing the two together -------------------------------------------------------

  // The database's rules (firebase-rules.json) refuse anything longer
  function clip(text, max) {
    return String(text || '').slice(0, max);
  }

  function titleOf(session) {
    return clip(session.title, 120);
  }

  /** What the shared copy should say about a task. */
  function itemFor(task, index, session) {
    var goal = session.shareGoals && task.goalId ? Store.get('goals', task.goalId) : null;
    return {
      text: clip(task.text.trim() || 'Untitled task', 300),
      notes: clip(task.notes, 2000),
      goal: goal ? clip(goal.title, 200) : '',
      order: index
    };
  }

  function localDoneAt(task) {
    return task.fieldsAt.done || task.createdAt || '';
  }

  /** Compare the shared copy with your tasks and fix whichever side is behind. */
  function reconcile() {
    var s = Store.openSession();
    if (!s || !code || s.shareId !== code || !snap) return;
    var items = snap.items || {};
    var changes = {};
    var ticks = [];

    if ((snap.title || '') !== titleOf(s)) changes.title = titleOf(s);
    if ((snap.date || '') !== (s.date || '')) changes.date = s.date || '';

    s.taskIds.forEach(function (id, i) {
      var task = Store.get('tasks', id);
      if (!task) return;
      var want = itemFor(task, i, s);
      var have = items[id];
      if (!have) {
        var item = want;
        item.done = !!task.done;
        item.at = localDoneAt(task);
        if (task.done) item.doneBy = ownerName();
        changes['items/' + id] = item;
        return;
      }
      ['text', 'notes', 'goal', 'order'].forEach(function (k) {
        var cur = have[k] == null ? (k === 'order' ? -1 : '') : have[k];
        if (cur !== want[k]) changes['items/' + id + '/' + k] = want[k];
      });
      if (!!have.done !== !!task.done) {
        if ((have.at || '') > localDoneAt(task)) {
          ticks.push({ id: id, done: !!have.done, at: have.at });
        } else {
          changes['items/' + id + '/done'] = !!task.done;
          changes['items/' + id + '/at'] = localDoneAt(task);
          changes['items/' + id + '/doneBy'] = task.done ? ownerName() : null;
        }
      }
    });

    // Items for tasks no longer in the session (helpers' additions stay)
    Object.keys(items).forEach(function (key) {
      if (key.indexOf('x_') !== 0 && s.taskIds.indexOf(key) < 0) changes['items/' + key] = null;
    });

    if (ticks.length) {
      Store.batch(function (touch) {
        ticks.forEach(function (t) {
          touch('tasks', t.id, { done: t.done, doneAt: t.done ? t.at : null });
        });
      }, { remote: true });
    }
    if (Object.keys(changes).length) {
      Share.patch(code, changes).catch(function () {
        // Offline: the next change, or reconnecting, tries again
        setStatus('offline');
      });
    }
  }

  var reconcileSoon = U.debounce(function () { reconcile(); }, 300);

  // ---- what the section asks for ------------------------------------------------------

  /** Helpers' additions waiting for you, in order. */
  function pending() {
    return Share.items(snap).filter(function (item) { return item.key.indexOf('x_') === 0; });
  }

  /** The shared item for a task, if it's there. */
  function item(taskId) {
    var map = (snap && snap.items) || {};
    return map[taskId] || null;
  }

  /** Share a session: write it to the database, then remember its code. */
  function share(session, opts) {
    var newCode = Share.newCode();
    var shareGoals = !!opts.shareGoals;
    var owner = clip(opts.owner, 40);
    Prefs.set('shareName', owner);
    var items = {};
    session.taskIds.forEach(function (id, i) {
      var task = Store.get('tasks', id);
      if (!task) return;
      var it = itemFor(task, i, { shareGoals: shareGoals });
      it.done = !!task.done;
      it.at = localDoneAt(task);
      if (task.done && owner) it.doneBy = owner;
      items[id] = it;
    });
    var body = {
      title: titleOf(session),
      date: session.date || '',
      owner: owner,
      createdAt: U.nowIso(),
      items: items
    };
    return Share.put(newCode, body).then(function () {
      Store.update('sessions', session.id, { shareId: newCode, sharedAt: U.nowIso(), shareGoals: shareGoals });
      return newCode;
    });
  }

  /** Stop sharing: delete the shared copy, so the link stops working. */
  function unshare(session) {
    var old = session.shareId;
    if (!old) return Promise.resolve();
    return Share.remove(old).then(function () {
      Store.update('sessions', session.id, { shareId: null });
    });
  }

  /** Keep a helper's addition: a new task, in the session where it was. */
  function keep(key, goalId) {
    var s = Store.openSession();
    var it = snap && snap.items && snap.items[key];
    if (!s || !it) return null;
    var task = Store.add('tasks', {
      text: it.text || 'Untitled task',
      notes: it.notes || '',
      goalId: goalId || null,
      done: !!it.done,
      doneAt: it.done ? it.at || U.nowIso() : null
    });
    // Before the first item that comes after it
    var ids = s.taskIds.slice();
    var at = ids.length;
    for (var i = 0; i < ids.length; i++) {
      var other = snap.items[ids[i]];
      if (other && typeof other.order === 'number' && other.order > it.order) { at = i; break; }
    }
    ids.splice(at, 0, task.id);
    Store.update('sessions', s.id, { taskIds: ids });
    var moved = {};
    Object.keys(it).forEach(function (k) { moved[k] = it[k]; });
    var changes = {};
    changes['items/' + key] = null;
    changes['items/' + task.id] = moved;
    Share.patch(code, changes).catch(function () { setStatus('offline'); });
    return task;
  }

  function discard(key) {
    var changes = {};
    changes['items/' + key] = null;
    return Share.patch(code, changes);
  }

  function start() {
    Store.on(function () {
      ensure();
      reconcileSoon();
    });
    ensure();
  }

  global.Live = {
    start: start,
    ensure: ensure,
    share: share,
    unshare: unshare,
    keep: keep,
    discard: discard,
    pending: pending,
    item: item,
    owner: ownerName,
    on: function (fn) { listeners.push(fn); },
    get status() { return status; },
    get code() { return code; },
    get snap() { return snap; }
  };
}(window));
