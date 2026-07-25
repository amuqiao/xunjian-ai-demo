/*
 * analysis.js — 巡检分析工作台场景。
 * 场景灵魂:左侧"表单第 73 项 = 正常" 与右侧"差压趋势逼近 0.1MPa 阈值" 的正面对撞。
 * 中间连接卡随 currentArea 切换语气:
 *   - 计量区(主线,非 auxiliaryOnly):红色冲突警示卡,持续提醒表单与趋势的矛盾。
 *   - 其它区域(auxiliaryOnly):替换为青色"对照视角"说明卡,隐藏冲突提示。
 *
 * 刷新策略:不使用 DemoState.subscribe,而是在每个会改变状态的动作(选项、切换区域、
 * 切换关键帧)之后主动调用一次 refreshAll();onEnter 统一收尾再调用一次,
 * 覆盖"值未变化导致 set() 不触发订阅"的场景。这是契约允许的两种刷新方式之一。
 */
(function () {
  "use strict";

  var DATA = window.DEMO_DATA;
  var el = DemoUtil.el;

  var root = document.querySelector('.scene[data-scene="analysis"]');

  // 由 siteMap.shapes 反查区域短名(避免另起硬编码业务字符串)
  var areaShortLabel = {};
  DATA.siteMap.shapes.forEach(function (s) {
    areaShortLabel[s.area] = s.label;
  });

  /* ============ 静态骨架 ============ */

  var areaBadge = el("span", { class: "badge" });

  var topbar = el("div", { class: "an-topbar" }, [
    el("div", { class: "an-topbar-title" }, [
      el("h2", { text: "巡检分析工作台" }),
      areaBadge,
    ]),
    el("button", {
      class: "action an-back-btn",
      type: "button",
      text: "← 返回大屏",
      onClick: function () { Router.go("overview"); },
    }),
  ]);

  // ---- 左栏:精选巡检项表格 ----
  var tbody = el("tbody");
  var rowRefs = [];
  DATA.inspectionRows.forEach(function (row) {
    var resultCell = row.result === "正常"
      ? el("span", { class: "badge ok", text: "正常" })
      : el("span", { class: "an-plain-result", text: row.result });
    var cellChildren = [resultCell];
    if (row.hot) {
      cellChildren.push(el("span", { class: "an-conflict-flag", text: "⚠ 与趋势冲突" }));
    }
    var tr = el("tr", {
      class: "an-row" + (row.hot ? " hot" : ""),
      tabindex: "0",
      role: "button",
      "aria-label": "第" + row.no + "项 " + row.device + " " + row.check,
      dataset: { item: row.item },
      onClick: function () { selectItem(row.item); },
      onKeydown: function (e) { if (e.key === "Enter") selectItem(row.item); },
    }, [
      el("td", { text: String(row.no) }),
      el("td", { text: row.area }),
      el("td", { text: row.device }),
      el("td", { text: row.check }),
      el("td", { class: "an-result-cell" }, cellChildren),
    ]);
    rowRefs.push({ key: row.item, el: tr });
    tbody.appendChild(tr);
  });

  var evidenceText = el("p", { class: "an-evidence-text" });
  var evidenceTags = el("div", { class: "an-tags" });

  var leftPanel = el("section", { class: "an-left panel" }, [
    el("div", { class: "panel-title" }, [
      el("span", { text: "精选巡检项 · 第73项高亮" }),
      el("span", { class: "an-hint", text: "点击可切换证据" }),
    ]),
    el("div", { class: "an-table-wrap" }, [
      el("table", { class: "an-table" }, [
        el("thead", {}, el("tr", {}, [
          el("th", { text: "序号" }), el("th", { text: "区域" }), el("th", { text: "设备" }),
          el("th", { text: "检查项" }), el("th", { text: "结果" }),
        ])),
        tbody,
      ]),
    ]),
    el("div", { class: "an-evidence card" }, [
      el("div", { class: "an-evidence-label", text: "证据摘要" }),
      evidenceText,
      evidenceTags,
    ]),
  ]);

  // ---- 中栏:冲突 / 对照连接卡 ----
  var midCard = el("div", { class: "an-mid-card" });
  var midColumn = el("div", { class: "an-mid" }, midCard);

  // ---- 右栏上:差压趋势 ----
  var dpBtn = el("button", { class: "an-toggle-btn", type: "button", text: "差压", onClick: function () { selectItem("dp"); } });
  var pressureBtn = el("button", { class: "an-toggle-btn", type: "button", text: "压力", onClick: function () { selectItem("pressure"); } });
  var replayBtn = el("button", { class: "an-toggle-btn", type: "button", text: "↻ 趋势回放", onClick: function () { replayTrend(); } });

  var trendTitle = el("span", { text: "过滤器差压趋势 · 72h" });
  var trendCanvas = el("div", { class: "an-trend-canvas" });
  var trendSummary = el("p", { class: "an-trend-summary" });

  var statLatest = el("span", { class: "num cyan" });
  var statMax = el("span", { class: "num amber" });
  var statMargin = el("span", { class: "badge warn" });
  var statQuality = el("span", { class: "num green" });

  var trendPanel = el("section", { class: "an-trend panel" }, [
    el("div", { class: "panel-title" }, [
      trendTitle,
      el("div", { class: "an-btn-group" }, [dpBtn, pressureBtn, replayBtn]),
    ]),
    trendCanvas,
    trendSummary,
    el("div", { class: "an-trend-stats" }, [
      el("div", { class: "an-stat card" }, [el("small", { text: "最新值" }), statLatest]),
      el("div", { class: "an-stat card" }, [el("small", { text: "72h最大值" }), statMax]),
      el("div", { class: "an-stat card" }, [el("small", { text: "阈值余量" }), statMargin]),
      el("div", { class: "an-stat card" }, [el("small", { text: "数据质量" }), statQuality]),
    ]),
  ]);

  // ---- 右栏下:现场关键帧 ----
  var frameBtns = {};
  function makeFrameBtn(label, key) {
    var b = el("button", {
      class: "an-toggle-btn", type: "button", text: label,
      onClick: function () { setFrame(key); },
    });
    frameBtns[key] = b;
    return b;
  }
  var zoomBtn = el("button", {
    class: "an-toggle-btn", type: "button", text: "⤢ 放大",
    onClick: function () {
      var area = DemoState.get("currentArea");
      var frameKey = DemoState.get("frameKey");
      var frame = DATA.frameSources[area][frameKey];
      DemoUI.openImage(frame.src, frame.title);
    },
  });

  var frameImg = el("img", { class: "an-frame-img", alt: "现场关键帧" });
  var bboxLabel = el("span", { class: "an-bbox-label" });
  var bbox = el("div", { class: "an-bbox" }, bboxLabel);
  var frameSceneEl = el("span", { class: "an-frame-scene" });
  var frameTitleEl = el("span", { class: "an-frame-title" });

  var framePanel = el("section", { class: "an-frame panel" }, [
    el("div", { class: "panel-title" }, [
      el("span", { text: "现场关键帧" }),
      el("div", { class: "an-btn-group" }, [
        makeFrameBtn("当前帧", "current"),
        makeFrameBtn("对比帧", "compare"),
        makeFrameBtn("PLC帧", "plc"),
        zoomBtn,
      ]),
    ]),
    el("div", { class: "an-frame-stage" }, [frameImg, bbox]),
    el("div", { class: "an-frame-caption" }, [frameTitleEl, frameSceneEl]),
  ]);

  var rightColumn = el("div", { class: "an-right" }, [trendPanel, framePanel]);

  var body = el("div", { class: "an-body" }, [leftPanel, midColumn, rightColumn]);

  // ---- 底部操作栏 ----
  var primaryCtaBtn = el("button", { class: "action primary an-primary-cta", type: "button" });
  primaryCtaBtn.addEventListener("click", function () {
    var areaInfo = DATA.areas[DemoState.get("currentArea")];
    if (areaInfo.auxiliaryOnly) {
      enterArea("metering");
    } else {
      Router.go("recheck");
    }
  });

  var actions = el("div", { class: "an-actions" }, [
    el("button", {
      class: "action",
      type: "button",
      text: "查看依据",
      onClick: function () {
        var info = DATA.itemDetails[DemoState.get("selectedItem")];
        DemoUI.openDrawer(info.evidence);
      },
    }),
    primaryCtaBtn,
  ]);

  root.appendChild(el("div", { class: "an-wrap" }, [topbar, body, actions]));

  /* ============ 动态刷新 ============ */

  function flash(node) {
    node.classList.remove("an-flash");
    // 强制重排,确保动画可以重新触发
    void node.offsetWidth;
    node.classList.add("an-flash");
    window.setTimeout(function () { node.classList.remove("an-flash"); }, 900);
  }

  function onTrendWindowClick() {
    selectItem("dp");
    var row = rowRefs.filter(function (r) { return r.key === "dp"; })[0];
    flash(row.el);
    flash(midCard);
  }

  function refreshAll() {
    var area = DemoState.get("currentArea");
    var areaInfo = DATA.areas[area];
    var selected = DemoState.get("selectedItem");
    var itemInfo = DATA.itemDetails[selected];
    var trendKey = DemoState.get("currentTrend");
    var frameKey = DemoState.get("frameKey");
    var isAux = areaInfo.auxiliaryOnly;

    // 顶部聚焦区域徽标
    areaBadge.className = "badge " + areaInfo.badgeTone;
    areaBadge.textContent = areaShortLabel[area] + " · " + areaInfo.badge;

    // 辅助(对照)区不聚焦具体巡检项:清除表格选中、按钮激活,证据改用区域说明,
    // 避免出现"差压按钮仍 active 但趋势已是本区曲线"的不一致。
    var effectiveSelected = isAux ? null : selected;

    // 左栏表格选中态
    rowRefs.forEach(function (r) { r.el.classList.toggle("selected", r.key === effectiveSelected); });

    // 证据摘要 + 标签
    evidenceTags.innerHTML = "";
    if (isAux) {
      evidenceText.textContent = areaInfo.evidence;
      areaInfo.tags.forEach(function (t) { evidenceTags.appendChild(el("span", { class: "tag", text: t })); });
    } else {
      evidenceText.textContent = itemInfo.evidence;
      itemInfo.tags.forEach(function (t) { evidenceTags.appendChild(el("span", { class: "tag", text: t })); });
    }

    // 差压/压力切换按钮激活态(仅主线)
    dpBtn.classList.toggle("active", !isAux && selected === "dp");
    pressureBtn.classList.toggle("active", !isAux && selected === "pressure");

    // 趋势渲染
    var tr = DemoUtil.renderTrend(trendCanvas, trendKey, { interactive: true, onWindowClick: onTrendWindowClick });
    trendTitle.textContent = tr.title;
    trendSummary.textContent = tr.summary;
    statLatest.textContent = tr.latest;
    statMax.textContent = tr.max;
    statMargin.textContent = tr.marginText;
    statQuality.textContent = tr.quality;

    // 中栏:冲突 / 对照
    if (isAux) {
      midCard.className = "an-mid-card is-contrast";
      midCard.innerHTML =
        '<div class="an-mid-icon">●</div>' +
        '<div class="an-mid-headline">AI 按风险聚焦 · ' + areaShortLabel[area] + '为正常对照</div>' +
        '<div class="an-mid-sub">' + areaInfo.evidence + '</div>';
    } else {
      midCard.className = "an-mid-card is-conflict";
      if (selected === "dp") {
        midCard.innerHTML =
          '<div class="an-mid-icon">⚠</div>' +
          '<div class="an-mid-headline">表单第73项 = 正常 ↔ 差压趋势 ' + tr.latest + '</div>' +
          '<div class="an-mid-sub">阈值 0.1MPa,余量仅 ' + tr.marginText + ' · ' + tr.summary + '</div>';
      } else {
        midCard.innerHTML =
          '<div class="an-mid-icon">⚠</div>' +
          '<div class="an-mid-headline">主线冲突未解除:第73项差压填写正常,但趋势逼近0.1MPa阈值</div>' +
          '<div class="an-mid-sub">当前查看:' + itemInfo.evidence + '</div>';
      }
    }

    // 右栏下:关键帧
    var frame = DATA.frameSources[area][frameKey];
    frameImg.src = frame.src;
    frameImg.alt = frame.title;
    frameTitleEl.textContent = frame.title;
    frameSceneEl.textContent = frame.scene;
    bbox.style.display = frame.showBbox ? "" : "none";
    bboxLabel.textContent = frame.label;
    Object.keys(frameBtns).forEach(function (k) { frameBtns[k].classList.toggle("active", k === frameKey); });

    // 底部主 CTA:主线(计量区)/对照区文案切换
    if (isAux) {
      primaryCtaBtn.textContent = "回到计量区主线";
    } else {
      primaryCtaBtn.textContent = "生成复检清单";
    }
  }

  /* ============ 动作:改变状态并刷新 ============ */

  function selectItem(key) {
    var info = DATA.itemDetails[key];
    DemoState.set("selectedItem", key);
    DemoState.set("currentTrend", info.trendKey);
    DemoState.set("frameKey", info.image);
    refreshAll();
  }

  function setFrame(key) {
    DemoState.set("frameKey", key);
    refreshAll();
  }

  function replayTrend() {
    refreshAll();
    trendCanvas.classList.remove("is-replay");
    void trendCanvas.offsetWidth;
    trendCanvas.classList.add("is-replay");
    window.setTimeout(function () { trendCanvas.classList.remove("is-replay"); }, 900);
  }

  // 切换聚焦区域:计量区(主线)恢复到第73项差压;非计量区(对照)切到该区自身趋势
  function enterArea(area) {
    DemoState.set("currentArea", area);
    var areaInfo = DATA.areas[area];
    if (areaInfo.auxiliaryOnly) {
      DemoState.set("currentTrend", areaInfo.trendKey);
      DemoState.set("frameKey", "current");
    } else {
      DemoState.set("selectedItem", "dp");
      DemoState.set("currentTrend", DATA.itemDetails.dp.trendKey);
      DemoState.set("frameKey", DATA.itemDetails.dp.image);
    }
    refreshAll();
  }

  /* ============ 场景注册 ============ */

  Router.register("analysis", {
    onEnter: function (ctx) {
      if (ctx.area) {
        enterArea(ctx.area);
      } else {
        refreshAll();
      }
    },
  });
})();
