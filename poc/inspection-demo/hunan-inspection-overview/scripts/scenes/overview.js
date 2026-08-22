// 唯一场景：window.OverviewScene（L6 场景层，早于 boot.js，晚于 core/* 与 ui/*）。
//
// 【POC：hunan-inspection-overview（巡检站总览，6 作业区站点台账）】
// 本文件与 poc/hunan-pump-overview/scripts/scenes/overview.js 是姐妹文件但内容不同：
// 布局骨架/交互模式完全一致（两级钻取：省域 → 作业区），但左栏第 2/4 卡、右栏第 2/3
// 张图表用各自 POC 独有的 HunanSeries 方法（本文件用 inspectionCoverageTrend /
// zoneCoverageRows，姐妹文件换成 pipelineProfile / throughputRows / pumpHealthRank），
// 标题文案也各自贴合"巡检"与"泵站"两种业务语义。
//
// 【2026-08】本文件是**旧版**总览场景，仍可独立运行、未做改动。重排过布局与文案的
// 新版在 poc/inspection-demo/hunan-overview-v2/scripts/scenes/overview.js——那一版
// 跨目录引用本目录的数据层与 3D 层原文件（不复制），两版共存以便对比。
//
// 钻取只做两级（任务要求，不做第三级）：
//   省域（zoneId == null）：3D 显示 6 个作业区标签 + 热点，右栏是全省态势提示。
//   作业区（zoneId 非空）：3D 相机推进到该作业区（zoneAnchors），站点级不推相机、
//     不显示逐站 3D 标签（HunanContract.assertLabelKeys 在 zone 级本就不要求全集，
//     允许空标签集），改由右栏"站点清单"表格 + 站点详情卡承载——这是刻意的简化，
//     两级钻取足够讲清"全省 → 某作业区"的叙事，逐站 3D 推镜头对这个 demo 是过度设计。
//
// 本文件只渲染 DOM，不 addEventListener：所有交互点都天然带 data-select/
// data-select-id / data-hunan-zone / data-action，由 boot.js 的 bindStage()
// 统一做事件委托。
(function () {
  "use strict";

  var Contract = window.HunanContract;
  var Sites = window.HunanSites;
  var Series = window.HunanSeries;
  var Quality = window.HunanInspectionQuality;
  var STATUS_LABEL = { ok: "正常", warn: "关注", danger: "异常" };
  var DATE_RANGES = [
    { id: "7d", label: "近7天", shortLabel: "近7日", days: 7 },
    { id: "30d", label: "近30天", shortLabel: "近30日", days: 30 },
    { id: "month", label: "本月", shortLabel: "本月", monthToDate: true },
    { id: "custom", label: "自定义" },
  ];
  var CUSTOM_DATE_RANGES = [
    { id: "xiangtan-review", label: "湘潭站问题复核", start: "2026-04-24", end: "2026-04-30", shortLabel: "4/24-4/30" },
    { id: "risk-recheck", label: "重点隐患复查", start: "2026-07-28", end: "2026-08-04", shortLabel: "7/28-8/4" },
    { id: "monthly-inspection", label: "月度巡检窗口", start: "2026-08-01", end: "2026-08-17", shortLabel: "8月巡检" },
  ];

  function assertLoaded() {
    if (!Contract) throw new Error("[OverviewScene] window.HunanContract 未加载");
    if (!Sites) throw new Error("[OverviewScene] window.HunanSites 未加载");
    if (!Series) throw new Error("[OverviewScene] window.HunanSeries 未加载");
    if (!Quality) throw new Error("[OverviewScene] window.HunanInspectionQuality 未加载");
  }

  // ---------------------------------------------------------------------
  // 顶栏 / 底栏（DOM 契约见 styles/02-shell.css 文件头注释）
  // ---------------------------------------------------------------------

  function pad2(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function formatDate(date) {
    return date.getFullYear() + "-" + pad2(date.getMonth() + 1) + "-" + pad2(date.getDate());
  }

  function dateRangeById(id) {
    for (var i = 0; i < DATE_RANGES.length; i += 1) {
      if (DATE_RANGES[i].id === id) return DATE_RANGES[i];
    }
    throw new Error("未知日期范围：" + id);
  }

  function customDateRangeById(id) {
    for (var i = 0; i < CUSTOM_DATE_RANGES.length; i += 1) {
      if (CUSTOM_DATE_RANGES[i].id === id) return CUSTOM_DATE_RANGES[i];
    }
    throw new Error("未知自定义日期范围：" + id);
  }

  function isDateRangeId(id) {
    for (var i = 0; i < DATE_RANGES.length; i += 1) {
      if (DATE_RANGES[i].id === id) return true;
    }
    return false;
  }

  function isCustomDateRangeId(id) {
    for (var i = 0; i < CUSTOM_DATE_RANGES.length; i += 1) {
      if (CUSTOM_DATE_RANGES[i].id === id) return true;
    }
    return false;
  }

  function activeDateRange(state) {
    var range = dateRangeById(state && state.dateRangeId ? state.dateRangeId : "7d");
    if (range.id === "custom") {
      var customRange = customDateRangeById(state.customRangeId);
      return {
        id: range.id,
        label: range.label,
        customLabel: customRange.label,
        shortLabel: customRange.shortLabel,
        fixedText: customRange.start + " 至 " + customRange.end,
        start: customRange.start,
        end: customRange.end,
      };
    }
    return range;
  }

  function dateRangeText(range, now) {
    if (range.fixedText) return range.fixedText;
    var start = new Date(now.getTime());
    if (range.monthToDate) {
      start.setDate(1);
    } else {
      start.setDate(start.getDate() - range.days + 1);
    }
    return formatDate(start) + " 至 " + formatDate(now);
  }

  function parseDateOnly(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("日期必须使用 YYYY-MM-DD 格式：" + value);
    var date = new Date(value + "T00:00:00");
    if (Number.isNaN(date.getTime()) || formatDate(date) !== value) {
      throw new Error("非法日期：" + value);
    }
    return date;
  }

  function dateRangePointCount(range, now) {
    if (range.pointCount) return range.pointCount;
    if (range.start && range.end) {
      var start = parseDateOnly(range.start);
      var end = parseDateOnly(range.end);
      var count = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
      if (count < 1 || count > 31) throw new Error("自定义日期范围点数必须在 1 到 31 之间：" + count);
      return count;
    }
    if (range.monthToDate) return now.getDate();
    return range.days;
  }

  function renderDateRangePicker(state, now) {
    var active = activeDateRange(state);
    var isCustomOpen = !!(state && state.customRangeOpen);
    return h("div", { class: "date-range-picker" + (isCustomOpen ? " is-custom-open" : ""), "aria-label": "数据日期范围" }, [
      h("span", { class: "date-range-label", text: dateRangeText(active, now) }),
      h("div", { class: "date-range-control" }, [
        h("div", { class: "date-range-options" }, DATE_RANGES.map(function (range) {
          var isActive = range.id === active.id;
          var isCustom = range.id === "custom";
          var attrs = {
            type: "button",
            class: "date-range-btn" + (isActive ? " is-active" : "") + (isCustomOpen && isCustom ? " is-open" : ""),
            "data-action": isCustom ? "toggle-custom-date-menu" : "set-date-range",
            "aria-pressed": isActive ? "true" : "false",
            title: isCustom ? "自定义统计范围" : range.label + " · " + dateRangeText(range, now),
            text: range.label,
          };
          if (isCustom) {
            attrs["aria-haspopup"] = "listbox";
            attrs["aria-expanded"] = isCustomOpen ? "true" : "false";
          } else {
            attrs["data-date-range"] = range.id;
          }
          return h("button", attrs);
        })),
        isCustomOpen ? renderCustomDateRangeMenu(state) : null,
      ]),
    ]);
  }

  function renderCustomDateRangeMenu(state) {
    var isCustomActive = state.dateRangeId === "custom";
    return h("div", { class: "custom-date-menu", role: "listbox", "aria-label": "自定义统计范围" }, [
      h("div", { class: "custom-date-menu-head" }, [
        h("strong", { text: "自定义统计范围" }),
        h("span", { text: "巡检预设" }),
      ]),
      h("div", { class: "custom-date-menu-list" }, CUSTOM_DATE_RANGES.map(function (range) {
        var isActive = isCustomActive && state.customRangeId === range.id;
        return h("button", {
          type: "button",
          class: "custom-date-option" + (isActive ? " is-active" : ""),
          "data-action": "set-custom-date-range",
          "data-custom-range": range.id,
          role: "option",
          "aria-selected": isActive ? "true" : "false",
        }, [
          h("span", { class: "custom-date-option-title", text: range.label }),
          h("span", { class: "custom-date-option-range", text: range.start + " 至 " + range.end }),
        ]);
      })),
    ]);
  }

  function renderTopbar(state) {
    var now = new Date();
    var range = activeDateRange(state);
    var weekday = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][now.getDay()];
    return h("header", { class: "topbar panel" }, [
      h("div", { class: "topbar-left" }, [
        h("div", { class: "brand" }, [
          h("span", { class: "brand-mark", text: "湘" }),
          h("div", {}, [
            h("h1", { text: "湖南省油气管网大屏" }),
            h("small", { text: "巡检站总览 · V3-20260119" }),
          ]),
        ]),
      ]),
      h("div", { class: "topbar-title" }, [
        h("span", { class: "topbar-wing left", "aria-hidden": "true" }),
        h("div", { class: "topbar-title-main" }, [
          h("p", { class: "kicker", text: "HUNAN OIL & GAS NETWORK OVERVIEW" }),
          h("h1", { text: "湖南省油气管网巡检总览" }),
          h("div", { class: "topbar-title-rule" }),
        ]),
        h("span", { class: "topbar-wing right", "aria-hidden": "true" }),
      ]),
      h("div", { class: "topbar-right" }, [
        renderDateRangePicker(state, now),
        h("button", { type: "button", class: "tool-btn", "data-action": "refresh", text: "刷新数据" }),
        h("div", { class: "topbar-clock" }, [
          h("strong", { text: pad2(now.getHours()) + ":" + pad2(now.getMinutes()) + ":" + pad2(now.getSeconds()) }),
          h("small", { text: formatDate(now) + " " + weekday + " · " + range.shortLabel }),
        ]),
      ]),
    ]);
  }

  function renderBottombar(state) {
    var crumbs = [h("span", { class: "crumb", "data-select": "crumb-province", text: "湖南省" })];
    if (state.zoneId != null) {
      crumbs.push(h("span", { class: "crumb-sep", "aria-hidden": "true", text: "›" }));
      crumbs.push(h("span", { class: "crumb current", text: Contract.ZONE_NAMES[state.zoneId] }));
    }
    // 底栏只做**位置指示**，不再放任何操作按钮。
    //
    // 之前「返回全省」同时在底栏左和地图左上角、「重置视角」同时在底栏右和地图右下角
    // 的 ⟲——同一批视口操作散在三处、互相重复，比放在任何单独一处都更费解。现在全部
    // 收进地图右下角那一组（见 renderMapPanel 的 .ov-zoom），一处即全部。
    return h("footer", { class: "bottombar panel" }, [
      h("nav", { class: "crumbs", "aria-label": "下钻路径" }, crumbs),
    ]);
  }

  // ---------------------------------------------------------------------
  // 左栏：4 张卡（总体 KPI / 质量保障 / 作业区排名 / 今日动态）
  // ---------------------------------------------------------------------

  function renderKpiCard(state) {
    var sp = Series.provinceSummary();
    var q = Quality.current(state.zoneId);
    var range = activeDateRange(state);
    return h("div", { class: "ov-kpi-row" }, [
      window.Cards.metric({ label: "巡检完成率", value: q.completionRate.toFixed(1), unit: "%", status: q.completionRate < 95 ? "warn" : "ok", note: q.completed + "/" + q.planned + " · " + range.shortLabel }),
      window.Cards.metric({ label: "站点台账", value: sp.stationTotal + sp.valveTotal, unit: "个", status: "ok", note: sp.zoneTotal + " 作业区 · 站场 " + sp.stationTotal + " · 阀室 " + sp.valveTotal }),
      window.Cards.metric({ label: "行为异常", value: q.duration + q.interval + q.offWindow, unit: "次", status: q.duration + q.interval + q.offWindow > 0 ? "warn" : "ok", note: "AI 提醒 " + q.aiAlerts + " 条" }),
    ]);
  }

  function renderZoneRankCard(state) {
    var rows = Series.zoneRankRows().slice().sort(function (a, b) {
      // 分数低（问题多）的作业区排前面，优先引起注意；score=null（本口径下该
      // 作业区没有任何站点，如泵站总览里的湘北/湘中/郴州/湘西）排在最后——
      // 不是"表现差"，是没有数据可评，不该抢占最需要关注的位置。
      var as = a.score == null ? Infinity : a.score;
      var bs = b.score == null ? Infinity : b.score;
      return as - bs;
    });
    var columns = [
      { key: "status", label: "", type: "status-dot", width: 20 },
      { key: "name", label: "作业区", type: "text", width: 96 },
      { key: "total", label: "站点", type: "text", width: 44 },
      { key: "issue", label: "问题", type: "badge-icon", width: 70 },
    ];
    var items = rows.map(function (row) {
      var status = row.issueCount === 0 ? "ok" : (row.score != null && row.score < 70 ? "danger" : "warn");
      return {
        id: row.zoneId,
        status: status,
        cells: {
          name: row.name.replace("作业区", ""),
          total: String(row.total),
          issue: row.issueCount + " 项",
        },
      };
    });
    items.unshift({
      id: "__none__",
      status: "ok",
      cells: { name: "‹ 全省视图", total: String(Series.provinceSummary().stationTotal + Series.provinceSummary().valveTotal), issue: "-" },
    });
    var activeId = state.zoneId != null ? state.zoneId : "__none__";
    return h("div", { class: "ov-rank-card" }, [
      h("div", { class: "ov-rank-card-head" }, [
        h("span", { class: "ov-rank-card-title", text: "作业区排名 · 点击下钻" }),
      ]),
      h("div", { class: "ov-rank-card-body" }, [
        window.SelectList.render({
          name: "zone-rank", variant: "table", activeId: activeId,
          ariaLabel: Contract.ZONE_IDS.length + " 个作业区排名", columns: columns, items: items,
        }),
      ]),
    ]);
  }

  function renderTodayCard(state) {
    var range = activeDateRange(state);
    return window.Cards.chart({ title: "动态趋势 · " + range.shortLabel + "巡检完成率", chartId: "chart-coverage-trend" });
  }

  function renderLeftColumn(state) {
    assertLoaded();
    return h("section", { class: "panel ov-left-col" }, [
      renderKpiCard(state),
      renderQualityCard(state),
      renderZoneRankCard(state),
      renderTodayCard(state),
    ]);
  }

  // ---------------------------------------------------------------------
  // 中间：3D 地图面板（DOM 契约见 styles/05-hunan3d.css 文件头注释）
  // ---------------------------------------------------------------------

  function renderMapPanel(state) {
    var zoneStatuses = Sites.zoneStatuses();
    // 标签 LOD：省域态显示全部 6 个作业区标签；**下钻态只显示当前作业区那一个**。
    //
    // 为什么必须过滤而不是全渲染：engine.js 的 syncLabels 末尾会把每个标签
    // clamp 进视口（`p.x = clamp(p.x, halfWidth, width - halfWidth)`），所以画外的
    // 作业区标签不会消失，而是被**钉在屏幕四边**。下钻到岳阳时，其他作业区
    // 全在画外，结果就是四条边上贴满了与当前视图无关的标签。
    // 契约的 assertLabelKeys 对此是放行的——它在 zone/site 级只要求"键合法不重复"、
    // 不要求全集，正是为了让这层过滤成立。
    var visibleZoneIds = state.zoneId == null ? Contract.ZONE_IDS : [state.zoneId];
    var zoneLabels = visibleZoneIds.map(function (zoneId) {
      var progress = Sites.zoneProgress(zoneId);
      return h("button", {
        type: "button",
        class: "" + zoneStatuses[zoneId],
        "data-hunan-zone": zoneId,
      }, [
        h("span", { class: "zone-pin-name", text: Contract.ZONE_NAMES[zoneId].replace("作业区", "") }),
        h("span", { class: "zone-pin-count", text: progress.total + " 站" }),
      ]);
    });

    return h("section", { class: "panel ov-map-panel" }, [
      h("div", { class: "ov-map-head" }, [
        h("div", {}, [
          h("p", { class: "kicker", text: "区域质量热区 · 省域总览" }),
          h("h3", { text: state.zoneId == null ? "湖南省全域" : Contract.ZONE_NAMES[state.zoneId] }),
        ]),
        h("div", { class: "ov-legend" }, [
          h("span", { class: "ov-legend-item" }, [h("i", { class: "dot ok" }), "正常"]),
          h("span", { class: "ov-legend-item" }, [h("i", { class: "dot warn" }), "关注"]),
          h("span", { class: "ov-legend-item" }, [h("i", { class: "dot danger" }), "异常"]),
        ]),
      ]),
      h("div", { class: "hunan-map", "data-hunan-host": "1" }, [
        h("div", { class: "hunan-labels" }, zoneLabels),
        // 视口操作**唯一**的一组：返回 / 放大 / 缩小 / 重置视角。
        // 全部图标按钮都带 title，悬停可见中文说明——图标本身不承担全部语义。
        // 「返回全省」只在下钻态出现（全省态没有可返回的上一层，不渲染、也不做成
        // disabled 占位），所以这一组在两种状态下分别是 3 个和 4 个按钮。
        h("div", { class: "ov-zoom" }, [
          state.zoneId == null ? null : h("button", {
            type: "button", class: "ov-zoom-btn ov-zoom-back", "data-action": "back-to-overview",
            "aria-label": "返回全省", title: "返回全省", text: "‹",
          }),
          h("button", { type: "button", class: "ov-zoom-btn", "data-action": "map-zoom-in", "aria-label": "放大", title: "放大", text: "+" }),
          h("button", { type: "button", class: "ov-zoom-btn", "data-action": "map-zoom-out", "aria-label": "缩小", title: "缩小", text: "−" }),
          h("button", { type: "button", class: "ov-zoom-btn ov-zoom-reset", "data-action": "reset-view", "aria-label": "重置视角", title: "重置视角", text: "⟲" }),
        ]),
      ]),
    ]);
  }

  // ---------------------------------------------------------------------
  // 右栏：覆盖率图表 + 下钻区域（省域态提示 / 作业区态站点清单+详情）
  // ---------------------------------------------------------------------

  function renderProvinceHint() {
    var sp = Series.provinceSummary();
    return window.DetailCard.render({
      kicker: "全省态势 · 巡检站总览",
      title: "湖南省 6 作业区 · 141 个站场/阀室",
      badge: { status: sp.issueTotal > 0 ? "warn" : "ok", text: sp.issueTotal > 0 ? "发现问题" : "全部正常" },
      metrics: [
        { label: "作业区", value: sp.zoneTotal, unit: "个" },
        { label: "站点总数", value: sp.stationTotal + sp.valveTotal, unit: "个" },
        { label: "问题合计", value: sp.issueTotal, unit: "项" },
      ],
      conclusion: "点击左侧作业区排名或地图上的作业区标签，下钻查看该区站点清单与详情。",
      tags: ["两级钻取", "省域 → 作业区"],
      actions: [],
    });
  }

  function metricTone(value, warnAt, dangerAt) {
    if (value >= dangerAt) return "danger";
    if (value >= warnAt) return "warn";
    return "ok";
  }

  function renderQualityMetric(label, value, unit, note, status) {
    return h("div", { class: "ov-quality-item " + status }, [
      h("span", { class: "ov-quality-label", text: label }),
      h("strong", { class: "ov-quality-value" }, [
        String(value),
        unit ? h("small", { text: unit }) : null,
      ]),
      note ? h("em", { text: note }) : null,
    ]);
  }

  function renderQualityCard(state) {
    var q = Quality.current(state.zoneId);
    var range = activeDateRange(state);
    var riskStatus = q.riskLevel === "P1" ? "danger" : (q.riskLevel === "P2" ? "warn" : "ok");
    var completionStatus = q.completionRate < 95 ? "warn" : "ok";
    var behaviorExceptions = q.duration + q.interval + q.offWindow;
    return h("section", {
      class: "ov-quality-card",
      "data-quality-scope": state.zoneId == null ? "province" : state.zoneId,
    }, [
      h("div", { class: "ov-quality-head" }, [
        h("span", { class: "ov-quality-title", text: "巡检质量保障" }),
        h("small", { text: q.name + " · " + range.shortLabel }),
      ]),
      h("div", { class: "ov-quality-focus" }, [
        h("div", { class: "ov-quality-focus-item " + riskStatus }, [
          h("span", { text: "当前风险" }),
          h("strong", { text: q.riskLevel }),
          h("em", { text: q.currentRisk > 0 ? q.currentRisk + "项待处置" : "无P1风险" }),
        ]),
        h("div", { class: "ov-quality-focus-item " + completionStatus }, [
          h("span", { text: "巡检完成率" }),
          h("strong", { text: q.completionRate.toFixed(1) + "%" }),
          h("em", { text: q.completed + "/" + q.planned + " 已完成" }),
        ]),
        h("div", { class: "ov-quality-focus-item " + metricTone(behaviorExceptions, 2, 5) }, [
          h("span", { text: "行为异常" }),
          h("strong", { text: behaviorExceptions + "次" }),
          h("em", { text: "AI提醒 " + q.aiAlerts + "条" }),
        ]),
      ]),
      h("div", { class: "ov-quality-grid" }, [
        renderQualityMetric("发现问题数", q.issues, "项", "P1 " + q.p1Issues, metricTone(q.issues, 1, 4)),
        renderQualityMetric("时长异常", q.duration, "次", "<10min", metricTone(q.duration, 1, 3)),
        renderQualityMetric("间隔异常", q.interval, "次", "<10s", metricTone(q.interval, 1, 3)),
        renderQualityMetric("时段异常", q.offWindow, "次", "偏移30min", metricTone(q.offWindow, 1, 2)),
        renderQualityMetric("AI 提醒", q.aiAlerts, "条", "时序/轨迹", metricTone(q.aiAlerts, 1, 3)),
        renderQualityMetric("计划巡检", q.planned, "项", "已完成 " + q.completed, completionStatus),
      ]),
    ]);
  }

  function siteStatusBadgeText(status) {
    return STATUS_LABEL[status];
  }

  function renderSiteDetail(site) {
    var conclusion = site.name + " 使用作业区级示意坐标，仅用于首页区域态势。";
    return window.DetailCard.render({
      kicker: "站点详情 · " + site.districtName,
      title: site.name,
      activeZoneLabel: Contract.ZONE_NAMES[site.zoneId],
      badge: { status: site.status, text: siteStatusBadgeText(site.status) },
      metrics: [
        { label: "类型", value: site.kind === "station" ? "站场" : "阀室" },
        { label: "介质", value: site.medium },
        { label: "类别", value: site.category },
      ],
      conclusion: conclusion,
      tags: [site.districtName, Contract.ZONE_NAMES[site.zoneId]],
      actions: [],
    });
  }

  function renderDrillSection(state) {
    if (state.zoneId == null) {
      return h("div", { class: "ov-drill-section" }, [
        renderProvinceHint(),
      ]);
    }
    var sites = Sites.sitesByZone(state.zoneId).slice().sort(function (a, b) {
      if (a.status === b.status) return a.name < b.name ? -1 : 1;
      var rank = { danger: 0, warn: 1, ok: 2 };
      return rank[a.status] - rank[b.status];
    });
    var columns = [
      { key: "status", label: "", type: "status-dot", width: 20 },
      { key: "name", label: "名称", type: "text", width: 110 },
      { key: "kind", label: "类型", type: "text", width: 50 },
      { key: "district", label: "所在市", type: "text", width: 70 },
    ];
    var items = sites.map(function (site) {
      return {
        id: site.id,
        status: site.status,
        cells: {
          name: site.name,
          kind: site.kind === "station" ? "站场" : "阀室",
          district: site.districtName,
        },
      };
    });
    var activeId = state.siteId != null ? state.siteId : items[0].id;
    var activeSite = sites.filter(function (s) { return s.id === activeId; })[0];
    return h("div", { class: "ov-drill-section" }, [
      h("div", { class: "ov-site-list-card" }, [
        h("div", { class: "ov-rank-card-head" }, [
          h("span", { class: "ov-rank-card-title", text: Contract.ZONE_NAMES[state.zoneId] + " · " + sites.length + " 个站点" }),
        ]),
        h("div", { class: "ov-site-list-body" }, [
          window.SelectList.render({
            name: "site-list", variant: "table", activeId: activeId,
            ariaLabel: Contract.ZONE_NAMES[state.zoneId] + " 站点清单", columns: columns, items: items,
          }),
        ]),
      ]),
      renderSiteDetail(activeSite),
    ]);
  }

  function renderRightColumn(state) {
    assertLoaded();
    return h("div", { class: "ov-right-col" }, [
      window.Cards.chart({ title: "作业区巡检覆盖率", chartId: "chart-zone-coverage" }),
      renderDrillSection(state),
    ]);
  }

  // ---------------------------------------------------------------------
  // 图表绘制（boot.js 在 DOM append 之后调用，接上 mountChartSlots 留好的容器）
  // ---------------------------------------------------------------------

  function renderCharts(state) {
    var range = activeDateRange(state);
    window.Charts.draw("chart-coverage-trend", window.ChartOptions.inspectionCoverageTrend({
      pointCount: dateRangePointCount(range, new Date()),
    }));
    window.Charts.draw("chart-zone-coverage", window.ChartOptions.zoneCoverageRows());
  }

  window.OverviewScene = {
    renderTopbar: renderTopbar,
    renderBottombar: renderBottombar,
    renderLeftColumn: renderLeftColumn,
    renderMapPanel: renderMapPanel,
    renderRightColumn: renderRightColumn,
    renderCharts: renderCharts,
    isDateRangeId: isDateRangeId,
    isCustomDateRangeId: isCustomDateRangeId,
  };
})();
