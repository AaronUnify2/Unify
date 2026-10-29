/* ===========================================================================
   merge.js — combining two copies of the data, one field at a time.

   Unify runs on a phone and a computer, and either may be offline. When two
   copies meet (this device's and the one on GitHub), they are combined:

     - a record only one side has is kept
     - a record both have: each field comes from the side that changed it
       more recently (record.fieldsAt, kept by store.js), so a title edited
       on the phone and a note added on the computer both survive
     - a deletion wins over any edit made before it

   So there is never a "which version do you want?" question; the worst case
   is that the same field edited on two devices between syncs keeps only the
   later edit.
   =========================================================================== */

(function (global) {
  'use strict';

  var META = { id: true, createdAt: true, updatedAt: true, fieldsAt: true };

  function later(a, b) {
    return (a || '') >= (b || '') ? a : b;
  }

  /** One record from two copies of it, field by field. */
  function mergeRecord(x, y) {
    var newer = (y.updatedAt || '') > (x.updatedAt || '') ? y : x;
    var older = newer === x ? y : x;
    var out = Model.copy(newer);
    out.fieldsAt = {};
    var keys = {};
    Object.keys(x).concat(Object.keys(y)).forEach(function (k) { if (!META[k]) keys[k] = true; });
    Object.keys(keys).forEach(function (k) {
      var tn = newer.fieldsAt[k] || newer.createdAt || '';
      var to = older.fieldsAt[k] || older.createdAt || '';
      if (to > tn && k in older) {
        out[k] = Model.copy(older[k]);
        out.fieldsAt[k] = older.fieldsAt[k];
      } else if (newer.fieldsAt[k] || older.fieldsAt[k]) {
        out.fieldsAt[k] = later(newer.fieldsAt[k], older.fieldsAt[k]);
      }
    });
    out.createdAt = x.createdAt < y.createdAt ? x.createdAt : y.createdAt;
    out.updatedAt = later(x.updatedAt, y.updatedAt);
    return out;
  }

  function merge(a, b) {
    a = Model.normalise(a);
    b = Model.normalise(b);
    var out = Model.empty();

    var deleted = {};
    [a.deleted, b.deleted].forEach(function (d) {
      Object.keys(d).forEach(function (id) { deleted[id] = later(deleted[id], d[id]); });
    });

    Model.KINDS.forEach(function (kind) {
      var byId = {};
      var order = [];
      a[kind].concat(b[kind]).forEach(function (rec) {
        var cur = byId[rec.id];
        if (!cur) {
          byId[rec.id] = rec;
          order.push(rec.id);
        } else {
          byId[rec.id] = mergeRecord(cur, rec);
        }
      });
      out[kind] = order.filter(function (id) {
        return !(deleted[id] && deleted[id] >= (byId[id].updatedAt || ''));
      }).map(function (id) { return byId[id]; });
    });

    out.deleted = deleted;
    out.updatedAt = later(a.updatedAt, b.updatedAt);
    return Model.cleanLinks(out);
  }

  /** JSON with every object's keys in order, so equal content gives equal text. */
  function canonical(value) {
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (value && typeof value === 'object') {
      return '{' + Object.keys(value).sort().map(function (k) {
        return JSON.stringify(k) + ':' + canonical(value[k]);
      }).join(',') + '}';
    }
    return JSON.stringify(value === undefined ? null : value);
  }

  /** The content of a copy, in a fixed order, for comparing two copies. */
  function contentKey(data) {
    var parts = Model.KINDS.map(function (kind) {
      return (data[kind] || []).slice().sort(function (x, y) {
        return x.id < y.id ? -1 : x.id > y.id ? 1 : 0;
      }).map(canonical);
    });
    var del = data.deleted || {};
    parts.push(Object.keys(del).sort().map(function (id) { return id + '=' + del[id]; }));
    return JSON.stringify(parts);
  }

  function same(a, b) {
    return contentKey(a) === contentKey(b);
  }

  global.Merge = { merge: merge, mergeRecord: mergeRecord, same: same, contentKey: contentKey };
}(window));
