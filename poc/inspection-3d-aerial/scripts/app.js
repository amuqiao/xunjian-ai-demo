// 入口：存在性断言 → 渲染骨架 → Map3D.mount() → 事件委托 → 轻量区域信息面板。
//
// ==== 渲染策略：3D 宿主只挂载一次，之后永不重挂载 ====
// 与 poc/inspection-3d-sandbox 的 boot.js（每次交互都 detach()+innerHTML=""+重新
// render() 整棵 DOM）不同，本 POC 的 3D 宿主（.station-map，含 canvas/12 个标签/
// 图例/指北针/比例尺/控制按钮）在 boot() 时渲染一次之后就不再被替换或重新挂载——
// 点击区域热点只调用 Map3D.setActiveArea(id)（引擎内部更新高亮 + 标签 class，
// 不触碰 DOM 树），缩放/轨迹开关只调用 Map3D.zoom()/setTrackVisible()。
// 会被重新渲染的只有右侧「区域信息面板」这一小块——它体量小、重渲染成本低，且
// 不含 canvas，不存在 detach() 时序问题，用声明式重渲染更简单。
// 这个设计选择的直接好处：Map3D.mount() 全程只调用一次，contextCreated 恒为 1，
// 完全不需要 pump-demo/sandbox 那套"detach 必须在 innerHTML='' 之前"的时序纪律
// （见 /Users/admin/Code/beng-ai-demo/poc/pump-demo/scripts/pump3d/README.md 第 5 章）
// ——因为本页面根本不会走到那条路径。
//
// ==== 事件委托 ====
// 全部通过 root 上的一个 click 监听器委托：[data-map3d-area]（3D 热点标签）→
// 选中区域；[data-select-id]（侧栏区域列表行）→ 选中区域；[data-action]（缩放/
// 轨迹开关按钮）→ 对应 Map3D API 调用。不在组件渲染函数里单独 addEventListener
// 改状态。
(function () {
  "use strict";

  var state = {
    activeAreaId: null,
    trackVisible: true
  };

  var root = null;
  var mapSlot = null;
  var panelSlot = null;

  function requireGlobal(name) {
    if (!window[name]) {
      throw new Error("[app] window." + name + " 未加载，请检查 index.html 的 <script> 加载顺序");
    }
    return window[name];
  }

  function assertBootGlobals() {
    requireGlobal("THREE");
    requireGlobal("Map3DContract");
    requireGlobal("Map3DShared");
    requireGlobal("DemoStation");
    requireGlobal("DemoTrack");
    requireGlobal("DemoItems");
    requireGlobal("Map3DAerial");
    requireGlobal("Map3DTrack");
    requireGlobal("Map3D");
    requireGlobal("h");
    requireGlobal("renderMapHost");
  }

  // 数据层入口断言：首次渲染之前调用一次，校验 12 区巡检项数与 AREA_ITEM_COUNTS/
  // TOTAL_ITEMS 完全一致（见 Map3DContract.assertData 的注释）。
  function assertStationData() {
    window.Map3DContract.assertData({
      areaItems: function (areaId) { return window.DemoItems[areaId]; }
    });
  }

  function statuses() {
    return window.DemoStation.statuses();
  }

  // ---------------------------------------------------------------------
  // 区域信息面板：会被重新渲染的唯一部分。
  // ---------------------------------------------------------------------

  function kindLabel(kind) {
    if (kind === "process") return "工艺设备区";
    if (kind === "room") return "室内房间";
    if (kind === "boundary") return "边界/敞开设施";
    throw new Error("[app] 未知的区域 kind：" + kind);
  }

  function renderAreaRow(area, progress, isActive) {
    return window.h("li", {}, [
      window.h("button", {
        type: "button",
        class: "area-row" + (isActive ? " active" : ""),
        dataset: { selectId: area.id },
        "aria-pressed": isActive ? "true" : "false"
      }, [
        window.h("i", { class: "dot " + area.status, "aria-hidden": "true" }),
        window.h("span", { class: "area-row-name", text: area.name }),
        window.h("span", { class: "area-row-count", text: progress.done + "/" + progress.total }),
        area.issueCount > 0
          ? window.h("span", { class: "area-row-issue", text: area.issueCount + " 项异常" })
          : window.h("span", { class: "area-row-ok", text: "正常" })
      ])
    ]);
  }

  function renderAreaDetail(area, progress) {
    return window.h("div", { class: "area-detail" }, [
      window.h("div", { class: "area-detail-head" }, [
        window.h("i", { class: "dot " + area.status, "aria-hidden": "true" }),
        window.h("h4", { text: area.name }),
        window.h("span", { class: "area-detail-kind", text: kindLabel(area.kind) })
      ]),
      window.h("div", { class: "area-detail-stats" }, [
        window.h("div", { class: "area-detail-stat" }, [
          window.h("span", { class: "area-detail-stat-value", text: String(progress.done) + "/" + String(progress.total) }),
          window.h("span", { class: "area-detail-stat-label", text: "已提交/总项数" })
        ]),
        window.h("div", { class: "area-detail-stat" + (area.issueCount > 0 ? " warn" : "") }, [
          window.h("span", { class: "area-detail-stat-value", text: String(area.issueCount) }),
          window.h("span", { class: "area-detail-stat-label", text: "AI 复检发现问题" })
        ])
      ]),
      window.h("p", { class: "area-detail-summary", text: area.summary }),
      window.h("ul", { class: "area-detail-evidence" }, area.evidence.map(function (line) {
        return window.h("li", { text: line });
      })),
      window.h("div", { class: "area-detail-devices" }, [
        window.h("p", { class: "area-detail-devices-title", text: "主要设备（来源：" + area.sourceAreas.join("、") + "）" }),
        window.h("ul", {}, area.devices.map(function (device) {
          return window.h("li", {
            text: device.kind + " × " + device.count + (device.note ? "（" + device.note + "）" : "")
          });
        }))
      ])
    ]);
  }

  function renderAreaPanel(activeAreaId) {
    var C = window.Map3DContract;
    var DATA = window.DemoStation;
    var progress = DATA.stationProgress();

    var rows = C.AREA_IDS.map(function (id) {
      var area = DATA.area(id);
      return renderAreaRow(area, DATA.progress(id), id === activeAreaId);
    });

    var children = [
      window.h("div", { class: "area-panel-head" }, [
        window.h("p", { class: "kicker", text: "区域信息面板" }),
        window.h("h3", { text: "巡检项 " + progress.itemDone + "/" + progress.itemTotal }),
        window.h("p", {
          class: "area-panel-sub",
          text: progress.issueCount > 0
            ? "全站发现 " + progress.issueCount + " 项异常/关注"
            : "全站 " + progress.itemTotal + " 项均正常"
        })
      ]),
      window.h("ul", { class: "area-list" }, rows)
    ];

    if (activeAreaId) {
      children.push(renderAreaDetail(DATA.area(activeAreaId), DATA.progress(activeAreaId)));
    } else {
      children.push(window.h("p", { class: "area-detail-empty", text: "点击左侧地图上的区域热点或下方列表，查看该区域的巡检详情。" }));
    }

    return window.h("aside", { class: "panel area-panel" }, children);
  }

  function rerenderAreaPanel() {
    panelSlot.replaceChildren(renderAreaPanel(state.activeAreaId));
  }

  // ---------------------------------------------------------------------
  // 交互
  // ---------------------------------------------------------------------

  function selectArea(areaId) {
    var next = state.activeAreaId === areaId ? null : areaId;
    state.activeAreaId = next;
    window.Map3D.setActiveArea(next);
    rerenderAreaPanel();
  }

  function handleAction(action, actionEl) {
    if (action === "map-zoom-in") {
      window.Map3D.zoom(1);
      return;
    }
    if (action === "map-zoom-out") {
      window.Map3D.zoom(-1);
      return;
    }
    if (action === "map-track-toggle") {
      state.trackVisible = !state.trackVisible;
      window.Map3D.setTrackVisible(state.trackVisible);
      actionEl.classList.toggle("active", state.trackVisible);
      actionEl.setAttribute("aria-pressed", state.trackVisible ? "true" : "false");
      return;
    }
    throw new Error("[app] 未知的 data-action：" + action);
  }

  function bindEvents() {
    var C = window.Map3DContract;
    root.addEventListener("click", function (event) {
      var pin = event.target.closest("[" + C.PIN_ATTR + "]");
      if (pin && root.contains(pin)) {
        selectArea(pin.getAttribute(C.PIN_ATTR));
        return;
      }
      var row = event.target.closest("[data-select-id]");
      if (row && root.contains(row)) {
        selectArea(row.getAttribute("data-select-id"));
        return;
      }
      var actionEl = event.target.closest("[data-action]");
      if (actionEl && root.contains(actionEl)) {
        handleAction(actionEl.getAttribute("data-action"), actionEl);
      }
    });
  }

  function mountMap3D() {
    var host = mapSlot.querySelector("[" + window.Map3DContract.HOST_ATTR + "]");
    if (!host) throw new Error("[app] 未找到 [" + window.Map3DContract.HOST_ATTR + "] 宿主元素");
    window.Map3D.mount(host, {
      statuses: statuses(),
      activeAreaId: state.activeAreaId
    });
    window.Map3DContract.assertPinNamespace();
  }

  function boot() {
    assertBootGlobals();
    assertStationData();

    root = document.getElementById("appRoot");
    if (!root) throw new Error("[app] 未找到 #appRoot 容器，请检查 index.html");
    mapSlot = root.querySelector(".map-slot");
    panelSlot = root.querySelector(".panel-slot");
    if (!mapSlot || !panelSlot) throw new Error("[app] 缺少 .map-slot / .panel-slot 容器，请检查 index.html");

    mapSlot.appendChild(window.renderMapHost(state.activeAreaId));
    panelSlot.appendChild(renderAreaPanel(state.activeAreaId));

    mountMap3D();
    bindEvents();
  }

  boot();
})();
