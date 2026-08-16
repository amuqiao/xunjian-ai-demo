/**
 * app.js —— 启动与动线策略
 * ═══════════════════════════════════════════════════════════════════
 * 三个视图彼此不认识：它们只会说"我这儿有个节点被打开了"（node:open），
 * 至于该去哪个视图、落到哪个节点、要不要给用户一句解释——全在这里决定。
 *
 * 把动线集中在一处的理由：接入新业务数据、或者以后加第四个视图时，
 * 要改的是这一个文件，而不是去三个视图里翻跳转代码。
 * ═══════════════════════════════════════════════════════════════════
 */
(function (global) {
  'use strict';

  var KG = global.KG;

  /* ── 动线策略 ─────────────────────────────────────────────
     展台点类目立牌 → 主题树：在展台上点一个知识库，最想看的是"里面有什么"
     展台点中心核心 → 关系图谱：中心代表"整体"，对应的正是全局关联视图
     图谱里打开    → 主题树：图谱回答"怎么连"，下一步自然是"具体是什么"
     树里打开      → 关系图谱：树回答"是什么"，下一步自然是"它还跟谁有关" */
  var ROUTE = {
    stage: function (node) { return node.type === 'hub' ? 'graph' : 'tree'; },
    graph: function () { return 'tree'; },
    tree:  function () { return 'graph'; }
  };

  /* 跨视图跳转的载荷（降级解释、要高亮的相关节点、转场起点矩形）不进 hash：
     它们是这一次跳转的瞬时状态，刷新后本就不该复现。 */
  var pending = null;

  function openNode(p) {
    var node = KG.derive.get(p.id);
    if (!node) throw new Error('[app] node:open 收到未知 id：' + p.id);

    var target = ROUTE[p.view](node);
    var r = KG.derive.resolveView(p.id, target);

    pending = { note: r.note, highlight: r.highlight || null };

    if (KG.transition && p.from) {
      KG.transition.play(p.from, target, r.focusId, function () {
        KG.router.go(target, r.focusId);
      });
    } else {
      KG.router.go(target, r.focusId);
    }
  }

  /* 焦点归一化的唯一入口。
     进到这里的路径有四条：node:open 跳转、顶栏切视图、面包屑、手输 hash（含刷新与前进后退）。
     后三条都不知道"这个节点在目标视图里有没有对应物"——
     比如在树里选中一份四层深的文档，再点顶栏「关系图谱」，图谱里根本没有这个节点。
     所以统一在这里过一遍 resolveView，视图的 focus() 才能保持
     「收到不认识的 id 就 throw」这个 fail-fast 语义，而不必各自做兼容。
     对已经归一化过的 id 再归一一次是幂等的，所以放在这里不会和 openNode 打架。 */
  function onRoute(route) {
    var payload = pending;
    pending = null;

    var focusId = route.focus;
    var note = payload ? payload.note : null;
    if (focusId) {
      var r = KG.derive.resolveView(focusId, route.view);
      focusId = r.focusId;
      if (!note) note = r.note;
    }

    KG.views.activate(route.view, focusId, note);

    if (payload && payload.highlight && payload.highlight.length) {
      var impl = KG.views.impl();
      if (impl.highlight) impl.highlight(payload.highlight);
    }
  }

  /* rail 的「重置视野」：交给当前视图自己复位，app 不关心各视图怎么算全景 */
  KG.bus.on('view:reset', function () {
    var impl = KG.views.impl();
    impl.reset();
    KG.ctx.focusId = null;
    KG.router.go(KG.views.current(), null, true);
    KG.bus.emit('focus:changed', { view: KG.views.current(), focusId: null });
  });

  KG.bus.on('node:open', openNode);

  function setExternalVisibility(active) {
    var impl = KG.views.impl && KG.views.impl();
    if (!impl) return;
    if (active) impl.resume();
    else impl.pause();
  }

  global.addEventListener('message', function (event) {
    var data = event.data;
    if (!data || data.type !== 'inspection-demo:visibility') return;
    setExternalVisibility(!!data.active);
  });

  function boot() {
    document.title = KG.derive.meta.title + ' · ' + KG.derive.ui.pageTitleSuffix;

    var report = KG.derive.validate();
    if (!report.ok) {
      report.errors.forEach(function (e) { console.error('[数据体检]', e); });
      throw new Error('[app] 数据源未通过体检，共 ' + report.errors.length + ' 处错误，见上方日志');
    }
    if (/\bdebug\b/.test(location.search)) {
      console.log('[数据体检] 通过。规模：', KG.derive.stats());
      report.warnings.forEach(function (w) { console.warn('[数据体检]', w); });
    }

    KG.shell.init();
    KG.router.start(onRoute);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

})(typeof window !== 'undefined' ? window : this);
