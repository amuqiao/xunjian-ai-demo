/**
 * bus.js —— 事件总线 + 跨视图上下文
 *
 * 三个视图彼此不认识，只认这条总线：视图发事件，app.js 决定动线。
 * 视图之间**禁止直接互相调用**，否则模板换数据时的耦合会从数据层漏到视图层。
 *
 * 约定事件：
 *   node:open   { id, view, from }   视图内某个节点被"打开"，from 是屏幕矩形（转场起点）
 *   view:willchange { from, to, focusId }
 *   view:changed    { view, focusId, note }   note 是跨视图降级的解释，由 shell 弹提示
 *   focus:changed   { view, focusId }         同一视图内焦点变化，顶栏面包屑跟着更新
 *   search:open / intro:open / view:reset / ctx:back
 */
(function (global) {
  'use strict';

  var KG = global.KG = global.KG || {};
  var handlers = {};

  KG.bus = {
    on: function (evt, fn) {
      (handlers[evt] || (handlers[evt] = [])).push(fn);
      return function () { KG.bus.off(evt, fn); };
    },
    off: function (evt, fn) {
      var list = handlers[evt];
      if (!list) return;
      var i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    },
    emit: function (evt, payload) {
      (handlers[evt] || []).slice().forEach(function (fn) { fn(payload); });
    }
  };

  /* 当前上下文：我在哪个视图、聚焦在哪个节点。
     history 支撑 rail 的「上下文回溯」按钮——跨视图有效，不是浏览器的后退。 */
  KG.ctx = {
    view: null,
    focusId: null,
    history: [],
    push: function (view, focusId) {
      if (this.view) this.history.push({ view: this.view, focusId: this.focusId });
      if (this.history.length > 50) this.history.shift();
      this.view = view;
      this.focusId = focusId;
    },
    back: function () {
      return this.history.pop() || null;
    }
  };

})(typeof window !== 'undefined' ? window : this);
