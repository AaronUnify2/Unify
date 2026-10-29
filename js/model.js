/* ===========================================================================
   model.js — what Unify's data is made of.

   One file, data/unify.json in the private repository, holds everything:

     problems   things causing a negative emotion
     goals      what you'll do about one or more problems (goal.problemIds)
     tasks      the steps toward a goal (task.goalId), or standalone
     journal    free writing, and the reflections written on finishing a task
                or a goal (kind: "reflection")
     deleted    id -> when it was deleted, so a deletion on one device isn't
                undone by the other device's older copy (see merge.js)

   Every record also carries createdAt, updatedAt and fieldsAt (field ->
   when it last changed), so two devices editing different fields of the
   same record both keep their edit.

   Links are kept on one side only: a goal lists its problems, a task names
   its goal, an entry lists what it is about. Everything else is worked out.
   SPEC.md describes every field.
   =========================================================================== */

(function (global) {
  'use strict';

  var SCHEMA = 1;

  var KINDS = ['problems', 'goals', 'tasks', 'journal'];

  var PREFIX = { problems: 'p', goals: 'g', tasks: 't', journal: 'j' };

  var AREAS = ['Diet', 'Family', 'Fitness', 'Health', 'Home', 'Parenting', 'Personal',
    'Relationship', 'Sleep', 'Social Life', 'Study', 'Work'];

  var EMOTIONS = ['Annoyed', 'Anxious', 'Bored', 'Depressed', 'Distracted', 'Disapproving',
    'Disassociated', 'Embarrassed', 'Envy', 'Guilty', 'Impatient', 'Insecure',
    'Let Down', 'Lonely', 'Offended', 'Physical Pain', 'Stressed', 'Tired', 'Vulnerable'];

  var AREA_COLORS = {
    'Diet': '#FF6B6B',
    'Family': '#4ECDC4',
    'Fitness': '#45B7D1',
    'Health': '#96CEB4',
    'Home': '#FFEAA7',
    'Parenting': '#DFE6E9',
    'Personal': '#A29BFE',
    'Relationship': '#FD79A8',
    'Sleep': '#6C5CE7',
    'Social Life': '#FDCB6E',
    'Study': '#74B9FF',
    'Work': '#81ECEC'
  };

  var PROBLEM_DIFFICULTY = {
    1: 'Fixable now',
    2: 'Fixable soon',
    3: 'Fixable with the right resources',
    4: 'Fixable with the right resources and cooperation from others',
    5: 'I do not know how to fix this problem'
  };

  var GOAL_DIFFICULTY = {
    1: 'Achievable now',
    2: 'Achievable soon',
    3: 'Achievable with the right resources',
    4: 'Achievable with the right resources and cooperation from others',
    5: 'I do not know how to achieve this goal'
  };

  var MOODS = [
    { value: 1, face: '😞', label: 'Very low' },
    { value: 2, face: '🙁', label: 'Low' },
    { value: 3, face: '😐', label: 'Okay' },
    { value: 4, face: '🙂', label: 'Good' },
    { value: 5, face: '😄', label: 'Great' }
  ];

  // The fields every record of a kind has, and their defaults.
  var DEFAULTS = {
    problems: { text: '', area: '', emotion: '', difficulty: 0, status: 'open', resolvedAt: null },
    goals: { title: '', why: '', area: '', difficulty: 0, problemIds: [], status: 'active', doneAt: null },
    tasks: { text: '', goalId: null, area: '', notes: '', done: false, doneAt: null, calendar: null },
    journal: { text: '', mood: 0, emotions: [], problemIds: [], goalIds: [], taskId: null, kind: 'entry' }
  };

  function empty() {
    return { app: 'Unify', schema: SCHEMA, updatedAt: null, problems: [], goals: [], tasks: [], journal: [], deleted: {} };
  }

  function copy(value) {
    return JSON.parse(JSON.stringify(value));
  }

  /** A record of a kind with every field present. */
  function normaliseRecord(kind, raw) {
    var rec = copy(DEFAULTS[kind]);
    Object.keys(raw || {}).forEach(function (k) { rec[k] = raw[k]; });
    if (!rec.createdAt) rec.createdAt = rec.updatedAt || new Date().toISOString();
    if (!rec.updatedAt) rec.updatedAt = rec.createdAt;
    if (!rec.fieldsAt || typeof rec.fieldsAt !== 'object' || Array.isArray(rec.fieldsAt)) rec.fieldsAt = {};
    ['problemIds', 'goalIds', 'emotions'].forEach(function (k) {
      if (k in rec && !Array.isArray(rec[k])) rec[k] = [];
    });
    return rec;
  }

  /**
   * Any data file (or nothing) made into the shape the app expects, with
   * records missing an id dropped and links to records that no longer
   * exist removed.
   */
  function normalise(raw) {
    var data = empty();
    raw = raw && typeof raw === 'object' ? raw : {};
    data.updatedAt = raw.updatedAt || null;
    data.deleted = raw.deleted && typeof raw.deleted === 'object' ? copy(raw.deleted) : {};
    KINDS.forEach(function (kind) {
      var seen = {};
      (Array.isArray(raw[kind]) ? raw[kind] : []).forEach(function (r) {
        if (!r || !r.id || seen[r.id]) return;
        seen[r.id] = true;
        data[kind].push(normaliseRecord(kind, r));
      });
    });
    cleanLinks(data);
    return data;
  }

  /** Remove links to records that are not in the data. */
  function cleanLinks(data) {
    var has = {};
    KINDS.forEach(function (kind) {
      has[kind] = {};
      data[kind].forEach(function (r) { has[kind][r.id] = true; });
    });
    data.goals.forEach(function (g) {
      g.problemIds = g.problemIds.filter(function (id) { return has.problems[id]; });
    });
    data.tasks.forEach(function (t) {
      if (t.goalId && !has.goals[t.goalId]) t.goalId = null;
    });
    data.journal.forEach(function (e) {
      e.problemIds = e.problemIds.filter(function (id) { return has.problems[id]; });
      e.goalIds = e.goalIds.filter(function (id) { return has.goals[id]; });
      if (e.taskId && !has.tasks[e.taskId]) e.taskId = null;
    });
    return data;
  }

  function moodOf(value) {
    for (var i = 0; i < MOODS.length; i++) if (MOODS[i].value === value) return MOODS[i];
    return null;
  }

  global.Model = {
    SCHEMA: SCHEMA,
    KINDS: KINDS,
    PREFIX: PREFIX,
    AREAS: AREAS,
    EMOTIONS: EMOTIONS,
    AREA_COLORS: AREA_COLORS,
    PROBLEM_DIFFICULTY: PROBLEM_DIFFICULTY,
    GOAL_DIFFICULTY: GOAL_DIFFICULTY,
    MOODS: MOODS,
    DEFAULTS: DEFAULTS,
    empty: empty,
    copy: copy,
    normaliseRecord: normaliseRecord,
    normalise: normalise,
    cleanLinks: cleanLinks,
    moodOf: moodOf
  };
}(window));
