(function () {
  "use strict";

  var DESIGN_WIDTH = 2029;
  var DESIGN_HEIGHT = 763;
  var root = document.documentElement;

  function updateScale() {
    if (window.innerWidth <= 760) {
      root.style.setProperty("--screen-scale", "1");
      return;
    }
    var scale = Math.min(window.innerWidth / DESIGN_WIDTH, window.innerHeight / DESIGN_HEIGHT);
    root.style.setProperty("--screen-scale", String(scale));
  }

  window.addEventListener("resize", updateScale);
  updateScale();
}());
