// 纯函数 ECharts option 构造器：window.ChartOptions（L4 core，早于 scripts/scenes/*，
// 晚于 scripts/data/series.js）。本文件不碰 DOM、不 new echarts——只把
// window.HunanSeries 的数据 + CSS 主题色拼成 option 对象。
//
// 【POC：hunan-inspection-overview（巡检站总览）】
// 【2026-08 精简】本文件曾有 5 个构造器，其中 zoneStatusMix / siteKindMix /
// qualityExceptionMix 三个从来没有被任何场景调用过（scripts/scenes/overview.js 只
// draw 了 zoneCoverageRows 与 inspectionCoverageTrend 两张图）。这三个已整体删除，
// 不留占位、不做兼容——留着没有调用者的构造器，只会让后来的人以为存在更多条合法的
// 画图路径。同批删除的还有它们专用的 statusColor() 与 STATUS_KEYS/THEME_KEYS 两个
// 常量。新版总览（poc/inspection-demo/hunan-overview-v2/scripts/core/chartopts.js）
// 有自己独立的一份构造器，与本文件无引用关系。不写死任何色值：
// 颜色全部现读 getComputedStyle(document.documentElement)，两块屏各自的青蓝/暖琥珀
// 基调因此自动生效，不在本文件里另写一套色板（这是任务硬约束）。不引入 ECharts 地图
// 组件——省域地图由 Three.js 负责，这里只画统计图表。
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
      lineStrong: cssVar("--line-strong")
    };
  }

  function requireTheme() {
    if (!THEME) THEME = readTheme();
    return THEME;
  }

  function requireSeries(fnName) {
    if (!window.HunanSeries) {
      throw new Error("[ChartOptions] " + fnName + " 需要 window.HunanSeries，请检查 scripts/data/series.js 是否已加载");
    }
    return window.HunanSeries;
  }

  // ---------- zoneCoverageRows()：各作业区巡检覆盖率（横向柱状图） ----------
  function zoneCoverageRows() {
    var theme = requireTheme();
    var rows = requireSeries("zoneCoverageRows()").zoneCoverageRows().filter(function (row) {
      return row.coverageRate !== null;
    });
    if (!rows.length) throw new Error("[ChartOptions] zoneCoverageRows() 需要至少一行有效数据");

    return {
      grid: { left: 76, right: 56, top: 8, bottom: 8 },
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
        label: {
          show: true,
          position: "right",
          formatter: "{c}%",
          color: theme.ink,
          fontSize: 10
        },
        data: rows.map(function (row) { return { value: row.coverageRate, itemStyle: { color: theme.accent } }; })
      }]
    };
  }

  // ---------- inspectionCoverageTrend()：巡检完成率趋势（日期范围为演示口径） ----------
  function inspectionCoverageTrend(options) {
    var theme = requireTheme();
    var rows = requireSeries("inspectionCoverageTrend()").inspectionCoverageTrend(options);
    if (!rows.length) throw new Error("[ChartOptions] inspectionCoverageTrend() 需要至少一行数据");
    var labelInterval = rows.length > 16 ? 4 : (rows.length > 10 ? 2 : 0);

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
        axisLabel: { color: theme.muted, fontSize: 10, interval: labelInterval },
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
    zoneCoverageRows: zoneCoverageRows,
    inspectionCoverageTrend: inspectionCoverageTrend
  };
})();
