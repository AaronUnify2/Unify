/* ===========================================================================
   handlers.js — where each section registers what its buttons and forms do.

   The page has one listener for each kind of event (app.js), and markup
   names the handler it wants:

     data-act="name"      a click          Handlers.act.name(el, event)
     data-form="name"     a form submitted Handlers.form.name(form, event)
     data-live="name"     typing           Handlers.live.name(el)  (debounced)
     data-change="name"   a select changed Handlers.change.name(el)
     data-bind="kind|id|field"   a field of a record, saved as you type
   =========================================================================== */

(function (global) {
  'use strict';

  var Handlers = { act: {}, form: {}, live: {}, change: {} };

  /** Register several handlers of one type: Handlers.add('act', { name: fn }). */
  Handlers.add = function (type, map) {
    Object.keys(map).forEach(function (name) { Handlers[type][name] = map[name]; });
  };

  /** A form's fields as an object of trimmed strings. */
  Handlers.values = function (form) {
    var out = {};
    Array.prototype.forEach.call(form.elements, function (el) {
      if (el.name) out[el.name] = String(el.value || '').trim();
    });
    return out;
  };

  global.Handlers = Handlers;
}(window));
