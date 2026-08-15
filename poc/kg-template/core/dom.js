/**
 * dom.js —— 极小的 DOM 工具。只放三个视图都要用的那几个，不做框架。
 */
(function (global) {
  'use strict';

  var KG = global.KG = global.KG || {};

  KG.dom = {
    $: function (sel, root) { return (root || document).querySelector(sel); },
    $$: function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); },

    el: function (tag, cls, html) {
      var e = document.createElement(tag);
      if (cls) e.className = cls;
      if (html != null) e.innerHTML = html;
      return e;
    },

    on: function (target, evt, sel, fn) {
      if (typeof sel === 'function') { target.addEventListener(evt, sel); return; }
      target.addEventListener(evt, function (e) {
        var hit = e.target.closest(sel);
        if (hit && target.contains(hit)) fn(e, hit);
      });
    },

    /* 伪 3D 小球的三色阶。三份原稿各写了一份一模一样的，收进来只留一份。 */
    rgbOf: function (h) { var v = parseInt(h.slice(1), 16); return [v >> 16 & 255, v >> 8 & 255, v & 255]; },
    mix: function (c, t, k) { return c.map(function (v, i) { return Math.round(v + (t[i] - v) * k); }); },
    css: function (c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (a == null ? 1 : a) + ')'; }
  };

})(typeof window !== 'undefined' ? window : this);
