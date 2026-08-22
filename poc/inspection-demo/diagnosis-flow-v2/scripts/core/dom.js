// 最底层 DOM 构建工具：h() / append()。
//
// 事件绑定纪律：本文件只负责建 DOM，绝不在这里 addEventListener —— 点击统一由
// scripts/boot.js 做事件委托，本文件产出的节点只负责"天然带上 data-action /
// data-select-id 这些属性"，不负责处理交互。
(function () {
  "use strict";

  function h(tag, attrs, children) {
    var node = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (key) {
      var value = attrs[key];
      if (value === false || value == null) return;
      if (key === "class") node.className = value;
      else if (key === "text") node.textContent = value;
      else if (key === "dataset") {
        Object.keys(value).forEach(function (name) { node.dataset[name] = value[name]; });
      } else if (key === "style") node.setAttribute("style", value);
      else node.setAttribute(key, value === true ? "" : value);
    });
    append(node, children);
    return node;
  }

  function append(node, children) {
    if (children == null) return;
    (Array.isArray(children) ? children : [children]).forEach(function (child) {
      if (child == null || child === false) return;
      if (Array.isArray(child)) { append(node, child); return; }
      node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
    });
  }

  window.h = h;
  window.append = append;
})();
