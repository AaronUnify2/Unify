/* ===========================================================================
   views-session.js — the Session section.

   A session is a few tasks in the order you'll do them, for a morning or a
   day: choose them in Tasks (Plan a session), put them in order here by
   dragging or with the arrows, and tick them off. Get link shares it:
   anyone with the link can tick things off and add to it, live (live.js,
   session.html). What helpers add waits here until you keep or discard it.

   Finishing a session stops the link; tasks not done stay on your list.
   =========================================================================== */

(function (global) {
  'use strict';

  var esc = U.esc;

  function tasksOf(s) {
    return s.taskIds.map(function (id) { return Store.get('tasks', id); }).filter(Boolean);
  }

  function countLine(s) {
    var tasks = tasksOf(s);
    var done = tasks.filter(function (t) { return t.done; }).length;
    return done + ' of ' + U.plural(tasks.length, 'task') + ' done';
  }

  function dayLabel(s) {
    return s.date ? U.fmtDay(s.date + 'T12:00:00') : U.fmtDay(s.createdAt);
  }

  function goalOptions() {
    return Store.list('goals').filter(function (g) { return g.status === 'active'; })
      .map(function (g) { return [g.id, U.firstLine(g.title, 50)]; });
  }

  // ---- the section ------------------------------------------------------------------

  function list() {
    var s = Store.openSession();
    var html = '';
    if (!s) {
      html += UI.head('Session', '') +
        '<p class="lede">Got a morning or a day to get things done? Choose the tasks, put them in order, and work down the list. Share it with a link, and anyone helping can tick things off with you.</p>' +
        '<div class="record-actions">' +
        '<button class="btn primary" data-act="session-choose">' + UI.icon('tasks') + 'Choose tasks</button>' +
        '<button class="btn" data-act="session-new">Start an empty session</button>' +
        '</div>';
      return html + past(null);
    }

    html += UI.head('Session', dayLabel(s) + ' · ' + countLine(s),
      '<button class="btn small" data-act="session-finish">' + UI.icon('check') + 'Finish</button>');

    html += '<div class="field-row session-fields">' +
      '<label class="field"><span>Name</span><input id="ss-title" type="text" data-bind="sessions|' + esc(s.id) + '|title" value="' + esc(s.title) + '" placeholder="e.g. Saturday jobs"></label>' +
      '<label class="field session-date"><span>Day</span><input id="ss-date" type="date" data-bind="sessions|' + esc(s.id) + '|date" value="' + esc(s.date) + '"></label>' +
      '</div>';

    html += shareBox(s);
    html += pendingBox(s);

    var tasks = tasksOf(s);
    if (!tasks.length) {
      html += UI.empty('No tasks in this session yet.');
    } else {
      html += '<ol class="session-list" aria-label="Tasks in order">' +
        tasks.map(function (t, i) { return row(t, i, tasks.length); }).join('') + '</ol>';
    }

    html += '<form class="inline-form session-add" data-form="session-add">' +
      '<label class="sr-only" for="ss-add">Something else to do today</label>' +
      '<input id="ss-add" type="text" name="text" placeholder="Something else to do today" autocomplete="off" required>' +
      '<button class="btn" type="submit">' + UI.icon('plus') + 'Add</button></form>' +
      '<div class="record-actions"><button class="btn" data-act="session-choose">' + UI.icon('tasks') + 'Choose from your tasks</button></div>';

    return html + past(s);
  }

  function row(t, i, count) {
    var goal = t.goalId ? Store.get('goals', t.goalId) : null;
    var shared = Live.item(t.id);
    var meta = [];
    if (goal) meta.push('<span class="task-goal">' + esc(U.firstLine(goal.title, 50)) + '</span>');
    if (t.done && shared && shared.done && shared.doneBy && shared.doneBy !== Live.owner()) {
      meta.push('<span>ticked by ' + esc(shared.doneBy) + '</span>');
    }
    if (shared && shared.addedBy) meta.push('<span>added by ' + esc(shared.addedBy) + '</span>');
    return '<li class="session-row' + (t.done ? ' done' : '') + '" data-id="' + esc(t.id) + '">' +
      '<button type="button" class="drag-handle" aria-label="Drag to reorder" title="Drag to reorder">' + UI.icon('grip') + '</button>' +
      '<button class="tick' + (t.done ? ' on' : '') + '" data-act="task-toggle" data-id="' + esc(t.id) + '" role="checkbox" aria-checked="' + t.done + '" ' +
      'aria-label="' + (t.done ? 'Not done: ' : 'Done: ') + esc(U.firstLine(t.text, 60)) + '">' + UI.icon('check') + '</button>' +
      '<div class="session-text"><a class="task-text" href="' + UI.href('tasks', t.id) + '">' + esc(t.text || 'Untitled task') + '</a>' +
      (meta.length ? '<span class="session-meta">' + meta.join('') + '</span>' : '') + '</div>' +
      '<div class="move-btns">' +
      '<button class="icon-btn" data-act="session-move" data-id="' + esc(t.id) + '" data-dir="-1" aria-label="Move up"' + (i === 0 ? ' disabled' : '') + '>' + UI.icon('up') + '</button>' +
      '<button class="icon-btn" data-act="session-move" data-id="' + esc(t.id) + '" data-dir="1" aria-label="Move down"' + (i === count - 1 ? ' disabled' : '') + '>' + UI.icon('down') + '</button>' +
      '</div>' +
      '<button class="icon-btn" data-act="session-remove" data-id="' + esc(t.id) + '" aria-label="Take out of the session" title="Take out of the session">' + UI.icon('close') + '</button>' +
      '</li>';
  }

  var STATUS_TEXT = {
    off: 'Connecting…',
    connecting: 'Connecting…',
    live: 'Shared · live',
    offline: 'Shared · offline — it catches up when you’re back online',
    refused: 'The sharing database refused the connection. Check its rules (see Settings).',
    missing: 'This link isn’t active any more.'
  };

  function shareBox(s) {
    var html = '<section class="share-box">';
    if (!Share.configured()) {
      return html + '<p class="muted small">Sharing by link isn’t set up yet. Settings says how.</p></section>';
    }
    if (!s.shareId) {
      return html + '<button class="btn" data-act="session-share-start">' + UI.icon('link') + 'Get link</button>' +
        '<span class="muted small">Anyone with the link can tick things off and add to it, live.</span></section>';
    }
    var st = Live.status;
    html += '<p class="share-status ' + esc(st) + '"><span class="sync-dot"></span>' + esc(STATUS_TEXT[st] || '') + '</p>';
    if (st === 'missing') {
      html += '<div class="record-actions"><button class="btn" data-act="session-share-start">' + UI.icon('link') + 'Share again</button></div>';
    } else {
      html += '<div class="record-actions">' +
        '<button class="btn primary" data-act="session-send">' + UI.icon('share') + 'Send link</button>' +
        '<button class="btn danger-text" data-act="session-unshare">Stop sharing</button></div>';
    }
    return html + '</section>';
  }

  function pendingBox(s) {
    if (!s.shareId) return '';
    var items = Live.pending();
    if (!items.length) return '';
    var goals = goalOptions();
    return '<section class="pending-box"><h2>Added by helpers <span class="count">' + items.length + '</span></h2>' +
      '<p class="muted small">Keep one to make it a task in Unify; it stays in the session either way until you decide.</p>' +
      '<ul class="pending-list">' + items.map(function (item) {
        return '<li class="pending-item">' +
          '<div><strong>' + esc(item.text) + '</strong>' +
          '<span class="session-meta"><span>added by ' + esc(item.addedBy || 'someone') + '</span>' +
          (item.done ? '<span>ticked' + (item.doneBy ? ' by ' + esc(item.doneBy) : '') + '</span>' : '') + '</span></div>' +
          '<div class="pending-actions">' +
          UI.select('goal', goals, '', 'Not part of a goal', 'id="pg-' + esc(item.key) + '" aria-label="Goal for this task"') +
          '<button class="btn small primary" data-act="session-keep" data-key="' + esc(item.key) + '">Keep</button>' +
          '<button class="btn small danger-text" data-act="session-discard" data-key="' + esc(item.key) + '">Discard</button>' +
          '</div></li>';
      }).join('') + '</ul></section>';
  }

  /** Earlier sessions (and any other open one), newest first. */
  function past(current) {
    var others = Store.list('sessions').filter(function (s) { return s !== current; })
      .sort(function (a, b) { return (a.date || a.createdAt) < (b.date || b.createdAt) ? 1 : -1; });
    if (!others.length) return '';
    return '<section class="record-section"><h2>Earlier sessions</h2>' +
      others.slice(0, 30).map(function (s) {
        var tasks = tasksOf(s);
        return '<details class="card past-session"><summary><strong>' + esc(s.title || 'Session') + '</strong>' +
          '<span class="muted small"> · ' + esc(dayLabel(s)) + ' · ' + esc(countLine(s)) + (s.status === 'open' ? ' · still open' : '') + '</span></summary>' +
          (tasks.length
            ? '<ul class="task-list">' + tasks.map(function (t) {
              return '<li class="task-row' + (t.done ? ' done' : '') + '"><a class="task-text" href="' + UI.href('tasks', t.id) + '">' + esc(t.text || 'Untitled task') + '</a></li>';
            }).join('') + '</ul>'
            : UI.empty('No tasks.')) +
          '<div class="record-actions">' +
          (s.status === 'open' ? '<button class="btn small" data-act="session-close-other" data-id="' + esc(s.id) + '">Finish this one</button>' : '') +
          '<button class="btn small danger-text" data-act="session-delete" data-id="' + esc(s.id) + '">' + UI.icon('trash') + 'Delete</button></div>' +
          '</details>';
      }).join('') + '</section>';
  }

  // ---- starting, adding, ordering ------------------------------------------------------

  /** A new session, today, with these tasks. */
  function create(taskIds) {
    return Store.add('sessions', { title: '', date: U.dayKey(new Date()), taskIds: taskIds || [] });
  }

  /** Put the open session's tasks to this list (from Tasks → Plan a session). */
  function setTasks(ids) {
    var s = Store.openSession();
    if (!s) {
      create(ids);
      return;
    }
    // Keep the order of the ones already there (and the ones done, which
    // aren't on the list to choose from); the new ones go at the end
    var kept = s.taskIds.filter(function (id) {
      var t = Store.get('tasks', id);
      return ids.indexOf(id) >= 0 || (t && t.done);
    });
    var added = ids.filter(function (id) { return kept.indexOf(id) < 0; });
    Store.update('sessions', s.id, { taskIds: kept.concat(added) });
  }

  function move(id, to) {
    var s = Store.openSession();
    if (!s) return;
    var ids = s.taskIds.slice();
    var from = ids.indexOf(id);
    if (from < 0 || to < 0 || to >= ids.length || to === from) return;
    ids.splice(from, 1);
    ids.splice(to, 0, id);
    Store.update('sessions', s.id, { taskIds: ids });
  }

  // ---- dragging ------------------------------------------------------------------------
  // The row follows your finger (or the mouse) and a line shows where it will
  // go; nothing moves in the page until you let go, then the order is saved.

  var drag = null;

  function onPointerDown(ev) {
    var handle = ev.target.closest && ev.target.closest('.drag-handle');
    if (!handle || (ev.pointerType === 'mouse' && ev.button !== 0)) return;
    var row = handle.closest('.session-row');
    var listEl = row && row.parentNode;
    if (!row || !listEl) return;
    ev.preventDefault();
    var rows = Array.prototype.slice.call(listEl.querySelectorAll('.session-row'));
    drag = {
      row: row,
      list: listEl,
      rows: rows,
      from: rows.indexOf(row),
      to: rows.indexOf(row),
      startY: ev.clientY,
      startScroll: window.scrollY,
      lastY: ev.clientY,
      pointer: ev.pointerId,
      handle: handle,
      scroller: null
    };
    try { handle.setPointerCapture(ev.pointerId); } catch (e) { /* not supported */ }
    row.classList.add('dragging');
    document.body.classList.add('dragging');
    drag.scroller = setInterval(autoScroll, 30);
  }

  function place(clientY) {
    var y = clientY;
    drag.row.style.transform = 'translateY(' + (y - drag.startY + window.scrollY - drag.startScroll) + 'px)';
    var others = drag.rows.filter(function (r) { return r !== drag.row; });
    var to = 0;
    others.forEach(function (r) {
      var box = r.getBoundingClientRect();
      if (y > box.top + box.height / 2) to++;
    });
    drag.to = to;
    drag.rows.forEach(function (r) { r.classList.remove('drop-before', 'drop-after'); });
    if (to === drag.from) return;
    if (to < others.length) others[to].classList.add('drop-before');
    else others[others.length - 1].classList.add('drop-after');
  }

  function onPointerMove(ev) {
    if (!drag || ev.pointerId !== drag.pointer) return;
    ev.preventDefault();
    drag.lastY = ev.clientY;
    place(ev.clientY);
  }

  /** Near the top or bottom of the screen, scroll so the row can go further. */
  function autoScroll() {
    if (!drag) return;
    var edge = 70;
    var bottom = window.innerHeight - (App.isWide() ? 0 : 62) - edge;
    var step = 0;
    if (drag.lastY < edge + 52) step = -12;
    else if (drag.lastY > bottom) step = 12;
    if (!step) return;
    var before = window.scrollY;
    window.scrollBy(0, step);
    if (window.scrollY !== before) place(drag.lastY);
  }

  function endDrag(save) {
    if (!drag) return;
    var d = drag;
    drag = null;
    clearInterval(d.scroller);
    d.row.classList.remove('dragging');
    d.row.style.transform = '';
    d.rows.forEach(function (r) { r.classList.remove('drop-before', 'drop-after'); });
    document.body.classList.remove('dragging');
    if (save && d.to !== d.from) move(d.row.dataset.id, d.to);
    else App.requestRender();
  }

  document.addEventListener('pointerdown', onPointerDown);
  document.addEventListener('pointermove', onPointerMove, { passive: false });
  document.addEventListener('pointerup', function (ev) { if (drag && ev.pointerId === drag.pointer) endDrag(true); });
  document.addEventListener('pointercancel', function () { endDrag(false); });

  // ---- sharing -------------------------------------------------------------------------

  function openShareSheet() {
    var s = Store.openSession();
    if (!s) return;
    var count = tasksOf(s).length;
    UI.sheet('Share this session',
      '<form data-form="session-share">' +
      '<p class="sheet-text">Anyone with the link can see ' + (count === 1 ? 'this task' : 'these ' + count + ' tasks') +
      ', tick them off and add new ones, and everyone sees it as it happens. They don’t see anything else in Unify.</p>' +
      '<label class="field"><span>Your name, as helpers will see it</span>' +
      '<input id="sh-owner" type="text" name="owner" value="' + esc(Prefs.get('shareName') || '') + '" autocomplete="given-name" maxlength="40"></label>' +
      '<label class="check-row"><input type="checkbox" name="shareGoals"' + (s.shareGoals ? ' checked' : '') + '> Show which goal each task is for</label>' +
      '<p class="muted small">Task notes are shared too. Problems, feelings and your journal never are.</p>' +
      '<div class="sheet-actions"><button type="button" class="btn" data-act="sheet-close">Cancel</button>' +
      '<button type="submit" class="btn primary">' + UI.icon('link') + 'Create link</button></div>' +
      '</form>');
  }

  function openSendSheet() {
    var s = Store.openSession();
    if (!s || !s.shareId) return;
    var url = Share.link(s.shareId);
    UI.sheet('Send the link',
      '<p class="sheet-text">Send it to whoever’s helping. They can open it on any phone or computer, without signing in.</p>' +
      '<label class="field"><span>Link</span><input id="sh-link" type="text" readonly value="' + esc(url) + '"></label>' +
      '<div class="sheet-actions">' +
      (navigator.share ? '<button class="btn" data-act="session-copy">Copy</button><button class="btn primary" data-act="session-native-share">' + UI.icon('share') + 'Send…</button>'
        : '<button class="btn primary" data-act="session-copy">Copy link</button>') +
      '</div>');
  }

  function copyLink() {
    var input = document.getElementById('sh-link');
    var url = input ? input.value : '';
    var fallback = function () {
      if (!input) return;
      input.focus();
      input.select();
      UI.toast('Selected — copy it from there');
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () {
        UI.closeSheet();
        UI.toast('Link copied');
      }, fallback);
    } else {
      fallback();
    }
  }

  // ---- handlers --------------------------------------------------------------------------

  Handlers.add('form', {
    'session-add': function (form) {
      var v = Handlers.values(form);
      if (!v.text) return;
      var s = Store.openSession() || create([]);
      var task = Store.add('tasks', { text: v.text, goalId: null }, { quiet: true });
      form.reset();
      Store.update('sessions', s.id, { taskIds: s.taskIds.concat([task.id]) });
      var box = document.getElementById('ss-add');
      if (box) box.focus();
    },
    'session-share': function (form) {
      var s = Store.openSession();
      if (!s) return;
      var owner = form.querySelector('[name=owner]').value.trim().slice(0, 40);
      var shareGoals = form.querySelector('[name=shareGoals]').checked;
      var button = form.querySelector('button[type=submit]');
      button.disabled = true;
      button.textContent = 'Creating…';
      Live.share(s, { owner: owner, shareGoals: shareGoals }).then(function () {
        UI.closeSheet();
        openSendSheet();
      }).catch(function (e) {
        button.disabled = false;
        button.textContent = 'Create link';
        UI.toast(navigator.onLine ? (e.message || 'Couldn’t create the link.') : 'You’re offline — try again when you’re back online.', 'error');
      });
    }
  });

  Handlers.add('act', {
    'session-new': function () {
      create([]);
      App.go('#/session');
    },
    'session-choose': function () {
      Views.tasks.startSelect();
      App.go('#/tasks');
    },
    'session-move': function (el) {
      var s = Store.openSession();
      if (!s) return;
      move(el.dataset.id, s.taskIds.indexOf(el.dataset.id) + parseInt(el.dataset.dir, 10));
    },
    'session-remove': function (el) {
      var s = Store.openSession();
      if (!s) return;
      Store.update('sessions', s.id, { taskIds: s.taskIds.filter(function (id) { return id !== el.dataset.id; }) });
      UI.toast('Taken out of the session — it’s still in Tasks');
    },
    'session-share-start': openShareSheet,
    'session-send': openSendSheet,
    'session-copy': copyLink,
    'session-native-share': function () {
      var s = Store.openSession();
      if (!s || !s.shareId) return;
      navigator.share({ title: s.title || 'Session', text: (s.title || 'Today') + ' — tick things off as we go', url: Share.link(s.shareId) })
        .then(function () { UI.closeSheet(); })
        .catch(function () { /* closed without sending */ });
    },
    'session-unshare': function () {
      var s = Store.openSession();
      if (!s) return;
      var waiting = Live.pending().length;
      UI.confirm('Stop sharing?', 'The link stops working for everyone.' +
        (waiting ? ' The ' + U.plural(waiting, 'task') + ' helpers added that you haven’t kept will be lost.' : ''), 'Stop sharing', function () {
        Live.unshare(s).then(function () { UI.toast('No longer shared'); })
          .catch(function () { UI.toast('Couldn’t reach the sharing database — try again when you’re online.', 'error'); });
      }, true);
    },
    'session-keep': function (el) {
      var select = document.getElementById('pg-' + el.dataset.key);
      var task = Live.keep(el.dataset.key, select ? select.value : '');
      if (task) UI.toast('Kept — it’s in your tasks now');
    },
    'session-discard': function (el) {
      Live.discard(el.dataset.key).then(function () { UI.toast('Discarded'); })
        .catch(function () { UI.toast('Couldn’t reach the sharing database.', 'error'); });
    },
    'session-finish': function () {
      var s = Store.openSession();
      if (!s) return;
      var left = tasksOf(s).filter(function (t) { return !t.done; }).length;
      var waiting = s.shareId ? Live.pending().length : 0;
      var message = (left ? U.plural(left, 'task') + ' not done stay' + (left === 1 ? 's' : '') + ' on your task list. ' : 'Everything’s done. ') +
        (s.shareId ? 'The link stops working. ' : '') +
        (waiting ? 'The ' + U.plural(waiting, 'task') + ' helpers added that you haven’t kept will be lost.' : '');
      UI.confirm('Finish this session?', message, 'Finish', function () {
        var done = function () {
          Store.update('sessions', s.id, { status: 'finished', finishedAt: U.nowIso(), shareId: null });
          UI.toast('Session finished');
        };
        if (!s.shareId) { done(); return; }
        Share.remove(s.shareId).then(done).catch(function () {
          UI.toast('Couldn’t reach the sharing database to stop the link — try again when you’re online.', 'error');
        });
      });
    },
    'session-close-other': function (el) {
      var s = Store.get('sessions', el.dataset.id);
      if (!s) return;
      if (s.shareId) Share.remove(s.shareId).catch(function () { /* it may be gone already */ });
      Store.update('sessions', s.id, { status: 'finished', finishedAt: U.nowIso(), shareId: null });
    },
    'session-delete': function (el) {
      var s = Store.get('sessions', el.dataset.id);
      if (!s) return;
      UI.confirm('Delete this session?', 'Only the session goes; its tasks stay as they are.', 'Delete', function () {
        Store.remove('sessions', s.id);
        UI.toast('Session deleted');
      }, true);
    }
  });

  global.Views = global.Views || {};
  global.Views.session = {
    list: list,
    setTasks: setTasks,
    isDragging: function () { return !!drag; }
  };
}(window));
