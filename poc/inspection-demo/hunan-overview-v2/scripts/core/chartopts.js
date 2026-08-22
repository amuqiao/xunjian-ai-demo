// 纯函数 ECharts option 构造器：window.ChartOptions（L4 core，早于 scripts/scenes/*，
// 晚于 scripts/data/*）。本文件不碰 DOM、不 new echarts——只把数据层 +
// CSS 主题色拼成 option 对象。ECharts 版本 5.6.0（vendor 复用旧目录原文件）。
//
// 【POC：hunan-overview-v2】本文件是旧目录 scripts/core/chartopts.js 的重写，
// 不是增量修改。构造器从 5 个变成 3 个：
//
//   删除 siteKindMix()        —— 站场/阀室占比环形图。旧目录里写好了但从未被调用。
//   删除 zoneCoverageRows()   —— 作业区巡检覆盖率横向柱。被 zoneStatusMix() 取代：
//                                后者同样按作业区横排，但每根柱拆成正常/关注/异常
//                                三段，覆盖率只是「已巡/应巡」一个比值，信息量更小。
//   删除 inspectionCoverageTrend() —— 完成率趋势折线。完成率已经由 completionGauge()
//                                的环心承载，同一个数不画两遍。
//
//   新增 completionGauge(zoneId)   —— 巡检完成度环形（进度环 + 环心百分比）。
//   改写 qualityExceptionMix(zoneId) —— 从旧版的「省域固定 5 行、含当前 P1」改成
//                                「按 zoneId 取数、4 行、不含 P1」。P1 是风险等级，
//                                不是行为异常，混在同一根轴上会让人以为它们是同类；
//                                P1 现在是左栏第一行的大数指标之一。
//   新增 ledgerMix(zoneId)         —— 台账构成：类型（站场/阀室）与介质（天然气/成品油）
//                                两条 100% 堆叠柱。参考大屏（山东公司综合管理与监视
//                                平台）开篇第一张卡就是「站场统计：天然气 64 / 原油 36 /
//                                成品油 18」，那个顺序是对的——先交代盘子多大，再讲问题。
//   删除 zoneStatusMix()      —— 「哪个作业区最该管」这个问题从图表改成了下边作业区带里
//                                的 6 张卡（每卡：区名 + 需关注数 + 完成率 + 状态点），
//                                卡片同时是下钻入口，比一张只能看不能点的图更值那条横边。
//                                数据方法 window.HunanSeries.zoneStatusMix() 仍在用，
//                                由 scripts/scenes/overview.js 直接读。
//
// 三个构造器分别对应设计上的三个问题：
//   completionGauge      → 计划做完了吗
//   qualityExceptionMix  → 异常都是哪几类
//   ledgerMix            → 这批站点是什么构成
//
// 【三个都不带参数，一律全省口径】回字形里左栏和上边的指标带是「全省基准」，下钻时
// 刻意不变——点开岳阳时全省的 95% 和 13 项问题仍然在屏上，观众可以直接和下边岳阳卡上
// 的 94.4% / 5 项对读。跟随焦点变化的只有地图、右栏的需关注站点清单、和作业区带的
// 高亮。所以这三个构造器早先那个 zoneId 形参永远是 null，属于死掉的灵活性，删掉。
//
// 颜色全部现读 getComputedStyle(document.documentElement)，不写死任何色值——
// 与 01-tokens.css 的三色语义契约保持单一真源。
(function () {
  "use strict";

  var THEME = null;

  function readTheme() {
    var computed = getComputedStyle(document.documentElement);
    function cssVar(name) {
      var value = computed.getPropertyValue(name).trim();
      if (!value) throw new Error("[ChartOptions] 缺少 CSS 变量 " + name + "，请检查 styles/01-tokens.css");
      return value;
    }
    return {
      accent: cssVar("--accent"),
      accent2: cssVar("--accent-2"),
      ok: cssVar("--status-ok"),
      warn: cssVar("--status-warn"),
      danger: cssVar("--status-danger"),
      muted: cssVar("--muted"),
      ink: cssVar("--ink"),
      line: cssVar("--line"),
      lineStrong: cssVar("--line-strong")
    };
  }

  function requireTheme() {
    if (!THEME) THEME = readTheme();
    return THEME;
  }

  function requireQuality(fnName) {
    if (!window.HunanInspectionQuality) {
      throw new Error("[ChartOptions] " + fnName + " 需要 window.HunanInspectionQuality，请检查 scripts/data/quality.js 是否已加载");
    }
    return window.HunanInspectionQuality;
  }

  function requireSeries(fnName) {
    if (!window.HunanSeries) {
      throw new Error("[ChartOptions] " + fnName + " 需要 window.HunanSeries，请检查 scripts/data/series.js 是否已加载");
    }
    return window.HunanSeries;
  }

  // ECharts 的默认 tooltip 是白底黑字，叠在深蓝黑大屏上会亮得像个弹窗故障。
  // 三个构造器共用这一份深色 tooltip 皮肤。
  function darkTooltip(theme, extra) {
    var base = {
      backgroundColor: "rgba(8, 12, 30, 0.94)",
      borderColor: theme.lineStrong,
      borderWidth: 1,
      padding: [7, 10],
      textStyle: { color: theme.ink, fontSize: 12 }
    };
    Object.keys(extra || {}).forEach(function (key) { base[key] = extra[key]; });
    return base;
  }

  // ---------- completionGauge(zoneId)：巡检完成度环形 ----------
  //
  // 环心是百分比，环心下方一行是「已完成/计划 项」的绝对值。这两个数在旧场景里
  // 一共出现过三遍（KPI 卡的 note "34/36"、质量卡 focus 的 em「已完成」、质量卡
  // grid 的「计划巡检」），现在只在这一个图里出现。
  //
  // 进度弧的颜色跟着完成率的达标状态走：低于 95% 用 warn，否则用 ok。95 这个阈值
  // 与 scripts/scenes/overview.js 里 Cards.metric 的 status 判定同源，两处必须一致，
  // 否则会出现「环是橙的、旁边指标点是绿的」。
  function completionGauge() {
    var theme = requireTheme();
    var q = requireQuality("completionGauge()").province();
    var arcColor = q.completionRate < 95 ? theme.warn : theme.ok;

    return {
      series: [{
        type: "gauge",
        startAngle: 90,
        endAngle: -270,
        radius: "74%",
        center: ["50%", "52%"],
        min: 0,
        max: 100,
        splitNumber: 1,
        pointer: { show: false },
        axisLine: {
          lineStyle: {
            width: 22,
            color: [[1, theme.line]]
          }
        },
        progress: {
          show: true,
          width: 22,
          roundCap: true,
          itemStyle: { color: arcColor }
        },
        splitLine: { show: false },
        axisTick: { show: false },
        axisLabel: { show: false },
        detail: {
          valueAnimation: false,
          formatter: "{value}%",
          color: theme.ink,
          fontSize: 40,
          fontWeight: 700,
          offsetCenter: [0, "-8%"]
        },
        title: {
          offsetCenter: [0, "28%"],
          color: theme.muted,
          fontSize: 15
        },
        data: [{
          value: q.completionRate,
          name: q.completed + " / " + q.planned + " 项"
        }]
      }]
    };
  }

  // ---------- qualityExceptionMix(zoneId)：巡检质量异常构成（横向柱） ----------
  //
  // 四行的阈值说明（"<10min" / "<10s" / "偏移30min" / "时序/轨迹"）在旧场景里是
  // 常驻在屏幕上的 note 小字，四行说明本身比它们注解的四个数字占的位置还多。
  // 现在挪进 tooltip：需要知道判定口径的人悬停即可，路演时屏上只剩「类别 + 条数」。
  //
  // 配色语义：前三行是巡检人员的行为异常（用 warn），第四行「AI 提醒」是模型主动
  // 发现的线索、不是违规（用 accent）。两者不同色，是因为它们在管理动作上不同类：
  // 前者要追责到人，后者要去核实现场。
  var EXCEPTION_ROWS = [
    { key: "duration", label: "时长异常", hint: "单项巡检用时不足 10 分钟", tone: "warn" },
    { key: "interval", label: "间隔异常", hint: "相邻巡检项间隔不足 10 秒", tone: "warn" },
    { key: "offWindow", label: "时段异常", hint: "偏离计划时段 30 分钟以上", tone: "warn" },
    { key: "aiAlerts", label: "AI 提醒", hint: "时序 / 轨迹模型触发的核实线索", tone: "accent" }
  ];

  function qualityExceptionMix() {
    var theme = requireTheme();
    var q = requireQuality("qualityExceptionMix()").province();
    var rows = EXCEPTION_ROWS.map(function (row) {
      if (!(row.key in q)) {
        throw new Error("[ChartOptions] qualityExceptionMix() 缺少字段 " + row.key + "，请检查 scripts/data/quality.js");
      }
      return { label: row.label, hint: row.hint, value: q[row.key], color: theme[row.tone] };
    });

    return {
      grid: { left: 86, right: 52, top: 6, bottom: 6 },
      tooltip: darkTooltip(theme, {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: function (params) {
          var row = rows[params[0].dataIndex];
          return row.label + "　" + row.value + " 次<br/><span style=\"opacity:.65\">" + row.hint + "</span>";
        }
      }),
      xAxis: {
        type: "value",
        minInterval: 1,
        axisLabel: { color: theme.muted, fontSize: 12 },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: theme.line } }
      },
      // ECharts 的 category 轴自下而上排，数组第 0 项会落在最底行。这里 reverse
      // 一次，让 EXCEPTION_ROWS 的书写顺序（时长→间隔→时段→AI）在屏上是自上而下。
      yAxis: {
        type: "category",
        data: rows.map(function (row) { return row.label; }).reverse(),
        axisLabel: { color: theme.ink, fontSize: 14 },
        axisLine: { lineStyle: { color: theme.line } },
        axisTick: { show: false }
      },
      series: [{
        type: "bar",
        barWidth: 34,
        label: {
          show: true,
          position: "right",
          formatter: "{c}",
          color: theme.muted,
          fontSize: 14
        },
        data: rows.map(function (row) {
          return { value: row.value, itemStyle: { color: row.color, borderRadius: [0, 3, 3, 0] } };
        }).reverse()
      }]
    };
  }

  // ---------- ledgerMix(zoneId)：台账构成（两条 100% 堆叠柱） ----------
  //
  // 两行：「类型」拆站场/阀室，「介质」拆天然气/成品油。每行各自占满整条轴（100%
  // 堆叠），所以两行之间比的是构成比例，不是绝对数量——绝对数量写在段内标签上。
  //
  // 为什么不做环形图：两个维度就要两个环，两个环并排会各自占掉一个正方形区域，
  // 在 560px 宽的竖栏里只能缩得很小；两条横向堆叠柱把同样的信息压进 210px 高度，
  // 而且两行天然对齐、可以直接上下对读。参考大屏那张卡用的是四个立体图标配数字，
  // 信息量还不如这两条，但占了三倍面积。
  //
  // 数据在这里现算而不是加到数据层：本目录跨目录复用
  // ../hunan-inspection-overview/scripts/data/series.js 的原文件，那边刚清理掉
  // siteKindMix/mediumMix/categoryMix 三个死方法，不该为了这一张图再加回去。
  // Sites.sites() / Sites.sitesByZone() 已经把 kind 与 medium 两个字段给全了。
  var LEDGER_ROWS = [
    { label: "类型", segments: [{ name: "站场", match: function (s) { return s.kind === "station"; } },
                                { name: "阀室", match: function (s) { return s.kind === "valve"; } }] },
    { label: "介质", segments: [{ name: "天然气", match: function (s) { return s.medium === "天然气"; } },
                                { name: "成品油", match: function (s) { return s.medium === "成品油"; } }] },
  ];

  function requireSites(fnName) {
    if (!window.HunanSites) {
      throw new Error("[ChartOptions] " + fnName + " 需要 window.HunanSites，请检查 scripts/data/sites.js 是否已加载");
    }
    return window.HunanSites;
  }

  function ledgerMix() {
    var theme = requireTheme();
    var Sites = requireSites("ledgerMix()");
    var list = Sites.sites();
    if (!list.length) throw new Error("[ChartOptions] ledgerMix() 取到 0 个站点");

    // 段的两种色只用非语义色 accent / accent-2。绝不用 --status-* ——
    // 「站场/阀室」「天然气/成品油」都不是好坏，借状态色会读成「阀室是有问题的那类」。
    var tones = [theme.accent, theme.accent2];

    // 每个 (行, 段) 组合是一条 series：同一行内 stack 相同，别行的值填 0。
    // 段数固定为 2，所以一共 4 条 series，不是动态长度。
    var series = [];
    LEDGER_ROWS.forEach(function (row, rowIndex) {
      row.segments.forEach(function (seg, segIndex) {
        var counted = list.filter(seg.match).length;
        series.push({
          name: seg.name,
          type: "bar",
          stack: row.label,
          barWidth: 40,
          itemStyle: { color: tones[segIndex] },
          label: {
            show: true,
            position: "inside",
            // 段太窄时 ECharts 会把 inside 标签画出边界，所以只在占比够宽时显示；
            // 被隐藏的段仍然能靠 tooltip 读到。
            formatter: function (params) {
              return params.value > 0 ? seg.name + " " + params.value : "";
            },
            color: "#06121c",
            fontSize: 13,
            fontWeight: 700
          },
          data: LEDGER_ROWS.map(function (r, i) { return i === rowIndex ? counted : 0; })
        });
      });
    });

    return {
      grid: { left: 54, right: 18, top: 10, bottom: 10 },
      tooltip: darkTooltip(theme, { trigger: "axis", axisPointer: { type: "shadow" } }),
      xAxis: {
        type: "value",
        show: false
      },
      // category 轴自下而上排，reverse 让 LEDGER_ROWS 的书写顺序（类型 → 介质）
      // 在屏上是自上而下。
      yAxis: {
        type: "category",
        data: LEDGER_ROWS.map(function (row) { return row.label; }).reverse(),
        axisLabel: { color: theme.ink, fontSize: 14 },
        axisLine: { show: false },
        axisTick: { show: false }
      },
      series: series.map(function (spec) {
        return Object.assign({}, spec, { data: spec.data.slice().reverse() });
      })
    };
  }

  window.ChartOptions = {
    completionGauge: completionGauge,
    qualityExceptionMix: qualityExceptionMix,
    ledgerMix: ledgerMix
  };
})();
