// 纯函数 ECharts option 构造器：window.ChartOptions。本文件不碰 DOM、不 new
// echarts、不读 getComputedStyle——只把"数据 + 主题色"拼成 option 对象返回，
// 可以在纯 Node 环境里单测。
//
// 依赖顺序：本文件读取 window.DemoSeries（不重新聚合任何数字，五个函数分别
// 直接消费 areaProgressRows()/itemTypeMix()/disciplineMix()/durationByArea()
// 的返回值），按分层规则属于 L4 core，只能引用严格更早层（L2 数据层）暴露的
// 全局，不引用 scripts/core/charts.js（同层）。
//
// 配色只有一份真源：THEME 必须由外部调用 ChartOptions.setTheme() 注入，本文件
// 不在 JS 里另写一份色值。boot.js 在启动时读一次 getComputedStyle(documentElement)
// 的 CSS 变量并调用 setTheme()——三色语义（ok/warn/danger）必须与
// styles/01-tokens.css 的 --status-ok/--status-warn/--status-danger 同一份口径。
(function () {
  "use strict";

  var ChartOptions = {};
  ChartOptions.THEME = null;

  var THEME_KEYS = ["ok", "warn", "danger", "cyan", "muted", "ink", "lineStrong"];
  var STATUS_KEYS = ["ok", "warn", "danger"];

  function setTheme(theme) {
    if (!theme) throw new Error("[ChartOptions] setTheme() 需要一个主题对象");
    THEME_KEYS.forEach(function (key) {
      if (theme[key] == null) throw new Error("[ChartOptions] setTheme() 缺少必需字段: " + key);
    });
    ChartOptions.THEME = theme;
  }

  function requireTheme() {
    if (!ChartOptions.THEME) throw new Error("[ChartOptions] THEME 尚未初始化，请先调用 ChartOptions.setTheme()");
    return ChartOptions.THEME;
  }

  function requireDemoSeries(fnName) {
    if (!window.DemoSeries) {
      throw new Error("[ChartOptions] " + fnName + " 需要 window.DemoSeries，请检查 scripts/data/series.js 是否已加载");
    }
    return window.DemoSeries;
  }

  function statusColor(theme, status) {
    if (STATUS_KEYS.indexOf(status) < 0) {
      throw new Error("[ChartOptions] 非法 status: " + status + "，应 ∈ [" + STATUS_KEYS.join(", ") + "]");
    }
    return theme[status];
  }

  // ---------- areaProgressBars()：12 区完成率横条（横向柱状图） ----------
  //
  // 数据模型没有"待巡检"中间态（见 series.js 文件头注释），ratio 恒为 1——12 条
  // 横条因此长度全部到顶，图表要传达的信息落在颜色（哪个区有问题）和 tooltip 里
  // 的 done/total（各区体量差异，如机柜间 67 项 vs 放空区 7 项），而不是长度本身。
  function areaProgressBars() {
    var theme = requireTheme();
    var rows = requireDemoSeries("areaProgressBars()").areaProgressRows();
    if (!rows.length) throw new Error("[ChartOptions] areaProgressBars() 需要至少一行数据");

    return {
      grid: { left: 76, right: 44, top: 8, bottom: 8 },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: function (params) {
          var p = params[0];
          var row = rows[p.dataIndex];
          return row.name + "：" + row.done + "/" + row.total + " 已提交";
        }
      },
      xAxis: {
        type: "value",
        min: 0,
        max: 100,
        axisLabel: { color: theme.muted, formatter: "{value}%" },
        splitLine: { lineStyle: { color: theme.lineStrong } }
      },
      yAxis: {
        type: "category",
        data: rows.map(function (row) { return row.name; }),
        axisLabel: { color: theme.ink },
        axisLine: { lineStyle: { color: theme.lineStrong } }
      },
      series: [{
        type: "bar",
        barWidth: 12,
        data: rows.map(function (row) {
          return { value: Math.round(row.ratio * 100), itemStyle: { color: statusColor(theme, row.status) } };
        })
      }]
    };
  }

  // ---------- itemTypeMix()：bool / number 两类巡检项占比（环形图） ----------
  function itemTypeMix() {
    var theme = requireTheme();
    var mix = requireDemoSeries("itemTypeMix()").itemTypeMix();
    if (mix.total <= 0) throw new Error("[ChartOptions] itemTypeMix() 的 total 必须大于 0");

    return {
      color: [theme.cyan, theme.warn],
      tooltip: { trigger: "item" },
      legend: { bottom: 0, textStyle: { color: theme.muted } },
      series: [{
        name: "巡检项型分布",
        type: "pie",
        radius: ["46%", "70%"],
        center: ["50%", "44%"],
        avoidLabelOverlap: true,
        label: { color: theme.ink, formatter: "{b}\n{d}%" },
        labelLine: { lineStyle: { color: theme.lineStrong } },
        data: [
          { name: "布尔型", value: mix.bool },
          { name: "数值型", value: mix.number }
        ]
      }]
    };
  }

  // ---------- disciplineMix()：专业分布（横向柱状图，按数量从多到少排序） ----------
  function disciplineMix() {
    var theme = requireTheme();
    var rows = requireDemoSeries("disciplineMix()").disciplineMix();
    if (!rows.length) throw new Error("[ChartOptions] disciplineMix() 需要至少一项");
    var palette = [theme.cyan, theme.ok, theme.warn, theme.danger, theme.muted];

    return {
      grid: { left: 84, right: 44, top: 8, bottom: 8 },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: function (params) {
          var p = params[0];
          var row = rows[p.dataIndex];
          return row.discipline + "：" + row.count + " 项（" + Math.round(row.ratio * 100) + "%）";
        }
      },
      xAxis: {
        type: "value",
        axisLabel: { color: theme.muted },
        splitLine: { lineStyle: { color: theme.lineStrong } }
      },
      yAxis: {
        type: "category",
        data: rows.map(function (row) { return row.discipline; }),
        axisLabel: { color: theme.ink },
        axisLine: { lineStyle: { color: theme.lineStrong } }
      },
      series: [{
        type: "bar",
        barWidth: 12,
        data: rows.map(function (row, index) {
          return { value: row.count, itemStyle: { color: palette[index % palette.length] } };
        })
      }]
    };
  }

  // ---------- durationByArea()：巡检耗时曲线（12 区累计耗时折线） ----------
  //
  // rows 顺序 = Map3DContract.AREA_IDS，minutes 是该区自身耗时，cumulativeMinutes
  // 是巡检动线走到该区末尾时的累计耗时（与 scripts/data/track.js 的轨迹动画共用
  // 同一份 DemoSeries.patrolMinutes() 算法，见该文件头部"权威来源"注释）。
  function durationByArea() {
    var theme = requireTheme();
    var rows = requireDemoSeries("durationByArea()").durationByArea();
    if (!rows.length) throw new Error("[ChartOptions] durationByArea() 需要至少一行数据");

    return {
      grid: { left: 44, right: 20, top: 28, bottom: 30 },
      tooltip: {
        trigger: "axis",
        formatter: function (params) {
          var row = rows[params[0].dataIndex];
          return row.name + "：本区 " + row.minutes + " 分钟，累计 " + row.cumulativeMinutes + " 分钟";
        }
      },
      legend: { top: 0, right: 0, textStyle: { color: theme.muted } },
      xAxis: {
        type: "category",
        data: rows.map(function (row) { return row.name; }),
        axisLabel: { color: theme.muted, interval: 0, rotate: 30 },
        axisLine: { lineStyle: { color: theme.lineStrong } }
      },
      yAxis: {
        type: "value",
        name: "分钟",
        axisLabel: { color: theme.muted },
        splitLine: { lineStyle: { color: theme.lineStrong } }
      },
      series: [
        { name: "本区耗时", type: "bar", barWidth: 14, data: rows.map(function (row) { return row.minutes; }) },
        {
          name: "累计耗时", type: "line", smooth: true,
          data: rows.map(function (row) { return row.cumulativeMinutes; }),
          lineStyle: { color: theme.cyan, width: 2 },
          itemStyle: { color: theme.cyan }
        }
      ]
    };
  }

  // ---------- spark(series)：无轴迷你折线 ----------
  //
  // series 是一个纯数字数组（如 DemoSeries.areaSpark(areaId) 的返回值：单调从
  // 1/total 升到 1 的累计完成比），只画一条线，不引入坐标轴、图例等视觉元素。
  function spark(series) {
    if (!Array.isArray(series) || series.length === 0) {
      throw new Error("[ChartOptions] spark() 需要一个非空数字数组");
    }
    var theme = requireTheme();
    return {
      grid: { left: 4, right: 4, top: 8, bottom: 8 },
      xAxis: { type: "category", show: false, data: series.map(function (_, i) { return i; }) },
      yAxis: { type: "value", show: false },
      series: [{
        type: "line",
        smooth: true,
        symbol: "none",
        data: series,
        lineStyle: { color: theme.cyan, width: 2 }
      }]
    };
  }

  ChartOptions.setTheme = setTheme;
  ChartOptions.areaProgressBars = areaProgressBars;
  ChartOptions.itemTypeMix = itemTypeMix;
  ChartOptions.disciplineMix = disciplineMix;
  ChartOptions.durationByArea = durationByArea;
  ChartOptions.spark = spark;

  window.ChartOptions = ChartOptions;
})();
