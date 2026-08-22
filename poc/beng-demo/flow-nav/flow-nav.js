(function () {
  "use strict";

  // 【这张表是唯一真源】index.html 的外壳不再自己抄一份，改成读 window.BengFlowSteps
  // （见本文件末尾）。原先 steps 在 index.html 和这里各写一遍、路径判断又在下面手写第三遍，
  // 三处不同步就会出现"导航点亮 v2、iframe 还在加载旧目录"这种一半生效的状态，
  // 而且靠字符串匹配的老写法对 v2 目录是**静默失效**（"/hunan-pump-overview-v2/"
  // 里 indexOf("/hunan-pump-overview/") 是 -1，不报错）。现在换目录只改这张表。
  //
  // href 指向 v2；dirs 里同时列出旧目录 —— 旧的两个目录没删、仍可单独打开，如果不列进来，
  // 从旧目录打开时 prefixFor 会算成 ""，导航链接就指到旧目录底下去了。
  var steps = [
    { key: "overview", label: "大屏总览", href: "hunan-pump-overview-v2/index.html",
      dirs: ["hunan-pump-overview-v2", "hunan-pump-overview"] },
    { key: "station", label: "泵站态势", href: "pump-station-situation-v2/index.html",
      dirs: ["pump-station-situation-v2", "pump-station-situation"] },
    { key: "diagnosis", label: "诊断台 / 知识库", href: "diagnosis-flow-v2/index.html",
      // dirs 里 v2 必须排在旧目录前面：stepOfPath 用 indexOf("/" + dir + "/") 逐个试，
      // 而 "/diagnosis-flow-v2/" 里**包含** "/diagnosis-flow" 但不含 "/diagnosis-flow/"，
      // 所以两者不会互相误命中。顺序在这里不影响正确性，但保持"新的在前"的写法一致。
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
    if (window.BengDemoShell && typeof window.BengDemoShell.currentKey === "function") {
      return window.BengDemoShell.currentKey();
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

  // 外壳（index.html）要用同一张表建 iframe。这里同步暴露 —— 所以 index.html 必须先
  // 加载本文件、再跑它自己那段内联脚本。mount() 走 DOMContentLoaded，那时外壳已经把
  // BengDemoShell 挂上了，顺序不冲突。
  window.BengFlowSteps = steps;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
