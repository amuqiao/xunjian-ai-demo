// ECharts option 构造器：纯函数，输入 DOMAIN_SERIES.series() 的返回值，输出 option。
// 不读 state、不读领域数据、不碰 DOM——这样它可以在 Node 里被 verify 脚本直接调用。
//
// 只有两个构造器：
//   trend(seriesList)  完整曲线：坐标轴 / 刻度 / 图例 / 阈值线 / 越线阴影
//   spark(s)           迷你曲线：无轴、无刻度，只有走势和一条阈值虚线
//
// 硬校验一律抛错、不兜底：option 构造错了通常表现为"图是空白的"或"画出来但数字不对"，
// 两者都不会自己报错。宁可在这里炸。
window.ChartOptions = (function () {
  "use strict";

  var COLORS = {
    danger: "#ff5c6c",
    warn: "#ffb454",
    ok: "#3ddc97"
  };
  var AXIS = "rgba(255,255,255,0.38)";
  var SPLIT = "rgba(255,255,255,0.08)";

  function assertSeries(s, where) {
    if (!s || typeof s !== "object") throw new Error(where + " 需要一个 series 对象");
    if (!Array.isArray(s.dates) || !Array.isArray(s.values)) {
      throw new Error(where + " 的 series 缺少 dates/values 数组");
    }
    if (s.dates.length !== s.values.length) {
      throw new Error(where + " 的 dates 与 values 长度不一致：" + s.dates.length + " vs " + s.values.length);
    }
    if (!s.dates.length) throw new Error(where + " 的 series 为空");
    if (typeof s.threshold !== "number") throw new Error(where + " 的 series 缺少数值型 threshold");
    if (s.safeSide !== "above" && s.safeSide !== "below") {
      throw new Error(where + " 的 series.safeSide 只能是 above/below，实际为 " + s.safeSide);
    }
    if (!COLORS[s.status]) throw new Error(where + " 的 series.status 非法：" + s.status);
  }

  function colorOf(s) {
    return COLORS[s.status];
  }

  // 轴范围显式算出来，不交给 ECharts 的 scale:true 自动推。
  //
  // 这里踩过一次：markArea 原来写成 [{yAxis: threshold}, {yAxis: "max"}]，"max" 不是
  // markArea 端点的合法取值（它是 markLine/markPoint 的 type 才认的写法），ECharts
  // 没有报错，而是把轴上界撑到一个极大值——曲线被压成贴着 x 轴的一条直线，看起来
  // 像"这个测点整段没有变化"。同一份数据在 spark()（没有 markArea）里显示正常，
  // 两张图对不上才暴露出来。
  //
  // 现在的做法：把数据范围和阈值一起纳入，两端各留 12% 余量，markArea 的端点用这个
  // 算出来的具体数值，不用任何字符串关键字。
  function boundsOf(s) {
    var lo = Math.min.apply(null, s.values);
    var hi = Math.max.apply(null, s.values);
    lo = Math.min(lo, s.threshold);
    hi = Math.max(hi, s.threshold);
    var pad = (hi - lo) * 0.12 || Math.abs(hi) * 0.12 || 1;
    return { min: lo - pad, max: hi + pad };
  }

  function roundBound(value) {
    return Math.round(value * 100) / 100;
  }

  // 越线区域：safeSide 决定阴影画在阈值线的哪一侧。这个方向必须由数据决定，不能写死
  // ——"越大越危险"和"越小越危险"的指标在同一个 demo 里同时存在（振动 vs 完好率），
  // 写死一侧会让其中一半的图把安全区标成危险区，而且不报错。
  function markAreaOf(s, bounds) {
    var from = s.safeSide === "below" ? s.threshold : bounds.min;
    var to = s.safeSide === "below" ? bounds.max : s.threshold;
    return {
      silent: true,
      itemStyle: { color: "rgba(255,92,108,0.10)" },
      data: [[{ yAxis: from }, { yAxis: to }]]
    };
  }

  function markLineOf(s, withLabel) {
    return {
      silent: true,
      symbol: "none",
      lineStyle: { color: "rgba(255,180,84,0.75)", type: "dashed", width: 1 },
      label: withLabel
        ? { formatter: "关注线 " + s.threshold + (s.unit || ""), color: "#ffb454", fontSize: 12, position: "insideEndTop" }
        : { show: false },
      data: [{ yAxis: s.threshold }]
    };
  }

  // 多条 series 共存时，单位不同的那条要走第二根 y 轴，否则量纲差一个数量级的两条线
  // 里会有一条被压成贴着轴的直线——看起来像"这个测点没有变化"。
  function axisIndexOf(seriesList) {
    var units = [];
    seriesList.forEach(function (s) {
      if (units.indexOf(s.unit) < 0) units.push(s.unit);
    });
    if (units.length > 2) {
      throw new Error("ChartOptions.trend 最多支持 2 种单位，当前 " + units.length + " 种：" + units.join("/"));
    }
    return function (s) { return units.indexOf(s.unit); };
  }

  function trend(seriesList) {
    if (!Array.isArray(seriesList) || !seriesList.length) {
      throw new Error("ChartOptions.trend 需要非空的 series 数组");
    }
    seriesList.forEach(function (s, i) { assertSeries(s, "ChartOptions.trend[" + i + "]"); });

    var primary = seriesList[0];
    var indexOf = axisIndexOf(seriesList);
    var units = [];
    seriesList.forEach(function (s) { if (units.indexOf(s.unit) < 0) units.push(s.unit); });

    return {
      backgroundColor: "transparent",
      grid: { left: 52, right: units.length > 1 ? 52 : 18, top: 34, bottom: 30 },
      tooltip: { trigger: "axis", backgroundColor: "rgba(12,18,32,0.94)", borderWidth: 0, textStyle: { color: "#e8eefc" } },
      legend: seriesList.length > 1
        ? { top: 2, right: 4, textStyle: { color: AXIS, fontSize: 12 }, itemWidth: 14, itemHeight: 8 }
        : { show: false },
      xAxis: {
        type: "category",
        data: primary.dates,
        axisLine: { lineStyle: { color: SPLIT } },
        axisLabel: { color: AXIS, fontSize: 11, hideOverlap: true },
        axisTick: { show: false }
      },
      yAxis: units.map(function (unit) {
        // 每根轴的范围由挂在它上面的所有 series 合并算出——两条不同量纲的曲线各走
        // 各的轴，否则量级差一个数量级的那条会被压成贴轴的直线，看起来像"这个测点
        // 没有变化"。
        var onAxis = seriesList.filter(function (s) { return s.unit === unit; });
        var lo = Infinity;
        var hi = -Infinity;
        onAxis.forEach(function (s) {
          var b = boundsOf(s);
          lo = Math.min(lo, b.min);
          hi = Math.max(hi, b.max);
        });
        return {
          type: "value",
          name: unit,
          nameTextStyle: { color: AXIS, fontSize: 11, align: "right" },
          min: roundBound(lo),
          max: roundBound(hi),
          axisLine: { show: false },
          axisLabel: { color: AXIS, fontSize: 11 },
          splitLine: { lineStyle: { color: SPLIT } }
        };
      }),
      series: seriesList.map(function (s, i) {
        var color = colorOf(s);
        return {
          name: s.label,
          type: "line",
          smooth: true,
          symbol: "none",
          yAxisIndex: indexOf(s),
          data: s.values,
          lineStyle: { color: color, width: 2 },
          areaStyle: i === 0
            ? { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1,
                colorStops: [{ offset: 0, color: color + "44" }, { offset: 1, color: color + "00" }] } }
            : undefined,
          markLine: i === 0 ? markLineOf(s, true) : undefined,
          markArea: i === 0 ? markAreaOf(s, boundsOf(s)) : undefined
        };
      })
    };
  }

  function spark(s) {
    assertSeries(s, "ChartOptions.spark");
    var color = colorOf(s);
    var bounds = boundsOf(s);
    return {
      backgroundColor: "transparent",
      grid: { left: 2, right: 2, top: 6, bottom: 2 },
      xAxis: { type: "category", data: s.dates, show: false },
      // 迷你图也用同一套边界：它和大图画的是同一份数据，轴范围不一致会让两张图
      // 的走势看起来不一样。
      yAxis: { type: "value", min: roundBound(bounds.min), max: roundBound(bounds.max), show: false },
      tooltip: { show: false },
      series: [{
        type: "line",
        smooth: true,
        symbol: "none",
        data: s.values,
        lineStyle: { color: color, width: 1.6 },
        areaStyle: { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [{ offset: 0, color: color + "3a" }, { offset: 1, color: color + "00" }] } },
        markLine: markLineOf(s, false)
      }]
    };
  }

  return { trend: trend, spark: spark, COLORS: COLORS };
})();
