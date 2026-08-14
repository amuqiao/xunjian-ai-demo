// ECharts 实例注册表（P1-F）。本文件只导出一套 API：
//
// window.Charts —— “持久化槽位”注册表：
//   Charts.slot(id) 返回一个跨渲染存活的 <div class="chart-box"> 节点，场景在构建
//   vdom 时把它当子节点插进树里；Charts.draw(id, option) 把 option 排进待绘队列；
//   Charts.flush() 在下一个 rAF 里批量 init（缺失时）+ setOption(option, true)。
//   这样同一个 id 的 ECharts 实例不需要每次 render 都 dispose 再 init——
//   scripts/pump3d/engine.js 对它的 canvas 已经在做同样的“摘下来 insertBefore 到
//   新位置”的持久化处理（mount()/detach()），这里沿用同一个模式，不是新发明的机制。
//
// 曾经并存的第二套 API（window.AppCharts：dispose/resize/scheduleResize/chart/miniChart）
// 已在阶段三整合时**整段删除**。它最后一个活调用点是 scripts/scenes/workbench.js 的
// 「时序模型」卡（手写 SVG 的 miniChart()），换成 Charts.slot + ChartOptions.spark 之后
// 旧 API 全部失去调用者：legacyChart() 是 legacyInstances 唯一的写入口，没人调它之后
// 那份注册表恒为空，dispose/resize/scheduleResize 三个函数随之变成永久空转的空循环
// （boot.js 里那两处注释当时已经写明「永久空转」）。
//
// 留着一套没有调用者的注册表不是"向后兼容"，是让后来的人以为存在两条合法的画图路径、
// 从而在新场景里挑错的那一条——两套并存期间 confirm.js 和 workbench.js 就分别走了
// 不同的路，其中一条（workbench）因为不接 boot.js 的 renderSceneCharts() 钩子，
// 数据一直停留在 catalog.js 里写死的 5 个点、不跟随时间范围。
(function () {
  "use strict";

  function requireEcharts() {
    if (!window.echarts) throw new Error("ECharts 未加载，请检查 vendor/echarts.min.js");
    return window.echarts;
  }

  // ========================================================================
  // Charts —— 持久化槽位注册表（本文件唯一的 API）。
  // ========================================================================

  // slots: id -> 持久存活的 <div class="chart-box"> 节点（只创建一次，之后一直复用）。
  var slots = {};
  // instances: id -> ECharts 实例（挂在 slots[id] 上，同样只 init 一次）。
  var instances = {};
  // pending: id -> 本轮待绘的 option；pendingOrder 记录本轮 draw() 的调用顺序，
  // 保证 flush() 按 draw() 的顺序而不是 Object.keys 的任意顺序去 setOption。
  var pending = {};
  var pendingOrder = [];
  var flushScheduled = false;
  var drawCalls = 0;

  var resizeObserver = null;

  // 单个 ResizeObserver 驱动所有图表：不要每个 chart-box 各挂一个 observer。
  // 任意一个被观察的容器尺寸变化，就把当前所有实例统一 resize 一遍——图表数量
  // 就几个，全量 resize 的成本可以忽略，换来的是只需要维护一个 observer 实例。
  function ensureResizeObserver() {
    if (!resizeObserver) resizeObserver = new ResizeObserver(resizeAll);
    return resizeObserver;
  }

  // 返回跨渲染持久存活的 <div class="chart-box" id="..."> 节点。
  //
  // 持久化机制：节点只在首次调用时用 document.createElement 创建一次，此后一直存在
  // slots[id] 里，不会被销毁。每次调用都会先把它从当前的父节点上摘下来
  // （parentNode.removeChild），再返回给调用方——调用方（场景层的 h() 树）随后会把
  // 它 appendChild 到新一轮渲染的 DOM 位置。这正是 scripts/pump3d/engine.js 的
  // detach()（canvas.parentNode.removeChild(canvas)）之后由 mount() 重新
  // insertBefore 的同一套“摘下来再插回去”节奏，只是这里的“摘”和“插”分别发生在
  // slot() 和调用方的 h()/appendChild 里，而不是像 3D 引擎那样有独立的 detach() 函数
  // ——图表容器没有 pointer capture 之类必须显式清理的中间态，不需要额外那一步。
  // 节点一旦创建，其内部的 ECharts 实例（canvas/tooltip 等 DOM）完全不受影响：
  // stage.innerHTML="" 清空的是 stage 的子树，而 slots[id] 在那之前已经被摘下来，
  // JS 侧仍持有引用，不会被当成不可达对象回收。
  function slot(id) {
    var node = slots[id];
    if (!node) {
      node = document.createElement("div");
      node.className = "chart-box";
      node.id = id;
      slots[id] = node;
      // 新建的节点交给单一 ResizeObserver 观察一次；observe() 对同一节点重复调用是
      // 安全的幂等操作，但这里放在“只创建一次”的分支里更直接地体现只注册一次的意图。
      ensureResizeObserver().observe(node);
    } else if (node.parentNode) {
      node.parentNode.removeChild(node);
    }
    return node;
  }

  // 把 option 排进待绘队列。容器必须已经通过 slot(id) 创建过，否则抛错——
  // 没有兜底：调用顺序错了（先 draw 后 slot，或 id 写错）要在这里立刻炸出来。
  // 同一轮 render 里对同一个 id 重复 draw() 同样抛错：那意味着两段场景代码都想
  // 画同一张图，属于调用方的逻辑错误，而不是"后一次覆盖前一次"这种可以静默接受的情况。
  // 由 boot.js 在每次 render() 开头调用，标记"新的一轮 render 开始了"。
  //
  // 必须显式划这条边界，不能靠 flush() 的 rAF 回调顺带清空 pending：那样"一轮"实际
  // 变成"到下一个 rAF 为止"。两次 render 落在同一个 rAF 窗口内（软件渲染只有 3fps 时
  // rAF 间隔约 330ms，连续点两下就会这样；真实 GPU 上快速连点同样可能）就会被
  // draw() 的重复 id 守卫误判成"同一轮画了两次"，render 中途抛错、DOM 不更新，
  // 表现为"点了热点但卡片选中态没变"——这个 bug 就是这么来的。
  //
  // 直接丢弃上一轮尚未 flush 的队列是正确的：DOM 已经被 stage.innerHTML="" 整体重建，
  // 上一轮的 option 已经过期，画出来也是错的。
  function beginPass() {
    pending = {};
    pendingOrder = [];
  }

  function draw(id, option) {
    if (!slots[id]) throw new Error("Missing chart slot: " + id + "，请先调用 Charts.slot(id) 创建容器");
    if (Object.prototype.hasOwnProperty.call(pending, id)) {
      throw new Error("重复的图表 id：" + id + "，同一轮 render 里只能 draw 一次");
    }
    pending[id] = option;
    pendingOrder.push(id);
  }

  // 在下一个 rAF 里批量处理本轮所有 draw() 排队的 option：容器缺失实例时先
  // init，再 setOption(option, true)（notMerge=true，整份替换而不是合并残留的旧配置）。
  // 同一个宏任务里多次调用 flush() 只会排一次 rAF（flushScheduled 闩锁），
  // 这样场景层可以在构建每张图的 option 之后各自调用一次 flush()，不需要自己攒队列。
  function flush() {
    if (flushScheduled) return;
    flushScheduled = true;
    window.requestAnimationFrame(function () {
      flushScheduled = false;
      var order = pendingOrder;
      var queue = pending;
      pendingOrder = [];
      pending = {};
      order.forEach(function (id) {
        var node = slots[id];
        if (!node) throw new Error("Missing chart slot: " + id + "（flush 时容器已丢失）");
        if (!instances[id]) instances[id] = requireEcharts().init(node, null, { renderer: "canvas" });
        instances[id].setOption(queue[id], true);
        drawCalls += 1;
      });
    });
  }

  // 把当前所有持久化实例统一 resize 一遍；同时是单个 ResizeObserver 的回调本体。
  function resizeAll() {
    Object.keys(instances).forEach(function (id) {
      instances[id].resize();
    });
  }

  // 仅"重置演示"调用：销毁全部实例、把槽位节点从 DOM 上摘下并清空注册表，
  // 回到与刚加载页面时等价的初始状态。
  function disposeAll() {
    Object.keys(instances).forEach(function (id) {
      instances[id].dispose();
    });
    instances = {};
    Object.keys(slots).forEach(function (id) {
      var node = slots[id];
      if (resizeObserver) resizeObserver.unobserve(node);
      if (node.parentNode) node.parentNode.removeChild(node);
    });
    slots = {};
    pending = {};
    pendingOrder = [];
    drawCalls = 0;
  }

  function debugInfo() {
    return {
      instances: Object.keys(instances).length,
      slots: Object.keys(slots).length,
      drawCalls: drawCalls
    };
  }

  window.Charts = {
    slot: slot,
    beginPass: beginPass,
    draw: draw,
    flush: flush,
    resizeAll: resizeAll,
    disposeAll: disposeAll,
    debugInfo: debugInfo
  };
})();
