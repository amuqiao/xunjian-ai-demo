/*
 * overview.js — 指挥大屏总览场景
 * 演示开场第一屏 + 闭环收尾回归屏。信息克制:左侧任务卡+翻牌,
 * 中间站场态势地图(唯一视觉重心),右侧疑点卡列表。
 */
(function () {
  "use strict";

  var DATA = window.DEMO_DATA;
  var el = window.DemoUtil.el;
  var root = document.querySelector('.scene[data-scene="overview"]');

  // 仅首次进入播放开场引入动画的标志位(模块内变量,不进 State)
  var introPlayed = false;

  // key -> { card, value } 翻牌元素引用,供闭环订阅刷新
  var metricEls = {};

  /* ============ 构建:左侧任务卡 ============ */
  function buildTaskCard() {
    var t = DATA.task;
    var rows = [
      ["巡检人", t.inspector],
      ["计划开始", t.planStart],
      ["实际开始", t.actualStart],
      ["实际结束", t.actualEnd],
      ["巡检路线点", t.routeCount + " 个"],
    ].map(function (r) {
      return el("div", { class: "ov-task-row" }, [
        el("span", { class: "ov-task-label", text: r[0] }),
        el("span", { class: "ov-task-value", text: r[1] }),
      ]);
    });
    return el("div", { class: "panel ov-task" }, [
      el("div", { class: "panel-title" }, [el("span", { text: "本轮任务" })]),
      el("div", { class: "ov-task-title", text: t.title }),
      el("div", { class: "ov-task-rows" }, rows),
      el("div", { class: "ov-task-note", text: t.note }),
    ]);
  }

  /* ============ 构建:左侧总览翻牌 ============ */
  function buildMetricCard(m) {
    var valueEl = el("div", { class: "ov-metric-value num " + m.tone, text: m.value });
    var children = [
      el("div", { class: "ov-metric-label", text: m.label }),
      valueEl,
    ];
    if (m.key === "closed") {
      children.push(el("span", { class: "ov-closed-badge badge ok", text: "闭环完成" }));
    }
    var card = el("div", { class: "card ov-metric", dataset: { key: m.key } }, children);
    metricEls[m.key] = { card: card, value: valueEl };
    return card;
  }

  function buildMetricsGrid() {
    return el("div", { class: "ov-metrics" }, DATA.overviewMetrics.map(buildMetricCard));
  }

  // 刷新翻牌数值与色调(移除旧 tone,附加新 tone)
  function setMetricValue(key, value, tone) {
    var ref = metricEls[key];
    ref.value.textContent = value;
    ["cyan", "amber", "green", "red", "blue"].forEach(function (t) {
      ref.value.classList.remove(t);
    });
    ref.value.classList.add(tone);
  }

  /* ============ 构建:右侧疑点卡列表 ============ */
  function buildFindingCard(f) {
    var toneClass = f.priority === "high" ? "danger" : "warn";
    var toneLabel = f.priority === "high" ? "高优先级" : "中优先级";
    return el(
      "div",
      {
        class: "card ov-finding" + (f.primary ? " is-primary" : ""),
        tabindex: "0",
        role: "button",
        "aria-label": f.title + "(下钻分析)",
        dataset: { area: f.area },
        onClick: function () { Router.go("analysis", { area: f.area }); },
        onKeydown: function (e) { if (e.key === "Enter") Router.go("analysis", { area: f.area }); },
      },
      [
        el("span", { class: "badge " + toneClass, text: toneLabel }),
        el("div", { class: "ov-finding-title", text: f.title }),
        el("div", { class: "ov-finding-desc", text: f.desc }),
      ]
    );
  }

  function buildFindingsPanel() {
    return el("div", { class: "panel ov-findings" }, [
      el("div", { class: "panel-title" }, [el("span", { text: "AI 疑点清单" })]),
      el("div", { class: "ov-findings-list" }, DATA.findings.map(buildFindingCard)),
    ]);
  }

  /* ============ 构建:中间站场态势地图 ============ */
  // 站场 SVG 需要真实 SVG 命名空间标签,el() 只建 HTML 节点,
  // 这里拼接原始 SVG 字符串,交由 innerHTML 按 HTML5 前景内容规则解析。
  function buildMapSvgMarkup() {
    var vb = DATA.siteMap.viewBox;
    var shapes = DATA.siteMap.shapes
      .map(function (s) {
        return (
          '<g class="ov-shape" data-area="' + s.area + '" tabindex="0" role="button" aria-label="' + s.label + '(下钻分析)">' +
          '<polygon class="ov-shape-poly" points="' + s.points + '"></polygon>' +
          '<text class="ov-shape-label" x="' + s.lx + '" y="' + s.ly + '">' + s.label + "</text>" +
          "</g>"
        );
      })
      .join("");
    var dot = DATA.siteMap.riskDot;
    return (
      '<svg class="ov-svg" viewBox="' + vb + '" preserveAspectRatio="xMidYMid meet" aria-label="站场态势地图">' +
      '<path class="ov-route" d="' + DATA.siteMap.route + '"></path>' +
      shapes +
      '<circle class="ov-riskdot" data-area="' + dot.area + '" cx="' + dot.cx + '" cy="' + dot.cy + '" r="' + dot.r + '" tabindex="0" role="button" aria-label="计量区高优先级疑点,进入分析"></circle>' +
      "</svg>"
    );
  }

  function buildMapPanel() {
    var svgHost = el("div", { class: "ov-svg-host", html: buildMapSvgMarkup() });
    var scanband = el("div", { class: "ov-scanband" });
    var toast = el("div", { class: "ov-toast card" }, [
      el("span", { class: "badge danger", text: "AI 提示" }),
      el("span", { class: "ov-toast-text", text: "AI 已发现 1 处高优先级疑点:计量区过滤器差压趋势异常" }),
    ]);
    var ctaBtn = el("button", {
      class: "action primary",
      type: "button",
      text: "进入巡检分析",
      onClick: function () { Router.go("analysis", { area: "metering" }); },
    });
    var panel = el("div", { class: "panel ov-map" }, [
      el("div", { class: "panel-title" }, [el("span", { text: "站场态势总览" }), ctaBtn]),
      el("div", { class: "ov-mapwrap" }, [svgHost, scanband, toast]),
    ]);
    return { panel: panel, scanband: scanband, toast: toast };
  }

  /* ============ 组装静态 DOM(一次性渲染进容器) ============ */
  var taskCard = buildTaskCard();
  var metricsGrid = buildMetricsGrid();
  var findingsPanel = buildFindingsPanel();
  var mapBundle = buildMapPanel();

  root.appendChild(
    el("div", { class: "ov-grid" }, [
      el("div", { class: "ov-left" }, [taskCard, metricsGrid]),
      mapBundle.panel,
      findingsPanel,
    ])
  );

  /* ============ 地图区域交互 ============ */
  var shapeEls = Array.prototype.slice.call(root.querySelectorAll(".ov-shape"));
  var riskDotEl = root.querySelector(".ov-riskdot");

  // 按 State.currentArea 高亮聚焦区域(站场图形 + 计量区红点所在区一致时同时高亮)
  function focusArea(area) {
    shapeEls.forEach(function (g) {
      g.classList.toggle("is-active", g.dataset.area === area);
    });
  }

  shapeEls.forEach(function (g) {
    var area = g.dataset.area;
    g.addEventListener("click", function () { Router.go("analysis", { area: area }); });
    g.addEventListener("keydown", function (e) { if (e.key === "Enter") Router.go("analysis", { area: area }); });
  });
  riskDotEl.addEventListener("click", function () {
    Router.go("analysis", { area: riskDotEl.dataset.area });
  });
  riskDotEl.addEventListener("keydown", function (e) {
    if (e.key === "Enter") Router.go("analysis", { area: riskDotEl.dataset.area });
  });

  DemoState.subscribe("currentArea", focusArea);

  /* ============ 闭环订阅:report 归档/结论回流,overview 被动响应 ============ */
  var closedMetricCard = metricEls.closed.card;

  // 复检结论选定:待复检翻牌归零,闭环率按结论对应比例刷新
  DemoState.subscribe("decision", function (value) {
    if (value) {
      setMetricValue("recheck", "0", "green");
      setMetricValue("closed", DATA.closedRate[value], "green");
    } else {
      // reset:恢复翻牌初始态(可逆,避免停留在已闭环显示)
      var ri = DATA.overviewMetrics.filter(function (m) { return m.key === "recheck"; })[0];
      var ci = DATA.overviewMetrics.filter(function (m) { return m.key === "closed"; })[0];
      setMetricValue("recheck", ri.value, ri.tone);
      setMetricValue("closed", ci.value, ci.tone);
    }
  });

  // 报告归档:闭环率翻牌变 100%,计量区红点转绿,亮起“闭环完成”徽章
  DemoState.subscribe("archived", function (value) {
    if (value) {
      setMetricValue("closed", DATA.closedRate.archived, "green");
      riskDotEl.classList.add("is-closed");
      closedMetricCard.classList.add("is-archived");
    } else {
      // reset:清除闭环视觉(闭环率翻牌恢复交给 decision 订阅)
      riskDotEl.classList.remove("is-closed");
      closedMetricCard.classList.remove("is-archived");
    }
  });

  /* ============ 开场引入动画(仅首次进入播放,约 2.5s) ============ */
  function playIntro() {
    // ① 扫描光带扫过(0 ~ 1.2s,叠加更醒目的一次性扫描)
    mapBundle.scanband.classList.add("is-intro");
    window.setTimeout(function () {
      mapBundle.scanband.classList.remove("is-intro");
      // ② 计量区红点脉冲亮起
      riskDotEl.classList.add("is-live");
    }, 1200);
    // ③ 冒出高优先级疑点提示
    window.setTimeout(function () {
      mapBundle.toast.classList.add("show");
    }, 1500);
    // 提示停留一段时间后淡出,之后仅保留红点常亮脉冲
    window.setTimeout(function () {
      mapBundle.toast.classList.remove("show");
    }, 4200);
  }

  /* ============ 场景注册 ============ */
  Router.register("overview", {
    onEnter: function () {
      focusArea(DemoState.get("currentArea"));
      if (!introPlayed) {
        introPlayed = true;
        playIntro();
      } else {
        // 非首次进入(如从报告页退回):不重播开场动画,直接保持红点常亮脉冲
        riskDotEl.classList.add("is-live");
      }
    },
  });
})();
