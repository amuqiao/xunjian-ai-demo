// 唯一场景：window.OverviewScene（L6 场景层，早于 boot.js，晚于 core/* 与 ui/*）。
//
// 【POC：hunan-pump-overview（泵站总览，成品油 44 站点）】
// 本文件与 poc/hunan-inspection-overview/scripts/scenes/overview.js 是姐妹文件但内容
// 不同：布局骨架/交互模式完全一致（两级钻取：省域 → 作业区），但左栏第 4 卡、右栏
// 第 2/3 张图表用各自 POC 独有的 HunanSeries 方法（本文件用 pipelineProfile /
// throughputRows / pumpHealthRank，姐妹文件换成 inspectionCoverageTrend /
// issueByDiscipline / zoneCoverageRows），标题文案贴合"成品油泵站"业务语义。
//
// 钻取只做两级（任务要求，不做第三级），与姐妹 POC 同一套设计，理由见该文件同一
// 位置的注释，此处不重复。
//
// 本文件只渲染 DOM，不 addEventListener：所有交互点都天然带 data-select/
// data-select-id / data-hunan-zone / data-action，由 boot.js 的 bindStage()
// 统一做事件委托。
(function () {
  "use strict";

  var Contract = window.HunanContract;
  var Sites = window.HunanSites;
  var Series = window.HunanSeries;
  var STATUS_LABEL = { ok: "正常", warn: "关注", danger: "异常" };
  var DATE_RANGES = [
    { id: "7d", label: "近7天", shortLabel: "近7日", days: 7 },
    { id: "30d", label: "近30天", shortLabel: "近30日", days: 30 },
    { id: "month", label: "本月", shortLabel: "本月", monthToDate: true },
    { id: "custom", label: "自定义" },
  ];
  var CUSTOM_DATE_RANGES = [
    { id: "pump-overhaul", label: "P-3泵大修窗口", start: "2026-07-28", end: "2026-08-04", shortLabel: "7/28-8/4" },
    { id: "interlock-review", label: "联锁报警复核", start: "2026-08-01", end: "2026-08-17", shortLabel: "8/1-8/17" },
    { id: "monthly-operation", label: "月度运行窗口", start: "2026-08-01", end: "2026-08-17", shortLabel: "8月运行" },
  ];

  function assertLoaded() {
    if (!Contract) throw new Error("[OverviewScene] window.HunanContract 未加载");
    if (!Sites) throw new Error("[OverviewScene] window.HunanSites 未加载");
    if (!Series) throw new Error("[OverviewScene] window.HunanSeries 未加载");
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

  function dateRangeById(rangeId) {
    return DATE_RANGES.filter(function (range) { return range.id === rangeId; })[0];
  }

  function customDateRangeById(customRangeId) {
    return CUSTOM_DATE_RANGES.filter(function (range) { return range.id === customRangeId; })[0];
  }

  function isDateRangeId(rangeId) {
    return !!dateRangeById(rangeId);
  }

  function isCustomDateRangeId(customRangeId) {
    return !!customDateRangeById(customRangeId);
  }

  function activeDateRange(state) {
    if (!state || state.dateRangeId == null) return DATE_RANGES[0];
    var range = dateRangeById(state.dateRangeId);
    if (!range) throw new Error("非法统计时间范围：" + state.dateRangeId);
    if (range.id === "custom") {
      var customRange = customDateRangeById(state.customRangeId);
      if (!customRange) throw new Error("非法自定义统计时间范围：" + state.customRangeId);
      return {
        id: range.id,
        label: range.label,
        customLabel: customRange.label,
        shortLabel: customRange.shortLabel,
        fixedText: customRange.start + " 至 " + customRange.end,
      };
    }
    return range;
  }

  function dateRangeText(range, now) {
    if (range.fixedText) return range.fixedText;
    if (range.monthToDate) {
      return formatDate(new Date(now.getFullYear(), now.getMonth(), 1)) + " 至 " + formatDate(now);
    }
    var start = new Date(now.getTime());
    start.setDate(start.getDate() - range.days + 1);
    return formatDate(start) + " 至 " + formatDate(now);
  }

  function renderDateRangePicker(state, now) {
    var active = activeDateRange(state);
    var isCustomOpen = !!(state && state.customRangeOpen);
    return h("div", { class: "date-range-picker" + (isCustomOpen ? " is-custom-open" : ""), "aria-label": "统计时间范围" }, [
      h("span", { class: "date-range-label", text: dateRangeText(active, now) }),
      h("div", { class: "date-range-control" }, [
        h("div", { class: "date-range-options", role: "group", "aria-label": "选择统计时间范围" }, DATE_RANGES.map(function (range) {
          var isActive = range.id === active.id;
          var isCustom = range.id === "custom";
          var attrs = {
            type: "button",
            class: "date-range-btn" + (isActive ? " is-active" : "") + (isCustomOpen && isCustom ? " is-open" : ""),
            "data-action": isCustom ? "toggle-custom-date-menu" : "set-date-range",
            "aria-pressed": isActive ? "true" : "false",
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
    return h("div", { class: "custom-date-menu", role: "listbox", "aria-label": "自定义统计范围" }, [
      h("div", { class: "custom-date-menu-head" }, [
        h("strong", { text: "自定义统计范围" }),
        h("span", { text: "演示预设" }),
      ]),
      h("div", { class: "custom-date-menu-list" }, CUSTOM_DATE_RANGES.map(function (range) {
        var isActive = state.customRangeId === range.id;
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
            h("small", { text: "泵站总览 · 成品油管网 · V3-20260119" }),
          ]),
        ]),
      ]),
      h("div", { class: "topbar-title" }, [
        h("span", { class: "topbar-wing left", "aria-hidden": "true" }),
        h("div", { class: "topbar-title-main" }, [
          h("p", { class: "kicker", text: "HUNAN REFINED OIL PIPELINE OVERVIEW" }),
          h("h1", { text: "湖南省成品油管网泵站总览" }),
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
  // 左栏：4 张卡（总体 KPI / 管线概览 / 作业区排名 / 沿线动态）
  // ---------------------------------------------------------------------

  function renderKpiCard(state) {
    var sp = Series.provinceSummary();
    var range = activeDateRange(state);
    return h("div", { class: "ov-kpi-row" }, [
      window.Cards.metric({ label: "站点总数", value: sp.stationTotal + sp.valveTotal, unit: "个", status: "ok", note: range.shortLabel + " · 站场 " + sp.stationTotal + " · 阀室 " + sp.valveTotal }),
      window.Cards.metric({ label: "管道总数", value: sp.pipelineTotal, unit: "条", status: "ok", note: range.shortLabel + " · 成品油管网" }),
      window.Cards.metric({ label: "问题合计", value: sp.issueTotal, unit: "项", status: sp.issueTotal > 0 ? "warn" : "ok", note: range.shortLabel + " · 关注 + 异常" }),
    ]);
  }

  function renderPipelineOverviewCard() {
    return window.Cards.chart({ title: "管线概览 · 站点构成", chartId: "chart-site-kind-mix" });
  }

  function renderZoneRankCard(state) {
    var rows = Series.zoneRankRows().slice().sort(function (a, b) {
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
      var status = row.total === 0 ? "ok" : (row.issueCount === 0 ? "ok" : (row.score != null && row.score < 70 ? "danger" : "warn"));
      return {
        id: row.zoneId,
        status: status,
        cells: {
          name: row.name.replace("作业区", ""),
          total: row.total === 0 ? "无覆盖" : String(row.total),
          issue: row.total === 0 ? "-" : row.issueCount + " 项",
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
          ariaLabel: "10 个作业区排名", columns: columns, items: items,
        }),
      ]),
    ]);
  }

  function renderTodayCard(state) {
    var range = activeDateRange(state);
    return window.Cards.chart({ title: "沿线动态 · " + range.shortLabel + "压力剖面", chartId: "chart-pressure-profile" });
  }

  function renderLeftColumn(state) {
    assertLoaded();
    return h("section", { class: "panel ov-left-col" }, [
      renderKpiCard(state),
      renderPipelineOverviewCard(),
      renderZoneRankCard(state),
      renderTodayCard(state),
    ]);
  }

  // ---------------------------------------------------------------------
  // 中间：3D 地图面板（DOM 契约见 styles/05-hunan3d.css 文件头注释）
  // ---------------------------------------------------------------------

  function renderMapPanel(state) {
    var zoneStatuses = Sites.zoneStatuses();
    // 标签 LOD：省域态显示全部 10 个作业区标签；**下钻态只显示当前作业区那一个**。
    //
    // 为什么必须过滤而不是全渲染：engine.js 的 syncLabels 末尾会把每个标签
    // clamp 进视口（`p.x = clamp(p.x, halfWidth, width - halfWidth)`），所以画外的
    // 作业区标签不会消失，而是被**钉在屏幕四边**。下钻到岳阳时，另外 9 个作业区
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
          h("p", { class: "kicker", text: "3D 大屏 · 省域总览" }),
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
        // 视口操作**唯一**的一组：返回 / 放大 / 缩小 / 重置视角 / 管道开关。
        // 全部图标按钮都带 title，悬停可见中文说明——图标本身不承担全部语义。
        // 「返回全省」只在下钻态出现（全省态没有可返回的上一层，不渲染、也不做成
        // disabled 占位），所以这一组在两种状态下分别是 4 个和 5 个按钮。
        h("div", { class: "ov-zoom" }, [
          state.zoneId == null ? null : h("button", {
            type: "button", class: "ov-zoom-btn ov-zoom-back", "data-action": "back-to-overview",
            "aria-label": "返回全省", title: "返回全省", text: "‹",
          }),
          h("button", { type: "button", class: "ov-zoom-btn", "data-action": "map-zoom-in", "aria-label": "放大", title: "放大", text: "+" }),
          h("button", { type: "button", class: "ov-zoom-btn", "data-action": "map-zoom-out", "aria-label": "缩小", title: "缩小", text: "−" }),
          h("button", { type: "button", class: "ov-zoom-btn ov-zoom-reset", "data-action": "reset-view", "aria-label": "重置视角", title: "重置视角", text: "⟲" }),
          h("button", { type: "button", class: "ov-zoom-btn ov-zoom-pipe", "data-action": "toggle-pipelines", "aria-label": "管道显示/隐藏", title: "管道显示/隐藏", text: "⤳" }),
        ]),
      ]),
    ]);
  }

  // ---------------------------------------------------------------------
  // 右栏：3 张图表卡 + 下钻区域（省域态提示 / 作业区态站点清单+详情）
  // ---------------------------------------------------------------------

  function renderProvinceHint() {
    var sp = Series.provinceSummary();
    return window.DetailCard.render({
      kicker: "全省态势 · 泵站总览",
      title: "湖南省成品油管网 · 6 个作业区覆盖",
      badge: { status: sp.issueTotal > 0 ? "warn" : "ok", text: sp.issueTotal > 0 ? "发现问题" : "全部正常" },
      metrics: [
        { label: "站点总数", value: sp.stationTotal + sp.valveTotal, unit: "个" },
        { label: "管道总数", value: sp.pipelineTotal, unit: "条" },
        { label: "问题合计", value: sp.issueTotal, unit: "项" },
      ],
      conclusion: "点击左侧作业区排名或地图上的作业区标签，下钻查看该区站点清单与详情。",
      tags: ["两级钻取", "省域 → 作业区"],
      actions: [],
    });
  }

  function siteStatusBadgeText(status) {
    return STATUS_LABEL[status];
  }

  function renderSiteDetail(site) {
    var conclusion = site.coordSource === "approx"
      ? site.name + " 位置为按市域插值的示意坐标，非实测。"
      : site.name + " 位置取自《长郴管道走向全图》实测坐标。";
    return window.DetailCard.render({
      kicker: "站点详情 · " + site.districtName,
      title: site.name,
      activeZoneLabel: Contract.ZONE_NAMES[site.zoneId],
      badge: { status: site.status, text: siteStatusBadgeText(site.status) },
      metrics: [
        { label: "类型", value: site.kind === "station" ? "站场" : "阀室" },
        { label: "管道", value: site.pipelineId },
        { label: "坐标来源", value: site.coordSource === "approx" ? "示意" : "实测" },
      ],
      conclusion: conclusion,
      tags: [site.districtName, Contract.ZONE_NAMES[site.zoneId]],
      actions: [],
    });
  }

  function renderDrillSection(state) {
    if (state.zoneId == null) {
      return h("div", { class: "ov-drill-section" }, [renderProvinceHint()]);
    }
    var sites = Sites.sitesByZone(state.zoneId).slice().sort(function (a, b) {
      if (a.status === b.status) return a.name < b.name ? -1 : 1;
      var rank = { danger: 0, warn: 1, ok: 2 };
      return rank[a.status] - rank[b.status];
    });
    if (sites.length === 0) {
      return h("div", { class: "ov-drill-section" }, [
        window.DetailCard.render({
          kicker: "站点清单 · " + Contract.ZONE_NAMES[state.zoneId],
          title: "该作业区在成品油管网里没有节点",
          badge: { status: "ok", text: "无覆盖" },
          metrics: [
            { label: "站点数", value: 0, unit: "个" },
            { label: "管道数", value: 0, unit: "条" },
          ],
          conclusion: Contract.ZONE_NAMES[state.zoneId] + " 只承载天然气管道站场，不在成品油泵站范围内。",
          tags: ["成品油范围外"],
          actions: [],
        }),
      ]);
    }
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
    var range = activeDateRange(state);
    return h("div", { class: "ov-right-col" }, [
      window.Cards.chart({ title: "作业区状态分布 · " + range.shortLabel, chartId: "chart-zone-status-mix" }),
      window.Cards.chart({ title: "各段日输量 · " + range.shortLabel + "均值", chartId: "chart-throughput" }),
      window.Cards.chart({ title: "泵站健康排名 · " + range.shortLabel, chartId: "chart-pump-health" }),
      renderDrillSection(state),
    ]);
  }

  // ---------------------------------------------------------------------
  // 图表绘制（boot.js 在 DOM append 之后调用，接上 mountChartSlots 留好的容器）
  // ---------------------------------------------------------------------

  function renderCharts() {
    window.Charts.draw("chart-site-kind-mix", window.ChartOptions.siteKindMix());
    window.Charts.draw("chart-pressure-profile", window.ChartOptions.pipelineProfile());
    window.Charts.draw("chart-zone-status-mix", window.ChartOptions.zoneStatusMix());
    window.Charts.draw("chart-throughput", window.ChartOptions.throughputRows());
    window.Charts.draw("chart-pump-health", window.ChartOptions.pumpHealthRank());
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
