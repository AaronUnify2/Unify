/* ===========================================================================
   views-journal.js — the Journal section.

   Free writing, with a mood and feelings if you want them, and links to the
   problems and goals an entry is about. Reflections written on finishing a
   task or a goal are here too. Anything in an entry can become a problem:
   select the words (or don't) and press "Turn into a problem".
   =========================================================================== */

(function (global) {
  'use strict';

  var esc = U.esc;

  var view = { query: '', kind: 'all' };   // all · entry · reflection

  function linkOptions() {
    var opts = [];
    Store.list('goals').filter(function (g) { return g.status === 'active'; }).forEach(function (g) {
      opts.push(['goals:' + g.id, 'Goal: ' + U.firstLine(g.title, 50)]);
    });
    Store.list('problems').filter(function (p) { return p.status === 'open'; }).forEach(function (p) {
      opts.push(['problems:' + p.id, 'Problem: ' + U.firstLine(p.text, 50)]);
    });
    return opts;
  }

  function composeForm(prefix, link) {
    return '<form class="card add-card journal-compose" data-form="add-entry">' +
      '<label class="sr-only" for="' + prefix + '-text">New journal entry</label>' +
      '<textarea id="' + prefix + '-text" name="text" rows="3" placeholder="What’s on your mind?" required data-autogrow' +
      (prefix === 'sheet' ? ' autofocus' : '') + '></textarea>' +
      '<div class="add-details">' +
      '<div class="field"><span>Mood</span>' + UI.moodPicker(0) + '</div>' +
      '<details class="feelings"><summary>Feelings</summary>' + UI.feelingChips([]) + '</details>' +
      '<label class="field"><span>About</span>' + UI.select('link', linkOptions(), link || '', 'Nothing in particular') + '</label>' +
      '</div>' +
      '<div class="form-actions"><button class="btn primary" type="submit">Save entry</button></div>' +
      '</form>';
  }

  function matches(e, q) {
    if (!q) return true;
    var words = q.toLowerCase().split(/\s+/).filter(Boolean);
    var hay = (e.text + ' ' + e.emotions.join(' ')).toLowerCase();
    return words.every(function (w) { return hay.indexOf(w) >= 0; });
  }

  function entryCard(e, currentId) {
    var about = [];
    e.goalIds.forEach(function (id) { var g = Store.get('goals', id); if (g) about.push('Goal: ' + U.firstLine(g.title, 40)); });
    e.problemIds.forEach(function (id) { var p = Store.get('problems', id); if (p) about.push('Problem: ' + U.firstLine(p.text, 40)); });
    if (e.taskId) { var t = Store.get('tasks', e.taskId); if (t) about.push('Task: ' + U.firstLine(t.text, 40)); }
    return '<li class="card entry-card' + (e.id === currentId ? ' current' : '') + (e.kind === 'reflection' ? ' reflection-card' : '') + '" data-href="' + UI.href('journal', e.id) + '">' +
      '<div class="card-body">' +
      '<div class="entry-top"><span class="muted small">' + esc(U.fmtTime(e.createdAt)) + (e.kind === 'reflection' ? ' · Reflection' : '') + '</span>' + UI.moodFace(e.mood) + '</div>' +
      '<div class="card-text entry-text">' + esc(e.text) + '</div>' +
      (e.emotions.length ? '<div class="meta">' + e.emotions.map(UI.emotionTag).join('') + '</div>' : '') +
      (about.length ? '<div class="meta sub">' + about.map(function (a) { return '<span class="about">' + esc(a) + '</span>'; }).join('') + '</div>' : '') +
      '</div></li>';
  }

  function list(route) {
    var all = Store.list('journal');
    var items = all.filter(function (e) {
      return (view.kind === 'all' || e.kind === view.kind) && matches(e, view.query);
    }).sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; });

    var html = UI.head('Journal', U.plural(all.length, 'entry', 'entries'));
    html += composeForm('nj');
    html += '<div class="toolbar">' +
      UI.segmented([['all', 'All'], ['entry', 'Entries'], ['reflection', 'Reflections']], view.kind, 'journal-kind') +
      '<label class="sr-only" for="journal-search">Search the journal</label>' +
      '<input id="journal-search" type="search" placeholder="Search" value="' + esc(view.query) + '" data-live="journal-search" autocomplete="off">' +
      '</div>';

    if (!items.length) {
      html += UI.empty(all.length ? 'Nothing matches.' : 'Nothing written yet. Write a line or two about how today went.');
      return html;
    }
    var day = '';
    html += '<div class="journal-days">';
    items.slice(0, 300).forEach(function (e) {
      var d = U.dayKey(e.createdAt);
      if (d !== day) {
        if (day) html += '</ul>';
        day = d;
        html += '<h2 class="day-head">' + esc(U.fmtDay(e.createdAt)) + '</h2><ul class="cards">';
      }
      html += entryCard(e, route.id);
    });
    html += '</ul></div>';
    if (items.length > 300) html += '<p class="muted">Showing the latest 300 of ' + items.length + '. Search to find older ones.</p>';
    return html;
  }

  // ---- one entry -----------------------------------------------------------------

  function item(id) {
    var e = Store.get('journal', id);
    if (!e) return UI.back('#/journal', 'Journal') + UI.empty('That entry isn’t here any more.');
    var bind = 'journal|' + e.id + '|';
    var links = [];
    e.goalIds.forEach(function (gid) {
      var g = Store.get('goals', gid);
      if (g) links.push({ kind: 'goals', rec: g });
    });
    e.problemIds.forEach(function (pid) {
      var p = Store.get('problems', pid);
      if (p) links.push({ kind: 'problems', rec: p });
    });
    var task = e.taskId ? Store.get('tasks', e.taskId) : null;
    var linked = {};
    links.forEach(function (l) { linked[l.kind + ':' + l.rec.id] = true; });
    var options = linkOptions().filter(function (o) { return !linked[o[0]]; });

    var html = UI.back('#/journal', 'Journal') +
      '<article class="record">' +
      '<div class="record-kind">' + (e.kind === 'reflection' ? 'Reflection' : 'Journal') + ' · ' + esc(U.fmtDay(e.createdAt)) + ', ' + esc(U.fmtTime(e.createdAt)) + '</div>' +
      '<label class="sr-only" for="en-text">Entry</label>' +
      '<textarea id="en-text" class="entry-edit" rows="6" data-bind="' + bind + 'text" data-autogrow>' + esc(e.text) + '</textarea>' +
      '<div class="record-actions">' +
      '<button class="btn" data-act="entry-to-problem" data-id="' + esc(e.id) + '">' + UI.icon('problems') + 'Turn into a problem</button>' +
      '</div>' +
      '<p class="muted small">Select some words first to use just those.</p>' +
      '<div class="field"><span>Mood</span>' + UI.moodPicker(e.mood, bind + 'mood') + '</div>' +
      '<div class="field"><span>Feelings</span>' + UI.feelingChips(e.emotions, bind + 'emotions') + '</div>';

    html += '<section class="record-section"><h2>About</h2>' +
      (task ? '<div class="rec-list">' + UI.recordLink('tasks', task) + '</div>' : '') +
      (links.length
        ? '<div class="rec-list">' + links.map(function (l) {
          return '<div class="rec-row">' + UI.recordLink(l.kind, l.rec) +
            '<button class="icon-btn" data-act="entry-unlink" data-id="' + esc(e.id) + '" data-link="' + l.kind + ':' + esc(l.rec.id) + '" aria-label="Remove link">' + UI.icon('close') + '</button></div>';
        }).join('') + '</div>'
        : (task ? '' : UI.empty('Not linked to anything.'))) +
      (options.length ? '<div class="inline-add">' + UI.select('link', options, '', 'Link a goal or problem…', 'data-change="entry-link" data-id="' + esc(e.id) + '" aria-label="Link a goal or problem"') + '</div>' : '') +
      '</section>';

    html += '<div class="record-foot"><span class="muted">' + (e.updatedAt !== e.createdAt ? 'Edited ' + U.ago(e.updatedAt) : '') + '</span>' +
      '<button class="btn danger-text" data-act="entry-delete" data-id="' + esc(e.id) + '">' + UI.icon('trash') + 'Delete</button></div>' +
      '</article>';
    return html;
  }

  function placeholder() {
    var entries = Store.list('journal');
    var since = Date.now() - 7 * 86400000;
    var week = entries.filter(function (e) { return new Date(e.createdAt).getTime() >= since; }).length;
    return '<div class="placeholder">' + UI.icon('journal') + '<p>Choose an entry to read or edit it.</p>' +
      '<p class="muted">' + U.plural(week, 'entry', 'entries') + ' in the last 7 days.</p></div>';
  }

  /** The compose form in a sheet, linked to a goal or problem. */
  function openNew(link) {
    UI.sheet('Write about it', composeForm('sheet', link));
  }

  // ---- handlers ----------------------------------------------------------------

  Handlers.add('form', {
    'add-entry': function (form) {
      var v = Handlers.values(form);
      if (!v.text) return;
      form.reset();
      var fields = {
        text: v.text,
        mood: parseInt(v.mood, 10) || 0,
        emotions: v.emotions ? v.emotions.split('|') : []
      };
      if (v.link) {
        var parts = v.link.split(':');
        if (parts[0] === 'goals') fields.goalIds = [parts[1]];
        if (parts[0] === 'problems') fields.problemIds = [parts[1]];
      }
      Store.add('journal', fields);
      if (form.closest('.sheet')) UI.closeSheet();
      UI.toast('Saved to your journal');
    }
  });

  Handlers.add('live', {
    'journal-search': function (el) {
      view.query = el.value.trim();
      App.render();
    }
  });

  Handlers.add('change', {
    'entry-link': function (el) {
      var e = Store.get('journal', el.dataset.id);
      if (!e || !el.value) return;
      var parts = el.value.split(':');
      var patch = {};
      if (parts[0] === 'goals') patch.goalIds = e.goalIds.concat([parts[1]]);
      if (parts[0] === 'problems') patch.problemIds = e.problemIds.concat([parts[1]]);
      Store.update('journal', e.id, patch);
    }
  });

  Handlers.add('act', {
    'journal-kind': function (el) { view.kind = el.dataset.value; App.render(); },
    'entry-new': function (el) {
      if (el.dataset.goal) openNew('goals:' + el.dataset.goal);
      else if (el.dataset.problem) openNew('problems:' + el.dataset.problem);
      else openNew('');
    },
    'entry-unlink': function (el) {
      var e = Store.get('journal', el.dataset.id);
      if (!e) return;
      var parts = el.dataset.link.split(':');
      var patch = {};
      if (parts[0] === 'goals') patch.goalIds = e.goalIds.filter(function (x) { return x !== parts[1]; });
      if (parts[0] === 'problems') patch.problemIds = e.problemIds.filter(function (x) { return x !== parts[1]; });
      Store.update('journal', e.id, patch);
    },
    'entry-to-problem': function (el) {
      var e = Store.get('journal', el.dataset.id);
      if (!e) return;
      var box = document.getElementById('en-text');
      var text = '';
      if (box && box.selectionEnd > box.selectionStart) text = box.value.slice(box.selectionStart, box.selectionEnd);
      if (!text) text = e.text;
      text = text.trim().slice(0, 600);
      Views.problems.openAdd(text, function (p) {
        var cur = Store.get('journal', e.id);
        if (cur) Store.update('journal', e.id, { problemIds: cur.problemIds.concat([p.id]) });
      });
    },
    'entry-delete': function (el) {
      var id = el.dataset.id;
      UI.confirm('Delete this entry?', 'This can’t be undone.', 'Delete', function () {
        Store.remove('journal', id);
        App.go('#/journal');
        UI.toast('Entry deleted');
      }, true);
    }
  });

  global.Views = global.Views || {};
  global.Views.journal = {
    list: list,
    item: item,
    placeholder: placeholder,
    openNew: openNew
  };
}(window));
