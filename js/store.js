/* ===========================================================================
   store.js — the data in memory, this device's copy of it, and changes.

   Every change goes through Store.add / update / remove. Each one stamps the
   record's updatedAt (merge.js depends on it), saves this device's copy in
   localStorage straight away, tells Sync there is something to upload, and
   tells the page to redraw.

   Prefs are per-device settings that are not part of the data.
   =========================================================================== */

(function (global) {
  'use strict';

  var LOCAL_KEY = 'unify.data';
  var PREFS_KEY = 'unify.prefs';

  var data = Model.empty();
  var rev = 0;
  var listeners = [];

  function load() {
    data = Model.normalise(U.readJson(LOCAL_KEY, null));
  }

  function saveLocal() {
    if (!U.writeJson(LOCAL_KEY, data)) {
      UI.toast('This device is out of storage space — changes may not be kept.', 'error');
    }
  }

  function on(fn) {
    listeners.push(fn);
  }

  function emit(info) {
    listeners.forEach(function (fn) { fn(info || {}); });
  }

  /** After every change: save here, flag for upload, redraw (unless quiet). */
  function commit(opts) {
    opts = opts || {};
    data.updatedAt = U.nowIso();
    rev++;
    saveLocal();
    if (global.Sync) Sync.changed();
    emit(opts);
  }

  function list(kind) {
    return data[kind];
  }

  function get(kind, id) {
    var arr = data[kind];
    for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i];
    return null;
  }

  function add(kind, fields, opts) {
    var now = U.nowIso();
    var rec = Model.normaliseRecord(kind, fields);
    rec.id = U.uid(Model.PREFIX[kind]);
    rec.createdAt = fields && fields.createdAt ? fields.createdAt : now;
    rec.updatedAt = now;
    data[kind].push(rec);
    commit(opts);
    return rec;
  }

  /** Apply a change to a record, noting when each field changed (merge.js). */
  function stamp(rec, patch, now) {
    Object.keys(patch).forEach(function (k) {
      rec[k] = patch[k];
      rec.fieldsAt[k] = now;
    });
    rec.updatedAt = now;
  }

  function update(kind, id, patch, opts) {
    var rec = get(kind, id);
    if (!rec) return null;
    stamp(rec, patch, U.nowIso());
    commit(opts);
    return rec;
  }

  /** Change several records, then save and redraw once. */
  function batch(fn) {
    var now = U.nowIso();
    var touch = function (kind, id, patch) {
      var rec = get(kind, id);
      if (!rec) return null;
      stamp(rec, patch || {}, now);
      return rec;
    };
    fn(touch);
    commit();
  }

  /**
   * Delete a record for good, and the links to it. The deletion is recorded,
   * so other devices delete it too.
   */
  function remove(kind, id) {
    var now = U.nowIso();
    data[kind] = data[kind].filter(function (r) { return r.id !== id; });
    data.deleted[id] = now;
    var without = function (list) { return list.filter(function (x) { return x !== id; }); };
    if (kind === 'problems') {
      data.goals.forEach(function (g) {
        if (g.problemIds.indexOf(id) >= 0) stamp(g, { problemIds: without(g.problemIds) }, now);
      });
      data.journal.forEach(function (e) {
        if (e.problemIds.indexOf(id) >= 0) stamp(e, { problemIds: without(e.problemIds) }, now);
      });
    } else if (kind === 'goals') {
      data.tasks.forEach(function (t) {
        if (t.goalId === id) stamp(t, { goalId: null }, now);
      });
      data.journal.forEach(function (e) {
        if (e.goalIds.indexOf(id) >= 0) stamp(e, { goalIds: without(e.goalIds) }, now);
      });
    } else if (kind === 'tasks') {
      data.journal.forEach(function (e) {
        if (e.taskId === id) stamp(e, { taskId: null }, now);
      });
    }
    commit();
  }

  /** Put a whole copy in place (from GitHub or an import). */
  function replace(newData, opts) {
    data = Model.normalise(newData);
    rev++;
    saveLocal();
    emit(opts || { remote: true });
  }

  /** Forget this device's copy (on signing out). */
  function wipe() {
    data = Model.empty();
    rev++;
    U.removeKey(LOCAL_KEY);
    emit({});
  }

  // ---- worked out from the links -------------------------------------------

  function goalsForProblem(problemId) {
    return data.goals.filter(function (g) { return g.problemIds.indexOf(problemId) >= 0; });
  }

  function problemsForGoal(goal) {
    return goal.problemIds.map(function (id) { return get('problems', id); }).filter(Boolean);
  }

  function tasksForGoal(goalId) {
    return data.tasks.filter(function (t) { return t.goalId === goalId; })
      .sort(function (a, b) { return a.createdAt < b.createdAt ? -1 : 1; });
  }

  /** Journal entries about a problem, goal or task, newest first. */
  function entriesFor(kind, id) {
    return data.journal.filter(function (e) {
      if (kind === 'problems') return e.problemIds.indexOf(id) >= 0;
      if (kind === 'goals') return e.goalIds.indexOf(id) >= 0;
      if (kind === 'tasks') return e.taskId === id;
      return false;
    }).sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; });
  }

  function hasActiveGoal(problemId) {
    return goalsForProblem(problemId).some(function (g) { return g.status === 'active'; });
  }

  /** { done, total } steps of a goal. */
  function progress(goalId) {
    var tasks = tasksForGoal(goalId);
    return {
      done: tasks.filter(function (t) { return t.done; }).length,
      total: tasks.length
    };
  }

  /** The latest time anything to do with a goal changed. */
  function lastActivity(goal) {
    var latest = goal.updatedAt;
    tasksForGoal(goal.id).forEach(function (t) { if (t.updatedAt > latest) latest = t.updatedAt; });
    entriesFor('goals', goal.id).forEach(function (e) { if (e.createdAt > latest) latest = e.createdAt; });
    return latest;
  }

  /** The area a task belongs to: its goal's, or its own. */
  function taskArea(task) {
    var goal = task.goalId ? get('goals', task.goalId) : null;
    return (goal && goal.area) || task.area || '';
  }

  // ---- per-device preferences ------------------------------------------------

  var PREF_DEFAULTS = {
    localOnly: false,        // using Unify on this device only, without GitHub
    loadModel: true,         // start the language model when Unify opens
    askReflection: true,     // ask for a reflection when a task is ticked off
    probes: []               // recent Probe questions on this device
  };

  var Prefs = {
    get: function (key) {
      var p = U.readJson(PREFS_KEY, {});
      return key in p ? p[key] : PREF_DEFAULTS[key];
    },
    set: function (key, value) {
      var p = U.readJson(PREFS_KEY, {});
      p[key] = value;
      U.writeJson(PREFS_KEY, p);
    },
    clear: function () {
      U.removeKey(PREFS_KEY);
    }
  };

  global.Store = {
    load: load,
    on: on,
    list: list,
    get: get,
    add: add,
    update: update,
    batch: batch,
    remove: remove,
    replace: replace,
    wipe: wipe,
    goalsForProblem: goalsForProblem,
    problemsForGoal: problemsForGoal,
    tasksForGoal: tasksForGoal,
    entriesFor: entriesFor,
    hasActiveGoal: hasActiveGoal,
    progress: progress,
    lastActivity: lastActivity,
    taskArea: taskArea,
    get data() { return data; },
    get rev() { return rev; }
  };
  global.Prefs = Prefs;
}(window));
