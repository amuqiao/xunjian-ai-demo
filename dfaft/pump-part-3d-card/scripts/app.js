(function () {
  "use strict";

  var activeAreaId = "pump";
  var root = document.getElementById("cardRoot");

  function renderTopbar() {
    var DATA = window.DemoData;
    return window.h("header", { class: "map-topbar" }, [
      window.h("div", { class: "brand-block" }, [
        window.h("span", { class: "brand-mark", text: "AI" }),
        window.h("div", {}, [
          window.h("p", { class: "eyebrow", text: "巡检质量智能分析助手" }),
          window.h("h1", { text: DATA.station.name + " 3D 巡检地图" }),
          window.h("small", { text: DATA.station.task + " · " + DATA.station.actual })
        ])
      ]),
      window.h("div", { class: "top-kpis" }, DATA.kpis().map(window.metricCard))
    ]);
  }

  function renderLeftPanel() {
    var DATA = window.DemoData;
    return window.h("aside", { class: "left-panel" }, [
      window.h("section", { class: "route-status-card" }, [
        window.h("div", { class: "panel-head" }, [
          window.h("div", {}, [
            window.h("span", { class: "eyebrow", text: "任务状态" }),
            window.h("h2", { text: DATA.station.status })
          ]),
          window.statusPill("done", "未超期")
        ]),
        window.h("dl", { class: "task-meta" }, [
          window.h("dt", { text: "巡检人" }),
          window.h("dd", { text: DATA.station.inspector }),
          window.h("dt", { text: "计划周期" }),
          window.h("dd", { text: DATA.station.planned }),
          window.h("dt", { text: "同步状态" }),
          window.h("dd", { text: DATA.station.sync })
        ])
      ]),
      window.h("section", { class: "route-list" }, [
        window.h("div", { class: "panel-head compact" }, [
          window.h("h2", { text: "巡检路线" }),
          window.h("span", { text: "13 个区域" })
        ]),
        DATA.areas().map(function (area) {
          return window.h("button", {
            type: "button",
            class: "route-step " + area.status + (area.id === activeAreaId ? " active" : ""),
            dataset: { selectId: area.id },
            "aria-pressed": area.id === activeAreaId ? "true" : "false"
          }, [
            window.h("span", { class: "step-index", text: area.order }),
            window.h("span", { class: "step-copy" }, [
              window.h("strong", { text: area.label }),
              window.h("small", { text: area.time + " · " + area.progress })
            ])
          ]);
        })
      ])
    ]);
  }

  function renderRightPanel(activeArea) {
    return window.h("aside", { class: "right-panel" }, [
      window.renderAreaDetail(activeArea),
      window.h("section", { class: "ai-alerts" }, [
        window.h("div", { class: "panel-head compact" }, [
          window.h("h2", { text: "AI 异常提醒" }),
          window.h("span", { text: "4 条" })
        ]),
        window.DemoData.alerts().map(function (alert) {
          return window.h("article", { class: "alert-row " + alert.status }, [
            window.statusPill(alert.status),
            window.h("div", {}, [
              window.h("strong", { text: alert.title }),
              window.h("p", { text: alert.desc })
            ])
          ]);
        })
      ])
    ]);
  }

  function renderTimeline() {
    return window.h("footer", { class: "bottom-timeline" }, window.DemoData.timeline().map(function (item) {
      return window.h("div", { class: "timeline-item " + item.state }, [
        window.h("span", { text: item.time }),
        window.h("strong", { text: item.label })
      ]);
    }));
  }

  function mount3d() {
    var host = root.querySelector("[" + window.Pump3DContract.HOST_ATTR + "]");
    window.Pump3D.mount(host, {
      activeId: activeAreaId,
      statuses: window.DemoData.statuses()
    });
  }

  function render() {
    var activeArea = window.DemoData.area(activeAreaId);
    window.Pump3D.detach();
    root.replaceChildren(window.h("div", { class: "inspection-shell" }, [
      renderTopbar(),
      window.h("section", { class: "map-layout" }, [
        renderLeftPanel(),
        window.h("main", { class: "center-map" }, [
          window.h("div", { class: "map-toolbar" }, [
            window.statusPill("done", "已完成"),
            window.h("span", { text: "轨迹完整度 100%" }),
            window.h("span", { text: "问题上报 3" }),
            window.h("span", { text: "手机同步完成" }),
            window.h("span", { class: "touch-hint", text: "点位可点 · 拖拽地图" })
          ]),
          window.h("div", { class: "map-stage" }, [
            window.renderInspectionMap(activeAreaId),
            window.h("div", { class: "map-overlay", "aria-hidden": "true" }, [
              window.h("span", { text: "起" }),
              window.h("span", { text: "终" })
            ])
          ])
        ]),
        renderRightPanel(activeArea)
      ]),
      renderTimeline()
    ]));
    mount3d();
  }

  function updateSelectionClasses(selector, activeClass, idAttr, id) {
    root.querySelectorAll(selector).forEach(function (node) {
      var active = node.getAttribute(idAttr) === id;
      node.classList.toggle(activeClass, active);
      node.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function selectArea(id) {
    var activeArea = window.DemoData.area(id);
    activeAreaId = id;
    updateSelectionClasses("[data-select-id]", "active", "data-select-id", id);
    updateSelectionClasses("[" + window.Pump3DContract.PIN_ATTR + "]", "active", window.Pump3DContract.PIN_ATTR, id);
    root.querySelector(".floating-detail").replaceWith(window.renderAreaDetail(activeArea));
    window.Pump3D.update({
      activeId: activeAreaId,
      statuses: window.DemoData.statuses()
    });
  }

  root.addEventListener("click", function (event) {
    var pin = event.target.closest("[" + window.Pump3DContract.PIN_ATTR + "]");
    var step = event.target.closest("[data-select-id]");
    var id = pin ? pin.getAttribute(window.Pump3DContract.PIN_ATTR) : step && step.dataset.selectId;
    if (!id || !root.contains(event.target)) return;
    selectArea(id);
  });

  window.Pump3DContract.assertData();
  render();
}());
