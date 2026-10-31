/* ===========================================================================
   views-settings.js — signing in, Settings, and Help.

   Three ways to keep your data, chosen per device:
     - signed in with Google (account.js): kept in your Unify account and
       in step on every device you sign in on
     - this device only: kept in this browser and nowhere else
     - a private GitHub repository (github.js), for those who'd rather
   =========================================================================== */

(function (global) {
  'use strict';

  var esc = U.esc;

  // ---- connecting to GitHub ------------------------------------------------------

  function connectForm(submitLabel) {
    var d = GitHub.DEFAULTS;
    return '<form class="connect-form" data-form="connect">' +
      '<label class="field"><span>Token</span>' +
      '<input type="password" name="token" autocomplete="off" autocapitalize="off" spellcheck="false" required placeholder="github_pat_…"></label>' +
      '<label class="field"><span>Private repository</span>' +
      '<input type="text" name="repo" value="' + esc(d.owner + '/' + d.repo) + '" autocomplete="off" autocapitalize="off" spellcheck="false" required></label>' +
      '<p class="form-error" data-error hidden></p>' +
      '<div class="form-actions"><button class="btn primary" type="submit">' + esc(submitLabel) + '</button></div>' +
      '</form>';
  }

  var TOKEN_STEPS =
    '<details class="steps"><summary>How to make a token</summary><ol>' +
    '<li>On GitHub: <strong>Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token</strong>.</li>' +
    '<li>Expiration: a year is fine for a personal tool.</li>' +
    '<li>Repository access: <strong>Only select repositories → Unify-data</strong>.</li>' +
    '<li>Permissions: <strong>Contents → Read and write</strong>. Nothing else.</li>' +
    '<li>Generate, copy it, and paste it here. Do the same on your phone and your computer (or use the same token on both).</li>' +
    '</ol></details>';

  var LOCAL_ADVICE = '<p class="muted small">Browsers can clear what a website keeps — clearing browsing data does, and Safari on an iPhone does for sites not opened for a week unless they’re on the home screen. So add Unify to your home screen, and download a copy now and then (Settings).</p>';

  function githubDetails() {
    return '<details class="steps"><summary>Use a private GitHub repository instead</summary>' +
      '<p>For people with a GitHub account who’d rather keep their data in a repository of their own.</p>' +
      connectForm('Connect') + TOKEN_STEPS + '</details>';
  }

  function signInButton(label) {
    // Disabled until Google's sign-in is loaded: pressed before then, its
    // window would be blocked
    return '<button class="btn primary google-btn" data-act="account-sign-in"' + (Account.ready && Account.known ? '' : ' disabled') + '>' +
      GOOGLE_ICON + esc(label || 'Sign in with Google') + '</button>';
  }

  var GOOGLE_ICON = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3Z"/><path fill="currentColor" opacity=".8" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22Z"/><path fill="currentColor" opacity=".6" d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1a10 10 0 0 0 0 9.2L6.4 14Z"/><path fill="currentColor" opacity=".9" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.4L6.4 10C7.2 7.7 9.4 6 12 6Z"/></svg>';

  /** The first screen on a device that hasn't chosen yet. */
  function gate() {
    var html = '<div class="gate-card">' +
      '<div class="brand big">UNIFY</div>' +
      '<p class="lede">Problems into goals, goals into steps — and a journal of how it goes.</p>';
    if (Account.configured()) {
      html += '<p>Sign in to keep your Unify on your phone and computer alike. What you write is never sold or used for advertising.</p>' +
        '<p class="form-error" id="gate-error" hidden></p>' +
        '<div class="gate-actions">' + signInButton() +
        '<button class="btn" data-act="local-only">Use it on this device only</button></div>' +
        '<p class="muted small">On this device only, nothing you write leaves this browser — unless you share a session by link.</p>';
    } else {
      html += '<p class="gate-actions"><button class="btn primary" data-act="local-only">Use it on this device only</button></p>';
    }
    return html + githubDetails() + '</div>';
  }

  // ---- Settings ------------------------------------------------------------------

  var STATE_TEXT = {
    off: 'Not syncing — on this device only.',
    loading: 'Checking for changes…',
    signedout: 'Signed out on this device.',
    pending: 'Changes waiting to upload.',
    saving: 'Uploading…',
    saved: 'Up to date.',
    offline: 'Offline — saved on this device.',
    error: 'Sync problem.'
  };

  function settings() {
    var cfg = GitHub.config();
    var d = Store.data;
    var html = UI.head('Settings', '');
    var user = Account.user;
    var syncLines = '<p id="sync-detail" class="sync-detail ' + Sync.state + '">' + esc(STATE_TEXT[Sync.state] || '') +
      (Sync.detail ? ' ' + esc(Sync.detail) : '') + '</p>' +
      (Sync.lastSyncedAt ? '<p class="muted small">Last synced ' + esc(U.ago(Sync.lastSyncedAt)) + '.</p>' : '');

    html += '<section class="settings-section"><h2>Where your data is kept</h2>';
    if (cfg) {
      html += '<p>In your private GitHub repository, <strong>' + esc(cfg.owner + '/' + cfg.repo) + '</strong>, file <code>' + esc(cfg.path) + '</code>.</p>' + syncLines +
        '<div class="record-actions"><button class="btn" data-act="sync-now">Sync now</button>' +
        '<button class="btn danger-text" data-act="sign-out">Sign out of this device</button></div>';
      if (Account.configured()) {
        html += '<h3>Move to a Google account</h3>' +
          '<p>Your data moves to your Unify account, and you sign in with Google on your other devices instead of using a token. The repository stays as it is, as a copy.</p>' +
          '<p class="form-error" id="move-error" hidden></p>' +
          signInButton('Move to a Google account');
      }
    } else if (Prefs.get('account')) {
      if (user) {
        html += '<p>In your Unify account, signed in with Google as <strong>' + esc(user.displayName || user.email || 'you') + '</strong>' +
          (user.email && user.displayName ? ' (' + esc(user.email) + ')' : '') + '.</p>' + syncLines +
          '<div class="record-actions"><button class="btn" data-act="sync-now">Sync now</button>' +
          '<button class="btn danger-text" data-act="sign-out">Sign out of this device</button></div>';
      } else if (!Account.known) {
        html += '<p>Checking who’s signed in…</p>';
      } else {
        html += '<p>You’re signed out on this device. Sign in again to carry on; what’s on this device is merged in.</p>' +
          '<p class="form-error" id="move-error" hidden></p>' + signInButton() +
          '<div class="record-actions"><button class="btn danger-text" data-act="sign-out">Remove this device’s copy</button></div>';
      }
    } else {
      html += '<p>On this device only. Nothing you write leaves this browser, except a session while you share it by link.</p>' + LOCAL_ADVICE;
      if (Account.configured()) {
        html += '<h3>Sign in</h3><p>Keep it on your phone and computer alike. What’s on this device goes into your account.</p>' +
          '<p class="form-error" id="move-error" hidden></p>' + signInButton();
      }
      html += githubDetails();
    }
    html += '</section>';

    html += '<section class="settings-section"><h2>Language model</h2>' +
      '<p>Probe and the “sounds like” hints match by meaning using a small language model (about 23 MB) that runs on this device. Nothing you write is sent anywhere to be read.</p>' +
      '<p id="model-status" class="muted">' + esc(Semantic.statusText || 'Not loaded yet.') + '</p>' +
      (Semantic.status === 'idle' || Semantic.status === 'failed' ? '<button class="btn small" data-act="model-load">Load it now</button>' : '') +
      '<label class="check-row"><input type="checkbox" data-change="pref" data-pref="loadModel"' + (Prefs.get('loadModel') ? ' checked' : '') + '> Load it when Unify opens on this device</label>' +
      '</section>';

    html += '<section class="settings-section"><h2>Tasks</h2>' +
      '<label class="check-row"><input type="checkbox" data-change="pref" data-pref="askReflection"' + (Prefs.get('askReflection') ? ' checked' : '') + '> Ask for a reflection when I tick off a task</label>' +
      '</section>';

    html += '<section class="settings-section"><h2>Sharing sessions</h2>' +
      (Share.configured()
        ? '<p>Set up. A session’s <em>Get link</em> shares it with anyone you send the link to, until you stop sharing or finish it.</p>'
        : '<p>Not set up yet. Sharing needs a small free database (Firebase), set up once; the README has the steps (<em>Sharing sessions</em>).</p>') +
      '</section>';

    html += '<section class="settings-section"><h2>Your data</h2>' +
      '<p>' + U.plural(d.problems.length, 'problem') + ', ' + U.plural(d.goals.length, 'goal') + ', ' +
      U.plural(d.tasks.length, 'task') + ', ' + U.plural(d.journal.length, 'journal entry', 'journal entries') + '.</p>' +
      '<div class="record-actions">' +
      '<button class="btn" data-act="export">Download a copy (JSON)</button>' +
      '<label class="btn file-btn">Import a copy…<input type="file" accept="application/json,.json" data-change="import"></label>' +
      '</div>' +
      '<p class="muted small">Importing merges a copy into what’s here; nothing is removed.' +
      (Prefs.get('lastExport') ? ' Last downloaded ' + esc(U.ago(Prefs.get('lastExport'))) + '.' : '') + '</p>' +
      (Prefs.get('account') && user
        ? '<h3>Delete your account</h3><p>Deletes everything in your Unify account and the account itself, for good.</p>' +
          '<button class="btn danger-text" data-act="account-delete">' + UI.icon('trash') + 'Delete my account and data</button>'
        : '') +
      '</section>';

    return html;
  }

  // ---- Help ------------------------------------------------------------------------

  function help() {
    return UI.head('How Unify works', '') +
      '<div class="help">' +
      '<ol class="flow">' +
      '<li><strong>Problems.</strong> Write down what’s causing a negative emotion — one thing at a time. Add the life area, the emotion and how hard it seems if you like.</li>' +
      '<li><strong>Goals.</strong> Press <em>Make a goal</em>, tap the problems that belong together, and say what you’ll do about them. Add the first steps, one per line, while you’re there.</li>' +
      '<li><strong>Tasks.</strong> Tick steps off as you go. Each one asks what went well and what you’d do differently, and keeps your answers in the journal.</li>' +
      '<li><strong>Finish.</strong> Finishing a goal marks its problems resolved.</li>' +
      '</ol>' +
      '<h2>Session</h2><p>Got a morning or a day to get things done? In Tasks, press <em>Plan a session</em> and tap the tasks, then put them in order in Session by dragging the handle or with the arrows. <em>Get link</em> shares it: anyone you send the link to can tick things off and add to the list, and everyone sees it as it happens. What they add waits in Session for you to keep or discard. Finishing the session stops the link.</p>' +
      '<h2>Journal</h2><p>Write whenever you like, with a mood and feelings if they help. Link an entry to a goal or problem, or select a few words and press <em>Turn into a problem</em>.</p>' +
      '<h2>Probe</h2><p>Describe a situation in your own words, and Probe finds anything like it you’ve written before — and what came of it. It also lists the gaps (problems with no goal, goals with no next step, goals gone quiet) and what keeps coming back.</p>' +
      '<h2>Your data</h2><p>Everything is saved on this device as you go. Signed in, it’s also kept in your Unify account, and your phone and computer are merged record by record, so neither overwrites the other. It works offline and catches up when you’re back. On this device only, it stays in this browser.</p>' +
      '<h2>On your phone</h2><p>Open Unify in the browser and choose <strong>Add to Home Screen</strong> (Safari: the share button; Chrome: the ⋮ menu). It then opens like an app.</p>' +
      '</div>';
  }

  // ---- handlers ----------------------------------------------------------------------

  Handlers.add('form', {
    'connect': function (form) {
      var v = Handlers.values(form);
      var err = form.querySelector('[data-error]');
      var button = form.querySelector('button[type=submit]');
      var parts = v.repo.replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').split('/');
      if (parts.length !== 2 || !parts[0] || !parts[1]) {
        err.textContent = 'Write the repository as owner/name, e.g. AaronUnify2/Unify-data.';
        err.hidden = false;
        return;
      }
      var cfg = { token: v.token, owner: parts[0], repo: parts[1], path: GitHub.DEFAULTS.path };
      err.hidden = true;
      button.disabled = true;
      button.textContent = 'Checking…';
      GitHub.verify(cfg).then(function (branch) {
        cfg.branch = branch;
        GitHub.save(cfg);
        Prefs.set('localOnly', false);
        Prefs.set('account', false);
        Sync.reset();
        App.enter();
        Sync.start();
        UI.toast('Connected to ' + cfg.owner + '/' + cfg.repo);
      }).catch(function (e) {
        err.textContent = e instanceof TypeError ? 'Couldn’t reach GitHub. Check your connection and try again.' : e.message;
        err.hidden = false;
        button.disabled = false;
        button.textContent = 'Connect';
      });
    }
  });

  Handlers.add('act', {
    'local-only': function () {
      Prefs.set('localOnly', true);
      App.enter();
      App.keepStorage();
    },
    'account-sign-in': function (el) {
      var errorEl = document.getElementById('gate-error') || document.getElementById('move-error');
      var fromGitHub = !!GitHub.config();
      el.disabled = true;
      if (errorEl) errorEl.hidden = true;
      Prefs.set('pendingSignIn', true);   // for when Google sends the whole page away and back
      Account.signIn().then(function (user) {
        if (!user) return;   // the page is going to Google to sign in
        return App.finishSignIn(fromGitHub);
      }).catch(function (e) {
        Prefs.set('pendingSignIn', false);
        el.disabled = false;
        var text = Account.errorText(e);
        if (text && errorEl) {
          errorEl.textContent = text;
          errorEl.hidden = false;
        } else if (text) {
          UI.toast(text, 'error');
        }
      });
    },
    'account-delete': function () {
      UI.sheet('Delete your account and data?',
        '<p class="sheet-text">Everything in your Unify account is deleted for good, and the account with it. This can’t be undone.</p>' +
        '<label class="check-row"><input type="checkbox" id="keep-local" checked> Keep a copy on this device, and carry on using Unify here only</label>' +
        '<div class="sheet-actions"><button class="btn" data-act="sheet-close">Cancel</button>' +
        '<button class="btn danger" data-act="account-delete-confirm">Delete everything</button></div>');
    },
    'account-delete-confirm': function (el) {
      var keep = document.getElementById('keep-local').checked;
      el.disabled = true;
      el.textContent = 'Deleting…';
      Account.deleteEverything().then(function () {
        UI.closeSheet();
        if (keep) {
          Prefs.set('account', false);
          Prefs.set('localOnly', true);
          U.removeKey('unify.sync');
          Sync.reset();
          App.render();
          UI.toast('Your account and its data are deleted. This device keeps its copy.');
        } else {
          forget();
        }
      }).catch(function (e) {
        el.disabled = false;
        el.textContent = 'Delete everything';
        UI.toast(Account.errorText(e) || 'It wasn’t deleted.', 'error');
      });
    },
    'sync-now': function () { Sync.now(); },
    'model-load': function () { Semantic.start(); App.render(); },
    'sign-out': function () {
      var github = !!GitHub.config();
      var warning = Sync.dirty ? '<strong>Some changes haven’t uploaded yet</strong> and will be lost. ' : '';
      UI.confirm('Sign out of this device?', warning + 'This removes this device’s copy of your data. ' +
        (github ? 'Everything on GitHub stays as it is.' : 'Everything in your account stays as it is.'), 'Sign out', function () {
        Account.signOut().then(forget, forget);
      }, true);
    },
    'export': function () {
      var blob = new Blob([JSON.stringify(Store.data, null, 2) + '\n'], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'unify-' + U.dayKey(new Date()) + '.json';
      document.body.appendChild(a);
      a.click();
      Prefs.set('lastExport', U.nowIso());
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }
  });

  Handlers.add('change', {
    'pref': function (el) {
      Prefs.set(el.dataset.pref, el.checked);
      if (el.dataset.pref === 'loadModel' && el.checked && Semantic.status === 'idle') Semantic.start();
    },
    'import': function (el) {
      var file = el.files && el.files[0];
      if (!file) return;
      file.text().then(function (text) {
        var incoming = JSON.parse(text);
        if (!incoming || incoming.app !== 'Unify') throw new Error('not a Unify file');
        var merged = Merge.merge(Store.data, incoming);
        Store.replace(merged, {});
        Sync.changed();
        UI.toast('Imported and merged');
      }).catch(function () {
        UI.toast('That file isn’t a Unify copy.', 'error');
      });
      el.value = '';
    }
  });

  /** Forget everything on this device and start again. */
  function forget() {
    GitHub.clear();
    Store.wipe();
    U.removeKey('unify.sync');
    Semantic.clearComputed();
    Prefs.clear();
    location.hash = '';
    location.reload();
  }

  /** Settings: get Google's sign-in ready, so the button opens its window at once. */
  function mount() {
    if (Account.configured()) Account.load().catch(function () { /* signing in will say */ });
  }

  Sync.on(function () {
    var line = document.getElementById('sync-detail');
    if (line) {
      line.className = 'sync-detail ' + Sync.state;
      line.textContent = (STATE_TEXT[Sync.state] || '') + (Sync.detail ? ' ' + Sync.detail : '');
    }
  });

  Semantic.onStatus(function () {
    var line = document.getElementById('model-status');
    if (line) line.textContent = Semantic.statusText;
  });

  global.Views = global.Views || {};
  global.Views.settings = { gate: gate, settings: settings, help: help, mount: mount, STATE_TEXT: STATE_TEXT };
}(window));
