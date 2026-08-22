// 固定画布等比缩放：把 2471×1289 的设计稿按视口短边缩到当前窗口。
//
// 【与旧目录同名文件的区别】旧的那份注释写着「缩放本身交给 styles/02-shell.css 的
// transform: scale()」，但那份 CSS 里没有 transform —— 变量算了没人用，真正做适配的是
// 687 行响应式。本版 styles/02-shell.css 的 .app-shell 真的写了
// transform: scale(var(--screen-scale))，所以这个变量有唯一的消费者。
//
// 画布尺寸与 hunan-overview-v2 / inspection-station-v2 一致：四个组件在同一个 iframe
// 外壳里，口径不一致会导致缩放后字号不齐。
(function () {
  "use strict";

  var DESIGN_W = 2471;
  var DESIGN_H = 1289;
  var root = document.documentElement;

  function apply() {
    var scale = Math.min(window.innerWidth / DESIGN_W, window.innerHeight / DESIGN_H);
    root.style.setProperty("--screen-scale", String(scale));
    root.style.setProperty("--screen-offset-x", ((window.innerWidth - DESIGN_W * scale) / 2) + "px");
    root.style.setProperty("--screen-offset-y", ((window.innerHeight - DESIGN_H * scale) / 2) + "px");
  }

  window.addEventListener("resize", apply);
  apply();
  window.ScreenScale = { apply: apply, DESIGN_W: DESIGN_W, DESIGN_H: DESIGN_H };
})();
