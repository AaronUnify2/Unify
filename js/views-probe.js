/* ===========================================================================
   views-probe.js — the Probe section.

   Describe a situation in your own words, and Probe finds anything like it
   you've written before. Underneath: the gaps (problems with no goal, goals
   with no next step, goals gone quiet), the patterns (what keeps coming
   back), and open problems that seem to be about the same thing.
   =========================================================================== */

(function (global) {
  'use strict';

  var esc = U.esc;

  var view = { query: '', result: null, running: false };

  function modelLine() {
    var s = Semantic.status;
    var cls = s === 'ready' ? 'ok' : s === 'failed' ? 'warn' : '';
    var text = s === 'ready' ? 'Matching by meaning — the language model runs on this device; nothing you write leaves it.'
      : s === 'loading' ? Semantic.statusText
      : s === 'failed' ? Semantic.statusText
      : 'Matching by words. The language model loads when you probe.';
    return '<p id="model-line" class="model-line ' + cls + '">' + esc(text) + '</p>';
  }

  function resultsHtml() {
    var r = view.result;
    if (view.running) return '<p class="muted">Looking…</p>';
    if (!r) return '';
    var strong = r.results.filter(function (x) { return x.score >= r.strong; });
    var weak = r.results.filter(function (x) { return x.score < r.strong; });
    var html = '';
    if (!r.results.length) {
      html += '<div class="probe-none"><p><strong>You haven’t written about anything like this yet.</strong></p></div>';
    }
    if (strong.length) {
      html += '<h3>Much the same</h3><div class="rec-list">' + strong.map(Views.problems.resultLink).join('') + '</div>';
    }
    if (weak.length) {
      html += '<h3>Might be related</h3><div class="rec-list">' + weak.slice(0, 8).map(Views.problems.resultLink).join('') + '</div>';
    }
    html += '<div class="probe-next">' +
      '<button class="btn" data-act="probe-add-problem">' + UI.icon('problems') + 'Add it as a problem</button>' +
      '<button class="btn" data-act="probe-add-entry">' + UI.icon('journal') + 'Write about it</button>' +
      '</div>';
    if (r.mode === 'words') html += '<p class="muted small">Matched by words only.</p>';
    return html;
  }

  function gapsHtml() {
    var g = Probe.gaps();
    var html = '<section class="probe-section"><h2>Gaps</h2>';
    if (!g.noGoal.length && !g.noNextStep.length && !g.quiet.length) {
      return html + UI.empty('No gaps: every open problem has a goal, and every goal has a next step.') + '</section>';
    }
    if (g.noGoal.length) {
      html += '<h3>Problems without a goal <span class="count">' + g.noGoal.length + '</span></h3><div class="rec-list">' +
        g.noGoal.slice(0, 8).map(function (p) {
          return '<div class="rec-row">' + UI.recordLink('problems', p, '<span class="rec-meta">' + esc(U.ago(p.createdAt)) + '</span>') +
            '<button class="btn small" data-act="goal-new" data-problems="' + esc(p.id) + '">Make a goal</button></div>';
        }).join('') + '</div>';
      if (g.noGoal.length > 8) html += '<p class="muted small"><a href="#/problems">All open problems</a></p>';
    }
    if (g.noNextStep.length) {
      html += '<h3>Goals with no next step <span class="count">' + g.noNextStep.length + '</span></h3><div class="rec-list">' +
        g.noNextStep.map(function (x) { return UI.recordLink('goals', x); }).join('') + '</div>';
    }
    if (g.quiet.length) {
      html += '<h3>Goals gone quiet <span class="count">' + g.quiet.length + '</span></h3>' +
        '<p class="muted small">Nothing done for ' + Probe.QUIET_DAYS + ' days or more. Still the right goal?</p><div class="rec-list">' +
        g.quiet.map(function (x) { return UI.recordLink('goals', x.goal, '<span class="rec-meta">' + esc(U.ago(x.last)) + '</span>'); }).join('') + '</div>';
    }
    return html + '</section>';
  }

  function patternsHtml() {
    var p = Probe.patterns();
    var html = '<section class="probe-section"><h2>What keeps coming back</h2>';
    if (!p.combos.length && !p.feelings.length) {
      return html + UI.empty('Patterns show here once a few problems have an area and an emotion.') + '</section>';
    }
    if (p.combos.length) {
      var max = p.combos[0].total;
      html += '<h3>Area and emotion together</h3><ul class="bars">' + p.combos.map(function (c) {
        return '<li><span class="bar-label">' + UI.areaTag(c.area) + ' ' + esc(c.emotion) + '</span>' +
          '<span class="bar-track"><span class="bar-fill" style="width:' + Math.round(c.total / max * 100) + '%"></span></span>' +
          '<span class="bar-value">' + c.total + '</span>' +
          '<span class="bar-note">' + c.open + ' open · ' + c.reachedGoal + ' reached a goal</span></li>';
      }).join('') + '</ul>';
    }
    if (p.feelings.length) {
      var fmax = p.feelings[0].count;
      html += '<h3>Feelings in the last 90 days</h3><p class="muted small">From problems and journal entries.</p><ul class="bars">' + p.feelings.map(function (f) {
        return '<li><span class="bar-label">' + esc(f.emotion) + '</span>' +
          '<span class="bar-track"><span class="bar-fill" style="width:' + Math.round(f.count / fmax * 100) + '%"></span></span>' +
          '<span class="bar-value">' + f.count + '</span></li>';
      }).join('') + '</ul>';
    }
    return html + '</section>';
  }

  function list() {
    var history = Probe.history();
    var html = UI.head('Probe', '');
    html += '<p class="lede">Describe a situation the way you’d say it. Probe looks for anything like it you’ve written before — problems, goals, tasks, journal entries and reflections — and what came of it.</p>';
    html += '<form class="card probe-form" data-form="probe">' +
      '<label class="sr-only" for="probe-q">Describe a situation</label>' +
      '<textarea id="probe-q" name="q" rows="2" placeholder="e.g. I snapped at the kids again after work" required data-autogrow>' + esc(view.query) + '</textarea>' +
      '<div class="form-actions"><button class="btn primary" type="submit">' + UI.icon('probe') + 'Probe</button></div>' +
      '</form>' + modelLine();
    html += '<div id="probe-results" class="probe-results">' + resultsHtml() + '</div>';
    if (history.length) {
      html += '<div class="probe-history"><span class="muted small">Recent on this device:</span> ' +
        history.map(function (q, i) { return '<button class="chip" data-act="probe-again" data-index="' + i + '">' + esc(U.clip(q, 40)) + '</button>'; }).join('') +
        '<button class="link-btn small" data-act="probe-forget">Clear</button></div>';
    }
    html += gapsHtml();
    html += '<section class="probe-section"><h2>Problems that seem related</h2><div id="probe-related">' +
      (Semantic.status === 'ready' ? '<p class="muted">Looking…</p>' : UI.empty('Shows once the language model has loaded.')) + '</div></section>';
    html += patternsHtml();
    return html;
  }

  function mount() {
    if (Semantic.status === 'idle') Semantic.start();
    var box = document.getElementById('probe-related');
    if (!box || Semantic.status !== 'ready') return;
    Probe.related().then(function (groups) {
      if (!document.body.contains(box) || !groups) return;
      box.innerHTML = groups.length
        ? groups.map(function (g) {
          return '<div class="related-group"><div class="rec-list">' + g.map(function (p) { return UI.recordLink('problems', p); }).join('') + '</div>' +
            '<button class="btn small" data-act="goal-new" data-problems="' + esc(g.map(function (p) { return p.id; }).join(',')) + '">Combine into a goal</button></div>';
        }).join('')
        : UI.empty('None of your open problems look like the same thing.');
    });
  }

  function run(text) {
    view.query = text;
    view.running = true;
    view.result = null;
    Probe.remember(text);
    App.render();
    Probe.search(text, { wait: true }).then(function (out) {
      view.running = false;
      view.result = out;
      if (App.route().name === 'probe') App.render();
    });
  }

  Handlers.add('form', {
    'probe': function (form) {
      var v = Handlers.values(form);
      if (v.q) run(v.q);
    }
  });

  Handlers.add('act', {
    'probe-again': function (el) {
      var q = Probe.history()[parseInt(el.dataset.index, 10)];
      if (q) run(q);
    },
    'probe-forget': function () { Probe.forget(); App.render(); },
    'probe-add-problem': function () {
      Views.problems.openAdd(view.query, function (p) { App.go(UI.href('problems', p.id)); });
    },
    'probe-add-entry': function () {
      UI.sheet('Write about it', '<form data-form="add-entry"><label class="field"><span>Entry</span>' +
        '<textarea name="text" rows="5" autofocus required data-autogrow>' + esc(view.query) + '</textarea></label>' +
        '<div class="field"><span>Mood</span>' + UI.moodPicker(0) + '</div>' +
        '<div class="sheet-actions"><button type="button" class="btn" data-act="sheet-close">Cancel</button>' +
        '<button type="submit" class="btn primary">Save entry</button></div></form>');
    }
  });

  // Keep the model's status line current without redrawing the page
  Semantic.onStatus(function () {
    var line = document.getElementById('model-line');
    if (line) line.outerHTML = modelLine();
    if (Semantic.status === 'ready' && App.route().name === 'probe' && !view.running) App.requestRender();
  });

  global.Views = global.Views || {};
  global.Views.probe = { list: list, mount: mount };
}(window));
