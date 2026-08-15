// 纯函数 ECharts option 构造器：window.ChartOptions（L4 core，早于 scripts/scenes/*，
// 晚于 scripts/data/series.js）。本文件不碰 DOM、不 new echarts——只把
// window.HunanSeries 的数据 + CSS 主题色拼成 option 对象。
//
// 【POC：hunan-inspection-overview（巡检站总览）】
// 本文件与 poc/hunan-pump-overview/scripts/core/chartopts.js 是姐妹文件但内容不同：
// 两份文件都实现 zoneStatusMix/siteKindMix（两块屏"共有"的方法），但各自独有的第三
// 个构造器不同——本文件是 issueByDiscipline/zoneCoverageRows 二选一（对应巡检语义），
// 姐妹文件换成 pumpHealthRank/throughputRows（对应成品油泵站语义）。不写死任何色值：
// 颜色全部现读 getComputedStyle(document.documentElement)，两块屏各自的青蓝/暖琥珀
// 基调因此自动生效，不在本文件里另写一套色板（这是任务硬约束）。不引入 ECharts 地图
// 组件——省域地图由 Three.js 负责，这里只画统计图表。
(function () {
  "use strict";

  var THEME = null;
  var THEME_KEYS = ["accent", "accent2", "ok", "warn", "danger", "muted", "ink", "lineStrong"];
  var STATUS_KEYS = ["ok", "warn", "danger"];

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
      lineStrong: cssVar("--line-strong")
    };
  }

  function requireTheme() {
    if (!THEME) THEME = readTheme();
    return THEME;
  }

  function statusColor(theme, status) {
    if (STATUS_KEYS.indexOf(status) < 0) {
      throw new Error("[ChartOptions] 非法 status: " + status + "，应 ∈ [" + STATUS_KEYS.join(", ") + "]");
    }
    return theme[status];
  }

  function requireSeries(fnName) {
    if (!window.HunanSeries) {
      throw new Error("[ChartOptions] " + fnName + " 需要 window.HunanSeries，请检查 scripts/data/series.js 是否已加载");
    }
    return window.HunanSeries;
  }

  // ---------- zoneStatusMix()：10 作业区状态堆叠柱（ok/warn/danger 三色堆叠） ----------
  function zoneStatusMix() {
    var theme = requireTheme();
    var rows = requireSeries("zoneStatusMix()").zoneStatusMix();
    if (!rows.length) throw new Error("[ChartOptions] zoneStatusMix() 需要至少一行数据");

    return {
      grid: { left: 70, right: 16, top: 26, bottom: 46 },
      legend: { top: 0, right: 0, itemWidth: 10, itemHeight: 10, textStyle: { color: theme.muted, fontSize: 10 } },
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      xAxis: {
        type: "category",
        data: rows.map(function (row) { return row.name.replace("作业区", ""); }),
        axisLabel: { color: theme.muted, fontSize: 10, interval: 0, rotate: 40 },
        axisLine: { lineStyle: { color: theme.lineStrong } }
      },
      yAxis: {
        type: "value",
        axisLabel: { color: theme.muted, fontSize: 10 },
        splitLine: { lineStyle: { color: theme.lineStrong } }
      },
      series: STATUS_KEYS.map(function (status) {
        return {
          name: status,
          type: "bar",
          stack: "mix",
          barWidth: 12,
          itemStyle: { color: statusColor(theme, status) },
          data: rows.map(function (row) { return row[status]; })
        };
      })
    };
  }

  // ---------- siteKindMix()：站场 vs 阀室占比（环形图） ----------
  function siteKindMix() {
    var theme = requireTheme();
    var mix = requireSeries("siteKindMix()").siteKindMix();
    if (mix.total <= 0) throw new Error("[ChartOptions] siteKindMix() 的 total 必须大于 0");

    return {
      color: [theme.accent, theme.accent2],
      tooltip: { trigger: "item" },
      legend: { bottom: 0, itemWidth: 10, itemHeight: 10, textStyle: { color: theme.muted, fontSize: 10 } },
      series: [{
        name: "站点类型",
        type: "pie",
        radius: ["44%", "68%"],
        center: ["50%", "42%"],
        avoidLabelOverlap: true,
        label: { color: theme.ink, fontSize: 11, formatter: "{b}\n{d}%" },
        labelLine: { lineStyle: { color: theme.lineStrong } },
        data: [
          { name: "站场", value: mix.station },
          { name: "阀室", value: mix.valve }
        ]
      }]
    };
  }

  // ---------- issueByDiscipline()：gas/oil 两条管路的问题占比（横向柱状图） ----------
  function issueByDiscipline() {
    var theme = requireTheme();
    var rows = requireSeries("issueByDiscipline()").issueByDiscipline();
    if (!rows.length) throw new Error("[ChartOptions] issueByDiscipline() 需要至少一项");

    return {
      grid: { left: 96, right: 44, top: 8, bottom: 8 },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: function (params) {
          var row = rows[params[0].dataIndex];
          return row.label + "：" + row.issueCount + " / " + row.total + " 项异常或关注";
        }
      },
      xAxis: {
        type: "value",
        axisLabel: { color: theme.muted, fontSize: 10 },
        splitLine: { lineStyle: { color: theme.lineStrong } }
      },
      yAxis: {
        type: "category",
        data: rows.map(function (row) { return row.discipline === "gas" ? "输气专业" : "输油专业"; }),
        axisLabel: { color: theme.ink, fontSize: 11 },
        axisLine: { lineStyle: { color: theme.lineStrong } }
      },
      series: [{
        type: "bar",
        barWidth: 16,
        data: rows.map(function (row, index) {
          return { value: row.issueCount, itemStyle: { color: index === 0 ? theme.accent2 : theme.accent } };
        })
      }]
    };
  }

  // ---------- zoneCoverageRows()：各作业区巡检覆盖率（横向柱状图） ----------
  function zoneCoverageRows() {
    var theme = requireTheme();
    var rows = requireSeries("zoneCoverageRows()").zoneCoverageRows().filter(function (row) {
      return row.coverageRate !== null;
    });
    if (!rows.length) throw new Error("[ChartOptions] zoneCoverageRows() 需要至少一行有效数据");

    return {
      grid: { left: 76, right: 44, top: 8, bottom: 8 },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: function (params) {
          var row = rows[params[0].dataIndex];
          return row.name + "：覆盖率 " + row.coverageRate + "%";
        }
      },
      xAxis: {
        type: "value",
        min: 0,
        max: 100,
        axisLabel: { color: theme.muted, fontSize: 10, formatter: "{value}%" },
        splitLine: { lineStyle: { color: theme.lineStrong } }
      },
      yAxis: {
        type: "category",
        data: rows.map(function (row) { return row.name.replace("作业区", ""); }),
        axisLabel: { color: theme.ink, fontSize: 10 },
        axisLine: { lineStyle: { color: theme.lineStrong } }
      },
      series: [{
        type: "bar",
        barWidth: 10,
        data: rows.map(function (row) { return { value: row.coverageRate, itemStyle: { color: theme.accent } }; })
      }]
    };
  }

  // ---------- inspectionCoverageTrend()：近 7 日巡检完成率趋势（无轴迷你折线可复用 spark） ----------
  function inspectionCoverageTrend() {
    var theme = requireTheme();
    var rows = requireSeries("inspectionCoverageTrend()").inspectionCoverageTrend();
    if (!rows.length) throw new Error("[ChartOptions] inspectionCoverageTrend() 需要至少一行数据");

    return {
      grid: { left: 40, right: 16, top: 20, bottom: 24 },
      tooltip: {
        trigger: "axis",
        formatter: function (params) {
          var row = rows[params[0].dataIndex];
          return row.day + "：完成率 " + row.completionRate + "%";
        }
      },
      xAxis: {
        type: "category",
        data: rows.map(function (row) { return row.day; }),
        axisLabel: { color: theme.muted, fontSize: 10 },
        axisLine: { lineStyle: { color: theme.lineStrong } }
      },
      yAxis: {
        type: "value",
        min: 50,
        max: 100,
        axisLabel: { color: theme.muted, fontSize: 10, formatter: "{value}%" },
        splitLine: { lineStyle: { color: theme.lineStrong } }
      },
      series: [{
        type: "line",
        smooth: true,
        symbol: "circle",
        symbolSize: 5,
        data: rows.map(function (row) { return row.completionRate; }),
        lineStyle: { color: theme.accent, width: 2 },
        itemStyle: { color: theme.accent },
        areaStyle: { color: theme.accent, opacity: 0.12 }
      }]
    };
  }

  window.ChartOptions = {
    zoneStatusMix: zoneStatusMix,
    siteKindMix: siteKindMix,
    issueByDiscipline: issueByDiscipline,
    zoneCoverageRows: zoneCoverageRows,
    inspectionCoverageTrend: inspectionCoverageTrend
  };
})();
