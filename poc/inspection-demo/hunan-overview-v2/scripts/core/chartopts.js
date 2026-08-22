// 纯函数 ECharts option 构造器：window.ChartOptions（L4 core，早于 scripts/scenes/*，
// 晚于 scripts/data/*）。本文件不碰 DOM、不 new echarts——只把数据层 +
// CSS 主题色拼成 option 对象。ECharts 版本 5.6.0（vendor 复用旧目录原文件）。
//
// 【POC：hunan-overview-v2】本文件是旧目录 scripts/core/chartopts.js 的重写，
// 不是增量修改。构造器从 5 个变成 3 个：
//
//   删除 siteKindMix()        —— 站场/阀室占比环形图。旧目录里写好了但从未被调用。
//   删除 zoneCoverageRows()   —— 作业区巡检覆盖率横向柱。被 zoneStatusMix() 取代：
//                                后者同样按作业区横排，但每根柱拆成正常/关注/异常
//                                三段，覆盖率只是「已巡/应巡」一个比值，信息量更小。
//   删除 inspectionCoverageTrend() —— 完成率趋势折线。完成率已经由 completionGauge()
//                                的环心承载，同一个数不画两遍。
//
//   新增 completionGauge(zoneId)   —— 巡检完成度环形（进度环 + 环心百分比）。
//   改写 qualityExceptionMix(zoneId) —— 从旧版的「省域固定 5 行、含当前 P1」改成
//                                「按 zoneId 取数、4 行、不含 P1」。P1 是风险等级，
//                                不是行为异常，混在同一根轴上会让人以为它们是同类；
//                                P1 现在是左栏第一行的大数指标之一。
//   保留 zoneStatusMix()      —— 改成横向堆叠 + 中文图例（旧版图例直接显示
//                                "ok"/"warn"/"danger" 三个英文单词，是中文大屏上的
//                                英文泄漏）+ 按「异常权重」降序排，最该管的作业区排最上。
//
// 三个构造器分别对应设计上的三个问题：
//   completionGauge      → 计划做完了吗
//   qualityExceptionMix  → 异常都是哪几类   （总体）
//   zoneStatusMix        → 哪个作业区最该管 （分区）
//
// 颜色全部现读 getComputedStyle(document.documentElement)，不写死任何色值——
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

  function requireTheme() {
    if (!THEME) THEME = readTheme();
    return THEME;
  }

  function requireQuality(fnName) {
    if (!window.HunanInspectionQuality) {
      throw new Error("[ChartOptions] " + fnName + " 需要 window.HunanInspectionQuality，请检查 scripts/data/quality.js 是否已加载");
    }
    return window.HunanInspectionQuality;
  }

  function requireSeries(fnName) {
    if (!window.HunanSeries) {
      throw new Error("[ChartOptions] " + fnName + " 需要 window.HunanSeries，请检查 scripts/data/series.js 是否已加载");
    }
    return window.HunanSeries;
  }

  // ECharts 的默认 tooltip 是白底黑字，叠在深蓝黑大屏上会亮得像个弹窗故障。
  // 三个构造器共用这一份深色 tooltip 皮肤。
  function darkTooltip(theme, extra) {
    var base = {
      backgroundColor: "rgba(8, 12, 30, 0.94)",
      borderColor: theme.lineStrong,
      borderWidth: 1,
      padding: [7, 10],
      textStyle: { color: theme.ink, fontSize: 12 }
    };
    Object.keys(extra || {}).forEach(function (key) { base[key] = extra[key]; });
    return base;
  }

  // ---------- completionGauge(zoneId)：巡检完成度环形 ----------
  //
  // 环心是百分比，环心下方一行是「已完成/计划 项」的绝对值。这两个数在旧场景里
  // 一共出现过三遍（KPI 卡的 note "34/36"、质量卡 focus 的 em「已完成」、质量卡
  // grid 的「计划巡检」），现在只在这一个图里出现。
  //
  // 进度弧的颜色跟着完成率的达标状态走：低于 95% 用 warn，否则用 ok。95 这个阈值
  // 与 scripts/scenes/overview.js 里 Cards.metric 的 status 判定同源，两处必须一致，
  // 否则会出现「环是橙的、旁边指标点是绿的」。
  function completionGauge(zoneId) {
    var theme = requireTheme();
    var q = requireQuality("completionGauge()").current(zoneId);
    var arcColor = q.completionRate < 95 ? theme.warn : theme.ok;

    return {
      series: [{
        type: "gauge",
        startAngle: 90,
        endAngle: -270,
        radius: "88%",
        center: ["50%", "52%"],
        min: 0,
        max: 100,
        splitNumber: 1,
        pointer: { show: false },
        axisLine: {
          lineStyle: {
            width: 16,
            color: [[1, theme.line]]
          }
        },
        progress: {
          show: true,
          width: 16,
          roundCap: true,
          itemStyle: { color: arcColor }
        },
        splitLine: { show: false },
        axisTick: { show: false },
        axisLabel: { show: false },
        detail: {
          valueAnimation: false,
          formatter: "{value}%",
          color: theme.ink,
          fontSize: 46,
          fontWeight: 700,
          offsetCenter: [0, "-8%"]
        },
        title: {
          offsetCenter: [0, "28%"],
          color: theme.muted,
          fontSize: 15
        },
        data: [{
          value: q.completionRate,
          name: q.completed + " / " + q.planned + " 项"
        }]
      }]
    };
  }

  // ---------- qualityExceptionMix(zoneId)：巡检质量异常构成（横向柱） ----------
  //
  // 四行的阈值说明（"<10min" / "<10s" / "偏移30min" / "时序/轨迹"）在旧场景里是
  // 常驻在屏幕上的 note 小字，四行说明本身比它们注解的四个数字占的位置还多。
  // 现在挪进 tooltip：需要知道判定口径的人悬停即可，路演时屏上只剩「类别 + 条数」。
  //
  // 配色语义：前三行是巡检人员的行为异常（用 warn），第四行「AI 提醒」是模型主动
  // 发现的线索、不是违规（用 accent）。两者不同色，是因为它们在管理动作上不同类：
  // 前者要追责到人，后者要去核实现场。
  var EXCEPTION_ROWS = [
    { key: "duration", label: "时长异常", hint: "单项巡检用时不足 10 分钟", tone: "warn" },
    { key: "interval", label: "间隔异常", hint: "相邻巡检项间隔不足 10 秒", tone: "warn" },
    { key: "offWindow", label: "时段异常", hint: "偏离计划时段 30 分钟以上", tone: "warn" },
    { key: "aiAlerts", label: "AI 提醒", hint: "时序 / 轨迹模型触发的核实线索", tone: "accent" }
  ];

  function qualityExceptionMix(zoneId) {
    var theme = requireTheme();
    var q = requireQuality("qualityExceptionMix()").current(zoneId);
    var rows = EXCEPTION_ROWS.map(function (row) {
      if (!(row.key in q)) {
        throw new Error("[ChartOptions] qualityExceptionMix() 缺少字段 " + row.key + "，请检查 scripts/data/quality.js");
      }
      return { label: row.label, hint: row.hint, value: q[row.key], color: theme[row.tone] };
    });

    return {
      grid: { left: 86, right: 52, top: 6, bottom: 6 },
      tooltip: darkTooltip(theme, {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: function (params) {
          var row = rows[params[0].dataIndex];
          return row.label + "　" + row.value + " 次<br/><span style=\"opacity:.65\">" + row.hint + "</span>";
        }
      }),
      xAxis: {
        type: "value",
        minInterval: 1,
        axisLabel: { color: theme.muted, fontSize: 12 },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: theme.line } }
      },
      // ECharts 的 category 轴自下而上排，数组第 0 项会落在最底行。这里 reverse
      // 一次，让 EXCEPTION_ROWS 的书写顺序（时长→间隔→时段→AI）在屏上是自上而下。
      yAxis: {
        type: "category",
        data: rows.map(function (row) { return row.label; }).reverse(),
        axisLabel: { color: theme.ink, fontSize: 14 },
        axisLine: { lineStyle: { color: theme.line } },
        axisTick: { show: false }
      },
      series: [{
        type: "bar",
        barWidth: 20,
        label: {
          show: true,
          position: "right",
          formatter: "{c}",
          color: theme.muted,
          fontSize: 14
        },
        data: rows.map(function (row) {
          return { value: row.value, itemStyle: { color: row.color, borderRadius: [0, 3, 3, 0] } };
        }).reverse()
      }]
    };
  }

  // ---------- zoneStatusMix()：6 作业区需关注站点数（横向双色堆叠柱） ----------
  //
  // 【只堆叠 warn + danger，不含 ok】第一版三色全堆（正常/关注/异常），实测的样子是：
  // 每根柱子 90% 以上是绿色的「正常」段，橙色和红色被挤成末端一两个像素的碎片。可这张
  // 图要回答的恰恰是「哪个作业区最该管」——柱长却在编码站点总数，而站点总数已经写在
  // 地图上每个作业区标签的第二行（「36 站」）了，同一个量在一屏上出现两遍，还把真正
  // 要看的两段挤没了。去掉 ok 段之后柱长直接等于需关注站点数，六根柱子的长短差异就是
  // 答案本身：实测岳阳 5 / 株洲 2 / 永郴 2 / 衡阳 2 / 湘娄 1 / 长沙 1。
  //
  // 代价说清楚：这样看不到「占比」（岳阳 5/36 与长沙 1/28 的分母不同）。这是有意的取舍
  // ——大屏上要的是「先去哪个区」，那是绝对数量的问题；占比口径在完成度环和下钻后的
  // 「需关注站点」卡头（「5 / 36 站点」）里都有。
  //
  // 排序：按「异常权重」= danger*2 + warn 降序，最该管的排最上面。
  // 图例名用中文。旧目录的 series.name 直接用了 status 键（"ok"/"warn"/"danger"），
  // 图例上就是三个英文单词，是中文大屏上的英文泄漏。
  var STATUS_SERIES = [
    { key: "warn", name: "关注", tone: "warn" },
    { key: "danger", name: "异常", tone: "danger" }
  ];

  function zoneStatusMix() {
    var theme = requireTheme();
    var rows = requireSeries("zoneStatusMix()").zoneStatusMix().slice();
    if (!rows.length) throw new Error("[ChartOptions] zoneStatusMix() 需要至少一行数据");
    rows.sort(function (a, b) {
      return (a.danger * 2 + a.warn) - (b.danger * 2 + b.warn);
    });

    return {
      grid: { left: 62, right: 40, top: 32, bottom: 6 },
      legend: {
        top: 0,
        right: 0,
        itemWidth: 11,
        itemHeight: 11,
        itemGap: 16,
        textStyle: { color: theme.muted, fontSize: 14 }
      },
      tooltip: darkTooltip(theme, {
        trigger: "axis",
        axisPointer: { type: "shadow" }
      }),
      xAxis: {
        type: "value",
        minInterval: 1,
        axisLabel: { color: theme.muted, fontSize: 12 },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: theme.line } }
      },
      // 已按异常权重升序排好：category 轴自下而上，升序排列后权重最高的落在最上面。
      yAxis: {
        type: "category",
        data: rows.map(function (row) { return row.name.replace("作业区", ""); }),
        axisLabel: { color: theme.ink, fontSize: 14 },
        axisLine: { lineStyle: { color: theme.line } },
        axisTick: { show: false }
      },
      // 堆叠柱一律不加圆角。曾经想只给最后一段（异常）加右端圆角让柱子有个端头，
      // 但 danger 为 0 时那一段宽度为 0、圆角落在看不见的地方，柱子右端会变回直角
      // ——同一张图里六根柱子端头形状不一致，比全部直角更显得没做完。
      // 柱高 26px：第一版写 13px，实测在这张图上是六条细线飘在大片空白里——左栏第 4 块
      // 的可用高度约 490px，6 个类目每格 80px 上下，13px 只填到 16%。中间试过改用
      // barCategoryGap 百分比让柱高自适应格高，实测在 stack 模式下没有生效到预期宽度，
      // 于是回到显式 px：本项目是固定画布（2471×1289 等比缩放），px 在这里是确定值，
      // 不会因为窗口大小变化而失准。
      //
      // 最后一段（异常）加右端圆角。这里可以加、上一版三色堆叠时不能加，区别在于本图
      // 的段序是「关注 → 异常」而 danger 常为 0（6 个区里 4 个是 0），所以圆角改挂在
      // 整根柱子上用 showBackground 之外的方式不成立——直接不加圆角，六根柱子端头一致。
      series: STATUS_SERIES.map(function (spec) {
        return {
          name: spec.name,
          type: "bar",
          stack: "alert",
          barWidth: 26,
          itemStyle: { color: theme[spec.tone] },
          data: rows.map(function (row) { return row[spec.key]; })
        };
      })
    };
  }

  window.ChartOptions = {
    completionGauge: completionGauge,
    qualityExceptionMix: qualityExceptionMix,
    zoneStatusMix: zoneStatusMix
  };
})();
