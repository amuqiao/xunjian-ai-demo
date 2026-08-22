// ECharts 实例注册表：window.Charts。
//
// slot(id) 返回一个**跨渲染存活**的宿主节点，场景层把它当子节点插进 DOM 树；
// draw(id, option) 排进待绘队列；flush() 在下一个 rAF 里批量 init + setOption。
// 这样同一个 id 的实例不用每次 render 都 dispose 再 init。
//
// 为什么必须"先进 DOM 再 draw"：ECharts 要量宿主的尺寸才能定画布大小。反过来会静默
// 画出一张 0 高度的空图，不报错 —— 所以 boot.js 的 render() 里图表分两段，
// 场景渲染只挂槽位、数据在 append 之后统一 draw。
(function () {
  "use strict";

  var slots = {};
  var instances = {};
  var pending = {};
  var order = [];
  var flushScheduled = false;
  var resizeObserver = null;

  function requireEcharts() {
    if (!window.echarts) throw new Error("[Charts] ECharts 未加载，请检查 vendor 路径");
    return window.echarts;
  }

  // 单个 ResizeObserver 驱动所有图表 —— 不给每个宿主各挂一个。图表数量就几个，
  // 任意一个尺寸变化时全量 resize 的成本可以忽略。
  function ensureObserver() {
    if (!resizeObserver) resizeObserver = new ResizeObserver(resizeAll);
    return resizeObserver;
  }

  // 节点只在首次调用时创建，此后一直存在。每次调用先把它从当前父节点摘下来再返回，
  // 调用方随后 append 到新位置 —— 「摘下来再插回去」，实例与其内部 canvas 完全不受
  // stage.innerHTML = "" 影响（JS 侧仍持有引用，不会被当成不可达对象回收）。
  function slot(id) {
    var node = slots[id];
    if (!node) {
      node = document.createElement("div");
      node.className = "chart-box";
      node.id = id;
      node.style.width = "100%";
      node.style.height = "100%";
      node.style.minHeight = "0";
      slots[id] = node;
      ensureObserver().observe(node);
    } else if (node.parentNode) {
      node.parentNode.removeChild(node);
    }
    return node;
  }

  // 每轮 render 开头调用，划清"这一轮"的边界。不靠 flush 的 rAF 顺带清空 ——
  // 那样"一轮"实际变成"到下一个 rAF 为止"，两次 render 落在同一个 rAF 窗口内
  // （连续点两下就会）会被下面的重复 id 守卫误判成"同一轮画了两次"。
  function beginPass() { pending = {}; order = []; }

  function draw(id, option) {
    if (!slots[id]) throw new Error("[Charts] 槽位不存在：" + id + "，请先调用 Charts.slot(id)");
    if (Object.prototype.hasOwnProperty.call(pending, id)) {
      throw new Error("[Charts] 同一轮 render 里重复 draw：" + id);
    }
    pending[id] = option;
    order.push(id);
  }

  function flush() {
    if (flushScheduled) return;
    flushScheduled = true;
    window.requestAnimationFrame(function () {
      flushScheduled = false;
      var ids = order;
      var queue = pending;
      order = [];
      pending = {};
      ids.forEach(function (id) {
        var node = slots[id];
        if (!node) throw new Error("[Charts] flush 时槽位已丢失：" + id);
        var isFirst = !instances[id];
        if (isFirst) instances[id] = requireEcharts().init(node, null, { renderer: "canvas" });
        var option = queue[id];
        // 首次绘制才播 ECharts 自己的入场动画。之后的每次更新都关掉 —— 定时器驱动的
        // 整屏重建（Agent 问答的三点→答案）会连带把图表 setOption 一遍，带动画的话
        // 曲线会重新从左往右画一次，那也是"闪"的一部分。
        // 不改 notMerge：整份替换是对的，不合并上一轮的残留配置。
        if (!isFirst) {
          option = Object.assign({}, option, { animation: false });
        }
        instances[id].setOption(option, true);
      });
    });
  }

  function resizeAll() {
    Object.keys(instances).forEach(function (id) { instances[id].resize(); });
  }

  function debugInfo() {
    return { slots: Object.keys(slots).length, instances: Object.keys(instances).length };
  }

  window.Charts = { slot: slot, beginPass: beginPass, draw: draw, flush: flush, resizeAll: resizeAll, debugInfo: debugInfo };
})();
