/* ===========================================================================
   probe.js — "have I been here before?", gaps, and patterns.

   No drawing here: views-probe.js shows what this finds.

     search(text)     everything you've written that is like this text:
                      problems, goals, steps, journal entries, reflections
     gaps()           problems with no goal, goals with no next step, goals
                      gone quiet
     patterns()       which area and emotion keep coming back together
     related()        open problems that seem to be about the same thing

   Matching blends the language model's similarity with a keyword score. If
   the model isn't loaded (or can't load), it matches on words alone and
   says so.
   =========================================================================== */

(function (global) {
  'use strict';

  // Scores are the model's similarity plus a small bonus for shared words.
  // Short personal sentences score lower than you'd think: "I lose my temper
  // with my children" against "I keep snapping at the kids" is about 0.43,
  // "the shed needs a clean out" against "the garage is a mess" about 0.27.
  var STRONG = 0.5;        // much the same thing
  var WEAK = 0.27;         // might be related; below this, nothing really matches
  var KEYWORD_BONUS = 0.15;
  var WORDS_STRONG = 0.6;  // the same, when matching on words only
  var WORDS_WEAK = 0.3;
  var RELATED_PAIR = 0.5;  // two problems this close seem to be the same thing
  var QUIET_DAYS = 14;     // a goal with nothing done for this long has gone quiet
  var HISTORY = 12;        // recent probes kept on this device

  /** Everything searchable, as passages: { kind, id, text, key }. */
  function corpus(kinds) {
    var out = [];
    var want = function (k) { return !kinds || kinds.indexOf(k) >= 0; };
    var add = function (kind, id, text) {
      text = String(text || '').replace(/\s+/g, ' ').trim();
      if (text) out.push({ kind: kind, id: id, text: text, key: Semantic.hash(text) });
    };
    if (want('problems')) Store.list('problems').forEach(function (p) { add('problems', p.id, p.text); });
    if (want('goals')) Store.list('goals').forEach(function (g) { add('goals', g.id, g.title + (g.why ? '. ' + g.why : '')); });
    if (want('tasks')) Store.list('tasks').forEach(function (t) { add('tasks', t.id, t.text + (t.notes ? '. ' + t.notes : '')); });
    if (want('journal')) Store.list('journal').forEach(function (e) {
      Semantic.chunk(e.text).forEach(function (passage) { add('journal', e.id, passage); });
    });
    return out;
  }

  /** How much of the query's wording each passage has, rare words counting more. */
  function keywordScores(query, items) {
    var q = Semantic.terms(query);
    var qKeys = Object.keys(q);
    var df = {};
    var itemTerms = items.map(function (it) {
      var t = Semantic.terms(it.text);
      Object.keys(t).forEach(function (w) { df[w] = (df[w] || 0) + 1; });
      return t;
    });
    var n = items.length;
    var idf = function (w) { return Math.log((n + 1) / ((df[w] || 0) + 1)) + 1; };
    var total = 0;
    qKeys.forEach(function (w) { total += idf(w); });
    return itemTerms.map(function (t) {
      if (!total) return 0;
      var hit = 0;
      qKeys.forEach(function (w) { if (t[w]) hit += idf(w); });
      return hit / total;
    });
  }

  /** Whether to use the model: 'meaning' if it's ready, or once it loads when wait is set. */
  function modelReady(wait) {
    if (Semantic.status === 'ready') return Promise.resolve(true);
    if (!wait || Semantic.status === 'failed') return Promise.resolve(false);
    return Semantic.start().then(function () { return true; }, function () { return false; });
  }

  /**
   * Search everything for text. opts: kinds (limit to these), exclude (an
   * id to leave out), wait (load the model first if it isn't loaded).
   * Resolves to { mode: 'meaning' | 'words', strong, weak, results:
   * [{ kind, id, score, passage }] } — the best passage of each record.
   */
  function search(text, opts) {
    opts = opts || {};
    var items = corpus(opts.kinds).filter(function (it) { return it.id !== opts.exclude; });
    var kw = keywordScores(text, items);
    return modelReady(opts.wait).then(function (useModel) {
      if (!useModel || !items.length) return { mode: 'words', scores: kw };
      return Semantic.ensure(items, 16).then(function () {
        return Semantic.vectorOf(text);
      }).then(function (qv) {
        Semantic.saveComputed(corpus().map(function (it) { return it.key; }));
        return {
          mode: 'meaning',
          scores: items.map(function (it, i) {
            var v = Semantic.lookup(it.key);
            var sim = v ? Semantic.dot(qv, v) : 0;
            return sim + KEYWORD_BONUS * kw[i];
          })
        };
      }, function () {
        return { mode: 'words', scores: kw };
      });
    }).then(function (out) {
      var best = {};
      items.forEach(function (it, i) {
        var k = it.kind + ':' + it.id;
        if (!best[k] || out.scores[i] > best[k].score) {
          best[k] = { kind: it.kind, id: it.id, score: out.scores[i], passage: it.text };
        }
      });
      var strong = out.mode === 'meaning' ? STRONG : WORDS_STRONG;
      var weak = out.mode === 'meaning' ? WEAK : WORDS_WEAK;
      var results = Object.keys(best).map(function (k) { return best[k]; })
        .filter(function (r) { return r.score >= weak; })
        .sort(function (a, b) { return b.score - a.score; });
      return { mode: out.mode, strong: strong, weak: weak, results: results.slice(0, opts.limit || 30) };
    });
  }

  /** The things that need a decision. */
  function gaps() {
    var openProblems = Store.list('problems').filter(function (p) { return p.status === 'open'; });
    var activeGoals = Store.list('goals').filter(function (g) { return g.status === 'active'; });
    var byAge = function (a, b) { return a.createdAt < b.createdAt ? -1 : 1; };
    return {
      noGoal: openProblems.filter(function (p) { return !Store.hasActiveGoal(p.id); }).sort(byAge),
      noNextStep: activeGoals.filter(function (g) {
        return !Store.tasksForGoal(g.id).some(function (t) { return !t.done; });
      }).sort(byAge),
      quiet: activeGoals.map(function (g) {
        return { goal: g, last: Store.lastActivity(g) };
      }).filter(function (x) {
        return U.daysSince(x.last) >= QUIET_DAYS;
      }).sort(function (a, b) { return a.last < b.last ? -1 : 1; })
    };
  }

  /**
   * What keeps coming back: area and emotion pairs among problems (open
   * ones, and all of them), and the emotions named in problems and the
   * journal in the last 90 days.
   */
  function patterns() {
    var pairs = {};
    Store.list('problems').forEach(function (p) {
      if (!p.area || !p.emotion) return;
      var k = p.area + '|' + p.emotion;
      if (!pairs[k]) pairs[k] = { area: p.area, emotion: p.emotion, open: 0, total: 0, reachedGoal: 0 };
      pairs[k].total++;
      if (p.status === 'open') pairs[k].open++;
      if (Store.goalsForProblem(p.id).length) pairs[k].reachedGoal++;
    });
    var combos = Object.keys(pairs).map(function (k) { return pairs[k]; })
      .filter(function (c) { return c.total >= 2; })
      .sort(function (a, b) { return b.total - a.total || b.open - a.open; })
      .slice(0, 8);

    var since = Date.now() - 90 * 86400000;
    var emotions = {};
    Store.list('problems').forEach(function (p) {
      if (p.emotion && new Date(p.createdAt).getTime() >= since) emotions[p.emotion] = (emotions[p.emotion] || 0) + 1;
    });
    Store.list('journal').forEach(function (e) {
      if (new Date(e.createdAt).getTime() < since) return;
      e.emotions.forEach(function (em) { emotions[em] = (emotions[em] || 0) + 1; });
    });
    var feelings = Object.keys(emotions).map(function (k) { return { emotion: k, count: emotions[k] }; })
      .sort(function (a, b) { return b.count - a.count; })
      .slice(0, 8);

    return { combos: combos, feelings: feelings };
  }

  /**
   * Open problems that seem to be about the same thing, in groups of two or
   * more, leaving out groups that already share a goal. Needs the model:
   * resolves to null if it isn't ready.
   */
  function related() {
    if (Semantic.status !== 'ready') return Promise.resolve(null);
    var problems = Store.list('problems').filter(function (p) { return p.status === 'open' && p.text.trim(); });
    var jobs = problems.map(function (p) {
      var text = p.text.replace(/\s+/g, ' ').trim();
      return { key: Semantic.hash(text), text: text };
    });
    return Semantic.ensure(jobs, 16).then(function () {
      var parent = problems.map(function (p, i) { return i; });
      var find = function (i) { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
      for (var i = 0; i < problems.length; i++) {
        for (var j = i + 1; j < problems.length; j++) {
          var a = Semantic.lookup(jobs[i].key), b = Semantic.lookup(jobs[j].key);
          if (a && b && Semantic.dot(a, b) >= RELATED_PAIR) parent[find(i)] = find(j);
        }
      }
      var groups = {};
      problems.forEach(function (p, i) {
        var r = find(i);
        (groups[r] = groups[r] || []).push(p);
      });
      return Object.keys(groups).map(function (k) { return groups[k]; }).filter(function (g) {
        if (g.length < 2) return false;
        // Already together under one active goal? Then it's been dealt with.
        var shared = Store.goalsForProblem(g[0].id).filter(function (goal) {
          return goal.status === 'active' && g.every(function (p) { return goal.problemIds.indexOf(p.id) >= 0; });
        });
        return !shared.length;
      }).slice(0, 6);
    });
  }

  // ---- recent probes, on this device -----------------------------------------

  function history() {
    return Prefs.get('probes') || [];
  }

  function remember(text) {
    var list = history().filter(function (q) { return q !== text; });
    list.unshift(text);
    Prefs.set('probes', list.slice(0, HISTORY));
  }

  function forget() {
    Prefs.set('probes', []);
  }

  global.Probe = {
    STRONG: STRONG,
    WEAK: WEAK,
    QUIET_DAYS: QUIET_DAYS,
    search: search,
    gaps: gaps,
    patterns: patterns,
    related: related,
    history: history,
    remember: remember,
    forget: forget
  };
}(window));
