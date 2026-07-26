(function () {
  "use strict";

  var DATA = window.DEMO_V3_DATA;
  var state = initialState();
  var STORAGE_KEY = "xunjian-prototype-v3-state";
  var lastFocus = null;

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
      recheckReady: false,
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
    if (scene === "overview") return state.archived ? "closed" : "task";
    if (scene === "form") return "form";
    if (scene === "trend") return state.stepKey === "conflict" ? "conflict" : "trend";
    if (scene === "vision") return "vision";
    if (scene === "recheck") return state.decision ? "confirm" : "recheck";
    if (scene === "report") return "report";
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
    if (migratedAnalysis) state.scene = "form";
    if (!(state.scene in DATA.shell.sceneLabels)) state.scene = "overview";
    if (stepIndex(state.stepKey) < 0) state.stepKey = defaultStepForScene(state.scene);
    if (migratedAnalysis && !savedHadStep) showStep("form");
    if (typeof state.maxStepIndex !== "number") state.maxStepIndex = stepIndex(state.stepKey);
  }

  function canVisit(scene) {
    if (scene === state.scene) return true;
    if (state.browseMode && assertKey(DATA.areas, state.currentArea, "区域").auxiliaryOnly) {
      if (scene === "overview" || scene === "form" || scene === "trend" || scene === "vision") return true;
    }
    if (scene === "overview" || scene === "form") return true;
    if (scene === "trend") return state.maxStepIndex >= stepIndex("form");
    if (scene === "vision") return state.maxStepIndex >= stepIndex("conflict");
    if (scene === "recheck") return state.recheckReady || !!state.decision || state.archived;
    if (scene === "report") return !!state.decision || state.archived;
    throw new Error("[v3] 未知场景: " + scene);
  }

  function nearestLegalScene(scene) {
    if (canVisit(scene)) return scene;
    if (scene === "report" && canVisit("recheck")) return "recheck";
    if ((scene === "recheck" || scene === "report") && canVisit("vision")) return "vision";
    if ((scene === "vision" || scene === "recheck" || scene === "report") && canVisit("trend")) return "trend";
    if (scene !== "overview") return "form";
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
      state.scene = scene;
    }
    state.browseMode = !!opts.browseMode;
    markStep(opts.stepKey || defaultStepForScene(scene));
    if (window.location.hash !== "#" + scene) {
      window.location.hash = scene;
    }
    persistState();
    render();
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
    var area = assertKey(DATA.areas, state.currentArea, "区域");
    if (area.overviewTarget === "riskFlow") {
      openRiskFlow(state.currentArea);
    } else if (area.overviewTarget === "vision") {
      browseArea("vision", state.currentArea, "vision");
    } else {
      browseArea("form", state.currentArea, "form");
    }
  }

  function areaSecondaryAction() {
    var area = assertKey(DATA.areas, state.currentArea, "区域");
    if (area.auxiliaryOnly) browseArea("vision", state.currentArea, "vision");
    else openRiskFlow(state.currentArea);
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

  function selectTrendItem(itemKey) {
    var detail = assertKey(DATA.analysis.itemDetails, itemKey, "巡检项");
    var row = inspectionRowForItem(itemKey);
    state.selectedItem = itemKey;
    state.currentArea = row.areaKey;
    state.currentTrend = detail.trendKey;
    state.frameKey = detail.image;
    markStep("trend");
    state.browseMode = false;
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
    markStep("confirm");
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
    markStep("closed");
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

  function renderOverview() {
    var task = DATA.overview.task;
    var currentArea = assertKey(DATA.areas, state.currentArea, "区域");
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
      if (m.key === "findings") {
        value = String(DATA.overview.findings.length);
      }
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
    q("mapToastBadge").className = "badge " + currentArea.badgeTone;
    q("mapToastBadge").textContent = currentArea.overviewStatus;
    q("mapToastText").textContent = state.archived && state.currentArea === primaryFlow().areaKey
      ? "复检报告已归档," + currentArea.short + "疑点进入闭环案例库。"
      : currentArea.short + ": " + currentArea.overviewDesc;

    var areaGrid = q("areaSummaryGrid");
    areaGrid.innerHTML = "";
    DATA.overview.areaOrder.forEach(function (areaKey) {
      var area = assertKey(DATA.areas, areaKey, "区域");
      var areaFindings = DATA.overview.findings.filter(function (finding) { return finding.area === areaKey; });
      var findingCount = areaFindings.length;
      var cardHint = !findingCount
        ? "本轮正常覆盖"
        : areaFindings.some(function (finding) { return finding.entryType === "riskFlow"; })
          ? findingCount + " 个高风险疑点"
          : findingCount + " 个证据入口";
      var cls = "area-summary-card" + (state.currentArea === areaKey ? " active" : "") + (!area.auxiliaryOnly ? " risk" : "");
      areaGrid.appendChild(el("button", {
        class: cls,
        type: "button",
        dataset: { area: areaKey },
        onClick: function () { selectOverviewArea(areaKey); },
      }, [
        el("span", { class: "badge " + area.badgeTone, text: area.overviewStatus }),
        el("strong", { text: area.short }),
        el("small", { text: cardHint }),
      ]));
    });

    q("selectedAreaBadge").className = "badge " + currentArea.badgeTone;
    q("selectedAreaBadge").textContent = currentArea.overviewStatus;
    q("selectedAreaTitle").textContent = currentArea.overviewTitle;
    q("selectedAreaDesc").textContent = currentArea.overviewDesc;
    q("selectedAreaStats").innerHTML = "";
    currentArea.overviewStats.forEach(function (item) {
      q("selectedAreaStats").appendChild(el("div", { class: "area-stat card" }, [
        el("small", { text: item.label }),
        el("strong", { text: item.value }),
      ]));
    });
    q("selectedAreaTags").innerHTML = "";
    currentArea.tags.forEach(function (tag, i) {
      q("selectedAreaTags").appendChild(el("span", { class: "tag" + (i === 0 ? " hot" : ""), text: tag }));
    });
    q("overviewPrimary").textContent = currentArea.overviewAction;
    q("selectedAreaPrimary").textContent = currentArea.overviewAction;
    q("selectedAreaSecondary").textContent = currentArea.overviewSecondary;

    var list = q("findingList");
    list.innerHTML = "";
    DATA.overview.findings.forEach(function (finding) {
      var closed = finding.primary && (state.decision || state.archived);
      var badgeClass = closed ? "badge ok" : finding.priority === "high" ? "badge danger" : "badge warn";
      var badgeText = closed ? (state.archived ? "已归档" : "已复检") : finding.priority === "high" ? "高优先级" : "证据入口";
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
        onClick: function () {
          if (finding.entryType === "riskFlow") openRiskFlow(finding.area);
          else selectOverviewArea(finding.area);
        },
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
      q("formPrimary").textContent = "查看区域趋势";
      q("formPrimary").dataset.action = "go-trend";
    } else {
      q("evidenceTitle").textContent = area.auxiliaryOnly ? "表单项证据摘要" : "冲突证据摘要";
      q("evidenceText").textContent = selectedDetail.evidence;
      selectedDetail.tags.forEach(function (tag, i) {
        q("evidenceTags").appendChild(el("span", { class: "tag" + (i === 0 ? " hot" : ""), text: tag }));
      });
      q("formPrimary").textContent = "查看时序预警";
      q("formPrimary").dataset.action = "go-trend";
    }

    var content = conflictContent(area, trendSummary(state.currentTrend));
    q("conflictCard").classList.toggle("contrast", content.contrast);
    q("conflictTitle").textContent = content.title;
    q("conflictText").textContent = content.text;
    renderQualityFacts(content.facts);
    renderExplainList("formExplainList", area.formExplain);
  }

  function renderTrendScene() {
    var area = assertKey(DATA.areas, state.currentArea, "区域");
    var primaryRow = primaryFlowRow();
    var isConflictStep = state.stepKey === "conflict";
    q("trendSceneTitle").textContent = isConflictStep ? "表单趋势冲突工作台" : "时序预警工作台";
    q("trendSubtitle").textContent = isConflictStep
      ? "当前步骤聚焦“表单正常”和“趋势近阈值”的矛盾,为后续复检生成明确对象。"
      : area.auxiliaryOnly ? area.sub : "第 " + primaryRow.no + " 项表单结果为“" + primaryRow.result + "”,但趋势曲线显示" + primaryRow.check + "需要复核。";
    q("trendBadge").className = "badge " + (area.auxiliaryOnly && !isConflictStep ? "info" : "danger");
    q("trendBadge").textContent = isConflictStep ? "表单趋势冲突 · 待复检" : area.auxiliaryOnly ? area.short + " · 对照趋势" : "时序预警 · 接近阈值";

    var trendInfo = renderTrend(q("trendCanvas"), state.currentTrend);
    q("trendTitle").textContent = trendInfo.title;
    renderTrendStats(trendInfo);
    var content = conflictContent(area, trendInfo);
    q("trendConflictTitle").textContent = content.title;
    q("trendConflictText").textContent = content.text;
    renderExplainList("trendExplainList", isConflictStep ? DATA.analysis.conflictExplain : area.auxiliaryOnly ? area.formExplain : DATA.analysis.trendExplain);

    qa("[data-trend]").forEach(function (btn) {
      btn.dataset.trend = area.auxiliaryOnly && !isConflictStep ? area.trendKey : primaryFlow().trendKey;
      btn.textContent = area.auxiliaryOnly && !isConflictStep ? "区域趋势" : primaryRow.check;
      btn.classList.toggle("active", state.currentTrend === btn.dataset.trend);
    });
    qa("[data-item='pressure']").forEach(function (btn) {
      btn.hidden = area.auxiliaryOnly && !isConflictStep;
      btn.classList.toggle("active", state.selectedItem === "pressure" && !area.auxiliaryOnly);
    });
  }

  function renderVision() {
    var area = assertKey(DATA.areas, state.currentArea, "区域");
    q("visionSubtitle").textContent = area.auxiliaryOnly ? area.sub : "关键帧用于补强复检依据,最终结论仍需人员确认。";
    q("visionBadge").className = "badge " + (area.auxiliaryOnly ? area.badgeTone : "info");
    q("visionBadge").textContent = area.short + " · " + area.badge;
    renderFrame();

    q("visionSummary").textContent = area.auxiliaryOnly ? area.evidence : assertKey(DATA.analysis.itemDetails, state.selectedItem, "巡检项").evidence;
    q("visionTags").innerHTML = "";
    var tags = area.auxiliaryOnly ? area.tags : assertKey(DATA.analysis.itemDetails, state.selectedItem, "巡检项").tags;
    tags.forEach(function (tag, i) {
      q("visionTags").appendChild(el("span", { class: "tag" + (i === 0 ? " hot" : ""), text: tag }));
    });
    renderExplainList("visionExplainList", DATA.analysis.visionExplain);
    q("visionPrimary").textContent = state.browseMode || area.auxiliaryOnly ? "返回区域概要" : "生成复检清单";
    q("visionPrimary").dataset.action = state.browseMode || area.auxiliaryOnly ? "back-overview" : "go-recheck";
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
    var isConfirmStep = state.stepKey === "confirm";
    q("recheckTitle").textContent = isConfirmStep ? "人工确认工作台" : "复检工作台";
    q("recheckSubtitle").textContent = isConfirmStep
      ? "请在复检证据和规则依据基础上选择人工结论,系统不会自动替人员下结论。"
      : "把 AI 疑点转换成可执行复检项，并保留人工确认边界。";

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
    q("recheckStatus").textContent = state.decision ? "已选择: " + DATA.recheck.decisionStatus[state.decision] : isConfirmStep ? "请选择人工结论" : "待人工确认";
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
    q("reportBackBtn").textContent = state.archived ? "回到大屏看闭环" : "返回任务总览";

    q("caseTags").innerHTML = "";
    DATA.report.caseTags.forEach(function (tag, i) {
      q("caseTags").appendChild(el("span", { class: "tag" + (i === 0 ? " hot" : ""), text: tag }));
    });
  }

  function canVisitStep(stepKey) {
    var idx = stepIndex(stepKey);
    if (idx < 0) throw new Error("[v3] 未知步骤: " + stepKey);
    if (stepKey === "report") return !!state.decision || state.archived;
    if (stepKey === "closed") return state.archived;
    if (stepKey === "recheck" || stepKey === "confirm") {
      return state.recheckReady || idx <= state.maxStepIndex + 1 || !!state.decision || state.archived;
    }
    return idx <= state.maxStepIndex + 1;
  }

  function stepLockedTitle(stepKey) {
    if (stepKey === "report") return "请先在复检确认中选择人工结论";
    if (stepKey === "closed") return "请先完成报告归档";
    return "请先完成前序步骤";
  }

  function goStep(stepKey) {
    if (!canVisitStep(stepKey)) throw new Error("[v3] 步骤尚未解锁: " + stepKey);
    if (stepKey === "task") go("overview", { stepKey: "task" });
    else if (stepKey === "form") go("form", { stepKey: "form" });
    else if (stepKey === "trend") go("trend", { stepKey: "trend" });
    else if (stepKey === "conflict") go("trend", { stepKey: "conflict" });
    else if (stepKey === "vision") go("vision", { stepKey: "vision" });
    else if (stepKey === "recheck") {
      state.recheckReady = true;
      go("recheck", { stepKey: "recheck" });
    } else if (stepKey === "confirm") {
      state.recheckReady = true;
      go("recheck", { stepKey: "confirm" });
    } else if (stepKey === "report") go("report", { stepKey: "report" });
    else if (stepKey === "closed") go("overview", { stepKey: "closed" });
    else throw new Error("[v3] 未知步骤: " + stepKey);
  }

  function renderFlow() {
    var area = assertKey(DATA.areas, state.currentArea, "区域");
    if (area.auxiliaryOnly) {
      q("flowHint").textContent = area.short + "演示生命周期 · " + area.lifecycle.terminalState;
      q("flowTrack").innerHTML = "";
      area.lifecycle.stages.forEach(function (stage, index) {
        assertKey(DATA.shell.sceneLabels, stage.scene, "场景");
        var cls = "flow-step" + (stage.scene === state.scene ? " active" : "");
        q("flowTrack").appendChild(el("button", {
          class: cls,
          type: "button",
          title: stage.purpose,
          dataset: { idx: String(index + 1), step: stage.scene },
          onClick: function () {
            if (stage.scene === "overview") selectOverviewArea(state.currentArea);
            else browseArea(stage.scene, state.currentArea, defaultStepForScene(stage.scene));
          },
        }, [
          el("strong", { text: DATA.shell.sceneLabels[stage.scene] }),
          el("small", { text: stage.purpose }),
        ]));
      });
      return;
    }

    q("flowHint").textContent = "流程步骤 · 灰色步骤需完成前序操作后解锁";
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
    var area = assertKey(DATA.areas, state.currentArea, "区域");
    q("drawerQuestions").innerHTML = "";
    area.questions.forEach(function (item) {
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
    renderForm();
    renderTrendScene();
    renderVision();
    renderRecheck();
    renderReport();
    renderDrawer();
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
    if (action === "go-form") {
      if (state.scene === "overview") go("form", { area: primaryFlow().areaKey, stepKey: "form" });
      else go("form", { stepKey: "form" });
    }
    else if (action === "go-trend") {
      if (state.browseMode || assertKey(DATA.areas, state.currentArea, "区域").auxiliaryOnly) browseArea("trend", state.currentArea, "trend");
      else go("trend", { stepKey: "trend" });
    }
    else if (action === "go-vision") {
      if (state.browseMode || assertKey(DATA.areas, state.currentArea, "区域").auxiliaryOnly) {
        browseArea("vision", state.currentArea, "vision");
        return;
      }
      markStep("conflict");
      go("vision", { stepKey: "vision" });
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
    else if (action === "go-area-secondary") areaSecondaryAction();
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
    else if (action === "back-overview") go("overview", { stepKey: state.archived ? "closed" : "task" });
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
      btn.addEventListener("click", function () {
        var target = btn.dataset.sceneTarget;
        if (state.browseMode && assertKey(DATA.areas, state.currentArea, "区域").auxiliaryOnly &&
            (target === "form" || target === "trend" || target === "vision")) {
          browseArea(target, state.currentArea, defaultStepForScene(target));
        } else {
          go(target);
        }
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
    q("riskDot").addEventListener("click", function () { openRiskFlow(primaryFlow().areaKey); });
    q("riskDot").addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openRiskFlow(primaryFlow().areaKey);
      }
    });
    qa("[data-trend]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var trendKey = btn.dataset.trend;
        var flow = primaryFlow();
        if (trendKey === flow.trendKey) {
          state.currentArea = flow.areaKey;
          state.selectedItem = flow.itemKey;
          state.frameKey = flow.frameKey;
        }
        state.currentTrend = btn.dataset.trend;
        if (state.browseMode || assertKey(DATA.areas, state.currentArea, "区域").auxiliaryOnly) showStep("trend");
        else markStep("trend");
        persistState();
        render();
      });
    });
    qa("[data-item]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (btn.closest("#scene-trend")) selectTrendItem(btn.dataset.item);
        else selectItem(btn.dataset.item, "form");
      });
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
      if (scene === "analysis") scene = "form";
      if (scene && scene !== state.scene) {
        assertKey(DATA.shell.sceneLabels, scene, "场景");
        var legal = canVisit(scene);
        state.scene = nearestLegalScene(scene);
        if (legal) markStep(defaultStepForScene(state.scene));
        else showStep(defaultStepForScene(state.scene));
        if (window.location.hash !== "#" + state.scene) window.location.hash = state.scene;
        persistState();
        render();
        scrollActiveSceneIntoView();
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
    if (initial === "analysis") initial = "form";
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
