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
    { key: "agent", label: "智能助手", href: "智能巡检数智员工-泵.html", navGroup: "primary",
      dirs: [] },
    { key: "diagnosis", label: "诊断台", href: "diagnosis-flow-v2/index.html", navGroup: "primary",
      dirs: ["diagnosis-flow-v2", "diagnosis-flow"] },
    { key: "graph", label: "知识图谱", href: "kg-template/index.html", navGroup: "primary",
      dirs: ["kg-template"] },
    { key: "overview", label: "大屏总览", href: "hunan-pump-overview-v2/index.html",
      navGroup: "context", parentKey: "diagnosis",
      dirs: ["hunan-pump-overview-v2", "hunan-pump-overview"] },
    { key: "station", label: "泵站态势", href: "pump-station-situation-v2/index.html",
      navGroup: "context", parentKey: "diagnosis",
      dirs: ["pump-station-situation-v2", "pump-station-situation"] },
  ];
  var primarySteps = steps.filter(function (step) { return step.navGroup === "primary"; });

  function stepByKey(key) {
    return steps.filter(function (step) { return step.key === key; })[0] || null;
  }

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
    return step ? step.key : "agent";
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
    var activeStep = stepByKey(key);
    var activeNavKey = (activeStep && activeStep.parentKey) || key;
    var prefix = prefixFor(window.location.pathname);
    var nav = document.createElement("nav");
    nav.className = "inspection-flow-nav";
    nav.setAttribute("aria-label", "泵站演示组件切换");

    // 国家管网 logo。图片路径写在 CSS 的 background-image 里（相对样式表解析），
    // 这里只建一个空盒子 —— 不用 <img src>，那样就得在 JS 里算目录前缀。
    // aria-hidden：它是装饰，读屏不必念，条本身的 aria-label 已经说明了用途。
    var brand = document.createElement("div");
    brand.className = "flow-nav-brand";
    brand.setAttribute("aria-hidden", "true");
    nav.appendChild(brand);

    // 链接单独装一层：logo 是绝对定位脱离流的，链接组才能相对**视口**居中。
    // 直接把 a 挂在 nav 上、靠 justify-content:center 的话，居中基准会被 logo 挤偏。
    var links = document.createElement("div");
    links.className = "flow-nav-links";

    primarySteps.forEach(function (step) {
      var link = document.createElement("a");
      link.href = prefix + step.href;
      link.dataset.key = step.key;
      link.dataset.label = step.label;
      link.title = step.label;
      link.textContent = step.label;
      if (step.key === activeNavKey) link.className = "is-active";
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
      links.appendChild(link);
    });

    nav.appendChild(links);
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
