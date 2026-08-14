/*
 * stage/stage.js —— 展台页路由注册（子任务 2-B 独占文件）
 *
 * 职责：
 *   1. mount 时一次性拼装 L0~L7（调用 1-C 的 KG.layersGround / 1-D 的 KG.layersObjects），
 *      用标志位保证只构建一次，update() 不重建。
 *   2. 给展台上所有 [data-node-id] 元素绑定 click / 键盘 / hover 交互：
 *        - T01~T10（立牌）  -> #/graph?view=task&focus=<id>
 *        - B1~B3（悬浮牌）  -> #/graph?view=business&focus=<id>
 *        - D1~D7（领域球）  -> #/graph?view=domain&focus=<id>
 *        - hub-task（中心装置）-> #/graph?view=task&focus=hub-task
 *      点击一律走「KG.transition.run() 优先接管，返回 false（未接管）则调用方
 *      自行 router.go」的公开契约，不是并行开发期的存在性兜底。
 *   3. L7 顶台三枚徽章（标准体系/作业管控/故障复盘）当前没有对应数据节点，做成
 *      「hover 有反馈（展台信息条文案变化）+ 键盘/鼠标点击按 dataset.stageAction
 *      分别跳到不同图谱视角」，见 bindBadges()。
 *   4. 展台信息条（.stage-hint）：hover 节点时显示类型/名称/summary 首句，
 *      无 hover 时显示图谱总览统计（KG.index.stats）。挂在 #page-stage 下、
 *      .stage-scene 之外的纯屏幕空间层，不进入 preserve-3d 链路，因此可以放心
 *      使用 backdrop-filter（3D 中间层节点禁止 backdrop-filter 的限制在此不适用）。
 *   5. 左侧六边形入口（资料搜索/图谱搜索/图谱介绍）的差异化落点在 core/router.js
 *      的全局点击代理里处理（那三个按钮不带 data-node-id），本文件不重复处理。
 *
 * 经典脚本 IIFE，零 import/export/fetch，依赖已加载的 KG.dom / KG.index / KG.data /
 * KG.router / KG.layersGround / KG.layersObjects / KG.transition（均已是正式实现，
 * 不再做并行开发期的存在性探测）。
 */
