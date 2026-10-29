/* ===========================================================================
   views-settings.js — signing in, Settings, and Help.
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

  /** The sign-in screen, shown when this device has no token. */
  function gate() {
    return '<div class="gate-card">' +
      '<div class="brand big">UNIFY</div>' +
      '<p class="lede">Problems into goals, goals into steps — and a journal of how it goes.</p>' +
      '<p>Your data lives in a <strong>private GitHub repository</strong> that only you can read. ' +
      'This page is just the app; nothing you write is stored with it. Connect with a token to keep your phone and computer in step.</p>' +
      connectForm('Connect') + TOKEN_STEPS +
      '<p class="gate-alt"><button class="link-btn" data-act="local-only">Use it on this device only for now</button></p>' +
      '</div>';
  }

  // ---- Settings ------------------------------------------------------------------

  var STATE_TEXT = {
    off: 'Not syncing — on this device only.',
    loading: 'Checking GitHub…',
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

    html += '<section class="settings-section"><h2>Sync</h2>';
    if (cfg) {
      html += '<p>Saving to <strong>' + esc(cfg.owner + '/' + cfg.repo) + '</strong>, file <code>' + esc(cfg.path) + '</code>.</p>' +
        '<p id="sync-detail" class="sync-detail ' + Sync.state + '">' + esc(STATE_TEXT[Sync.state] || '') +
        (Sync.detail ? ' ' + esc(Sync.detail) : '') + '</p>' +
        (Sync.lastSyncedAt ? '<p class="muted small">Last synced ' + esc(U.ago(Sync.lastSyncedAt)) + '.</p>' : '') +
        '<div class="record-actions"><button class="btn" data-act="sync-now">Sync now</button>' +
        '<button class="btn danger-text" data-act="sign-out">Sign out of this device</button></div>';
    } else {
      html += '<p>Unify is keeping your data on this device only. Connect your private repository to keep it safe and use it on your phone and computer; what’s here is merged in.</p>' +
        connectForm('Connect') + TOKEN_STEPS;
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

    html += '<section class="settings-section"><h2>Your data</h2>' +
      '<p>' + U.plural(d.problems.length, 'problem') + ', ' + U.plural(d.goals.length, 'goal') + ', ' +
      U.plural(d.tasks.length, 'task') + ', ' + U.plural(d.journal.length, 'journal entry', 'journal entries') + '.</p>' +
      '<div class="record-actions">' +
      '<button class="btn" data-act="export">Download a copy (JSON)</button>' +
      '<label class="btn file-btn">Import a copy…<input type="file" accept="application/json,.json" data-change="import"></label>' +
      '</div>' +
      '<p class="muted small">Importing merges a copy into what’s here; nothing is removed.</p>' +
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
      '<h2>Journal</h2><p>Write whenever you like, with a mood and feelings if they help. Link an entry to a goal or problem, or select a few words and press <em>Turn into a problem</em>.</p>' +
      '<h2>Probe</h2><p>Describe a situation in your own words, and Probe finds anything like it you’ve written before — and what came of it. It also lists the gaps (problems with no goal, goals with no next step, goals gone quiet) and what keeps coming back.</p>' +
      '<h2>Your data</h2><p>Everything is saved on this device as you go, and synced to your private GitHub repository. Phone and computer are merged record by record, so neither overwrites the other. It works offline and catches up when you’re back.</p>' +
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
    },
    'sync-now': function () { Sync.now(); },
    'model-load': function () { Semantic.start(); App.render(); },
    'sign-out': function () {
      var warning = Sync.dirty ? '<strong>Some changes haven’t uploaded yet</strong> and will be lost. ' : '';
      UI.confirm('Sign out of this device?', warning + 'This removes the token and this device’s copy of your data. Everything on GitHub stays as it is.', 'Sign out', function () {
        GitHub.clear();
        Store.wipe();
        U.removeKey('unify.sync');
        Semantic.clearComputed();
        Prefs.clear();
        location.hash = '';
        location.reload();
      }, true);
    },
    'export': function () {
      var blob = new Blob([JSON.stringify(Store.data, null, 2) + '\n'], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'unify-' + U.dayKey(new Date()) + '.json';
      document.body.appendChild(a);
      a.click();
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
  global.Views.settings = { gate: gate, settings: settings, help: help, STATE_TEXT: STATE_TEXT };
}(window));
