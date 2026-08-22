// 纯函数 ECharts option 构造器：window.ChartOptions（L4 core，早于 scripts/scenes/*，
// 晚于 scripts/data/*）。不碰 DOM、不 new echarts。
//
// 【POC：pump-station-situation-v2】只有两个构造器，都围着同一件事：
//   partMaxBars() → 六个部位里哪个最差（横条 + 两条 ISO 阈值线）
//   pointBars()   → 25 个测点的全貌（纵向 25 根，序号与右栏明细表逐行对应）
//
// 旧目录 pump-station-situation/scripts/core/chartopts.js 有 499 行、一堆构造器
// （压力波动 / 振动峰值 / 相似案例命中 / 知识库…），那是因为旧屏把诊断台、知识库、
// Agent 问答、6 步流程全塞在一屏里。本屏收窄成「这台机组现在什么状态、哪个测点最差」，
// 其余全部移交给诊断台那一屏。
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
      // 【变量名是 --cyan / --blue，不是 --accent】本目录的 01-tokens.css 沿用
      // inspection-station-v2 的名单，那是为了让 ../pump-station-situation/styles/
      // 05-pump3d.css 与 04-charts.css（一字未改地复用）能读到它们要的名字。
      // 大屏 hunan-pump-overview-v2 那边用的是 --accent / --accent-2，两套名单不通用。
      accent: cssVar("--cyan"), accent2: cssVar("--blue"),
      ok: cssVar("--status-ok"), warn: cssVar("--status-warn"), danger: cssVar("--status-danger"),
      muted: cssVar("--muted"), ink: cssVar("--ink"),
      line: cssVar("--line"), lineStrong: cssVar("--line-strong")
    };
  }

  function theme() {
    if (!THEME) THEME = readTheme();
    return THEME;
  }

  function need(name, fn) {
    if (!window[name]) throw new Error("[ChartOptions." + fn + "] 需要先加载 " + name);
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

  // ISO 10186-3 的两条线：2.3（A/B 分界）和 4.5（B/C 分界）。7.1 那条不画 ——
  // 本机组最大 2.62，画到 7.1 会把整个 y 轴拉长两倍多，25 根柱全被压扁。
  function isoMarkLine(t) {
    return {
      silent: true, symbol: "none",
      label: {
        show: true, position: "insideEndTop", color: t.muted, fontSize: 11,
        formatter: function (p) { return p.name; }
      },
      data: [
        { name: "A/B 2.3", yAxis: 2.3, lineStyle: { color: t.warn, type: "dashed", width: 1.2 } },
        { name: "B/C 4.5", yAxis: 4.5, lineStyle: { color: t.danger, type: "dashed", width: 1.2 } }
      ]
    };
  }

  var STATUS_COLOR = { ok: "ok", warn: "warn", danger: "danger" };

  // ---------- partMaxBars()：六个部位的最大振动值 ----------
  //
  // 横条而不是竖条：部位名是 2~5 个汉字（「驱动端轴承」「底座与基础」），竖排 x 轴标签
  // 会斜着挤在一起。
  //
  // 【0 测点的两个部位怎么画】联轴器和机械密封没有测振点，值是 null。不画成 0 ——
  // 画 0 会让人读成"测出来是 0"。改成不画柱、只在右侧写「无测振点」，并且柱位仍然保留，
  // 因为「六个部位里有两个测不到」正是这一屏要讲的事，把它们从轴上删掉就藏起来了。
  function partMaxBars() {
    var t = theme();
    var M = need("PumpMeasure", "partMaxBars");
    // 有值的排前面（值大在上），无值的沉到底部。category 轴从下往上画，所以先反转。
    var withData = M.parts().filter(function (p) { return p.hasData; })
      .sort(function (a, b) { return a.max - b.max; });
    var without = M.parts().filter(function (p) { return !p.hasData; });
    var rows = without.concat(withData);

    return {
      grid: { left: 88, right: 74, top: 20, bottom: 24 },
      tooltip: darkTooltip(t, {
        trigger: "axis", axisPointer: { type: "shadow" },
        formatter: function (params) {
          var row = rows[params[0].dataIndex];
          return row.name + "<br/>" + row.reason
            + "<br/><span style=\"opacity:.7\">" + row.pointCount + " 个测点"
            + (row.findingCount ? " · 命中报告结论 " + row.findingCount + " 条" : "") + "</span>";
        }
      }),
      xAxis: {
        type: "value", min: 0, max: 5,
        axisLabel: { color: t.muted, fontSize: 11 },
        axisLine: { show: false }, axisTick: { show: false },
        splitLine: { lineStyle: { color: t.line } }
      },
      yAxis: {
        type: "category", data: rows.map(function (r) { return r.short; }),
        axisLabel: { color: t.ink, fontSize: 12 },
        axisLine: { lineStyle: { color: t.line } }, axisTick: { show: false }
      },
      series: [{
        type: "bar", barWidth: 13,
        data: rows.map(function (r) {
          if (!r.hasData) return { value: 0, itemStyle: { color: "transparent" } };
          return {
            value: r.max,
            itemStyle: { color: t[STATUS_COLOR[r.status]], borderRadius: [0, 3, 3, 0] }
          };
        }),
        label: {
          show: true, position: "right", fontSize: 12, fontWeight: 700,
          formatter: function (p) {
            var row = rows[p.dataIndex];
            return row.hasData
              ? row.max.toFixed(2) + " " + row.grade.grade
              : "无测振点";
          },
          color: function (p) {
            var row = rows[p.dataIndex];
            return row.hasData ? t.ink : t.muted;
          }
        },
        markLine: isoMarkLine(t)
      }]
    };
  }

  // ---------- pointBars()：25 个测点全貌 ----------
  //
  // 【x 轴为什么是序号而不是测点名】测点名是「电机非驱动端斜45°」这种 8~9 字的长串，
  // 25 个横排在 560px 宽的栏里必然斜排重叠。改成 1~25 的序号，与右栏明细表的序号列
  // 逐行对应 —— 在图上看到第 17 根最高，在表里就能直接找到第 17 行是什么。
  //
  // 柱按**部位**分色而不是按分级分色：分级已经由 2.3 那条虚线表达了（越线的自然高出来），
  // 再按分级染色是同一件事说两遍；按部位分色才能看出"高的那几根集中在哪个部位"。
  function pointBars(activePartId) {
    var t = theme();
    var M = need("PumpMeasure", "pointBars");
    var pts = M.points();
    var PART_TONE = {
      motor: t.accent2, base: t.muted, "front-bearing": t.accent,
      "pump-body": t.ok, coupling: t.danger, seal: t.warn
    };

    return {
      grid: { left: 40, right: 16, top: 24, bottom: 24 },
      tooltip: darkTooltip(t, {
        trigger: "item",
        formatter: function (p) {
          var row = pts[p.dataIndex];
          return "第 " + row.index + " 点 · " + row.name + "<br/>"
            + row.value.toFixed(2) + " mm/s · " + row.grade.grade + " " + row.grade.label;
        }
      }),
      xAxis: {
        type: "category", data: pts.map(function (p) { return String(p.index); }),
        axisLabel: { color: t.muted, fontSize: 10, interval: 0 },
        axisLine: { lineStyle: { color: t.line } }, axisTick: { show: false }
      },
      yAxis: {
        type: "value", min: 0, max: 3,
        name: "mm/s", nameTextStyle: { color: t.muted, fontSize: 11 },
        axisLabel: { color: t.muted, fontSize: 11 },
        splitLine: { lineStyle: { color: t.line } }
      },
      series: [{
        type: "bar", barWidth: "62%",
        data: pts.map(function (p) {
          // 选中某个部位时，其余部位的柱压暗 —— 让"这个部位的点分布在哪"一眼可见。
          var dim = activePartId && p.partId !== activePartId;
          return {
            value: p.value,
            itemStyle: {
              color: PART_TONE[p.partId] || t.accent,
              opacity: dim ? 0.22 : 1,
              borderRadius: [2, 2, 0, 0]
            }
          };
        }),
        // 只给越过 2.3 的那几根标数值：25 根全标会糊成一片，而越线的才是要被看见的。
        label: {
          show: true, position: "top", color: t.ink, fontSize: 10, fontWeight: 700,
          formatter: function (p) { return p.value >= 2.3 ? p.value.toFixed(2) : ""; }
        },
        markLine: {
          silent: true, symbol: "none",
          label: { show: true, position: "insideEndTop", color: t.muted, fontSize: 11,
                   formatter: "A/B 2.3" },
          data: [{ yAxis: 2.3, lineStyle: { color: t.warn, type: "dashed", width: 1.2 } }]
        }
      }]
    };
  }

  window.ChartOptions = { partMaxBars: partMaxBars, pointBars: pointBars };
})();