(function () {
  'use strict';

  window.KG = window.KG || {};

  var built = false;   // L0~L7 只构建一次的标志位，update() 不得重建
  var pageEl = null;

  // 展台信息条的三个内容节点，mount 首次构建后常驻复用
  var hintEl = null;
  var hintTypeEl = null;
  var hintNameEl = null;
  var hintDescEl = null;

  /* ============================================================
   * 一、节点 id -> 图谱页目标视角映射
   * ========================================================== */

  var RE_TASK = /^T\d{2}$/;
  var RE_DOMAIN = /^D[1-7]$/;
  var RE_BIZ = /^B[1-3]$/;

  function targetOf(id) {
    if (id === 'hub-task') return { view: 'task', focus: 'hub-task' };
    if (RE_TASK.test(id)) return { view: 'task', focus: id };
    if (RE_BIZ.test(id)) return { view: 'business', focus: id };
    if (RE_DOMAIN.test(id)) return { view: 'domain', focus: id };
    return null;
  }

  /* ============================================================
   * 二、展台信息条
   * ========================================================== */

  /** 取 summary 的第一句（按中英文句读切分），找不到句读时整段返回。 */
  function firstSentence(text) {
    var s = String(text || '');
    var m = s.match(/^[^。！？.!?]*[。！？.!?]?/);
    return (m && m[0]) || s;
  }

  /**
   * .stage-hint 在全站样式表里没有任何对应规则，是纯纯的内联样式实现——不是疏漏，
   * 是 index.html 冻结之后没有地方新增 <style> 或外链样式表，只能把整套样式当内联
   * 属性写死在 JS 里，这是"冻结 index.html"这个约束的成本外溢，下面几个容易让人
   * 看不出理由的取值集中注释一次，避免以后有人误当成随手写的魔法数字改掉：
   *   bottom:'46px'                —— 让信息条悬浮在顶台圆盘下方、又不遮住 L7 三枚
   *                                    徽章，是配合舞台整体高度反复试出来的经验值。
   *   minWidth:'460px'/maxWidth:'1200px' —— 短文案（"图谱总览"统计行）不塌陷成一条缝，
   *                                    长文案（node.summary 首句）也不会撑爆到超出
   *                                    舞台可视区外。
   *   zIndex:'5'                   —— 只需要盖过 .layer-ground/.layer-objects 内
   *                                    preserve-3d 链路上的所有层（它们没有用到这么
   *                                    大的 z-index），但仍然低于顶部导航/侧栏。
   *   pointerEvents:'none'         —— 信息条本身只展示不接收点击，避免意外挡住舞台
   *                                    下方可能存在的可交互区域。
   */
  function buildHint() {
    var dom = window.KG.dom;

    hintTypeEl = dom.h('span', {
      class: 'stage-hint-type',
      style: { color: 'var(--gold)', fontWeight: '600', letterSpacing: '2px', fontSize: '14px' }
    });
    hintNameEl = dom.h('span', {
      class: 'stage-hint-name',
      style: { color: 'var(--ink)', fontSize: '19px', fontWeight: '600' }
    });
    hintDescEl = dom.h('span', {
      class: 'stage-hint-desc',
      style: { color: 'var(--ink-2)', fontSize: '14px' }
    });

    hintEl = dom.h('div', {
      class: 'stage-hint',
      style: {
        position: 'absolute',
        left: '50%',
        bottom: '46px',
        transform: 'translateX(-50%)',
        zIndex: '5',
        display: 'flex',
        alignItems: 'baseline',
        gap: '16px',
        padding: '14px 34px',
        minWidth: '460px',
        maxWidth: '1200px',
        justifyContent: 'center',
        whiteSpace: 'nowrap',
        background: 'var(--glass)',
        border: '1px solid var(--glass-line)',
        borderRadius: '8px',
        boxShadow: '0 0 26px var(--cyan-a28)',
        backdropFilter: 'blur(var(--glass-blur))',
        WebkitBackdropFilter: 'blur(var(--glass-blur))',
        pointerEvents: 'none',
        transition: 'opacity var(--t-base) var(--e-out)'
      }
    }, [hintTypeEl, hintNameEl, hintDescEl]);

    pageEl.appendChild(hintEl);
  }

  function showStats() {
    if (!hintEl) return;
    var st = window.KG.index.stats;
    hintTypeEl.textContent = '资料总览';
    hintNameEl.textContent = '';
    hintDescEl.textContent = st.nodes + ' 节点 / ' + st.edges + ' 关系 / ' + st.docs + ' 说明卡';
  }

  function showNodeHint(node) {
    if (!hintEl || !node) return;
    hintTypeEl.textContent = window.KG.index.labelOf(node);
    hintNameEl.textContent = node.name || '';
    hintDescEl.textContent = firstSentence(node.summary);
  }

  function showBadgeHint(text) {
    if (!hintEl) return;
    hintTypeEl.textContent = '顶台徽章';
    hintNameEl.textContent = text;
    hintDescEl.textContent = '';
  }

  /* ============================================================
   * 三、跳转（降级安全：KG.transition 未接管时直接 router.go）
   * ========================================================== */

  function goToGraph(el, id, target) {
    // KG.transition 在 scripts/transition.js 里已经是正式实现（挂载在本文件之前
    // 加载），不再需要并行开发期「可能还没实现」的探测式兜底，直接调用即可；
    // 依赖真的缺失时应该抛 TypeError 暴露问题，而不是静默退化。
    var transition = window.KG.transition;
    var payload = transition.capture(el, id);
    payload.target = 'graph';
    payload.view = target.view;
    payload.focus = target.focus;

    // 这里的 `!taken` 分支不是兜底，而是 KG.transition.run() 对外的公开契约：
    // run() 返回 false 表示「本次没有接管转场」，调用方必须自行 router.go 完成跳转。
    var ran = transition.run(payload);
    Promise.resolve(ran).then(function (taken) {
      if (!taken) {
        window.KG.router.go('graph', { view: target.view, focus: target.focus });
      }
    });
  }

  /* ============================================================
   * 四、交互绑定
   * ========================================================== */

  function bindNode(el) {
    var id = el.dataset.nodeId;
    var target = targetOf(id);
    var node = window.KG.index.byId[id];

    el.addEventListener('mouseenter', function () {
      el.classList.add('is-hover');
      if (node) showNodeHint(node);
    });
    el.addEventListener('mouseleave', function () {
      el.classList.remove('is-hover');
      showStats();
    });
    el.addEventListener('focus', function () {
      el.classList.add('is-hover');
      if (node) showNodeHint(node);
    });
    el.addEventListener('blur', function () {
      el.classList.remove('is-hover');
      showStats();
    });

    if (!target) return; // 数据里的节点 id 理论上都能映射到目标，这里只是防御

    el.addEventListener('click', function () { goToGraph(el, id, target); });
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        goToGraph(el, id, target);
      }
    });
  }

  /**
   * L7 三枚徽章没有对应数据节点，但 1-D 的 layers-objects.js 已经给它们挂了
   * role="button" + tabindex="0" + aria-label，键盘可以 Tab 聚焦到——本文件之前
   * 只绑了 click/mouseenter/mouseleave，漏绑 keydown，导致 Enter/Space 按不出
   * 任何效果，是一枚典型的「假按钮」（违反 WCAG 2.1.1 键盘可操作性），这里补上。
   *
   * 另外 layers-objects.js 已经用 dataset.stageAction 标出三枚徽章各自的身份
   * （tech-attack / platform / talent），此前 bindBadges() 完全没读这个属性，
   * 三枚一律跳到同一个 #/graph?view=task。这里按徽章语义分别落到三个不同视角：
   *   tech-attack（标准体系）—— view=task
   *   platform    （作业管控）—— view=business
   *   talent      （故障复盘）—— view=domain
   * 三者互不相同，也和"图谱搜索"六边形入口的落点（#/graph?view=task）区分开。
   */
  var BADGE_TARGET_VIEW = {
    'tech-attack': 'task',
    'platform': 'business',
    'talent': 'domain'
  };

  function bindBadges() {
    var dom = window.KG.dom;
    dom.qsa('.badge', pageEl).forEach(function (badge) {
      var label = badge.textContent || '标准体系';
      var view = BADGE_TARGET_VIEW[badge.dataset.stageAction] || 'task';

      function activate() {
        window.KG.router.go('graph', { view: view });
      }

      badge.style.cursor = 'pointer';
      badge.addEventListener('mouseenter', function () {
        badge.classList.add('is-hover');
        showBadgeHint(label);
      });
      badge.addEventListener('mouseleave', function () {
        badge.classList.remove('is-hover');
        showStats();
      });
      badge.addEventListener('click', activate);
      badge.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
          e.preventDefault();
          activate();
        }
      });
    });
  }

  /**
   * 曾经这里还有一个 suppressDecorativePointerEvents()：遍历 .layer-ground /
   * .layer-objects 下约 300 个节点，逐个给非交互叶子写内联 pointer-events:none，
   * 用来防止纯装饰层挡住点击。经实测（21 个 [data-node-id] + 3 枚徽章逐一
   * elementFromPoint 命中自身，24/24 全部命中）CSS 侧已经给绝大多数装饰叶子写好了
   * pointer-events:none，这段应用层遍历已经是纯冗余；而且它按 classList.contains
   * ('badge') 之类白名单硬编码豁免名单，未来新增其它想要可点击的非 [data-node-id]
   * 元素会被它悄悄致盲（这次徽章的键盘不可达就是同类坑），所以直接删掉，不再调用。
   * 如果后续新增交互元素被装饰层吞掉点击，应该去 CSS 里给对应装饰选择器补
   * pointer-events:none，而不是在这里加回一段隐式生效的遍历兜底。
   */
  function bindInteractions() {
    var dom = window.KG.dom;
    dom.qsa('[data-node-id]', pageEl).forEach(bindNode);
    bindBadges();
  }

  /* ============================================================
   * 五、路由生命周期
   * ========================================================== */

  function mount(ctx) {
    pageEl = (ctx && ctx.el) || document.getElementById('page-stage');

    if (!built) {
      var bgRoot = window.KG.dom.qs('.stage-bg', pageEl);
      var groundRoot = window.KG.dom.qs('.layer-ground', pageEl);
      var objectsRoot = window.KG.dom.qs('.layer-objects', pageEl);

      // KG.layersGround / KG.layersObjects 由 scripts/stage/layers-ground.js、
      // layers-objects.js 在本文件之前加载并挂载好，不再需要并行开发期「模块可能
      // 还没就位」的存在性探测——依赖真的缺失时应该抛 TypeError 暴露问题，而不是
      // 静默跳过导致展台空白却控制台毫无异常。
      window.KG.layersGround.buildBackdrop(bgRoot);
      window.KG.layersGround.build(groundRoot);
      window.KG.layersObjects.build(objectsRoot);

      buildHint();
      bindInteractions();
      built = true;
    }

    showStats();
  }

  function update() {
    // 展台页没有可变 query 参数，重新进入时把信息条复位到统计态
    showStats();
  }

  function unmount() {
    if (hintEl) showStats();
  }

  window.KG.stagePage = {
    register: function () {
      window.KG.router.register('stage', { mount: mount, update: update, unmount: unmount });
    }
  };
})();
