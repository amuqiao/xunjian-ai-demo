// 场景：部位态势 / 空间定位（DemoData.scenes() 中 key === "station"）。
//
// 任务 P2-A：现场反馈"3D 图确定，其他几张卡片字太多、设计不好看、很乱"——根因不是字多，
// 是 4 个面板全是等权重的文字行，缺视觉层级。本轮把其中两个换成图表、一个换成组件层已有的
// DetailCard，与 scenes/overview.js 共用同一套组件/图表管线（Cards/SelectList/DetailCard +
// Charts.slot/draw/flush + ChartOptions），不另发明一套：
//   station-map-panel（3D）        —— 已验收资产，原样不动；
//   station-side（当前部位文字块）  —— 改用 DetailCard，并传 activePartLabel（3D 契约钩子）；
//   station-route-panel（4 行文字）—— 改用 Cards.chart 承载 ChartOptions.radar()（6 部位风险）；
//   station-units-panel（机组对照）—— 改用 SelectList variant="row"，每行内嵌 ChartOptions.spark。
(function () {
  "use strict";

  var DATA = window.DemoData;
  var AppState = window.AppState;
  var state = window.AppState.value;
  var Charts = window.Charts;
  var ChartOptions = window.ChartOptions;

  // DetailCard.badge 的文案只由 status 决定：三色语义在全场景保持一致，和 overview.js
  // 的同名字典逐字一致——两处只能各自维护一份是因为"同层不得互相引用"（scenes/*.js
  // 之间不能互相 import），不是走样。
  // 三色徽标文案由 DATA.badgeText(status) 提供。原来 overview.js 和 station.js 各存
  // 一份逐字相同的 BADGE_TEXT 字典，业务改"时序预警"这个词得改两处，漏一处就两页
  // 说法不一致——而这种不一致没有任何断言会发现。现在只有 catalog.js 的
  // statusText.badge 一份真源。

  function round2(value) {
    return Math.round(value * 100) / 100;
  }

  function fmtNum(value) {
    return String(round2(value));
  }

  function withSign(value) {
    var rounded = round2(value);
    return (rounded > 0 ? "+" : "") + String(rounded);
  }

  function rangeLabel() {
    var matches = DATA.ranges().filter(function (range) { return range.key === state.range; });
    return matches[0].label;
  }

  // ---------- 左上：3D 机组态势（禁改区，逐字保留原实现） ----------
  //
  // .pump-map-wrap 类名不在这里使用：05-pump3d.css 的 C1 硬依赖表只把
  // `.pump-map-wrap .pump-train` 覆盖成 height:100%/min-height:0 用于 dashboard 场景；
  // station 走的是另一条覆盖（`.station-map-panel .pump-train{min-height:480px}`），
  // 本来就不依赖 .pump-map-wrap，这条历史行为原样保留，不在本轮改动范围内。

  function renderMap(part) {
    return h("section", { class: "panel station-map-panel" }, [
      h("div", { class: "station-map-head" }, [
        h("div", {}, [
          h("p", { class: "kicker", text: "设备结构图 / 部位风险" }),
          h("h3", { text: "电机 - 联轴器 - 泵体 - 管线" }),
        ]),
        h("div", { class: "train-legend" }, [
          AppState.legend("danger", "异常"),
          AppState.legend("warn", "关注"),
          AppState.legend("ok", "排除"),
        ]),
      ]),
      renderPumpTrain(part.id, "station"),
    ]);
  }

  // ---------- 右栏：DetailCard（当前部位详情，替代原 station-side 纯文字块） ----------
  //
  // 内容口径与 overview.js 的 detailMetrics/detailTags/detailConclusion（非 UNIT-H 分支）
  // 完全一致：当前值/区间峰值/较区间首值 + 关注线/停机线标签 + series.alert 结论——
  // 同一份 DATA.series() 输出，同一套判定，不在本文件里另立一套文案口径。
  // part.status（DATA.part()/DATA.parts() 的 status）是全项目按 P-1 固定口径派生的
  // 部位级判定（index.js 的 STATUS_UNIT 注释），不随当前选中机组变化；这里的 badge/
  // 结论改用"当前选中机组 + 该部位主测点"的 series().status，才是真正随机组联动的判断，
  // 与右侧 metrics/结论同源，避免徽标说"异常"而数字对不上选中机组的实际读数。

  function detailMetrics(s) {
    return [
      { label: "当前值", value: fmtNum(s.latest), unit: s.unit },
      { label: "区间峰值", value: fmtNum(s.peak), unit: s.unit },
      { label: "较区间首值", value: withSign(s.delta), unit: s.unit },
    ];
  }

  function detailTags(s) {
    var tags = [s.type, "关注线 " + fmtNum(s.warn) + s.unit];
    if (s.stop != null) tags.push("停机线 " + fmtNum(s.stop) + s.unit);
    return tags;
  }

  function renderDetail(unitId, part, point) {
    var s = DATA.series(unitId, point.id, state.range);
    var card = window.DetailCard.render({
      kicker: "部位详情 · " + rangeLabel(),
      title: unitId + " · " + point.label,
      // 3D 契约钩子：activePartLabel 必须是"当前部位"（state.focus.partId）的中文名，
      // 内容为该部位中文名（Pump3DContract.ACTIVE_LABEL_ATTR，由 DetailCard 内部落地）。
      activePartLabel: part.label,
      badge: { status: s.status, text: DATA.badgeText(s.status) },
      metrics: detailMetrics(s),
      conclusion: s.alert,
      tags: detailTags(s),
      // "现场记录"复用 Cards.evidence（四类卡片里唯一本页面此前未用过的一类）承载
      // part.summary/part.evidence——原来是一段自由文字 + 一份 <div> 列表，现在收进
      // "权重最低、一句结论 + ≤3 标签"的证据卡，视觉上明确低于上面的 metrics/结论。
      sections: [
        {
          title: "现场记录",
          node: window.Cards.evidence({
            status: s.status,
            conclusion: part.summary,
            tags: part.evidence,
          }),
        },
      ],
      actions: [
        { action: "go-workbench", text: "进入部位诊断", primary: true },
        { action: "open-trend-detail", text: "查看主测点趋势" },
      ],
    });
    card.className += " station-side";
    return card;
  }

  // ---------- 左下：部位风险雷达（替代原"泵部位数据映射"4 行文字） ----------
  //
  // ChartOptions.radar() 内部固定取 DATA.units()[0]（即 P-1）计算风险分，不随
  // state.focus.unitId 变化——这是 chartopts.js 里雷达构造器自身的设计（本文件不在
  // 改动范围内），效果是：切换"机组对照"选中机组不会改变这张雷达图，它呈现的始终是
  // P-1（本轮叙事机组）的 6 部位风险形状，与 3D 热点颜色（同样按 P-1 口径派生，见
  // index.js 的 STATUS_UNIT 注释）保持同一叙事口径。

  function renderRiskRadar() {
    var chart = window.Cards.chart({
      title: "部位风险雷达 · " + rangeLabel(),
      chartId: "st-chart-radar",
      meta: "6 部位 · 关注线 = 100",
    });
    chart.className += " station-route-panel";
    return chart;
  }

  // ---------- 左下：机组对照（替代原 4 行手写按钮） ----------
  //
  // 对照的测点跟随"当前部位"（state.focus.partId 的主测点）而不是写死某一个测点：
  // 点 3D 热点切部位、或在这份列表里点别的机组，都会让这张列表始终回答同一个问题——
  // "这个部位的主测点，在 P-1/P-2/P-3/P-4 上分别是什么水平"。
  // 已知数据层局限（不在本任务改动范围内）：points 表的 base 是全局单值、不分机组，
  // scenario.ramps 里只有 P-1 有各测点的爬升曲线，P-2/P-3/P-4 没有各自的 ramp，
  // 因此它们的 series().latest 会收敛到与 P-1 相同的 base 附近（噪声幅度内），
  // 4 条 spark 线看起来会很接近、机组间差异不明显——这是数据生成器目前的表达力上限，
  // 见本任务报告。

  function renderUnitCompare(point) {
    var items = DATA.units().map(function (unit) {
      var s = DATA.series(unit.id, point.id, state.range);
      return {
        id: unit.id,
        label: unit.name,
        status: s.status,
        value: fmtNum(s.latest),
        unit: s.unit,
        note: rangeLabel() + "均值 " + fmtNum(s.mean),
        sparkId: "st-spark-" + unit.id,
      };
    });
    var list = window.SelectList.render({
      name: "unit",
      variant: "row",
      activeId: AppState.selectedUnitId(),
      ariaLabel: "机组对照 · " + point.label,
      items: items,
    });
    return h("div", { class: "panel station-units-panel" }, [
      AppState.panelTitle("机组对照", point.label),
      // .station-units-scroll 只负责"面板标题固定、列表区域自己可滚动"这一层排布，
      // 见 07-station.css 里对应的注释（含 .sl-row 的 nowrap 覆盖）。
      h("div", { class: "station-units-scroll" }, [list]),
    ]);
  }

  // ---------- 头部：场景标题（无独立时间范围控件——state.range 全局共享，从 overview
  // 切过来的选择会直接沿用） ----------

  function renderHead() {
    return h("div", { class: "station-head" }, [
      h("span", { class: "kicker", text: "泵机组部位态势 / 空间定位" }),
      h("strong", { text: "长岭站 P-1 输油泵部位态势" }),
    ]);
  }

  function renderStation() {
    var unitId = AppState.selectedUnitId();
    var part = AppState.selectedPart();
    var point = DATA.primaryPoint(part.id);

    // route/units 共享底部一整行（左右并排），是纯布局用的包裹层，本身不属于四类
    // 卡片/SelectList 中的任何一类，但两个直接子节点分别是 Cards.chart() 产出的
    // .card-chart 和一个"panel-title + SelectList"的小面板——与 overview.js 的
    // overview-charts-row 是同一种"承载卡片组件的布局行"，不是另一套约定。
    var bottomRow = h("div", { class: "station-bottom-row" }, [
      renderRiskRadar(),
      renderUnitCompare(point),
    ]);

    return h("section", { class: "scene-shell station-shell" }, [
      h("div", { class: "station-grid" }, [
        renderHead(),
        renderMap(part),
        renderDetail(unitId, part, point),
        bottomRow,
      ]),
    ]);
  }

  // ---------- 图表数据绘制（由 boot.js 在 mountChartSlots() 之后同步调用） ----------
  //
  // 与 overview.js 的 renderOverviewCharts() 是同一种约定：只往已经 mount 好的 Charts
  // 槽位里 draw() option，不负责创建/挂载槽位容器本身。
  //
  // 【交接说明】本文件按与 overview.js 完全一致的约定导出 window.Scenes.renderStationCharts，
  // 但 boot.js 的 renderSceneCharts()（本任务禁改文件）目前是：
  //   function renderSceneCharts() {
  //     if (state.scene !== "overview") return;
  //     Scenes.renderOverviewCharts();
  //   }
  // 只硬编码了 overview 分支，还没有 station 分支，因此本文件导出的这个函数暂时
  // 不会被调用——雷达图和机组对照的迷你折线会挂出空的 <div class="chart-box">
  // 容器（尺寸/占位正确），但拿不到 option、画布是空的。这不是本文件能在自己的两个
  // 文件范围内解决的问题（renderStation() 在 stage.appendChild(renderScene()) 时执行，
  // 早于 boot.js 的 mountChartSlots()，此时 Charts.slot(id) 还未创建，无法在这里提前
  // draw()）。需要在 boot.js 的 renderSceneCharts() 里补一行：
  //   if (state.scene === "station") return Scenes.renderStationCharts();
  // 详见本任务报告"必须改别的文件"一节。

  function radarOption() {
    return ChartOptions.radar(DATA.parts(), state.range);
  }

  function renderStationCharts() {
    Charts.draw("st-chart-radar", radarOption());

    var part = AppState.selectedPart();
    var point = DATA.primaryPoint(part.id);
    DATA.units().forEach(function (unit) {
      Charts.draw("st-spark-" + unit.id, ChartOptions.spark(DATA.series(unit.id, point.id, state.range)));
    });

    Charts.flush();
  }

  window.Scenes = window.Scenes || {};
  window.Scenes.renderStation = renderStation;
  window.Scenes.renderStationCharts = renderStationCharts;
})();
