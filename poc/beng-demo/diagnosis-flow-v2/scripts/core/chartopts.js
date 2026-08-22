// 纯函数 ECharts option 构造器：window.ChartOptions。不碰 DOM、不 new echarts。
//
// 两个构造器：证据台的振动趋势大图，以及复核页那张同口径的 mini 图。
// 与参照物同一结构，只是把「压力 + 两条报警线」换成「振动 + 四条 ISO 档界」。
//
// 【为什么是四条档界而不是两条阈值线】参照物那边有站控的高报/高高报两个数，画两条虚线
// 就够。泵这边站控阈值在台账里没填（全省 40 台皆然），只能用 ISO 10186-3 的行业分级，
// 而那是**四个档位**：A<2.3 / B 2.3~4.5 / C 4.5~7.1 / D≥7.1。所以画法也不同：
// 用背景色带表达四个档，而不是两条线 —— 档是区间，线是阈值，混用会让人以为 7.1 是报警值。
//
// 颜色现读 getComputedStyle(document.documentElement)，不写死色值。
(function () {
  "use strict";

  var THEME = null;

  function readTheme() {
    var computed = getComputedStyle(document.documentElement);
    function cssVar(name) {
      var v = computed.getPropertyValue(name).trim();
      if (!v) throw new Error("[ChartOptions] 缺少 CSS 变量 " + name + "，请检查 styles/01-tokens.css");
      return v;
    }
    return {
      accent: cssVar("--accent"), accent2: cssVar("--accent-2"),
      ok: cssVar("--status-ok"), warn: cssVar("--status-warn"), danger: cssVar("--status-danger"),
      muted: cssVar("--muted"), ink: cssVar("--ink"),
      line: cssVar("--line"), lineStrong: cssVar("--line-strong")
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
      backgroundColor: "rgba(8, 12, 30, 0.94)", borderColor: t.lineStrong, borderWidth: 1,
      padding: [7, 10], textStyle: { color: t.ink, fontSize: 12 }
    };
    Object.keys(extra || {}).forEach(function (k) { base[k] = extra[k]; });
    return base;
  }

  // ISO 10186-3 的四个档位。tone 决定色带与档标的颜色。
  var ISO_BANDS = [
    { grade: "A", label: "优", from: 0, to: 2.3, tone: "ok" },
    { grade: "B", label: "良", from: 2.3, to: 4.5, tone: "ok" },
    { grade: "C", label: "中", from: 4.5, to: 7.1, tone: "warn" },
    { grade: "D", label: "劣", from: 7.1, to: Infinity, tone: "danger" }
  ];

  function gradeOf(value) {
    var hit = ISO_BANDS.filter(function (b) { return value >= b.from && value < b.to; })[0];
    if (!hit) throw new Error("[ChartOptions] 无法给 " + value + " 定档");
    return hit;
  }

  // 档位色带。只画与当前 y 轴范围有交集的那些档 —— 曲线在 8~12 之间时，
  // 把 A/B 两个档也画出来会让 D 档被压成一条细缝。
  function bandArea(t, lo, hi) {
    var data = ISO_BANDS.filter(function (b) {
      return b.to > lo && b.from < hi;
    }).map(function (b) {
      var top = isFinite(b.to) ? Math.min(b.to, hi) : hi;
      return [
        { yAxis: Math.max(b.from, lo), itemStyle: { color: bandColor(t, b.tone) } },
        { yAxis: top }
      ];
    });
    return { silent: true, data: data };
  }

  function bandColor(t, tone) {
    if (tone === "danger") return "rgba(255, 98, 92, 0.09)";
    if (tone === "warn") return "rgba(238, 180, 74, 0.08)";
    return "rgba(48, 198, 157, 0.06)";
  }

  // ---------- vibrationTrend(pointId, rangeKey, opts) ----------
  //
  // y 轴不从 0 起：取值落在 8.2~12.1 之间，0 起点会把曲线压成贴底的一条直线。
  // 但**下界不能高于 7.1**，否则 D 档那条界线出不了画面，"全程在 D 档"这句话就没有落点。
  function vibrationTrend(pointId, rangeKey, opts) {
    var t = theme();
    var STATION = need("DOMAIN_STATION");
    var SERIES = need("DOMAIN_SERIES");
    var point = STATION.pointById(pointId);
    var rows = SERIES.series(pointId, rangeKey);
    var mini = !!(opts && opts.mini);

    var values = rows.map(function (r) { return r.value; });
    var vMin = Math.min.apply(null, values);
    var vMax = Math.max.apply(null, values);
    // 下界压到 D 档界（7.1）以下一点，让那条界线连同它下方的 C 档色带都能被看见。
    var lo = Math.floor(Math.min(vMin - 0.4, point.dangerAt - 0.6) * 10) / 10;
    var hi = Math.ceil((vMax + 0.5) * 10) / 10;

    return {
      grid: mini
        ? { left: 40, right: 14, top: 14, bottom: 22 }
        : { left: 56, right: 26, top: 26, bottom: 34 },
      tooltip: darkTooltip(t, {
        trigger: "axis",
        formatter: function (params) {
          var row = rows[params[0].dataIndex];
          var g = gradeOf(row.value);
          return row.at + "<br/>" + row.value.toFixed(2) + point.unit
            + "<br/><span style=\"opacity:.7\">ISO " + g.grade + " 档 · " + g.label + "</span>";
        }
      }),
      xAxis: {
        type: "category",
        // 只留 时:分:秒 里的 时:分 —— 141 个点全画秒会糊成一团。
        data: rows.map(function (r) { return r.at.slice(11, 16); }),
        boundaryGap: false,
        axisLabel: { color: t.muted, fontSize: mini ? 10 : 12, interval: "auto", hideOverlap: true },
        axisLine: { lineStyle: { color: t.line } },
        axisTick: { show: false }
      },
      yAxis: {
        type: "value", min: lo, max: hi,
        name: mini ? "" : point.unit,
        nameTextStyle: { color: t.muted, fontSize: 12, align: "right" },
        axisLabel: { color: t.muted, fontSize: mini ? 10 : 12 },
        splitLine: { lineStyle: { color: t.line } }
      },
      series: [{
        type: "line", smooth: false, symbol: "none",
        data: values,
        lineStyle: { color: t.danger, width: mini ? 1.6 : 2.2 },
        itemStyle: { color: t.danger },
        areaStyle: { color: t.danger, opacity: 0.10 },
        // 末点标出来 —— 它是"现在多少"，讲解时要指着它。
        markPoint: mini ? undefined : {
          symbol: "circle", symbolSize: 9,
          itemStyle: { color: t.danger, borderColor: "#05060f", borderWidth: 2 },
          label: {
            show: true, position: "left", distance: 12,
            color: t.ink, fontSize: 13, fontWeight: 700,
            formatter: point.fieldReading.toFixed(1) + point.unit + "（ISO D 档）"
          },
          data: [{ coord: [rows.length - 1, rows[rows.length - 1].value] }]
        },
        // 档界线：只画落在视野里的那几条，并标上档名 + 数值 + 它是什么。
        markLine: {
          silent: true, symbol: "none",
          label: {
            show: !mini, position: "insideEndTop", color: t.muted, fontSize: 12,
            formatter: function (p) { return p.data.note; }
          },
          data: ISO_BANDS.filter(function (b) {
            return isFinite(b.to) && b.to > lo && b.to < hi;
          }).map(function (b) {
            var next = ISO_BANDS[ISO_BANDS.indexOf(b) + 1];
            return {
              yAxis: b.to,
              note: b.grade + "/" + next.grade + " 界 " + b.to,
              lineStyle: {
                color: next.tone === "danger" ? t.danger : t.warn,
                type: "dashed", width: 1.3
              }
            };
          })
        },
        markArea: bandArea(t, lo, hi)
      }]
    };
  }

  window.ChartOptions = { vibrationTrend: vibrationTrend, gradeOf: gradeOf, isoBands: ISO_BANDS };
})();
