// 最底层 DOM 构建工具：h() / append()。
//
// 移植自 pump-demo scripts/core/dom.js，去掉了 renderPumpTrain（3D 宿主构建）——
// 本 POC 不含任何 3D，那段没有落点。
//
// h() 的约定：
//   class   → className（SVG 走 setAttribute）
//   text    → textContent
//   html    → innerHTML
//   dataset → 逐个写 node.dataset[name]
//   其余    → setAttribute；值为 false / null / undefined 时整个属性不写
// 最后一条是刻意的：场景层可以写 `disabled: cond ? "disabled" : null`，条件不成立时
// 属性根本不出现，而不是出现一个 disabled="false"（HTML 里那仍然是禁用）。
(function () {
  "use strict";

  var SVG_NS = "http://www.w3.org/2000/svg";
  var svgTags = ["svg", "line", "polyline", "polygon", "path", "circle", "rect", "g", "text"];

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

  window.h = h;
  window.append = append;
})();
