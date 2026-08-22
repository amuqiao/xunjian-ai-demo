// 纯函数 ECharts option 构造器：window.ChartOptions（L4 core，早于 scripts/scenes/*，
// 晚于 scripts/data/*）。不碰 DOM、不 new echarts —— 只把数据层 + CSS 主题色拼成 option。
//
// 【POC：hunan-pump-overview-v2】这是重写，不是增量修改。旧目录那 5 个构造器全部删掉，
// 因为它们回答的是**管网**的问题，不是**泵**的问题：
//   删 siteKindMix()        —— 站场/阀室占比。本 POC 只有 7 个站场，阀室里没有泵。
//   删 pressureProfile()    —— 沿线压力剖面。那是管道工艺，跟机组状态无关。
//   删 throughputRows()     —— 各段日输量。同上。
//   删 zoneStatusMix()      —— 作业区状态分布。已由下边作业区带的 6 张卡承担，
//                              卡片同时是下钻入口，比一张只能看不能点的图更值那条横边。
//   删 pumpHealthRank()     —— 旧目录唯一跟泵有关的一张，但它的"健康分"是凭空造的。
//                              现在换成真实口径的 ISO 10186-3 分级 + 真实故障统计。
//
// 四个新构造器，每个回答一个问题：
//   stationPumpMix()  → 这 40 台分布在哪、主输还是给油        （左栏上）
//   serviceYears()    → 机队多老、多少台到了大修节点          （左栏中）
//   faultPareto()     → ★ 该盯哪一类故障（次数 vs 停机时长倒挂）（右栏上）
//   faultSiteRows()   → 故障都出在哪个部位                    （右栏中）
//
// 颜色全部现读 getComputedStyle(document.documentElement)，不写死色值 ——
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
      accent: cssVar("--accent"), accent2: cssVar("--accent-2"),
      ok: cssVar("--status-ok"), warn: cssVar("--status-warn"), danger: cssVar("--status-danger"),
      muted: cssVar("--muted"), ink: cssVar("--ink"),
      line: cssVar("--line"), lineStrong: cssVar("--line-strong")
    };
  }

  function requireTheme() {
    if (!THEME) THEME = readTheme();
    return THEME;
  }

  function need(name, fnName) {
    if (!window[name]) throw new Error("[ChartOptions." + fnName + "] 需要先加载 " + name);
    return window[name];
  }

  function darkTooltip(theme, extra) {
    var base = {
      backgroundColor: "rgba(8, 12, 30, 0.94)",
      borderColor: theme.lineStrong, borderWidth: 1,
      padding: [7, 10], textStyle: { color: theme.ink, fontSize: 12 }
    };
    Object.keys(extra || {}).forEach(function (key) { base[key] = extra[key]; });
    return base;
  }

  // ---------- stationPumpMix()：7 站库 × 主输/给油 堆叠横条 ----------
  //
  // 横排而不是竖排：站库名是 3~5 个汉字，竖排 x 轴标签会斜着挤在一起。
  // 堆叠而不是分组：这张图先回答"盘子多大"（每站几台），主输/给油的比例是附带信息，
  // 分组柱会让两个问题抢同一根轴。
  function stationPumpMix() {
    var theme = requireTheme();
    var Ledger = need("PumpLedger", "stationPumpMix");
    // 台数从少到多，ECharts 的 category 轴从下往上画，所以最多的那个落在顶部。
    var rows = Ledger.stations().map(function (st) {
      var list = Ledger.pumpsByStation(st.name);
      return {
        name: st.name,
        main: list.filter(function (p) { return p.role === "主输泵"; }).length,
        feed: list.filter(function (p) { return p.role === "给油泵"; }).length
      };
    }).sort(function (a, b) { return (a.main + a.feed) - (b.main + b.feed); });

    return {
      grid: { left: 76, right: 46, top: 12, bottom: 22 },
      tooltip: darkTooltip(theme, {
        trigger: "axis", axisPointer: { type: "shadow" },
        formatter: function (params) {
          var total = params.reduce(function (s, p) { return s + p.value; }, 0);
          return params[0].name + " 共 " + total + " 台<br/>"
            + params.map(function (p) { return p.marker + p.seriesName + " " + p.value + " 台"; }).join("<br/>");
        }
      }),
      legend: {
        show: true, right: 0, top: 0, itemWidth: 9, itemHeight: 9,
        textStyle: { color: theme.muted, fontSize: 11 }
      },
      xAxis: {
        type: "value", max: 8,
        axisLabel: { color: theme.muted, fontSize: 11 },
        axisLine: { show: false }, axisTick: { show: false },
        splitLine: { lineStyle: { color: theme.line } }
      },
      yAxis: {
        type: "category", data: rows.map(function (r) { return r.name; }),
        axisLabel: { color: theme.ink, fontSize: 12 },
        axisLine: { lineStyle: { color: theme.line } }, axisTick: { show: false }
      },
      series: [
        { name: "主输泵", type: "bar", stack: "t", barWidth: 13,
          itemStyle: { color: theme.accent },
          data: rows.map(function (r) { return r.main; }) },
        { name: "给油泵", type: "bar", stack: "t", barWidth: 13,
          itemStyle: { color: theme.accent2, borderRadius: [0, 3, 3, 0] },
          label: {
            show: true, position: "right", color: theme.ink, fontSize: 12, fontWeight: 700,
            formatter: function (p) { return rows[p.dataIndex].main + rows[p.dataIndex].feed + " 台"; }
          },
          data: rows.map(function (r) { return r.feed; }) }
      ]
    };
  }

  // ---------- serviceYears()：服役年限分档 ----------
  //
  // 分档口径来自台账表头原文「50000 小时或 10 年大修」：≥10 年就是到了大修节点。
  // 所以档位不是均分的年数，而是围着 10 年这条线切：<5 / 5~10 / 10~15 / ≥15。
  // 「未填报」单独成一档而不是丢弃 —— 衡阳站 4 台和 154 库 4 台在源表里投用日期缺失
  // （衡阳那 4 行是被评估报告结论文字串列覆盖），把它们藏起来会让 40 这个总数对不上。
  function serviceYears() {
    var theme = requireTheme();
    var Ledger = need("PumpLedger", "serviceYears");
    var Sites = need("HunanSites", "serviceYears");
    var asOf = Sites.asOf();
    var buckets = [
      { label: "< 5 年", tone: "ok", test: function (y) { return y !== null && y < 5; } },
      { label: "5~10 年", tone: "ok", test: function (y) { return y !== null && y >= 5 && y < 10; } },
      { label: "10~15 年", tone: "warn", test: function (y) { return y !== null && y >= 10 && y < 15; } },
      { label: "≥ 15 年", tone: "danger", test: function (y) { return y !== null && y >= 15; } },
      { label: "未填报", tone: "muted", test: function (y) { return y === null; } }
    ];
    var pumps = Ledger.pumps();
    var data = buckets.map(function (b) {
      var n = pumps.filter(function (p) { return b.test(Ledger.serviceYears(p, asOf)); }).length;
      return { value: n, itemStyle: { color: theme[b.tone] || theme.muted, borderRadius: [3, 3, 0, 0] } };
    });

    return {
      grid: { left: 34, right: 12, top: 30, bottom: 26 },
      tooltip: darkTooltip(theme, { trigger: "axis", axisPointer: { type: "shadow" } }),
      xAxis: {
        type: "category", data: buckets.map(function (b) { return b.label; }),
        axisLabel: { color: theme.muted, fontSize: 11, interval: 0 },
        axisLine: { lineStyle: { color: theme.line } }, axisTick: { show: false }
      },
      yAxis: {
        type: "value", max: 16,
        axisLabel: { color: theme.muted, fontSize: 11 },
        splitLine: { lineStyle: { color: theme.line } }
      },
      series: [{
        type: "bar", barWidth: 26, data: data,
        label: {
          show: true, position: "top", color: theme.ink, fontSize: 12, fontWeight: 700,
          formatter: function (p) { return p.value ? p.value + " 台" : ""; }
        },
        // 10 年那条线画出来：分档已经按它切了，标出来读者才知道为什么是这五档。
        markLine: {
          silent: true, symbol: "none",
          label: { show: false },
          lineStyle: { color: theme.warn, type: "dashed", width: 1.2, opacity: 0.7 },
          data: [{ xAxis: 1.5 }]
        }
      }]
    };
  }

  // ---------- faultPareto()：★ 本屏最重要的一张 ----------
  //
  // 【为什么必须双轴】按次数排：电气 30 > 外界 26 > 仪表 24 > 机械 14，机械故障排第四；
  // 按停机时长排：机械 998.8h > 电气 735.5h > 仪表 75.1h > 外界 74.5h，机械故障排第一。
  // **两个排名几乎倒挂** —— 机械故障 11.9% 的次数吃掉 50.8% 的停机。只画次数会得出
  // 完全相反的运维结论，所以这张图排序按停机时长，柱是次数、线是时长，两个都画。
  //
  // 全体中位数 1.08h、均值 16.67h、最大 636h —— 长尾极端，均值本身没有代表性，
  // 所以 tooltip 里同时给次数、总时长、均次时长三个数。
  function faultPareto() {
    var theme = requireTheme();
    var Faults = need("PumpFaults", "faultPareto");
    // 只画前 6 类：后面 4 类（误操作/其它/管线故障/机械密封/未分类）各自 1~6 次、
    // 合计不到 30h，画出来是几根看不见的柱，反而把前几类压扁。
    var rows = Faults.paretoByHours().slice(0, 6);

    return {
      grid: { left: 42, right: 52, top: 34, bottom: 26 },
      tooltip: darkTooltip(theme, {
        trigger: "axis", axisPointer: { type: "shadow" },
        formatter: function (params) {
          var row = rows[params[0].dataIndex];
          return row.name + "<br/>次数 " + row.count + " 次<br/>停机 " + row.hours
            + " h<br/><span style=\"opacity:.7\">均 " + row.avgHours + " h / 次</span>";
        }
      }),
      legend: {
        show: true, right: 0, top: 0, itemWidth: 9, itemHeight: 9,
        textStyle: { color: theme.muted, fontSize: 11 },
        data: ["停机次数", "停机时长"]
      },
      xAxis: {
        type: "category", data: rows.map(function (r) { return r.name; }),
        axisLabel: { color: theme.muted, fontSize: 11, interval: 0 },
        axisLine: { lineStyle: { color: theme.line } }, axisTick: { show: false }
      },
      yAxis: [
        { type: "value", name: "次", nameTextStyle: { color: theme.muted, fontSize: 11 },
          axisLabel: { color: theme.muted, fontSize: 11 },
          splitLine: { lineStyle: { color: theme.line } } },
        { type: "value", name: "h", nameTextStyle: { color: theme.muted, fontSize: 11 },
          axisLabel: { color: theme.muted, fontSize: 11 }, splitLine: { show: false } }
      ],
      series: [
        { name: "停机次数", type: "bar", yAxisIndex: 0, barWidth: 22,
          itemStyle: { color: theme.accent2, borderRadius: [3, 3, 0, 0], opacity: 0.85 },
          data: rows.map(function (r) { return r.count; }) },
        // 时长用线 + 面：它是"后果"，柱是"频次"，两种编码分开读者才不会串。
        { name: "停机时长", type: "line", yAxisIndex: 1, smooth: false,
          symbol: "circle", symbolSize: 7,
          lineStyle: { color: theme.danger, width: 2.2 },
          itemStyle: { color: theme.danger },
          areaStyle: { color: theme.danger, opacity: 0.10 },
          label: {
            show: true, position: "top", color: theme.ink, fontSize: 11, fontWeight: 700,
            formatter: function (p) { return p.dataIndex < 2 ? p.value + "h" : ""; }
          },
          data: rows.map(function (r) { return r.hours; }) }
      ]
    };
  }

  // ---------- faultSiteRows()：故障部位横条 ----------
  //
  // ⚠️ 这里的「故障部位」是**故障归因分类**（供电系统 / 控制系统 / 机械密封…），
  // 与 pump-unit-model.js 的 IMS 设备结构树不是同一套词表，两者都有「泵本体」但语义
  // 和层级都不同。所以这张图刻意只画故障统计表自己的部位，不去关联单元模型的部件树。
  function faultSiteRows() {
    var theme = requireTheme();
    var Faults = need("PumpFaults", "faultSiteRows");
    var rows = Faults.groupBy("site").slice(0, 6).reverse();   // category 轴从下往上

    return {
      grid: { left: 76, right: 46, top: 10, bottom: 18 },
      tooltip: darkTooltip(theme, {
        trigger: "axis", axisPointer: { type: "shadow" },
        formatter: function (params) {
          var row = rows[params[0].dataIndex];
          return row.name + "<br/>" + row.count + " 次 · 停机 " + row.hours + " h";
        }
      }),
      xAxis: {
        type: "value",
        axisLabel: { color: theme.muted, fontSize: 11 },
        axisLine: { show: false }, axisTick: { show: false },
        splitLine: { lineStyle: { color: theme.line } }
      },
      yAxis: {
        type: "category", data: rows.map(function (r) { return r.name; }),
        axisLabel: { color: theme.ink, fontSize: 12 },
        axisLine: { lineStyle: { color: theme.line } }, axisTick: { show: false }
      },
      series: [{
        type: "bar", barWidth: 12,
        // 供电系统 53 次是断层第一，把它单独染成 warn，其余用 accent —— 状态色只上
        // 需要被看见的那一根，全染成同一个颜色等于没有排序信息。
        data: rows.map(function (r, i) {
          return {
            value: r.count,
            itemStyle: {
              color: i === rows.length - 1 ? theme.warn : theme.accent,
              borderRadius: [0, 3, 3, 0]
            }
          };
        }),
        label: {
          show: true, position: "right", color: theme.ink, fontSize: 12, fontWeight: 700,
          formatter: "{c} 次"
        }
      }]
    };
  }

  window.ChartOptions = {
    stationPumpMix: stationPumpMix,
    serviceYears: serviceYears,
    faultPareto: faultPareto,
    faultSiteRows: faultSiteRows
  };
})();
