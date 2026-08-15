// 引导层：全局存在性断言 + render 管线 + 事件委托 + 启动。是加载顺序里最后一个
// 文件（L7），可以引用之前任何一层暴露的全局（L0 vendor -> L1 契约 -> L2 数据 ->
// L3 3D -> L4 core -> L5 ui -> L6 场景），反过来任何更早的文件都不能引用本文件
// 的东西。参考 beng-ai-demo/poc/pump-demo/scripts/boot.js 的整体结构（render 管线
// 顺序、Focus.remember/restore、selectXxx 系列写入口对"刚发生的真实交互"直接
// 抛错的纪律），按本项目单场景的实际情况做了大幅收窄——没有 setScene/多场景锁、
// 没有 Agent 弹窗，selectArea/selectItem 是仅有的两个状态写入口。
(function () {
  "use strict";

  function assertGlobal(name, value) {
    if (!value) {
      throw new Error("缺少全局依赖 " + name + "，请检查 index.html 的 <script> 加载顺序");
    }
  }

  assertGlobal("echarts", window.echarts);
  assertGlobal("THREE", window.THREE);
  assertGlobal("Map3DContract", window.Map3DContract);
  assertGlobal("Map3DShared", window.Map3DShared);
  assertGlobal("DemoItems", window.DemoItems);
  assertGlobal("DemoStation", window.DemoStation);
  assertGlobal("DemoTrack", window.DemoTrack);
  assertGlobal("DemoSeries", window.DemoSeries);
  assertGlobal("DemoTask", window.DemoTask);
  assertGlobal("DemoFlow", window.DemoFlow);
  assertGlobal("DemoDataSchema", window.DemoDataSchema);
  assertGlobal("DemoData", window.DemoData);
  assertGlobal("Map3DModel", window.Map3DModel);
  assertGlobal("Map3DTrackModel", window.Map3DTrackModel);
  assertGlobal("Map3D", window.Map3D);
  assertGlobal("h", window.h);
  assertGlobal("append", window.append);
  assertGlobal("legendDot", window.legendDot);
  assertGlobal("renderStationMap", window.renderStationMap);
  assertGlobal("Charts", window.Charts);
  assertGlobal("SceneTimers", window.SceneTimers);
  // scripts/core/screen-scale.js 是纯自执行 IIFE，没有导出任何 window.* 对象
  // （只读写 --screen-scale 等 CSS 变量），因此没有对应的存在性断言可写。
  assertGlobal("AppState", window.AppState);
  assertGlobal("ChartOptions", window.ChartOptions);
  assertGlobal("Cards", window.Cards);
  assertGlobal("SelectList", window.SelectList);
  assertGlobal("DetailCard", window.DetailCard);
  assertGlobal("ItemList", window.ItemList);
  assertGlobal("ActionBar", window.ActionBar);
  assertGlobal("Overlay", window.Overlay);
  assertGlobal("MapScene", window.MapScene);
  assertGlobal("AreaPickerScene", window.AreaPickerScene);
  assertGlobal("InspectorPickerScene", window.InspectorPickerScene);
  assertGlobal("IssueReportScene", window.IssueReportScene);

  var DATA = window.DemoData;
  var AppState = window.AppState;
  var C = window.Map3DContract;
  var state = AppState.value;

  var root = document.getElementById("appRoot");
  if (!root) throw new Error("缺少挂载点 #appRoot，请检查 index.html");

  // ---- 启动期一次性断言：数据层 12 区项数契约 + 逐项字段 schema ----
  C.assertData({ areaItems: function (areaId) { return DATA.items(areaId); } });
  window.DemoDataSchema.assertAll();

  // ---- 图表主题：CSS 变量只有一份真源，这里读一次注入 ChartOptions ----
  function readCssTheme() {
    var computed = getComputedStyle(document.documentElement);
    function cssVar(name) {
      var value = computed.getPropertyValue(name).trim();
      if (!value) throw new Error("缺少 CSS 变量 " + name + "，请检查 styles/01-tokens.css");
      return value;
    }
    return {
      ok: cssVar("--status-ok"),
      warn: cssVar("--status-warn"),
      danger: cssVar("--status-danger"),
      cyan: cssVar("--cyan"),
      muted: cssVar("--muted"),
      ink: cssVar("--ink"),
      lineStrong: cssVar("--line-strong")
    };
  }
  window.ChartOptions.setTheme(readCssTheme());

  // ---- 启动期把初始 focus 状态计入流程轨迹（覆盖"持久化状态本来就停在下钻态"
  // 这种非默认的首次加载情形），运行期的推进都在 selectArea/selectItem/
  // openIssueReport 内部各自调用 AppState.markFlowStep()。----
  AppState.markFlowStep(state.focus.areaId == null ? "overview" : "drilldown");
  if (state.pick.itemId != null) AppState.markFlowStep("checklist");

  // ==========================================================================
  // render 管线
  // ==========================================================================

  function render() {
    var focusMark = Focus.remember();

    window.Charts.beginPass();
    window.SelectList.resetRenderPass();
    window.SceneTimers.clearAll();
    window.Map3D.detach();

    root.innerHTML = "";
    root.appendChild(renderHeader());
    root.appendChild(renderStage());
    root.appendChild(renderFlowRail());

    bindStage();

    mountChartSlots();
    mountMap3D();
    window.MapScene.renderCharts(state);
    window.Charts.flush();

    C.assertPinNamespace();
    Focus.restore(focusMark);
  }

  function renderHeader() {
    var phase = state.focus.areaId == null ? "overview" : "drilldown";
    return h("header", { class: "topbar panel" }, [
      h("div", { class: "brand" }, [
        h("div", { class: "brand-mark", "aria-hidden": "true", text: "巡" }),
        h("div", {}, [
          h("h1", { text: "站场 3D 巡检地图" }),
          h("small", { text: DATA.meta().fullName + " · 沙盘视图 · XJ-SANDBOX-202608" }),
        ]),
      ]),
      window.MapScene.renderTaskCard(),
      h("div", { class: "top-status" }, [
        h("div", { text: DATA.task().actualEnd }),
        h("div", { text: DATA.statusLine(phase) }),
      ]),
    ]);
  }

  function renderStage() {
    return h("main", { id: "stage", class: "stage", tabindex: "-1" }, [
      h("div", { class: "map-scene" }, [
        window.MapScene.renderAreaList(state),
        window.MapScene.renderMapPanel(state),
        window.MapScene.renderItemPanel(state),
        window.MapScene.renderBottomRow(),
      ]),
      window.AreaPickerScene.render(state),
      window.InspectorPickerScene.render(state),
      window.IssueReportScene.render(state),
    ]);
  }

  function renderFlowRail() {
    var steps = DATA.flowSteps();
    var activeIndex = computeActiveFlowIndex();
    return h("footer", { class: "flow-rail panel", "aria-label": "巡检闭环流程" }, [
      h("div", { class: "flow-hint", text: "流程步骤 · AI 只组织证据，专家确认后才能归档复用" }),
      h("div", { class: "flow-track" }, steps.map(function (step, index) {
        var visited = state.flowVisited.indexOf(step.key) >= 0;
        var cls = "flow-step";
        if (visited && index !== activeIndex) cls += " done";
        if (index === activeIndex) cls += " active";
        return h("button", {
          type: "button",
          class: cls,
          dataset: { flowStep: step.key, idx: String(index + 1) },
          title: step.hint,
        }, [
          h("strong", { text: step.label }),
          h("small", { text: step.hint }),
        ]);
      })),
    ]);
  }

  function computeActiveFlowIndex() {
    if (state.overlay.kind === "issue-report") return 5;
    if (state.focus.areaId == null) return 1;
    if (state.pick.itemId == null) return 2;
    var item = DATA.item(state.focus.areaId, state.pick.itemId);
    return item.status !== "ok" ? 4 : 3;
  }

  // 通用挂接步骤：把场景层用 Cards.chart/Cards.metric 的 sparkId 渲染出的空
  // [data-chart-slot] 占位容器换成 Charts.slot() 返回的持久化图表节点。
  function mountChartSlots() {
    document.querySelectorAll("[data-chart-slot]").forEach(function (placeholder) {
      var id = placeholder.dataset.chartSlot;
      var node = window.Charts.slot(id);
      var isMiniSlot = placeholder.className.indexOf("card-metric-spark") >= 0;
      if (isMiniSlot && node.className.indexOf("chart-box-mini") < 0) {
        node.className += " chart-box-mini";
      }
      placeholder.appendChild(node);
    });
  }

  function mountMap3D() {
    var hosts = root.querySelectorAll("[" + C.HOST_ATTR + "]");
    if (hosts.length !== 1) {
      throw new Error("页面中 [" + C.HOST_ATTR + "] 元素应恰好 1 个，实际 " + hosts.length + " 个");
    }
    var host = hosts[0];
    if (!root.contains(host)) throw new Error("mountMap3D 必须在 3D 宿主 append 到页面之后调用");
    window.Map3D.mount(host, {
      activeAreaId: state.focus.areaId,
      activeItemId: state.pick.itemId,
      statuses: DATA.statuses(),
      progress: DATA.stationProgress(),
      track: DATA.track(),
      showTrack: state.showTrack
    });
  }

  // ==========================================================================
  // 状态写入口：selectArea / selectItem 是唯二能改 focus/pick 的地方。
  // ==========================================================================

  function selectArea(areaId) {
    // "__none__" 是左栏区域列表第 0 层"全站视图"行（scripts/scenes/map.js 的
    // renderAreaList()）与 SelectList 共用的哨兵值——它代表"没有任何具体区域被
    // 选中"，落到 state.focus.areaId 上必须是 null，不是字符串 "__none__" 本身
    // （DemoStation 的 12 区数据里没有也不该有一个真实的 areaId 叫这个）。这里在
    // selectArea 入口就把哨兵值映射成 null，其余校验/赋值逻辑不用关心这个特殊值
    // 从哪条 DOM 路径进来的（左栏第 0 层行 / 流程轨"站场全景"步 / 「返回全站」按钮
    // 三处都走同一个 selectArea(null) 或 selectArea("__none__")）。
    if (areaId === "__none__") areaId = null;
    if (areaId != null && DATA.areaIds().indexOf(areaId) < 0) {
      throw new Error("selectArea 收到非法 areaId：" + areaId);
    }
    state.focus.areaId = areaId;
    // 换区域（含回到站场全景）之后，旧的 pick.itemId 大概率不属于新区域，
    // 直接清空——不做"猜测新区域里最像的一条"这种兜底，选中态应当显式重来。
    state.pick.itemId = null;
    AppState.markFlowStep(areaId == null ? "overview" : "drilldown");
    AppState.save();
    render();
  }

  function selectItem(itemId) {
    if (!state.focus.areaId) {
      throw new Error("selectItem 要求已经聚焦某个区域（focus.areaId 不能为空），itemId=" + itemId);
    }
    var item = DATA.items(state.focus.areaId).filter(function (it) { return it.id === itemId; })[0];
    if (!item) {
      throw new Error("巡检项 " + itemId + " 不属于当前聚焦区域 " + state.focus.areaId);
    }
    state.pick.itemId = itemId;
    AppState.markFlowStep("checklist");
    if (item.status !== "ok") AppState.markFlowStep("findings");
    AppState.save();
    render();
  }

  // 站场范围内第一条"非正常"的巡检项，用于"问题上报"/流程轨"发现问题"这两处
  // 需要一个明确目标、但用户还没有显式点开某条具体异常项时的默认落点。
  // 优先取当前聚焦区域内的异常项，聚焦区域没有异常项（或站场全景态）时退到
  // 全站第一条——这是显式的优先级规则，不是"猜"。
  function deriveIssueTarget() {
    var issues = DATA.issues();
    if (!issues.length) {
      throw new Error("当前 12 区没有任何异常/待关注的巡检项，无法生成问题上报单");
    }
    if (state.focus.areaId != null) {
      var inArea = issues.filter(function (issue) { return issue.areaId === state.focus.areaId; });
      if (inArea.length) return { areaId: inArea[0].areaId, itemId: inArea[0].itemId };
    }
    return { areaId: issues[0].areaId, itemId: issues[0].itemId };
  }

  // ---- 巡检项读数交互：直接改写 window.DemoItems 里对应条目的 value。
  // 这是本项目里唯一会修改巡检项数据本身（而不是 UI 选中态）的地方；status
  // 保持不变（数据模型没有给出"读数变化应如何重算 status"的公式，见
  // scripts/ui/itemlist.js 顶部注释的量程校验纪律——本层同理不代为发明一套
  // 阈值判定，只改 value，不擅自推导 status）。----

  function findFocusedItem(itemId) {
    if (!state.focus.areaId) throw new Error("没有聚焦的区域，无法操作巡检项 " + itemId);
    var item = DATA.items(state.focus.areaId).filter(function (it) { return it.id === itemId; })[0];
    if (!item) throw new Error("巡检项 " + itemId + " 不属于当前聚焦区域 " + state.focus.areaId);
    return item;
  }

  function toggleItem(itemId) {
    var item = findFocusedItem(itemId);
    if (item.inputType !== "bool") throw new Error("巡检项 " + itemId + " 不是 bool 型，无法切换开关");
    item.value = !item.value;
    AppState.save();
    render();
  }

  var NUMBER_STEP = 0.1;

  function stepItem(itemId, direction) {
    var item = findFocusedItem(itemId);
    if (item.inputType !== "number") throw new Error("巡检项 " + itemId + " 不是 number 型，无法步进");
    var next = item.value + direction * NUMBER_STEP;
    next = Math.min(item.max, Math.max(item.min, next));
    item.value = Math.round(next * 100) / 100;
    AppState.save();
    render();
  }

  // ==========================================================================
  // 弹层：选择区域 / 问题上报
  // ==========================================================================

  function openAreaPicker() {
    state.overlay = { kind: "area-picker", areaId: null, itemId: null, query: "" };
    AppState.save();
    render();
  }

  function openInspectorPicker() {
    state.overlay = { kind: "inspector-picker", areaId: null, itemId: null, query: "" };
    AppState.save();
    render();
  }

  // 「添加人员」弹层选中一位候选人后的写入口：DemoTask.addInspector 已经做了
  // "必须在候选池里 / 不能重复添加"两条校验，这里只负责关掉弹层、落一次持久化、
  // 重渲染让顶栏任务卡的巡检人字段立刻变成逗号分隔的多人格式。
  function addInspectorFromPicker(name) {
    DATA.addInspector(name);
    closeOverlay();
  }

  function openIssueReport() {
    var target = deriveIssueTarget();
    state.overlay = { kind: "issue-report", areaId: target.areaId, itemId: target.itemId, query: "" };
    AppState.markFlowStep("report");
    AppState.save();
    render();
  }

  function closeOverlay() {
    state.overlay = { kind: null, areaId: null, itemId: null, query: "" };
    AppState.save();
    render();
  }

  function selectAreaFromPicker(areaId) {
    state.overlay = { kind: null, areaId: null, itemId: null, query: "" };
    selectArea(areaId);
  }

  // ==========================================================================
  // 流程轨：把 6 个叙事步骤映射到具体的状态变化
  // ==========================================================================

  function openFlowStep(stepKey) {
    if (stepKey === "open-task") { render(); return; }
    if (stepKey === "overview") { selectArea(null); return; }
    if (stepKey === "drilldown") {
      if (state.focus.areaId != null) { render(); return; }
      var withIssue = DATA.areas().filter(function (a) { return a.status !== "ok"; })[0];
      selectArea((withIssue || DATA.areas()[0]).id);
      return;
    }
    if (stepKey === "checklist") {
      if (state.focus.areaId == null) { openFlowStep("drilldown"); return; }
      selectItem(DATA.items(state.focus.areaId)[0].id);
      return;
    }
    if (stepKey === "findings") {
      var target = deriveIssueTarget();
      selectArea(target.areaId);
      selectItem(target.itemId);
      return;
    }
    if (stepKey === "report") { openIssueReport(); return; }
    throw new Error("未知的流程步骤：" + stepKey);
  }

  // ==========================================================================
  // 事件委托（bindStage）
  // ==========================================================================

  function handleAction(action, element) {
    if (action === "add-inspector") return openInspectorPicker();
    if (action === "toggle-track") {
      state.showTrack = !state.showTrack;
      AppState.save();
      render();
      return;
    }
    if (action === "refresh-map") {
      render();
      return;
    }
    if (action === "open-area-picker") return openAreaPicker();
    if (action === "open-issue-report") return openIssueReport();
    if (action === "submit-issue-report") {
      AppState.markFlowStep("report");
      closeOverlay();
      return;
    }
    if (action === "close-overlay") return closeOverlay();
    if (action === "map-zoom-in") { window.Map3D.zoom(-140); return; }
    if (action === "map-zoom-out") { window.Map3D.zoom(140); return; }
    // back-to-overview / reset-view 都不走 render()——与 map-zoom-in/out 同类：它们是
    // 纯 3D 相机交互（重挂宿主、回到 focus.areaId=null 这条状态变化例外，走 selectArea
    // 本身自带的 render()；reset-view 则完全不改任何 state，只是让引擎把当前 preset 的
    // 初始机位再走一遍带动画的过渡），不需要重建整棵 DOM。reset-view 尤其要避免走
    // render()：render() 会先 detach() 再重新 mount()，那条路径会用 mount() 里"同 preset
    // 只 retarget、不重放巡航"的短路逻辑去接管镜头，而不是真的把镜头拉回初始姿态——
    // 这正是 resetView() 需要绕开的短路，走 render() 反而会绕不开它，必须直接调
    // window.Map3D.resetView()。
    if (action === "back-to-overview") return selectArea(null);
    if (action === "reset-view") { window.Map3D.resetView(); return; }
    if (action === "item-toggle") return toggleItem(element.getAttribute("data-item-id"));
    if (action === "item-inc") return stepItem(element.getAttribute("data-item-id"), 1);
    if (action === "item-dec") return stepItem(element.getAttribute("data-item-id"), -1);
    throw new Error("未知的 data-action：" + action);
  }

  function handleClick(event) {
    var target = event.target;
    if (!(target instanceof Element)) return;

    var actionEl = target.closest("[data-action]");
    if (actionEl) { handleAction(actionEl.getAttribute("data-action"), actionEl); return; }

    var hotspotEl = target.closest("[" + C.PIN_ATTR + "]");
    if (hotspotEl) { selectArea(hotspotEl.getAttribute(C.PIN_ATTR)); return; }

    var pickerRowEl = target.closest("[data-area-id]");
    if (pickerRowEl) { selectAreaFromPicker(pickerRowEl.getAttribute("data-area-id")); return; }

    var inspectorRowEl = target.closest("[data-inspector-name]");
    if (inspectorRowEl) { addInspectorFromPicker(inspectorRowEl.getAttribute("data-inspector-name")); return; }

    var selectEl = target.closest("[data-select][data-select-id]");
    if (selectEl) {
      var name = selectEl.getAttribute("data-select");
      if (name !== "area") throw new Error("未知的 data-select：" + name);
      selectArea(selectEl.getAttribute("data-select-id"));
      return;
    }

    var itemRowEl = target.closest(".item-row[data-item-id]");
    if (itemRowEl) { selectItem(itemRowEl.getAttribute("data-item-id")); return; }

    var bannerEl = target.closest(".map-submit-banner");
    if (bannerEl) { openAreaPicker(); return; }
  }

  function bindStage() {
    root.addEventListener("click", handleClick);

    var searchInput = root.querySelector(".area-picker-search-input");
    if (searchInput) {
      searchInput.addEventListener("input", function (event) {
        state.overlay.query = event.target.value;
        AppState.save();
        render();
      });
    }

    root.querySelectorAll("[data-flow-step]").forEach(function (button) {
      button.addEventListener("click", function () { openFlowStep(button.dataset.flowStep); });
    });
  }

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && state.overlay.kind != null) {
      closeOverlay();
      return;
    }
    // .item-row 是 <li>，没有原生的 Enter/Space 激活语义（不同于 SelectList 的
    // <button> 变体）：这里补上桥接，键盘用户才能选中一条巡检项。
    if ((event.key === "Enter" || event.key === " ") &&
        event.target instanceof Element &&
        event.target.classList.contains("item-row")) {
      event.preventDefault();
      selectItem(event.target.getAttribute("data-item-id"));
    }
  });

  // ==========================================================================
  // Focus.remember()/Focus.restore()：render() 每次都 innerHTML="" 整体重建 DOM，
  // 焦点会被浏览器静默丢给 <body>。这里记住"渲染前谁有焦点"，渲染完在新 DOM 里
  // 找回同名节点——覆盖本项目全部会触发 render() 的交互入口种类。
  // ==========================================================================

  var Focus = {
    remember: function () {
      var el = document.activeElement;
      if (!el || !root.contains(el)) return null;
      if (el.classList && el.classList.contains("area-picker-search-input")) {
        return { kind: "search" };
      }
      if (el.hasAttribute("data-select") && el.hasAttribute("data-select-id")) {
        return { kind: "select", select: el.getAttribute("data-select"), selectId: el.getAttribute("data-select-id") };
      }
      if (el.hasAttribute(C.PIN_ATTR)) {
        return { kind: "hotspot", areaId: el.getAttribute(C.PIN_ATTR) };
      }
      if (el.hasAttribute("data-area-id")) {
        return { kind: "picker-row", areaId: el.getAttribute("data-area-id") };
      }
      if (el.hasAttribute("data-inspector-name")) {
        return { kind: "inspector-row", inspectorName: el.getAttribute("data-inspector-name") };
      }
      if (el.classList && el.classList.contains("item-row") && el.hasAttribute("data-item-id")) {
        return { kind: "item-row", itemId: el.getAttribute("data-item-id") };
      }
      if (el.hasAttribute("data-flow-step")) {
        return { kind: "flow-step", stepKey: el.getAttribute("data-flow-step") };
      }
      if (el.hasAttribute("data-action")) {
        return { kind: "action", action: el.getAttribute("data-action"), itemId: el.getAttribute("data-item-id") };
      }
      return null;
    },
    restore: function (mark) {
      if (!mark) return;
      var el = null;
      if (mark.kind === "search") el = root.querySelector(".area-picker-search-input");
      else if (mark.kind === "select") el = root.querySelector("[data-select='" + mark.select + "'][data-select-id='" + mark.selectId + "']");
      else if (mark.kind === "hotspot") el = root.querySelector("[" + C.PIN_ATTR + "='" + mark.areaId + "']");
      else if (mark.kind === "picker-row") el = root.querySelector("[data-area-id='" + mark.areaId + "']");
      else if (mark.kind === "inspector-row") el = root.querySelector("[data-inspector-name='" + mark.inspectorName + "']");
      else if (mark.kind === "item-row") el = root.querySelector(".item-row[data-item-id='" + mark.itemId + "']");
      else if (mark.kind === "flow-step") el = root.querySelector("[data-flow-step='" + mark.stepKey + "']");
      else if (mark.kind === "action") {
        var selector = "[data-action='" + mark.action + "']" + (mark.itemId ? "[data-item-id='" + mark.itemId + "']" : "");
        el = root.querySelector(selector);
      }
      if (el) el.focus();
    }
  };

  render();
})();
