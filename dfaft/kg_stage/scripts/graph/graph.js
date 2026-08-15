/*
 * graph/graph.js —— 图谱看板页：路由注册 + ECharts 实例编排 + 转场坐标查询
 * 挂载到 window.KG.graphPage。经典脚本 IIFE，零 import/export/fetch。
 *
 * 职责边界：
 *   - 布局算法在 graph-layout.js，option 生成在 graph-option.js，
 *     本文件只做「DOM 缓存 / echarts 实例生命周期 / 事件绑定 / 与其它模块的胶水」。
 *   - ECharts 实例只 init 一次（挂在 router 的 mount 阶段），
 *     之后视角切换一律 setOption(..., {notMerge:true})，不销毁重建。
 *
 * nodeScreenPos() 的稳定性契约（供 scripts/transition.js 等调用方依赖）：
 *   graph 系列开着 roam:true，graph-option.js 里还给了 animationDuration:800 的
 *   入场动画；若整帧带着这份动画 setOption，节点在渲染后的 ~800ms 内会持续经历
 *   「入场缩放/位移收敛」，convertToPixel（进而 nodeScreenPos）在此期间读到的都
 *   是过渡帧、并非最终定位。本文件通过 applyOptionStable()：整图刷新的这一帧
 *   强制 animation:false 把节点/边直接落到最终位置，下一帧再把 animation 补回
 *   true（只影响之后的 hover/emphasis/roam 缩放等交互动画，不影响这次落定），
 *   从而保证 setOption 返回后 nodeScreenPos() 立刻是同步、准确的最终坐标，
 *   不需要调用方轮询等待或逐帧追踪。
 */
