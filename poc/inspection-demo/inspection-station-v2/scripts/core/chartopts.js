// 纯函数 ECharts option 构造器：window.ChartOptions（L4 core，早于 scripts/scenes/*，
// 晚于 scripts/data/*）。本文件不碰 DOM 结构、不 new echarts —— 只把数据层 +
// CSS 主题色拼成 option 对象。ECharts 版本 5.6.0（vendor 复用原目录原文件）。
//
// 【POC：inspection-station-v2】三个构造器**全部以轮次为横轴**。
//
// 这是本屏与省域大屏的分工：省域大屏（hunan-overview-v2）是 141 个站点 × 一个时点的
// 横截面，图表横轴是「作业区」；本屏只有 1 个站点，横截面只剩一行，所以横轴换成
// 「巡检轮次」。同一套指标在两屏换的是轴，不是 scope。
//
// 【相对原目录 scripts/core/chartopts.js 的替换】原文件 4 个构造器全部删除：
//   areaProgressBars() —— 「12 区完成率」。这份数据集是已完成巡检的静态结果集
//                        （series.js 自己写明 done 恒等于 total、ratio 恒为 1），画出来
//                        是 12 根等长满条，零信息。
//   durationByArea()   —— 「巡检耗时曲线」。逐区耗时是由轨迹总时长按项数**摊派**出来的
//                        （series.js 的 apportionMinutes），12 个区算下来是 12.9–17.1
//                        秒/项，几乎均匀 —— 它没有区分度，不能用来判断哪个区被赶工。
//                        真正有区分度的是**逐轮**总用时（88 → 63 分钟），所以换成
//                        patrolMinutesTrend()。
//   itemTypeMix()      —— 布尔/数值占比。与监督者视角无关。
//   spark()            —— 原区域详情卡里的迷你走势图，那张卡已整体删除。
//
//   新增 complianceTrend()      —— 合规率趋势（折线，近 14 轮）
//   新增 behaviorByRound()      —— 行为异常逐轮（堆叠柱：时长 / 间隔 / 时段）
//   新增 patrolMinutesTrend()   —— 巡检用时逐轮（折线，分钟）
//
// 【为什么②③要分成两张而不是做成双轴】「越赶越糙」是这一屏的核心叙事：②的柱子在长、
// ③的线在降。把用时叠到②上做右轴确实能一图看完，但双轴图的两个 y 轴刻度无法互相校准，
// 读者只能看趋势方向、读不出数量关系，而且很容易被当成「相关性已被证明」。分成上下
// 相邻的两张，趋势方向的反向一样一眼可见，且每张图只有一个刻度、每根轴都能读。
//
// 【三张图都不带参数，一律全站口径】回字形里上边指标带和左栏是全站基准，下钻时刻意
// 不变 —— 点开某个区域时全站的合规率曲线仍在屏上，可以和右栏该区的明细对读。
//
// 配色现读 getComputedStyle(document.documentElement)，不写死任何色值。
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
      cyan: cssVar("--cyan"),
      blue: cssVar("--blue"),
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
    if (!window.StationQuality) {
      throw new Error("[ChartOptions] " + fnName + " 需要 window.StationQuality，请检查 scripts/data/quality.js 是否已加载");
    }
    return window.StationQuality;
  }

  // ECharts 默认 tooltip 是白底黑字，叠在深蓝黑大屏上会亮得像个弹窗故障。
  function darkTooltip(theme, extra) {
    var base = {
      backgroundColor: "rgba(8, 12, 30, 0.94)",
      borderColor: theme.lineStrong,
      borderWidth: 1,
      padding: [7, 10],
      textStyle: { color: theme.ink, fontSize: 13 }
    };
    Object.keys(extra || {}).forEach(function (key) { base[key] = extra[key]; });
    return base;
  }

  // 14 个轮次标签排在 560px 栏宽（扣掉 grid 左右还剩约 440px）里放不开，隔一个显示一个
  // → 7 个标签。不用 rotate：斜排标签在等比缩放的固定画布上会糊。
  function roundAxis(theme, rows) {
    return {
      type: "category",
      data: rows.map(function (r) { return r.shortDate; }),
      axisLabel: { color: theme.muted, fontSize: 12, interval: 1 },
      axisLine: { lineStyle: { color: theme.line } },
      axisTick: { show: false }
    };
  }

  // ---------- complianceTrend()：合规率趋势（折线） ----------
  //
  // 合规率 = (计划项 − 被三类行为异常判定为无效的项) / 计划项。不是「提交完成率」——
  // 这份数据集里 256 项每轮都提交完，提交完成率恒为 100%（见 data/quality.js 文件头）。
  //
  // y 轴从 92 起而不是 0：14 轮的取值落在 94.9–99.6 之间，0 起点会把整条线压成一条
  // 贴顶的直线，看不出任何变化。这是刻意的截断刻度，代价是「视觉落差被放大」——所以
  // 轴标签保留百分号、tooltip 给绝对条数（多少项无效），读者能校准。
  function complianceTrend() {
    var theme = requireTheme();
    var rows = requireQuality("complianceTrend()").rounds();
    if (!rows.length) throw new Error("[ChartOptions] complianceTrend() 需要至少一轮数据");

    return {
      grid: { left: 52, right: 22, top: 18, bottom: 26 },
      tooltip: darkTooltip(theme, {
        trigger: "axis",
        formatter: function (params) {
          var r = rows[params[0].dataIndex];
          return r.date + "　" + r.inspector + "<br/>合规率 " + r.complianceRate + "%"
            + "<br/><span style=\"opacity:.65\">" + r.valid + " / " + r.planned + " 项有效，"
            + r.invalid + " 项被判无效</span>";
        }
      }),
      xAxis: roundAxis(theme, rows),
      yAxis: {
        type: "value",
        min: 92,
        max: 100,
        axisLabel: { color: theme.muted, fontSize: 12, formatter: "{value}%" },
        splitLine: { lineStyle: { color: theme.line } }
      },
      series: [{
        type: "line",
        smooth: false,
        symbol: "circle",
        symbolSize: 6,
        data: rows.map(function (r) { return r.complianceRate; }),
        lineStyle: { color: theme.cyan, width: 2 },
        itemStyle: { color: theme.cyan },
        areaStyle: { color: theme.cyan, opacity: 0.12 },
        // 最后一个点标红：那一轮就是屏上正在看的这一轮（地图与右栏明细都是它）。
        markPoint: {
          symbol: "circle",
          symbolSize: 10,
          itemStyle: { color: theme.warn },
          label: { show: false },
          data: [{ coord: [rows.length - 1, rows[rows.length - 1].complianceRate] }]
        }
      }]
    };
  }

  // ---------- behaviorByRound()：行为异常逐轮（堆叠柱） ----------
  //
  // 三类都是「人的行为」问题，所以同用 warn 系的三个明度档而不是三种色相 —— 三种色相
  // 会读成三件不相关的事，而监督者关心的是「合计在涨」外加「主要涨在哪一类」。
  // AI 提醒不进这张图：它不是违规，是模型给的核实线索（见 data/quality.js 的 KINDS 注释）。
  var BEHAVIOR_SERIES = [
    { key: "duration", name: "时长异常", color: "#eeb44a" },
    { key: "interval", name: "间隔异常", color: "#d99a2f" },
    { key: "offWindow", name: "时段异常", color: "#b87a1c" }
  ];

  function behaviorByRound() {
    var theme = requireTheme();
    var rows = requireQuality("behaviorByRound()").rounds();

    return {
      grid: { left: 44, right: 22, top: 30, bottom: 26 },
      legend: {
        top: 0,
        right: 0,
        itemWidth: 10,
        itemHeight: 10,
        itemGap: 12,
        textStyle: { color: theme.muted, fontSize: 12 }
      },
      tooltip: darkTooltip(theme, { trigger: "axis", axisPointer: { type: "shadow" } }),
      xAxis: roundAxis(theme, rows),
      yAxis: {
        type: "value",
        minInterval: 1,
        axisLabel: { color: theme.muted, fontSize: 12 },
        splitLine: { lineStyle: { color: theme.line } }
      },
      series: BEHAVIOR_SERIES.map(function (spec) {
        return {
          name: spec.name,
          type: "bar",
          stack: "behavior",
          barWidth: 14,
          itemStyle: { color: spec.color },
          data: rows.map(function (r) { return r[spec.key]; })
        };
      })
    };
  }

  // ---------- patrolMinutesTrend()：巡检用时逐轮（折线） ----------
  //
  // 与上面那张配对读：这条线在降、那些柱在长，就是「越赶越糙」。
  // tooltip 给出每项平均秒数 —— 63 分钟走完 256 项 = 14.8 秒/项，这个数本身就是
  // 「为什么会有项停留不足 10 秒」的解释。
  function patrolMinutesTrend() {
    var theme = requireTheme();
    var rows = requireQuality("patrolMinutesTrend()").rounds();

    return {
      grid: { left: 46, right: 22, top: 18, bottom: 26 },
      tooltip: darkTooltip(theme, {
        trigger: "axis",
        formatter: function (params) {
          var r = rows[params[0].dataIndex];
          return r.date + "　" + r.minutes + " 分钟"
            + "<br/><span style=\"opacity:.65\">" + r.planned + " 项，平均 "
            + r.secondsPerItem + " 秒/项</span>";
        }
      }),
      xAxis: roundAxis(theme, rows),
      yAxis: {
        type: "value",
        axisLabel: { color: theme.muted, fontSize: 12, formatter: "{value}′" },
        splitLine: { lineStyle: { color: theme.line } }
      },
      series: [{
        type: "line",
        smooth: false,
        symbol: "circle",
        symbolSize: 6,
        data: rows.map(function (r) { return r.minutes; }),
        lineStyle: { color: theme.blue, width: 2 },
        itemStyle: { color: theme.blue },
        areaStyle: { color: theme.blue, opacity: 0.10 },
        markPoint: {
          symbol: "circle",
          symbolSize: 10,
          itemStyle: { color: theme.warn },
          label: { show: false },
          data: [{ coord: [rows.length - 1, rows[rows.length - 1].minutes] }]
        }
      }]
    };
  }

  window.ChartOptions = {
    complianceTrend: complianceTrend,
    behaviorByRound: behaviorByRound,
    patrolMinutesTrend: patrolMinutesTrend
  };
})();
