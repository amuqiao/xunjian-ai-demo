// 最底层 DOM 构建工具：h()/append() 逐字搬自 poc/pump-demo/scripts/core/dom.js，本体一字
// 未改。中间经由 poc/inspection-3d-sandbox/scripts/core/dom.js 搬运至此——该文件里
// legendDot()（三色状态图例最小单元）与 renderStationMap()（站场地图“宿主 + 区域热点
// 标签”骨架）是站内沙盘场景专属的构建器，与本 POC（湖南省油气管网大屏）无关，未搬运。
//
// 事件绑定纪律：本文件只负责渲染 DOM，绝不在这里 addEventListener——点击/键盘等交互统一
// 由更上层的场景/引导代码做事件委托，本文件产出的节点只负责“天然带上这些属性”，不负责
// 处理交互本身。
(function () {
  "use strict";

  var SVG_NS = "http://www.w3.org/2000/svg";
  var svgTags = ["svg", "line", "polyline", "circle", "g", "text"];

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

  window.h = h;
  window.append = append;
})();
