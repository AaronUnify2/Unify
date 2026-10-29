/* ===========================================================================
   views-goals.js — the Goals section.

   A goal is what you'll do about one or more problems: a title, why it
   matters (optional), and its steps — tasks with this goal's id. Making a
   goal takes one sheet: the title and, if you like, the first steps, one
   per line. Finishing it offers to mark its problems resolved.
   =========================================================================== */

(function (global) {
  'use strict';

  var esc = U.esc;

  var view = { show: 'active', showDone: {} };

  // ---- new goal ----------------------------------------------------------------

  var afterNew = null;

  function mostCommonArea(problems) {
    var count = {};
    var best = '';
    problems.forEach(function (p) {
      if (!p.area) return;
      count[p.area] = (count[p.area] || 0) + 1;
      if (!best || count[p.area] > count[best]) best = p.area;
    });
    return best;
  }

  /** The new-goal sheet, for these problems (or none). then(goal) once it's made. */
  function openNew(problemIds, then) {
    afterNew = then || null;
    var problems = (problemIds || []).map(function (id) { return Store.get('problems', id); }).filter(Boolean);
    var html = '<form data-form="goal-new">';
    if (problems.length) {
      html += '<div class="solving"><span class="field-label">Solving</span><ul>' +
        problems.map(function (p) { return '<li>' + esc(U.firstLine(p.text, 120)) + '</li>'; }).join('') + '</ul></div>';
    }
    html += '<label class="field"><span>What will you do about it?</span>' +
      '<textarea name="title" rows="2" required autofocus placeholder="' + (problems.length ? 'A goal that would solve this' : 'Your goal') + '"></textarea></label>' +
      '<label class="field"><span>Why it matters <em>(optional)</em></span>' +
      '<textarea name="why" rows="2" placeholder="What changes when this is done?"></textarea></label>' +
      '<label class="field"><span>First steps <em>(optional, one per line)</em></span>' +
      '<textarea name="steps" rows="3" placeholder="Small enough to start today"></textarea></label>' +
      '<div class="field-row">' +
      '<label class="field"><span>Area</span>' + UI.select('area', Model.AREAS, mostCommonArea(problems), 'Area…') + '</label>' +
      '</div>' +
      '<div class="field"><span>Difficulty</span>' + UI.difficultyPicker('goal', 0) + '</div>' +
      '<input type="hidden" name="problemIds" value="' + esc(problems.map(function (p) { return p.id; }).join(',')) + '">' +
      '<div class="sheet-actions"><button type="button" class="btn" data-act="sheet-close">Cancel</button>' +
      '<button type="submit" class="btn primary">Create goal</button></div></form>';
    UI.sheet(problems.length ? 'Combine into a goal' : 'New goal', html, function () { afterNew = null; });
  }

  // ---- the list ----------------------------------------------------------------

  function card(g, currentId) {
    var p = Store.progress(g.id);
    var next = Store.tasksForGoal(g.id).filter(function (t) { return !t.done; })[0];
    var nProblems = Store.problemsForGoal(g).length;
    return '<li class="card goal-card' + (g.id === currentId ? ' current' : '') + '" data-href="' + UI.href('goals', g.id) + '">' +
      '<div class="card-body">' +
      '<div class="card-title">' + esc(g.title || 'Untitled goal') + '</div>' +
      '<div class="meta">' + UI.areaTag(g.area) + UI.difficultyTag(g.difficulty, 'goal') +
      (nProblems ? '<span class="tag">' + U.plural(nProblems, 'problem') + '</span>' : '') + '</div>' +
      (p.total ? UI.progressBar(p) : '') +
      '<div class="meta sub">' +
      (g.status === 'done'
        ? '<span class="muted">Finished ' + U.fmtDate(g.doneAt) + '</span>'
        : (next ? '<span class="next">Next: ' + esc(U.firstLine(next.text, 60)) + '</span>' : '<span class="warn-text">No next step</span>') +
          '<span class="muted"> · ' + p.done + '/' + p.total + ' · ' + U.ago(Store.lastActivity(g)) + '</span>') +
      '</div></div></li>';
  }

  function list(route) {
    var all = Store.list('goals');
    var active = all.filter(function (g) { return g.status === 'active'; });
    var items = all.filter(function (g) { return g.status === view.show; });
    if (view.show === 'active') {
      items.sort(function (a, b) { return Store.lastActivity(a) < Store.lastActivity(b) ? 1 : -1; });
    } else {
      items.sort(function (a, b) { return (a.doneAt || '') < (b.doneAt || '') ? 1 : -1; });
    }
    var html = UI.head('Goals', U.plural(active.length, 'active goal'),
      '<button class="btn small" data-act="goal-new">' + UI.icon('plus') + 'New goal</button>');
    html += '<div class="toolbar">' + UI.segmented([['active', 'Active'], ['done', 'Done']], view.show, 'goals-show') + '</div>';
    if (!items.length) {
      html += UI.empty(view.show === 'active'
        ? 'No active goals. On <a href="#/problems">Problems</a>, press <strong>Make a goal</strong> and choose the problems it would solve — or start one from scratch.'
        : 'No finished goals yet.');
    } else {
      html += '<ul class="cards">' + items.map(function (g) { return card(g, route.id); }).join('') + '</ul>';
    }
    return html;
  }

  // ---- one goal ----------------------------------------------------------------

  function item(id) {
    var g = Store.get('goals', id);
    if (!g) return UI.back('#/goals', 'Goals') + UI.empty('That goal isn’t here any more.');
    var bind = 'goals|' + g.id + '|';
    var tasks = Store.tasksForGoal(g.id);
    var open = tasks.filter(function (t) { return !t.done; });
    var done = tasks.filter(function (t) { return t.done; });
    var p = Store.progress(g.id);
    var problems = Store.problemsForGoal(g);
    var others = Store.list('problems').filter(function (x) { return x.status === 'open' && g.problemIds.indexOf(x.id) < 0; });
    var entries = Store.entriesFor('goals', g.id);

    var html = UI.back('#/goals', 'Goals') +
      '<article class="record">' +
      '<div class="record-kind">Goal · ' + (g.status === 'active' ? 'started ' + U.fmtDate(g.createdAt) : 'finished ' + U.fmtDate(g.doneAt)) + '</div>' +
      '<label class="sr-only" for="gl-title">Goal</label>' +
      '<textarea id="gl-title" class="title-edit" rows="1" data-bind="' + bind + 'title" data-autogrow>' + esc(g.title) + '</textarea>' +
      '<label class="field"><span>Why it matters</span>' +
      '<textarea rows="2" data-bind="' + bind + 'why" data-autogrow placeholder="What changes when this is done?">' + esc(g.why) + '</textarea></label>' +
      '<div class="field-row">' +
      '<label class="field"><span>Area</span>' + UI.select('area', Model.AREAS, g.area, 'No area', 'data-bind="' + bind + 'area"') + '</label>' +
      '</div>' +
      '<div class="field"><span>Difficulty</span>' + UI.difficultyPicker('goal', g.difficulty, bind + 'difficulty') + '</div>';

    html += '<section class="record-section"><h2>Steps <span class="count">' + p.done + ' of ' + p.total + ' done</span></h2>' +
      (p.total ? UI.progressBar(p) : '') +
      '<ul class="task-list">' + open.map(function (t) { return Views.tasks.row(t, { inGoal: true }); }).join('') + '</ul>' +
      (g.status === 'active'
        ? '<form class="inline-form" data-form="add-step" data-goal="' + esc(g.id) + '">' +
          '<label class="sr-only" for="gl-step">New step</label>' +
          '<input id="gl-step" type="text" name="text" placeholder="' + (open.length ? 'Add a step' : 'What’s the next step?') + '" autocomplete="off" required>' +
          '<button class="btn" type="submit" aria-label="Add step">' + UI.icon('plus') + '</button></form>'
        : '');
    if (done.length) {
      var showing = !!view.showDone[g.id];
      html += '<button class="link-btn" data-act="goal-toggle-done" data-id="' + esc(g.id) + '">' +
        (showing ? 'Hide' : 'Show') + ' ' + U.plural(done.length, 'finished step') + '</button>';
      if (showing) html += '<ul class="task-list done">' + done.map(function (t) { return Views.tasks.row(t, { inGoal: true }); }).join('') + '</ul>';
    }
    html += '</section>';

    html += '<section class="record-section"><h2>Problems it solves</h2>' +
      (problems.length
        ? '<div class="rec-list">' + problems.map(function (x) {
          return '<div class="rec-row">' + UI.recordLink('problems', x, x.status === 'resolved' ? '<span class="rec-meta">resolved</span>' : '') +
            '<button class="icon-btn" data-act="goal-unlink" data-goal="' + esc(g.id) + '" data-id="' + esc(x.id) + '" aria-label="Remove from this goal">' + UI.icon('close') + '</button></div>';
        }).join('') + '</div>'
        : UI.empty('Not linked to any problems.'));
    if (others.length) {
      html += '<div class="inline-add">' + UI.select('problem', others.map(function (x) { return [x.id, U.firstLine(x.text, 60)]; }), '',
        'Link an open problem…', 'data-change="goal-link" data-goal="' + esc(g.id) + '" aria-label="Link an open problem"') + '</div>';
    }
    html += '</section>';

    html += '<section class="record-section"><h2>Journal</h2>' +
      (entries.length ? '<div class="rec-list">' + entries.map(function (e) { return UI.recordLink('journal', e); }).join('') + '</div>' : UI.empty('Nothing written about this yet.')) +
      '<button class="btn small" data-act="entry-new" data-goal="' + esc(g.id) + '">' + UI.icon('journal') + 'Write about it</button>' +
      '</section>';

    html += '<div class="record-actions">' +
      (g.status === 'active'
        ? '<button class="btn primary" data-act="goal-finish" data-id="' + esc(g.id) + '">' + UI.icon('check') + 'Finish goal</button>'
        : '<button class="btn" data-act="goal-reopen" data-id="' + esc(g.id) + '">Reopen</button>') +
      '</div>';

    html += '<div class="record-foot"><span class="muted">Started ' + U.fmtDate(g.createdAt) + '</span>' +
      '<button class="btn danger-text" data-act="goal-delete" data-id="' + esc(g.id) + '">' + UI.icon('trash') + 'Delete</button></div>' +
      '</article>';
    return html;
  }

  function placeholder() {
    var g = Probe.gaps();
    return '<div class="placeholder">' + UI.icon('goals') + '<p>Choose a goal to see its steps.</p>' +
      (g.noNextStep.length ? '<p class="muted">' + U.plural(g.noNextStep.length, 'goal') + ' without a next step.</p>' : '') +
      '</div>';
  }

  // ---- finishing -----------------------------------------------------------------

  function openFinish(id) {
    var g = Store.get('goals', id);
    if (!g) return;
    var problems = Store.problemsForGoal(g).filter(function (p) { return p.status === 'open'; });
    var open = Store.tasksForGoal(g.id).filter(function (t) { return !t.done; });
    var html = '<form data-form="goal-finish" data-id="' + esc(g.id) + '">' +
      '<p class="sheet-text"><strong>' + esc(g.title) + '</strong></p>';
    if (problems.length) {
      html += '<fieldset class="checks"><legend>Mark these problems resolved?</legend>' +
        problems.map(function (p) {
          return '<label class="check-row"><input type="checkbox" name="resolve" value="' + esc(p.id) + '" checked> ' + esc(U.firstLine(p.text, 90)) + '</label>';
        }).join('') + '</fieldset>';
    }
    if (open.length) {
      html += '<label class="check-row"><input type="checkbox" name="tickSteps"> Tick off the ' + U.plural(open.length, 'step') + ' still open</label>';
    }
    html += '<label class="field"><span>How did it go? <em>(optional — saved to your journal)</em></span>' +
      '<textarea name="reflection" rows="3" placeholder="What worked, what you’d do differently"></textarea></label>' +
      '<div class="sheet-actions"><button type="button" class="btn" data-act="sheet-close">Cancel</button>' +
      '<button type="submit" class="btn primary">Finish goal</button></div></form>';
    UI.sheet('Finish goal', html);
  }

  // ---- handlers ----------------------------------------------------------------

  Handlers.add('form', {
    'goal-new': function (form) {
      var v = Handlers.values(form);
      if (!v.title) return;
      var goal = Store.add('goals', {
        title: v.title,
        why: v.why,
        area: v.area,
        difficulty: parseInt(v.difficulty, 10) || 0,
        problemIds: v.problemIds ? v.problemIds.split(',') : []
      });
      v.steps.split('\n').map(function (s) { return s.trim(); }).filter(Boolean).forEach(function (text) {
        Store.add('tasks', { text: text, goalId: goal.id });
      });
      var then = afterNew;
      afterNew = null;
      UI.closeSheet();
      if (then) then(goal);
      UI.toast('Goal created');
      App.go(UI.href('goals', goal.id));
    },
    'add-step': function (form) {
      var v = Handlers.values(form);
      if (!v.text) return;
      form.reset();
      Store.add('tasks', { text: v.text, goalId: form.dataset.goal });
      var box = document.getElementById('gl-step');
      if (box) box.focus();
    },
    'goal-finish': function (form) {
      var id = form.dataset.id;
      var g = Store.get('goals', id);
      if (!g) return;
      var resolve = Array.prototype.filter.call(form.querySelectorAll('input[name=resolve]'), function (c) { return c.checked; })
        .map(function (c) { return c.value; });
      var tick = form.querySelector('input[name=tickSteps]');
      var reflection = form.querySelector('textarea[name=reflection]').value.trim();
      var now = U.nowIso();
      Store.batch(function (touch) {
        touch('goals', id, { status: 'done', doneAt: now });
        resolve.forEach(function (pid) { touch('problems', pid, { status: 'resolved', resolvedAt: now }); });
        if (tick && tick.checked) {
          Store.tasksForGoal(id).forEach(function (t) { if (!t.done) touch('tasks', t.id, { done: true, doneAt: now }); });
        }
      });
      if (reflection) {
        Store.add('journal', { text: reflection, kind: 'reflection', goalIds: [id], problemIds: resolve });
      }
      UI.closeSheet();
      UI.toast('Goal finished' + (resolve.length ? ' · ' + U.plural(resolve.length, 'problem') + ' resolved' : ''));
    }
  });

  Handlers.add('act', {
    'goals-show': function (el) { view.show = el.dataset.value; App.render(); },
    'goal-new': function (el) {
      openNew(el.dataset.problems ? el.dataset.problems.split(',') : []);
    },
    'goal-toggle-done': function (el) {
      view.showDone[el.dataset.id] = !view.showDone[el.dataset.id];
      App.render();
    },
    'goal-unlink': function (el) {
      var g = Store.get('goals', el.dataset.goal);
      if (!g) return;
      Store.update('goals', g.id, { problemIds: g.problemIds.filter(function (x) { return x !== el.dataset.id; }) });
    },
    'goal-finish': function (el) { openFinish(el.dataset.id); },
    'goal-reopen': function (el) { Store.update('goals', el.dataset.id, { status: 'active', doneAt: null }); },
    'goal-delete': function (el) {
      var id = el.dataset.id;
      var n = Store.tasksForGoal(id).length;
      if (!n) {
        UI.confirm('Delete this goal?', 'Its problems stay, unlinked from it.', 'Delete', function () { deleteGoal(id, false); }, true);
        return;
      }
      UI.sheet('Delete this goal?',
        '<p class="sheet-text">It has ' + U.plural(n, 'step') + '. Its problems stay either way.</p>' +
        '<div class="sheet-actions stack">' +
        '<button class="btn" data-act="sheet-close">Cancel</button>' +
        '<button class="btn" data-act="goal-delete-keep" data-id="' + esc(id) + '">Delete the goal, keep its steps as tasks</button>' +
        '<button class="btn danger" data-act="goal-delete-all" data-id="' + esc(id) + '">Delete the goal and its steps</button>' +
        '</div>');
    },
    'goal-delete-keep': function (el) { UI.closeSheet(); deleteGoal(el.dataset.id, false); },
    'goal-delete-all': function (el) { UI.closeSheet(); deleteGoal(el.dataset.id, true); }
  });

  function deleteGoal(id, withSteps) {
    if (withSteps) Store.tasksForGoal(id).forEach(function (t) { Store.remove('tasks', t.id); });
    Store.remove('goals', id);
    App.go('#/goals');
    UI.toast('Goal deleted');
  }

  Handlers.add('change', {
    'goal-link': function (el) {
      var g = Store.get('goals', el.dataset.goal);
      if (!g || !el.value) return;
      Store.update('goals', g.id, { problemIds: g.problemIds.concat([el.value]) });
    }
  });

  global.Views = global.Views || {};
  global.Views.goals = {
    list: list,
    item: item,
    placeholder: placeholder,
    openNew: openNew
  };
}(window));
