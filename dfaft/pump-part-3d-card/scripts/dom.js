(function () {
  "use strict";

  var SVG_NS = "http://www.w3.org/2000/svg";
  var svgTags = ["svg", "path", "polyline", "circle", "line"];
  var statusText = {
    done: "已完成",
    ok: "正常",
    warn: "关注",
    danger: "异常"
  };

  function h(tag, attrs, children) {
    var isSvg = svgTags.indexOf(tag) >= 0;
    var node = isSvg ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (key) {
      var value = attrs[key];
      if (key === "class") {
        if (isSvg) node.setAttribute("class", value);
        else node.className = value;
      } else if (key === "text") {
        node.textContent = value;
      } else if (key === "html") {
        node.innerHTML = value;
      } else if (key === "dataset") {
        Object.keys(value).forEach(function (name) { node.dataset[name] = value[name]; });
      } else if (value !== false && value != null) {
        node.setAttribute(key, value === true ? "" : value);
      }
    });
    append(node, children);
    return node;
  }

  function append(node, children) {
    if (children == null) return;
    (Array.isArray(children) ? children : [children]).forEach(function (child) {
      if (child == null) return;
      if (Array.isArray(child)) {
        append(node, child);
        return;
      }
      node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
    });
  }

  function statusPill(status, text) {
    return h("span", { class: "status-pill " + status, text: text || statusText[status] });
  }

  function metricCard(metric) {
    return h("article", { class: "kpi-card " + metric.tone }, [
      h("span", { text: metric.label }),
      h("strong", { text: metric.value }),
      h("small", { text: metric.trend })
    ]);
  }

  function renderInspectionMap(activeId) {
    var DATA = window.DemoData;
    var C = window.Pump3DContract;
    var hostAttrs = {
      class: "inspection-map pump-train-3d",
      role: "group",
      "aria-label": "湘潭站三维巡检地图，含 13 个巡检区域热点"
    };
    hostAttrs[C.HOST_ATTR] = "1";

    return h("div", hostAttrs, [
      h("div", { class: C.LABELS_CLASS }, DATA.areas().map(function (area) {
        var pinAttrs = {
          type: "button",
          class: "inspection-pin " + area.status + (area.id === activeId ? " active" : ""),
          "aria-label": area.label + " · " + statusText[area.status],
          "aria-pressed": area.id === activeId ? "true" : "false",
          title: area.label + " · " + statusText[area.status]
        };
        pinAttrs[C.PIN_ATTR] = area.id;
        return h("button", pinAttrs, [
          h("span", { class: "pin-core", "aria-hidden": "true" }),
          h("span", { class: "pin-label", text: area.order + " " + area.short, "aria-hidden": "true" })
        ]);
      })),
      h("div", { class: "route-agent-label", "aria-hidden": "true" }, [
        h("span", { text: "巡检员" }),
        h("strong", { text: DATA.station.inspector })
      ]),
      h("div", { class: "orbit-note", "aria-hidden": "true", text: "拖拽旋转 · 滚轮/双指缩放 · 点击点位查看证据" })
    ]);
  }

  function renderAreaDetail(area) {
    return h("section", { class: "floating-detail" }, [
      h("div", { class: "detail-head" }, [
        h("div", {}, [
          h("span", { class: "eyebrow", text: "当前点位" }),
          h("h2", { text: area.label })
        ]),
        statusPill(area.status)
      ]),
      h("p", { text: area.summary }),
      h("div", { class: "metric-grid" }, area.metrics.map(function (item) {
        return h("span", { text: item });
      })),
      h("ul", { class: "evidence-list" }, area.evidence.map(function (item) {
        return h("li", { text: item });
      }))
    ]);
  }

  window.h = h;
  window.append = append;
  window.statusPill = statusPill;
  window.metricCard = metricCard;
  window.renderInspectionMap = renderInspectionMap;
  window.renderAreaDetail = renderAreaDetail;
}());
