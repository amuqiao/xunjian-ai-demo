// 唯一场景：window.OverviewScene（L6 场景层，早于 boot.js，晚于 core/* 与 ui/*）。
//
// 【POC：hunan-overview-v2】本文件是旧目录 scripts/scenes/overview.js（553 行）的
// 重写。数据层、3D 层、契约层全部复用旧目录原文件，一行未改；变的只有「屏上摆什么、
// 摆在哪、写多少字」。
//
// ── 一屏容器数：8 → 2 ────────────────────────────────────────────────────────
// 旧场景是顶栏 + 左栏(4 块) + 地图 + 右栏(2 块) + 底栏。现在是顶栏 + 左栏(4 块) +
// 地图，其中顶层容器只有左栏和地图两个（顶栏不算内容容器）。右栏与底栏整块删除。
//
// ── 删掉的三块内容 ──────────────────────────────────────────────────────────
// 1) 右下角 DetailCard（旧 renderProvinceHint / renderSiteDetail）。省域态它的正文是
//    「点击左侧作业区排名或地图上的作业区标签，下钻查看该区站点清单与详情。」外加两个
//    tag「两级钻取」「省域 → 作业区」——写给开发看的操作说明。作业区态是「类型/介质/
//    类别」三行 + 一句「XX站 使用作业区级示意坐标，仅用于首页区域态势。」——路演里念
//    出这句等于自己扣分。整卡删除，scripts/ui/detailcard.js 不再加载。
// 2) 「动态趋势 · 近N日巡检完成率」折线图。完成率已由 completionGauge() 的环心承载。
// 3) 「作业区巡检覆盖率」横向柱。被 zoneStatusMix() 取代——同样按作业区横排，但每根
//    柱拆成正常/关注/异常三段，比单一覆盖率比值信息量大。
//
// ── 「巡检质量保障」卡怎么拆 ─────────────────────────────────────────────────
// 旧的这张卡里有 9 个数字块（focus 3 个 + grid 6 个），每个还带一行 em/note 小字。
// 背后其实只有 quality.js 的 8 个字段。拆成三张图 + 一行大数，规则是**每个数只出现
// 一次**：
//   completionRate / completed / planned   → 只在 completionGauge 的环里
//   duration / interval / offWindow / aiAlerts → 只在 qualityExceptionMix 的四根柱里
//   issues / currentRisk                   → 只在左栏第一行的大数指标里
// riskLevel 与 p1Issues 屏上不出现：riskLevel 是 currentRisk/issues/aiAlerts 派生出的
// 等级标签，屏上已经有它的三个输入；p1Issues 是「累计问题中的 P1」，与「当前仍是 P1」
// （currentRisk）只差一个时态，同屏放两个会被当成两件事。数据层保留这两个字段不动。
//
// ── 文案 ────────────────────────────────────────────────────────────────────
// 删：顶栏英文 kicker「HUNAN OIL & GAS NETWORK OVERVIEW」、顶栏居中大标题「湖南省
// 油气管网巡检总览」（左侧 brand 已写「湖南省油气管网大屏 / 巡检站总览」，是同一句话
// 的第二遍）、两侧 .topbar-wing 装饰翼、地图头 kicker「区域质量热区 · 省域总览」、
// 排名卡标题的「· 点击下钻」、Cards.metric 的全部 note、质量卡 6 条阈值 note
// （「<10min」「<10s」「偏移30min」「时序/轨迹」——挪进 chartopts 的 tooltip）。
//
// ── 下钻态第 4 块只列「需关注站点」 ─────────────────────────────────────────
// 不列全部站点。理由与实测数字见 renderZoneBlock 上方的注释。
//
// 本文件只渲染 DOM，不 addEventListener：交互点天然带 data-action /
// data-hunan-zone，由 boot.js 的 bindStage() 统一做事件委托。
(function () {
  "use strict";

  var Contract = window.HunanContract;
  var Sites = window.HunanSites;
  var Series = window.HunanSeries;
  var Quality = window.HunanInspectionQuality;

  var STATUS_LABEL = { ok: "正常", warn: "关注", danger: "异常" };
  var STATUS_RANK = { danger: 0, warn: 1, ok: 2 };

  // 图表 id：与 renderCharts() 里 Charts.draw() 的第一个参数一一对应。
  // Charts.draw 对未先 slot 的 id 直接抛错，所以「这一轮渲染了哪几张图」必须和
  // 「这一轮 draw 了哪几张图」严格相等——见 renderCharts() 里的状态分支。
  var CHART_COMPLETION = "chart-completion";
  var CHART_EXCEPTION = "chart-exception";
  var CHART_ZONE_STATUS = "chart-zone-status";

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
    if (!window.Cards) throw new Error("[OverviewScene] window.Cards 未加载");
  }

  // =====================================================================
  // 日期范围（从旧目录原样搬来，只删掉 parseDateOnly / dateRangePointCount —— 那两个
  // 函数唯一的用途是给已删除的趋势折线图算点数）
  // =====================================================================

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

  function renderDateRangePicker(state, now) {
    var active = activeDateRange(state);
    var isCustomOpen = !!(state && state.customRangeOpen);
    return h("div", { class: "date-range-picker", "aria-label": "统计口径" }, [
      h("span", { class: "date-range-label num", text: dateRangeText(active, now) }),
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

  // =====================================================================
  // 顶栏：两列（左 brand / 右 统计口径 + 时钟），高度 56px。
  // DOM 契约见 styles/02-shell.css 文件头。
  // =====================================================================

  function renderTopbar(state) {
    var now = new Date();
    var weekday = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][now.getDay()];
    return h("header", { class: "topbar panel" }, [
      h("div", { class: "topbar-left" }, [
        h("div", { class: "brand" }, [
          h("span", { class: "brand-mark", "aria-hidden": "true", text: "湘" }),
          h("div", {}, [
            h("h1", { text: "湖南省油气管网大屏" }),
            h("small", { text: "巡检站总览" }),
          ]),
        ]),
      ]),
      h("div", { class: "topbar-right" }, [
        renderDateRangePicker(state, now),
        h("div", { class: "topbar-clock" }, [
          h("strong", { class: "num", text: pad2(now.getHours()) + ":" + pad2(now.getMinutes()) + ":" + pad2(now.getSeconds()) }),
          h("small", { class: "num", text: formatDate(now) + " " + weekday }),
        ]),
      ]),
    ]);
  }

  // =====================================================================
  // 左栏第 1 块：三个大数指标（Cards.metric ×3，一律不传 note）
  //
  // 三个数的选择理由：站点总数 = 规模锚点（让旁边地图上的柱子有量级参照）、
  // 发现问题 = 问题总量、当前 P1 = 最紧急。三者互不重复，也不与三张图里的任何
  // 数字重复。
  // =====================================================================

  function issuesStatus(q) {
    if (q.issues === 0) return "ok";
    return q.p1Issues > 0 ? "danger" : "warn";
  }

  function renderStatRow(state) {
    var q = Quality.current(state.zoneId);
    var siteTotal;
    if (state.zoneId == null) {
      var sp = Series.provinceSummary();
      siteTotal = sp.stationTotal + sp.valveTotal;
    } else {
      siteTotal = Sites.sitesByZone(state.zoneId).length;
    }

    return h("div", { class: "ov-stat-row" }, [
      window.Cards.metric({ label: "站点总数", value: siteTotal, unit: "个", status: "ok" }),
      window.Cards.metric({ label: "发现问题", value: q.issues, unit: "项", status: issuesStatus(q) }),
      window.Cards.metric({ label: "当前 P1", value: q.currentRisk, unit: "项", status: q.currentRisk > 0 ? "danger" : "ok" }),
    ]);
  }

  // =====================================================================
  // 左栏第 2、3 块：两张图（完成度环 / 异常构成柱）
  //
  // 第 2 块的 meta 放统计口径短标签（近7日 / 本月 / 4-24至4-30 …）——顶栏的日期范围
  // 按钮改的就是这个标签。quality.js 是一份静态快照，各字段不随日期范围变化，所以
  // 这个控件的真实作用范围就是「给屏上的数标注统计口径」，不假装数据会跟着变。
  // =====================================================================

  function renderCompletionCard(state) {
    var range = activeDateRange(state);
    return window.Cards.chart({
      title: "巡检完成度",
      meta: range.shortLabel,
      chartId: CHART_COMPLETION,
    });
  }

  function renderExceptionCard() {
    return window.Cards.chart({
      title: "质量异常构成",
      chartId: CHART_EXCEPTION,
    });
  }

  // =====================================================================
  // 左栏第 4 块：省域态是「作业区质量分布」堆叠柱，下钻态是该区站点只读清单。
  // 两种状态都恰好 1 个容器、外观是同一张卡（见 06-overview-scene.css 的
  // .ov-list-card 注释），切换时布局不跳。
  // =====================================================================

  // 只列**需关注**的站点（danger + warn），不列全部。
  //
  // 第一版列了全部站点，实测岳阳作业区是 36 行，而那 36 行里「类型」列全是「阀室」、
  // 「所在市」列全是「岳阳市」——两整列 72 个格子写着同一个词，正是要治的那种「占位
  // 多、字多、信息少」。改成只列异常与关注的站点后，实测各作业区是 1 到 5 行
  // （岳阳 5 / 长沙 1 / 衡阳 2 / 永郴 2 / 湘娄 1 / 株洲 2），一屏扫完，而且列出来的
  // 正是路演时唯一值得指着讲的那几个。总数没有丢，在卡头的 meta 里。
  //
  // 三列：站点 / 介质 / 状态。「所在市」不列——6 个作业区里有 4 个只覆盖 1 个市，
  // 那一列在这些区里恒为同一个值。「介质」（天然气/成品油）在每个作业区内部都真的有
  // 分布，是这三列里唯一每行都可能不同的业务字段。
  var ALERT_COLUMNS = [
    { key: "name", label: "站点", width: 46 },
    { key: "medium", label: "介质", width: 28 },
    { key: "status", label: "状态", width: 26 },
  ];

  function alertSites(zoneId) {
    return Sites.sitesByZone(zoneId).slice()
      .filter(function (site) { return site.status !== "ok"; })
      .sort(function (a, b) {
        if (a.status !== b.status) return STATUS_RANK[a.status] - STATUS_RANK[b.status];
        return a.name < b.name ? -1 : 1;
      });
  }

  function renderAlertTable(sites) {
    var total = ALERT_COLUMNS.reduce(function (sum, col) { return sum + col.width; }, 0);
    return h("table", { class: "ov-table" }, [
      h("colgroup", {}, ALERT_COLUMNS.map(function (col) {
        return h("col", { style: "width:" + (col.width / total * 100) + "%" });
      })),
      h("thead", {}, [
        h("tr", {}, ALERT_COLUMNS.map(function (col) {
          return h("th", { scope: "col", class: "ov-table-th", text: col.label });
        })),
      ]),
      h("tbody", {}, sites.map(function (site) {
        return h("tr", {}, [
          h("td", { class: "ov-table-td", text: site.name }),
          h("td", { class: "ov-table-td", text: site.medium }),
          // 状态用文字而不是色点：这一列本身就是「异常/关注」两个词，不依赖颜色也能读。
          h("td", { class: "ov-table-td" }, [
            h("span", { class: "ov-table-status " + site.status, text: STATUS_LABEL[site.status] }),
          ]),
        ]);
      })),
    ]);
  }

  function renderZoneBlock(state) {
    if (state.zoneId == null) {
      return window.Cards.chart({
        title: "作业区需关注站点",
        chartId: CHART_ZONE_STATUS,
      });
    }
    var siteTotal = Sites.sitesByZone(state.zoneId).length;
    var alerts = alertSites(state.zoneId);
    return h("section", { class: "ov-list-card" }, [
      h("div", { class: "ov-list-card-head" }, [
        h("span", { class: "ov-list-card-title", text: "需关注站点" }),
        h("span", { class: "ov-list-card-meta", text: alerts.length + " / " + siteTotal + " 站点" }),
      ]),
      h("div", { class: "ov-list-card-body" }, [
        // 「全部正常」不是兜底，是一个真实且可达的状态：数据层没有任何约束保证每个
        // 作业区都至少有一个异常站点（当前 6 个区恰好都有，1 到 5 个不等）。整改完
        // 一个区之后它就会走到这一支，那时候屏上该说的是「全部正常」，不是一张空表。
        alerts.length
          ? renderAlertTable(alerts)
          : h("p", { class: "ov-list-empty", text: siteTotal + " 个站点全部正常" }),
      ]),
    ]);
  }

  function renderLeftColumn(state) {
    assertLoaded();
    // .is-drilled 只改第 4 行的行高（1fr -> auto），见 06-overview-scene.css 的注释。
    var drilled = state.zoneId != null;
    return h("section", { class: "panel ov-left-col" + (drilled ? " is-drilled" : "") }, [
      renderStatRow(state),
      renderCompletionCard(state),
      renderExceptionCard(),
      renderZoneBlock(state),
    ]);
  }

  // =====================================================================
  // 中间：3D 地图面板。内部 DOM 是 styles/05-hunan3d.css 的冻结契约（复用旧目录
  // 原文件），本函数产出的结构与旧场景逐字相同，只有两处减法：
  //   - 删掉 head 里的 p.kicker「区域质量热区 · 省域总览」，h3 直接做 flex 子节点
  //   - h3 现在是屏上唯一的位置指示（旧的底栏面包屑已删）
  // 作业区标签是本屏唯一的下钻入口：button[data-hunan-zone]，原生可聚焦、可回车。
  // =====================================================================

  function renderMapPanel(state) {
    var zoneStatuses = Sites.zoneStatuses();
    // 标签 LOD：省域态显示全部 6 个作业区标签；**下钻态只显示当前作业区那一个**。
    //
    // 为什么必须过滤而不是全渲染：engine.js 的 syncLabels 末尾会把每个标签
    // clamp 进视口，所以画外的作业区标签不会消失，而是被**钉在屏幕四边**。下钻到
    // 岳阳时其他作业区全在画外，结果是四条边贴满与当前视图无关的标签。
    // 契约的 assertLabelKeys 对此是放行的——它在 zone/site 级只要求「键合法不重复」、
    // 不要求全集，正是为了让这层过滤成立。
    var visibleZoneIds = state.zoneId == null ? Contract.ZONE_IDS : [state.zoneId];
    var zoneLabels = visibleZoneIds.map(function (zoneId) {
      var progress = Sites.zoneProgress(zoneId);
      return h("button", {
        type: "button",
        class: "" + zoneStatuses[zoneId],
        "data-hunan-zone": zoneId,
        title: Contract.ZONE_NAMES[zoneId] + " · " + STATUS_LABEL[zoneStatuses[zoneId]],
      }, [
        h("span", { class: "zone-pin-name", text: Contract.ZONE_NAMES[zoneId].replace("作业区", "") }),
        h("span", { class: "zone-pin-count num", text: progress.total + " 站" }),
      ]);
    });

    return h("section", { class: "panel ov-map-panel" }, [
      h("div", { class: "ov-map-head" }, [
        h("h3", { text: state.zoneId == null ? "湖南省全域" : Contract.ZONE_NAMES[state.zoneId] }),
        h("div", { class: "ov-legend" }, [
          h("span", { class: "ov-legend-item" }, [h("i", { class: "dot ok" }), "正常"]),
          h("span", { class: "ov-legend-item" }, [h("i", { class: "dot warn" }), "关注"]),
          h("span", { class: "ov-legend-item" }, [h("i", { class: "dot danger" }), "异常"]),
        ]),
      ]),
      h("div", { class: "hunan-map", "data-hunan-host": "1" }, [
        h("div", { class: "hunan-labels" }, zoneLabels),
        // 视口操作**唯一**的一组：返回 / 放大 / 缩小 / 重置视角。全部带 title。
        // 「返回全省」只在下钻态出现（省域态没有上一层可返回，不渲染、也不做 disabled
        // 占位），所以这一组在两种状态下分别是 3 个和 4 个按钮。
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

  // =====================================================================
  // 图表绘制（boot.js 在 DOM append + mountChartSlots 之后调用）
  //
  // 必须与 renderZoneBlock() 的状态分支严格对应：Charts.draw 对没有先 slot 的 id
  // 直接抛错，所以下钻态**不能**再 draw CHART_ZONE_STATUS（那一格已经换成站点表）。
  // =====================================================================

  function renderCharts(state) {
    window.Charts.draw(CHART_COMPLETION, window.ChartOptions.completionGauge(state.zoneId));
    window.Charts.draw(CHART_EXCEPTION, window.ChartOptions.qualityExceptionMix(state.zoneId));
    if (state.zoneId == null) {
      window.Charts.draw(CHART_ZONE_STATUS, window.ChartOptions.zoneStatusMix());
    }
  }

  window.OverviewScene = {
    renderTopbar: renderTopbar,
    renderLeftColumn: renderLeftColumn,
    renderMapPanel: renderMapPanel,
    renderCharts: renderCharts,
    isDateRangeId: isDateRangeId,
    isCustomDateRangeId: isCustomDateRangeId,
  };
})();
