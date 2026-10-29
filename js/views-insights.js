/* ===========================================================================
   views-insights.js — the Insights section: how things are going.

   A handful of figures, then four small charts, each one series in the
   accent colour with its numbers written beside it:

     open problems by area · steps done per week (last 8 weeks)
     mood, day by day (last 30 days, from the journal) · goals finished
   =========================================================================== */

(function (global) {
  'use strict';

  var esc = U.esc;
  var DAY = 86400000;

  function within(iso, days) {
    return iso && Date.now() - new Date(iso).getTime() <= days * DAY;
  }

  function tile(value, label, note) {
    return '<div class="tile"><div class="tile-value">' + esc(value) + '</div><div class="tile-label">' + esc(label) + '</div>' +
      (note ? '<div class="tile-note">' + esc(note) + '</div>' : '') + '</div>';
  }

  /** Horizontal bars: rows of { label, value, note }, longest first. */
  function hbars(rows) {
    if (!rows.length) return '';
    var max = Math.max.apply(null, rows.map(function (r) { return r.value; })) || 1;
    return '<ul class="bars">' + rows.map(function (r) {
      return '<li title="' + esc(r.title || (r.text + ': ' + r.value)) + '"><span class="bar-label">' + r.label + '</span>' +
        '<span class="bar-track"><span class="bar-fill" style="width:' + Math.max(2, Math.round(r.value / max * 100)) + '%"></span></span>' +
        '<span class="bar-value">' + r.value + '</span></li>';
    }).join('') + '</ul>';
  }

  /** Steps done in each of the last 8 weeks (Monday to Sunday), oldest first. */
  function weeklySteps() {
    var now = new Date();
    var monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
    var weeks = [];
    for (var i = 7; i >= 0; i--) {
      var start = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - i * 7);
      weeks.push({ start: start, end: new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7), count: 0 });
    }
    Store.list('tasks').forEach(function (t) {
      if (!t.done || !t.doneAt) return;
      var d = new Date(t.doneAt);
      weeks.forEach(function (w) { if (d >= w.start && d < w.end) w.count++; });
    });
    return weeks;
  }

  function columns(weeks) {
    if (!weeks.some(function (w) { return w.count; })) return UI.empty('No steps ticked off in the last 8 weeks yet.');
    var max = Math.max.apply(null, weeks.map(function (w) { return w.count; })) || 1;
    return '<div class="columns" role="img" aria-label="Steps done per week">' + weeks.map(function (w, i) {
      var label = U.fmtDate(w.start).replace(/ \d{4}$/, '');
      return '<div class="col" title="Week of ' + esc(label) + ': ' + U.plural(w.count, 'step') + '">' +
        '<span class="col-value">' + (w.count || '') + '</span>' +
        '<span class="col-bar" style="height:' + (w.count ? Math.max(4, Math.round(w.count / max * 100)) : 0) + '%"></span>' +
        '<span class="col-label">' + (i === weeks.length - 1 ? 'This week' : esc(label)) + '</span></div>';
    }).join('') + '</div>';
  }

  /** Average mood for each of the last 30 days that has one. */
  function dailyMood() {
    var byDay = {};
    Store.list('journal').forEach(function (e) {
      if (!e.mood || !within(e.createdAt, 30)) return;
      var k = U.dayKey(e.createdAt);
      if (!byDay[k]) byDay[k] = { sum: 0, n: 0 };
      byDay[k].sum += e.mood;
      byDay[k].n++;
    });
    var out = [];
    for (var i = 29; i >= 0; i--) {
      var d = new Date(Date.now() - i * DAY);
      var k = U.dayKey(d);
      out.push({ day: d, avg: byDay[k] ? byDay[k].sum / byDay[k].n : null });
    }
    return out;
  }

  function moodChart(days) {
    var points = days.map(function (d, i) { return { i: i, d: d }; }).filter(function (p) { return p.d.avg !== null; });
    if (points.length < 2) return UI.empty('The trend shows once two days have a journal entry with a mood.');
    var W = 300, H = 120, L = 22, R = 6, T = 8, B = 18;
    var x = function (i) { return L + i / 29 * (W - L - R); };
    var y = function (v) { return T + (5 - v) / 4 * (H - T - B); };
    var grid = [1, 3, 5].map(function (v) {
      return '<line class="grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '"/>' +
        '<text class="axis" x="' + (L - 6) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + Model.moodOf(v).face + '</text>';
    }).join('');
    var path = points.map(function (p, n) { return (n ? 'L' : 'M') + x(p.i).toFixed(1) + ' ' + y(p.d.avg).toFixed(1); }).join(' ');
    var dots = points.map(function (p) {
      var label = U.fmtDay(p.d.day.toISOString()) + ': ' + p.d.avg.toFixed(1) + ' (' + Model.moodOf(Math.round(p.d.avg)).label.toLowerCase() + ')';
      return '<g class="pt"><circle class="hit" cx="' + x(p.i) + '" cy="' + y(p.d.avg) + '" r="10"><title>' + esc(label) + '</title></circle>' +
        '<circle class="dot" cx="' + x(p.i) + '" cy="' + y(p.d.avg) + '" r="4"/></g>';
    }).join('');
    return '<svg class="line-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Mood over the last 30 days">' + grid +
      '<text class="axis" x="' + L + '" y="' + (H - 4) + '">30 days ago</text>' +
      '<text class="axis" x="' + (W - R) + '" y="' + (H - 4) + '" text-anchor="end">Today</text>' +
      '<path class="line" d="' + path + '"/>' + dots + '</svg>';
  }

  function list() {
    var problems = Store.list('problems');
    var goals = Store.list('goals');
    var tasks = Store.list('tasks');
    var journal = Store.list('journal');
    var open = problems.filter(function (p) { return p.status === 'open'; });
    var active = goals.filter(function (g) { return g.status === 'active'; });
    var resolved30 = problems.filter(function (p) { return p.status === 'resolved' && within(p.resolvedAt, 30); }).length;
    var steps7 = tasks.filter(function (t) { return t.done && within(t.doneAt, 7); }).length;
    var entries30 = journal.filter(function (e) { return within(e.createdAt, 30); });
    var moods = entries30.filter(function (e) { return e.mood; });
    var avgMood = moods.length ? moods.reduce(function (s, e) { return s + e.mood; }, 0) / moods.length : 0;

    var html = UI.head('Insights', '');
    html += '<div class="tiles">' +
      tile(open.length, 'Open problems', U.plural(open.filter(function (p) { return !Store.hasActiveGoal(p.id); }).length, 'without a goal', 'without a goal')) +
      tile(resolved30, 'Resolved', 'in the last 30 days') +
      tile(active.length, 'Active goals', U.plural(goals.filter(function (g) { return g.status === 'done'; }).length, 'finished', 'finished') + ' all time') +
      tile(steps7, 'Steps done', 'in the last 7 days') +
      tile(entries30.length, 'Journal entries', 'in the last 30 days') +
      tile(avgMood ? avgMood.toFixed(1) + ' ' + Model.moodOf(Math.round(avgMood)).face : '—', 'Average mood', moods.length ? 'from ' + U.plural(moods.length, 'entry', 'entries') : 'no moods yet') +
      '</div>';

    var byArea = {};
    open.forEach(function (p) { var a = p.area || 'No area'; byArea[a] = (byArea[a] || 0) + 1; });
    var areaRows = Object.keys(byArea).map(function (a) {
      return { label: a === 'No area' ? '<span class="muted">No area</span>' : UI.areaTag(a), text: a, value: byArea[a] };
    }).sort(function (a, b) { return b.value - a.value; });

    html += '<div class="chart-grid">';
    html += '<section class="chart-card"><h2>Open problems by area</h2>' + (areaRows.length ? hbars(areaRows) : UI.empty('No open problems.')) + '</section>';
    html += '<section class="chart-card"><h2>Steps done per week</h2>' + columns(weeklySteps()) + '</section>';
    html += '<section class="chart-card"><h2>Mood, last 30 days</h2><p class="muted small">Daily average, from journal entries with a mood.</p>' + moodChart(dailyMood()) + '</section>';

    var finished = goals.filter(function (g) { return g.status === 'done'; })
      .sort(function (a, b) { return (a.doneAt || '') < (b.doneAt || '') ? 1 : -1; }).slice(0, 6);
    html += '<section class="chart-card"><h2>Goals finished lately</h2>' +
      (finished.length ? '<div class="rec-list">' + finished.map(function (g) {
        return UI.recordLink('goals', g, '<span class="rec-meta">' + esc(U.fmtDate(g.doneAt)) + '</span>');
      }).join('') + '</div>' : UI.empty('None yet — the first one will be here.')) + '</section>';
    html += '</div>';
    return html;
  }

  global.Views = global.Views || {};
  global.Views.insights = { list: list };
}(window));
