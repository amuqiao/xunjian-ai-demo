(function () {
  "use strict";

  var steps = [
    { key: "overview", label: "大屏总览", href: "hunan-pump-overview/index.html" },
    { key: "station", label: "泵站态势", href: "pump-station-situation/index.html" },
    { key: "diagnosis", label: "诊断台 / 知识库", href: "diagnosis-flow/index.html" },
    { key: "graph", label: "知识图谱", href: "kg-template/index.html" }
  ];

  function currentKey(pathname) {
    if (window.BengDemoShell && typeof window.BengDemoShell.currentKey === "function") {
      return window.BengDemoShell.currentKey();
    }
    if (pathname.indexOf("/hunan-pump-overview/") >= 0) return "overview";
    if (pathname.indexOf("/pump-station-situation/") >= 0) return "station";
    if (pathname.indexOf("/diagnosis-flow/") >= 0) return "diagnosis";
    if (pathname.indexOf("/kg-template/") >= 0) return "graph";
    return "overview";
  }

  function prefixFor(pathname) {
    var inComponent = pathname.indexOf("/hunan-pump-overview/") >= 0
      || pathname.indexOf("/pump-station-situation/") >= 0
      || pathname.indexOf("/diagnosis-flow/") >= 0
      || pathname.indexOf("/kg-template/") >= 0;
    return inComponent ? "../" : "";
  }

  function inFrame() {
    try {
      return window.parent && window.parent !== window;
    } catch (err) {
      return false;
    }
  }

  function notifyParentReady() {
    try {
      window.parent.postMessage({
        type: "beng-demo:frame-ready",
        key: currentKey(window.location.pathname)
      }, "*");
    } catch (err) {
      /* iframe 场景下通知失败不影响组件独立运行。 */
    }
  }

  function switchInParent(step) {
    try {
      window.parent.postMessage({ type: "beng-demo:switch", key: step.key }, "*");
      return true;
    } catch (err) {
      return false;
    }
  }

  function mount() {
    if (inFrame()) {
      notifyParentReady();
      return;
    }
    if (document.querySelector(".inspection-flow-nav")) return;

    var key = currentKey(window.location.pathname);
    var prefix = prefixFor(window.location.pathname);
    var nav = document.createElement("nav");
    nav.className = "inspection-flow-nav";
    nav.setAttribute("aria-label", "泵站演示组件切换");

    steps.forEach(function (step, index) {
      var link = document.createElement("a");
      link.href = prefix + step.href;
      link.textContent = String(index + 1);
      link.dataset.key = step.key;
      link.dataset.label = step.label;
      link.title = String(index + 1) + " " + step.label;
      link.setAttribute("aria-label", String(index + 1) + " " + step.label);
      if (step.key === key) link.className = "is-active";
      link.addEventListener("click", function (event) {
        var current = currentKey(window.location.pathname);
        if (step.key === current) {
          event.preventDefault();
          return;
        }
        if (window.BengDemoShell && typeof window.BengDemoShell.switchTo === "function") {
          event.preventDefault();
          window.BengDemoShell.switchTo(step.key);
          return;
        }
        if (inFrame() && switchInParent(step)) {
          event.preventDefault();
        }
      });
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
