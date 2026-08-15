// core/screen-scale.js —— 等比缩放的唯一数据源：把「窗口尺寸 ↔ 设计画布尺寸」的比值
// 写成三个 CSS 自定义属性（--screen-scale/--screen-offset-x/--screen-offset-y），
// 挂在 document.documentElement 上，styles/04-shell.css 的 #screen 用
// transform: scale(var(--screen-scale)) 消费。
//
// 改写自 poc/hunan-inspection-overview/scripts/core/screen-scale.js，唯一的实质
// 差异：设计画布尺寸不再是本文件里硬编码的字面量，而是从 styles/03-geometry.css
// 声明的 --screen-design-width/--screen-design-height 读——几何层是唯一真源，
// 换分辨率只改那一处 CSS，本文件不允许另立一份数字（DESIGN.md 第 6 章硬约束 5
// 「三套坐标系不要混」：本文件只产出「设计坐标 ↔ 视口坐标」的换算系数，不生产
// 设计坐标本身）。
//
// 读不到 / 读到非法值直接 throw，不做默认值兜底：那意味着 03-geometry.css 没有
// 先于本文件加载，或者变量名被改动却没同步——这是加载顺序或改名漏改的 bug，
// 静默兜底只会把它伪装成「看起来能跑」。
(function () {
  "use strict";

  var root = document.documentElement;

  function readDesignSize(varName) {
    var raw = getComputedStyle(root).getPropertyValue(varName).trim();
    var value = parseFloat(raw);
    if (!raw || !isFinite(value) || value <= 0) {
      throw new Error(
        "[screen-scale] " + varName + " 必须是合法的正数像素值（应由 " +
        "styles/03-geometry.css 提供），实际读到 " + JSON.stringify(raw)
      );
    }
    return value;
  }

  function updateScale() {
    var designWidth = readDesignSize("--screen-design-width");
    var designHeight = readDesignSize("--screen-design-height");
    var scale = Math.min(window.innerWidth / designWidth, window.innerHeight / designHeight);
    var offsetX = (window.innerWidth - designWidth * scale) / 2;
    var offsetY = (window.innerHeight - designHeight * scale) / 2;
    root.style.setProperty("--screen-scale", String(scale));
    root.style.setProperty("--screen-offset-x", offsetX + "px");
    root.style.setProperty("--screen-offset-y", offsetY + "px");
  }

  window.addEventListener("resize", updateScale);
  updateScale();
})();
