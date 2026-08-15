(function () {
  "use strict";

  var DESIGN_WIDTH = 2471;
  var DESIGN_HEIGHT = 1289;
  var root = document.documentElement;

  function updateScale() {
    var scale = Math.min(window.innerWidth / DESIGN_WIDTH, window.innerHeight / DESIGN_HEIGHT);
    var offsetX = (window.innerWidth - DESIGN_WIDTH * scale) / 2;
    var offsetY = (window.innerHeight - DESIGN_HEIGHT * scale) / 2;
    root.style.setProperty("--screen-scale", String(scale));
    root.style.setProperty("--screen-offset-x", offsetX + "px");
    root.style.setProperty("--screen-offset-y", offsetY + "px");
  }

  window.addEventListener("resize", updateScale);
  updateScale();
}());
