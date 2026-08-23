(function () {
  "use strict";

  // 【这张表是唯一真源】index.html 的外壳不再自己抄一份，改成读 window.InspectionFlowSteps
  // （见本文件末尾）。原先 steps 在 index.html 和这里各写一遍、路径判断又在下面手写第三遍
  // —— 三个 v2 目录接线时正是这三处不同步咬了一口。现在换目录只改这张表。
  //
  // href 指向 v2；dirs 里同时列出旧目录 —— 旧的三个目录没删、仍可单独打开，如果不列进来，
  // 从旧目录打开时 prefixFor 会算成 ""，导航链接就指到旧目录底下去了。
  var steps = [
    { key: "overview", label: "大屏总览", href: "hunan-overview-v2/index.html",
      dirs: ["hunan-overview-v2", "hunan-inspection-overview"] },
    { key: "station", label: "站点态势", href: "inspection-station-v2/index.html",
      dirs: ["inspection-station-v2", "inspection-3d-sandbox"] },
    // 【第 3 位：智能助手】见 poc/beng-demo/flow-nav/flow-nav.js 同一位置的说明。
    { key: "agent", label: "智能助手", href: "智能巡检数智员工_巡检.html", dirs: [] },
    { key: "diagnosis", label: "诊断台 / 知识库", href: "diagnosis-flow-v2/index.html",
      dirs: ["diagnosis-flow-v2", "diagnosis-flow"] },
    { key: "graph", label: "知识图谱", href: "kg-template/index.html",
      dirs: ["kg-template"] }
  ];

  function stepOfPath(pathname) {
    return steps.filter(function (step) {
      return step.dirs.some(function (dir) { return pathname.indexOf("/" + dir + "/") >= 0; });
    })[0] || null;
  }

  function currentKey(pathname) {
    if (window.InspectionDemoShell && typeof window.InspectionDemoShell.currentKey === "function") {
      return window.InspectionDemoShell.currentKey();
    }
    var step = stepOfPath(pathname);
    return step ? step.key : "overview";
  }

  function prefixFor(pathname) {
    return stepOfPath(pathname) ? "../" : "";
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
        type: "inspection-demo:frame-ready",
        key: currentKey(window.location.pathname)
      }, "*");
    } catch (err) {
      /* iframe 场景下通知失败不影响组件独立运行。 */
    }
  }

  function switchInParent(step) {
    try {
      window.parent.postMessage({ type: "inspection-demo:switch", key: step.key }, "*");
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
    nav.setAttribute("aria-label", "巡检演示组件切换");

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
        if (window.InspectionDemoShell && typeof window.InspectionDemoShell.switchTo === "function") {
          event.preventDefault();
          window.InspectionDemoShell.switchTo(step.key);
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

  // 外壳（index.html）要用同一张表建 iframe。这里同步暴露 —— 所以 index.html 必须先
  // 加载本文件、再跑它自己那段内联脚本。mount() 走 DOMContentLoaded，那时外壳已经把
  // InspectionDemoShell 挂上了，顺序不冲突。
  window.InspectionFlowSteps = steps;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
