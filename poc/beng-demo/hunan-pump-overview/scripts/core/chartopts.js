// 纯函数 ECharts option 构造器：window.ChartOptions（L4 core，早于 scripts/scenes/*，
// 晚于 scripts/data/series.js）。本文件不碰 DOM、不 new echarts——只把
// window.HunanSeries 的数据 + CSS 主题色拼成 option 对象。
//
// 【POC：hunan-pump-overview（泵站总览）】
// 本文件与 poc/hunan-inspection-overview/scripts/core/chartopts.js 是姐妹文件但内容
// 不同：两份文件都实现 zoneStatusMix/siteKindMix（两块屏"共有"的方法），但各自独有
// 的构造器不同——本文件是 pipelineProfile/pumpHealthRank/throughputRows（对应成品油
// 泵站语义），姐妹文件换成 issueByDiscipline/zoneCoverageRows/inspectionCoverageTrend
// （对应巡检语义）。不写死任何色值：颜色全部现读
// getComputedStyle(document.documentElement)，本 POC 企业蓝基调因此自动生效。不引入
// ECharts 地图组件——省域地图由 Three.js 负责，这里只画统计图表。
(function () {
  "use strict";

  var THEME = null;
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

  // ---------- zoneStatusMix()：作业区状态堆叠柱（成品油网络覆盖到的 6 个作业区，
  // total=0 的 4 个作业区 ok/warn/danger 均为 0，柱子高度自然为 0，不特殊处理） ----------
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

  // ---------- pipelineProfile()：沿线压力剖面（里程 km vs 压力 MPa 折线，标出泵站） ----------
  function pipelineProfile() {
    var theme = requireTheme();
    var profile = requireSeries("pipelineProfile()").pipelineProfile();
    if (!profile.mainLine.length) throw new Error("[ChartOptions] pipelineProfile() 需要至少一个主线站场");

    return {
      grid: { left: 44, right: 20, top: 20, bottom: 30 },
      tooltip: {
        trigger: "axis",
        formatter: function (params) {
          var row = profile.mainLine[params[0].dataIndex];
          return row.name + "：" + row.km + "km · " + row.pressure + "MPa" + (row.pumpStation ? "（泵站）" : "");
        }
      },
      xAxis: {
        type: "category",
        data: profile.mainLine.map(function (row) { return row.name; }),
        axisLabel: { color: theme.muted, fontSize: 10, interval: 0, rotate: 30 },
        axisLine: { lineStyle: { color: theme.lineStrong } }
      },
      yAxis: {
        type: "value",
        name: profile.pressureUnit,
        axisLabel: { color: theme.muted, fontSize: 10 },
        splitLine: { lineStyle: { color: theme.lineStrong } }
      },
      series: [{
        type: "line",
        smooth: true,
        data: profile.mainLine.map(function (row) {
          return { value: row.pressure, itemStyle: { color: row.pumpStation ? theme.danger : theme.accent } };
        }),
        lineStyle: { color: theme.accent, width: 2 },
        areaStyle: { color: theme.accent, opacity: 0.12 },
        symbolSize: function (value, params) {
          return profile.mainLine[params.dataIndex].pumpStation ? 9 : 5;
        }
      }]
    };
  }

  // ---------- pumpHealthRank()：泵站健康度排名（横向柱状图） ----------
  function pumpHealthRank() {
    var theme = requireTheme();
    var rows = requireSeries("pumpHealthRank()").pumpHealthRank();
    if (!rows.length) throw new Error("[ChartOptions] pumpHealthRank() 需要至少一行数据");

    return {
      grid: { left: 76, right: 30, top: 8, bottom: 8 },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: function (params) {
          var row = rows[params[0].dataIndex];
          return row.name + "：健康分 " + row.score;
        }
      },
      xAxis: {
        type: "value",
        min: 0,
        max: 100,
        axisLabel: { color: theme.muted, fontSize: 10 },
        splitLine: { lineStyle: { color: theme.lineStrong } }
      },
      yAxis: {
        type: "category",
        data: rows.map(function (row) { return row.name; }),
        axisLabel: { color: theme.ink, fontSize: 10 },
        axisLine: { lineStyle: { color: theme.lineStrong } }
      },
      series: [{
        type: "bar",
        barWidth: 10,
        data: rows.map(function (row) { return { value: row.score, itemStyle: { color: statusColor(theme, row.status) } }; })
      }]
    };
  }

  // ---------- throughputRows()：各段日输量（横向柱状图） ----------
  function throughputRows() {
    var theme = requireTheme();
    var rows = requireSeries("throughputRows()").throughputRows();
    if (!rows.length) throw new Error("[ChartOptions] throughputRows() 需要至少一行数据");

    return {
      grid: { left: 76, right: 44, top: 8, bottom: 8 },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: function (params) {
          var row = rows[params[0].dataIndex];
          return row.name + "：" + row.dailyThroughput + " 万吨/日 · 管容利用率 " + row.utilizationPct + "%";
        }
      },
      xAxis: {
        type: "value",
        name: "万吨/日",
        axisLabel: { color: theme.muted, fontSize: 10 },
        splitLine: { lineStyle: { color: theme.lineStrong } }
      },
      yAxis: {
        type: "category",
        data: rows.map(function (row) { return row.name; }),
        axisLabel: { color: theme.ink, fontSize: 10 },
        axisLine: { lineStyle: { color: theme.lineStrong } }
      },
      series: [{
        type: "bar",
        barWidth: 14,
        data: rows.map(function (row) { return { value: row.dailyThroughput, itemStyle: { color: theme.accent } }; })
      }]
    };
  }

  window.ChartOptions = {
    zoneStatusMix: zoneStatusMix,
    siteKindMix: siteKindMix,
    pipelineProfile: pipelineProfile,
    pumpHealthRank: pumpHealthRank,
    throughputRows: throughputRows
  };
})();
