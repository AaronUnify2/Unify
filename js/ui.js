/* ===========================================================================
   ui.js — shared pieces of the page: toasts, sheets, confirmations, and
   the small bits of markup every section uses (tags, pickers, links).
   =========================================================================== */

(function (global) {
  'use strict';

  var esc = U.esc;

  // ---- toasts ----------------------------------------------------------------

  function toast(message, type) {
    var root = document.getElementById('toast-root');
    root.innerHTML = '';   // one at a time: the newest says what just happened
    var el = document.createElement('div');
    el.className = 'toast' + (type ? ' ' + type : '');
    el.setAttribute('role', 'status');
    el.textContent = message;
    root.appendChild(el);
    setTimeout(function () { el.classList.add('out'); }, 2600);
    setTimeout(function () { el.remove(); }, 3000);
  }

  // ---- sheets ----------------------------------------------------------------
  // A sheet slides up from the bottom on a phone and is a centred dialog on a
  // computer. Its content uses the same data-act and data-form handlers as
  // the page (app.js).

  var sheetClose = null;

  function sheet(title, bodyHtml, onClose) {
    closeSheet();
    var root = document.getElementById('sheet-root');
    root.innerHTML =
      '<div class="sheet-backdrop" data-act="sheet-close"></div>' +
      '<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">' +
      '<div class="sheet-head"><h2 id="sheet-title">' + esc(title) + '</h2>' +
      '<button class="icon-btn" data-act="sheet-close" aria-label="Close">' + icon('close') + '</button></div>' +
      '<div class="sheet-body">' + bodyHtml + '</div></div>';
    root.hidden = false;
    document.body.classList.add('sheet-open');
    sheetClose = onClose || null;
    var first = root.querySelector('[autofocus]');
    if (first) setTimeout(function () { first.focus(); }, 50);
    return root.querySelector('.sheet');
  }

  function closeSheet() {
    var root = document.getElementById('sheet-root');
    if (root.hidden) return;
    root.hidden = true;
    root.innerHTML = '';
    document.body.classList.remove('sheet-open');
    var fn = sheetClose;
    sheetClose = null;
    if (fn) fn();
  }

  function sheetIsOpen() {
    return !document.getElementById('sheet-root').hidden;
  }

  /** Ask before doing something that can't be undone. */
  var confirmFn = null;
  function confirm(title, message, okLabel, fn, danger) {
    confirmFn = fn;
    sheet(title,
      '<p class="sheet-text">' + message + '</p>' +
      '<div class="sheet-actions">' +
      '<button class="btn" data-act="sheet-close">Cancel</button>' +
      '<button class="btn ' + (danger ? 'danger' : 'primary') + '" data-act="confirm-ok">' + esc(okLabel) + '</button>' +
      '</div>');
  }

  function confirmed() {
    var fn = confirmFn;
    confirmFn = null;
    closeSheet();
    if (fn) fn();
  }

  // ---- icons -------------------------------------------------------------------

  var ICONS = {
    problems: '<path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z"/><path d="M12 8v5"/><path d="M12 16.5v.01"/>',
    goals: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>',
    tasks: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
    journal: '<path d="M6 3h11a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6z"/><path d="M6 3v18"/><path d="M10 8h5M10 12h5"/>',
    probe: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    insights: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6"/><path d="M12 17v.01"/>',
    more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    back: '<path d="m15 5-7 7 7 7"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'
  };

  function icon(name) {
    return '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[name] || '') + '</svg>';
  }

  // ---- tags --------------------------------------------------------------------

  function areaTag(area) {
    if (!area) return '';
    return '<span class="tag area"><span class="dot" style="background:' + (Model.AREA_COLORS[area] || '#888') + '"></span>' + esc(area) + '</span>';
  }

  function emotionTag(emotion) {
    return emotion ? '<span class="tag emotion">' + esc(emotion) + '</span>' : '';
  }

  function difficultyTag(n, kind) {
    if (!n) return '';
    var texts = kind === 'goal' ? Model.GOAL_DIFFICULTY : Model.PROBLEM_DIFFICULTY;
    var dots = '';
    for (var i = 1; i <= 5; i++) dots += '<span class="pip' + (i <= n ? ' on' : '') + '"></span>';
    return '<span class="tag difficulty" title="' + esc(texts[n]) + '">' + dots + '</span>';
  }

  function moodFace(value) {
    var m = Model.moodOf(value);
    return m ? '<span class="mood-face" title="' + esc(m.label) + '">' + m.face + '</span>' : '';
  }

  function progressBar(p) {
    var pct = p.total ? Math.round(p.done / p.total * 100) : 0;
    return '<div class="progress" role="img" aria-label="' + p.done + ' of ' + p.total + ' steps done">' +
      '<div class="progress-fill" style="width:' + pct + '%"></div></div>';
  }

  // ---- form pieces -------------------------------------------------------------

  /** A <select>. options: [value] or [[value, label]]. attrs: a string of extra attributes. */
  function select(name, options, current, placeholder, attrs) {
    var html = '<select name="' + esc(name) + '"' + (attrs ? ' ' + attrs : '') + '>';
    if (placeholder !== null) html += '<option value="">' + esc(placeholder || 'Choose…') + '</option>';
    options.forEach(function (o) {
      var value = Array.isArray(o) ? o[0] : o;
      var label = Array.isArray(o) ? o[1] : o;
      html += '<option value="' + esc(value) + '"' + (String(value) === String(current || '') ? ' selected' : '') + '>' + esc(label) + '</option>';
    });
    return html + '</select>';
  }

  /**
   * Five buttons for difficulty, with what the chosen one means below.
   * For a form: name is the hidden input. For a record: act and target.
   */
  function difficultyPicker(kind, value, target) {
    var texts = kind === 'goal' ? Model.GOAL_DIFFICULTY : Model.PROBLEM_DIFFICULTY;
    var html = '<div class="difficulty-picker" data-kind="' + kind + '">' +
      '<div class="seg" role="radiogroup" aria-label="Difficulty">';
    for (var i = 1; i <= 5; i++) {
      html += '<button type="button" class="seg-btn' + (i === value ? ' on' : '') + '" role="radio" aria-checked="' + (i === value) + '" ' +
        'data-act="pick-difficulty" data-value="' + i + '"' + (target ? ' data-target="' + esc(target) + '"' : '') +
        ' title="' + esc(texts[i]) + '">' + i + '</button>';
    }
    html += '</div><div class="picker-help">' + (value ? esc(texts[value]) : 'How hard does it seem?') + '</div>';
    if (!target) html += '<input type="hidden" name="difficulty" value="' + (value || '') + '">';
    return html + '</div>';
  }

  /** Five faces for mood. */
  function moodPicker(value, target) {
    var html = '<div class="mood-picker" role="radiogroup" aria-label="Mood">';
    Model.MOODS.forEach(function (m) {
      html += '<button type="button" class="mood-btn' + (m.value === value ? ' on' : '') + '" role="radio" aria-checked="' + (m.value === value) + '" ' +
        'data-act="pick-mood" data-value="' + m.value + '"' + (target ? ' data-target="' + esc(target) + '"' : '') +
        ' title="' + esc(m.label) + '" aria-label="' + esc(m.label) + '">' + m.face + '</button>';
    });
    if (!target) html += '<input type="hidden" name="mood" value="' + (value || '') + '">';
    return html + '</div>';
  }

  /** Toggle chips for feelings (emotions). */
  function feelingChips(selected, target) {
    var html = '<div class="chips">';
    Model.EMOTIONS.forEach(function (em) {
      var on = selected.indexOf(em) >= 0;
      html += '<button type="button" class="chip' + (on ? ' on' : '') + '" aria-pressed="' + on + '" data-act="toggle-feeling" data-value="' + esc(em) + '"' +
        (target ? ' data-target="' + esc(target) + '"' : '') + '>' + esc(em) + '</button>';
    });
    if (!target) html += '<input type="hidden" name="emotions" value="' + esc(selected.join('|')) + '">';
    return html + '</div>';
  }

  // ---- links to records --------------------------------------------------------

  var ROUTE = { problems: 'problem', goals: 'goal', tasks: 'task', journal: 'entry' };
  var KIND_LABEL = { problems: 'Problem', goals: 'Goal', tasks: 'Task', journal: 'Journal' };

  function href(kind, id) {
    return '#/' + ROUTE[kind] + '/' + encodeURIComponent(id);
  }

  function titleOf(kind, rec) {
    if (!rec) return '';
    if (kind === 'goals') return rec.title || 'Untitled goal';
    if (kind === 'journal') return rec.kind === 'reflection' ? 'Reflection, ' + U.fmtDay(rec.createdAt) : U.fmtDay(rec.createdAt) + ' — ' + U.firstLine(rec.text, 50);
    return U.firstLine(rec.text, 90) || 'Untitled';
  }

  /** A short line linking to a record. */
  function recordLink(kind, rec, extra) {
    return '<a class="rec-link ' + kind + '" href="' + href(kind, rec.id) + '">' +
      '<span class="rec-kind">' + KIND_LABEL[kind] + '</span>' +
      '<span class="rec-title">' + esc(titleOf(kind, rec)) + '</span>' +
      (extra || '') + '</a>';
  }

  function empty(text) {
    return '<p class="empty">' + text + '</p>';
  }

  /** The page header of a section. */
  function head(title, count, actionsHtml) {
    return '<header class="pane-head"><div><h1>' + esc(title) + '</h1>' +
      (count ? '<span class="count">' + esc(count) + '</span>' : '') + '</div>' +
      (actionsHtml ? '<div class="head-actions">' + actionsHtml + '</div>' : '') + '</header>';
  }

  /** The back link at the top of a record, shown on a phone. */
  function back(hrefTo, label) {
    return '<a class="back" href="' + hrefTo + '">' + icon('back') + esc(label) + '</a>';
  }

  /** Two or three buttons that act like tabs: [[value, label]], current, act. */
  function segmented(options, current, act) {
    return '<div class="seg small" role="tablist">' + options.map(function (o) {
      return '<button type="button" role="tab" class="seg-btn' + (o[0] === current ? ' on' : '') + '" aria-selected="' + (o[0] === current) + '" ' +
        'data-act="' + act + '" data-value="' + esc(o[0]) + '">' + esc(o[1]) + '</button>';
    }).join('') + '</div>';
  }

  global.UI = {
    toast: toast,
    sheet: sheet,
    closeSheet: closeSheet,
    sheetIsOpen: sheetIsOpen,
    confirm: confirm,
    confirmed: confirmed,
    icon: icon,
    areaTag: areaTag,
    emotionTag: emotionTag,
    difficultyTag: difficultyTag,
    moodFace: moodFace,
    progressBar: progressBar,
    select: select,
    difficultyPicker: difficultyPicker,
    moodPicker: moodPicker,
    feelingChips: feelingChips,
    href: href,
    titleOf: titleOf,
    recordLink: recordLink,
    empty: empty,
    head: head,
    back: back,
    segmented: segmented,
    KIND_LABEL: KIND_LABEL
  };
}(window));
