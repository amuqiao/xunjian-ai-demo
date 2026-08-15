// core/dom.js —— 最底层 DOM 构建 + 查询工具：window.h / window.append / window.qs /
// window.qsa / window.setVars 从这里挂出去。
//
// h()/append() 逐字改写自 poc/hunan-inspection-overview/scripts/core/dom.js（那份
// 本身已经是从 poc/inspection-3d-sandbox/scripts/core/dom.js 剥掉 legendDot()/
// renderStationMap() 两个站内巡检专用构建器之后的纯净版），本文件只改了一处：
// SVG 标签白名单从 svg/line/polyline/circle/g/text 换成 svg/path/g/circle/line/
// polyline —— 去掉 "text"、加入 "path" 是刻意的：docs 页的树连线要用 <path> 画折线，
// 但本 POC 的第一条设计立场是「WebGL 画几何、DOM 画中文」，中文标签一律走普通 DOM
// 节点，不许有人顺手用 SVG <text> 画标签，所以白名单里不给 "text" 开口子。
//
// qs()/qsa()/setVars() 参照 poc/kg_stage/scripts/core/dom.js 的同名函数改写（该文件
// 是本 POC 明确列为参照物的草稿版，只读不改）：qsa() 返回真数组而不是 NodeList，
// 方便调用方直接 .map()/.filter() 链式处理；setVars() 是「运行期改写已存在元素的
// CSS 自定义属性」的语法糖，供 3D 投影层每帧写 --card-scale/--card-dim 这类样式
// 变量时用，不必每次手拼判断 "--" 前缀。
//
// 事件绑定纪律：本文件只负责渲染/查询 DOM，绝不在这里 addEventListener——交互统一由
// 更上层的场景文件 / boot.js 做事件委托，本文件产出的节点只负责「天然带上属性」。
(function () {
  "use strict";

  var SVG_NS = "http://www.w3.org/2000/svg";
  var SVG_TAGS = ["svg", "path", "g", "circle", "line", "polyline"];

  function isSvgTag(tag) {
    return SVG_TAGS.indexOf(tag) >= 0;
  }

  // h(tag, attrs, children)
  //
  // attrs 的特殊键：
  //   class    -> className（SVG 节点走 setAttribute("class", ...)，因为 SVGElement
  //               没有可写的 .className 字符串属性）
  //   text     -> node.textContent
  //   html     -> node.innerHTML（用于内联静态占位，不用于拼接不可信文本）
  //   dataset  -> 逐键写 node.dataset[name]
  //   其余键    -> setAttribute，但值为 false/null/undefined 时整条属性都不写
  //               （不是写成字符串 "false"/"null"），用于「这个属性要不要出现」由
  //               调用方一个三元表达式决定的场景（例如 aria-pressed 只在可交互卡片
  //               上出现，纯展示节点整条属性都不该有）；值为 true 时写成空字符串
  //               属性（如 disabled=""）。
  function h(tag, attrs, children) {
    var svg = isSvgTag(tag);
    var node = svg ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
    attrs = attrs || {};

    Object.keys(attrs).forEach(function (key) {
      var value = attrs[key];
      if (key === "class") {
        if (svg) node.setAttribute("class", value);
        else node.className = value;
      } else if (key === "text") {
        node.textContent = value;
      } else if (key === "html") {
        node.innerHTML = value;
      } else if (key === "dataset") {
        Object.keys(value).forEach(function (name) {
          node.dataset[name] = value[name];
        });
      } else if (value !== false && value != null) {
        node.setAttribute(key, value === true ? "" : value);
      }
    });

    append(node, children);
    return node;
  }

  // append(node, children)：children 允许是字符串 / 数字 / Node / 上述几种的嵌套
  // 数组；null/undefined/false 一律跳过（跳过 false 是为了配合调用方常见的
  // `cond ? h(...) : false` / `cond && h(...)` 写法，不强制每处都换成 null）。
  function append(node, children) {
    if (children == null) return;
    (Array.isArray(children) ? children : [children]).forEach(function (child) {
      if (child == null || child === false) return;
      if (Array.isArray(child)) {
        append(node, child);
        return;
      }
      node.appendChild(
        typeof child === "string" || typeof child === "number"
          ? document.createTextNode(String(child))
          : child
      );
    });
  }

  // qs(selector, root)：root 缺省为 document。
  function qs(selector, root) {
    return (root || document).querySelector(selector);
  }

  // qsa(selector, root)：转成真数组（Array.prototype.slice），调用方可以直接
  // .map()/.filter()/.forEach() 链式调用，不必每次自己转一遍。
  function qsa(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  // setVars(el, {cardScale: 1.2, "--card-dim": 0.6}) 等价于依次调用
  // el.style.setProperty('--card-scale', 1.2) / el.style.setProperty('--card-dim', 0.6)。
  // 键名不带 "--" 前缀时自动补上，带了就原样用，两种写法都支持。
  //
  // el/vars 都是硬性必需参数，不做「元素不存在就静默跳过」的兜底：调用方传错本该
  // 在这里直接炸出来，而不是在更远的地方表现成一句「样式没生效」的疑难杂症。
  function setVars(el, vars) {
    if (!(el instanceof Element)) {
      throw new Error("[setVars] el 必须是一个 DOM Element，实际为 " + String(el));
    }
    if (typeof vars !== "object" || vars === null) {
      throw new Error("[setVars] vars 必须是一个对象，实际为 " + String(vars));
    }
    Object.keys(vars).forEach(function (key) {
      var name = key.indexOf("--") === 0 ? key : "--" + key;
      el.style.setProperty(name, vars[key]);
    });
  }

  window.h = h;
  window.append = append;
  window.qs = qs;
  window.qsa = qsa;
  window.setVars = setVars;
})();
