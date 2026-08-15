// 大屏等比缩放：把 1920×1080 的设计稿按视口短边等比缩到当前窗口，保证投影仪、
// 笔记本、外接显示器上看到的比例完全一致。
//
// 只写一个 CSS 变量，缩放本身交给 styles/02-shell.css 的 transform: scale()。
// 这样布局计算全程在 1920×1080 的坐标系里进行，场景层不需要写任何响应式分支。
(function () {
  "use strict";

  var DESIGN_W = 1920;
  var DESIGN_H = 1080;

  function apply() {
    var scale = Math.min(window.innerWidth / DESIGN_W, window.innerHeight / DESIGN_H);
    document.documentElement.style.setProperty("--screen-scale", String(scale));
  }

  apply();
  window.addEventListener("resize", apply);
  window.ScreenScale = { apply: apply, DESIGN_W: DESIGN_W, DESIGN_H: DESIGN_H };
})();
