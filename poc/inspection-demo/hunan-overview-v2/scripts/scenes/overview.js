// 唯一场景：window.OverviewScene（L6 场景层，早于 boot.js，晚于 core/* 与 ui/*）。
//
// 【POC：hunan-overview-v2】旧目录 scripts/scenes/overview.js（553 行）的布局与文案
// 重排版。数据层、3D 层、契约层全部复用旧目录原文件，一行未改；变的只有「屏上摆什么、
// 摆在哪、写多少字」。
//
// ── 回字形：内容从四边围住地图 ────────────────────────────────────────────
//   上  .ov-stat-band   全省 5 个大数（每个带一行 note）  —— 全省，**下钻时不变**
//   左  .ov-left-col    计划执行 / 行为异常构成 / 完成率趋势 —— 全省，**下钻时不变**
//   中  .ov-map-panel   地图（无面板边框）                —— 跟随焦点
//   右  .ov-right-col   上：按管线（全省）/ 下：需关注清单 —— 只有下半跟随焦点
//   下  .ov-zone-band   6 个作业区卡                      —— 分区总览 + 第二个下钻入口
//
// 上/左恒为全省是刻意的：点开岳阳时全省基准仍然在屏上，观众可以直接对读
// 「全省 13 个需关注 / 岳阳 5 个」、「全省 95.0% / 岳阳卡上的 94.4%」。旧版三栏是整块
// 换掉全省数据，这层对比关系丢了。所以跟随焦点变化的只有三处：地图相机、右栏下半的
// 清单、作业区带的高亮。右栏上半那张「按管线」也不跟焦点 —— 下钻后只剩一个区，
// 跨作业区的管线分布就没意义了。
//
// 【左栏 3 块 / 右栏 2 块的由来】左栏第一版是 2 块等分，实测完成度环被拉成直径 370px、
// 描边 16px 的细圈；三块之后每块都填满（300 / 弹性 / 230）。右栏原先整格 949px 只放
// 13 行清单，表底下空掉约 250px —— 现在拆成 330px 的「按管线」+ 剩余给清单。
// 行高/列宽推导见 styles/06-overview-scene.css。
//
// ── 五个大数与四张图的分工（每个数只出现一次）─────────────────────────────
//   currentRisk + p1Issues                → 上带① 当前风险
//   completionRate + completed + planned  → 上带② 计划完成率（分母画在左① 的条上）
//   issues + currentRisk                  → 上带③ 问题处置完成率（业务方原词）
//   issues + p1Issues + 需关注站点数       → 上带④ 发现问题
//   aiAlerts + 逐区分布                    → 上带⑤ AI 提醒
//   planned / completed / 有效项           → 左① 计划执行三横条（合规率在卡头 meta）
//   duration / interval / offWindow        → 左② 行为异常环形图
//   completionRate 逐日回溯                → 左③ 完成率趋势
//   lineName × status                      → 右① 按管线（屏上唯一的跨作业区维度）
//   逐站 status                            → 右② 需关注清单
//   分区 issues / 每百站密度 / completionRate → 下带 6 张卡
//
// 【三条纪律】
//   · 合规率只在左① 的卡头 meta 出现一次 —— 它与完成率同分母、只差那 12 项走过场，
//     两个都上头版等于一条链花两格。曾经把它印在条标签、图底注、上带三个地方。
//   · 完成率的 95.0% 只在上带② 出现一次 —— 条标签与折线末点标签都不印。
//   · note 只放数，不放对数的评价。「屏上唯一要现在动手的数」这类是设计说明，
//     属于代码注释而不是 UI 文案。
//
// ── 删掉的内容 ────────────────────────────────────────────────────────────
// 1) 右下角 DetailCard（旧 renderProvinceHint / renderSiteDetail）：省域态正文是
//    「点击左侧作业区排名或地图上的作业区标签，下钻查看该区站点清单与详情。」加两个
//    tag「两级钻取」「省域 → 作业区」——写给开发看的操作说明；作业区态是「类型/介质/
//    类别」三行 + 一句「XX站 使用作业区级示意坐标，仅用于首页区域态势。」——路演里
//    念出这句等于自己扣分。scripts/ui/detailcard.js 不再加载。
// 2) 「作业区巡检覆盖率」横向柱：被下带的 6 张作业区卡取代，卡片还能点。
// 3) 底栏 + 面包屑：位置由浮在地图左上角的 .ov-map-place 表达，返回全省沿用地图
//    右下角 .ov-zoom 里已有的 ‹ 按钮。
// 4) 顶栏英文 kicker、左侧 brand 的两行文字、两侧 .topbar-wing 装饰翼：标题只在
//    顶栏中间出现一次（详见 styles/02-shell.css 文件头第 2 条）。
// 5) 「台账构成」（站场/阀室、天然气/成品油两条堆叠柱）：静态结构，与「当前风险」无关，
//    且 141 这个数在地图副标题里已经有了。介质那件事没有丢 —— 它现在是右① 的卡头 meta
//    （天然气 12/75 = 16.0% · 成品油 1/66 = 1.5%），一句话说完。
// 6) 清单的「介质」列：13 行里 12 行写着「天然气」，与当初砍掉「所在市」列同一个毛病。
//    换成「管线」列，13 行分 4 个值，且与右① 那张图同一维度，图与表互为索引。
//
// 【注意：「动态趋势折线图」曾经在这份删除清单里，现在回来了】它就是左③。当初删它的
// 理由是「完成率已由完成度环的环心承载」，而完成度环本身已经被三横条取代；而且顶栏那个
// 日期区间控件原先唯一的消费点只有两个文字标签，点了屏上什么都不动 —— 那张图是它现在
// 唯一的着力点。数据是回溯的演示值，卡头 meta 如实标注。
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
  // 湖南公司实际的 6 个作业区。3D 契约的 ZONE_IDS 有 10 个（多出的 4 个来自旧的全量
  // 拓扑表），quality.js 只覆盖这 6 个，逐区取数时必须用这一份而不是契约那一份。
  var HUNAN_ZONE_IDS = ["yueyang", "changsha", "hengyang", "yongchen", "xianglou", "zhuzhou"];
  var STATUS_RANK = { danger: 0, warn: 1, ok: 2 };

  // 图表 id：与 renderCharts() 里 Charts.draw() 的第一个参数一一对应。
  // Charts.draw 对未先 slot 的 id 直接抛错，所以「这一轮渲染了哪几张图」必须和
  // 「这一轮 draw 了哪几张图」严格相等——见 renderCharts() 里的状态分支。
  var CHART_PLAN = "chart-plan";
  var CHART_BEHAVIOR = "chart-behavior";
  var CHART_TREND = "chart-trend";
  var CHART_LINE = "chart-line";

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

  // 从旧目录 hunan-inspection-overview/scripts/scenes/overview.js 抄回来的两道校验。
  // 上一版换成裸的 new Date("2026-04-24") 之后两道都丢了：
  //   · 格式没校验 —— CUSTOM_DATE_RANGES 里任何一个串写错都会静默变成 Invalid Date，
  //     再经 (b - a) 得 NaN，而 typeof NaN === "number" 让下游守卫全部穿透
  //   · 语义变了 —— date-only 裸串按 **UTC 午夜** 解析，加 "T00:00:00" 才是本地午夜。
  //     两端同为 UTC 午夜时差值仍然精确（跨月跨年 DST 都对），但那是巧合不是设计。
  function parseDateOnly(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new Error("[OverviewScene] 日期必须使用 YYYY-MM-DD 格式：" + value);
    }
    var date = new Date(value + "T00:00:00");
    if (isNaN(date.getTime()) || formatDate(date) !== value) {
      throw new Error("[OverviewScene] 非法日期：" + value);
    }
    return date;
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

  // 派生指标一律从 window.HunanDerive 读，本文件不自留副本。
  //
  // ⚠️ 这里原先有一段注释写着「合规率 (planned − 行为异常) / planned」—— 那正是这一轮
  // 判定为**错**并修掉的公式（129/141 = 91.5%，把没巡的 7 项也当成了有效；正确是
  // (134 − 12)/141 = 86.5%）。代码做的是对的、紧挨着的注释记的是错的，谁按注释去
  // 「恢复一致性」就会精确地把 bug 装回去。正确的论证在 scripts/core/derive.js 里。
  function requireDerive() {
    if (!window.HunanDerive) {
      throw new Error("[OverviewScene] 需要 window.HunanDerive，请检查 index.html 里 "
        + "scripts/core/derive.js 是否早于本文件加载");
    }
    return window.HunanDerive;
  }

  // 把 ratePct 的 Number 结果格式成一位小数字符串（屏上一律一位小数）。
  function pct1(num, den, label) {
    return requireDerive().ratePct(num, den, label).toFixed(1);
  }

  // 【P0-2 护栏】屏上「需关注站点 13」（sites.js 的逐站 status）与「发现问题 13」
  // （quality.js 的 issues）逐区恒等：岳阳 5/5、长沙 1/1、衡阳 2/2、永郴 2/2、湘娄 1/1、
  // 株洲 2/2。这不是巧合，是两份**互不校验**的数据源被手工对齐过。任何一天改了一边，
  // 屏上就会同时出现「需关注 13」和「发现问题 14」，而没有任何一处解释这 1 的差。
  // 全项目都是 fail-fast 风格，这条恰好缺了 —— 它是唯一能防住那个漂移的东西。
  function assertIssueIdentity() {
    var q = Quality.province();
    var need = Sites.sites().filter(function (site) { return site.status !== "ok"; }).length;
    if (need !== q.issues) {
      throw new Error("[OverviewScene] 需关注站点数 " + need + " 与发现问题数 " + q.issues
        + " 不一致 —— sites.js 的逐站 status 与 quality.js 的 issues 已经漂移，"
        + "屏上会同时出现两个不同的数而无处解释");
    }
    Contract.ZONE_IDS.forEach(function (zoneId) {
      // 原先这里包了 try/catch，注释写「3D 契约有 10 个区，质量数据只 6 个」。核过了：
      // hunan-inspection-overview/scripts/map3d/contract.js 的 ZONE_IDS 恰好 6 个，
      // quality.js 的 assertCoverage() 在加载期就保证 6 个全在 —— 那个 catch 永远不会
      // 触发（10 个那句是从泵屏搬来的，泵屏用的是另一份 contract）。而它一旦触发，吞掉的
      // 正好是本函数存在的意义：byZone 抛错会被静默 return，守卫悄悄退化成只校验一部分区。
      var zq = Quality.byZone(zoneId);
      var zn = Sites.sitesByZone(zoneId).filter(function (site) { return site.status !== "ok"; }).length;
      if (zn !== zq.issues) {
        throw new Error("[OverviewScene] " + zq.name + " 需关注 " + zn + " 与问题 " + zq.issues + " 不一致");
      }
    });
    return need;
  }


  // =====================================================================
  // 上边：5 个大数。**不随下钻变化**（下钻时全省基准仍在屏上，可与下边作业区卡对读）。
  //
  // 【相对上一版的改动】上一版是 4 张卡、每张只有「标题 + 数字」两行、**连 note 都没有**，
  // 608px 宽的卡右侧空 480~530px。而且四个数里有两个是静态结构数：
  //   站点总数 141 —— 地图副标题「141 个站场/阀室」已经写了一遍
  //   作业区 6     —— 下边那条带就是 6 张作业区卡，数一下就知道
  // 两个都跟「当前风险」无关，却占了头版一半的位置。现在换成五个都能引出管理动作的数，
  // 每张补一行 note 承载第二维（占比 / 完成度 / 构成）。
  //
  // 五个数与四张图不重复：完成率的**汇总值**在双环里，这里给的是「未巡 7 项」这个
  // 可行动的另一半；行为异常 12 的**三类构成**在环形图里，这里只给合计与一行拆分。
  // =====================================================================
  function renderStatBand() {
    assertLoaded();
    var D = requireDerive();
    var q = Quality.province();
    var beh = D.behaviorTotal(q);
    var need = assertIssueIdentity();
    var done = q.issues - q.currentRisk;
    return h("section", { class: "panel ov-stat-band" }, [
      window.Cards.metric({
        label: "当前风险", value: q.currentRisk, unit: "项",
        status: q.currentRisk > 0 ? "danger" : "ok",
        // note 只放数，不放我对这个数的评价。「屏上唯一要现在动手的数」是设计说明，
        // 属于代码注释而不是 UI 文案。
        note: "P1 累计 " + q.p1Issues + " 项 · 已处置 " + (q.p1Issues - q.currentRisk) + " 项"
      }),
      // 标签冠「计划」二字：「巡检完成率」没交代分母，屏上另有 141 台账 / 134 已巡 /
      // 13 问题三个数，观众得先猜是除以哪个。「计划完成率」的分母就是左① 那根最长的条。
      window.Cards.metric({
        label: "计划完成率", value: q.completionRate.toFixed(1) + "%",
        status: q.completionRate < 95 ? "warn" : "ok",
        note: "已巡 " + q.completed + " / 计划 " + q.planned + " 项 · 未巡 " + (q.planned - q.completed) + " 项"
      }),
      // 【这一格原先是「计划合规率 86.5%」，换掉了】合规率与完成率同分母、只差那 12 项，
      // 两格花在同一条链上；而那条链左① 整张图已经在讲（141 → 134 → 122），合规率现在是
      // 那张卡的卡头 meta。换成业务方原词「问题处置完成率」—— 它回答一个别处没有的问题：
      // 发现的处置掉了吗。出处是《巡检情况反馈情况说明》原话「统计巡检率、异常上报率、
      // 问题处置完成率等指标」，且逐区算出 100/100/100/100/80/50，与助手页周报逐字吻合。
      //
      // ⚠️ 口径边界：算式 (issues - currentRisk) / issues 隐含假设「不是未闭环 P1 的问题
      // 就都闭环了」。数据层没有逐问题的闭环字段，所以严格说这是「非未闭环-P1 占比」。
      // 【issues === 0 是合法状态，不是错】同一个文件 issuesStatus() 里写着
      // `if (q.issues === 0) return "ok"` —— 作者已经认定这是合法的；三行之后却无条件
      // 拿它当分母。实测：monkeypatch issues=0 后触发重绘，抛「分母必须为正」，而
      // boot.js 已经执行过 root.innerHTML = ""，于是整屏只剩顶栏。
      // 「全省问题清零」正是这块屏存在的目的，把它做成致命错误等于「整改成功 = 演示崩溃」。
      // 这里给它一个渲染分支（写法照 aiAlertNote() 那条），不是兜底 —— 兜底是把错误藏起来，
      // 这里是把合法域值画出来。
      window.Cards.metric({
        label: "问题处置完成率",
        value: D.canDisposalRate(q) ? pct1(done, q.issues, "问题处置完成率") + "%" : "—",
        status: q.currentRisk > 0 ? "warn" : "ok",
        note: q.issues === 0
          ? "本区间未发现问题"
          : "已处置 " + done + " / " + q.issues + " 项 · 待处置 " + q.currentRisk + " 项"
      }),
      // note 里说出那个恒等关系：13 个问题正好摊在 13 个站点上，右栏清单的 13 行就是它的展开。
      window.Cards.metric({
        label: "发现问题", value: q.issues, unit: "项", status: issuesStatus(q),
        note: q.issues === 0
          ? "本区间未发现问题"
          : "涉及 " + need + " 个站点 · P1 " + q.p1Issues + " 项（" + pct1(q.p1Issues, q.issues, "P1 占比") + "%）"
      }),
      // 【原先这条 note 写「覆盖行为异常 50.0%」，是自相矛盾的】把 aiAlerts 从环形图里
      // 搬出来的唯一理由就是「它和时长/间隔/时段混量纲，同一根轴上读不出结论」；结果搬出来
      // 之后又把这两个量纲相除还管它叫覆盖率。6 条 AI 提醒和 12 次行为异常之间没有任何
      // 已知的对应关系，50% 是个没有指称的数。换成真有的分布：逐区 2/1/1/1/0/1。
      window.Cards.metric({
        label: "AI 提醒", value: q.aiAlerts, unit: "条", status: q.aiAlerts > 0 ? "warn" : "ok",
        note: aiAlertNote()
      }),
    ]);
  }

  // 介质切分：需关注站点在天然气线与成品油线上的占比。现算，不落数据层。
  function mediumSplitText() {
    var all = Sites.sites();
    function ratioOf(medium) {
      var pool = all.filter(function (site) { return site.medium === medium; });
      if (!pool.length) throw new Error("[OverviewScene] 台账里没有介质为「" + medium + "」的站点");
      var need = pool.filter(function (site) { return site.status !== "ok"; }).length;
      return need + "/" + pool.length + " = " + pct1(need, pool.length, medium + " 需关注占比") + "%";
    }
    return "天然气 " + ratioOf("天然气") + " · 成品油 " + ratioOf("成品油");
  }

  // AI 提醒的逐区分布：覆盖几个区、最多的是哪个。全部现算。
  function aiAlertNote() {
    var rows = HUNAN_ZONE_IDS.map(function (zoneId) {
      var zq = Quality.byZone(zoneId);
      return { name: Contract.ZONE_NAMES[zoneId].replace("作业区", ""), n: zq.aiAlerts };
    }).filter(function (r) { return r.n > 0; });
    if (!rows.length) return "时序 / 轨迹模型 · 本区间无提醒";
    rows.sort(function (a, b) { return b.n - a.n; });
    return "时序 / 轨迹模型 · 覆盖 " + rows.length + " 个作业区 · " + rows[0].name + " " + rows[0].n + " 条最多";
  }

  function renderLeftColumn(state) {
    assertLoaded();
    var D = requireDerive();
    var range = activeDateRange(state);
    var q = Quality.province();
    var beh = D.behaviorTotal(q);
    return h("section", { class: "panel ov-left-col" }, [
      // 合规率从上带第 3 格降级到这里 —— 它本来就是这张图的结论（141→134→122 那条链的末端）。
      window.Cards.chart({
        title: "巡检计划执行",
        meta: "合规率 " + pct1(q.completed - beh, q.planned, "合规率") + "%",
        chartId: CHART_PLAN
      }),
      window.Cards.chart({
        title: "行为异常构成",
        meta: "合计 " + beh + " 次",
        chartId: CHART_BEHAVIOR
      }),
      // meta 里必须写「末点为当期实测」：这张图 7 个点只有末点是真的（钉在 completionRate
      // 上），其余是回溯的演示值，行为异常那排柱子同样是派生。代码注释里写清楚了不够 ——
      // 屏上得有一句，否则路演被追问数据来源时不好回答。
      window.Cards.chart({
        title: "完成率趋势",
        // 【「末点为当期实测」只在窗口结束于今天时才成立】自定义区间是历史区间
        // （4/24-4/30、7/28-8/4、8月巡检），它的末点画的是**当前**完成率 95.0%，
        // 说成「当期实测」就是换了个方式说假话。三个预设都带 end，用它区分。
        meta: range.shortLabel + (range.end ? " · 历史区间（演示值）" : " · 末点为当期实测"),
        chartId: CHART_TREND
      }),
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

  // 【「介质」列换成「管线」列】判据是这屏一直在用的那条：「哪一列每行都不一样」。
  // 介质列 13 行里有 12 行写着「天然气」—— 正是当初砍掉「所在市」列的同一个毛病
  // （岳阳 36 行里整列写着「岳阳市」）。管线列 13 行分 4 个值（忠武线潜湘支线 6 /
  // 潜江-韶关输气管道 5 / 长郴成品油管道 1 / 西二线樟湘联络线 1），而且与右栏上方那张
  // 「按管线」的图同一个维度 —— 图给占比、表给逐站，两块互为索引。
  //
  // 介质那件事没有丢：它现在是那张图的卡头 meta（天然气 12/75 = 16.0% · 成品油 1/66 = 1.5%），
  // 一句话说完，比一整列重复的「天然气」有用。
  var PROVINCE_ALERT_COLUMNS = [
    { key: "zone", label: "作业区", width: 18 },
    { key: "name", label: "站点", width: 30 },
    { key: "line", label: "管线", width: 34 },
    { key: "status", label: "状态", width: 18 },
  ];
  var ZONE_ALERT_COLUMNS = [
    { key: "name", label: "站点", width: 28 },
    { key: "kind", label: "类型", width: 16 },
    { key: "line", label: "管线", width: 38 },
    { key: "status", label: "状态", width: 18 },
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
    if (columnKey === "line") return site.lineName;
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

  // 右栏从一块拆成两块。上一版是 13 行清单独占 949px，表底下空着约 250px。
  // 补进来的是作业区风险矩阵 —— 它跟随不了焦点（下钻后只剩一个区，散点图没意义），
  // 所以放在**上面**当全省基准，下面那块需关注清单才是跟焦点变的。
  function renderRightColumn(state) {
    assertLoaded();
    return h("section", { class: "panel ov-right-col" }, [
      // 这一格换成管线维度（原先是作业区气泡散点，三个通道在屏上别处全有原件）。
      // meta 给介质切分：13 个需关注里 12 个在天然气线上，一句话、零造数、跨作业区。
      window.Cards.chart({
        title: "需关注站点 · 按管线",
        meta: mediumSplitText(),
        chartId: CHART_LINE
      }),
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
      var siteTotal = row.ok + row.warn + row.danger;
      var q = Quality.byZone(row.zoneId);
      // 【每百站问题数】加这个数是因为绝对量会把「先管谁」答反：岳阳 5 个问题最多，
      // 但它有 36 个站；株洲只有 2 个问题、12 个站，每百站 16.7 反而是最高的。
      // 实测降序：株洲 16.7 > 岳阳 13.9 > 永郴 10.0 > 衡阳 7.4 > 湘娄 5.6 > 长沙 3.6。
      // 分子用 needAttention 而不是 q.issues —— 两者由 assertIssueIdentity() 保证相等，
      // 用上面那一行已经显示出来的数当分子，观众能自己验算。
      var density = siteTotal > 0 ? (needAttention / siteTotal * 100).toFixed(1) : "—";
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
          h("span", { text: "问题" }),
        ]),
        // completionRate 必须走 toFixed(1)：round1() 返回的是 Number，永郴 19/20 = 95
        // 直接拼字符串会渲染成「完成率 95%」，同一排 6 张卡里 5 张是一位小数、它一张是整数，
        // 而且那个 95% 和上带全省的 95.0% 数字相同含义完全不同（一个永郴、一个全省）。
        h("div", { class: "ov-zone-card-rate num",
          text: "每百站 " + density + " · 完成率 " + q.completionRate.toFixed(1) + "%" }),
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

  // 日期区间在这里第一次真正影响屏上内容：既决定趋势图画几个点，也决定**末点落在哪一天**。
  //
  // 【为什么必须把末点日期一起传下去】上一版只传点数，coverageTrend 无条件从「今天」往回
  // 数。于是点「湘潭站问题复核（2026-04-24 至 04-30）」时，顶栏写着 4/24-4/30、卡头 meta
  // 写着 4/24-4/30，而图上画的是 08-17…08-23 —— 屏上说假话。更糟的是那一档与「近7天」
  // 产出逐字节相同的图，等于自定义区间仍然什么都不动，而「点了屏上什么都不动」正是这一轮
  // 改造的立项理由。
  //
  // 【不做静默 clamp】上一版写 `if (count < 2) count = 2`，于是「本月」在 1 号会画出
  // **上个月最后一天**，而顶栏写着「09-01 至 09-01」。1 个点的折线 ECharts 画得出来
  // （一个孤立的点 + 目标线），那就让它画 1 个点，不要偷偷改成 2。
  function trendWindow(state) {
    var range = activeDateRange(state);
    var now = new Date();
    var count;
    var end;
    if (range.monthToDate) {
      count = now.getDate();
      end = now;
    } else if (range.days) {
      count = range.days;
      end = now;
    } else if (range.start && range.end) {
      var a = parseDateOnly(range.start);
      var b = parseDateOnly(range.end);
      count = Math.round((b - a) / 86400000) + 1;
      if (count < 1) {
        throw new Error("[OverviewScene] 自定义区间的起止日反了：" + range.start + " → " + range.end);
      }
      end = b;
    } else {
      throw new Error("[OverviewScene] 无法从日期区间推出趋势窗口：" + JSON.stringify(range));
    }
    if (count > 31) {
      throw new Error("[OverviewScene] 趋势区间超过 31 天（" + count + "），"
        + "coverageTrend 的上限是 31 —— 要支持更长区间得先改采样粒度，不能悄悄截断");
    }
    return { count: count, end: end };
  }

  function renderCharts(state) {
    window.Charts.draw(CHART_PLAN, window.ChartOptions.planExecutionBars());
    window.Charts.draw(CHART_BEHAVIOR, window.ChartOptions.behaviorDonut());
    window.Charts.draw(CHART_TREND, window.ChartOptions.coverageTrend(trendWindow(state)));
    window.Charts.draw(CHART_LINE, window.ChartOptions.lineRiskBars());
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
