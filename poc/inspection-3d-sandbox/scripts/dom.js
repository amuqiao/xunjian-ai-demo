// 最底层 DOM 构建工具：h()/append() 和它们依赖的 SVG 标签表。
//
// renderPumpTrain/statusText 是个例外：它构建的 3D 宿主 + .pump3d-labels 热点标签
// DOM，同时被 scenes/overview.js 和 scenes/station.js 两个"同层"场景文件使用。按
// "同层不得互相引用"的纪律，这段代码不能只定义在其中一个场景文件里被另一个引用，
// 必须上提到更早的层；当前又没有独立的 ui/* 分层（按分工由后续任务建立），所以暂放
// 在这里。它消费 window.Pump3DContract 的 HOST_ATTR/LABELS_CLASS/PIN_ATTR 作为唯一
// 真源，而不是在这里重新硬编码一份宿主标记属性名/标签容器 class 名/热点属性名
// 字符串——这正是契约要收敛的 DOM 命名。
(function () {
  "use strict";

  var SVG_NS = "http://www.w3.org/2000/svg";
  var svgTags = ["svg", "line", "polyline", "circle", "g", "text"];
  var statusText = {
    ok: "正常",
    warn: "关注",
    danger: "异常",
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
      }
      else if (key === "text") node.textContent = value;
      else if (key === "html") node.innerHTML = value;
      else if (key === "dataset") {
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

  function renderPumpTrain(activeId, preset) {
    var DATA = window.DemoData;
    var C = window.Pump3DContract;
    // 不能用 role="img"：ARIA 下它会把子元素变成 presentational，辅助技术拿不到内部 6 个部位按钮。
    // 3D 造型对屏幕阅读器是纯装饰（canvas 由引擎插入并标 aria-hidden），信息由这些按钮承载。
    var hostAttrs = {
      class: "pump-train pump-train-3d",
      dataset: { pump3dPreset: preset },
      role: "group",
      "aria-label": "输油泵机组三维部位视图，含 6 个部位热点",
    };
    hostAttrs[C.HOST_ATTR] = "1";
    return h("div", hostAttrs, [
      h("div", { class: C.LABELS_CLASS }, DATA.parts().map(function (part) {
        var pinAttrs = {
          type: "button",
          class: "part-pin " + part.status + (part.id === activeId ? " active" : ""),
          // 状态不能只靠颜色和 title 传达：title 在触摸设备和键盘导航下不可达。
          "aria-label": part.label + " · " + statusText[part.status],
          "aria-pressed": part.id === activeId ? "true" : "false",
          title: part.label + " · " + statusText[part.status],
        };
        pinAttrs[C.PIN_ATTR] = part.id;
        return h("button", pinAttrs, [
          h("span", { class: "pin-core", "aria-hidden": "true" }),
          h("span", { class: "pin-label", text: part.short, "aria-hidden": "true" }),
        ]);
      })),
      h("div", { class: "pump3d-hint", "aria-hidden": "true", text: "拖拽旋转 · 滚轮缩放" }),
    ]);
  }

  window.h = h;
  window.append = append;
  window.renderPumpTrain = renderPumpTrain;
})();
