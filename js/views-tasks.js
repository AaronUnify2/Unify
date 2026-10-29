/* ===========================================================================
   views-tasks.js — the Tasks section.

   Every step of every goal, grouped by goal, plus standalone tasks. Ticking
   one off asks two quick questions — what went well, what you'd do
   differently — and saves the answers to the journal as a reflection.
   =========================================================================== */

(function (global) {
  'use strict';

  var esc = U.esc;

  var view = { show: 'todo' };   // todo · done

  /** One task as a row with a tick box. opts.inGoal leaves out the goal's name. */
  function row(t, opts) {
    opts = opts || {};
    var goal = !opts.inGoal && t.goalId ? Store.get('goals', t.goalId) : null;
    var reflections = Store.entriesFor('tasks', t.id).length;
    var meta = [];
    if (goal) meta.push('<span class="task-goal">' + esc(U.firstLine(goal.title, 40)) + '</span>');
    if (t.calendar && t.calendar.date && !t.done) meta.push('<span>' + UI.icon('calendar') + esc(U.fmtDay(t.calendar.date + 'T12:00:00')) + '</span>');
    if (t.done && t.doneAt) meta.push('<span>' + esc(U.ago(t.doneAt)) + '</span>');
    if (reflections) meta.push('<span title="Has a reflection">' + UI.icon('journal') + '</span>');
    return '<li class="task-row' + (t.done ? ' done' : '') + '">' +
      '<button class="tick' + (t.done ? ' on' : '') + '" data-act="task-toggle" data-id="' + esc(t.id) + '" role="checkbox" aria-checked="' + t.done + '" ' +
      'aria-label="' + (t.done ? 'Not done: ' : 'Done: ') + esc(U.firstLine(t.text, 60)) + '">' + UI.icon('check') + '</button>' +
      '<a class="task-text" href="' + UI.href('tasks', t.id) + '">' + esc(t.text || 'Untitled task') + '</a>' +
      (meta.length ? '<span class="task-meta">' + meta.join('') + '</span>' : '') +
      '</li>';
  }

  function goalOptions() {
    return Store.list('goals').filter(function (g) { return g.status === 'active'; })
      .map(function (g) { return [g.id, U.firstLine(g.title, 50)]; });
  }

  // ---- the list ----------------------------------------------------------------

  function list() {
    var tasks = Store.list('tasks');
    var todo = tasks.filter(function (t) { return !t.done; });
    var html = UI.head('Tasks', U.plural(todo.length, 'to do', 'to do'));

    html += '<form class="card add-card compact" data-form="add-task">' +
      '<label class="sr-only" for="nt-text">New task</label>' +
      '<input id="nt-text" type="text" name="text" placeholder="Something to do" autocomplete="off" required>' +
      '<div class="field-row">' +
      UI.select('goalId', goalOptions(), '', 'Not part of a goal', 'aria-label="Goal"') +
      '<button class="btn primary" type="submit">' + UI.icon('plus') + 'Add</button>' +
      '</div></form>';

    html += '<div class="toolbar">' + UI.segmented([['todo', 'To do'], ['done', 'Done']], view.show, 'tasks-show') + '</div>';

    if (view.show === 'todo') {
      if (!todo.length) {
        html += UI.empty('Nothing to do. Add steps to a goal, or a task above.');
        return html;
      }
      var groups = {};
      var order = [];
      todo.forEach(function (t) {
        var key = t.goalId || '';
        if (!groups[key]) { groups[key] = []; order.push(key); }
        groups[key].push(t);
      });
      // Goals worked on most recently first; standalone tasks last
      order.sort(function (a, b) {
        if (!a) return 1;
        if (!b) return -1;
        return Store.lastActivity(Store.get('goals', a)) < Store.lastActivity(Store.get('goals', b)) ? 1 : -1;
      });
      order.forEach(function (key) {
        var goal = key ? Store.get('goals', key) : null;
        var items = groups[key].sort(function (a, b) { return a.createdAt < b.createdAt ? -1 : 1; });
        html += '<section class="task-group"><h2>' +
          (goal ? '<a href="' + UI.href('goals', goal.id) + '">' + esc(goal.title || 'Untitled goal') + '</a>' +
            (goal.status === 'done' ? ' <span class="muted">(finished)</span>' : '')
            : 'Not part of a goal') +
          '</h2><ul class="task-list">' + items.map(function (t) { return row(t, { inGoal: true }); }).join('') + '</ul></section>';
      });
    } else {
      var done = tasks.filter(function (t) { return t.done; })
        .sort(function (a, b) { return (a.doneAt || '') < (b.doneAt || '') ? 1 : -1; });
      if (!done.length) {
        html += UI.empty('Nothing ticked off yet.');
      } else {
        html += '<ul class="task-list">' + done.slice(0, 200).map(function (t) { return row(t); }).join('') + '</ul>';
        if (done.length > 200) html += '<p class="muted">Showing the latest 200 of ' + done.length + '.</p>';
      }
    }
    return html;
  }

  // ---- one task ----------------------------------------------------------------

  var DURATIONS = [['15', '15 minutes'], ['30', '30 minutes'], ['45', '45 minutes'], ['60', '1 hour'], ['90', '1½ hours'], ['120', '2 hours']];

  function item(id) {
    var t = Store.get('tasks', id);
    if (!t) return UI.back('#/tasks', 'Tasks') + UI.empty('That task isn’t here any more.');
    var bind = 'tasks|' + t.id + '|';
    var goal = t.goalId ? Store.get('goals', t.goalId) : null;
    var goals = goalOptions();
    if (goal && goal.status !== 'active') goals.unshift([goal.id, U.firstLine(goal.title, 50) + ' (finished)']);
    var entries = Store.entriesFor('tasks', t.id);
    var cal = t.calendar || {};

    var html = (goal ? UI.back(UI.href('goals', goal.id), U.firstLine(goal.title, 30)) : UI.back('#/tasks', 'Tasks')) +
      '<article class="record">' +
      '<div class="record-kind">Task · ' + (t.done ? 'done ' + U.fmtDate(t.doneAt) : 'to do') + '</div>' +
      '<div class="task-title-row">' +
      '<button class="tick big' + (t.done ? ' on' : '') + '" data-act="task-toggle" data-id="' + esc(t.id) + '" role="checkbox" aria-checked="' + t.done + '" aria-label="Done">' + UI.icon('check') + '</button>' +
      '<label class="sr-only" for="tk-text">Task</label>' +
      '<textarea id="tk-text" class="title-edit" rows="1" data-bind="' + bind + 'text" data-autogrow>' + esc(t.text) + '</textarea>' +
      '</div>' +
      '<div class="field-row">' +
      '<label class="field"><span>Goal</span>' + UI.select('goalId', goals, t.goalId, 'Not part of a goal', 'data-bind="' + bind + 'goalId"') + '</label>' +
      (goal ? '' : '<label class="field"><span>Area</span>' + UI.select('area', Model.AREAS, t.area, 'No area', 'data-bind="' + bind + 'area"') + '</label>') +
      '</div>' +
      '<label class="field"><span>Notes</span><textarea rows="3" data-bind="' + bind + 'notes" data-autogrow placeholder="Anything worth remembering">' + esc(t.notes) + '</textarea></label>';

    if (!t.done) {
      html += '<section class="record-section"><h2>Schedule it</h2>' +
        '<form class="calendar-form" data-form="task-calendar" data-id="' + esc(t.id) + '">' +
        '<label class="field"><span>Date</span><input type="date" name="date" value="' + esc(cal.date || U.dayKey(new Date())) + '" required></label>' +
        '<label class="field"><span>Time</span><input type="time" name="time" value="' + esc(cal.time || '09:00') + '" required></label>' +
        '<label class="field"><span>How long</span>' + UI.select('duration', DURATIONS, String(cal.duration || '30'), null) + '</label>' +
        '<button class="btn" type="submit">' + UI.icon('calendar') + 'Add to Google Calendar</button>' +
        '</form>' +
        (cal.addedAt ? '<p class="muted small">Added to your calendar for ' + esc(U.fmtDay(cal.date + 'T12:00:00')) + ' at ' + esc(cal.time) + '.</p>' : '') +
        '</section>';
    }

    html += '<section class="record-section"><h2>Reflections</h2>' +
      (entries.length
        ? entries.map(function (e) {
          return '<a class="reflection" href="' + UI.href('journal', e.id) + '"><span class="muted small">' + esc(U.fmtDay(e.createdAt)) + '</span>' +
            '<span class="reflection-text">' + esc(U.clip(e.text, 240)) + '</span></a>';
        }).join('')
        : UI.empty(t.done ? 'No reflection written.' : 'You’ll be asked for one when you tick it off.')) +
      (t.done ? '<button class="btn small" data-act="task-reflect" data-id="' + esc(t.id) + '">' + UI.icon('journal') + 'Write a reflection</button>' : '') +
      '</section>';

    html += '<div class="record-foot"><span class="muted">Added ' + U.fmtDate(t.createdAt) + '</span>' +
      '<button class="btn danger-text" data-act="task-delete" data-id="' + esc(t.id) + '">' + UI.icon('trash') + 'Delete</button></div>' +
      '</article>';
    return html;
  }

  function placeholder() {
    return '<div class="placeholder">' + UI.icon('tasks') + '<p>Choose a task to add notes or schedule it.</p></div>';
  }

  // ---- reflecting ----------------------------------------------------------------

  var WELL = 'What went well';
  var DIFFERENTLY = 'What I’d do differently';

  function openReflect(id) {
    var t = Store.get('tasks', id);
    if (!t) return;
    UI.sheet('Done! A moment to reflect',
      '<form data-form="reflect" data-id="' + esc(t.id) + '">' +
      '<p class="sheet-text"><strong>' + esc(t.text) + '</strong></p>' +
      '<label class="field"><span>What went well?</span><textarea name="well" rows="2" autofocus></textarea></label>' +
      '<label class="field"><span>What would you do differently next time?</span><textarea name="differently" rows="2"></textarea></label>' +
      '<div class="sheet-actions"><button type="button" class="btn" data-act="sheet-close">Skip</button>' +
      '<button type="submit" class="btn primary">Save reflection</button></div>' +
      '<p class="muted small">Saved to your journal. You can stop these questions in <a href="#/settings" data-act="sheet-close">Settings</a>.</p>' +
      '</form>');
  }

  // ---- handlers ----------------------------------------------------------------

  Handlers.add('form', {
    'add-task': function (form) {
      var v = Handlers.values(form);
      if (!v.text) return;
      form.reset();
      Store.add('tasks', { text: v.text, goalId: v.goalId || null });
      view.show = 'todo';
      UI.toast('Task added');
      var box = document.getElementById('nt-text');
      if (box) box.focus();
    },
    'reflect': function (form) {
      var v = Handlers.values(form);
      var t = Store.get('tasks', form.dataset.id);
      UI.closeSheet();
      if (!t || (!v.well && !v.differently)) return;
      var parts = [];
      if (v.well) parts.push(WELL + ': ' + v.well);
      if (v.differently) parts.push(DIFFERENTLY + ': ' + v.differently);
      Store.add('journal', {
        text: parts.join('\n\n'),
        kind: 'reflection',
        taskId: t.id,
        goalIds: t.goalId ? [t.goalId] : []
      });
      UI.toast('Reflection saved to your journal');
    },
    'task-calendar': function (form) {
      var v = Handlers.values(form);
      var t = Store.get('tasks', form.dataset.id);
      if (!t || !v.date || !v.time) return;
      var start = new Date(v.date + 'T' + v.time + ':00');
      var end = new Date(start.getTime() + (parseInt(v.duration, 10) || 30) * 60000);
      var stamp = function (d) { return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); };
      var goal = t.goalId ? Store.get('goals', t.goalId) : null;
      var details = (goal ? 'Goal: ' + goal.title + '\n' : '') + (t.notes ? t.notes + '\n' : '') + '\nFrom Unify';
      var url = 'https://calendar.google.com/calendar/render?action=TEMPLATE' +
        '&text=' + encodeURIComponent(t.text) +
        '&dates=' + stamp(start) + '/' + stamp(end) +
        '&details=' + encodeURIComponent(details);
      window.open(url, '_blank', 'noopener');
      Store.update('tasks', t.id, { calendar: { date: v.date, time: v.time, duration: parseInt(v.duration, 10) || 30, addedAt: U.nowIso() } });
    }
  });

  Handlers.add('act', {
    'tasks-show': function (el) { view.show = el.dataset.value; App.render(); },
    'task-toggle': function (el) {
      var t = Store.get('tasks', el.dataset.id);
      if (!t) return;
      if (t.done) {
        Store.update('tasks', t.id, { done: false, doneAt: null });
        return;
      }
      Store.update('tasks', t.id, { done: true, doneAt: U.nowIso() });
      if (Prefs.get('askReflection')) openReflect(t.id);
      else UI.toast('Done');
    },
    'task-reflect': function (el) { openReflect(el.dataset.id); },
    'task-delete': function (el) {
      var t = Store.get('tasks', el.dataset.id);
      if (!t) return;
      UI.confirm('Delete this task?', 'Any reflection on it stays in your journal.', 'Delete', function () {
        var goalId = t.goalId;
        Store.remove('tasks', t.id);
        App.go(goalId ? UI.href('goals', goalId) : '#/tasks');
        UI.toast('Task deleted');
      }, true);
    }
  });

  global.Views = global.Views || {};
  global.Views.tasks = {
    list: list,
    item: item,
    placeholder: placeholder,
    row: row
  };
}(window));
