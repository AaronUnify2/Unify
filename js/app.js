/* ===========================================================================
   app.js — starting up, the sections, the address bar, and the listeners.

   Routes (the part after #):
     /problems   /problem/<id>     /goals   /goal/<id>     /tasks   /task/<id>
     /journal    /entry/<id>       /probe   /insights      /settings   /help

   On a phone there is a tab bar at the bottom and one thing on screen at a
   time. On a wide screen there is a rail on the left, and a section's list
   sits beside the record you've opened, as in Process Hub.
   =========================================================================== */

(function (global) {
  'use strict';

  var WIDE = '(min-width: 1100px)';

  var SECTIONS = [
    { id: 'problems', label: 'Problems', item: 'problem', tab: true },
    { id: 'goals', label: 'Goals', item: 'goal', tab: true },
    { id: 'tasks', label: 'Tasks', item: 'task', tab: true },
    { id: 'journal', label: 'Journal', item: 'entry', tab: true },
    { id: 'probe', label: 'Probe', tab: true },
    { id: 'insights', label: 'Insights' },
    { id: 'settings', label: 'Settings' },
    { id: 'help', label: 'Help' }
  ];

  var ITEM_TO_SECTION = {};
  SECTIONS.forEach(function (s) { if (s.item) ITEM_TO_SECTION[s.item] = s.id; });

  var main, wideQuery;
  var entered = false;

  // ---- routes ----------------------------------------------------------------

  function route() {
    var hash = location.hash.replace(/^#\/?/, '');
    var parts = hash.split('/');
    var name = parts[0] || 'problems';
    var id = parts[1] ? decodeURIComponent(parts[1]) : null;
    var section = ITEM_TO_SECTION[name] || name;
    var known = SECTIONS.some(function (s) { return s.id === section; });
    if (!known) { name = 'problems'; section = 'problems'; id = null; }
    return { name: name, id: id, section: section };
  }

  function go(hash) {
    if (location.hash === hash) render();
    else location.hash = hash;
  }

  function isWide() {
    return wideQuery.matches;
  }

  // ---- drawing -------------------------------------------------------------------

  function navHtml(r, forTabs) {
    var items = forTabs ? SECTIONS.filter(function (s) { return s.tab; }) : SECTIONS;
    var html = items.map(function (s) {
      var on = s.id === r.section;
      return '<a class="nav-item' + (on ? ' on' : '') + '" href="#/' + s.id + '"' + (on ? ' aria-current="page"' : '') + '>' +
        UI.icon(s.id) + '<span>' + s.label + '</span></a>';
    }).join('');
    if (forTabs) {
      var moreOn = !SECTIONS.some(function (s) { return s.tab && s.id === r.section; });
      html += '<button class="nav-item' + (moreOn ? ' on' : '') + '" data-act="more">' + UI.icon('more') + '<span>More</span></button>';
    }
    return html;
  }

  function sectionHtml(r) {
    var v = Views[r.section];
    if (r.section === 'settings') return Views.settings.settings();
    if (r.section === 'help') return Views.settings.help();
    if (!v.item) return v.list(r);
    if (isWide()) {
      var detail = r.id ? v.item(r.id, r) : v.placeholder();
      return '<div class="split"><section class="pane list-pane">' + v.list(r) + '</section>' +
        '<section class="pane detail-pane">' + detail + '</section></div>';
    }
    return r.id ? v.item(r.id, r) : v.list(r);
  }

  var lastKey = '';

  /** Draw the page for the current route, keeping scroll, focus and typed text. */
  function render() {
    if (!entered) return;
    pendingRender = false;
    var r = route();
    var key = r.name + '/' + (r.id || '');
    var sameRoute = key === lastKey;
    var sameSection = lastKey.split('/')[0] && (ITEM_TO_SECTION[lastKey.split('/')[0]] || lastKey.split('/')[0]) === r.section;

    // Remember what to put back
    var scroll = { win: window.scrollY, list: 0, detail: 0 };
    var listPane = main.querySelector('.list-pane');
    var detailPane = main.querySelector('.detail-pane');
    if (listPane) scroll.list = listPane.scrollTop;
    if (detailPane) scroll.detail = detailPane.scrollTop;
    var active = document.activeElement;
    var focus = active && main.contains(active) && active.id ? {
      id: active.id,
      start: active.selectionStart,
      end: active.selectionEnd
    } : null;
    var typed = {};
    main.querySelectorAll('textarea[id], input[id]').forEach(function (el) {
      if (!el.hasAttribute('data-bind') && el.type !== 'password' && el.type !== 'file' && el.value) typed[el.id] = el.value;
    });

    document.getElementById('rail').innerHTML = '<a class="brand" href="#/problems">UNIFY</a>' + navHtml(r, false);
    document.getElementById('tabbar').innerHTML = navHtml(r, true);
    main.className = 'main section-' + r.section + (r.id ? ' has-item' : '');
    main.innerHTML = sectionHtml(r);
    document.title = (SECTIONS.filter(function (s) { return s.id === r.section; })[0].label) + ' · Unify';

    // Put it back
    if (sameRoute) {
      Object.keys(typed).forEach(function (id) {
        var el = document.getElementById(id);
        if (el && !el.value) {
          el.value = typed[id];
          var form = el.closest('.add-card');
          if (form) form.classList.add('has-text');
        }
      });
    }
    main.querySelectorAll('[data-autogrow]').forEach(autogrow);
    listPane = main.querySelector('.list-pane');
    detailPane = main.querySelector('.detail-pane');
    if (sameSection && listPane) listPane.scrollTop = scroll.list;
    if (sameRoute) {
      if (detailPane) detailPane.scrollTop = scroll.detail;
      window.scrollTo(0, scroll.win);
    } else if (!isWide() || !sameSection) {
      window.scrollTo(0, 0);
    }
    if (focus && sameRoute) {
      var el = document.getElementById(focus.id);
      if (el) {
        el.focus({ preventScroll: true });
        try { if (focus.start != null) el.setSelectionRange(focus.start, focus.end); } catch (e) { /* not a text field */ }
      }
    }
    lastKey = key;

    var v = Views[r.section];
    if (v && v.mount) v.mount(r);
  }

  // A redraw asked for by something in the background (a sync, the model
  // loading) waits while you're typing, so it never takes the field away.
  var pendingRender = false;

  function typing() {
    var el = document.activeElement;
    return el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && /text|search|password|date|time/.test(el.type)));
  }

  function requestRender() {
    if (typing() || UI.sheetIsOpen()) {
      pendingRender = true;
      return;
    }
    render();
  }

  function autogrow(el) {
    el.style.height = 'auto';
    el.style.height = (el.scrollHeight + 2) + 'px';
  }

  // ---- the sync light in the header ---------------------------------------------

  var SYNC_LABEL = {
    off: 'This device only',
    loading: 'Syncing…',
    pending: 'Not uploaded yet',
    saving: 'Saving…',
    saved: 'Synced',
    offline: 'Offline',
    error: 'Sync problem'
  };

  function drawSync() {
    var el = document.getElementById('sync');
    if (!el) return;
    el.className = 'sync ' + Sync.state;
    el.title = (Views.settings.STATE_TEXT[Sync.state] || '') + (Sync.detail ? ' ' + Sync.detail : '');
    el.innerHTML = '<span class="sync-dot"></span><span class="sync-text">' + SYNC_LABEL[Sync.state] + '</span>';
  }

  // ---- listeners -----------------------------------------------------------------

  function onClick(ev) {
    var actEl = ev.target.closest('[data-act]');
    if (actEl && !actEl.disabled) {
      var fn = Handlers.act[actEl.dataset.act];
      if (fn) {
        if (actEl.tagName === 'A' && actEl.dataset.act === 'sheet-close') {
          UI.closeSheet();
          return; // let the link go where it points
        }
        ev.preventDefault();
        fn(actEl, ev);
        return;
      }
    }
    if (ev.target.closest('a, button, input, select, textarea, label, summary')) {
      // a link inside a sheet closes it on the way
      if (ev.target.closest('.sheet a[href^="#"]')) UI.closeSheet();
      return;
    }
    var card = ev.target.closest('[data-href]');
    if (card) go(card.dataset.href);
  }

  function onKeydown(ev) {
    if (ev.key === 'Escape' && UI.sheetIsOpen()) {
      UI.closeSheet();
      return;
    }
    // Cmd/Ctrl+Enter submits the form you're typing in
    if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey) && ev.target.form) {
      ev.preventDefault();
      if (ev.target.form.requestSubmit) ev.target.form.requestSubmit();
      return;
    }
    // Enter or space on a card or a pickable item
    if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches('[data-act][role=checkbox][tabindex]')) {
      ev.preventDefault();
      ev.target.click();
    }
  }

  function onSubmit(ev) {
    var form = ev.target.closest('form[data-form]');
    if (!form) return;
    ev.preventDefault();
    var fn = Handlers.form[form.dataset.form];
    if (fn) fn(form, ev);
  }

  // Saving a record's field as you type: a short pause, then Store.update,
  // quietly (no redraw), so the field keeps its place.
  var bindTimers = {};

  function saveBound(el, quiet, trim) {
    var parts = el.dataset.bind.split('|');
    var kind = parts[0], id = parts[1], field = parts[2];
    var rec = Store.get(kind, id);
    if (!rec) return;
    var value = el.value;
    if (field === 'goalId') value = value || null;
    if (trim && typeof value === 'string') value = value.trim();
    if (rec[field] === value) return;
    var patch = {};
    patch[field] = value;
    Store.update(kind, id, patch, { quiet: quiet });
    // The rest of the page catches up once you've finished with the field
    if (quiet) pendingRender = true;
  }

  function onInput(ev) {
    var el = ev.target;
    if (el.hasAttribute('data-autogrow')) autogrow(el);
    if (el.dataset.bind) {
      var key = el.dataset.bind;
      clearTimeout(bindTimers[key]);
      bindTimers[key] = setTimeout(function () { saveBound(el, true, false); }, 400);
      return;
    }
    if (el.dataset.live) liveHandler(el);
  }

  var liveTimers = {};
  function liveHandler(el) {
    var name = el.dataset.live;
    clearTimeout(liveTimers[name]);
    liveTimers[name] = setTimeout(function () {
      var fn = Handlers.live[name];
      if (fn) fn(el);
    }, name === 'problem-hint' ? 450 : 250);
  }

  function onChange(ev) {
    var el = ev.target;
    if (el.dataset.bind) {
      clearTimeout(bindTimers[el.dataset.bind]);
      // Selects redraw (other things depend on them); text stays quiet
      saveBound(el, el.tagName !== 'SELECT', true);
      return;
    }
    if (el.dataset.change) {
      var fn = Handlers.change[el.dataset.change];
      if (fn) fn(el, ev);
    }
  }

  function onFocusOut() {
    if (!pendingRender) return;
    setTimeout(function () { if (pendingRender && !typing() && !UI.sheetIsOpen()) render(); }, 300);
  }

  // ---- shared actions --------------------------------------------------------------

  Handlers.add('act', {
    'sheet-close': function () { UI.closeSheet(); },
    'confirm-ok': function () { UI.confirmed(); },
    'more': function () {
      var r = route();
      UI.sheet('More', '<nav class="more-list">' + SECTIONS.filter(function (s) { return !s.tab; }).map(function (s) {
        return '<a class="nav-item' + (s.id === r.section ? ' on' : '') + '" href="#/' + s.id + '">' + UI.icon(s.id) + '<span>' + s.label + '</span></a>';
      }).join('') + '</nav>');
    },
    // Difficulty, mood and feelings pickers: a record's field (data-target)
    // or a form's hidden input
    'pick-difficulty': function (el) {
      var value = parseInt(el.dataset.value, 10);
      var picker = el.closest('.difficulty-picker');
      if (el.dataset.target) {
        var t = el.dataset.target.split('|');
        var rec = Store.get(t[0], t[1]);
        Store.update(t[0], t[1], { difficulty: rec && rec.difficulty === value ? 0 : value });
        return;
      }
      var input = picker.querySelector('input[name=difficulty]');
      var next = String(value) === input.value ? '' : String(value);
      input.value = next;
      var texts = picker.dataset.kind === 'goal' ? Model.GOAL_DIFFICULTY : Model.PROBLEM_DIFFICULTY;
      picker.querySelectorAll('.seg-btn').forEach(function (b) {
        var on = b.dataset.value === next;
        b.classList.toggle('on', on);
        b.setAttribute('aria-checked', on);
      });
      picker.querySelector('.picker-help').textContent = next ? texts[next] : 'How hard does it seem?';
    },
    'pick-mood': function (el) {
      var value = parseInt(el.dataset.value, 10);
      if (el.dataset.target) {
        var t = el.dataset.target.split('|');
        var rec = Store.get(t[0], t[1]);
        Store.update(t[0], t[1], { mood: rec && rec.mood === value ? 0 : value });
        return;
      }
      var picker = el.closest('.mood-picker');
      var input = picker.querySelector('input[name=mood]');
      var next = String(value) === input.value ? '' : String(value);
      input.value = next;
      picker.querySelectorAll('.mood-btn').forEach(function (b) {
        var on = b.dataset.value === next;
        b.classList.toggle('on', on);
        b.setAttribute('aria-checked', on);
      });
    },
    'toggle-feeling': function (el) {
      var em = el.dataset.value;
      if (el.dataset.target) {
        var t = el.dataset.target.split('|');
        var rec = Store.get(t[0], t[1]);
        if (!rec) return;
        var list = rec.emotions.indexOf(em) >= 0
          ? rec.emotions.filter(function (x) { return x !== em; })
          : rec.emotions.concat([em]);
        Store.update(t[0], t[1], { emotions: list });
        return;
      }
      var input = el.closest('.chips').querySelector('input[name=emotions]');
      var chosen = input.value ? input.value.split('|') : [];
      var i = chosen.indexOf(em);
      if (i >= 0) chosen.splice(i, 1); else chosen.push(em);
      input.value = chosen.join('|');
      el.classList.toggle('on', i < 0);
      el.setAttribute('aria-pressed', i < 0);
    }
  });

  // ---- starting --------------------------------------------------------------------

  /** Show the app (once there's a token, or this device only was chosen). */
  function enter() {
    document.getElementById('gate').hidden = true;
    document.getElementById('app').hidden = false;
    entered = true;
    lastKey = '';
    render();
    drawSync();
    if (Prefs.get('loadModel') && Semantic.status === 'idle') {
      // Give the page a moment to settle before reading the model
      setTimeout(function () { if (Semantic.status === 'idle') Semantic.start(); }, 2500);
    }
  }

  function showGate() {
    entered = false;
    document.getElementById('app').hidden = true;
    var gate = document.getElementById('gate');
    gate.innerHTML = Views.settings.gate();
    gate.hidden = false;
  }

  function boot() {
    main = document.getElementById('main');
    wideQuery = window.matchMedia(WIDE);
    var onWide = function () { if (entered) render(); };
    if (wideQuery.addEventListener) wideQuery.addEventListener('change', onWide);
    else wideQuery.addListener(onWide);

    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKeydown);
    document.addEventListener('submit', onSubmit);
    document.addEventListener('input', onInput);
    document.addEventListener('change', onChange);
    document.addEventListener('focusout', onFocusOut);
    window.addEventListener('hashchange', function () { UI.closeSheet(); render(); });

    Store.load();
    Store.on(function (info) {
      if (info.quiet) return;
      if (info.remote) requestRender();
      else render();
    });
    Sync.on(drawSync);

    if (GitHub.config()) {
      enter();
      Sync.start();
    } else if (Prefs.get('localOnly')) {
      enter();
      Sync.start();
    } else {
      showGate();
    }

    if ('serviceWorker' in navigator && location.protocol === 'https:') {
      navigator.serviceWorker.register('sw.js').catch(function (e) { console.warn('No offline support:', e); });
    }
  }

  global.App = {
    route: route,
    go: go,
    render: render,
    requestRender: requestRender,
    isWide: isWide,
    enter: enter
  };

  document.addEventListener('DOMContentLoaded', boot);
}(window));
