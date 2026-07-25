/*
 * shell-ui.js — 共享工具(DemoUtil) + 外壳级交互(DemoUI:Agent 抽屉、图片弹窗)
 * 由 T0 地基定义,供所有场景复用。
 */
(function () {
  "use strict";

  var DATA = window.DEMO_DATA;

  /* ============ DemoUtil:通用工具 ============ */

  // 轻量 DOM 创建。children 可为字符串 / 节点 / 数组。
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === "class") node.className = attrs[k];
        else if (k === "html") node.innerHTML = attrs[k];
        else if (k === "text") node.textContent = attrs[k];
        else if (k.slice(0, 2) === "on" && typeof attrs[k] === "function") {
          node.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
        } else if (k === "dataset") {
          Object.keys(attrs[k]).forEach(function (d) { node.dataset[d] = attrs[k][d]; });
        } else if (attrs[k] != null) {
          node.setAttribute(k, attrs[k]);
        }
      });
    }
    appendChildren(node, children);
    return node;
  }

  function appendChildren(node, children) {
    if (children == null) return;
    (Array.isArray(children) ? children : [children]).forEach(function (c) {
      if (c == null) return;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
  }

  function formatTrendValue(value, unit) {
    if (unit === "%") return Math.round(value) + "%";
    if (unit === "mm") return Math.round(value) + "mm";
    return value.toFixed(3) + unit;
  }

  /*
   * renderTrend(container, seriesKey, options)
   * 在 container 内渲染差压/参数趋势 SVG(analysis 主图与 recheck 小卡共用)。
   * options: { interactive?:bool, onWindowClick?:fn }
   * 返回 { latest, max, margin, marginText, quality, summary, hasWindow }。
   */
  function renderTrend(container, seriesKey, options) {
    options = options || {};
    var series = DATA.trendSeries[seriesKey];
    var left = 30, right = 610, top = 28, bottom = 180;
    var width = right - left, height = bottom - top;

    function valueToY(v) { return bottom - ((v - series.min) / (series.max - series.min)) * height; }
    function indexToX(i) { return left + (i / (series.points.length - 1)) * width; }

    var coords = series.points.map(function (p, i) {
      return { label: p[0], value: p[1], x: indexToX(i), y: valueToY(p[1]) };
    });
    var pathPoints = coords.map(function (p) { return p.x.toFixed(1) + "," + p.y.toFixed(1); }).join(" ");
    var thresholdY = valueToY(series.threshold);
    var values = series.points.map(function (p) { return p[1]; });
    var latest = values[values.length - 1];
    var max = Math.max.apply(null, values);
    var margin = series.safeSide === "below" ? series.threshold - latest : latest - series.threshold;
    var marginText = (margin >= 0 ? "" : "-") + formatTrendValue(Math.abs(margin), series.unit);
    var hotStart = series.window ? series.window.startIndex : -1;
    var hotEnd = series.window ? series.window.endIndex : -1;
    var first = coords[0], last = coords[coords.length - 1];

    var windowMarkup = "";
    if (series.window) {
      var ws = coords[series.window.startIndex], we = coords[series.window.endIndex];
      var wx = Math.max(left, ws.x - 14);
      var ww = Math.min(right - wx, we.x - ws.x + 28);
      var wyRaw = Math.min.apply(null, coords.slice(series.window.startIndex, series.window.endIndex + 1)
        .map(function (p) { return p.y; })) - 18;
      var wy = Math.max(top, wyRaw);
      var wh = bottom - wy + 6;
      windowMarkup =
        '<g class="trend-hotspot' + (options.interactive ? " is-interactive" : "") + '"' +
        (options.interactive ? ' tabindex="0" role="button" aria-label="异常窗口,点击联动表单"' : "") + '>' +
        '<rect class="danger-window" x="' + wx.toFixed(1) + '" y="' + wy.toFixed(1) +
        '" width="' + ww.toFixed(1) + '" height="' + wh.toFixed(1) + '" />' +
        '<text class="trend-window-label" x="' + wx.toFixed(1) + '" y="206">' + series.window.label + "</text>" +
        "</g>";
    }

    var pointsMarkup = coords.map(function (p, i) {
      var hot = i >= hotStart && i <= hotEnd;
      return '<circle class="trend-point' + (hot ? " hot" : "") + '" cx="' + p.x.toFixed(1) +
        '" cy="' + p.y.toFixed(1) + '" r="' + (hot ? 5 : 4) + '" />';
    }).join("");

    var labelsMarkup =
      '<text class="trend-axis-label" x="' + first.x.toFixed(1) + '" y="205">' + first.label + "</text>" +
      '<text class="trend-axis-label" x="' + (last.x - 84).toFixed(1) + '" y="205">' + last.label + "</text>" +
      '<text class="trend-value-label hot" x="' + (last.x - 72).toFixed(1) + '" y="' +
        Math.max(18, last.y - 12).toFixed(1) + '">' + formatTrendValue(latest, series.unit) + "</text>";

    var svg = container.querySelector("svg.trend-chart");
    if (!svg) {
      svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", "trend-chart");
      svg.setAttribute("viewBox", "0 0 640 220");
      svg.setAttribute("preserveAspectRatio", "none");
      svg.setAttribute("aria-label", "趋势图");
      container.appendChild(svg);
    }
    svg.innerHTML =
      '<line x1="30" y1="180" x2="610" y2="180" stroke="rgba(255,255,255,.16)" />' +
      '<line class="threshold" x1="30" x2="610" y1="' + thresholdY.toFixed(1) + '" y2="' + thresholdY.toFixed(1) + '" />' +
      windowMarkup +
      '<polyline class="trend-path" points="' + pathPoints + '" />' +
      pointsMarkup + labelsMarkup +
      '<text class="trend-threshold-label" x="32" y="' + Math.max(16, thresholdY - 10).toFixed(1) + '">阈值 ' +
        formatTrendValue(series.threshold, series.unit) + "</text>";

    if (options.interactive && options.onWindowClick && series.window) {
      var hotspot = svg.querySelector(".trend-hotspot");
      if (hotspot) {
        hotspot.addEventListener("click", options.onWindowClick);
        hotspot.addEventListener("keydown", function (e) {
          if (e.key === "Enter") options.onWindowClick(e);
        });
      }
    }

    return {
      latest: formatTrendValue(latest, series.unit),
      max: formatTrendValue(max, series.unit),
      margin: margin,
      marginText: marginText,
      quality: series.quality,
      summary: series.summary,
      title: series.title,
      unit: series.unit,
      hasWindow: !!series.window,
    };
  }

  window.DemoUtil = {
    el: el,
    append: appendChildren,
    formatTrendValue: formatTrendValue,
    renderTrend: renderTrend,
  };

  /* ============ DemoUI:外壳级交互 ============ */

  function q(id) { return document.getElementById(id); }

  // 抽屉/图片弹窗打开前的焦点,关闭后归还(WCAG 焦点管理)
  var drawerReturnFocus = null;
  var imageReturnFocus = null;

  function openDrawer(answerHint) {
    drawerReturnFocus = document.activeElement;
    q("drawerMask").classList.add("open");
    q("agentDrawer").classList.add("open");
    if (answerHint) setDrawerAnswer(answerHint);
    var first = q("agentDrawer").querySelector(".drawer-question");
    if (first) first.focus();
  }

  function closeDrawer() {
    q("drawerMask").classList.remove("open");
    q("agentDrawer").classList.remove("open");
    if (drawerReturnFocus && drawerReturnFocus.focus) drawerReturnFocus.focus();
    drawerReturnFocus = null;
  }

  function setDrawerAnswer(text) {
    q("drawerAnswer").textContent = text;
  }

  function renderDrawerQuestions() {
    var box = q("drawerQuestions");
    box.innerHTML = "";
    DATA.agentQA.forEach(function (item) {
      box.appendChild(el("button", {
        class: "drawer-question",
        type: "button",
        text: item.q,
        onClick: function () { setDrawerAnswer(item.a); },
      }));
    });
  }

  function openImage(src, title) {
    imageReturnFocus = document.activeElement;
    q("modalImage").src = src;
    q("modalTitle").textContent = title || "现场关键帧放大";
    q("imageModal").classList.add("open");
  }

  function closeImage() {
    q("imageModal").classList.remove("open");
    if (imageReturnFocus && imageReturnFocus.focus) imageReturnFocus.focus();
    imageReturnFocus = null;
  }

  window.DemoUI = {
    openDrawer: openDrawer,
    closeDrawer: closeDrawer,
    setDrawerAnswer: setDrawerAnswer,
    renderDrawerQuestions: renderDrawerQuestions,
    openImage: openImage,
    closeImage: closeImage,
  };

  // 外壳级事件绑定(抽屉遮罩、弹窗关闭、Esc)
  document.addEventListener("DOMContentLoaded", function () {
    renderDrawerQuestions();
    q("drawerMask").addEventListener("click", closeDrawer);
    q("closeDrawerBtn").addEventListener("click", closeDrawer);
    q("closeImageBtn").addEventListener("click", closeImage);
    q("imageModal").addEventListener("click", function (e) {
      if (e.target.id === "imageModal") closeImage();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { closeDrawer(); closeImage(); }
    });
  });
})();
