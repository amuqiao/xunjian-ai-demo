// 场景：泵机组大屏 / 风险总览（对应 DemoData.scenes() 中 key === "overview"）。
//
// 任务 P1-I：本文件把前几轮做好的数据层（series/healthSeries/anomalyMix/unitCompare）、
// 图表层（Charts.slot/draw/flush + ChartOptions.trend/mix/unitBars/spark）、组件层
// （Cards/SelectList/DetailCard）、状态层（state.range / state.focus / state.pick）真正
// 组装成大屏。骨架沿用 presenter 已经熟悉的"顶部状态卡 / 中间态势图 / 底部图表 / 右侧
// 详情"结构（这次改的是行为——卡片可点、详情跟着变、图表联动、时间范围可切——和卡片
// 本身的视觉分级，不是整体骨架）：顶部 6 张横排状态卡、中间 3D 机组态势、底部两张图
// 左右并排、右侧详情栏通栏跨三行。一套 { range, selection } 索引同时驱动时间维
// （range）、空间维（focus.partId / 3D 高亮）、类型维（chart2 高亮）三个视角——三张图
// 各管一个视角，不是同一份数据画三遍。
(function () {
  "use strict";

  var DATA = window.DemoData;
  var AppState = window.AppState;
  var state = window.AppState.value;
  var Charts = window.Charts;
  var ChartOptions = window.ChartOptions;

  // 6 张状态卡：id 对应 DemoData.points() 里的测点 id，UNIT-H 例外——它是
  // series.js healthSeries() 算出的整机聚合健康分，不是 catalog.js 里的任何一个
  // 测点，因此没有 partId、也没有 series() 意义上的 warn/stop（见 boot.js 的
  // selectOverviewCard() 和下面 cardValueMeta() 里对应的特判）。title 是卡片上
  // 显示的业务短名，与 DemoData.point(id).label（更完整的测点技术名，DetailCard
  // 标题用这个）刻意分开维护。
  // 名单的唯一真源在 scripts/data/catalog.js 的 overviewCards（core/state.js 的
  // cleanPick 也要用它校验 pick.overview，L4 不能反向引用 L6，所以只能放数据层）。
  var CARD_DEFS = DATA.overviewCards();

  // 6 张卡覆盖的是 4 个部位（front-bearing 上有 P-DE-V 和 BRG-T 两张卡，coupling/
  // base/pump-body 各一张），motor 和 seal 的主测点（MOT-DE-H/SEAL-L）不在这份
  // 名单里——这是"6 张状态卡"这个数量约束本身带来的取舍，不是遗漏。boot.js 的
  // selectPart() 需要这份名单：点击 motor/seal 的 3D 热点时，没有一张"该部位主
  // 测点"卡可跳，pick.overview 应保持不变（否则会被写成一个不在 SelectList items
  // 里的 id，下一次 render 时 SelectList 的 activeId 校验会直接抛错）。用
  // window.Scenes 转发而不是在 boot.js 里另抄一份 id 列表，避免两份真源。
  window.Scenes = window.Scenes || {};
  window.Scenes.overviewPickablePoints = CARD_DEFS
    .filter(function (def) { return def.id !== "UNIT-H"; })
    .map(function (def) { return def.id; });

  // DetailCard.badge 的文案只由 status 决定：三色语义在全场景保持一致
  // （danger=已越线的时序预警 / warn=未越线但在爬升的趋势关注 / ok=运行正常）。
  // 三色徽标文案由 DATA.badgeText(status) 提供。原来 overview.js 和 station.js 各存
  // 一份逐字相同的 BADGE_TEXT 字典，业务改"时序预警"这个词得改两处，漏一处就两页
  // 说法不一致——而这种不一致没有任何断言会发现。现在只有 catalog.js 的
  // statusText.badge 一份真源。

  // 机组健康分（0-100 的聚合指标）没有 catalog.js 那样按测点定义的 warn/stop 阈值
  // ——series.js 的 IMPACT_WEIGHTS 只是聚合权重，不是状态阈值。这里按
  // DemoData.dashboard().kpis 现有口径（"72 分 = 关注级"，见 catalog.js）回填一套
  // 仅供本场景展示用的三色阈值：< 60 异常、[60,80) 关注、>= 80 对照。这是 overview
  // 对健康分本身的展示判定，不影响 series.js 单测点的 status（那条规则的唯一真源
  // 仍在 series.js，这里不重新定义它）。
  function healthStatus(value) {
    if (value < 60) return "danger";
    if (value < 80) return "warn";
    return "ok";
  }

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

  // chart3（机组对照）需要一个具体测点才能画"该测点跨机组峰值"折线：UNIT-H 没有
  // 自己的测点，这时退回到当前聚焦部位（state.focus.partId）的主测点——这不是
  // 兜底吞错，是"选中健康分时，机组对照沿用当前关注部位"这个刻意设计，和
  // "UNIT-H 不改变 focus.partId" 是同一个设计决定的两个体现。
  function comparePointId(activePartId, pointId) {
    if (pointId !== "UNIT-H") return pointId;
    return DATA.primaryPoint(activePartId).id;
  }

  // ---------- 顶部：6 张横排可点状态卡 ----------

  // 卡片主数值必须用 s.latest（当下读数），和右栏 DetailCard 的"当前值"以及结论文案
  // 同源——否则同一个测点会在相邻两个位置显示两个不同的数字（卡片 44.26° / 详情 81°），
  // 这是最容易被现场一眼看穿的那类穿帮。
  //
  // 但 latest 按设计是"此刻"的读数（valueAtHour 在 t=0 取叙事目标值），天然不随时间
  // 窗口变化，所以切 range 时主数值确实不动。随区间变化的信息放在 note 里（区间均值 /
  // 峰值），加上卡片自己的 spark 曲线，切 range 时卡片仍有明显反馈。
  //
  // 早先这里为了让"切 range 卡片数字要变"这条断言变绿而把主数值换成了区间均值——
  // 那是让断言反过来驱动了错误的产品决策。断言本身已改成校验 note 随区间变化。
  function cardValueMeta(unitId, def) {
    if (def.id === "UNIT-H") {
      var hs = DATA.healthSeries(unitId, state.range);
      return {
        value: String(Math.round(hs.latest)),
        unit: "分",
        status: healthStatus(hs.latest),
        note: rangeLabel() + "均值 " + Math.round(hs.mean) + " 分",
      };
    }
    var s = DATA.series(unitId, def.id, state.range);
    return {
      value: fmtNum(s.latest),
      unit: s.unit,
      status: s.status,
      note: rangeLabel() + "均值 " + fmtNum(s.mean) + " · 峰值 " + fmtNum(s.peak),
    };
  }

  function renderCards(unitId) {
    var items = CARD_DEFS.map(function (def) {
      var meta = cardValueMeta(unitId, def);
      return {
        id: def.id,
        label: def.title,
        value: meta.value,
        unit: meta.unit,
        status: meta.status,
        note: meta.note,
        sparkId: "ov-spark-" + def.id,
      };
    });
    var list = window.SelectList.render({
      name: "overview-metric",
      variant: "metric",
      activeId: state.pick.overview,
      ariaLabel: "泵机组关键测点状态",
      items: items,
    });
    // 只追加一个场景专属类用于网格定位 + 横排布局（styles/06-overview.css 的
    // .overview-cards，用比 03-cards.css 的 .sl-metric 更具体的选择器覆盖排布，
    // 见该文件里的说明）——不改变 SelectList 产出的 "sl sl-metric" 基础类，组件层
    // 样式仍然只有一份真源，这里只是场景专属的排布覆盖。
    list.className += " overview-cards";
    return list;
  }

  // ---------- 中部：3D 机组态势 ----------
  //
  // .pump-map-wrap 这个类名是硬依赖：styles/05-pump3d.css 的 C1 硬依赖表用
  // `.pump-map-wrap .pump-train` 把 dashboard 场景下的 .pump-train 覆盖成
  // height:100%/min-height:0（否则 3D 只会取到默认最小高度）。05-pump3d.css 是
  // 3D 契约样式、不在本任务改动范围内，因此这个类名必须原样保留，见
  // scripts/pump3d/README.md 第 8 章 C1。

  function renderStage(activePartId) {
    return h("section", { class: "panel overview-stage-panel" }, [
      h("div", { class: "overview-stage-head" }, [
        AppState.panelTitle("P-1 输油泵机组三维态势", "空间定位"),
        h("div", { class: "map-legend" }, [
          AppState.legend("danger", "异常"),
          AppState.legend("warn", "关注"),
          AppState.legend("ok", "对照"),
        ]),
      ]),
      h("div", { class: "pump-map-wrap overview-map-wrap" }, [
        renderPumpTrain(activePartId, "dashboard"),
      ]),
    ]);
  }

  // ---------- 右栏：DetailCard ----------

  function detailMetrics(unitId, pointId) {
    if (pointId === "UNIT-H") {
      var hs = DATA.healthSeries(unitId, state.range);
      var delta = hs.latest - hs.values[0];
      return [
        { label: "当前值", value: String(Math.round(hs.latest)), unit: "分" },
        { label: "区间峰值", value: String(Math.round(hs.peak)), unit: "分" },
        { label: "较区间首值", value: withSign(delta), unit: "分" },
      ];
    }
    var s = DATA.series(unitId, pointId, state.range);
    return [
      { label: "当前值", value: fmtNum(s.latest), unit: s.unit },
      { label: "区间峰值", value: fmtNum(s.peak), unit: s.unit },
      { label: "较区间首值", value: withSign(s.delta), unit: s.unit },
    ];
  }

  function detailTags(unitId, pointId) {
    if (pointId === "UNIT-H") return ["机组聚合指标", "不关联单一部位"];
    var s = DATA.series(unitId, pointId, state.range);
    var tags = [s.type, "关注线 " + fmtNum(s.warn) + s.unit];
    if (s.stop != null) tags.push("停机线 " + fmtNum(s.stop) + s.unit);
    return tags;
  }

  function detailConclusion(unitId, pointId) {
    if (pointId === "UNIT-H") {
      var hs = DATA.healthSeries(unitId, state.range);
      var status = healthStatus(hs.latest);
      var verdict = status === "danger"
        ? "已低于安全阈值，需立即介入。"
        : status === "warn"
          ? "处于关注区间，建议持续跟踪。"
          : "运行平稳，无需处置。";
      return "机组健康分 " + Math.round(hs.latest) + " 分，" + rangeLabel() + "均值 " + Math.round(hs.mean) + " 分，" + verdict;
    }
    // 结论直接用 series.alert：与图表同源，不可能对不上。
    return DATA.series(unitId, pointId, state.range).alert;
  }

  function renderDetail(unitId, activePartId) {
    var pointId = state.pick.overview;
    var status = pointId === "UNIT-H"
      ? healthStatus(DATA.healthSeries(unitId, state.range).latest)
      : DATA.series(unitId, pointId, state.range).status;
    var title = pointId === "UNIT-H" ? "机组健康评估" : DATA.point(pointId).label;
    var kicker = (pointId === "UNIT-H" ? "健康评估 · " : "测点详情 · ") + rangeLabel();
    var comparePoint = comparePointId(activePartId, pointId);

    var card = window.DetailCard.render({
      kicker: kicker,
      title: unitId + " · " + title,
      badge: { status: status, text: DATA.badgeText(status) },
      // 3D 契约钩子：activePartLabel 必须是"当前部位"的中文名，即 state.focus.partId
      // 对应的部位——而不是选中卡关联的部位。二者在任何一次点击（状态卡或 3D 热点）
      // 之后都会保持一致（boot.js 的 selectOverviewCard/selectPart 各自会同步写完
      // 两者才 render），只有 UNIT-H 被选中时二者才可能"看起来不对应"，而那正是
      // UNIT-H 不改变 focus.partId 这条设计的体现：3D 高亮的仍是上一次关注的部位。
      activePartLabel: AppState.selectedPart().label,
      metrics: detailMetrics(unitId, pointId),
      conclusion: detailConclusion(unitId, pointId),
      tags: detailTags(unitId, pointId),
      sections: [
        {
          title: "机组对照",
          node: window.Cards.chart({
            title: "机组对照 · " + DATA.point(comparePoint).label,
            chartId: "ov-chart-compare",
            meta: "P-1 / P-2 / P-3 / P-4",
          }),
        },
      ],
      actions: [
        { action: "go-workbench", text: "进入诊断工作台", primary: true },
        { action: "go-station", text: "查看泵设备态势" },
      ],
    });
    card.className += " overview-detail";
    return card;
  }

  // ---------- 底部：chart1 主线趋势 / chart2 异常构成 ----------

  function renderChart1(pointId) {
    if (pointId === "UNIT-H") {
      return window.Cards.chart({
        title: "机组健康趋势 · " + rangeLabel(),
        chartId: "ov-chart-trend",
        meta: "0-100 分",
      });
    }
    var point = DATA.point(pointId);
    return window.Cards.chart({
      title: point.label + " 趋势 · " + rangeLabel(),
      chartId: "ov-chart-trend",
      meta: point.unit,
    });
  }

  // meta 不放选中类型名（DATA.point(pointId).type）：那会和图表自己的高亮中心
  // 文字/图例撞在一起，同一个类型名在这张卡片上出现两次
  // （applyMixReadability() 已经把高亮项的名字放进图例和中心文字里）。
  function renderChart2() {
    return window.Cards.chart({
      title: "异常类型占比 · " + rangeLabel(),
      chartId: "ov-chart-mix",
      meta: "risk type",
    });
  }

  // ---------- 头部：场景标题 + Grafana 式紧凑时间范围选择器 ----------
  //
  // 用原生 <details>/<summary> 而不是自己管一个 state.rangeOpen：展开/收起交给
  // 浏览器（不触发 render），选中某档才触发 render；render() 重建 DOM 后新的
  // <details> 默认没有 open 属性，天然回到收起态——这正是期望行为（选完自动收起），
  // 不需要额外状态，也不会出现"选完了菜单还开着"这种需要额外同步的情况。
  // 键盘可达性（summary 可 Tab 聚焦、Enter/Space 展开、Escape 收起）都是浏览器
  // 原生行为，不需要自己实现焦点陷阱。
  //
  // 菜单里的 4 个选项不走 SelectList：SelectList.render() 会自带一层
  // role="group" 容器、roving tabindex 方向键导航和"每项必须有 status"的校验，
  // 这些都是为"一组常驻可比较的选项"设计的，不适合这里"一个折叠菜单、选中即收起"
  // 的交互；直接手写 4 个 <button>，只保留 data-select/data-select-id/aria-pressed/
  // 选中态 class 这几个跟 boot.js 事件委托（selectHandlers.range）和视觉选中态
  // 相关的契约属性。
  function renderRangePicker() {
    var current = DATA.ranges().filter(function (range) { return range.key === state.range; })[0];
    return h("details", { class: "range-picker" }, [
      h("summary", { "aria-label": "时间范围" }, [
        h("span", { class: "range-picker-icon", "aria-hidden": "true", text: "◷" }),
        h("span", { class: "range-picker-label", text: current.label }),
      ]),
      h("div", { class: "range-picker-menu", role: "group", "aria-label": "选择时间范围" },
        DATA.ranges().map(function (range) {
          var active = range.key === state.range;
          return h("button", {
            type: "button",
            class: "range-option" + (active ? " active" : ""),
            "aria-pressed": active ? "true" : "false",
            dataset: { select: "range", selectId: range.key },
            text: range.label,
          });
        })),
    ]);
  }

  function renderHead() {
    return h("div", { class: "overview-head" }, [
      h("div", { class: "overview-head-title" }, [
        h("span", { class: "kicker", text: "泵机组大屏" }),
        h("strong", { text: "长岭站 P-1 输油泵机组态势" }),
      ]),
      renderRangePicker(),
    ]);
  }

  function renderOverview() {
    var unitId = AppState.selectedUnitId();
    var activePartId = state.focus.partId;
    var pointId = state.pick.overview;

    // chart1/chart2 共享同一个 "charts" 网格区域（底部一行、左右并排），因此需要
    // 一个纯布局用的包裹层——它本身不属于 Cards/SelectList/DetailCard 里的任何
    // 一类，但它的两个直接子节点都是 Cards.chart() 产出的 .card-chart，符合
    // "每个内容块要么是卡片组件、要么是承载卡片组件的布局行" 这条机械约束的精神
    // （verify/verify_scenes.py 对此有专门的判定逻辑和注释）。
    var chartsRow = h("div", { class: "overview-charts-row" }, [
      renderChart1(pointId),
      renderChart2(pointId),
    ]);

    return h("section", { class: "scene-shell overview-shell" }, [
      h("div", { class: "overview-grid" }, [
        renderHead(),
        renderCards(unitId),
        renderStage(activePartId),
        chartsRow,
        renderDetail(unitId, activePartId),
      ]),
    ]);
  }

  // ---------- 图表数据绘制（由 boot.js 在 mountChartSlots() 之后同步调用） ----------

  // healthSeries() 没有 warn 字段（健康分是"越高越好"的聚合分数，方向和振动/温度那种
  // "越高越危险"的测点相反）。直接把它塞进 ChartOptions.spark() 会在 markLine 里传入
  // undefined，语义上关注线的朝向也是反的。这里手写一份同样极简、同一主题色的迷你折
  // 线，不给 spark() 硬塞一个编造出来的阈值。
  function healthSparkOption(hs) {
    var THEME = ChartOptions.THEME;
    return {
      grid: { left: 4, right: 4, top: 8, bottom: 8 },
      xAxis: { type: "category", show: false, data: hs.labels },
      yAxis: { type: "value", show: false, min: 0, max: 100 },
      series: [{
        type: "line",
        smooth: true,
        symbol: "none",
        data: hs.values,
        lineStyle: { color: THEME.cyan, width: 2 },
      }],
    };
  }

  function healthTrendOption(hs) {
    var THEME = ChartOptions.THEME;
    return {
      color: [THEME.cyan],
      grid: { left: 44, right: 24, top: 24, bottom: 30 },
      tooltip: { trigger: "axis" },
      xAxis: {
        type: "category",
        data: hs.labels,
        axisLine: { lineStyle: { color: THEME.lineStrong } },
        axisLabel: { color: THEME.muted },
      },
      yAxis: {
        type: "value",
        name: "健康分",
        min: 0,
        max: 100,
        axisLabel: { color: THEME.muted },
        splitLine: { lineStyle: { color: THEME.lineStrong } },
      },
      series: [{ name: "机组健康分", type: "line", smooth: true, data: hs.values }],
    };
  }

  // ChartOptions.trend() 是通用的多测点/多轴构造器，不知道单条曲线该留多少余量，
  // y 轴 min/max 交给 ECharts 自动定刻度：数据量级较小时（比如底座振动 1~3.5 mm/s）
  // 自动刻度容易让曲线贴着图顶、刻度数字也可能因为小数位密集而显得拥挤。这里在
  // 调用侧按"数据 + 关注线/停机线的包围范围"显式设 min/max（留约 12% 余量），
  // 同时去掉 y 轴 name——Cards.chart 的 meta 已经显示单位，轴名重复一遍反而会和
  // 刻度数字挤在一起。只覆盖调用时拿到的 option 对象，不改 core/chartopts.js
  // 的构造器本身。
  function applyTrendReadability(option, series) {
    var values = series.values;
    var lo = Math.min.apply(null, values);
    var hi = Math.max.apply(null, values.concat([series.warn, series.stop != null ? series.stop : series.warn]));
    var pad = (hi - lo) * 0.12;
    if (pad <= 0) pad = Math.abs(hi) * 0.12 || 1;
    option.yAxis[0].min = round2(Math.max(0, lo - pad));
    option.yAxis[0].max = round2(hi + pad);
    option.yAxis[0].name = "";
    return option;
  }

  // ChartOptions.mix() 默认在每个扇区外侧画"名称 + 百分比"引出线标签，扇区角度
  // 接近时标签会互相压住；选中态还会在中心叠一份"数值 + 类型名"。这里在调用侧
  // 关掉扇区外侧标签、改用侧边图例（"只保留中心文字 + 图例"，不用引出线标签），
  // 顺手把饼图往左挪一点给右侧图例腾地方，避免同一个类型名在图上出现两处。
  function applyMixReadability(option) {
    var THEME = ChartOptions.THEME;
    option.series[0].label = { show: false };
    option.series[0].labelLine = { show: false };
    option.series[0].center = ["36%", "54%"];
    option.series[0].radius = ["44%", "66%"];
    option.legend = {
      orient: "vertical",
      right: 4,
      top: "middle",
      itemWidth: 10,
      itemHeight: 10,
      textStyle: { color: THEME.muted, fontSize: 11 },
    };
    return option;
  }

  // ChartOptions.unitBars() 把测点全名放进 y 轴(2) 的 name 和折线图例名里；在约
  // 330px 宽的右栏卡片里，这两处会跟图例本身的位置挤在一起。轴名信息已经在卡片
  // 自己的标题里出现过一次（"机组对照 · <点位全名>"），这里去掉轴名、把图例名换成
  // 简短的"峰值 (单位)"，避免同一个全名在这张窄图里重复出现还挤成一团。
  function applyCompareReadability(option, point) {
    option.yAxis[1].name = "";
    option.series[1].name = "峰值 (" + point.unit + ")";
    return option;
  }

  function drawCardSparks(unitId) {
    CARD_DEFS.forEach(function (def) {
      var id = "ov-spark-" + def.id;
      if (def.id === "UNIT-H") {
        Charts.draw(id, healthSparkOption(DATA.healthSeries(unitId, state.range)));
        return;
      }
      Charts.draw(id, ChartOptions.spark(DATA.series(unitId, def.id, state.range)));
    });
  }

  function renderOverviewCharts() {
    var unitId = AppState.selectedUnitId();
    var activePartId = state.focus.partId;
    var pointId = state.pick.overview;

    drawCardSparks(unitId);

    if (pointId === "UNIT-H") {
      Charts.draw("ov-chart-trend", healthTrendOption(DATA.healthSeries(unitId, state.range)));
    } else {
      var trendSeries = DATA.series(unitId, pointId, state.range);
      Charts.draw("ov-chart-trend", applyTrendReadability(ChartOptions.trend([trendSeries]), trendSeries));
    }

    // chart2 只随 range 换数据、随选中换高亮扇区/中心文字：三张图都跟着跳会造成
    // "一点就全乱"，异常构成本来就是"整机口径"的统计，不应该因为点了某张测点卡
    // 就换成另一份数据。
    var mixItems = DATA.anomalyMix(unitId, state.range);
    var highlightType = pointId === "UNIT-H" ? null : DATA.point(pointId).type;
    Charts.draw("ov-chart-mix", applyMixReadability(ChartOptions.mix(mixItems, highlightType)));

    var comparePoint = comparePointId(activePartId, pointId);
    var compareRows = DATA.unitCompare(comparePoint, state.range);
    Charts.draw("ov-chart-compare", applyCompareReadability(ChartOptions.unitBars(compareRows, comparePoint), DATA.point(comparePoint)));

    Charts.flush();
  }

  window.Scenes = window.Scenes || {};
  window.Scenes.renderOverview = renderOverview;
  // 供 boot.js 的 renderSceneCharts() 在 "scene === overview" 时调用：只负责往已经
  // mount 好的 Charts 槽位里 draw() 具体 option，不负责创建/挂载槽位容器本身
  // （那一步是通用的 DOM 挂接步骤，见 boot.js 的 mountChartSlots()）。
  window.Scenes.renderOverviewCharts = renderOverviewCharts;
})();
