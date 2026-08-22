// 引导层（L7，最后一个加载的文件）：全局存在性断言 + render 管线 + 事件委托 + 启动。
//
// 【POC：hunan-overview-v2】改写自旧目录 scripts/boot.js。状态机与 render 管线的
// 骨架逐条保留，四处减法：
//
//   1) state 去掉 siteId。旧场景右栏有「站点清单 + 站点详情卡」两块，siteId 驱动详情
//      卡。详情卡已删（理由见 scripts/scenes/overview.js 文件头），下钻态的站点清单
//      改成只读表（理由见 styles/03-cards.css 第三节），没有任何东西再消费 siteId。
//      selectSite() 随之整体删除。
//   2) 不再断言/加载 SelectList、DetailCard、Overlay 三个 ui 模块——本 POC 没有渲染
//      路径调用它们。Charts.beginPass() 旁边那句 SelectList.resetRenderPass() 也随之
//      删除（那是 SelectList 的「一轮 render」边界，没有 SelectList 就没有这个边界）。
//   3) 不再 append 底栏。旧 render() 是 topbar + stage + bottombar 三段，现在两段。
//   4) 事件委托去掉 data-select 分支。旧版有 zone-rank / site-list 两个 SelectList 的
//      name，以及 crumb-province 面包屑。作业区下钻现在只有一个入口——地图上的
//      [data-hunan-zone] 标签；返回全省只有一个入口——地图右下角的
//      data-action="back-to-overview"。同一个动作不再有两条并行路径。
//
// 状态：{ zoneId, dateRangeId, customRangeId, customRangeOpen }，selectZone 是 zoneId
// 唯一的写入口。zoneId == null 代表省域视图。不做 localStorage 持久化——单场景 demo，
// 刷新回到省域视图是可接受的行为。
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
  assertGlobal("HunanInspectionQuality", window.HunanInspectionQuality);
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
  assertGlobal("OverviewScene", window.OverviewScene);

  // 在 poc/inspection-demo/index.html 的 iframe 外壳里运行时，外壳会广播当前哪个
  // 组件可见——不可见时让 3D 引擎停掉渲染循环。
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

  // 启动期一次性断言：数据层的 id 空间 / 站点形状 / 作业区-市映射。
  Contract.assertData({
    zoneDistrictMap: Sites.zoneDistricts,
    allSites: Sites.sites,
    sitesByZone: Sites.sitesByZone
  });

  var state = {
    zoneId: null,
    dateRangeId: "7d",
    customRangeId: "risk-recheck",
    customRangeOpen: false
  };

  // ==========================================================================
  // render 管线
  // ==========================================================================

  function renderStage() {
    return h("main", { id: "stage", class: "stage", tabindex: "-1" }, [
      h("div", { class: "overview-scene" }, [
        window.OverviewScene.renderLeftColumn(state),
        window.OverviewScene.renderMapPanel(state),
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
    var hosts = root.querySelectorAll("[" + Contract.HOST_ATTR + "]");
    if (hosts.length !== 1) {
      throw new Error("页面中 [" + Contract.HOST_ATTR + "] 元素应恰好 1 个，实际 " + hosts.length + " 个");
    }
    var host = hosts[0];
    if (!root.contains(host)) throw new Error("mountMap3D 必须在 3D 宿主 append 到页面之后调用");

    // 两级钻取：省域 / 作业区。activeSiteId 恒为 null——本屏没有站点级选中态
    // （见文件头减法 1），也不推第三级相机。
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

  function render() {
    window.Charts.beginPass();
    window.SceneTimers.clearAll();
    window.HunanMap3D.detach();

    root.innerHTML = "";
    root.appendChild(window.OverviewScene.renderTopbar(state));
    root.appendChild(renderStage());

    bindStage();

    mountChartSlots();
    mountMap3D();
    window.OverviewScene.renderCharts(state);
    window.Charts.flush();

    Contract.assertPinNamespace();
  }

  // 只重绘顶栏：自定义日期菜单的开合不该让 3D 引擎 detach + 重新 mount 一遍
  // （那会重建相机状态、丢掉用户当前的视角）。
  function renderTopbarOnly() {
    var currentTopbar = root.querySelector(".topbar");
    if (!currentTopbar) throw new Error("renderTopbarOnly 要求页面已存在 .topbar");
    root.replaceChild(window.OverviewScene.renderTopbar(state), currentTopbar);
  }

  // ==========================================================================
  // 状态写入口
  // ==========================================================================

  function selectZone(zoneId) {
    if (zoneId != null && Contract.ZONE_IDS.indexOf(zoneId) < 0) {
      throw new Error("selectZone 收到非法 zoneId：" + zoneId);
    }
    state.customRangeOpen = false;
    state.zoneId = zoneId;
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
  // 事件委托
  // ==========================================================================

  function handleAction(action, sourceEl) {
    if (action === "set-date-range") { selectDateRange(sourceEl.getAttribute("data-date-range")); return; }
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

    // 作业区下钻的唯一入口：地图上的作业区标签。
    var zonePinEl = target.closest("[" + Contract.ZONE_PIN_ATTR + "]");
    if (zonePinEl) { selectZone(zonePinEl.getAttribute(Contract.ZONE_PIN_ATTR)); return; }
  }

  function bindStage() {
    if (isStageBound) return;
    root.addEventListener("click", handleClick);
    isStageBound = true;
  }

  render();
})();