(function (global) {
  'use strict';

  var KG = global.KG = global.KG || {};

  /* ============================================================
   * 一、模块内状态（闭包持有，页面整个生命周期内只有一份）
   * ========================================================== */

  var chart = null;

  var elChart = null;
  var elMap = null;
  var elKicker = null;
  var elTitle = null;
  var elSummary = null;
  var elSearch = null;
  var elLegend = null;
  var elResetBtn = null;
  var elDetailBtn = null;

  var currentView = null;      // 'task' | 'domain' | 'business'
  var currentFocus = null;     // 当前聚焦节点 id
  var currentQuery = {};       // 最近一次 router ctx.query，原样保留非本页处理的字段
  var currentPositions = null; // 当前视角的节点坐标（graph-layout 输出）
  var currentOption = null;    // 当前完整 option（重置视图/搜索淡出都基于它重建）
  var nodeIndexById = {};      // 节点 id -> series.data 下标
  var trunkEdges = [];         // 主干边列表，供「流光边」像素坐标同步

  var clickTimer = null;       // 单击去抖计时器（区分单击/双击）

  /* ============================================================
   * 二、小工具
   * ========================================================== */

  function normalizeView(v) {
    return (v === 'domain' || v === 'business') ? v : 'task';
  }

  function hubOf(view) {
    var nodes = KG.index.nodesFor(view);
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].type === 'root') return nodes[i].id;
    }
    return nodes[0] && nodes[0].id;
  }

  function cacheDom() {
    elChart = document.getElementById('graphChart');
    elMap = document.querySelector('#page-graph .graph-map');
    elKicker = document.getElementById('graphKicker');
    elTitle = document.getElementById('graphTitle');
    elSummary = document.getElementById('graphSummary');
    elSearch = document.getElementById('graphSearch');
    elLegend = document.getElementById('graphLegend');
    elResetBtn = document.getElementById('graphResetBtn');
    elDetailBtn = document.getElementById('graphDetailBtn');
  }

  function injectWorldMap() {
    if (!elMap) return;
    // 空串就是空，不允许在这里造假图（世界地图 SVG 由 assets/worldmap.js 提供）
    elMap.innerHTML = (KG.assets && KG.assets.worldMapSvg) || '';
  }

  /* ============================================================
   * 三、左侧信息面板 / 图例
   * ========================================================== */

  function updatePanel(node) {
    if (elKicker) elKicker.textContent = KG.index.labelOf(node);
    if (elTitle) elTitle.textContent = node.name || '';
    if (elSummary) elSummary.textContent = node.summary || '';
  }

  var LEGEND_ORDER = ['root', 'task', 'domain', 'business', 'direction', 'technology', 'content'];

  function renderLegend(view) {
    if (!elLegend) return;
    KG.dom.clear(elLegend);
    var nodes = KG.index.nodesFor(view);
    var present = {};
    nodes.forEach(function (n) { present[n.type] = true; });

    LEGEND_ORDER.forEach(function (type) {
      if (!present[type]) return;
      var varName = KG.data.meta.typeColorVar[type];
      var label = KG.data.meta.typeLabel[type];
      // color 与 background 都设成该类型色：background 决定圆点本身颜色，
      // color 决定 .legend-dot { box-shadow:0 0 6px currentColor } 的辉光颜色——
      // 不设 color 的话辉光会继承 .legend-item{color:var(--ink-2)} 的灰蓝色，
      // 与圆点本身颜色对不上（详见 bug 5）。
      var item = KG.dom.h('div', { class: 'legend-item' }, [
        KG.dom.h('span', {
          class: 'legend-dot',
          style: { background: 'var(' + varName + ')', color: 'var(' + varName + ')' }
        }),
        KG.dom.h('span', { class: 'legend-label', text: label })
      ]);
      elLegend.appendChild(item);
    });
  }

  /* ============================================================
   * 四、流光边：把「主干边」的两端换算成当前渲染像素坐标，
   *     喂给隐藏直角坐标系上的 lines 系列（唯一能挂 effect 流光的系列类型）。
   *     每次 setOption / 每次 roam 平移缩放后都要重新同步，否则光点会和边错位。
   * ========================================================== */

  function syncFlowLines() {
    if (!chart || !currentPositions) return;
    var coordsData = [];
    trunkEdges.forEach(function (edge) {
      var ps = currentPositions[edge.s];
      var pt = currentPositions[edge.t];
      if (!ps || !pt) return;
      var p1 = chart.convertToPixel({ seriesIndex: 0 }, [ps.x, ps.y]);
      var p2 = chart.convertToPixel({ seriesIndex: 0 }, [pt.x, pt.y]);
      if (!p1 || !p2) return;
      coordsData.push({ coords: [p1, p2] });
    });
    chart.setOption({ series: [{ id: 'kg-flow', data: coordsData }] });
  }

  /* ============================================================
   * 五、聚焦 / 涟漪脉冲
   * ========================================================== */

  /**
   * 生成一枚涟漪环：初始小而不透明，下一帧切换到「放大 + 透明」触发 CSS
   * transition（刻意不用 @keyframes——项目约定 @keyframes 只能写在 fx.css，
   * 本文件无权新增，这里复用转场层同款的「双 rAF 起止帧 + transition」手法）。
   */
  function spawnRing(px, py, delay) {
    var ring = KG.dom.h('span', {
      class: 'graph-pulse',
      style: { left: px + 'px', top: py + 'px' }
    });
    elChart.appendChild(ring);
    var removed = false;
    function cleanup() {
      if (removed) return;
      removed = true;
      if (ring.parentNode) ring.parentNode.removeChild(ring);
    }
    setTimeout(function () {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          ring.classList.add('is-expand');
        });
      });
      ring.addEventListener('transitionend', cleanup);
      setTimeout(cleanup, 1200); // 兜底移除，避免 transitionend 在个别环境不触发
    }, delay || 0);
  }

  function pulseAt(id) {
    if (!chart || !currentPositions || !elChart) return;
    var p = currentPositions[id];
    if (!p) return;
    var px = chart.convertToPixel({ seriesIndex: 0 }, [p.x, p.y]);
    if (!px) return;
    // 两环错峰放大，叠出「涟漪脉冲」的层次感
    spawnRing(px[0], px[1], 0);
    spawnRing(px[0], px[1], 160);
  }

  function focusNode(id, opts) {
    opts = opts || {};
    var node = KG.index.byId[id];
    if (!node) return;
    currentFocus = id;

    // 注意：这里刻意不派发 'highlight' dispatchAction。graph 系列的
    // emphasis.focus:'adjacency' + blur 是同一套状态机，无论由鼠标 hover
    // 触发还是由 dispatchAction 触发，效果完全一样——会把「当前聚焦节点」
    // 以外、且不与它直接相邻的全部节点压暗到 blur.itemStyle.opacity（.12）。
    // 图谱刚打开时默认聚焦到视角中心节点，若这里派发 highlight，会导致除
    // 中心的直接邻居外全图 90% 以上节点瞬间被压暗，等于呈现了一张几乎空的
    // 图——这不是 spec 想要的效果（spec 里的 emphasis/blur 明确是"hover 时"
    // 的交互反馈，不是聚焦态的常驻效果）。因此聚焦只做三件事：更新左侧面板
    // 文案、弹出涟漪脉冲定位、以及（可选）弹出 tooltip，不触碰全图的
    // 明暗状态机。
    var idx = nodeIndexById[id];
    if (chart && idx !== undefined && !opts.silentTip) {
      chart.dispatchAction({ type: 'showTip', seriesIndex: 0, dataIndex: idx });
    }
    updatePanel(node);
    pulseAt(id);
  }

  /* ============================================================
   * 六、搜索：命中节点保持高亮，其余淡出
   * ========================================================== */

  function applySearchHighlight(idSet) {
    if (!currentOption || !chart) return;
    var hasFilter = idSet && Object.keys(idSet).length > 0;
    var baseData = currentOption.series[0].data;
    // 用 Object.assign 整体拷贝再覆盖 itemStyle，而不是逐字段手工搬运——
    // 后者与 graph-option.js 的 data item 形状强耦合，以后加字段会静默丢。
    var data = baseData.map(function (item) {
      var opacity = 1;
      if (hasFilter) opacity = idSet[item.id] ? 1 : 0.12;
      return Object.assign({}, item, {
        itemStyle: Object.assign({}, item.itemStyle, { opacity: opacity })
      });
    });
    chart.setOption({ series: [{ id: 'kg-graph', data: data }] });
  }

  var SEARCH_DEBOUNCE_MS = 120;
  var searchDebounceTimer = null;

  function bindSearch() {
    if (!elSearch) return;
    elSearch.addEventListener('input', function () {
      if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(function () {
        searchDebounceTimer = null;
        var q = elSearch.value.trim();
        if (!q) { applySearchHighlight(null); return; }
        var hits = KG.index.search(q, 30);
        var idSet = {};
        hits.forEach(function (n) { if (nodeIndexById[n.id] !== undefined) idSet[n.id] = true; });
        applySearchHighlight(idSet);
      }, SEARCH_DEBOUNCE_MS);
    });
  }

  /* ============================================================
   * 七、重置视图 / 查看详情 / 下钻文档
   * ========================================================== */

  function resetView() {
    if (!chart || !currentOption) return;
    applyOptionStable(currentOption);
    if (elSearch) elSearch.value = '';
    syncFlowLines();
  }

  /**
   * 构造一份与 scripts/transition.js 里 capture(el, nodeId) 返回值同构的 payload。
   * ECharts canvas 上的节点没有对应 DOM 元素，capture() 依赖的
   * el.getBoundingClientRect() 无法使用，这里改为直接从图谱自身状态
   * （nodeScreenPos + 当前 option 里的 symbolSize + KG.index.colorOf）
   * 手工拼出同样字段的「虚拟源矩形」，交给 KG.transition.run() 消费。
   * 字段对齐 transition.js::capture()：nodeId/x/y/w/h/colorVar/label/type/t，
   * 额外补 target:'docs' 与 docsQuery（转场 NAVIGATE 阶段要用的路由参数）。
   */
  function buildDocsTransitionPayload(id, node) {
    var pos = nodeScreenPos(id) || { x: KG.scale.DESIGN_W / 2, y: KG.scale.DESIGN_H / 2 };

    // symbolSize 已经是 nodeScreenPos 同一套坐标系（ECharts 按 elChart.clientWidth/
    // clientHeight 建立、天然等同设计坐标系）里的像素单位，不需要再除以 #screen 的
    // 缩放系数 k——k 只用于「真实视口坐标 -> 设计坐标」的换算（见 nodeScreenPos 顶部
    // 注释），symbolSize 从不经过真实视口这一步，多除一次 k 会在 k≠1 的视口下把
    // 转场光晕直径系统性放大/缩小（1440×900 时 k≈0.75，会被放大 33%）。
    var rawSize = 32;
    var idx = nodeIndexById[id];
    if (currentOption && currentOption.series && currentOption.series[0] && idx !== undefined) {
      var item = currentOption.series[0].data[idx];
      if (item && item.symbolSize) rawSize = item.symbolSize;
    }
    var size = Math.max(rawSize, 4);

    return {
      nodeId: id,
      x: pos.x,
      y: pos.y,
      w: size,
      h: size,
      colorVar: KG.index.colorOf(node),
      label: node.short || node.name,
      type: node.type,
      t: Date.now() % 1e6,
      target: 'docs',
      // view: 带上当前图谱视角，供 docs 页「查看全图」按原视角回跳（协议见 docs.js::update()）
      docsQuery: { task: node.taskId || undefined, node: id, view: currentView }
    };
  }

  // domain/business/root 三类节点没有对应的文档树（没有 taskId，也不在任何一棵
  // T* 层级树里），下钻文档页只会被 docs.js 兜底成 meta.tasks[0]（T01），呈现出
  // 「点了领域球却打开了无关文档」的错觉。只有 T* 系层级节点（task/direction/
  // technology/content）才真正拥有文档树，值得下钻；其余类型改为图谱内聚焦。
  var DOCS_DRILLABLE_TYPES = { task: true, direction: true, technology: true, content: true };

  function goToDocs(id) {
    var node = KG.index.byId[id];
    if (!node) return;

    if (!DOCS_DRILLABLE_TYPES[node.type]) {
      focusNode(id);
      return;
    }

    // 降级安全写法，照 stage.js::goToGraph() 同款模式：KG.transition 不存在/
    // 未接管时直接 router.go，保证转场模块出问题不会阻断下钻这条主线功能。
    var payload = (KG.transition && typeof KG.transition.run === 'function')
      ? buildDocsTransitionPayload(id, node)
      : null;
    var ran = payload ? KG.transition.run(payload) : false;
    Promise.resolve(ran).then(function (taken) {
      if (!taken) KG.router.go('docs', { task: node.taskId || undefined, node: id, view: currentView });
    });
  }

  function goToDetail() {
    var id = currentFocus || hubOf(currentView);
    goToDocs(id);
  }

  /**
   * 「图谱介绍」入口（左侧六边形侧栏，router.js::hexIntro() 落到
   * #/graph?view=task&focus=hub-task 之后广播 'graph:intro'）：把左侧信息面板从
   * 具体节点态切回图谱总述——展示当前视角 hub 节点自身的名称/简介，附加全图统计
   * 口径（KG.index.stats），不改变当前聚焦节点 / 涟漪高亮状态，只是换一屏文案。
   */
  function showIntro() {
    var hubId = hubOf(currentView);
    var node = KG.index.byId[hubId];
    if (!node) return;
    var st = KG.index.stats;
    if (elKicker) elKicker.textContent = '图谱介绍';
    if (elTitle) elTitle.textContent = node.name || '';
    if (elSummary) {
      elSummary.textContent = (node.summary || '') +
        '  全图共 ' + st.nodes + ' 个节点、' + st.edges + ' 条关系、' + st.docs + ' 篇文档，覆盖 ' +
        st.tasks + ' 项重点任务、' + st.domains + ' 大技术领域、' + st.businesses + ' 大业务场景。';
    }
  }

  /* ============================================================
   * 八、事件绑定
   * ========================================================== */

  function bindDomEvents() {
    if (elResetBtn) elResetBtn.addEventListener('click', resetView);
    if (elDetailBtn) elDetailBtn.addEventListener('click', goToDetail);
    bindSearch();
    KG.bus.on('graph:reset', resetView);
    // router.js::hexIntro() 的实现是 go('graph',{view:'task',focus:'hub-task'})
    // 后紧跟着同步 emit('graph:intro')：go() 只是把 location.hash 改掉，真正触发
    // hashchange -> router 的 update(ctx) -> renderFromCtx -> focusNode('hub-task')
    // 是浏览器异步派发的另一个宏任务，晚于这次同步 emit。若这里同步调用
    // showIntro()，面板会先被本函数写成「总述」文案，随即又被稍后触发的
    // focusNode('hub-task') 用 updatePanel() 覆盖回「具体节点」文案，「图谱介绍」
    // 入口最终视觉上等于没生效。这里用 setTimeout 顺延到那次 hashchange 处理完
    // 之后再执行，是本项目已有的同类约定（见 router.js::focusSoon() 头部注释：
    // "hashchange 是浏览器异步派发的宏任务，go() 之后不能立刻拿到...效果"，那里
    // 用的是 30ms；这里额外留一点余量给 renderView() 的整图刷新，防止极端情况下
    // 图谱页是首次挂载、要跑一次完整 O(n²) 布局迭代）。
    KG.bus.on('graph:intro', function () { setTimeout(showIntro, 50); });
  }

  function bindChartEvents() {
    // 单击：去抖 260ms 后下钻文档页；双击命中时会先被 dblclick 处理器取消这次下钻。
    chart.on('click', function (params) {
      if (params.dataType !== 'node') return;
      if (clickTimer) { clearTimeout(clickTimer); }
      var id = params.data.id;
      clickTimer = setTimeout(function () {
        clickTimer = null;
        goToDocs(id);
      }, 260);
    });

    // 双击：取消挂起的单击下钻，改为「以该节点为中心重新聚焦」
    chart.on('dblclick', function (params) {
      if (params.dataType !== 'node') return;
      if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; }
      var id = params.data.id;
      focusNode(id);
      var q = {};
      for (var k in currentQuery) { if (Object.prototype.hasOwnProperty.call(currentQuery, k)) q[k] = currentQuery[k]; }
      q.view = currentView;
      q.focus = id;
      KG.router.replace('graph', q);
    });

    // roam（拖拽平移 / 滚轮缩放）后，流光边必须重新对齐，否则光点会飘离真实边
    chart.on('graphRoam', syncFlowLines);
  }

  /* ============================================================
   * 九、渲染主流程
   * ========================================================== */

  /**
   * 用「关闭入场动画」的方式整帧应用 option，保证 setOption 返回后
   * chart.convertToPixel 立刻就是最终坐标（见十一节 nodeScreenPos 的稳定性契约）。
   * 做法：这一帧先以 animation:false 落定所有节点/边的最终位置，下一帧再把
   * animation 补回 true，使之后的 hover/emphasis/roam 缩放等交互动画不受影响
   * ——只有「整图刷新」这一瞬间不做位移类动画，不影响交互动画观感。
   */
  function applyOptionStable(option) {
    chart.setOption(Object.assign({}, option, { animation: false }), { notMerge: true });
    requestAnimationFrame(function () {
      if (chart) chart.setOption({ animation: true });
    });
  }

  function renderView(view, focusId) {
    currentView = view;
    currentFocus = null;

    // 不给 clientWidth/clientHeight 兜底：#graphChart 是绝对定位、尺寸由 CSS 结构性
    // 规则决定，mount() 时 .page.is-active 早已同步加上（见 router.js::handleHashChange
    // 先 setActivePage 再 mount），真实宽高必然 > 0；如果读到 0，说明容器结构或 CSS
    // 加载出了问题，应该让 graph-layout.compute() 的显式校验直接报错，而不是静默
    // 换算成一份 1200×800 的假布局把问题埋起来。
    var w = elChart.clientWidth;
    var h = elChart.clientHeight;

    var layout = KG.graphLayout.compute(view, w, h);
    currentPositions = layout.positions;

    var initialFocus = focusId || hubOf(view);
    var built = KG.graphOption.build(view, layout, initialFocus);
    nodeIndexById = built.nodeIndexById;
    trunkEdges = built.trunkEdges;
    currentOption = built.option;

    applyOptionStable(currentOption);
    renderLegend(view);
    // 视角切换清空搜索框残留的输入——resetView() 已经清了，这里是换视角这条路径
    // 遗漏的另一半（bug：换视角后旧关键词残留在输入框但已经不代表任何过滤态）。
    if (elSearch) elSearch.value = '';
    syncFlowLines();
    focusNode(initialFocus, { silentTip: true });
  }

  function renderFromCtx(ctx) {
    var query = (ctx && ctx.query) || {};
    currentQuery = query;
    var view = normalizeView(query.view);
    var focus = query.focus || '';

    if (view !== currentView) {
      renderView(view, focus || null);
    } else if (focus && focus !== currentFocus) {
      focusNode(focus);
    }
  }

  /* ============================================================
   * 十、路由生命周期
   * ========================================================== */

  function mount(ctx) {
    cacheDom();
    injectWorldMap();
    chart = echarts.init(elChart);
    bindDomEvents();
    bindChartEvents();
    renderFromCtx(ctx);
  }

  function update(ctx) {
    renderFromCtx(ctx);
  }

  function unmount() {
    // 单击去抖计时器必须在离开页面时清掉：否则「图谱页单击节点 -> 260ms 内切走」
    // 场景下，计时器会在页面切走之后依然触发 goToDocs()，把用户强行拽去文档页
    // （bug 4：单击节点后立刻按 Esc 回展台，260ms 后仍被拉去 docs 页并触发白闪）。
    if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; }

    // 图谱页保持常驻实例，切走时无需销毁；仅清掉可能残留的涟漪层，避免累积。
    if (!elChart) return;
    var stray = elChart.querySelectorAll('.graph-pulse');
    for (var i = 0; i < stray.length; i++) stray[i].parentNode.removeChild(stray[i]);
  }

  function register() {
    KG.router.register('graph', { mount: mount, update: update, unmount: unmount });
  }

  /* ============================================================
   * 十一、转场坐标查询（供 scripts/transition.js 调用，必须同步、准确）
   * ========================================================== */

  /**
   * 返回节点当前在 1920×1080 设计坐标系下的位置 {x,y}。
   * 换算链路：graph-layout 坐标 → chart.convertToPixel（含当前 roam 缩放/平移）
   *          → 加上 #graphChart 左上角在设计坐标系下的偏移。
   *
   * 修复说明（曾经的坐标系混用 bug）：chart.convertToPixel 返回的像素值，是
   * ECharts 内部按 elChart.clientWidth/clientHeight（未叠加 #screen 那层
   * transform:scale(var(--s)) 的「本地布局尺寸」）建立的坐标系，数值上就等于
   * 设计坐标系下的像素——因为整条 UI 缩放链路的约定就是「先按 1920×1080 设计
   * 尺寸走完整布局，最外层 #screen 再整体 CSS 缩放贴合视口」，容器的 clientWidth/
   * clientHeight 从不受祖先 transform 影响，天然与设计坐标同尺度。而
   * elChart.getBoundingClientRect() 拿到的是「经过 #screen 缩放变换之后」的真实
   * 视口矩形，与 clientWidth 不是同一尺度（相差正是 KG.scale.get() 那个 k）。
   * 旧实现把两者直接相加（rect.left + px[0]）再整体除以 k，等于把本就已经是
   * 设计坐标系单位的 px 又多除了一次 k，导致换算结果系统性偏离节点真实位置
   * （k<1 时表现为坐标被放大），这正是 2-A 的 ghost 落点、以及本次新增的
   * graph->docs 转场虚拟源矩形都可能出现较大误差的根因。
   * 正确做法：只用 KG.scale.toDesign 把 elChart 左上角的「真实视口坐标」换算成
   * 设计坐标（这一步才需要除以 k），再直接加上已经是设计坐标系单位的 px，
   * 两者同尺度相加即为节点在整张设计画布上的绝对坐标。
   */
  function nodeScreenPos(id) {
    if (!chart || !currentPositions || !elChart) return null;
    var p = currentPositions[id];
    if (!p) return null;
    var px = chart.convertToPixel({ seriesIndex: 0 }, [p.x, p.y]);
    if (!px) return null;
    var rect = elChart.getBoundingClientRect();
    var origin = KG.scale.toDesign(rect.left, rect.top);
    return { x: origin.x + px[0], y: origin.y + px[1] };
  }

  KG.graphPage = {
    register: register,
    nodeScreenPos: nodeScreenPos,
    focusNode: focusNode
  };

})(window);
