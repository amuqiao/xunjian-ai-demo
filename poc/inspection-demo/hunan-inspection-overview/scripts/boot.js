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
  assertGlobal("HunanTopology", window.HunanTopology);
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
  var Topology = window.HunanTopology;

  var root = document.getElementById("appRoot");
  if (!root) throw new Error("缺少挂载点 #appRoot，请检查 index.html");

  // ---- 启动期一次性断言：数据层的 id 空间 / 站点形状 / 作业区-市映射 ----
  Contract.assertData({
    zoneDistrictMap: Sites.zoneDistricts,
    allSites: Sites.sites,
    sitesByZone: Sites.sitesByZone
  });

  var state = { zoneId: null, siteId: null };

  // ---- 供 model-pipelines.js 消费的管道范围：只取"全部 nodeIds 都落在当前 POC
  // 站点范围内"的管道——A（全量）覆盖 24 条里 22 条非空 nodeIds 的管道；B（成品油
  // 44 站点）只剩 3 条油管道。用"每个 nodeId 是否在当前 sites 集合里"现场判断，
  // 不按 kind 硬编码范围，这样两个 POC 共享同一段逻辑也天然各自算出正确的子集。----
  function pipelinesInScope() {
    var siteIds = {};
    Sites.sites().forEach(function (s) { siteIds[s.id] = true; });
    return Topology.pipelines.filter(function (p) {
      if (!Array.isArray(p.nodeIds) || p.nodeIds.length < 2) return false;
      return p.nodeIds.every(function (id) { return siteIds[id] === true; });
    });
  }

  // ==========================================================================
  // render 管线
  // ==========================================================================

  function render() {
    window.Charts.beginPass();
    window.SelectList.resetRenderPass();
    window.SceneTimers.clearAll();
    window.HunanMap3D.detach();

    root.innerHTML = "";
    root.appendChild(window.OverviewScene.renderTopbar());
    root.appendChild(renderStage());
    root.appendChild(window.OverviewScene.renderBottombar(state));

    bindStage();

    mountChartSlots();
    mountMap3D();
    window.OverviewScene.renderCharts(state);
    window.Charts.flush();

    Contract.assertPinNamespace();
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
    // 管道只在省域态显示，下钻到作业区后强制隐藏——不是外观偏好，是渲染预算的硬
    // 约束：实测点开站点最多的作业区（岳阳，36 站）时 renderCalls 已经到 192
    // （engine.js 的热点池按可见热点数 × 固定开销，站点越多开销越高，这部分不能
    // 从本项目这边省），22 条管道的 Tube 网格再叠上去会到 214，直接击穿 <200
    // 护栏。省域态只需 84（10 个作业区热点的固定开销 + 全部管道），余量充足。
    var showPipelines = level === "province" && state.showPipelines === true;
    window.HunanMap3D.mount(host, {
      level: level,
      activeZoneId: state.zoneId,
      activeSiteId: null,
      zoneStatuses: Sites.zoneStatuses(),
      geo: window.HunanGeo,
      sites: Sites.sites(),
      pipelines: pipelinesInScope(),
      showPipelines: showPipelines
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
    state.siteId = siteId;
    render();
  }

  // ==========================================================================
  // 事件委托（bindStage）
  // ==========================================================================

  function handleAction(action) {
    if (action === "refresh") { render(); return; }
    if (action === "back-to-overview") { selectZone(null); return; }
    if (action === "map-zoom-in") { window.HunanMap3D.zoom(-140); return; }
    if (action === "map-zoom-out") { window.HunanMap3D.zoom(140); return; }
    if (action === "reset-view") { window.HunanMap3D.resetView(); return; }
    if (action === "toggle-pipelines") {
      state.showPipelines = !state.showPipelines;
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
      handleAction(actionEl.getAttribute("data-action"));
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
    root.addEventListener("click", handleClick);
  }

  render();
})();
