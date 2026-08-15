(function () {
  "use strict";

  var steps = [
    { key: "overview", label: "大屏总览", href: "hunan-inspection-overview/index.html" },
    { key: "station", label: "站点态势", href: "inspection-3d-sandbox/index.html" },
    { key: "diagnosis", label: "诊断台 / 知识库", href: "diagnosis-flow/index.html" },
    { key: "graph", label: "知识图谱", href: "kg-template/index.html" }
  ];

  function currentKey(pathname) {
    if (pathname.indexOf("/hunan-inspection-overview/") >= 0) return "overview";
    if (pathname.indexOf("/inspection-3d-sandbox/") >= 0) return "station";
    if (pathname.indexOf("/diagnosis-flow/") >= 0) return "diagnosis";
    if (pathname.indexOf("/kg-template/") >= 0) return "graph";
    return "overview";
  }

  function prefixFor(pathname) {
    var inComponent = pathname.indexOf("/hunan-inspection-overview/") >= 0
      || pathname.indexOf("/inspection-3d-sandbox/") >= 0
      || pathname.indexOf("/diagnosis-flow/") >= 0
      || pathname.indexOf("/kg-template/") >= 0;
    return inComponent ? "../" : "";
  }

  function mount() {
    if (document.querySelector(".inspection-flow-nav")) return;

    var key = currentKey(window.location.pathname);
    var prefix = prefixFor(window.location.pathname);
    var nav = document.createElement("nav");
    nav.className = "inspection-flow-nav";
    nav.setAttribute("aria-label", "巡检演示组件切换");

    steps.forEach(function (step, index) {
      var link = document.createElement("a");
      link.href = prefix + step.href;
      link.textContent = String(index + 1);
      link.dataset.label = step.label;
      link.title = String(index + 1) + " " + step.label;
      if (step.key === key) link.className = "is-active";
      nav.appendChild(link);
    });

    document.body.appendChild(nav);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
