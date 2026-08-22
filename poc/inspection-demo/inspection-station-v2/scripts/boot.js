// 引导层（L7，最后一个加载的文件）：全局存在性断言 + render 管线 + 事件委托 + 启动。
//
// 【POC：inspection-station-v2】改写自原目录 scripts/boot.js（513 行）。骨架保留
// （render 管线的六步顺序、事件委托规则、3D detach/mount 节奏），五处减法：
//
//   1) 不用 scripts/core/state.js。那份状态机带 localStorage 持久化、flowVisited
//      （6 步流程轨的访问记录）、overlay（弹层种类）、showTrack（轨迹开关）四样东西，
//      而本页把流程轨、弹层、轨迹开关都删了，持久化对单场景 demo 也只是增加复杂度
//      （刷新回到全景是可接受的行为）。所以状态就地定义成
//      { focus: { areaId }, pick: { itemId } }，与 hunan-overview-v2 的做法一致。
//   2) 回字形四段：render() 依次 append topbar / statBand / stage / areaBand，对应
//      .app-shell 的四行网格（见 styles/02-shell.css 的 grid-template-rows）。
//      原版是 topbar + stage + flow-rail 三段，流程轨已删。
//   3) 不再断言/加载 SelectList、DetailCard、ActionBar、Overlay、InspectorPickerScene
//      —— 本页没有渲染路径调用它们。Charts.beginPass() 旁边那句
//      SelectList.resetRenderPass() 也随之删除。
//   4) 事件委托去掉 data-select 分支与 data-inspector-name 分支。区域下钻现在有两个
//      入口，都不走 data-select：平面图上的 [data-map3d-area] 热点，以及下边区域带的
//      data-action="select-area" 卡片。后者不能复用 [data-map3d-area] —— contract.js
//      的 assertPinNamespace() 只允许该属性出现在 .map3d-labels 内部。
//   5) 不调 ChartOptions.setTheme()。本目录的 chartopts.js 自己现读 CSS 变量
//      （见那份文件头），少一条 boot 与 chartopts 之间的时序耦合。
//
// 保留的写操作：巡检项的 item-toggle / item-inc / item-dec 三个动作照原样保留 ——
// 那是这份 checklist 真正的交互（现场把某一项的实测值改一下），路演时是有用的动作。
// 它改的是 window.DemoItems 里那条记录的 value（不改 status），与原版行为一致；
// 本版没有持久化，刷新即回到数据层的原始值。
(function () {
  "use strict";

  function assertGlobal(name, value) {
    if (!value) {
      throw new Error("缺少全局依赖 " + name + "，请检查 index.html 的 <script> 加载顺序");
    }
  }

  assertGlobal("THREE", window.THREE);
  assertGlobal("echarts", window.echarts);
  assertGlobal("Map3DContract", window.Map3DContract);
  assertGlobal("Map3DShared", window.Map3DShared);
  assertGlobal("DemoItems", window.DemoItems);
  assertGlobal("DemoStation", window.DemoStation);
  assertGlobal("DemoPlan", window.DemoPlan);
  assertGlobal("DemoTrack", window.DemoTrack);
  assertGlobal("DemoSeries", window.DemoSeries);
  assertGlobal("DemoTask", window.DemoTask);
  assertGlobal("DemoFlow", window.DemoFlow);
  assertGlobal("DemoDataSchema", window.DemoDataSchema);
  assertGlobal("DemoData", window.DemoData);
  assertGlobal("StationQuality", window.StationQuality);
  assertGlobal("Map3DModel", window.Map3DModel);
  assertGlobal("Map3DTrackModel", window.Map3DTrackModel);
  assertGlobal("Map3D", window.Map3D);
  assertGlobal("h", window.h);
  assertGlobal("append", window.append);
  assertGlobal("legendDot", window.legendDot);
  assertGlobal("Charts", window.Charts);
  assertGlobal("SceneTimers", window.SceneTimers);
  // scripts/core/screen-scale.js 是纯自执行 IIFE，没有导出任何 window.* 对象。
  assertGlobal("ChartOptions", window.ChartOptions);
  assertGlobal("Cards", window.Cards);
  assertGlobal("ItemList", window.ItemList);
  assertGlobal("StationScene", window.StationScene);

  // 在 poc/inspection-demo/index.html 的 iframe 外壳里运行时，外壳会广播当前哪个组件
  // 可见 —— 不可见时让 3D 引擎停掉渲染循环。
  window.addEventListener("message", function (event) {
    var data = event.data;
    if (!data || data.type !== "inspection-demo:visibility") return;
    window.Map3D.setShellActive(!!data.active);
  });

  var C = window.Map3DContract;
  var DATA = window.DemoData;

  var root = document.getElementById("appRoot");
  if (!root) throw new Error("缺少挂载点 #appRoot，请检查 index.html");
  var isStageBound = false;

  // ---- 启动期一次性断言：12 区项数契约 + 逐项字段 schema ----
  // （scripts/data/quality.js 自己在加载时就跑完了三条：最后一轮的 planned/issues/p1/
  //   minutes 与真实数据逐条相等、每轮字段合法、本轮明细的逐类条数等于最后一轮的
  //   对应字段。见那份文件的 assertAnchor / assertRounds / assertDetails。）
  C.assertData({ areaItems: function (areaId) { return DATA.items(areaId); } });
  window.DemoDataSchema.assertAll();

  var state = {
    focus: { areaId: null },
    pick: { itemId: null }
  };

  // ==========================================================================
  // render 管线
  // ==========================================================================

  function renderStage() {
    return h("main", { id: "stage", class: "stage", tabindex: "-1" }, [
      h("div", { class: "station-scene" }, [
        window.StationScene.renderLeftColumn(),
        window.StationScene.renderMapPanel(state),
        window.StationScene.renderRightColumn(state),
      ]),
    ]);
  }

  function mountChartSlots() {
    document.querySelectorAll("[data-chart-slot]").forEach(function (placeholder) {
      var id = placeholder.dataset.chartSlot;
      placeholder.appendChild(window.Charts.slot(id));
    });
  }

  function mountMap3D() {
    var hosts = root.querySelectorAll("[" + C.HOST_ATTR + "]");
    if (hosts.length !== 1) {
      throw new Error("页面中 [" + C.HOST_ATTR + "] 元素应恰好 1 个，实际 " + hosts.length + " 个");
    }
    var host = hosts[0];
    if (!root.contains(host)) throw new Error("mountMap3D 必须在 3D 宿主 append 到页面之后调用");

    // showTrack 恒为 true：原版把它做成了 ActionBar 里的一个开关，本页删掉了那条栏，
    // 而轨迹是这份数据里最实的一块（真实 waypoints + 逐区停留分钟），没有理由默认藏起来。
    // 图例第 4 项「巡检轨迹」与它是一对，两者要么都在要么都不在。
    window.Map3D.mount(host, {
      activeAreaId: state.focus.areaId,
      activeItemId: state.pick.itemId,
      statuses: DATA.statuses(),
      progress: DATA.stationProgress(),
      track: DATA.track(),
      showTrack: true
    });
  }

  function render() {
    window.Charts.beginPass();
    window.SceneTimers.clearAll();
    window.Map3D.detach();

    root.innerHTML = "";
    // 四段的 append 顺序必须与 .app-shell 的 grid-template-rows 一致：
    // auto（顶栏）/ 96px（AI 指标带）/ 1fr（中段三栏）/ 132px（区域带）。
    root.appendChild(window.StationScene.renderTopbar());
    root.appendChild(window.StationScene.renderStatBand());
    root.appendChild(renderStage());
    root.appendChild(window.StationScene.renderAreaBand(state));

    bindStage();

    mountChartSlots();
    mountMap3D();
    window.StationScene.renderCharts();
    window.Charts.flush();

    C.assertPinNamespace();
  }

  // ==========================================================================
  // 状态写入口：selectArea / selectItem 是唯二能改 focus/pick 的地方
  // ==========================================================================

  function selectArea(areaId) {
    if (areaId != null && C.AREA_IDS.indexOf(areaId) < 0) {
      throw new Error("selectArea 收到非法 areaId：" + areaId);
    }
    // 再点一次当前已选中的区域 = 回到全站。区域带的卡片是 aria-pressed 的开关型按钮，
    // 按下去再按一次弹回来是它的自然预期；平面图热点点同一个区也走这条路。
    var next = (areaId != null && areaId === state.focus.areaId) ? null : areaId;
    state.focus.areaId = next;
    // 换区（或回全站）必须清掉巡检项选中态：pick.itemId 只在它所属的区域被聚焦时
    // 才有意义，留着会让 ItemList 的 activeId 校验直接抛错（那个 id 不在新的 items 里）。
    state.pick.itemId = null;
    render();
  }

  function selectItem(itemId) {
    if (state.focus.areaId == null) {
      throw new Error("selectItem 要求已经下钻到某个区域（state.focus.areaId 不能为空），itemId=" + itemId);
    }
    // 校验这条项确实属于当前区域，不属于就抛错 —— 不静默忽略。
    DATA.item(state.focus.areaId, itemId);
    state.pick.itemId = itemId;
    render();
  }

  // 巡检项的写操作：只允许改当前聚焦区域内的项。
  function focusedItem(itemId) {
    if (state.focus.areaId == null) {
      throw new Error("修改巡检项要求已经下钻到某个区域，itemId=" + itemId);
    }
    return DATA.item(state.focus.areaId, itemId);
  }

  function toggleItem(itemId) {
    var item = focusedItem(itemId);
    if (item.inputType !== "bool") throw new Error("巡检项 " + itemId + " 不是 bool 型，无法切换开关");
    item.value = !item.value;
    render();
  }

  var NUMBER_STEP = 0.1;

  function stepItem(itemId, direction) {
    var item = focusedItem(itemId);
    if (item.inputType !== "number") throw new Error("巡检项 " + itemId + " 不是 number 型，无法步进");
    var next = item.value + direction * NUMBER_STEP;
    next = Math.min(item.max, Math.max(item.min, next));
    item.value = Math.round(next * 100) / 100;
    render();
  }

  // ==========================================================================
  // 事件委托
  // ==========================================================================

  function handleAction(action, sourceEl) {
    if (action === "select-area") { selectArea(sourceEl.getAttribute("data-area-id")); return; }
    if (action === "back-to-overview") { selectArea(null); return; }
    if (action === "map-zoom-in") { window.Map3D.zoom(-140); return; }
    if (action === "map-zoom-out") { window.Map3D.zoom(140); return; }
    if (action === "reset-view") { window.Map3D.resetView(); return; }
    if (action === "item-toggle") { toggleItem(sourceEl.getAttribute("data-item-id")); return; }
    if (action === "item-inc") { stepItem(sourceEl.getAttribute("data-item-id"), 1); return; }
    if (action === "item-dec") { stepItem(sourceEl.getAttribute("data-item-id"), -1); return; }
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

    // 区域下钻的第二个入口：平面图上的区域热点（第一个是区域带的卡片，走上面
    // handleAction 的 select-area 分支）。
    var hotspotEl = target.closest("[" + C.PIN_ATTR + "]");
    if (hotspotEl) { selectArea(hotspotEl.getAttribute(C.PIN_ATTR)); return; }

    // 巡检项行：点一行只是把它标成当前正在读的那一条（ItemList 的 .active）。
    // 3D 层面没有逐项高亮 —— engine.js 的 setActiveItem 注释写明「256 个巡检点位是
    // InstancedMesh，没有为选中单条项设计 3D 高亮，这是刻意的范围收窄」。所以这里的
    // 选中态是一个阅读标记（67 项的长列表里不丢位置），不假装它会驱动画面。
    var itemRowEl = target.closest(".item-row[data-item-id]");
    if (itemRowEl) { selectItem(itemRowEl.getAttribute("data-item-id")); return; }
  }

  function bindStage() {
    if (isStageBound) return;
    root.addEventListener("click", handleClick);
    isStageBound = true;
  }

  render();
})();
