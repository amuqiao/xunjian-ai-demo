(function () {
  "use strict";

  var DATA = window.DEMO_V3_DATA;
  var state = initialState();
  var STORAGE_KEY = "xunjian-prototype-v3-state";
  var lastFocus = null;

  function initialState() {
    return {
      scene: "overview",
      currentArea: "metering",
      selectedItem: "dp",
      currentTrend: "filterDp",
      frameKey: "current",
      decision: "",
      archived: false,
      recheckReady: false,
    };
  }

  function q(id) {
    var node = document.getElementById(id);
    if (!node) throw new Error("[v3] 缺少节点: " + id);
    return node;
  }

  function qa(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        if (key === "class") node.className = attrs[key];
        else if (key === "text") node.textContent = attrs[key];
        else if (key === "html") node.innerHTML = attrs[key];
        else if (key === "dataset") {
          Object.keys(attrs[key]).forEach(function (d) { node.dataset[d] = attrs[key][d]; });
        } else if (key.slice(0, 2) === "on" && typeof attrs[key] === "function") {
          node.addEventListener(key.slice(2).toLowerCase(), attrs[key]);
        } else if (attrs[key] != null) {
          node.setAttribute(key, attrs[key]);
        }
      });
    }
    append(node, children);
    return node;
  }

  function append(node, children) {
    if (children == null) return;
    (Array.isArray(children) ? children : [children]).forEach(function (child) {
      if (child == null) return;
      node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
    });
  }

  function assertKey(obj, key, label) {
    if (!(key in obj)) throw new Error("[v3] 未知" + label + ": " + key);
    return obj[key];
  }

  function formatTrendValue(value, unit) {
    if (unit === "%") return Math.round(value) + "%";
    if (unit === "mm") return Math.round(value) + "mm";
    return value.toFixed(3) + unit;
  }

  function sceneIndex(scene) {
    return DATA.shell.sceneOrder.indexOf(scene);
  }

  function persistState() {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function resetDemo() {
    state = initialState();
    window.localStorage.removeItem(STORAGE_KEY);
    if (window.location.hash !== "#overview") window.location.hash = "overview";
    render();
  }

  function loadState() {
    var raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    var saved = JSON.parse(raw);
    Object.keys(saved).forEach(function (key) {
      if (key in state) state[key] = saved[key];
    });
  }

  function canVisit(scene) {
    if (scene === "overview" || scene === "analysis") return true;
    if (scene === "recheck") return state.recheckReady || !!state.decision || state.archived;
    if (scene === "report") return !!state.decision || state.archived;
    throw new Error("[v3] 未知场景: " + scene);
  }

  function nearestLegalScene(scene) {
    if (canVisit(scene)) return scene;
    if (scene === "report" && canVisit("recheck")) return "recheck";
    if (scene === "recheck" || scene === "report") return "analysis";
    return "overview";
  }

  function go(scene, opts) {
    assertKey(DATA.shell.sceneLabels, scene, "场景");
    scene = nearestLegalScene(scene);
    opts = opts || {};
    if (opts.area) {
      enterArea(opts.area, false);
      state.scene = scene;
    } else {
      if (scene === "analysis" && state.currentArea !== "metering") enterArea("metering", false);
      state.scene = scene;
    }
    if (window.location.hash !== "#" + scene) {
      window.location.hash = scene;
    }
    persistState();
    render();
  }

  function enterArea(area, shouldRender) {
    var areaInfo = assertKey(DATA.areas, area, "区域");
    state.currentArea = area;
    if (areaInfo.auxiliaryOnly) {
      state.currentTrend = areaInfo.trendKey;
      state.frameKey = "current";
    } else {
      state.selectedItem = "dp";
      state.currentTrend = DATA.analysis.itemDetails.dp.trendKey;
      state.frameKey = DATA.analysis.itemDetails.dp.image;
    }
    if (shouldRender !== false) render();
  }

  function selectItem(itemKey) {
    var detail = assertKey(DATA.analysis.itemDetails, itemKey, "巡检项");
    var row = DATA.analysis.inspectionRows.filter(function (item) { return item.item === itemKey; })[0];
    if (!row) throw new Error("[v3] 巡检表缺少条目: " + itemKey);
    state.selectedItem = itemKey;
    state.currentArea = row.areaKey;
    state.currentTrend = detail.trendKey;
    state.frameKey = detail.image;
    state.scene = "analysis";
    window.location.hash = "analysis";
    persistState();
    render();
  }

  function selectFrame(frameKey) {
    var frames = assertKey(DATA.analysis.frameSources, state.currentArea, "关键帧区域");
    assertKey(frames, frameKey, "关键帧");
    state.frameKey = frameKey;
    persistState();
    render();
  }

  function selectDecision(decision) {
    assertKey(DATA.recheck.decisionStatus, decision, "复检结论");
    state.decision = decision;
    state.archived = false;
    state.recheckReady = true;
    persistState();
    render();
  }

  function archiveReport() {
    if (!state.decision) {
      q("reportMainText").textContent = "报告仍为草稿。请先在复检工作台选择人工结论,再归档为案例。";
      q("archiveBtn").classList.add("attention");
      window.setTimeout(function () { q("archiveBtn").classList.remove("attention"); }, 900);
      return;
    }
    state.archived = true;
    persistState();
    render();
  }

  function renderShell() {
    q("brandSub").textContent = DATA.shell.siteName + " · " + DATA.shell.subtitle + " · 任务批次 " + DATA.shell.batch;
    q("clock").textContent = DATA.shell.clock + " · 任务批次 " + DATA.shell.batch;

    var status;
    if (state.archived) {
      status = "报告已归档为案例,闭环率 100%。";
    } else if (state.decision) {
      status = "已选择复检结论: " + DATA.recheck.decisionStatus[state.decision] + ",等待报告归档。";
    } else if (state.scene === "recheck") {
      status = "复检清单已生成,等待人工确认。";
    } else {
      status = "AI 已发现 1 处高优先级疑点,等待复检确认。";
    }
    q("statusLine").textContent = status;

    qa(".scene-nav-btn").forEach(function (btn) {
      var target = btn.dataset.sceneTarget;
      btn.classList.toggle("active", target === state.scene);
      btn.disabled = !canVisit(target);
      btn.title = btn.disabled ? "请先完成前序步骤" : DATA.shell.sceneLabels[target];
    });
    qa(".scene").forEach(function (scene) {
      scene.classList.toggle("active", scene.dataset.scene === state.scene);
    });
  }

  function renderOverview() {
    var task = DATA.overview.task;
    q("taskBatch").textContent = DATA.shell.batch;
    q("taskTitle").textContent = task.title;
    q("taskNote").textContent = task.note;
    q("taskRows").innerHTML = "";
    [
      ["巡检人", task.inspector],
      ["计划开始", task.planStart],
      ["实际开始", task.actualStart],
      ["实际结束", task.actualEnd],
      ["路线", task.routeCount],
    ].forEach(function (row) {
      q("taskRows").appendChild(el("div", { class: "task-row" }, [
        el("span", { text: row[0] }),
        el("strong", { text: row[1] }),
      ]));
    });

    var metricBox = q("overviewMetrics");
    metricBox.innerHTML = "";
    DATA.overview.metrics.forEach(function (m) {
      var value = m.value;
      var tone = m.tone;
      if (m.key === "recheck" && state.decision) {
        value = "0";
        tone = "green";
      }
      if (m.key === "closed") {
        if (state.archived) value = DATA.report.closedRate.archived;
        else if (state.decision) value = DATA.report.closedRate[state.decision];
        tone = "green";
      }
      metricBox.appendChild(el("div", { class: "metric-card card" }, [
        el("small", { text: m.label }),
        el("strong", { class: "num-" + tone, text: value }),
      ]));
    });

    qa(".map-area").forEach(function (node) {
      node.classList.toggle("active", node.dataset.area === state.currentArea);
    });
    q("riskDot").classList.toggle("closed", state.archived);
    q("mapToastText").textContent = state.archived
      ? "复检报告已归档,计量区疑点进入闭环案例库。"
      : "计量区过滤器差压趋势异常,建议生成复检清单。";

    var list = q("findingList");
    list.innerHTML = "";
    DATA.overview.findings.forEach(function (finding) {
      var closed = finding.primary && (state.decision || state.archived);
      var badgeClass = closed ? "badge ok" : finding.priority === "high" ? "badge danger" : "badge warn";
      var badgeText = closed ? (state.archived ? "已归档" : "已复检") : finding.priority === "high" ? "高优先级" : "中优先级";
      var resultText = "";
      if (closed) {
        resultText = state.archived
          ? "闭环结果: " + DATA.recheck.decisionStatus[state.decision] + " · 已归档为案例"
          : "复检结论: " + DATA.recheck.decisionStatus[state.decision];
      }
      list.appendChild(el("button", {
        class: "finding-card" + (finding.primary ? " primary" : "") + (closed ? " closed" : ""),
        type: "button",
        dataset: { area: finding.area },
        onClick: function () { go("analysis", { area: finding.area }); },
      }, [
        el("span", { class: badgeClass, text: badgeText }),
        el("strong", { text: finding.title }),
        el("small", { text: finding.desc }),
        closed ? el("div", { class: "finding-result", text: resultText }) : null,
      ]));
    });
  }

  function renderInspectionTable() {
    var tbody = q("inspectionTable").querySelector("tbody");
    tbody.innerHTML = "";
    DATA.analysis.inspectionRows.forEach(function (row) {
      var tr = el("tr", {
        class: (row.hot ? "hot " : "") + (state.selectedItem === row.item && !DATA.areas[state.currentArea].auxiliaryOnly ? "selected" : ""),
        tabindex: "0",
        role: "button",
        "aria-selected": state.selectedItem === row.item && !DATA.areas[state.currentArea].auxiliaryOnly ? "true" : "false",
        dataset: { item: row.item },
        onClick: function () { selectItem(row.item); },
        onKeydown: function (event) {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            selectItem(row.item);
          }
        },
      }, [
        el("td", { text: String(row.no) }),
        el("td", { text: row.area }),
        el("td", { text: row.device }),
        el("td", { text: row.check }),
        el("td", {}, [
          row.result === "正常" ? el("span", { class: "badge ok", text: "正常" }) : el("strong", { text: row.result }),
          row.hot ? el("small", { class: "conflict-note", text: "与趋势冲突" }) : null,
        ]),
      ]);
      tbody.appendChild(tr);
    });
  }

  function renderAnalysis() {
    var area = assertKey(DATA.areas, state.currentArea, "区域");
    q("analysisSubtitle").textContent = area.sub;
    q("areaBadge").className = "badge " + area.badgeTone;
    q("areaBadge").textContent = area.short + " · " + area.badge;

    renderInspectionTable();

    q("evidenceTags").innerHTML = "";
    if (area.auxiliaryOnly) {
      q("evidenceText").textContent = area.evidence;
      area.tags.forEach(function (tag, i) {
        q("evidenceTags").appendChild(el("span", { class: "tag" + (i === 0 ? " hot" : ""), text: tag }));
      });
      q("analysisPrimary").textContent = "回到计量区主线";
      q("analysisPrimary").dataset.action = "back-main";
    } else {
      var detail = assertKey(DATA.analysis.itemDetails, state.selectedItem, "巡检项");
      q("evidenceText").textContent = detail.evidence;
      detail.tags.forEach(function (tag, i) {
        q("evidenceTags").appendChild(el("span", { class: "tag" + (i === 0 ? " hot" : ""), text: tag }));
      });
      q("analysisPrimary").textContent = "生成复检清单";
      q("analysisPrimary").dataset.action = "go-recheck";
    }

    var trendInfo = renderTrend(q("trendCanvas"), state.currentTrend);
    q("trendTitle").textContent = trendInfo.title;
    renderTrendStats(trendInfo);
    renderConflict(area, trendInfo);
    renderFrame();

    qa("[data-trend]").forEach(function (btn) {
      btn.classList.toggle("active", state.currentTrend === btn.dataset.trend);
    });
    qa("[data-item='pressure']").forEach(function (btn) {
      btn.classList.toggle("active", state.selectedItem === "pressure" && !area.auxiliaryOnly);
    });
  }

  function renderTrend(container, seriesKey) {
    var series = assertKey(DATA.analysis.trendSeries, seriesKey, "趋势");
    var left = 30;
    var right = 610;
    var top = 28;
    var bottom = 180;
    var width = right - left;
    var height = bottom - top;

    function valueToY(value) {
      return bottom - ((value - series.min) / (series.max - series.min)) * height;
    }
    function indexToX(index) {
      return left + (index / (series.points.length - 1)) * width;
    }

    var coords = series.points.map(function (point, index) {
      return { label: point[0], value: point[1], x: indexToX(index), y: valueToY(point[1]) };
    });
    var pathPoints = coords.map(function (p) { return p.x.toFixed(1) + "," + p.y.toFixed(1); }).join(" ");
    var thresholdY = valueToY(series.threshold);
    var values = series.points.map(function (point) { return point[1]; });
    var latest = values[values.length - 1];
    var max = Math.max.apply(null, values);
    var margin = series.safeSide === "below" ? series.threshold - latest : latest - series.threshold;
    var marginText = (margin >= 0 ? "" : "-") + formatTrendValue(Math.abs(margin), series.unit);
    var first = coords[0];
    var last = coords[coords.length - 1];
    var windowMarkup = "";
    var hotStart = series.window ? series.window.startIndex : -1;
    var hotEnd = series.window ? series.window.endIndex : -1;

    if (series.window) {
      var ws = coords[series.window.startIndex];
      var we = coords[series.window.endIndex];
      var wx = Math.max(left, ws.x - 14);
      var ww = Math.min(right - wx, we.x - ws.x + 28);
      var wy = Math.max(top, Math.min.apply(null, coords.slice(series.window.startIndex, series.window.endIndex + 1).map(function (p) { return p.y; })) - 18);
      var wh = bottom - wy + 6;
      windowMarkup =
        '<g class="trend-hotspot" tabindex="0" role="button" aria-label="异常窗口,点击联动表单">' +
        '<rect class="danger-window" x="' + wx.toFixed(1) + '" y="' + wy.toFixed(1) + '" width="' + ww.toFixed(1) + '" height="' + wh.toFixed(1) + '"></rect>' +
        '<text class="trend-window-label" x="' + wx.toFixed(1) + '" y="206">' + series.window.label + "</text>" +
        "</g>";
    }

    var pointsMarkup = coords.map(function (p, i) {
      var hot = i >= hotStart && i <= hotEnd;
      return '<circle class="trend-point' + (hot ? " hot" : "") + '" cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="' + (hot ? 5 : 4) + '"></circle>';
    }).join("");

    container.innerHTML =
      '<svg class="trend-chart" viewBox="0 0 640 220" preserveAspectRatio="none" aria-label="' + series.title + '">' +
      '<line x1="30" y1="180" x2="610" y2="180" stroke="rgba(255,255,255,.16)"></line>' +
      '<line class="threshold" x1="30" x2="610" y1="' + thresholdY.toFixed(1) + '" y2="' + thresholdY.toFixed(1) + '"></line>' +
      windowMarkup +
      '<polyline class="trend-path" points="' + pathPoints + '"></polyline>' +
      pointsMarkup +
      '<text class="trend-axis-label" x="' + first.x.toFixed(1) + '" y="205">' + first.label + "</text>" +
      '<text class="trend-axis-label" x="' + (last.x - 84).toFixed(1) + '" y="205">' + last.label + "</text>" +
      '<text class="trend-value-label" x="' + (last.x - 72).toFixed(1) + '" y="' + Math.max(18, last.y - 12).toFixed(1) + '">' + formatTrendValue(latest, series.unit) + "</text>" +
      '<text class="trend-threshold-label" x="32" y="' + Math.max(16, thresholdY - 10).toFixed(1) + '">阈值 ' + formatTrendValue(series.threshold, series.unit) + "</text>" +
      "</svg>";

    var hotspot = container.querySelector(".trend-hotspot");
    if (hotspot) {
      hotspot.addEventListener("click", function () { selectItem("dp"); });
      hotspot.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectItem("dp");
        }
      });
    }

    return {
      title: series.title,
      latest: formatTrendValue(latest, series.unit),
      max: formatTrendValue(max, series.unit),
      margin: margin,
      marginText: marginText,
      quality: series.quality,
      summary: series.summary,
      hasWindow: !!series.window,
    };
  }

  function renderTrendStats(info) {
    var stats = [
      ["最新值", info.latest, "cyan"],
      ["72h最大", info.max, "amber"],
      ["阈值余量", info.marginText, info.margin >= 0 ? "green" : "red"],
      ["数据质量", info.quality, "green"],
    ];
    q("trendStats").innerHTML = "";
    stats.forEach(function (s) {
      q("trendStats").appendChild(el("div", { class: "trend-stat card" }, [
        el("small", { text: s[0] }),
        el("strong", { class: "num-" + s[2], text: s[1] }),
      ]));
    });
  }

  function renderConflict(area, trendInfo) {
    var card = q("conflictCard");
    card.classList.toggle("contrast", area.auxiliaryOnly);
    if (area.auxiliaryOnly) {
      q("conflictTitle").textContent = "AI 按风险聚焦 · " + area.short + "为对照";
      q("conflictText").textContent = area.evidence;
    } else if (state.selectedItem === "dp") {
      q("conflictTitle").textContent = "表单第73项 = 正常 ↔ 差压趋势 " + trendInfo.latest;
      q("conflictText").textContent = "阈值 0.1MPa,余量仅 " + trendInfo.marginText + " · " + trendInfo.summary;
    } else {
      q("conflictTitle").textContent = "主线冲突未解除";
      q("conflictText").textContent = "当前查看辅助项,第73项差压仍需回到主线复检。";
    }
  }

  function renderFrame() {
    var frames = assertKey(DATA.analysis.frameSources, state.currentArea, "关键帧区域");
    var frame = assertKey(frames, state.frameKey, "关键帧");
    q("frameImage").src = frame.src;
    q("frameImage").alt = frame.title;
    q("frameTitle").textContent = frame.title;
    q("frameScene").textContent = frame.scene;
    q("bboxLabel").textContent = frame.label;
    q("bbox").classList.toggle("hidden", !frame.showBbox);
    qa("[data-frame]").forEach(function (btn) {
      btn.classList.toggle("active", btn.dataset.frame === state.frameKey);
    });
  }

  function renderRecheck() {
    q("recheckSummary").innerHTML = "";
    DATA.recheck.summary.forEach(function (item) {
      q("recheckSummary").appendChild(el("div", { class: "summary-item" }, [
        el("strong", { text: item.label }),
        el("small", { text: item.value }),
      ]));
    });

    q("knowledgeList").innerHTML = "";
    DATA.recheck.knowledge.forEach(function (item) {
      q("knowledgeList").appendChild(el("div", { class: "knowledge-item" }, [
        el("span", { class: "badge info", text: item.type }),
        el("strong", { text: item.title }),
        el("small", { text: item.desc + " · " + item.source }),
      ]));
    });

    q("checkList").innerHTML = "";
    DATA.recheck.checklist.forEach(function (item) {
      var cls = "check-item" + (item.auto ? "" : " manual") + (state.decision ? " confirmed" : "");
      q("checkList").appendChild(el("div", { class: cls }, [
        el("span", { text: item.text }),
        el("small", { text: state.decision ? "已纳入报告草稿" : item.auto ? "AI 自动生成待核" : "人工复核待办" }),
      ]));
    });

    q("decisionRow").innerHTML = "";
    DATA.recheck.decisions.forEach(function (decision) {
      q("decisionRow").appendChild(el("button", {
        class: "decision-btn" + (state.decision === decision.key ? " active" : ""),
        type: "button",
        dataset: { decision: decision.key },
        onClick: function () { selectDecision(decision.key); },
      }, decision.label));
    });

    q("decisionLabel").textContent = state.decision ? DATA.recheck.decisionStatus[state.decision] : "请选择结论";
    q("recheckStatus").className = state.decision ? "badge ok" : "badge warn";
    q("recheckStatus").textContent = state.decision ? "已选择: " + DATA.recheck.decisionStatus[state.decision] : "待人工确认";
  }

  function renderReport() {
    var draftKey = state.decision ? state.decision : "pending";
    var draft = assertKey(DATA.report.drafts, draftKey, "报告草稿");
    q("reportVersion").textContent = DATA.report.version;
    q("reportMainText").textContent = draft.main;
    q("reportBullets").innerHTML = "";
    draft.bullets.forEach(function (line) {
      q("reportBullets").appendChild(el("li", { text: line }));
    });

    q("reportSummary").textContent = state.decision ? "已生成" : "待生成";
    q("reportHandover").textContent = draft.handover;
    q("reportArchive").textContent = state.archived ? "已归档" : "未归档";
    q("reportStamp").className = state.archived ? "badge ok" : state.decision ? "badge warn" : "badge info";
    q("reportStamp").textContent = state.archived ? "已归档" : state.decision ? "报告草稿" : "等待结论";
    q("archiveBtn").disabled = !state.decision || state.archived;

    q("caseTags").innerHTML = "";
    DATA.report.caseTags.forEach(function (tag, i) {
      q("caseTags").appendChild(el("span", { class: "tag" + (i === 0 ? " hot" : ""), text: tag }));
    });
  }

  function renderFlow() {
    var activeMap = {
      overview: "analysis",
      analysis: "evidence",
      recheck: state.decision ? "confirm" : "recheck",
      report: state.archived ? "report" : "confirm",
    };
    var activeKey = state.archived && state.scene === "overview" ? "closed" : activeMap[state.scene];
    var activeIndex = DATA.shell.flowSteps.map(function (s) { return s.key; }).indexOf(activeKey);
    q("flowTrack").innerHTML = "";
    DATA.shell.flowSteps.forEach(function (step, index) {
      var cls = "flow-step";
      if (index < activeIndex) cls += " done";
      if (index === activeIndex) cls += " active";
      q("flowTrack").appendChild(el("div", { class: cls, dataset: { idx: String(index + 1) } }, [
        el("strong", { text: step.label }),
        el("small", { text: step.desc }),
      ]));
    });
  }

  function renderDrawer() {
    q("drawerQuestions").innerHTML = "";
    DATA.shell.agentQA.forEach(function (item) {
      q("drawerQuestions").appendChild(el("button", {
        class: "drawer-question",
        type: "button",
        onClick: function () { q("drawerAnswer").textContent = item.a; },
      }, item.q));
    });
  }

  function render() {
    renderShell();
    renderOverview();
    renderAnalysis();
    renderRecheck();
    renderReport();
    renderFlow();
  }

  function openDrawer() {
    lastFocus = document.activeElement;
    q("drawerMask").classList.add("open");
    q("agentDrawer").classList.add("open");
    var first = q("agentDrawer").querySelector("button");
    (first || q("agentDrawer")).focus();
  }

  function closeDrawer() {
    if (!q("agentDrawer").classList.contains("open")) return;
    q("drawerMask").classList.remove("open");
    q("agentDrawer").classList.remove("open");
    restoreFocus();
  }

  function openImage() {
    var frames = assertKey(DATA.analysis.frameSources, state.currentArea, "关键帧区域");
    var frame = assertKey(frames, state.frameKey, "关键帧");
    lastFocus = document.activeElement;
    q("modalImage").src = frame.src;
    q("modalTitle").textContent = frame.title + " · " + frame.scene;
    q("imageModal").classList.add("open");
    q("imageModal").querySelector("button").focus();
  }

  function closeImage() {
    if (!q("imageModal").classList.contains("open")) return;
    q("imageModal").classList.remove("open");
    restoreFocus();
  }

  function restoreFocus() {
    if (lastFocus && lastFocus.focus) lastFocus.focus();
    lastFocus = null;
  }

  function activeDialog() {
    if (q("agentDrawer").classList.contains("open")) return q("agentDrawer");
    if (q("imageModal").classList.contains("open")) return q("imageModal");
    return null;
  }

  function focusableIn(node) {
    return qa('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])', node)
      .filter(function (item) { return !item.disabled && item.getClientRects().length > 0; });
  }

  function trapDialogFocus(event) {
    var dialog = activeDialog();
    if (!dialog || event.key !== "Tab") return;
    var items = focusableIn(dialog);
    if (!items.length) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    var first = items[0];
    var last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function isInteractiveTarget(target) {
    var tag = target.tagName;
    return tag === "BUTTON" || tag === "A" || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
  }

  function handleAction(action) {
    if (action === "go-analysis") go("analysis", { area: "metering" });
    else if (action === "go-recheck") {
      state.recheckReady = true;
      persistState();
      go("recheck");
    }
    else if (action === "back-main") {
      enterArea("metering", false);
      go("analysis");
    } else if (action === "confirm-recheck") {
      if (!state.decision) {
        q("recheckStatus").className = "badge danger";
        q("recheckStatus").textContent = "请先选择结论";
        return;
      }
      go("report");
    } else if (action === "archive-report") archiveReport();
    else if (action === "back-overview") go("overview");
    else if (action === "open-drawer") openDrawer();
    else if (action === "close-drawer") closeDrawer();
    else if (action === "open-image") openImage();
    else if (action === "close-image") closeImage();
    else if (action === "replay-trend") {
      q("trendCanvas").classList.remove("replay");
      void q("trendCanvas").offsetWidth;
      q("trendCanvas").classList.add("replay");
    } else if (action === "reset-demo") resetDemo();
    else {
      throw new Error("[v3] 未知动作: " + action);
    }
  }

  function bindEvents() {
    qa("[data-scene-target]").forEach(function (btn) {
      btn.addEventListener("click", function () { go(btn.dataset.sceneTarget); });
    });
    qa("[data-action]").forEach(function (node) {
      node.addEventListener("click", function () { handleAction(node.dataset.action); });
    });
    qa(".map-area").forEach(function (node) {
      node.addEventListener("click", function () { go("analysis", { area: node.dataset.area }); });
      node.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          go("analysis", { area: node.dataset.area });
        }
      });
    });
    q("riskDot").addEventListener("click", function () { go("analysis", { area: "metering" }); });
    q("riskDot").addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        go("analysis", { area: "metering" });
      }
    });
    qa("[data-trend]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.currentArea = "metering";
        state.selectedItem = "dp";
        state.currentTrend = btn.dataset.trend;
        state.frameKey = "current";
        render();
      });
    });
    qa("[data-item]").forEach(function (btn) {
      btn.addEventListener("click", function () { selectItem(btn.dataset.item); });
    });
    qa("[data-frame]").forEach(function (btn) {
      btn.addEventListener("click", function () { selectFrame(btn.dataset.frame); });
    });
    q("drawerMask").addEventListener("click", closeDrawer);
    q("imageModal").addEventListener("click", function (event) {
      if (event.target.id === "imageModal") closeImage();
    });
    window.addEventListener("hashchange", function () {
      var scene = window.location.hash.replace("#", "");
      if (scene && scene !== state.scene) {
        assertKey(DATA.shell.sceneLabels, scene, "场景");
        state.scene = nearestLegalScene(scene);
        if (window.location.hash !== "#" + state.scene) window.location.hash = state.scene;
        persistState();
        render();
      }
    });
    window.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        closeDrawer();
        closeImage();
      }
      trapDialogFocus(event);
      var idx = Number(event.key) - 1;
      if (!activeDialog() && !isInteractiveTarget(event.target) && idx >= 0 && idx < DATA.shell.sceneOrder.length) {
        go(DATA.shell.sceneOrder[idx]);
      }
    });
  }

  function boot() {
    loadState();
    var initial = window.location.hash.replace("#", "");
    if (initial) {
      assertKey(DATA.shell.sceneLabels, initial, "场景");
      state.scene = nearestLegalScene(initial);
      if (window.location.hash !== "#" + state.scene) window.location.hash = state.scene;
    }
    renderDrawer();
    bindEvents();
    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
