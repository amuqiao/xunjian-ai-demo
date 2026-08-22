// L7 引导：存在性断言 → render 管线 → 事件委托 → 状态写入口。
//
// 【POC：pump-station-situation-v2】骨架照 poc/inspection-demo/inspection-station-v2/
// scripts/boot.js，改动三处：
//   1) 依赖换成泵的四个全局（Pump3DContract / PumpLedger / PumpState / PumpMeasure）
//   2) 状态从 { focus:{areaId}, pick:{itemId} } 收窄成 { partId } —— 本屏没有"逐项读数"
//      那一层，测点明细表是只读的，点行不改任何状态（值来自检测报告，不是可编辑表单）
//   3) 3D 挂载走 Pump3D.mount(host, { preset, activeId, statuses }) 的契约
//
// 状态：{ partId }。partId == null 代表机组总览。selectPart 是唯一写入口。
// 不做 localStorage 持久化 —— 单场景 demo，刷新回到总览是对的。
(function () {
  "use strict";

  function assertGlobal(name, value) {
    if (!value) {
      throw new Error("缺少全局依赖 " + name + "，请检查 index.html 的 <script> 加载顺序");
    }
  }

  assertGlobal("THREE", window.THREE);
  assertGlobal("echarts", window.echarts);
  assertGlobal("Pump3DContract", window.Pump3DContract);
  assertGlobal("Pump3DModel", window.Pump3DModel);
  assertGlobal("Pump3D", window.Pump3D);
  assertGlobal("PumpLedger", window.PumpLedger);
  assertGlobal("PumpState", window.PumpState);
  assertGlobal("PumpMeasure", window.PumpMeasure);
  assertGlobal("h", window.h);
  assertGlobal("append", window.append);
  assertGlobal("Charts", window.Charts);
  assertGlobal("SceneTimers", window.SceneTimers);
  // scripts/core/screen-scale.js 是纯自执行 IIFE，没有导出任何 window.* 对象。
  assertGlobal("ChartOptions", window.ChartOptions);
  assertGlobal("Cards", window.Cards);
  assertGlobal("StationScene", window.StationScene);

  // 在 poc/beng-demo/index.html 的 iframe 外壳里运行时，外壳广播当前哪个组件可见 ——
  // 不可见时让 3D 引擎停掉渲染循环。两个外壳的消息名不同，都收。
  window.addEventListener("message", function (event) {
    var data = event.data;
    if (!data) return;
    if (data.type !== "beng-demo:visibility" && data.type !== "inspection-demo:visibility") return;
    window.Pump3D.setShellActive(!!data.active);
  });

  var C = window.Pump3DContract;
  var M = window.PumpMeasure;

  var root = document.getElementById("appRoot");
  if (!root) throw new Error("缺少挂载点 #appRoot，请检查 index.html");
  var isStageBound = false;

  // 【为什么不调 C.assertData()】它内部读 window.DemoData.parts()，那是旧目录
  // scripts/data/catalog.js 的数据层 —— 本 POC 刻意不加载那一层（它带着 6 步流程、
  // 知识库、Agent 语料一整套诊断台的数据）。它真正检查的两件事已经搬进
  // scripts/data/measure.js 的 assertMapping()，而且更严：原版只查部位 id 集合，
  // 那边连顺序一起查。加载 measure.js 时就跑完了，所以这里没有对应的调用。
  //
  // 3D 侧的检查一条没少：engine.js 的 mount() 里会调 Pump3DContract.assertDom()
  // （宿主唯一、labels 容器存在、[data-part] 恰好 6 个且 id 集合正确、宿主盒非零），
  // render() 末尾还有 assertPinNamespace()。

  var state = { partId: null };

  // ==========================================================================
  // render 管线
  // ==========================================================================

  function renderStage() {
    return h("main", { id: "stage", class: "stage", tabindex: "-1" }, [
      h("div", { class: "station-scene" }, [
        window.StationScene.renderLeftColumn(state),
        window.StationScene.renderMapPanel(state),
        window.StationScene.renderRightColumn(state)
      ])
    ]);
  }

  function mountChartSlots() {
    document.querySelectorAll("[data-chart-slot]").forEach(function (placeholder) {
      var id = placeholder.dataset.chartSlot;
      placeholder.appendChild(window.Charts.slot(id));
    });
  }

  function mountPump3D() {
    var hosts = root.querySelectorAll("[" + C.HOST_ATTR + "]");
    if (hosts.length !== 1) {
      throw new Error("页面中 [" + C.HOST_ATTR + "] 元素应恰好 1 个，实际 " + hosts.length + " 个");
    }
    var host = hosts[0];
    if (!root.contains(host)) throw new Error("mountPump3D 必须在 3D 宿主 append 到页面之后调用");

    // preset 恒为 "station"：另一个预设 "dashboard" 是旧目录首屏用的远景机位，
    // 本屏只有一个场景，没有切换预设的路径。engine.js 里只在 preset 变化时才重放
    // 镜头动画，所以恒定 preset 意味着用户拖到的角度在点部位卡之后不会被打回预设机位。
    window.Pump3D.mount(host, {
      preset: "station",
      activeId: state.partId,
      statuses: M.statuses()
    });
  }

  function render() {
    window.Charts.beginPass();
    window.SceneTimers.clearAll();
    window.Pump3D.detach();

    root.innerHTML = "";
    // 四段的 append 顺序必须与 .app-shell 的 grid-template-rows 一致：
    // auto（顶栏）/ 104px（指标带）/ 1fr（中段三栏）/ 132px（部位带）。
    root.appendChild(window.StationScene.renderTopbar());
    root.appendChild(window.StationScene.renderStatBand());
    root.appendChild(renderStage());
    root.appendChild(window.StationScene.renderPartBand(state));

    bindStage();

    mountChartSlots();
    mountPump3D();
    window.StationScene.renderCharts(state);
    window.Charts.flush();

    // 必须在每次 render 之后调用，不能挪进 assertData()：那个跑在首次 render 之前，
    // 那时 DOM 里还没有任何 [data-part]，检查形同虚设。
    // （部位带的卡片用的是 data-part-id，属性名不同，不会被 [data-part] 选中 ——
    //   这是刻意的：data-part 归 3D 热点独占，复用它会让 engine 的 buildLabelMap
    //   把非 3D 元素收进 labelEls，3D 标签会同时消失且不报错。）
    C.assertPinNamespace();
  }

  // ==========================================================================
  // 状态写入口
  // ==========================================================================

  function selectPart(partId) {
    if (partId != null && C.PART_IDS.indexOf(partId) < 0) {
      throw new Error("selectPart 收到非法 partId：" + partId);
    }
    // 再点一次当前已选中的部位 = 回到机组总览。部位卡是 aria-pressed 的开关型按钮，
    // 按下去再按一次弹回来是它的自然预期；3D 上点同一个部位标签也走这条路。
    state.partId = (partId != null && partId === state.partId) ? null : partId;
    render();
  }

  // ==========================================================================
  // 事件委托
  // ==========================================================================

  function handleAction(action, sourceEl) {
    if (action === "select-part") { selectPart(sourceEl.getAttribute("data-part-id")); return; }
    if (action === "clear-part") { selectPart(null); return; }
    if (action === "reset-view") {
      // Pump3D 没有导出 resetView()，重置视角的办法是重挂一次（detach + mount 会
      // 走 applyPreset）。这里刻意通过整轮 render 走，不去 engine 里加新接口。
      state.partId = null;
      render();
      return;
    }
    throw new Error("未知的 data-action：" + action);
  }

  function handleClick(event) {
    var target = event.target;
    if (!(target instanceof Element)) return;

    var actionEl = target.closest("[data-action]");
    if (actionEl) {
      if (actionEl.hasAttribute("disabled")) return;
      handleAction(actionEl.getAttribute("data-action"), actionEl);
      return;
    }

    // 部位下钻的第二个入口：3D 上的部位热点标签（第一个是部位带的卡片，走上面
    // handleAction 的 select-part 分支）。
    var pinEl = target.closest("[" + C.PIN_ATTR + "]");
    if (pinEl) { selectPart(pinEl.getAttribute(C.PIN_ATTR)); return; }

    // 测点明细表的行是**只读**的：值来自 2025-04-08 的现场检测报告，不是可编辑表单。
    // 所以点行不改任何状态，也不做"当前正在读哪一行"的标记 —— 25 行不长，不需要。
  }

  function handleKeydown(event) {
    if (event.key !== "Escape") return;
    if (state.partId == null) return;
    selectPart(null);
  }

  function bindStage() {
    if (isStageBound) return;
    root.addEventListener("click", handleClick);
    document.addEventListener("keydown", handleKeydown);
    isStageBound = true;
  }

  render();
})();
