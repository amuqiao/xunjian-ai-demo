/**
 * views.js —— 视图注册表与生命周期编排
 * ═══════════════════════════════════════════════════════════════════
 * 【这是三个视图的实现契约，B 组三个视图必须严格实现下列方法】
 *
 *   KG.views.define('stage', {
 *     el:  '#view-stage',              // 视图根元素，index.html 里已存在
 *
 *     mount(root)                      // 只调用一次：建 DOM / 初始化 three.js 场景 / 建力导向
 *                                      // 数据只能从 KG.derive.* 拿，禁止读 KG.source
 *
 *     activate({ focusId })            // 进入本视图。focusId 可能为 null
 *     deactivate()                     // 离开本视图（不销毁，下次 activate 还要用）
 *
 *     focus(id)                        // 本视图已激活时切换焦点（图谱=聚焦节点，
 *                                      // 树=展开路径并高亮，展台=转盘转到该立牌）
 *
 *     locate(id)                       // → { x, y, w, h, color, label } CSS 像素矩形，
 *                                      // 供转场做幻影飞行；节点当前不可见时返回 null
 *
 *     reset()                          // 回到本视图的全景态：清焦点、清高亮、视野复位
 *                                      // （图谱=fitView，树=fit + 全部展开，展台=相机与转盘复位）
 *
 *     pause()                          // 挂起 requestAnimationFrame / 力导向 step
 *     resume()                         // 恢复
 *   });
 *
 * 【硬性要求】
 *   1. 整个实现包在 IIFE 里，除了这一次 define 调用，不许往 window 上写任何东西。
 *      三份原稿都在全局定义了 rgbOf / mix / css / view / fit / hovered，同处一页会互相覆盖。
 *   2. pause() 之后视图必须真的不再画帧。三套渲染循环同时跑会明显掉帧。
 *   3. 视图内点击节点，发 KG.bus.emit('node:open', { id, view, from })，
 *      **不要自己决定跳到哪个视图**——动线策略在 app.js 里，视图不该知道别的视图存在。
 *   4. 降级提示（note）由 shell 统一弹，视图不用管。
 * ═══════════════════════════════════════════════════════════════════
 */
(function (global) {
  'use strict';

  var KG = global.KG = global.KG || {};
  var registry = {};
  var mounted = {};
  var current = null;

  var REQUIRED = ['mount', 'activate', 'deactivate', 'focus', 'locate', 'reset', 'pause', 'resume'];

  KG.views = {
    define: function (name, impl) {
      REQUIRED.forEach(function (m) {
        if (typeof impl[m] !== 'function') {
          throw new Error('[views] 视图「' + name + '」没有实现 ' + m + '()，见 core/views.js 顶部的契约');
        }
      });
      if (!impl.el) throw new Error('[views] 视图「' + name + '」没有声明根元素 el');
      registry[name] = impl;
    },

    get: function (name) { return registry[name] || null; },
    current: function () { return current; },
    impl: function () { return current ? registry[current] : null; },

    has: function (name) { return !!registry[name]; },

    /* 切换视图。同视图内只换焦点，不走 mount/activate 全流程。 */
    activate: function (name, focusId, note) {
      var impl = registry[name];
      if (!impl) throw new Error('[views] 未注册的视图：' + name);

      if (current === name) {
        if (focusId) impl.focus(focusId);
        KG.ctx.view = name;
        KG.ctx.focusId = focusId;
        KG.bus.emit('focus:changed', { view: name, focusId: focusId });
        if (note) KG.bus.emit('view:changed', { view: name, focusId: focusId, note: note });
        return;
      }

      KG.bus.emit('view:willchange', { from: current, to: name, focusId: focusId });

      if (current) {
        registry[current].deactivate();
        registry[current].pause();
        document.querySelector(registry[current].el).classList.remove('is-active');
      }

      if (!mounted[name]) {
        impl.mount(document.querySelector(impl.el));
        mounted[name] = true;
      }

      document.querySelector(impl.el).classList.add('is-active');
      impl.resume();
      impl.activate({ focusId: focusId });

      current = name;
      KG.ctx.push(name, focusId);
      KG.bus.emit('view:changed', { view: name, focusId: focusId, note: note || null });
    },

    /* 转场需要知道"这个节点现在在屏幕的哪里"。视图没激活或节点不可见时返回 null。 */
    locate: function (name, id) {
      var impl = registry[name];
      if (!impl || !mounted[name]) return null;
      return impl.locate(id);
    }
  };

})(typeof window !== 'undefined' ? window : this);
