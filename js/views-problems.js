/* ===========================================================================
   views-problems.js — the Problems section.

   A problem is something causing a negative emotion, with a life area, the
   emotion and how hard it seems to fix. Several problems combine into a
   goal (views-goals.js): "Make a goal", tap the ones that belong together,
   "Combine into goal".
   =========================================================================== */

(function (global) {
  'use strict';

  var esc = U.esc;

  var view = {
    show: 'open',       // open · resolved
    area: '',
    sort: 'recent',     // recent · oldest · difficulty · area
    selecting: false,
    selected: []
  };

  var SORTS = [['recent', 'Newest first'], ['oldest', 'Oldest first'], ['difficulty', 'Hardest first'], ['area', 'By area']];

  function shown() {
    var list = Store.list('problems').filter(function (p) {
      return p.status === view.show && (!view.area || p.area === view.area);
    });
    var by = {
      recent: function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; },
      oldest: function (a, b) { return a.createdAt < b.createdAt ? -1 : 1; },
      difficulty: function (a, b) { return (b.difficulty || 0) - (a.difficulty || 0) || (a.createdAt < b.createdAt ? 1 : -1); },
      area: function (a, b) { return (a.area || 'zz').localeCompare(b.area || 'zz') || (a.createdAt < b.createdAt ? 1 : -1); }
    };
    return list.sort(by[view.sort] || by.recent);
  }

  // ---- the list ----------------------------------------------------------------

  function addForm(prefix, text) {
    return '<form class="card add-card' + (text ? ' has-text' : '') + '" data-form="add-problem">' +
      '<label class="sr-only" for="' + prefix + '-text">New problem</label>' +
      '<textarea id="' + prefix + '-text" name="text" rows="2" placeholder="What’s bothering you?" data-live="problem-hint" required' +
      (prefix === 'sheet' ? ' autofocus' : '') + '>' + esc(text || '') + '</textarea>' +
      '<div class="hint" data-hint hidden></div>' +
      '<div class="add-details">' +
      '<div class="field-row">' +
      '<label class="field"><span>Area</span>' + UI.select('area', Model.AREAS, '', 'Area…') + '</label>' +
      '<label class="field"><span>Emotion</span>' + UI.select('emotion', Model.EMOTIONS, '', 'Emotion…') + '</label>' +
      '</div>' +
      '<div class="field"><span>Difficulty</span>' + UI.difficultyPicker('problem', 0) + '</div>' +
      '</div>' +
      '<div class="form-actions"><button class="btn primary" type="submit">' + UI.icon('plus') + 'Add problem</button></div>' +
      '</form>';
  }

  function card(p, currentId) {
    var goals = Store.goalsForProblem(p.id);
    var picked = view.selected.indexOf(p.id) >= 0;
    var attrs = view.selecting
      ? ' data-act="problems-pick" data-id="' + esc(p.id) + '" role="checkbox" aria-checked="' + picked + '" tabindex="0"'
      : ' data-href="' + UI.href('problems', p.id) + '"';
    var goalLine = goals.length
      ? goals.map(function (g) { return '<span class="goal-ref">→ ' + esc(U.firstLine(g.title, 50)) + (g.status === 'done' ? ' ✓' : '') + '</span>'; }).join(' ')
      : '<span class="muted">No goal yet</span>';
    return '<li class="card problem-card' + (p.id === currentId ? ' current' : '') + (picked ? ' picked' : '') + '"' + attrs + '>' +
      (view.selecting ? '<span class="pick-box" aria-hidden="true">' + UI.icon('check') + '</span>' : '') +
      '<div class="card-body">' +
      '<div class="card-text">' + esc(p.text) + '</div>' +
      '<div class="meta">' + UI.areaTag(p.area) + UI.emotionTag(p.emotion) + UI.difficultyTag(p.difficulty) + '</div>' +
      '<div class="meta sub">' + goalLine + '<span class="muted"> · ' +
      (p.status === 'resolved' ? 'resolved ' + U.ago(p.resolvedAt) : U.ago(p.createdAt)) + '</span></div>' +
      '</div></li>';
  }

  function list(route) {
    var all = Store.list('problems');
    var openCount = all.filter(function (p) { return p.status === 'open'; }).length;
    var items = shown();
    var html = UI.head('Problems', U.plural(openCount, 'open problem'),
      view.selecting ? '' : '<button class="btn small" data-act="problems-select">' + UI.icon('goals') + 'Make a goal</button>');

    if (view.selecting) {
      html += '<div class="select-help">Tap the problems that belong together, then <strong>Combine into goal</strong>.</div>';
    } else {
      html += addForm('np');
    }

    html += '<div class="toolbar">' +
      UI.segmented([['open', 'Open'], ['resolved', 'Resolved']], view.show, 'problems-show') +
      UI.select('area', Model.AREAS, view.area, 'All areas', 'data-change="problems-area" aria-label="Filter by area"') +
      UI.select('sort', SORTS, view.sort, null, 'data-change="problems-sort" aria-label="Sort"') +
      '</div>';

    if (!items.length) {
      html += UI.empty(view.show === 'open'
        ? (view.area ? 'No open problems in ' + esc(view.area) + '.' : 'Nothing here yet. Write down what’s bothering you — one thing at a time.')
        : 'No resolved problems yet. When a goal is finished, the problems it solved land here.');
    } else {
      html += '<ul class="cards">' + items.map(function (p) { return card(p, route.id); }).join('') + '</ul>';
    }

    if (view.selecting) {
      html += '<div class="select-bar">' +
        '<span><strong>' + view.selected.length + '</strong> selected</span>' +
        '<button class="btn" data-act="problems-select-cancel">Cancel</button>' +
        '<button class="btn primary" data-act="problems-combine"' + (view.selected.length ? '' : ' disabled') + '>Combine into goal</button>' +
        '</div>';
    }
    return html;
  }

  // ---- one problem -------------------------------------------------------------

  function item(id) {
    var p = Store.get('problems', id);
    if (!p) return UI.back('#/problems', 'Problems') + UI.empty('That problem isn’t here any more.');
    var bind = 'problems|' + p.id + '|';
    var goals = Store.goalsForProblem(p.id);
    var entries = Store.entriesFor('problems', p.id);
    var activeGoals = Store.list('goals').filter(function (g) {
      return g.status === 'active' && g.problemIds.indexOf(p.id) < 0;
    });

    var html = UI.back('#/problems', 'Problems') +
      '<article class="record">' +
      '<div class="record-kind">Problem · ' + (p.status === 'open' ? 'open since ' + U.fmtDate(p.createdAt) : 'resolved ' + U.fmtDate(p.resolvedAt)) + '</div>' +
      '<label class="sr-only" for="pr-text">Problem</label>' +
      '<textarea id="pr-text" class="title-edit" rows="2" data-bind="' + bind + 'text" data-autogrow>' + esc(p.text) + '</textarea>' +
      '<div class="field-row">' +
      '<label class="field"><span>Area</span>' + UI.select('area', Model.AREAS, p.area, 'No area', 'data-bind="' + bind + 'area"') + '</label>' +
      '<label class="field"><span>Emotion</span>' + UI.select('emotion', Model.EMOTIONS, p.emotion, 'No emotion', 'data-bind="' + bind + 'emotion"') + '</label>' +
      '</div>' +
      '<div class="field"><span>Difficulty</span>' + UI.difficultyPicker('problem', p.difficulty, bind + 'difficulty') + '</div>' +
      '<div class="record-actions">' +
      (p.status === 'open'
        ? '<button class="btn primary" data-act="goal-new" data-problems="' + esc(p.id) + '">' + UI.icon('goals') + 'Make a goal from this</button>' +
          '<button class="btn" data-act="problem-resolve" data-id="' + esc(p.id) + '">' + UI.icon('check') + 'Resolved</button>'
        : '<button class="btn" data-act="problem-reopen" data-id="' + esc(p.id) + '">Reopen</button>') +
      '<button class="btn" data-act="entry-new" data-problem="' + esc(p.id) + '">' + UI.icon('journal') + 'Write about it</button>' +
      '</div>';

    html += '<section class="record-section"><h2>Goals</h2>';
    html += goals.length
      ? '<div class="rec-list">' + goals.map(function (g) {
        var pr = Store.progress(g.id);
        return UI.recordLink('goals', g, '<span class="rec-meta">' + (g.status === 'done' ? 'done' : pr.done + '/' + pr.total + ' steps') + '</span>');
      }).join('') + '</div>'
      : UI.empty('No goal for this yet.');
    if (activeGoals.length) {
      html += '<div class="inline-add">' + UI.select('goal', activeGoals.map(function (g) { return [g.id, U.firstLine(g.title, 60)]; }), '',
        'Add to an existing goal…', 'data-change="problem-add-to-goal" data-id="' + esc(p.id) + '" aria-label="Add to an existing goal"') + '</div>';
    }
    html += '</section>';

    html += '<section class="record-section"><h2>Journal</h2>' +
      (entries.length ? '<div class="rec-list">' + entries.map(function (e) { return UI.recordLink('journal', e); }).join('') + '</div>' : UI.empty('Nothing written about this yet.')) +
      '</section>';

    html += '<section class="record-section"><h2>Like this</h2><div id="similar" class="rec-list"><p class="muted">Looking…</p></div></section>';

    html += '<div class="record-foot"><span class="muted">Added ' + U.fmtDate(p.createdAt) + '</span>' +
      '<button class="btn danger-text" data-act="problem-delete" data-id="' + esc(p.id) + '">' + UI.icon('trash') + 'Delete</button></div>' +
      '</article>';
    return html;
  }

  function placeholder() {
    var g = Probe.gaps();
    return '<div class="placeholder">' + UI.icon('problems') +
      '<p>Choose a problem to see it in full.</p>' +
      (g.noGoal.length ? '<p class="muted">' + U.plural(g.noGoal.length, 'open problem') + ' without a goal yet.</p>' : '') +
      '</div>';
  }

  /** After drawing: fill in "Like this" for a problem. */
  function mount(route) {
    if (route.name !== 'problem') return;
    var p = Store.get('problems', route.id);
    var box = document.getElementById('similar');
    if (!p || !box) return;
    if (!p.text.trim()) { box.innerHTML = UI.empty('Nothing to compare yet.'); return; }
    Probe.search(p.text, { exclude: p.id, limit: 6 }).then(function (out) {
      if (!document.body.contains(box)) return;
      box.innerHTML = out.results.length
        ? out.results.map(function (r) { return resultLink(r); }).join('') +
          (out.mode === 'words' ? '<p class="muted small">Matched by words. Matching by meaning starts once the language model has loaded.</p>' : '')
        : UI.empty('Nothing else like it yet.');
    });
  }

  /** A link to a Probe result. */
  function resultLink(r) {
    var rec = Store.get(r.kind, r.id);
    if (!rec) return '';
    var extra = r.kind === 'journal' ? '<span class="rec-snippet">' + esc(U.clip(r.passage, 140)) + '</span>' : '';
    return UI.recordLink(r.kind, rec, extra);
  }

  // ---- adding from elsewhere (journal, probe) ---------------------------------

  var afterAdd = null;

  /** The add form in a sheet, with text filled in. then(problem) runs once it's added. */
  function openAdd(text, then) {
    afterAdd = then || null;
    UI.sheet('New problem', addForm('sheet', text), function () { afterAdd = null; });
  }

  // ---- handlers ----------------------------------------------------------------

  Handlers.add('form', {
    'add-problem': function (form) {
      var v = Handlers.values(form);
      if (!v.text) return;
      form.reset();
      var p = Store.add('problems', {
        text: v.text,
        area: v.area,
        emotion: v.emotion,
        difficulty: parseInt(v.difficulty, 10) || 0
      });
      var inSheet = !!form.closest('.sheet');
      if (inSheet) {
        var then = afterAdd;
        afterAdd = null;
        UI.closeSheet();
        if (then) then(p);
      }
      UI.toast('Problem added');
      if (!inSheet) {
        view.show = 'open';
        App.render();
        var box = document.getElementById('np-text');
        if (box && App.isWide()) box.focus();
      }
    }
  });

  var hintToken = 0;
  Handlers.add('live', {
    'problem-hint': function (el) {
      var form = el.closest('form');
      var hint = form.querySelector('[data-hint]');
      var text = el.value.trim();
      form.classList.toggle('has-text', !!text);
      var token = ++hintToken;
      if (text.length < 12) { hint.hidden = true; return; }
      Probe.search(text, { kinds: ['problems'], limit: 3 }).then(function (out) {
        if (token !== hintToken) return;
        var close = out.results.filter(function (r) { return r.score >= out.strong; });
        if (!close.length) { hint.hidden = true; return; }
        hint.innerHTML = '<span class="hint-label">Sounds like something you’ve written before:</span>' +
          close.map(function (r) {
            var p = Store.get('problems', r.id);
            return '<a href="' + UI.href('problems', p.id) + '" target="_self">' + esc(U.firstLine(p.text, 70)) +
              (p.status === 'resolved' ? ' (resolved)' : '') + '</a>';
          }).join('');
        hint.hidden = false;
      });
    }
  });

  Handlers.add('act', {
    'problems-show': function (el) { view.show = el.dataset.value; App.render(); },
    'problems-select': function () {
      view.selecting = true;
      view.selected = [];
      view.show = 'open';
      if (App.route().name !== 'problems') App.go('#/problems'); else App.render();
    },
    'problems-select-cancel': function () { view.selecting = false; view.selected = []; App.render(); },
    'problems-pick': function (el) {
      var id = el.dataset.id;
      var i = view.selected.indexOf(id);
      if (i >= 0) view.selected.splice(i, 1); else view.selected.push(id);
      App.render();
    },
    'problems-combine': function () {
      if (!view.selected.length) return;
      var ids = view.selected.slice();
      Views.goals.openNew(ids, function () {
        view.selecting = false;
        view.selected = [];
      });
    },
    'problem-resolve': function (el) {
      Store.update('problems', el.dataset.id, { status: 'resolved', resolvedAt: U.nowIso() });
      UI.toast('Marked as resolved');
    },
    'problem-reopen': function (el) {
      Store.update('problems', el.dataset.id, { status: 'open', resolvedAt: null });
    },
    'problem-delete': function (el) {
      var id = el.dataset.id;
      UI.confirm('Delete this problem?', 'It will be removed from any goals and journal entries that mention it. ' +
        'If it’s dealt with, <strong>Resolved</strong> keeps it in your history instead.', 'Delete', function () {
        Store.remove('problems', id);
        App.go('#/problems');
        UI.toast('Problem deleted');
      }, true);
    }
  });

  Handlers.add('change', {
    'problems-area': function (el) { view.area = el.value; App.render(); },
    'problems-sort': function (el) { view.sort = el.value; App.render(); },
    'problem-add-to-goal': function (el) {
      var goal = Store.get('goals', el.value);
      if (!goal) return;
      Store.update('goals', goal.id, { problemIds: goal.problemIds.concat([el.dataset.id]) });
      UI.toast('Added to “' + U.firstLine(goal.title, 40) + '”');
    }
  });

  global.Views = global.Views || {};
  global.Views.problems = {
    list: list,
    item: item,
    placeholder: placeholder,
    mount: mount,
    openAdd: openAdd,
    resultLink: resultLink,
    cancelSelect: function () { view.selecting = false; view.selected = []; }
  };
}(window));
