/*
 * docs/docs.js —— 树形文档页（"文档驾驶舱"）路由注册
 * 挂载到 window.KG.docsPage = { register, selectTask, selectNode }。
 *
 * 页面结构（DOM 由冻结的 index.html 提供，这里只填充内容/挂事件）：
 *   .docs-col--tasks  #taskFilter（搜索框，运行期注入 <input>） + #taskList（10 个任务按钮）
 *   .docs-col--tree   #docsBreadcrumb（面包屑） + #treeChart（ECharts tree） + #treeLegend（四色图例）
 *   #docCard          绝对定位浮层玻璃文档卡（默认 hidden），运行期在其内部补一个
 *                      "标题行"容器（含"查看全图"链接，把已存在的 #docCardClose 挪进去）
 *
 * 生命周期：
 *   mount(ctx) —— 只执行一次：建 DOM、init ECharts 实例、绑定所有事件。
 *   update(ctx) —— hash 的 task/node/doc 变化时调用，不销毁重建 ECharts 实例。
 *
 * 经典脚本 IIFE，零 import/export/fetch。
 */
(function () {
  'use strict';

  window.KG = window.KG || {};

  var dom = null;      // KG.dom，mount 时才保证已加载
  var chartInst = null;
  var els = {};         // 缓存的 DOM 节点
  var currentTaskId = null;
  var currentNodeId = null;
  // 「来源视角」：记录本次进入 docs 页时 hash 带的 view（'task'|'domain'|'business'），
  // 供"查看全图"原路返回 graph 页；hash 没带就退回 'task'（需求明确的默认值）。
  var currentView = 'task';

  /** 归一化 view 查询参数，非法/缺省值一律退回 'task'（与 graph.js 的 normalizeView 同口径） */
  function normalizeView(v) {
    return (v === 'domain' || v === 'business') ? v : 'task';
  }

  /* ============================================================
   * 一、左栏：任务列表 + 搜索过滤
   * ========================================================== */

  function buildTaskFilter() {
    var input = dom.h('input', {
      type: 'text',
      class: 'task-filter-input',
      placeholder: '搜索运维主题…',
      'aria-label': '搜索运维主题',
      onInput: function (e) { applyTaskFilter(e.target.value); }
    });
    els.taskFilterEl.appendChild(input);
    els.taskFilterInput = input;
  }

  function buildTaskList() {
    var frag = document.createDocumentFragment();
    KG.data.meta.tasks.forEach(function (taskId) {
      var node = KG.index.byId[taskId];
      if (!node) return;
      var btn = dom.h('button', {
        type: 'button',
        class: 'task-item',
        dataset: { taskId: taskId },
        onClick: function () { selectTask(taskId); }
      }, [
        dom.h('span', { class: 'task-item-index', text: taskId.replace('T', '') }),
        dom.h('span', { class: 'task-item-name', text: node.short || node.name })
      ]);
      frag.appendChild(btn);
    });
    els.taskListEl.appendChild(frag);
  }

  function applyTaskFilter(query) {
    var q = String(query || '').trim();
    dom.qsa('.task-item', els.taskListEl).forEach(function (btn) {
      var name = btn.querySelector('.task-item-name').textContent;
      var visible = !q || name.indexOf(q) >= 0;
      btn.classList.toggle('is-hidden', !visible);
    });
  }

  function highlightActiveTask(taskId) {
    dom.qsa('.task-item', els.taskListEl).forEach(function (btn) {
      btn.classList.toggle('is-active', btn.dataset.taskId === taskId);
    });
  }

  /* ============================================================
   * 二、图例
   * ========================================================== */

  function buildLegend() {
    var TYPES = ['task', 'direction', 'technology', 'content'];
    dom.clear(els.legendEl);
    TYPES.forEach(function (type) {
      var varName = KG.index.colorOf({ type: type });
      var label = KG.index.labelOf({ type: type });
      var row = dom.h('div', { class: 'legend-row' }, [
        dom.h('span', { class: 'legend-dot', style: { background: 'var(' + varName + ')', color: 'var(' + varName + ')' } }),
        dom.h('span', { text: label })
      ]);
      els.legendEl.appendChild(row);
    });
  }

  /* ============================================================
   * 三、中栏：面包屑 + ECharts 密集树
   * ========================================================== */

  function renderBreadcrumb(nodeId) {
    dom.clear(els.breadcrumbEl);
    var path = [];
    if (nodeId) {
      path = KG.index.pathOf(nodeId).filter(function (n) { return n.type !== 'root'; });
    } else if (currentTaskId && KG.index.byId[currentTaskId]) {
      path = [KG.index.byId[currentTaskId]];
    }
    path.forEach(function (n, i) {
      if (i > 0) els.breadcrumbEl.appendChild(dom.h('span', { class: 'crumb-sep', text: '>' }));
      var isLast = i === path.length - 1;
      var crumb = dom.h('span', {
        class: 'crumb-item' + (isLast ? ' is-current' : ' is-clickable'),
        text: n.short || n.name,
        onClick: isLast ? undefined : function () { selectNode(n.id, null); }
      });
      els.breadcrumbEl.appendChild(crumb);
    });
  }

  /** 用当前 task/selectedId 重新生成整棵树；notMerge:true 保证节点样式（选中态等）不被残留合并 */
  function renderTree(taskId, selectedId) {
    var option = KG.treeOption.build(taskId, selectedId);
    if (!option) return;
    chartInst.setOption(option, { notMerge: true });
  }

  /* ============================================================
   * 四、右上浮层：玻璃文档卡
   * ========================================================== */

  /**
   * 在不改动 index.html 的前提下，运行期给 #docCard 补一个标题行容器：
   * 把已存在的 #docTitle 和 #docCardClose 一起挪进去，并在中间插入
   * 一个新建的"查看全图"链接，视觉上还原参考图 4 右上角的工具条。
   */
  function enhanceDocCardDom() {
    var head = dom.h('div', { class: 'doc-card-head' });
    var viewAllLink = dom.h('a', {
      class: 'doc-card-viewall',
      href: '#',
      text: '查看全图',
      onClick: function (e) {
        e.preventDefault();
        if (!currentNodeId) return;
        // 带上记住的来源视角原路返回，而不是硬编码 'task'
        KG.router.go('graph', { view: currentView, focus: currentNodeId });
      }
    });
    var rightGroup = dom.h('div', { class: 'doc-card-head-right' });

    els.docCardEl.insertBefore(head, els.titleEl);
    head.appendChild(els.titleEl);          // 挪动已存在的标题节点
    rightGroup.appendChild(viewAllLink);
    rightGroup.appendChild(els.closeBtnEl);  // 挪动已存在的关闭按钮
    head.appendChild(rightGroup);

    var divider = dom.h('div', { class: 'doc-card-divider' });
    els.docCardEl.insertBefore(divider, els.tagsEl);
  }

  /**
   * 把玻璃卡的 transform-origin 设到触发源（鼠标点击位置 / 面包屑元素矩形）附近，
   * 制造"从节点位置生长出来"的动画感；缺省时退化为从卡片自身中心淡入缩放。
   */
  function growCardFrom(origin) {
    // docs.css 里 .doc-card{transform:scale(.25)} 是常驻声明，只有 .is-grown 才是
    // scale(1)：首次打开（未 is-grown）时如果直接量 getBoundingClientRect()，量到的
    // 是缩小 4 倍后的盒子，百分比换算会被放大 4 倍，卡片就会从屏外飞入。这里量测前
    // 用内联样式临时盖掉 transform（inline style 优先级高于任何 class 选择器），
    // 量完立刻用 removeProperty 还原回由 class 决定的 transform，不影响后续动画。
    var prevTransform = els.docCardEl.style.transform;
    els.docCardEl.style.transform = 'none';
    var cardRect = els.docCardEl.getBoundingClientRect();
    els.docCardEl.style.transform = prevTransform;

    var ox = cardRect.left + cardRect.width / 2;
    var oy = cardRect.top + cardRect.height / 2;
    if (origin) {
      if (typeof origin.clientX === 'number') {
        ox = origin.clientX; oy = origin.clientY;
      } else if (typeof origin.left === 'number') {
        ox = origin.left + (origin.width || 0) / 2;
        oy = origin.top + (origin.height || 0) / 2;
      }
    }
    var px = cardRect.width ? ((ox - cardRect.left) / cardRect.width) * 100 : 50;
    var py = cardRect.height ? ((oy - cardRect.top) / cardRect.height) * 100 : 50;
    els.docCardEl.style.transformOrigin = px + '% ' + py + '%';

    els.docCardEl.classList.remove('is-grown');
    // 强制回流，确保下一帧重新加上 class 时过渡能重新触发
    void els.docCardEl.offsetWidth;
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        els.docCardEl.classList.add('is-grown');
      });
    });
  }

  function openDocCard(nodeId, origin) {
    var doc = KG.index.docOf(nodeId);
    if (!doc) return;
    currentNodeId = nodeId;

    els.titleEl.textContent = doc.title || '';

    dom.clear(els.tagsEl);
    (doc.tags || []).forEach(function (tag) {
      els.tagsEl.appendChild(dom.h('span', { class: 'doc-tag', text: tag }));
    });

    dom.clear(els.bodyEl);
    var paragraphs = (doc.paragraphs && doc.paragraphs.length) ? doc.paragraphs : [doc.body || ''];
    paragraphs.forEach(function (p) {
      if (!p) return;
      els.bodyEl.appendChild(dom.h('p', { text: p }));
    });

    els.metaEl.textContent = doc.sourceCount > 0
      ? '关联 ' + doc.sourceCount + ' 条来源资料'
      : '演示说明卡 · 无直接来源资料';

    els.docCardEl.hidden = false;
    growCardFrom(origin);
  }

  function closeDocCard() {
    els.docCardEl.hidden = true;
    els.docCardEl.classList.remove('is-grown');
    currentNodeId = null;
  }

  /* ============================================================
   * 五、对外交互：选任务 / 选节点
   * ========================================================== */

  /** 切任务：走完整 hash 导航（router.go），触发 hashchange -> update() */
  function selectTask(taskId) {
    if (!KG.index.byId[taskId]) return;
    KG.router.go('docs', { task: taskId, view: currentView });
  }

  /**
   * 选节点：更新面包屑 + 打开文档卡 + 高亮树节点，并用 router.replace
   * 只同步地址栏（node/doc 查询参数），不触发页面重新 mount。
   * nativeEventOrRect —— 触发源，用于"生长"动画的 transform-origin：
   *   来自 ECharts 点击事件的原生 MouseEvent，或面包屑元素的 getBoundingClientRect()。
   */
  function selectNode(nodeId, nativeEventOrRect) {
    var node = KG.index.byId[nodeId];
    if (!node) return;

    var taskId = node.taskId || currentTaskId;
    if (taskId !== currentTaskId) {
      // 理论上面包屑/树点击都在当前任务范围内，跨任务只做兜底处理
      currentTaskId = taskId;
      highlightActiveTask(taskId);
    }

    renderTree(currentTaskId, nodeId);
    renderBreadcrumb(nodeId);
    openDocCard(nodeId, nativeEventOrRect);

    var doc = KG.index.docOf(nodeId);
    KG.router.replace('docs', { task: currentTaskId, node: nodeId, doc: doc ? doc.id : undefined, view: currentView });
  }

  /* ============================================================
   * 六、路由生命周期
   * ========================================================== */

  function mount(ctx) {
    dom = KG.dom;

    els.taskFilterEl = dom.qs('#taskFilter');
    els.taskListEl = dom.qs('#taskList');
    els.breadcrumbEl = dom.qs('#docsBreadcrumb');
    els.treeChartEl = dom.qs('#treeChart');
    els.legendEl = dom.qs('#treeLegend');
    els.docCardEl = dom.qs('#docCard');
    els.closeBtnEl = dom.qs('#docCardClose');
    els.titleEl = dom.qs('#docTitle');
    els.tagsEl = dom.qs('#docTags');
    els.bodyEl = dom.qs('#docBody');
    els.metaEl = dom.qs('#docMeta');

    buildTaskFilter();
    buildTaskList();
    buildLegend();
    enhanceDocCardDom();

    els.closeBtnEl.addEventListener('click', function () {
      closeDocCard();
      KG.router.replace('docs', { task: currentTaskId, view: currentView });
      renderBreadcrumb(null);
      if (currentTaskId) renderTree(currentTaskId, null);
    });

    chartInst = echarts.init(els.treeChartEl);
    chartInst.on('click', function (params) {
      if (!params.data || !params.data.id) return;
      var nativeEvent = params.event && params.event.event ? params.event.event : null;
      selectNode(params.data.id, nativeEvent);
    });

    window.addEventListener('resize', function () {
      if (chartInst) chartInst.resize();
    });

    update(ctx);
  }

  function update(ctx) {
    var query = (ctx && ctx.query) || {};
    if (chartInst) chartInst.resize();

    var taskId = (query.task && KG.index.byId[query.task]) ? query.task : (currentTaskId || KG.data.meta.tasks[0]);
    var nodeId = (query.node && KG.index.byId[query.node]) ? query.node : null;
    // 记住本次进入携带的来源视角（通常由 graph.js 下钻时通过 docsQuery.view 带过来），
    // hash 没带 view 就退回 'task'——这是需求明确的默认值，不是擅自加的兜底。
    currentView = normalizeView(query.view);

    // 缺省 task 时把 hash 规整一遍，方便刷新/分享
    if (query.task !== taskId) {
      KG.router.replace('docs', { task: taskId, node: nodeId || undefined, doc: query.doc || undefined, view: currentView });
    }

    var taskChanged = taskId !== currentTaskId;
    // 同任务换节点（taskChanged=false 但 nodeId 变了）时也必须重绘树，否则金色高亮
    // 环会残留在上一个节点上——这是本次修复的核心 bug。
    var nodeChanged = nodeId !== currentNodeId;
    currentTaskId = taskId;
    highlightActiveTask(taskId);

    if (taskChanged || nodeChanged || !nodeId) {
      renderTree(taskId, nodeId);
    }

    if (nodeId) {
      renderBreadcrumb(nodeId);
      openDocCard(nodeId, null);
    } else {
      closeDocCard();
      renderBreadcrumb(null);
    }
  }

  window.KG.docsPage = {
    register: function () { KG.router.register('docs', { mount: mount, update: update }); },
    selectTask: selectTask,
    selectNode: selectNode
  };
})();
