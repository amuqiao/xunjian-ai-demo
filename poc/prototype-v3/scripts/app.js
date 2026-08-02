(function () {
  "use strict";

  var DATA = window.DEMO_V3_DATA;
  var state = initialState();
  var STORAGE_KEY = "xunjian-prototype-v3-state";
  var lastFocus = null;
  var charts = {};
  var LEGACY_SCENE_TARGETS = {
    analysis: "form",
    trend: "form",
    conflict: "form",
    vision: "form",
    confirm: "recheck",
    closed: "report",
  };

  function initialState() {
    var flow = primaryFlow();
    return {
      scene: "overview",
      currentArea: flow.areaKey,
      selectedItem: flow.itemKey,
      currentTrend: flow.trendKey,
      frameKey: flow.frameKey,
      decision: "",
      archived: false,
      agentContext: "current",
      recheckReady: false,
      evidenceDetail: "",
      overviewScope: "all",
      dashboardFocus: "issues",
      stepKey: "task",
      maxStepIndex: 0,
      browseMode: false,
    };
  }

  function q(id) {
    var node = document.getElementById(id);
    if (!node) throw new Error("[v3] 缺少节点: " + id);
    return node;
  }

  function requireEcharts() {
    if (!window.echarts) throw new Error("[v3] ECharts 未加载,请检查 vendor/echarts.min.js");
    return window.echarts;
  }

  function chart(id) {
    var echarts = requireEcharts();
    var node = q(id);
    if (!charts[id]) charts[id] = echarts.init(node, null, { renderer: "canvas" });
    return charts[id];
  }

  function resizeCharts() {
    Object.keys(charts).forEach(function (id) {
      charts[id].resize();
    });
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

  function primaryFlow() {
    return DATA.shell.primaryFlow;
  }

  function formatTrendValue(value, unit) {
    if (unit === "%") return Math.round(value) + "%";
    if (unit === "mm") return Math.round(value) + "mm";
    return value.toFixed(3) + unit;
  }

  function sceneIndex(scene) {
    return DATA.shell.sceneOrder.indexOf(scene);
  }

  function stepIndex(stepKey) {
    return DATA.shell.flowSteps.map(function (s) { return s.key; }).indexOf(stepKey);
  }

  function defaultStepForScene(scene) {
    if (scene === "overview") return "task";
    if (scene === "form") return "form";
    if (scene === "recheck") return "recheck";
    if (scene === "report") return "report";
    if (scene === "knowledge" || scene === "graph") return state && stepIndex(state.stepKey) >= 0 ? state.stepKey : "task";
    throw new Error("[v3] 未知场景: " + scene);
  }

  function setStep(stepKey, shouldProgress) {
    var idx = stepIndex(stepKey);
    if (idx < 0) throw new Error("[v3] 未知步骤: " + stepKey);
    state.stepKey = stepKey;
    if (shouldProgress !== false) state.maxStepIndex = Math.max(state.maxStepIndex, idx);
  }

  function markStep(stepKey) {
    setStep(stepKey, true);
  }

  function showStep(stepKey) {
    setStep(stepKey, false);
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
    var savedHadStep = Object.prototype.hasOwnProperty.call(saved, "stepKey");
    Object.keys(saved).forEach(function (key) {
      if (key in state) state[key] = saved[key];
    });
    var migratedAnalysis = state.scene === "analysis";
    state.scene = LEGACY_SCENE_TARGETS[state.scene] || state.scene;
    if (!(state.scene in DATA.shell.sceneLabels)) state.scene = "overview";
    if (state.agentContext !== "case") state.agentContext = "current";
    if (!state.archived) state.agentContext = "current";
    if (state.evidenceDetail !== "trend" && state.evidenceDetail !== "vision") state.evidenceDetail = "";
    if (state.overviewScope !== "area") state.overviewScope = "all";
    if (!DATA.dashboard.qualityMetrics.some(function (metric) { return metric.key === state.dashboardFocus; })) state.dashboardFocus = "issues";
    if (stepIndex(state.stepKey) < 0) state.stepKey = defaultStepForScene(state.scene);
    if (migratedAnalysis && !savedHadStep) showStep("form");
    if (typeof state.maxStepIndex !== "number") state.maxStepIndex = stepIndex(state.stepKey);
  }

  function canVisit(scene) {
    if (scene === state.scene) return true;
    if (scene === "overview" || scene === "form") return true;
    if (scene === "recheck") return isPrimaryArea(state.currentArea) && (state.maxStepIndex >= stepIndex("form") || state.recheckReady || !!state.decision || state.archived);
    if (scene === "report") return !!state.decision || state.archived;
    if (scene === "knowledge" || scene === "graph") return true;
    throw new Error("[v3] 未知场景: " + scene);
  }

  function nearestLegalScene(scene) {
    if (canVisit(scene)) return scene;
    if (scene === "report" && canVisit("recheck")) return "recheck";
    if (scene !== "overview") return "form";
    return "overview";
  }

  function go(scene, opts) {
    assertKey(DATA.shell.sceneLabels, scene, "场景");
    scene = nearestLegalScene(scene);
    opts = opts || {};
    var previousScene = state.scene;
    if (opts.area) {
      enterArea(opts.area, false);
      state.scene = scene;
    } else {
      state.scene = scene;
    }
    state.browseMode = !!opts.browseMode;
    markStep(opts.stepKey || defaultStepForScene(scene));
    if (window.location.hash !== "#" + scene) {
      window.location.hash = scene;
    }
    persistState();
    render();
    if (previousScene !== scene) q("stage").scrollTop = 0;
    scrollActiveSceneIntoView();
  }

  function scrollActiveSceneIntoView() {
    if (!window.matchMedia || !window.matchMedia("(max-width: 1180px)").matches) return;
    window.requestAnimationFrame(function () {
      var scene = document.querySelector(".scene.active");
      if (scene && scene.scrollIntoView) scene.scrollIntoView({ block: "start" });
    });
  }

  function enterArea(area, shouldRender) {
    var areaInfo = assertKey(DATA.areas, area, "区域");
    state.currentArea = area;
    if (areaInfo.auxiliaryOnly) {
      state.currentTrend = areaInfo.trendKey;
      state.frameKey = "current";
    } else {
      var flow = primaryFlow();
      state.selectedItem = flow.itemKey;
      state.currentTrend = flow.trendKey;
      state.frameKey = flow.frameKey;
    }
    if (shouldRender !== false) render();
  }

  function selectOverviewArea(area) {
    enterArea(area, false);
    state.scene = "overview";
    state.overviewScope = "area";
    state.browseMode = false;
    showStep(defaultStepForScene("overview"));
    if (window.location.hash !== "#overview") window.location.hash = "overview";
    persistState();
    render();
  }

  function openRiskFlow(area) {
    state.browseMode = false;
    go("form", { area: area || primaryFlow().areaKey, stepKey: "form" });
  }

  function browseArea(scene, area, stepKey) {
    enterArea(area || state.currentArea, false);
    state.scene = scene;
    state.browseMode = true;
    showStep(stepKey || defaultStepForScene(scene));
    if (window.location.hash !== "#" + scene) window.location.hash = scene;
    persistState();
    render();
    scrollActiveSceneIntoView();
  }

  function areaPrimaryAction() {
    openRiskFlow(q("selectedAreaPrimary").dataset.area || state.currentArea);
  }

  function switchFormArea(areaKey) {
    var area = assertKey(DATA.areas, areaKey, "区域");
    enterArea(areaKey, false);
    state.scene = "form";
    state.browseMode = area.auxiliaryOnly;
    showStep("form");
    if (window.location.hash !== "#form") window.location.hash = "form";
    persistState();
    render();
  }

  function inspectionRowsForArea(areaKey) {
    var rows = DATA.analysis.inspectionRows.filter(function (row) { return row.areaKey === areaKey; });
    if (!rows.length) throw new Error("[v3] 区域缺少巡检表行: " + areaKey);
    return rows;
  }

  function inspectionRowForItem(itemKey) {
    var row = DATA.analysis.inspectionRows.filter(function (item) { return item.item === itemKey; })[0];
    if (!row) throw new Error("[v3] 巡检表缺少条目: " + itemKey);
    return row;
  }

  function primaryFlowRow() {
    return inspectionRowForItem(primaryFlow().itemKey);
  }

  function primaryCaseKnowledge() {
    var flow = primaryFlow();
    var area = assertKey(DATA.areas, flow.areaKey, "主线区域");
    return assertKey(area, "caseKnowledge", "主线案例知识");
  }

  function isPrimaryArea(areaKey) {
    return areaKey === primaryFlow().areaKey;
  }

  function canUseCaseAgentContext(areaKey) {
    return state.archived && state.scene === "form" && isPrimaryArea(areaKey);
  }

  function setAgentContext(context) {
    if (context === "case" && !canUseCaseAgentContext(state.currentArea)) return;
    state.agentContext = context === "case" ? "case" : "current";
    var focusContext = state.agentContext;
    persistState();
    render();
    if (q("agentDrawer").classList.contains("open")) {
      q("drawerAnswer").textContent = drawerPromptText(drawerKnowledgeForArea(state.currentArea));
      var target = q("drawerContextToggle").querySelector("[data-context='" + focusContext + "']");
      if (target) target.focus();
    }
  }

  function drawerKnowledgeForArea(areaKey) {
    var area = assertKey(DATA.areas, areaKey, "区域");
    if (isPrimaryArea(areaKey)) {
      var knowledge = primaryCaseKnowledge();
      if (canUseCaseAgentContext(areaKey) && state.agentContext === "case") return {
        mode: knowledge.secondPass.label,
        summary: knowledge.secondPass.summary,
        sources: knowledge.secondPass.sources,
        questions: knowledge.secondPass.questions,
        caseTitle: knowledge.title,
        caseId: knowledge.caseId,
      };
      return {
        mode: knowledge.firstPass.label,
        summary: knowledge.firstPass.summary,
        sources: knowledge.firstPass.sources,
        questions: knowledge.firstPass.questions,
        caseTitle: "",
        caseId: "",
      };
    }
    return {
      mode: area.short + "辅助问答",
      summary: area.evidence,
      sources: area.assets.map(function (source) { return { text: source, type: "current" }; }),
      questions: area.questions,
      caseTitle: "",
      caseId: "",
    };
  }

  function itemDetailForCurrentArea(itemKey) {
    var row = DATA.analysis.inspectionRows.filter(function (item) {
      return item.item === itemKey && item.areaKey === state.currentArea;
    })[0];
    if (!row) return null;
    return DATA.analysis.itemDetails[itemKey] || null;
  }

  function browseRowsForArea(areaKey) {
    return inspectionRowsForArea(areaKey).map(function (row) {
      return {
        no: row.no,
        area: row.area,
        device: row.device,
        check: row.check,
        result: row.result,
        hot: false,
        item: row.item,
      };
    });
  }

  function selectItem(itemKey, targetScene) {
    var detail = assertKey(DATA.analysis.itemDetails, itemKey, "巡检项");
    var row = inspectionRowForItem(itemKey);
    state.selectedItem = itemKey;
    state.currentArea = row.areaKey;
    state.currentTrend = detail.trendKey;
    state.frameKey = detail.image;
    state.scene = targetScene || "form";
    state.browseMode = false;
    markStep(defaultStepForScene(state.scene));
    window.location.hash = state.scene;
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
    if (state.archived) return;
    state.decision = decision;
    state.archived = false;
    state.agentContext = "current";
    state.recheckReady = true;
    markStep("recheck");
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
    state.agentContext = "case";
    markStep("report");
    persistState();
    render();
  }

  function renderShell() {
    q("brandSub").textContent = DATA.shell.siteName + " · " + DATA.shell.subtitle + " · 任务批次 " + DATA.shell.batch;
    q("clock").textContent = DATA.shell.clock + " · 任务批次 " + DATA.shell.batch;

    var status;
    if (state.scene === "overview") {
      status = "巡检质量大屏已加载,可从异常点进入表单质检。";
    } else if (state.scene === "knowledge") {
      status = "知识库用于展示制度、指标口径和归档案例,当前为前端演示数据。";
    } else if (state.scene === "graph") {
      status = "知识节点关系用于展示经验沉淀,不代表已接入真实图数据库。";
    } else if (state.archived) {
      status = "报告已归档为案例,供后续表单质检命中相似案例。";
    } else if (state.decision) {
      status = "已选择复检结论: " + DATA.recheck.decisionStatus[state.decision] + ",等待报告归档。";
    } else if (state.scene === "recheck") {
      status = "复检清单已生成,等待人工确认。";
    } else {
      status = "表单质检工作台已加载,可并联查看时序、视觉、规则和 Agent 建议。";
    }
    q("statusLine").textContent = status;

    qa(".scene-nav-btn").forEach(function (btn) {
      var target = btn.dataset.sceneTarget;
      btn.classList.toggle("active", target === state.scene);
      var overviewFormShortcut = state.scene === "overview" && target === "form";
      btn.disabled = overviewFormShortcut || !canVisit(target);
      btn.title = overviewFormShortcut ? "请从右侧告警摘要进入表单质检" : btn.disabled ? "请先完成前序步骤" : DATA.shell.sceneLabels[target];
    });
    qa(".scene").forEach(function (scene) {
      scene.classList.toggle("active", scene.dataset.scene === state.scene);
    });
  }

  function renderAreaScope() {
    var list = q("areaScopeList");
    list.innerHTML = "";
    DATA.overview.areaOrder.forEach(function (areaKey) {
      var area = assertKey(DATA.areas, areaKey, "区域");
      list.appendChild(el("button", {
        class: "scope-item" + (state.currentArea === areaKey ? " active" : "") + (!area.auxiliaryOnly ? " risk" : ""),
        type: "button",
        onClick: function () { switchFormArea(areaKey); },
      }, [
        el("span", { class: "badge " + area.badgeTone, text: area.overviewStatus }),
        el("strong", { text: area.short }),
        el("small", { text: area.overviewDesc }),
      ]));
    });

    var assets = q("areaAssetList");
    var areaInfo = assertKey(DATA.areas, state.currentArea, "区域");
    assets.innerHTML = "";
    areaInfo.assets.forEach(function (asset) {
      assets.appendChild(el("span", { class: "asset-pill", text: asset }));
    });
  }

  function sourceClass(sourceType) {
    if (sourceType.indexOf("客户数据") >= 0 && sourceType.indexOf("待确认") < 0) return "source-real";
    if (sourceType.indexOf("待确认") >= 0) return "source-pending";
    return "source-demo";
  }

  function priorityTone(priority) {
    if (priority === "P1") return "danger";
    if (priority === "P2") return "warn";
    return "info";
  }

  function dashboardAreaSummary(areaKey) {
    var area = assertKey(DATA.areas, areaKey, "区域");
    return {
      badgeTone: area.badgeTone,
      overviewStatus: area.overviewStatus,
      overviewTitle: area.overviewTitle,
      overviewDesc: area.overviewDesc,
      overviewStats: area.overviewStats,
      tags: area.tags,
      overviewAction: area.overviewAction,
      targetArea: areaKey,
    };
  }

  function setDashboardFocus(metricKey) {
    if (!DATA.dashboard.qualityMetrics.some(function (metric) { return metric.key === metricKey; })) {
      throw new Error("[v3] 未知首页指标: " + metricKey);
    }
    state.dashboardFocus = metricKey;
    state.overviewScope = "all";
    persistState();
    render();
  }

  function focusDashboardArea(areaKey, metricKey) {
    enterArea(areaKey, false);
    state.scene = "overview";
    state.overviewScope = "area";
    if (metricKey) state.dashboardFocus = metricKey;
    state.browseMode = false;
    showStep("task");
    persistState();
    render();
  }

  function dashboardTaskMatchesFocus(item) {
    if (state.dashboardFocus === "duration") return item.issue.indexOf("时间") >= 0 || item.issue.indexOf("窗口") >= 0;
    if (state.dashboardFocus === "interval") return item.issue.indexOf("间隔") >= 0 || item.issue.indexOf("快检") >= 0;
    if (state.dashboardFocus === "offWindow") return item.issue.indexOf("视频") >= 0 || item.issue.indexOf("人员") >= 0;
    if (state.dashboardFocus === "aiAlerts") return item.areaKey === primaryFlow().areaKey || item.issue.indexOf("视频") >= 0;
    return true;
  }

  function metricByKey(key) {
    var metric = DATA.dashboard.qualityMetrics.filter(function (item) { return item.key === key; })[0];
    if (!metric) throw new Error("[v3] 首页指标缺失: " + key);
    return metric;
  }

  function metricNumber(key) {
    var raw = String(metricByKey(key).value).replace("%", "");
    var value = Number(raw);
    if (!Number.isFinite(value)) throw new Error("[v3] 首页指标不是数值: " + key);
    return value;
  }

  function chartTextColor() {
    return "#8ea9c8";
  }

  function chartGrid(extra) {
    var base = { left: 28, right: 14, top: 24, bottom: 20, containLabel: true };
    Object.keys(extra || {}).forEach(function (key) { base[key] = extra[key]; });
    return base;
  }

  function dashboardChartBase() {
    return {
      animationDuration: 700,
      textStyle: { color: chartTextColor(), fontFamily: "Inter, PingFang SC, Microsoft YaHei, Arial, sans-serif" },
      tooltip: {
        trigger: "item",
        backgroundColor: "rgba(6, 17, 31, 0.94)",
        borderColor: "rgba(37, 217, 255, 0.42)",
        textStyle: { color: "#eef7ff" },
      },
    };
  }

  function mergeOption(base, extra) {
    Object.keys(extra).forEach(function (key) { base[key] = extra[key]; });
    return base;
  }

  function renderDashboardCharts() {
    if (state.scene !== "overview") return;
    var chartsData = DATA.dashboard.businessCharts;
    var completion = metricNumber("completion");
    var trend = chartsData.taskTrend;
    var aiTrend = chartsData.aiModelTrend;

    chart("completionGauge").setOption(mergeOption(dashboardChartBase(), {
      color: ["#25d9ff", "rgba(142,169,200,.16)"],
      graphic: [{
        type: "text",
        left: "center",
        top: "42%",
        style: {
          text: completion.toFixed(1) + "%",
          fill: "#25d9ff",
          fontSize: 22,
          fontWeight: 900,
          textAlign: "center",
        },
      }, {
        type: "text",
        left: "center",
        top: "62%",
        style: {
          text: "完成率",
          fill: chartTextColor(),
          fontSize: 11,
          textAlign: "center",
        },
      }],
      series: [{
        type: "pie",
        radius: ["62%", "78%"],
        center: ["50%", "52%"],
        silent: true,
        label: { show: false },
        labelLine: { show: false },
        data: [
          { value: completion, name: "完成" },
          { value: 100 - completion, name: "未完成" },
        ],
      }],
    }));

    chart("resultPie").setOption(mergeOption(dashboardChartBase(), {
      color: ["#4ade80", "#fbbf24", "#25d9ff"],
      legend: { bottom: 0, itemWidth: 8, itemHeight: 8, textStyle: { color: chartTextColor(), fontSize: 11 } },
      series: [{
        type: "pie",
        radius: ["48%", "72%"],
        center: ["50%", "44%"],
        label: { color: "#eef7ff", formatter: "{b}\n{c}", fontSize: 11 },
        labelLine: { length: 8, length2: 4 },
        data: chartsData.resultDistribution,
      }],
    }));

    chart("workerScoreChart").setOption(mergeOption(dashboardChartBase(), {
      grid: chartGrid({ left: 8, top: 10, bottom: 4 }),
      xAxis: { type: "value", max: 100, splitLine: { lineStyle: { color: "rgba(148,198,255,.12)" } }, axisLabel: { color: chartTextColor() } },
      yAxis: {
        type: "category",
        inverse: true,
        data: DATA.dashboard.workerQualityRanking.map(function (item) { return item.name; }),
        axisLabel: { color: "#eef7ff", fontWeight: 700 },
        axisTick: { show: false },
        axisLine: { show: false },
      },
      series: [{
        type: "bar",
        barWidth: 10,
        data: DATA.dashboard.workerQualityRanking.map(function (item) { return item.score; }),
        itemStyle: { borderRadius: 6, color: "#25d9ff" },
        label: { show: true, position: "right", color: "#25d9ff", fontWeight: 800 },
      }],
    }));

    chart("anomalyTypeChart").setOption(mergeOption(dashboardChartBase(), {
      color: ["#ff5c7a"],
      grid: chartGrid({ left: 12, right: 8, top: 18, bottom: 4 }),
      xAxis: {
        type: "category",
        data: chartsData.anomalyTypes.map(function (item) { return item.name; }),
        axisLabel: { color: chartTextColor(), interval: 0, fontSize: 10 },
        axisTick: { show: false },
        axisLine: { lineStyle: { color: "rgba(148,198,255,.18)" } },
      },
      yAxis: {
        type: "value",
        splitLine: { lineStyle: { color: "rgba(148,198,255,.12)" } },
        axisLabel: { color: chartTextColor() },
      },
      series: [{
        type: "bar",
        barWidth: 16,
        data: chartsData.anomalyTypes.map(function (item) { return item.value; }),
        itemStyle: { borderRadius: [6, 6, 0, 0], color: "#fbbf24" },
        label: { show: true, position: "top", color: "#fbbf24", fontWeight: 800 },
      }],
    }));

    chart("aiModelTrendChart").setOption(mergeOption(dashboardChartBase(), {
      color: ["#25d9ff", "#a78bfa"],
      legend: { top: 0, right: 0, itemWidth: 10, itemHeight: 8, textStyle: { color: chartTextColor(), fontSize: 11 } },
      grid: chartGrid({ top: 28, left: 12, right: 8, bottom: 6 }),
      xAxis: { type: "category", boundaryGap: false, data: aiTrend.labels, axisLabel: { color: chartTextColor() }, axisTick: { show: false }, axisLine: { lineStyle: { color: "rgba(148,198,255,.18)" } } },
      yAxis: { type: "value", splitLine: { lineStyle: { color: "rgba(148,198,255,.12)" } }, axisLabel: { color: chartTextColor() } },
      series: [
        { name: "时序", type: "line", smooth: true, data: aiTrend.timeSeries, areaStyle: { opacity: 0.14 }, symbolSize: 6 },
        { name: "视觉", type: "line", smooth: true, data: aiTrend.vision, areaStyle: { opacity: 0.1 }, symbolSize: 6 },
      ],
    }));

    chart("taskTrendChart").setOption(mergeOption(dashboardChartBase(), {
      color: ["#25d9ff", "#4ade80", "#ff5c7a"],
      legend: { top: 0, right: 0, itemWidth: 10, itemHeight: 8, textStyle: { color: chartTextColor(), fontSize: 11 } },
      grid: chartGrid({ top: 28, left: 16, right: 10, bottom: 8 }),
      xAxis: { type: "category", boundaryGap: false, data: trend.labels, axisLabel: { color: chartTextColor() }, axisTick: { show: false }, axisLine: { lineStyle: { color: "rgba(148,198,255,.18)" } } },
      yAxis: { type: "value", splitLine: { lineStyle: { color: "rgba(148,198,255,.12)" } }, axisLabel: { color: chartTextColor() } },
      series: [
        { name: "计划", type: "line", smooth: true, data: trend.planned, symbolSize: 5 },
        { name: "完成", type: "line", smooth: true, data: trend.completed, symbolSize: 5 },
        { name: "问题", type: "bar", barWidth: 10, data: trend.issues, itemStyle: { borderRadius: [5, 5, 0, 0] } },
      ],
    }));
    window.requestAnimationFrame(resizeCharts);
  }

  function renderOverview() {
    var task = DATA.overview.task;
    var currentArea = assertKey(DATA.areas, state.currentArea, "区域");
    var primaryArea = assertKey(DATA.areas, primaryFlow().areaKey, "主线区域");
    var showAllAlerts = state.overviewScope !== "area";
    var summaryView = showAllAlerts ? {
      badgeTone: primaryArea.badgeTone,
      overviewStatus: "全站告警",
      overviewTitle: "计量区高优先级疑点",
      overviewDesc: "本轮覆盖 6 个重点区域,当前仅计量区存在待质检疑点。",
      overviewStats: [
        { label: "P1疑点", value: "1" },
        { label: "覆盖区域", value: String(DATA.overview.areaOrder.length) },
        { label: "主线项", value: "第73项" },
      ],
      tags: ["计量区", "表单冲突", "时序近阈值", "待复检"],
      overviewAction: "进入计量区表单质检",
      targetArea: primaryFlow().areaKey,
    } : dashboardAreaSummary(state.currentArea);

    q("taskNote").textContent = task.note;

    q("sourceLegend").innerHTML = "";
    [
      ["客户数据", "source-real"],
      ["演示推演", "source-demo"],
      ["待确认", "source-pending"],
    ].forEach(function (item) {
      q("sourceLegend").appendChild(el("span", { class: "source-pill " + item[1], text: item[0] }));
    });

    var metricBox = q("overviewMetrics");
    metricBox.innerHTML = "";
    DATA.dashboard.qualityMetrics.forEach(function (m) {
      metricBox.appendChild(el("button", {
        class: "metric-card card dashboard-metric-card" + (state.dashboardFocus === m.key ? " active" : ""),
        type: "button",
        onClick: function () { setDashboardFocus(m.key); },
      }, [
        el("small", { text: m.label }),
        el("strong", { class: "num-" + m.tone, text: m.value }),
        el("span", { text: m.delta }),
        el("em", { class: sourceClass(m.sourceType), text: m.sourceType }),
      ]));
    });

    qa(".map-area").forEach(function (node) {
      var area = assertKey(DATA.areas, node.dataset.area, "区域");
      node.classList.toggle("active", !showAllAlerts && node.dataset.area === state.currentArea);
      node.classList.toggle("status-warn", area.badgeTone === "warn" || area.badgeTone === "danger");
      node.classList.toggle("status-ok", area.badgeTone === "ok");
      node.classList.toggle("status-info", area.badgeTone !== "warn" && area.badgeTone !== "danger" && area.badgeTone !== "ok");
    });
    q("riskDot").classList.remove("closed");
    q("mapToast").classList.remove("closed");
    q("mapToastBadge").className = "badge " + primaryArea.badgeTone;
    q("mapToastBadge").textContent = "P1";
    q("mapToastText").textContent = "计量区差压趋势疑点为本轮主线,点击异常点查看摘要。";

    var anomalyLayer = q("routeAnomalyLayer");
    anomalyLayer.innerHTML = "";
    DATA.dashboard.routeAnomalies.forEach(function (item) {
      var group = document.createElementNS("http://www.w3.org/2000/svg", "g");
      group.setAttribute("class", "anomaly-node " + priorityTone(item.priority));
      group.setAttribute("tabindex", "0");
      group.setAttribute("role", "button");
      group.setAttribute("aria-label", item.priority + " " + item.label);
      group.dataset.area = item.areaKey;
      group.innerHTML =
        '<circle class="anomaly-hit" cx="' + item.x + '" cy="' + item.y + '" r="24"></circle>' +
        '<circle cx="' + item.x + '" cy="' + item.y + '" r="10"></circle>' +
        '<text x="' + (item.x + 16) + '" y="' + (item.y - 12) + '">' + item.priority + '</text>';
      group.addEventListener("click", function () { focusDashboardArea(item.areaKey); });
      group.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          focusDashboardArea(item.areaKey);
        }
      });
      anomalyLayer.appendChild(group);
    });

    q("selectedAreaPanelTitle").textContent = showAllAlerts ? "全站告警" : "当前区域摘要";
    q("selectedAreaBadge").className = "badge " + summaryView.badgeTone;
    q("selectedAreaBadge").textContent = summaryView.overviewStatus;
    q("selectedAreaTitle").textContent = summaryView.overviewTitle;
    q("selectedAreaDesc").textContent = summaryView.overviewDesc;
    q("selectedAreaStats").innerHTML = "";
    summaryView.overviewStats.forEach(function (item) {
      q("selectedAreaStats").appendChild(el("div", { class: "area-stat card" }, [
        el("small", { text: item.label }),
        el("strong", { text: item.value }),
      ]));
    });
    q("selectedAreaTags").innerHTML = "";
    summaryView.tags.forEach(function (tag, i) {
      q("selectedAreaTags").appendChild(el("span", { class: "tag" + (i === 0 ? " hot" : ""), text: tag }));
    });
    q("selectedAreaPrimary").textContent = "进入计量区表单质检";
    q("selectedAreaPrimary").dataset.area = primaryFlow().areaKey;

    q("dashboardAlerts").innerHTML = "";
    DATA.dashboard.aiAlerts.forEach(function (alert) {
      q("dashboardAlerts").appendChild(el("button", {
        class: "ai-alert-item card",
        type: "button",
        onClick: function () { focusDashboardArea(alert.areaKey, "aiAlerts"); },
      }, [
        el("span", { class: "badge " + priorityTone(alert.priority), text: alert.priority + " · " + alert.model }),
        el("strong", { text: alert.title }),
        el("small", { text: alert.summary }),
        el("em", { class: sourceClass(alert.sourceType), text: alert.sourceType }),
      ]));
    });

    var activeMetric = DATA.dashboard.qualityMetrics.filter(function (metric) { return metric.key === state.dashboardFocus; })[0];
    var taskItems = DATA.dashboard.taskQualityList.filter(dashboardTaskMatchesFocus);
    q("taskQualityTitle").textContent = activeMetric ? "告警流水 · " + activeMetric.label : "告警流水";
    q("taskQualityList").innerHTML = "";
    taskItems.forEach(function (item) {
      q("taskQualityList").appendChild(el("button", {
        class: "quality-task-item",
        type: "button",
        onClick: function () { focusDashboardArea(item.areaKey); },
      }, [
        el("span", { class: "badge " + priorityTone(item.priority), text: item.priority }),
        el("strong", { text: item.issue }),
        el("small", { text: item.time + " · " + item.worker + " · " + item.area + " · " + item.status }),
        el("em", { class: sourceClass(item.sourceType), text: item.sourceType }),
      ]));
    });
    if (!taskItems.length) {
      q("taskQualityList").appendChild(el("div", { class: "quality-task-item empty" }, [
        el("strong", { text: "当前指标暂无待复核明细" }),
        el("small", { text: "可切换其他指标查看演示数据。" }),
      ]));
    }

    q("workerRanking").innerHTML = "";
    DATA.dashboard.workerQualityRanking.forEach(function (worker, index) {
      q("workerRanking").appendChild(el("div", { class: "worker-rank-item" }, [
        el("span", { class: "rank-no", text: String(index + 1) }),
        el("strong", { text: worker.name }),
        el("small", { text: worker.team + " · " + worker.tasks + " 个任务 · " + worker.risk }),
        el("b", { text: String(worker.score) }),
        el("em", { class: sourceClass(worker.sourceType), text: worker.sourceType }),
      ]));
    });

    q("recentArchiveList").innerHTML = "";
    DATA.knowledge.cases.slice(0, 1).forEach(function (caseItem) {
      q("recentArchiveList").appendChild(el("button", {
        class: "recent-archive-item",
        type: "button",
        onClick: function () { go("knowledge"); },
      }, [
        el("span", { class: "badge info", text: "最近归档" }),
        el("strong", { text: caseItem.title }),
        el("small", { text: "点击查看知识库沉淀关系" }),
      ]));
    });
    window.requestAnimationFrame(renderDashboardCharts);
  }

  function renderInspectionTable() {
    var tbody = q("inspectionTable").querySelector("tbody");
    tbody.innerHTML = "";
    var area = assertKey(DATA.areas, state.currentArea, "区域");
    var rows = state.browseMode || area.auxiliaryOnly ? browseRowsForArea(state.currentArea) : inspectionRowsForArea(state.currentArea);
    rows.forEach(function (row) {
      var hasDetail = !!DATA.analysis.itemDetails[row.item];
      var selected = state.selectedItem === row.item && hasDetail;
      var interactive = hasDetail;
      var tr = el("tr", {
        class: (row.hot ? "hot " : "") + (selected ? "selected" : "") + (!interactive ? "readonly" : ""),
        tabindex: interactive ? "0" : "-1",
        role: interactive ? "button" : "row",
        "aria-selected": selected ? "true" : "false",
        dataset: { item: row.item },
        onClick: interactive ? function () { selectItem(row.item); } : null,
        onKeydown: function (event) {
          if (!interactive) return;
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

  function renderExplainList(id, items) {
    var list = q(id);
    list.innerHTML = "";
    items.forEach(function (item) {
      list.appendChild(el("div", { class: "explain-item card" }, [
        el("strong", { text: item.title }),
        el("small", { text: item.desc }),
      ]));
    });
  }

  function conflictContent(area, trendInfo) {
    var primaryRow = primaryFlowRow();
    var primaryLabel = "第" + primaryRow.no + "项" + primaryRow.check;
    if (area.auxiliaryOnly) {
      return {
        title: area.quality.title,
        text: area.quality.text,
        contrast: true,
        facts: area.quality.facts,
      };
    }
    if (state.selectedItem === primaryFlow().itemKey) {
      return {
        title: "表单" + primaryLabel + " = " + primaryRow.result + " ↔ 趋势 " + trendInfo.latest,
        text: "阈值余量 " + trendInfo.marginText + " · " + trendInfo.summary,
        contrast: false,
        facts: area.quality.facts,
      };
    }
    return {
      title: "主线冲突未解除",
      text: "当前查看辅助项," + primaryLabel + "仍需回到主线复检。",
      contrast: false,
      facts: [
        "主线对象: " + primaryRow.area + "/" + primaryRow.device + "/" + primaryRow.check,
        "当前查看: 辅助巡检项",
        "动作: 返回" + primaryRow.check + "项复核",
      ],
    };
  }

  function renderQualityFacts(items) {
    var facts = q("formQualityFacts");
    facts.innerHTML = "";
    items.forEach(function (item) {
      facts.appendChild(el("div", { class: "quality-fact card" }, [
        el("small", { text: item.split(":")[0] }),
        el("strong", { text: item.indexOf(":") >= 0 ? item.split(":").slice(1).join(":").trim() : item }),
      ]));
    });
  }

  function trendSummary(seriesKey) {
    var series = assertKey(DATA.analysis.trendSeries, seriesKey, "趋势");
    var values = series.points.map(function (point) { return point[1]; });
    var latest = values[values.length - 1];
    var max = Math.max.apply(null, values);
    var margin = series.safeSide === "below" ? series.threshold - latest : latest - series.threshold;
    var marginText = (margin >= 0 ? "" : "-") + formatTrendValue(Math.abs(margin), series.unit);
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

  function renderForm() {
    var area = assertKey(DATA.areas, state.currentArea, "区域");
    q("formTitle").textContent = area.auxiliaryOnly ? area.short + "质检记录" : "表单质检工作台";
    q("formSubtitle").textContent = area.sub;
    q("formBadge").className = "badge " + area.badgeTone;
    q("formBadge").textContent = area.short + " · " + area.badge;
    q("inspectionPanelTitle").textContent = area.short + "巡检表明细";

    renderAreaScope();
    renderInspectionTable();

    q("evidenceTags").innerHTML = "";
    var selectedDetail = itemDetailForCurrentArea(state.selectedItem);
    if (state.browseMode || !selectedDetail) {
      q("evidenceTitle").textContent = "区域证据摘要";
      q("evidenceText").textContent = area.evidence;
      area.tags.forEach(function (tag, i) {
        q("evidenceTags").appendChild(el("span", { class: "tag" + (i === 0 ? " hot" : ""), text: tag }));
      });
      q("formPrimary").textContent = area.auxiliaryOnly ? "返回任务总览" : "进入人工确认";
      q("formPrimary").dataset.action = area.auxiliaryOnly ? "back-overview" : "go-recheck";
    } else {
      q("evidenceTitle").textContent = area.auxiliaryOnly ? "表单项证据摘要" : "冲突证据摘要";
      q("evidenceText").textContent = selectedDetail.evidence;
      selectedDetail.tags.forEach(function (tag, i) {
        q("evidenceTags").appendChild(el("span", { class: "tag" + (i === 0 ? " hot" : ""), text: tag }));
      });
      q("formPrimary").textContent = "进入人工确认";
      q("formPrimary").dataset.action = "go-recheck";
    }

    var content = conflictContent(area, trendSummary(state.currentTrend));
    q("conflictCard").classList.toggle("contrast", content.contrast);
    q("conflictTitle").textContent = content.title;
    q("conflictText").textContent = content.text;
    renderQualityFacts(content.facts);
    renderExplainList("formExplainList", area.formExplain);
    renderFormAssist(area, selectedDetail);
  }

  function renderFormAssist(area, selectedDetail) {
    var trendInfo = renderTrend(q("formTrendCanvas"), state.currentTrend);
    renderTrendStats(trendInfo, "formTrendStats");
    q("formTrendSummary").textContent = trendInfo.summary;

    var frames = assertKey(DATA.analysis.frameSources, state.currentArea, "关键帧区域");
    var frame = assertKey(frames, state.frameKey, "关键帧");
    q("formFrameImage").src = frame.src;
    q("formFrameImage").alt = frame.title;
    q("formFrameTitle").textContent = frame.title;
    q("formFrameScene").textContent = frame.scene;
    q("formBboxLabel").textContent = frame.label;
    q("formBbox").classList.toggle("hidden", !frame.showBbox);

    var knowledge = drawerKnowledgeForArea(state.currentArea);
    q("formAgentTitle").textContent = canUseCaseAgentContext(state.currentArea)
      ? "命中历史案例增强复检建议"
      : "综合证据生成复检建议";
    q("formAgentSummary").textContent = knowledge.summary || (selectedDetail ? selectedDetail.evidence : area.evidence);
    renderEvidenceDetail(area, selectedDetail);
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
      hotspot.addEventListener("click", function () { selectItem(primaryFlow().itemKey); });
      hotspot.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectItem(primaryFlow().itemKey);
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

  function renderTrendStats(info, targetId) {
    if (!targetId) throw new Error("[v3] 趋势统计缺少目标节点");
    var stats = [
      ["最新值", info.latest, "cyan"],
      ["72h最大", info.max, "amber"],
      ["阈值余量", info.marginText, info.margin >= 0 ? "green" : "red"],
      ["数据质量", info.quality, "green"],
    ];
    var target = q(targetId);
    target.innerHTML = "";
    stats.forEach(function (s) {
      target.appendChild(el("div", { class: "trend-stat card" }, [
        el("small", { text: s[0] }),
        el("strong", { class: "num-" + s[2], text: s[1] }),
      ]));
    });
  }

  function isHotTrendPoint(series, index, value) {
    if (series.window && index >= series.window.startIndex && index <= series.window.endIndex) return true;
    if (series.safeSide === "below") return value > series.threshold;
    return value < series.threshold;
  }

  function renderAlertList(targetId, items) {
    var target = q(targetId);
    target.innerHTML = "";
    items.forEach(function (item) {
      target.appendChild(el("div", { class: "model-alert-item card" }, [
        el("small", { text: item.label }),
        el("strong", { class: item.tone ? "num-" + item.tone : "", text: item.value }),
        item.desc ? el("span", { text: item.desc }) : null,
      ]));
    });
  }

  function frameLabel(frameKey) {
    if (frameKey === "current") return "当前帧";
    if (frameKey === "compare") return "对比帧";
    if (frameKey === "plc") return "联动帧";
    return frameKey;
  }

  function renderEvidenceDetail(area, selectedDetail) {
    var mode = state.evidenceDetail;
    q("scene-form").classList.toggle("detail-open", !!mode);
    q("evidenceDetailPanel").classList.toggle("hidden", !mode);
    if (!mode) return;

    var isTrend = mode === "trend";
    q("evidenceDetailTitle").textContent = isTrend ? "时序模型详情" : "视觉模型详情";
    q("evidenceDetailSubtitle").textContent = isTrend
      ? "查看采样点、阈值线、异常窗口和模型告警明细。"
      : "查看关键帧、识别框、帧列表和现场证据用途。";
    q("trendDetailTab").classList.toggle("active", isTrend);
    q("visionDetailTab").classList.toggle("active", !isTrend);
    q("trendDetailView").classList.toggle("hidden", !isTrend);
    q("visionDetailView").classList.toggle("hidden", isTrend);

    renderTrendDetail(area, selectedDetail);
    renderVisionDetail(area, selectedDetail);
  }

  function renderTrendDetail(area, selectedDetail) {
    var series = assertKey(DATA.analysis.trendSeries, state.currentTrend, "趋势");
    var info = renderTrend(q("detailTrendCanvas"), state.currentTrend);
    q("trendDetailChartTitle").textContent = series.title;
    q("trendDetailHint").textContent = "阈值 " + formatTrendValue(series.threshold, series.unit) + " · " + (series.window ? series.window.label : "无异常窗口");
    renderTrendStats(info, "detailTrendStats");
    renderAlertList("trendAlertList", [
      { label: "告警等级", value: series.window ? "预警" : "正常", tone: series.window ? "amber" : "green", desc: series.window ? "模型检测到连续逼近阈值窗口。" : "当前趋势未触发异常窗口。" },
      { label: series.window ? series.window.label : "触发窗口", value: series.window ? (series.points[series.window.startIndex][0] + " 至 " + series.points[series.window.endIndex][0]) : "未触发", tone: series.window ? "amber" : "green" },
      { label: "阈值余量", value: info.marginText, tone: info.margin >= 0 ? "green" : "red", desc: "按当前最新采样点计算。" },
      { label: "模型说明", value: series.summary, tone: "cyan" },
    ]);

    q("trendSampleRows").innerHTML = "";
    series.points.forEach(function (point, index) {
      var hot = isHotTrendPoint(series, index, point[1]);
      q("trendSampleRows").appendChild(el("tr", { class: hot ? "hot" : "" }, [
        el("td", { text: point[0] }),
        el("td", { text: formatTrendValue(point[1], series.unit) }),
        el("td", { text: hot ? (series.window ? "异常窗口" : "越限") : "正常" }),
      ]));
    });

    q("trendDetailExplain").innerHTML = "";
    q("trendDetailExplain").appendChild(el("strong", { text: "表单关联说明" }));
    q("trendDetailExplain").appendChild(el("p", {
      text: selectedDetail
        ? selectedDetail.evidence
        : area.evidence,
    }));
  }

  function renderVisionDetail(area, selectedDetail) {
    var frames = assertKey(DATA.analysis.frameSources, state.currentArea, "关键帧区域");
    var frame = assertKey(frames, state.frameKey, "关键帧");
    q("visionDetailFrameTitle").textContent = frame.title;
    q("detailFrameImage").src = frame.src;
    q("detailFrameImage").alt = frame.title;
    q("detailFrameTitle").textContent = frame.title;
    q("detailFrameScene").textContent = frame.scene;
    q("detailFrameBboxLabel").textContent = frame.label || "无显式识别框";
    q("detailFrameBbox").classList.toggle("hidden", !frame.showBbox);
    renderAlertList("visionAlertList", [
      { label: "帧类型", value: frameLabel(state.frameKey), tone: "cyan" },
      { label: "识别结果", value: frame.showBbox ? frame.label : "现场参考帧", tone: frame.showBbox ? "amber" : "green" },
      { label: "证据用途", value: area.auxiliaryOnly ? "区域对照" : "复检补证", tone: area.auxiliaryOnly ? "green" : "amber" },
      { label: "报告关系", value: "可入报告", tone: "cyan" },
    ]);

    q("detailFrameOptions").innerHTML = "";
    Object.keys(frames).forEach(function (key) {
      var option = frames[key];
      q("detailFrameOptions").appendChild(el("button", {
        class: "frame-option" + (state.frameKey === key ? " active" : ""),
        type: "button",
        onClick: function () { selectFrame(key); },
      }, [
        el("strong", { text: frameLabel(key) }),
        el("small", { text: option.title }),
      ]));
    });

    q("visionDetailExplain").innerHTML = "";
    q("visionDetailExplain").appendChild(el("strong", { text: "现场证据说明" }));
    var selectedRow = selectedDetail ? inspectionRowForItem(state.selectedItem) : null;
    q("visionDetailExplain").appendChild(el("p", {
      text: selectedRow
        ? "当前视觉帧用于补充 " + selectedRow.area + " / " + selectedRow.device + " / " + selectedRow.check + " 的现场点位和补拍语境。"
        : area.evidence,
    }));
  }

  function renderRecheck() {
    q("recheckTitle").textContent = "人工确认工作台";
    q("recheckSubtitle").textContent = "请在复检证据和规则依据基础上选择人工结论,系统不会自动替人员下结论。";

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
        disabled: state.archived ? "disabled" : null,
        onClick: function () { selectDecision(decision.key); },
      }, decision.label));
    });

    q("decisionLabel").textContent = state.decision ? DATA.recheck.decisionStatus[state.decision] : "请选择结论";
    q("recheckStatus").className = state.decision ? "badge ok" : "badge warn";
    q("recheckStatus").textContent = state.decision ? "已选择: " + DATA.recheck.decisionStatus[state.decision] : "请选择人工结论";
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
    q("archiveBtn").textContent = state.archived ? "已归档本次检查" : "归档本次检查";
    q("reportBackBtn").dataset.action = state.archived ? "go-knowledge" : "back-overview";
    q("reportBackBtn").textContent = state.archived ? "查看知识库归档" : "返回任务总览";

    var caseKnowledge = primaryCaseKnowledge();
    q("caseReusePanel").classList.toggle("active", state.archived);
    q("caseReuseLabel").textContent = state.archived ? caseKnowledge.archivedCase.label : "案例复用";
    q("caseReuseTitle").textContent = state.archived ? caseKnowledge.caseId : "等待归档后启用";
    q("caseReuseText").textContent = state.archived ? caseKnowledge.archivedCase.summary
      : "人工确认并归档后,后续同类表单质检可命中本次案例。";

    q("caseTags").innerHTML = "";
    if (state.decision || state.archived) {
      DATA.report.caseTags.forEach(function (tag, i) {
        q("caseTags").appendChild(el("span", { class: "tag" + (i === 0 ? " hot" : ""), text: tag }));
      });
    } else {
      q("caseTags").appendChild(el("span", { class: "tag", text: "归档标签将在人工结论后生成" }));
    }
  }

  function renderKnowledge() {
    q("knowledgeDocList").innerHTML = "";
    DATA.knowledge.documents.forEach(function (doc) {
      q("knowledgeDocList").appendChild(el("article", { class: "knowledge-doc-item card" }, [
        el("span", { class: "badge info", text: doc.type }),
        el("strong", { text: doc.title }),
        el("small", { text: doc.status }),
        el("div", { class: "tag-row" }, doc.tags.map(function (tag, index) {
          return el("span", { class: "tag" + (index === 0 ? " hot" : ""), text: tag });
        })),
        el("em", { class: sourceClass(doc.sourceType), text: doc.sourceType }),
      ]));
    });

    q("knowledgeCaseList").innerHTML = "";
    DATA.knowledge.cases.forEach(function (caseItem) {
      var isCurrentCase = caseItem.id === primaryCaseKnowledge().caseId;
      var status = isCurrentCase && state.archived ? "本次已归档" : caseItem.status;
      var summary = isCurrentCase && state.archived ? primaryCaseKnowledge().archivedCase.summary : caseItem.summary;
      q("knowledgeCaseList").appendChild(el("article", { class: "knowledge-case-item card" }, [
        el("span", { class: "badge " + (isCurrentCase && state.archived ? "ok" : caseItem.areaKey === primaryFlow().areaKey ? "warn" : "info"), text: status }),
        el("strong", { text: caseItem.id }),
        el("small", { text: caseItem.title }),
        el("p", { text: summary }),
        el("em", { class: sourceClass(caseItem.sourceType), text: caseItem.sourceType }),
      ]));
    });
  }

  function svgNode(tag, attrs) {
    var node = document.createElementNS("http://www.w3.org/2000/svg", tag);
    Object.keys(attrs || {}).forEach(function (key) {
      if (key === "text") node.textContent = attrs[key];
      else node.setAttribute(key, attrs[key]);
    });
    return node;
  }

  function renderGraph() {
    var graph = DATA.knowledge.graph;
    var graphNode = q("knowledgeGraph");
    graphNode.innerHTML = "";
    graph.links.forEach(function (link) {
      var from = graph.nodes.filter(function (item) { return item.id === link.from; })[0];
      var to = graph.nodes.filter(function (item) { return item.id === link.to; })[0];
      if (!from || !to) throw new Error("[v3] 知识图谱连线节点缺失: " + link.from + " -> " + link.to);
      graphNode.appendChild(svgNode("line", {
        class: "graph-link",
        x1: from.x,
        y1: from.y,
        x2: to.x,
        y2: to.y,
      }));
      graphNode.appendChild(svgNode("text", {
        class: "graph-link-label",
        x: (from.x + to.x) / 2,
        y: (from.y + to.y) / 2 - 6,
        text: link.label,
      }));
    });
    graph.nodes.forEach(function (node) {
      var group = svgNode("g", { class: "graph-node" });
      group.appendChild(svgNode("circle", { cx: node.x, cy: node.y, r: 34 }));
      group.appendChild(svgNode("text", { class: "graph-node-label", x: node.x, y: node.y - 4, text: node.label }));
      group.appendChild(svgNode("text", { class: "graph-node-type", x: node.x, y: node.y + 15, text: node.type }));
      graphNode.appendChild(group);
    });

    q("graphQaList").innerHTML = "";
    DATA.knowledge.qaExamples.forEach(function (item) {
      q("graphQaList").appendChild(el("article", { class: "graph-qa-item card" }, [
        el("strong", { text: item.q }),
        el("p", { text: item.a }),
      ]));
    });
  }

  function canVisitStep(stepKey) {
    var idx = stepIndex(stepKey);
    if (idx < 0) throw new Error("[v3] 未知步骤: " + stepKey);
    if (state.scene === "overview" && stepKey === "form") return false;
    if (stepKey === "report") return !!state.decision || state.archived;
    if (stepKey === "recheck") {
      if (!isPrimaryArea(state.currentArea)) return false;
      return state.recheckReady || idx <= state.maxStepIndex + 1 || !!state.decision || state.archived;
    }
    return idx <= state.maxStepIndex + 1;
  }

  function stepLockedTitle(stepKey) {
    if (state.scene === "overview" && stepKey === "form") return "请从右侧当前告警入口进入表单质检";
    if (stepKey === "report") return "请先在复检确认中选择人工结论";
    return "请先完成前序步骤";
  }

  function goStep(stepKey) {
    if (!canVisitStep(stepKey)) throw new Error("[v3] 步骤尚未解锁: " + stepKey);
    if (stepKey === "task") go("overview", { stepKey: "task" });
    else if (stepKey === "form") go("form", { stepKey: "form" });
    else if (stepKey === "recheck") {
      state.recheckReady = true;
      go("recheck", { stepKey: "recheck" });
    } else if (stepKey === "report") go("report", { stepKey: "report" });
    else throw new Error("[v3] 未知步骤: " + stepKey);
  }

  function renderFlow() {
    q("flowHint").textContent = state.archived && state.scene === "report"
      ? "流程步骤 · 报告已归档,案例将供后续表单质检调用"
      : "流程步骤 · 时序、视觉、规则和 Agent 均在表单质检中并列辅助判断";
    var activeIndex = stepIndex(state.stepKey);
    q("flowTrack").innerHTML = "";
    DATA.shell.flowSteps.forEach(function (step, index) {
      var cls = "flow-step";
      if (index <= state.maxStepIndex && index !== activeIndex) cls += " done";
      if (index === activeIndex) cls += " active";
      var disabled = !canVisitStep(step.key);
      var attrs = {
        class: cls,
        type: "button",
        title: disabled ? stepLockedTitle(step.key) : step.label,
        dataset: { idx: String(index + 1), step: step.key },
        onClick: function () { goStep(step.key); },
      };
      if (disabled) attrs.disabled = "disabled";
      q("flowTrack").appendChild(el("button", attrs, [
        el("strong", { text: step.label }),
        el("small", { text: step.desc }),
      ]));
    });
  }

  function renderDrawer() {
    var knowledge = drawerKnowledgeForArea(state.currentArea);
    q("drawerContext").innerHTML = "";
    q("drawerContext").appendChild(el("span", { class: "badge " + (knowledge.caseId ? "green" : "info"), text: knowledge.mode }));
    if (knowledge.caseId) q("drawerContext").appendChild(el("strong", { text: knowledge.caseId }));
    q("drawerContext").appendChild(el("small", { text: knowledge.summary }));
    q("drawerContextToggle").innerHTML = "";
    if (isPrimaryArea(state.currentArea)) {
      q("drawerContextToggle").appendChild(el("button", {
        class: "context-toggle" + (state.agentContext !== "case" ? " active" : ""),
        type: "button",
        dataset: { context: "current" },
        "aria-pressed": state.agentContext !== "case" ? "true" : "false",
        onClick: function () { setAgentContext("current"); },
      }, "当前检查"));
      q("drawerContextToggle").appendChild(el("button", {
        class: "context-toggle" + (state.agentContext === "case" ? " active" : ""),
        type: "button",
        dataset: { context: "case" },
        "aria-pressed": state.agentContext === "case" ? "true" : "false",
        disabled: canUseCaseAgentContext(state.currentArea) ? null : "disabled",
        title: canUseCaseAgentContext(state.currentArea) ? "查看历史案例增强上下文" : "归档后可用",
        onClick: function () { setAgentContext("case"); },
      }, "命中历史案例"));
    }
    q("drawerSources").innerHTML = "";
    knowledge.sources.forEach(function (source) {
      q("drawerSources").appendChild(el("span", { class: "source-pill " + source.type, text: source.text }));
    });
    q("drawerQuestions").innerHTML = "";
    knowledge.questions.forEach(function (item) {
      q("drawerQuestions").appendChild(el("button", {
        class: "drawer-question",
        type: "button",
        onClick: function () { q("drawerAnswer").textContent = item.a; },
      }, item.q));
    });
  }

  function drawerPromptText(knowledge) {
    if (knowledge.caseId) return "已命中 " + knowledge.caseId + "。请选择问题查看历史案例如何增强本次异常处置建议。";
    return "请选择问题查看 AI 辅助回答。";
  }

  function render() {
    renderShell();
    renderOverview();
    renderForm();
    renderRecheck();
    renderReport();
    renderKnowledge();
    renderGraph();
    renderDrawer();
    renderFlow();
  }

  function openDrawer() {
    lastFocus = document.activeElement;
    if (state.scene !== "form") {
      state.agentContext = "current";
      persistState();
      render();
    }
    if (!canUseCaseAgentContext(state.currentArea)) {
      state.agentContext = "current";
      persistState();
      render();
    }
    var knowledge = drawerKnowledgeForArea(state.currentArea);
    q("drawerAnswer").textContent = drawerPromptText(knowledge);
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

  function openEvidenceDetail(kind) {
    if (kind !== "trend" && kind !== "vision") throw new Error("[v3] 未知证据详情: " + kind);
    state.evidenceDetail = kind;
    persistState();
    render();
    q("stage").scrollTo({ top: Math.max(0, q("evidenceDetailPanel").offsetTop - 12), behavior: "smooth" });
    q(kind === "trend" ? "trendDetailTab" : "visionDetailTab").focus({ preventScroll: true });
  }

  function closeEvidenceDetail() {
    state.evidenceDetail = "";
    persistState();
    render();
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
    if (action === "go-form") {
      if (state.scene === "overview") go("form", { area: primaryFlow().areaKey, stepKey: "form" });
      else go("form", { stepKey: "form" });
    }
    else if (action === "go-recheck") {
      if (state.browseMode || assertKey(DATA.areas, state.currentArea, "区域").auxiliaryOnly) {
        go("overview", { stepKey: "task" });
        return;
      }
      state.recheckReady = true;
      persistState();
      go("recheck", { stepKey: "recheck" });
    }
    else if (action === "go-area-primary") areaPrimaryAction();
    else if (action === "back-main") {
      enterArea(primaryFlow().areaKey, false);
      go("form", { stepKey: "form" });
    } else if (action === "confirm-recheck") {
      if (!state.decision) {
        q("recheckStatus").className = "badge danger";
        q("recheckStatus").textContent = "请先选择结论";
        return;
      }
      go("report", { stepKey: "report" });
    } else if (action === "archive-report") archiveReport();
    else if (action === "back-overview") go("overview", { stepKey: "task" });
    else if (action === "go-knowledge") go("knowledge");
    else if (action === "go-graph") go("graph");
    else if (action === "open-drawer") openDrawer();
    else if (action === "close-drawer") closeDrawer();
    else if (action === "open-trend-detail") openEvidenceDetail("trend");
    else if (action === "open-vision-detail") openEvidenceDetail("vision");
    else if (action === "close-evidence-detail") closeEvidenceDetail();
    else if (action === "open-image") openImage();
    else if (action === "close-image") closeImage();
    else if (action === "reset-demo") resetDemo();
    else {
      throw new Error("[v3] 未知动作: " + action);
    }
  }

  function bindEvents() {
    qa("[data-scene-target]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var target = btn.dataset.sceneTarget;
        go(target);
      });
    });
    qa("[data-action]").forEach(function (node) {
      node.addEventListener("click", function () { handleAction(node.dataset.action); });
    });
    qa(".map-area").forEach(function (node) {
      node.addEventListener("click", function () { selectOverviewArea(node.dataset.area); });
      node.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectOverviewArea(node.dataset.area);
        }
      });
    });
    qa("[data-item]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        selectItem(btn.dataset.item, "form");
      });
    });
    q("drawerMask").addEventListener("click", closeDrawer);
    q("imageModal").addEventListener("click", function (event) {
      if (event.target.id === "imageModal") closeImage();
    });
    window.addEventListener("hashchange", function () {
      var scene = window.location.hash.replace("#", "");
      scene = LEGACY_SCENE_TARGETS[scene] || scene;
      if (scene && scene !== state.scene) {
        assertKey(DATA.shell.sceneLabels, scene, "场景");
        var legal = canVisit(scene);
        state.scene = nearestLegalScene(scene);
        if (legal) markStep(defaultStepForScene(state.scene));
        else showStep(defaultStepForScene(state.scene));
        if (window.location.hash !== "#" + state.scene) window.location.hash = state.scene;
        persistState();
        render();
        q("stage").scrollTop = 0;
        scrollActiveSceneIntoView();
      }
    });
    window.addEventListener("resize", resizeCharts);
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
    initial = LEGACY_SCENE_TARGETS[initial] || initial;
    if (initial) {
      assertKey(DATA.shell.sceneLabels, initial, "场景");
      var legal = canVisit(initial);
      state.scene = nearestLegalScene(initial);
      if (legal) markStep(defaultStepForScene(state.scene));
      else showStep(defaultStepForScene(state.scene));
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
