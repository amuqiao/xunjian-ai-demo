// ECharts 持久化槽位注册表。移植自 pump-demo scripts/core/charts.js，机制未改。
//
// Charts.slot(id) 返回一个**跨渲染存活**的 <div class="chart-box"> 节点，场景在构建
// DOM 树时把它当子节点插进去；Charts.draw(id, option) 把 option 排进待绘队列；
// Charts.flush() 在下一个 rAF 里批量 init（缺失时）+ setOption(option, true)。
//
// 为什么要持久化而不是每轮 dispose + init：stage.innerHTML = "" 每轮都会整体重建
// DOM，图表实例如果跟着重建，切一次时间范围就要重新 init 三四个 ECharts 实例，
// 而且会丢掉动画状态。slot() 的做法是"每次调用先把节点从当前父节点上摘下来再返回"，
// 调用方随后把它 appendChild 到新一轮的位置——节点和实例始终是同一个。
//
// beginPass() 必须显式划边界，不能靠 flush() 的 rAF 回调顺带清空 pending：那样"一轮"
// 实际变成"到下一个 rAF 为止"。两次 render 落在同一个 rAF 窗口内（连续快速点击就会
// 这样）会被 draw() 的重复 id 守卫误判成"同一轮画了两次"，render 中途抛错、DOM 不
// 更新，表现为"点了但界面没变"。
(function () {
  "use strict";

  function requireEcharts() {
    if (!window.echarts) throw new Error("ECharts 未加载，请检查 vendor/echarts.min.js");
    return window.echarts;
  }

  var slots = {};
  var instances = {};
  var pending = {};
  var pendingOrder = [];
  var flushScheduled = false;
  var drawCalls = 0;
  var resizeObserver = null;

  // 单个 ResizeObserver 驱动所有图表：不要每个 chart-box 各挂一个。图表就几张，
  // 全量 resize 的成本可以忽略，换来的是只需要维护一个 observer。
  function ensureResizeObserver() {
    if (!resizeObserver) resizeObserver = new ResizeObserver(resizeAll);
    return resizeObserver;
  }

  function slot(id) {
    var node = slots[id];
    if (!node) {
      node = document.createElement("div");
      node.className = "chart-box";
      node.id = id;
      slots[id] = node;
      ensureResizeObserver().observe(node);
    } else if (node.parentNode) {
      node.parentNode.removeChild(node);
    }
    return node;
  }

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

  function resizeAll() {
    Object.keys(instances).forEach(function (id) { instances[id].resize(); });
  }

  // 仅"重置演示"调用：销毁全部实例、摘掉槽位节点、清空注册表，回到等价于刚加载的状态。
  function disposeAll() {
    Object.keys(instances).forEach(function (id) { instances[id].dispose(); });
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
