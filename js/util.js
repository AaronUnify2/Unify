/* ===========================================================================
   util.js — small helpers used everywhere: escaping, ids, dates, timing.
   =========================================================================== */

(function (global) {
  'use strict';

  /** Escape text before putting it into HTML (text or attribute values). */
  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** A new id: a prefix, the time, and a little randomness. */
  function uid(prefix) {
    return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function pad(n) {
    return (n < 10 ? '0' : '') + n;
  }

  /** A date as YYYY-MM-DD in local time. */
  function dayKey(date) {
    var d = date instanceof Date ? date : new Date(date);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  /** 29 Oct 2026 */
  function fmtDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  }

  /** 9:05 am */
  function fmtTime(iso) {
    var d = new Date(iso);
    var h = d.getHours();
    return (h % 12 || 12) + ':' + pad(d.getMinutes()) + (h < 12 ? ' am' : ' pm');
  }

  /** Today, Yesterday, or Thu 23 Oct (with the year if it isn't this year). */
  function fmtDay(iso) {
    var d = new Date(iso);
    var today = dayKey(new Date());
    var yesterday = dayKey(new Date(Date.now() - 86400000));
    var key = dayKey(d);
    if (key === today) return 'Today';
    if (key === yesterday) return 'Yesterday';
    var s = DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()];
    if (d.getFullYear() !== new Date().getFullYear()) s += ' ' + d.getFullYear();
    return s;
  }

  /** Whole days since a date (0 for today). */
  function daysSince(iso) {
    if (!iso) return 0;
    var start = new Date(dayKey(iso) + 'T00:00:00');
    var today = new Date(dayKey(new Date()) + 'T00:00:00');
    return Math.round((today - start) / 86400000);
  }

  /** "just now", "5 min ago", "3 h ago", "yesterday", "4 days ago", or a date. */
  function ago(iso) {
    if (!iso) return '';
    var secs = (Date.now() - new Date(iso).getTime()) / 1000;
    if (secs < 60) return 'just now';
    if (secs < 3600) return Math.floor(secs / 60) + ' min ago';
    var days = daysSince(iso);
    if (days === 0) return Math.floor(secs / 3600) + ' h ago';
    if (days === 1) return 'yesterday';
    if (days < 14) return days + ' days ago';
    if (days < 60) return Math.floor(days / 7) + ' weeks ago';
    return fmtDate(iso);
  }

  function plural(n, word, many) {
    return n + ' ' + (n === 1 ? word : (many || word + 's'));
  }

  /** The first line of a text, cut to max characters. */
  function firstLine(text, max) {
    var line = String(text || '').trim().split('\n')[0];
    max = max || 80;
    return line.length > max ? line.slice(0, max - 1).trim() + '…' : line;
  }

  /** A text cut to max characters, on a word boundary where possible. */
  function clip(text, max) {
    var s = String(text || '').replace(/\s+/g, ' ').trim();
    if (s.length <= max) return s;
    var cut = s.slice(0, max);
    var space = cut.lastIndexOf(' ');
    return (space > max * 0.6 ? cut.slice(0, space) : cut) + '…';
  }

  function debounce(fn, ms) {
    var timer = null;
    return function () {
      var self = this, args = arguments;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  }

  /** Read and write JSON in localStorage without ever throwing. */
  function readJson(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.warn('Could not save ' + key, e);
      return false;
    }
  }

  function removeKey(key) {
    try { localStorage.removeItem(key); } catch (e) { /* nothing to do */ }
  }

  global.U = {
    esc: esc,
    uid: uid,
    nowIso: nowIso,
    dayKey: dayKey,
    fmtDate: fmtDate,
    fmtTime: fmtTime,
    fmtDay: fmtDay,
    daysSince: daysSince,
    ago: ago,
    plural: plural,
    firstLine: firstLine,
    clip: clip,
    debounce: debounce,
    readJson: readJson,
    writeJson: writeJson,
    removeKey: removeKey
  };
}(window));
