// 纯函数 ECharts option 构造器：window.ChartOptions。不碰 DOM、不 new echarts。
//
// 本 POC 只有两个构造器：出口管线压力的时序曲线（含两条阈值线 + 越线阴影），以及复核
// 页那张同口径的 mini 图。旧目录的 chartopts.js 有 197 行、多个构造器，那是因为旧版给
// 每条记录都硬配了曲线；本版只有 1 条记录是数值型（详见 domain/04-records.js 文件头）。
//
// 颜色现读 getComputedStyle(document.documentElement)，不写死色值 —— 与
// styles/01-tokens.css 的三色语义保持单一真源。
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

  function theme() {
    if (!THEME) THEME = readTheme();
    return THEME;
  }

  function need(name) {
    if (!window[name]) throw new Error("[ChartOptions] 需要先加载 " + name);
    return window[name];
  }

  function darkTooltip(t, extra) {
    var base = {
      backgroundColor: "rgba(8, 12, 30, 0.94)",
      borderColor: t.lineStrong,
      borderWidth: 1,
      padding: [7, 10],
      textStyle: { color: t.ink, fontSize: 13 }
    };
    Object.keys(extra || {}).forEach(function (k) { base[k] = extra[k]; });
    return base;
  }

  // ---------- pressureTrend(pointId, rangeKey, opts) ----------
  //
  // 两条阈值线（高报警 warnAt / 高高报警 dangerAt）+ 高报警以上的越线阴影。
  // 越线阴影用 markArea 而不是第二条 series：series 会进图例、也会被 tooltip 命中，
  // 而它表达的是"这一段落在报警区间里"，不是一组数据。
  //
  // y 轴不从 0 起：取值落在 8.4~9.3 之间，0 起点会把曲线压成贴底的一条直线，
  // 两条阈值线也会挤在一起看不出上下关系。截断刻度的代价是落差被放大 —— 所以
  // 两条阈值线都画上并标注数值，读者能自己校准。
  function pressureTrend(pointId, rangeKey, opts) {
    var t = theme();
    var STATION = need("DOMAIN_STATION");
    var SERIES = need("DOMAIN_SERIES");
    var point = STATION.pointById(pointId);
    var rows = SERIES.series(pointId, rangeKey);
    var mini = !!(opts && opts.mini);

    // y 轴上下界：把两条阈值线和整条曲线都包进来，再各留一点余量。
    var values = rows.map(function (r) { return r.value; });
    var lo = Math.min.apply(null, values.concat([point.warnAt]));
    var hi = Math.max.apply(null, values.concat([point.dangerAt]));
    var pad = (hi - lo) * 0.12;

    return {
      grid: mini
        ? { left: 42, right: 14, top: 14, bottom: 22 }
        : { left: 58, right: 26, top: 26, bottom: 34 },
      tooltip: darkTooltip(t, {
        trigger: "axis",
        formatter: function (params) {
          var row = rows[params[0].dataIndex];
          var over = row.value >= point.dangerAt ? "已越高高报警"
            : (row.value >= point.warnAt ? "已越高报警" : "正常区间");
          return row.at + "<br/>" + row.value.toFixed(2) + point.unit +
            "<br/><span style=\"opacity:.65\">" + over + "</span>";
        }
      }),
      xAxis: {
        type: "category",
        data: rows.map(function (r) { return r.at.slice(11); }),
        boundaryGap: false,
        axisLabel: {
          color: t.muted,
          fontSize: mini ? 10 : 12,
          // 点数 72~180，标签全画会糊成一团。让 ECharts 自己按可用宽度抽稀。
          interval: "auto",
          hideOverlap: true
        },
        axisLine: { lineStyle: { color: t.line } },
        axisTick: { show: false }
      },
      yAxis: {
        type: "value",
        min: Math.floor((lo - pad) * 10) / 10,
        max: Math.ceil((hi + pad) * 10) / 10,
        axisLabel: { color: t.muted, fontSize: mini ? 10 : 12, formatter: "{value}" },
        name: mini ? "" : point.unit,
        nameTextStyle: { color: t.muted, fontSize: 12, align: "right" },
        splitLine: { lineStyle: { color: t.line } }
      },
      series: [{
        type: "line",
        smooth: false,
        symbol: "none",
        // 末点单独标出来 —— 它就是记录里人工填的现场读数，讲解时要指着它。
        markPoint: mini ? undefined : {
          symbol: "circle",
          symbolSize: 9,
          itemStyle: { color: t.danger, borderColor: "#05060f", borderWidth: 2 },
          label: {
            show: true,
            position: "top",
            distance: 10,
            color: t.ink,
            fontSize: 13,
            fontWeight: 700,
            formatter: point.fieldReading.toFixed(1) + point.unit
          },
          data: [{ coord: [rows.length - 1, rows[rows.length - 1].value] }]
        },
        data: values,
        lineStyle: { color: t.accent, width: mini ? 1.6 : 2.2 },
        itemStyle: { color: t.accent },
        areaStyle: { color: t.accent, opacity: 0.10 },
        markLine: {
          silent: true,
          symbol: "none",
          label: {
            show: !mini,
            position: "insideEndTop",
            color: t.muted,
            fontSize: 12,
            formatter: function (p) { return p.name + " " + p.value.toFixed(1) + point.unit; }
          },
          data: [
            { name: "高报警", yAxis: point.warnAt, lineStyle: { color: t.warn, type: "dashed", width: 1.4 } },
            { name: "高高报警", yAxis: point.dangerAt, lineStyle: { color: t.danger, type: "dashed", width: 1.4 } }
          ]
        },
        // 高报警线以上整条横带染色：表达"这一段在报警区间里"。
        markArea: {
          silent: true,
          itemStyle: { color: "rgba(238, 180, 74, 0.10)" },
          data: [[{ yAxis: point.warnAt }, { yAxis: point.dangerAt }]]
        }
      }]
    };
  }

  window.ChartOptions = { pressureTrend: pressureTrend };
})();
