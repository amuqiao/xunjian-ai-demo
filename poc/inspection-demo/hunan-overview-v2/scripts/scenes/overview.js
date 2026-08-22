// 唯一场景：window.OverviewScene（L6 场景层，早于 boot.js，晚于 core/* 与 ui/*）。
//
// 【POC：hunan-overview-v2】旧目录 scripts/scenes/overview.js（553 行）的布局与文案
// 重排版。数据层、3D 层、契约层全部复用旧目录原文件，一行未改；变的只有「屏上摆什么、
// 摆在哪、写多少字」。
//
// ── 回字形：内容从四边围住地图 ────────────────────────────────────────────
//   上  .ov-stat-band   全省 4 个大数                    —— 全省，**下钻时不变**
//   左  .ov-left-col    完成度环 / 异常构成 / 台账构成    —— 全省，**下钻时不变**
//   中  .ov-map-panel   地图（无面板边框）                —— 跟随焦点
//   右  .ov-right-col   需关注站点清单（整格一块）        —— 跟随焦点
//   下  .ov-zone-band   6 个作业区卡                      —— 分区总览 + 第二个下钻入口
//
// 上/左恒为全省是刻意的：点开岳阳时全省基准仍然在屏上，观众可以直接对读
// 「全省 13 个需关注 / 岳阳 5 个」、「全省 95% / 岳阳卡上的 94.4%」。旧版三栏是整块
// 换掉全省数据，这层对比关系丢了。所以跟随焦点变化的只有三处：地图相机、右栏清单、
// 作业区带的高亮。
//
// 【左栏为什么是 3 块、右栏为什么是 1 块】第一版是左 2 块 / 右 2 块，实测左栏 911px
// 高分给两张图，完成度环被拉成一个直径 370px、描边只有 16px 的细圈，4 根异常柱之间
// 空出 130px。把台账构成从右栏挪到左栏、三块各按内容定高（300 / 260 / 剩余）之后每块
// 都填满了；右栏整格 911px 给需关注清单，省域态 13 行正好，列也从 3 列加到 4 列（宽度
// 用得上）。行高/列宽推导与「地图会缩到 84%」的机制见 styles/06-overview-scene.css。
//
// ── 每个数只出现一次 ──────────────────────────────────────────────────────
// 旧的「巡检质量保障」卡里有 9 个数字块（focus 3 + grid 6），每块还带一行小字，背后
// 只有 quality.js 的 8 个字段。现在的分配：
//   站点总数 / zoneTotal / issues / currentRisk      → 上带 4 个大数
//   completionRate / completed / planned            → 左① 完成度环
//   duration / interval / offWindow / aiAlerts       → 左② 异常构成
//   kind / medium 分布                               → 左③ 台账构成
//   逐站 status                                      → 右 需关注清单
//   分区 needAttention / 分区 completionRate         → 下带 6 张卡
// riskLevel 与 p1Issues 屏上不出现（前者是后三个字段派生的等级标签，后者与
// currentRisk 只差一个时态，同屏放两个会被当成两件事）。数据层保留这两个字段不动。
//
// ── 删掉的内容 ────────────────────────────────────────────────────────────
// 1) 右下角 DetailCard（旧 renderProvinceHint / renderSiteDetail）：省域态正文是
//    「点击左侧作业区排名或地图上的作业区标签，下钻查看该区站点清单与详情。」加两个
//    tag「两级钻取」「省域 → 作业区」——写给开发看的操作说明；作业区态是「类型/介质/
//    类别」三行 + 一句「XX站 使用作业区级示意坐标，仅用于首页区域态势。」——路演里
//    念出这句等于自己扣分。scripts/ui/detailcard.js 不再加载。
// 2) 「动态趋势 · 近N日巡检完成率」折线图：完成率已由完成度环的环心承载。
// 3) 「作业区巡检覆盖率」横向柱：被下带的 6 张作业区卡取代，卡片还能点。
// 4) 底栏 + 面包屑：位置由浮在地图左上角的 .ov-map-place 表达，返回全省沿用地图
//    右下角 .ov-zoom 里已有的 ‹ 按钮。
// 5) 顶栏英文 kicker、左侧 brand 的两行文字、两侧 .topbar-wing 装饰翼：标题只在
//    顶栏中间出现一次（详见 styles/02-shell.css 文件头第 2 条）。
// 6) Cards.metric 的全部 note、质量卡 6 条阈值 note（「<10min」「<10s」「偏移30min」
//    「时序/轨迹」——挪进 chartopts 的 tooltip）。
//
// ── 下钻态第 4 块只列「需关注站点」 ────────────────────────────────────────
// 不列全部站点。理由与实测数字见 renderAlertCard 上方的注释。
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
  var CHART_LEDGER = "chart-ledger";

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
  // 顶栏：三列（左 湘标记+时钟 / 中 居中标题 / 右 统计口径），高度 62px。
  // 两侧列都是 1fr，中间那列才真的落在画布水平中点上。
  // DOM 契约见 styles/02-shell.css 文件头。
  // =====================================================================

  function renderTopbar(state) {
    var now = new Date();
    var weekday = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][now.getDay()];
    return h("header", { class: "topbar panel" }, [
      h("div", { class: "topbar-left" }, [
        h("span", { class: "brand-mark", "aria-hidden": "true", text: "湘" }),
        h("div", { class: "topbar-clock" }, [
          h("strong", { class: "num", text: pad2(now.getHours()) + ":" + pad2(now.getMinutes()) + ":" + pad2(now.getSeconds()) }),
          h("small", { class: "num", text: formatDate(now) + " " + weekday }),
        ]),
      ]),
      h("div", { class: "topbar-title" }, [
        h("h1", { text: "湖南省油气管网巡检总览" }),
        h("div", { class: "topbar-title-rule", "aria-hidden": "true" }),
      ]),
      h("div", { class: "topbar-right" }, [
        renderDateRangePicker(state, now),
      ]),
    ]);
  }

  // =====================================================================
  // 上边：全省指标带（4 个 Cards.metric，一律不传 note）。**不随下钻变化**。
  //
  // 四个数的选择：站点总数 = 盘子多大（给旁边地图一个量级参照）、作业区 = 分几块管、
  // 发现问题 = 问题总量、当前 P1 = 最紧急。四者互不重复，也不与四张图里的任何数字
  // 重复。完成率不在这里——它只在左栏的环心里。
  // =====================================================================

  function issuesStatus(q) {
    if (q.issues === 0) return "ok";
    return q.p1Issues > 0 ? "danger" : "warn";
  }

  function renderStatBand() {
    var sp = Series.provinceSummary();
    var q = Quality.province();
    return h("section", { class: "panel ov-stat-band" }, [
      window.Cards.metric({ label: "站点总数", value: sp.stationTotal + sp.valveTotal, unit: "个", status: "ok" }),
      window.Cards.metric({ label: "作业区", value: sp.zoneTotal, unit: "个", status: "ok" }),
      window.Cards.metric({ label: "发现问题", value: q.issues, unit: "项", status: issuesStatus(q) }),
      window.Cards.metric({ label: "当前 P1", value: q.currentRisk, unit: "项", status: q.currentRisk > 0 ? "danger" : "ok" }),
    ]);
  }

  // =====================================================================
  // 左边：全省两张图，等分中段高度。**不随下钻变化**。
  //
  // 第 1 块 meta 放统计口径短标签（近7日 / 本月 / 4/24-4/30 …）——顶栏的日期范围
  // 按钮改的就是这个标签。quality.js 是一份静态快照，各字段不随日期范围变化，所以
  // 这个控件的真实作用范围就是「给屏上的数标注统计口径」，不假装数据会跟着变。
  // =====================================================================

  function renderLeftColumn(state) {
    assertLoaded();
    var range = activeDateRange(state);
    var sp = Series.provinceSummary();
    return h("section", { class: "panel ov-left-col" }, [
      window.Cards.chart({ title: "巡检完成度", meta: range.shortLabel, chartId: CHART_COMPLETION }),
      window.Cards.chart({ title: "质量异常构成", chartId: CHART_EXCEPTION }),
      window.Cards.chart({ title: "台账构成", meta: sp.stationTotal + sp.valveTotal + " 个", chartId: CHART_LEDGER }),
    ]);
  }

  // =====================================================================
  // 右边：整格一块「需关注站点」清单，跟随焦点。省域态 = 全省 13 行，下钻态 = 该作业区。
  // 这是屏上唯一跟着下钻换内容的面板（另外两处变化是地图相机和作业区带的高亮）。
  //
  // 只列**需关注**的站点（danger + warn），不列全部。
  // 第一版列了全部站点，岳阳作业区是 36 行，而那 36 行里「类型」列全是「阀室」、
  // 「所在市」列全是「岳阳市」——两整列 72 个格子写着同一个词，正是要治的那种「占位
  // 多、字多、信息少」。只列异常与关注之后，实测省域态 13 行、各作业区 1 到 5 行
  // （岳阳 5 / 长沙 1 / 衡阳 2 / 永郴 2 / 湘娄 1 / 株洲 2）。总数没有丢，在卡头 meta 里。
  //
  // 两种状态的列不同，因为「哪一列每行都不一样」不同：
  //   省域态：作业区 / 站点 / 介质 / 状态   —— 13 行跨 6 个区，作业区列是最有用的那一列
  //   下钻态：站点 / 类型 / 介质 / 状态     —— 同一个区内作业区列恒为同值，换成类型
  // 「所在市」两种状态都不列：6 个作业区里有 4 个只覆盖 1 个市，那一列在这些区里恒为
  // 同一个值——第一版就是踩在这上面（岳阳 36 行里「所在市」整列写着「岳阳市」）。
  // =====================================================================

  var PROVINCE_ALERT_COLUMNS = [
    { key: "zone", label: "作业区", width: 22 },
    { key: "name", label: "站点", width: 36 },
    { key: "medium", label: "介质", width: 22 },
    { key: "status", label: "状态", width: 20 },
  ];
  var ZONE_ALERT_COLUMNS = [
    { key: "name", label: "站点", width: 38 },
    { key: "kind", label: "类型", width: 20 },
    { key: "medium", label: "介质", width: 22 },
    { key: "status", label: "状态", width: 20 },
  ];

  function sortByStatus(a, b) {
    if (a.status !== b.status) return STATUS_RANK[a.status] - STATUS_RANK[b.status];
    return a.name < b.name ? -1 : 1;
  }

  function alertSites(zoneId) {
    if (zoneId != null) {
      return Sites.sitesByZone(zoneId).filter(function (s) { return s.status !== "ok"; }).sort(sortByStatus);
    }
    // 省域态：按作业区顺序取全省的非正常站点，再整体按状态排——先按 ZONE_IDS 收集
    // 是为了让同一个区的站点在同状态内挨着（sortByStatus 的次级键是站点名，不是区）。
    var all = [];
    Contract.ZONE_IDS.forEach(function (zoneKey) {
      Sites.sitesByZone(zoneKey).forEach(function (site) {
        if (site.status !== "ok") all.push(site);
      });
    });
    return all.sort(sortByStatus);
  }

  function alertCellText(columnKey, site) {
    if (columnKey === "zone") return Contract.ZONE_NAMES[site.zoneId].replace("作业区", "");
    if (columnKey === "name") return site.name;
    if (columnKey === "kind") return site.kind === "station" ? "站场" : "阀室";
    if (columnKey === "medium") return site.medium;
    throw new Error("[OverviewScene] 未知的清单列：" + columnKey);
  }

  function renderAlertTable(columns, sites) {
    var total = columns.reduce(function (sum, col) { return sum + col.width; }, 0);
    return h("table", { class: "ov-table" }, [
      h("colgroup", {}, columns.map(function (col) {
        return h("col", { style: "width:" + (col.width / total * 100) + "%" });
      })),
      h("thead", {}, [
        h("tr", {}, columns.map(function (col) {
          return h("th", { scope: "col", class: "ov-table-th", text: col.label });
        })),
      ]),
      h("tbody", {}, sites.map(function (site) {
        return h("tr", {}, columns.map(function (col) {
          // 状态列用文字而不是色点：这一列本身就是「异常/关注」两个词，不依赖颜色也能读。
          if (col.key === "status") {
            return h("td", { class: "ov-table-td" }, [
              h("span", { class: "ov-table-status " + site.status, text: STATUS_LABEL[site.status] }),
            ]);
          }
          return h("td", { class: "ov-table-td", text: alertCellText(col.key, site) });
        }));
      })),
    ]);
  }

  function renderAlertCard(state) {
    var drilled = state.zoneId != null;
    var siteTotal = drilled ? Sites.sitesByZone(state.zoneId).length : Sites.sites().length;
    var alerts = alertSites(state.zoneId);
    var columns = drilled ? ZONE_ALERT_COLUMNS : PROVINCE_ALERT_COLUMNS;
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
          ? renderAlertTable(columns, alerts)
          : h("p", { class: "ov-list-empty", text: siteTotal + " 个站点全部正常" }),
      ]),
    ]);
  }

  function renderRightColumn(state) {
    assertLoaded();
    return h("section", { class: "panel ov-right-col" }, [
      renderAlertCard(state),
    ]);
  }

  // =====================================================================
  // 下边：6 个作业区卡。分区总览 + 地图标签之外的第二个下钻入口。
  //
  // ⚠️ 卡片不能用 [data-hunan-zone]：scripts/map3d/contract.js 的
  // assertPinNamespace() 会遍历全文档的 [data-hunan-zone]/[data-hunan-site]，任何一个
  // 落在 .hunan-labels 之外就直接抛错（那两个属性归 3D 标签独占）。所以用
  // data-action="select-zone" + data-zone-id。
  //
  // 卡上的状态色取自 Sites.zoneStatuses()，与地图标签同源——同一个作业区在地图上
  // 和在这条带上必须是同一个颜色，否则会出现「地图上红了、下面卡还是绿的」。
  // =====================================================================

  function renderZoneBand(state) {
    var zoneStatuses = Sites.zoneStatuses();
    var mix = Series.zoneStatusMix();
    return h("section", { class: "panel ov-zone-band", "aria-label": "作业区总览" }, mix.map(function (row) {
      var status = zoneStatuses[row.zoneId];
      var needAttention = row.warn + row.danger;
      var q = Quality.byZone(row.zoneId);
      var active = state.zoneId === row.zoneId;
      return h("button", {
        type: "button",
        class: "ov-zone-card " + status + (active ? " is-active" : ""),
        "data-action": "select-zone",
        "data-zone-id": row.zoneId,
        "aria-pressed": active ? "true" : "false",
        title: Contract.ZONE_NAMES[row.zoneId] + " · " + STATUS_LABEL[status],
      }, [
        h("div", { class: "ov-zone-card-head" }, [
          h("span", { class: "ov-zone-card-name", text: row.name.replace("作业区", "") }),
          h("span", { class: "dot " + status, "aria-hidden": "true" }),
        ]),
        h("div", { class: "ov-zone-card-alert" }, [
          h("strong", { class: "num", text: String(needAttention) }),
          h("span", { text: "需关注" }),
        ]),
        h("div", { class: "ov-zone-card-rate num", text: "完成率 " + q.completionRate + "%" }),
      ]);
    }));
  }

  // =====================================================================
  // 中间：3D 地图。**没有面板边框**（见 styles/06-overview-scene.css 第五节）。
  //
  // 相对旧场景的两处减法：
  //   - 不渲染 .ov-map-head（那一行是 p.kicker「区域质量热区 · 省域总览」+ h3 + 图例）。
  //     位置改成浮在地图左上角的 .ov-map-place，图例浮到左下角（右下角被 .ov-zoom 占了）。
  //   - kicker 整句删除。
  // 作业区标签仍是地图上的下钻入口：button[data-hunan-zone]，原生可聚焦、可回车。
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

    var placeSub = state.zoneId == null
      ? Sites.sites().length + " 个站场 / 阀室"
      : Sites.sitesByZone(state.zoneId).length + " 个站场 / 阀室";

    return h("section", { class: "ov-map-panel" }, [
      h("div", { class: "hunan-map", "data-hunan-host": "1" }, [
        h("div", { class: "ov-map-place" }, [
          h("h3", { text: state.zoneId == null ? "湖南省全域" : Contract.ZONE_NAMES[state.zoneId] }),
          h("small", { text: placeSub }),
        ]),
        h("div", { class: "hunan-labels" }, zoneLabels),
        h("div", { class: "ov-legend" }, [
          h("span", { class: "ov-legend-item" }, [h("i", { class: "dot ok" }), "正常"]),
          h("span", { class: "ov-legend-item" }, [h("i", { class: "dot warn" }), "关注"]),
          h("span", { class: "ov-legend-item" }, [h("i", { class: "dot danger" }), "异常"]),
        ]),
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
  // 三张图都在左栏、都是全省口径、每一轮都画，没有状态分支。Charts.draw 对没有先
  // slot 的 id 会直接抛错，所以「渲染了哪几张」必须和「draw 了哪几张」严格相等；
  // 这里恒等于 3，不随 zoneId 变化。
  // =====================================================================

  function renderCharts() {
    window.Charts.draw(CHART_COMPLETION, window.ChartOptions.completionGauge());
    window.Charts.draw(CHART_EXCEPTION, window.ChartOptions.qualityExceptionMix());
    window.Charts.draw(CHART_LEDGER, window.ChartOptions.ledgerMix());
  }

  window.OverviewScene = {
    renderTopbar: renderTopbar,
    renderStatBand: renderStatBand,
    renderLeftColumn: renderLeftColumn,
    renderMapPanel: renderMapPanel,
    renderRightColumn: renderRightColumn,
    renderZoneBand: renderZoneBand,
    renderCharts: renderCharts,
    isDateRangeId: isDateRangeId,
    isCustomDateRangeId: isCustomDateRangeId,
  };
})();
