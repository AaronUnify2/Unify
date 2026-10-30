/* ===========================================================================
   session-page.js — the shared session, as helpers see it (session.html).

   Someone you've sent the link to sees the session's tasks in order, can
   tick them off, and can add to the list; everyone looking sees each change
   as it happens. They're asked for their first name once (kept in their
   browser), so you can see who ticked or added what.

   Nothing else from Unify is here: this page only knows the code after the
   # in the link, and reads that one session from the sharing database.
   =========================================================================== */

(function () {
  'use strict';

  var esc = U.esc;
  var NAME_KEY = 'unify.helperName';

  var page = document.getElementById('page');
  var code = location.hash.replace(/^#\/?/, '');
  var snap = null;
  var loaded = false;
  var status = 'connecting';
  var memoryName = '';

  var STATUS_TEXT = {
    connecting: 'Connecting…',
    live: 'Live',
    offline: 'Reconnecting…',
    refused: 'Can’t connect'
  };

  // ---- your name ------------------------------------------------------------------

  function myName() {
    try { return localStorage.getItem(NAME_KEY) || memoryName; } catch (e) { return memoryName; }
  }

  function setName(name) {
    memoryName = name;
    try {
      if (name) localStorage.setItem(NAME_KEY, name);
      else localStorage.removeItem(NAME_KEY);
    } catch (e) { /* kept for this visit only */ }
  }

  // ---- drawing ------------------------------------------------------------------------

  function toast(message, type) {
    var root = document.getElementById('toast-root');
    root.innerHTML = '';
    var el = document.createElement('div');
    el.className = 'toast' + (type ? ' ' + type : '');
    el.textContent = message;
    root.appendChild(el);
    setTimeout(function () { el.classList.add('out'); }, 2600);
    setTimeout(function () { el.remove(); }, 3000);
  }

  function message(title, text) {
    return '<div class="shared-top"><span class="brand">UNIFY</span></div>' +
      '<h1>' + esc(title) + '</h1><p class="shared-sub">' + esc(text) + '</p>';
  }

  function nameForm() {
    return '<div class="shared-top"><span class="brand">UNIFY</span></div>' +
      '<h1>You’ve been sent a list</h1>' +
      '<p class="shared-sub">Tick things off as they’re done and add anything that comes up. Everyone with the link sees it straight away.</p>' +
      '<form id="name-form" class="card">' +
      '<label class="field"><span>Your first name, so everyone knows who did what</span>' +
      '<input id="name-input" type="text" name="name" autocomplete="given-name" maxlength="40" required autofocus></label>' +
      '<div class="form-actions"><button class="btn primary" type="submit">Show the list</button></div>' +
      '</form>';
  }

  function itemHtml(item) {
    var who = [];
    if (item.goal) who.push('<span class="shared-goal">' + esc(item.goal) + '</span>');
    if (item.done && item.doneBy) who.push('<span>done by ' + esc(item.doneBy) + '</span>');
    if (item.addedBy) who.push('<span>added by ' + esc(item.addedBy) + '</span>');
    return '<li class="shared-item' + (item.done ? ' done' : '') + '">' +
      '<button class="tick' + (item.done ? ' on' : '') + '" data-key="' + esc(item.key) + '" role="checkbox" aria-checked="' + item.done + '" ' +
      'aria-label="' + (item.done ? 'Not done: ' : 'Done: ') + esc(item.text) + '">' +
      '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>' +
      '</button>' +
      '<div class="shared-body"><div class="shared-text">' + esc(item.text) + '</div>' +
      (item.notes ? '<div class="shared-notes">' + esc(item.notes) + '</div>' : '') +
      (who.length ? '<div class="shared-who">' + who.join('') + '</div>' : '') +
      '</div></li>';
  }

  function sessionHtml() {
    var items = Share.items(snap);
    var done = items.filter(function (i) { return i.done; }).length;
    var sub = [];
    if (snap.date) sub.push(U.fmtDay(snap.date + 'T12:00:00'));
    if (snap.owner) sub.push('from ' + snap.owner);
    sub.push(done + ' of ' + U.plural(items.length, 'job') + ' done');
    document.title = (snap.title || 'Shared session') + ' · Unify';
    return '<div class="shared-top"><span class="brand">UNIFY</span>' +
      '<p class="share-status ' + esc(status) + '"><span class="sync-dot"></span>' + esc(STATUS_TEXT[status] || '') + '</p></div>' +
      '<h1>' + esc(snap.title || 'Shared session') + '</h1>' +
      '<p class="shared-sub">' + esc(sub.join(' · ')) + '</p>' +
      (items.length ? '<ul class="shared-list">' + items.map(itemHtml).join('') + '</ul>' : '<p class="empty">Nothing on the list yet.</p>') +
      '<form id="add-form" class="inline-form">' +
      '<label class="sr-only" for="add-text">Add something to the list</label>' +
      '<input id="add-text" type="text" name="text" placeholder="Add something to the list" autocomplete="off" maxlength="300" required>' +
      '<button class="btn" type="submit">Add</button></form>' +
      '<p class="shared-name">You’re ' + esc(myName()) + '. <button class="link-btn small" id="change-name" type="button">Not you?</button></p>';
  }

  /** Redraw, keeping anything typed into the add box. */
  function render() {
    var box = document.getElementById('add-text');
    var typed = box ? box.value : '';
    var focused = box && document.activeElement === box;

    if (!Share.configured()) {
      page.innerHTML = message('Sharing isn’t set up', 'This copy of Unify can’t open shared sessions yet.');
    } else if (!Share.validCode(code)) {
      page.innerHTML = message('This link isn’t complete', 'Ask for the link again, and open it exactly as it was sent.');
    } else if (!myName()) {
      if (document.getElementById('name-form')) return;   // don't lose what's being typed
      page.innerHTML = nameForm();
      var input = document.getElementById('name-input');
      if (input) input.focus();
      return;
    } else if (status === 'refused' && !loaded) {
      page.innerHTML = message('Can’t open this list', 'The list couldn’t be reached. Check your connection and reload the page.');
    } else if (!loaded) {
      page.innerHTML = message('Opening the list…', '');
    } else if (snap === null) {
      document.title = 'Session finished · Unify';
      page.innerHTML = message('This list has finished', 'It’s been closed, or the link isn’t quite right. Ask whoever sent it if you think it should still be here.');
    } else {
      page.innerHTML = sessionHtml();
    }

    box = document.getElementById('add-text');
    if (box && typed) box.value = typed;
    if (box && focused) box.focus();
  }

  // ---- changes ------------------------------------------------------------------------

  function save(changes) {
    Share.patch(code, changes).catch(function () {
      toast('Not saved — check your connection and try again.', 'error');
    });
  }

  function tick(key) {
    var item = snap && snap.items && snap.items[key];
    if (!item) return;
    var done = !item.done;
    var at = new Date().toISOString();
    // Show it straight away; the database confirms it a moment later
    item.done = done;
    item.at = at;
    if (done) item.doneBy = myName();
    else delete item.doneBy;
    render();
    var changes = {};
    changes['items/' + key + '/done'] = done;
    changes['items/' + key + '/at'] = at;
    changes['items/' + key + '/doneBy'] = done ? myName() : null;
    save(changes);
  }

  function add(text) {
    if (!snap) return;
    var last = -1;
    Share.items(snap).forEach(function (i) { if (i.order > last) last = i.order; });
    var key = Share.newItemKey();
    var item = { text: text.slice(0, 300), order: last + 1, done: false, at: new Date().toISOString(), addedBy: myName() };
    snap.items = snap.items || {};
    snap.items[key] = item;
    render();
    var changes = {};
    changes['items/' + key] = item;
    save(changes);
  }

  page.addEventListener('click', function (ev) {
    var tickBtn = ev.target.closest('.tick[data-key]');
    if (tickBtn) {
      tick(tickBtn.dataset.key);
      return;
    }
    if (ev.target.closest('#change-name')) {
      setName('');
      render();
    }
  });

  page.addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (ev.target.id === 'name-form') {
      var name = document.getElementById('name-input').value.trim().slice(0, 40);
      if (!name) return;
      setName(name);
      render();
    } else if (ev.target.id === 'add-form') {
      var box = document.getElementById('add-text');
      var text = box.value.trim();
      if (!text) return;
      box.value = '';
      add(text);
      box = document.getElementById('add-text');
      if (box) box.focus();
    }
  });

  // ---- starting --------------------------------------------------------------------------

  if (Share.configured() && Share.validCode(code)) {
    Share.watch(code, function (data) {
      snap = data;
      loaded = true;
      render();
    }, function (st) {
      status = st;
      render();
    });
  }
  render();
}());
