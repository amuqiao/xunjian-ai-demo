// 引导层：全局存在性断言 + render 管线 + 事件委托 + 启动。加载顺序里最后一个文件
// （L7），可以引用之前任何一层暴露的全局，反过来任何更早的文件都不能引用本文件。
//
// 【POC：hunan-inspection-overview（巡检站总览）】
// 本文件与 poc/hunan-pump-overview/scripts/boot.js 结构逐字节相同（两级钻取的状态
// 机、render 管线、事件委托规则都一样），只有 selectZone 里读取的数据源方法名/
// 场景标题跟随各自 POC 的数据层——两块大屏刻意互不耦合，各持完整副本。
//
// 状态：{ zoneId, siteId }，selectZone/selectSite 是唯二写入口。zoneId==null 代表
// 省域视图；siteId 只在某个作业区被选中时才有意义（省域视图下恒为 null）。不做
// localStorage 持久化——这是单场景 demo，刷新页面回到省域视图是可接受的行为，
// 加一套持久化只会增加复杂度而不增加叙事完整性。
(function () {
  "use strict";

  function assertGlobal(name, value) {
    if (!value) {
      throw new Error("缺少全局依赖 " + name + "，请检查 index.html 的 <script> 加载顺序");
    }
  }

  assertGlobal("THREE", window.THREE);
  assertGlobal("echarts", window.echarts);
  assertGlobal("HunanContract", window.HunanContract);
  assertGlobal("HunanGeo", window.HunanGeo);
  assertGlobal("HunanSites", window.HunanSites);
  assertGlobal("HunanSeries", window.HunanSeries);
  assertGlobal("HunanModelMap", window.HunanModelMap);
  assertGlobal("HunanModelSites", window.HunanModelSites);
  assertGlobal("HunanModelPipelines", window.HunanModelPipelines);
  assertGlobal("HunanMapModel", window.HunanMapModel);
  assertGlobal("HunanMap3D", window.HunanMap3D);
  assertGlobal("h", window.h);
  assertGlobal("append", window.append);
  assertGlobal("Charts", window.Charts);
  assertGlobal("SceneTimers", window.SceneTimers);
  // scripts/core/screen-scale.js 是纯自执行 IIFE，没有导出任何 window.* 对象。
  assertGlobal("ChartOptions", window.ChartOptions);
  assertGlobal("Cards", window.Cards);
  assertGlobal("SelectList", window.SelectList);
  assertGlobal("DetailCard", window.DetailCard);
  assertGlobal("Overlay", window.Overlay);
  assertGlobal("OverviewScene", window.OverviewScene);

  window.addEventListener("message", function (event) {
    var data = event.data;
    if (!data || data.type !== "inspection-demo:visibility") return;
    window.HunanMap3D.setShellActive(!!data.active);
  });

  var Contract = window.HunanContract;
  var Sites = window.HunanSites;

  var root = document.getElementById("appRoot");
  if (!root) throw new Error("缺少挂载点 #appRoot，请检查 index.html");
  var isStageBound = false;

  // ---- 启动期一次性断言：数据层的 id 空间 / 站点形状 / 作业区-市映射 ----
  Contract.assertData({
    zoneDistrictMap: Sites.zoneDistricts,
    allSites: Sites.sites,
    sitesByZone: Sites.sitesByZone
  });

  var state = {
    zoneId: null,
    siteId: null,
    dateRangeId: "7d",
    customRangeId: "risk-recheck",
    customRangeOpen: false
  };

  // ==========================================================================
  // render 管线
  // ==========================================================================

  function render() {
    window.Charts.beginPass();
    window.SelectList.resetRenderPass();
    window.SceneTimers.clearAll();
    window.HunanMap3D.detach();

    root.innerHTML = "";
    root.appendChild(window.OverviewScene.renderTopbar(state));
    root.appendChild(renderStage());
    root.appendChild(window.OverviewScene.renderBottombar(state));

    bindStage();

    mountChartSlots();
    mountMap3D();
    window.OverviewScene.renderCharts(state);
    window.Charts.flush();

    Contract.assertPinNamespace();
  }

  function renderTopbarOnly() {
    var currentTopbar = root.querySelector(".topbar");
    if (!currentTopbar) throw new Error("renderTopbarOnly 要求页面已存在 .topbar");
    root.replaceChild(window.OverviewScene.renderTopbar(state), currentTopbar);
  }

  function renderStage() {
    return h("main", { id: "stage", class: "stage", tabindex: "-1" }, [
      h("div", { class: "overview-scene" }, [
        window.OverviewScene.renderLeftColumn(state),
        window.OverviewScene.renderMapPanel(state),
        window.OverviewScene.renderRightColumn(state),
      ]),
    ]);
  }

  function mountChartSlots() {
    document.querySelectorAll("[data-chart-slot]").forEach(function (placeholder) {
      var id = placeholder.dataset.chartSlot;
      var node = window.Charts.slot(id);
      placeholder.appendChild(node);
    });
  }

  function mountMap3D() {
    var hosts = root.querySelectorAll("[" + Contract.HOST_ATTR + "]");
    if (hosts.length !== 1) {
      throw new Error("页面中 [" + Contract.HOST_ATTR + "] 元素应恰好 1 个，实际 " + hosts.length + " 个");
    }
    var host = hosts[0];
    if (!root.contains(host)) throw new Error("mountMap3D 必须在 3D 宿主 append 到页面之后调用");

    var level = state.zoneId == null ? "province" : "zone";
    window.HunanMap3D.mount(host, {
      level: level,
      activeZoneId: state.zoneId,
      activeSiteId: null,
      zoneStatuses: Sites.zoneStatuses(),
      geo: window.HunanGeo,
      sites: Sites.sites(),
      pipelines: [],
      showPipelines: false
    });
  }

  // ==========================================================================
  // 状态写入口：selectZone / selectSite 是唯二能改 zoneId/siteId 的地方。
  // ==========================================================================

  function selectZone(zoneId) {
    // "__none__" 是左栏作业区排名表第 0 行"全省视图"与 SelectList 共用的哨兵值，
    // 代表"没有任何具体作业区被选中"——落到 state.zoneId 上必须是 null。这是一条
    // 可见可点的真实表格行（不是隐藏项），用户能直接在列表里找到"返回全省"的入口，
    // 与 3D 面包屑的"‹返回全省"按钮是两条并行、等价的返回路径。
    if (zoneId === "__none__") zoneId = null;
    if (zoneId != null && Contract.ZONE_IDS.indexOf(zoneId) < 0) {
      throw new Error("selectZone 收到非法 zoneId：" + zoneId);
    }
    state.customRangeOpen = false;
    state.zoneId = zoneId;
    if (zoneId == null) {
      state.siteId = null;
    } else {
      // 换作业区后默认选中该区第一个站点（按 seq 排序即数据层原始顺序），保证
      // 右栏站点详情卡一进入下钻态就有内容，不需要额外的"未选中"空状态。
      var firstSite = Sites.sitesByZone(zoneId)[0];
      state.siteId = firstSite ? firstSite.id : null;
    }
    render();
  }

  function selectSite(siteId) {
    if (state.zoneId == null) {
      throw new Error("selectSite 要求已经下钻到某个作业区（state.zoneId 不能为空），siteId=" + siteId);
    }
    var found = Sites.sitesByZone(state.zoneId).filter(function (s) { return s.id === siteId; })[0];
    if (!found) {
      throw new Error("站点 " + siteId + " 不属于当前作业区 " + state.zoneId);
    }
    state.customRangeOpen = false;
    state.siteId = siteId;
    render();
  }

  function selectDateRange(rangeId) {
    if (!window.OverviewScene.isDateRangeId(rangeId)) {
      throw new Error("selectDateRange 收到非法范围：" + rangeId);
    }
    if (rangeId === "custom") {
      throw new Error("自定义范围必须通过 selectCustomDateRange 应用");
    }
    state.dateRangeId = rangeId;
    state.customRangeOpen = false;
    render();
  }

  function toggleCustomDateRangeMenu() {
    state.customRangeOpen = !state.customRangeOpen;
    renderTopbarOnly();
  }

  function selectCustomDateRange(customRangeId) {
    if (!window.OverviewScene.isCustomDateRangeId(customRangeId)) {
      throw new Error("selectCustomDateRange 收到非法范围：" + customRangeId);
    }
    state.dateRangeId = "custom";
    state.customRangeId = customRangeId;
    state.customRangeOpen = false;
    render();
  }

  // ==========================================================================
  // 事件委托（bindStage）
  // ==========================================================================

  function handleAction(action, sourceEl) {
    if (action === "refresh") { state.customRangeOpen = false; render(); return; }
    if (action === "set-date-range") {
      selectDateRange(sourceEl.getAttribute("data-date-range"));
      return;
    }
    if (action === "toggle-custom-date-menu") { toggleCustomDateRangeMenu(); return; }
    if (action === "set-custom-date-range") { selectCustomDateRange(sourceEl.getAttribute("data-custom-range")); return; }
    if (action === "back-to-overview") { selectZone(null); return; }
    if (action === "map-zoom-in") { window.HunanMap3D.zoom(-140); return; }
    if (action === "map-zoom-out") { window.HunanMap3D.zoom(140); return; }
    if (action === "reset-view") { window.HunanMap3D.resetView(); return; }
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

    var zonePinEl = target.closest("[" + Contract.ZONE_PIN_ATTR + "]");
    if (zonePinEl) { selectZone(zonePinEl.getAttribute(Contract.ZONE_PIN_ATTR)); return; }

    var crumbEl = target.closest("[data-select='crumb-province']");
    if (crumbEl) { selectZone(null); return; }

    var selectEl = target.closest("[data-select][data-select-id]");
    if (selectEl) {
      var name = selectEl.getAttribute("data-select");
      var id = selectEl.getAttribute("data-select-id");
      if (name === "zone-rank") { selectZone(id); return; }
      if (name === "site-list") { selectSite(id); return; }
      throw new Error("未知的 data-select：" + name);
    }
  }

  function bindStage() {
    if (isStageBound) return;
    root.addEventListener("click", handleClick);
    isStageBound = true;
  }

  render();
})();
