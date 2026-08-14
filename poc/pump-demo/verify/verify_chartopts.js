// scripts/core/chartopts.js 契约验证脚本（P1-F）。纯 Node，无浏览器：chartopts.js 是
// 纯函数模块，不碰 DOM，唯一的外部依赖是数据层的 window.DemoData 和手工注入的
// ChartOptions.setTheme()——都可以在 Node 里搭一个假 window 之后直接 require。
//
// 用法（在仓库根或本目录执行均可）：
//   node poc/pump-demo/verify/verify_chartopts.js
"use strict";

var path = require("path");

global.window = {};

var DATA_DIR = path.join(__dirname, "..", "scripts", "data");
var PUMP3D_DIR = path.join(__dirname, "..", "scripts", "pump3d");
var CORE_DIR = path.join(__dirname, "..", "scripts", "core");

// 加载顺序必须和 index.html 里 <script> 的顺序一致：契约先于数据，seed 先于 catalog，
// catalog/knowledge 先于 series/records，series/records 先于 index，数据层先于
// chartopts.js（chartopts.js 的 unitBars() 要用 window.DemoData.point()）。
require(path.join(PUMP3D_DIR, "contract.js"));
// 加载顺序必须与 index.html 的 <script> 顺序一致：data/index.js 会断言它依赖的每个
// 派生器都已就位（DemoKb / DemoGraph 等），少一个就在这里指名道姓地报错。
// 新增数据集文件时，这份清单要跟着加——否则表现是本脚本直接抛错而不是断言失败。
require(path.join(DATA_DIR, "seed.js"));
require(path.join(DATA_DIR, "schema.js"));
require(path.join(DATA_DIR, "catalog.js"));
require(path.join(DATA_DIR, "knowledge.js"));
require(path.join(DATA_DIR, "kb-dataset.js"));
require(path.join(DATA_DIR, "graph-spec.js"));
require(path.join(DATA_DIR, "series.js"));
require(path.join(DATA_DIR, "records.js"));
require(path.join(DATA_DIR, "kb.js"));
require(path.join(DATA_DIR, "graph.js"));
require(path.join(DATA_DIR, "index.js"));
require(path.join(CORE_DIR, "chartopts.js"));

var DemoData = window.DemoData;
var ChartOptions = window.ChartOptions;

var passCount = 0;
var failures = [];

function check(label, condition) {
  if (condition) {
    passCount += 1;
    console.log("PASS " + label);
  } else {
    failures.push(label);
    console.log("FAIL " + label);
  }
}

function checkThrows(label, fn) {
  var threw = false;
  var err = null;
  var caught = { value: undefined };
  try {
    caught.value = fn();
  } catch (e) {
    threw = true;
    err = e;
  }
  if (threw) {
    passCount += 1;
    console.log("PASS " + label + "（抛错：" + err.message + "）");
  } else {
    failures.push(label);
    console.log("FAIL " + label + "（未抛错，返回了 " + JSON.stringify(caught.value) + "）");
  }
}

// 手工构造的测试主题：字段名与 ChartOptions.setTheme() 要求的一致，数值取自
// styles/01-tokens.css 现有的 CSS 变量值，但这里不依赖 CSS 文件本身——纯粹是
// "把主题值喂给纯函数"这件事的 Node 版本，等价于浏览器里 boot.js 读
// getComputedStyle(document.documentElement) 之后调用同一个 setTheme()。
var TEST_THEME = {
  cyan: "#4bb3d3",
  green: "#30c69d",
  amber: "#eeb44a",
  red: "#ff625c",
  ink: "#eef6fa",
  muted: "#8ca2b2",
  lineStrong: "rgba(120, 186, 213, 0.48)"
};

// ---------- 0. setTheme() 契约 ----------

(function setThemeContract() {
  checkThrows("未调用 setTheme() 前调用 trend() 抛错", function () {
    return ChartOptions.trend([DemoData.series("P-1", "P-DE-V", "7d")]);
  });
  checkThrows("setTheme() 缺字段抛错", function () {
    return ChartOptions.setTheme({ cyan: "#000" });
  });
  ChartOptions.setTheme(TEST_THEME);
  check("setTheme() 之后 ChartOptions.THEME 就是注入的对象", ChartOptions.THEME === TEST_THEME);
})();

// ---------- 1. trend()：series 数量、轴配置、markLine 关注线数值与 warn 一致 ----------

(function trendContract() {
  var sVib = DemoData.series("P-1", "P-DE-V", "7d"); // mm/s
  var sTemp = DemoData.series("P-1", "BRG-T", "7d"); // °C
  var sPress = DemoData.series("P-1", "PUMP-P", "7d"); // MPa
  var option = ChartOptions.trend([sVib, sTemp, sPress]);

  check("trend() series 数量 === 3（实测 " + option.series.length + "）", option.series.length === 3);
  check("trend() yAxis 数量 === 3 个不同 unit（实测 " + option.yAxis.length + "）", option.yAxis.length === 3);
  check("trend() xAxis.data === 第一条 series 的 labels", JSON.stringify(option.xAxis.data) === JSON.stringify(sVib.labels));

  var vibAxisIndex = option.series[0].yAxisIndex;
  var tempAxisIndex = option.series[1].yAxisIndex;
  var pressAxisIndex = option.series[2].yAxisIndex;
  check(
    "trend() 3 个不同 unit 的 series 各自落在不同的 yAxisIndex（实测 " + [vibAxisIndex, tempAxisIndex, pressAxisIndex].join(",") + "）",
    vibAxisIndex !== tempAxisIndex && tempAxisIndex !== pressAxisIndex && vibAxisIndex !== pressAxisIndex
  );
  check("trend() yAxis[0].name === series[0].unit（实测 " + option.yAxis[vibAxisIndex].name + "）", option.yAxis[vibAxisIndex].name === sVib.unit);

  check(
    "trend() series[0].markLine 关注线数值 === DemoData.series(...).warn（期望 " + sVib.warn + "，实测 " + option.series[0].markLine.data[0].yAxis + "）",
    option.series[0].markLine.data[0].yAxis === sVib.warn
  );
  check(
    "trend() series[1].markLine 关注线数值 === DemoData.series(...).warn（期望 " + sTemp.warn + "，实测 " + option.series[1].markLine.data[0].yAxis + "）",
    option.series[1].markLine.data[0].yAxis === sTemp.warn
  );
  check(
    "trend() series[2].markLine 关注线数值 === DemoData.series(...).warn（期望 " + sPress.warn + "，实测 " + option.series[2].markLine.data[0].yAxis + "）",
    option.series[2].markLine.data[0].yAxis === sPress.warn
  );

  // 同一 unit 的两条 series 应该共用同一根 y 轴（不重复开轴）。
  var sBase = DemoData.series("P-1", "BASE-V", "7d"); // mm/s，与 P-DE-V 同单位
  var sameUnitOption = ChartOptions.trend([sVib, sBase]);
  check(
    "trend() 同 unit 的两条 series 共用同一根 yAxis（实测 yAxis 数量 " + sameUnitOption.yAxis.length + "）",
    sameUnitOption.yAxis.length === 1 && sameUnitOption.series[0].yAxisIndex === sameUnitOption.series[1].yAxisIndex
  );

  checkThrows("trend([]) 抛错", function () { return ChartOptions.trend([]); });
})();

// ---------- 2. spark()：无轴迷你折线 ----------

(function sparkContract() {
  var s = DemoData.series("P-1", "P-DE-V", "24h");
  var option = ChartOptions.spark(s);
  check("spark() xAxis.show === false", option.xAxis.show === false);
  check("spark() yAxis.show === false", option.yAxis.show === false);
  check("spark() series 数量 === 1（实测 " + option.series.length + "）", option.series.length === 1);
  check("spark() series[0].data === series.values", JSON.stringify(option.series[0].data) === JSON.stringify(s.values));
  check(
    "spark() markLine 关注线数值 === warn（期望 " + s.warn + "，实测 " + option.series[0].markLine.data[0].yAxis + "）",
    option.series[0].markLine.data[0].yAxis === s.warn
  );
  checkThrows("spark(undefined) 抛错", function () { return ChartOptions.spark(undefined); });
})();

// ---------- 3. mix()：环形占比 + 高亮某一类 ----------

(function mixContract() {
  var items = DemoData.anomalyMix("P-1", "7d");
  var highlightType = items[0].name;
  var option = ChartOptions.mix(items, highlightType);

  check("mix() series[0].data 数量 === items 数量（实测 " + option.series[0].data.length + "）", option.series[0].data.length === items.length);

  var highlightIndex = -1;
  option.series[0].data.forEach(function (d, index) {
    if (d.name === highlightType) highlightIndex = index;
  });
  check("mix() 高亮项被找到（实测 index=" + highlightIndex + "）", highlightIndex >= 0);
  check("mix() 高亮项 selected === true", option.series[0].data[highlightIndex].selected === true);
  check(
    "mix() 非高亮项 selected === false",
    option.series[0].data.every(function (d, index) { return index === highlightIndex || d.selected === false; })
  );
  check("mix() 中心文字 title.subtext === 高亮类型名（实测 " + option.title.subtext + "）", option.title.subtext === highlightType);
  check("mix() 中心文字 title.text === 高亮项 value + \"%\"（实测 " + option.title.text + "）", option.title.text === items[0].value + "%");

  var noHighlightOption = ChartOptions.mix(items, null);
  check("mix() 不传 highlightType 时不生成 title", noHighlightOption.title === undefined);

  checkThrows("mix() 未知高亮类型抛错", function () { return ChartOptions.mix(items, "NOPE"); });
  checkThrows("mix([]) 抛错", function () { return ChartOptions.mix([], null); });
})();

// ---------- 4. unitBars()：柱（健康分）+ 线（选中测点跨机组峰值）双轴 ----------

(function unitBarsContract() {
  var rows = DemoData.unitCompare("P-DE-V", "7d");
  var option = ChartOptions.unitBars(rows, "P-DE-V");
  var point = DemoData.point("P-DE-V");

  check("unitBars() yAxis 数量 === 2（实测 " + option.yAxis.length + "）", option.yAxis.length === 2);
  check("unitBars() series 数量 === 2（实测 " + option.series.length + "）", option.series.length === 2);
  check("unitBars() series[0].type === \"bar\"（健康分）", option.series[0].type === "bar");
  check("unitBars() series[1].type === \"line\"（跨机组峰值）", option.series[1].type === "line");
  check("unitBars() series[1].yAxisIndex === 1（挂在第二根轴上）", option.series[1].yAxisIndex === 1);
  check(
    "unitBars() series[0].data === rows.health（实测 " + JSON.stringify(option.series[0].data) + "）",
    JSON.stringify(option.series[0].data) === JSON.stringify(rows.map(function (r) { return r.health; }))
  );
  check(
    "unitBars() series[1].data === rows.peak（实测 " + JSON.stringify(option.series[1].data) + "）",
    JSON.stringify(option.series[1].data) === JSON.stringify(rows.map(function (r) { return r.peak; }))
  );
  check("unitBars() xAxis.data === rows 的 unitId 顺序", JSON.stringify(option.xAxis.data) === JSON.stringify(rows.map(function (r) { return r.unitId; })));
  check("unitBars() yAxis[1].name === 测点 label（实测 " + option.yAxis[1].name + "）", option.yAxis[1].name === point.label);

  checkThrows("unitBars([], \"P-DE-V\") 抛错", function () { return ChartOptions.unitBars([], "P-DE-V"); });
  checkThrows("unitBars(rows, \"NOPE\") 抛错（未知测点）", function () { return ChartOptions.unitBars(rows, "NOPE"); });
})();

// ---------- 5. graph()：知识图谱固定坐标关系图（阶段三 G2） ----------

(function graphContract() {
  var graphData = DemoData.graphData();
  var SPEC = window.DemoGraphSpec;
  var option = ChartOptions.graph(graphData);

  check(
    "graph() 节点数 === DemoData.graphData().nodes.length（实测 " + option.series[0].data.length + "）",
    option.series[0].data.length === graphData.nodes.length
  );
  check(
    "graph() 边数 === DemoData.graphData().edges.length（实测 " + option.series[0].links.length + "）",
    option.series[0].links.length === graphData.edges.length
  );
  check("graph() series[0].layout === \"none\"（实测 " + option.series[0].layout + "）", option.series[0].layout === "none");
  check(
    "graph() series[0].coordinateSystem === \"cartesian2d\"",
    option.series[0].coordinateSystem === "cartesian2d"
  );

  // 每个节点的 value 原样透传 graphData 里已经算好的 x/y（不重新布局），且落在
  // graph-spec.js 声明的自己那条列带内——后者是数据层 assertGraphData 已经钉过的
  // 不变量，这里只额外确认 ChartOptions.graph() 没有把它们改坏。
  var nodeByIdInGraphData = {};
  graphData.nodes.forEach(function (node) { nodeByIdInGraphData[node.id] = node; });
  var allValuesMatch = option.series[0].data.every(function (item) {
    var source = nodeByIdInGraphData[item.id];
    return source && item.value[0] === source.x && item.value[1] === source.y;
  });
  check("graph() 节点 value 原样等于 graphData 节点的 [x, y]（未重新布局）", allValuesMatch);

  var allInBand = option.series[0].data.every(function (item) {
    var source = nodeByIdInGraphData[item.id];
    var band = SPEC.bands[source.group];
    return band && item.value[0] >= band[0] && item.value[0] <= band[1];
  });
  check("graph() 每类节点的 x 都落在 graph-spec.js 声明的列带内", allInBand);

  // 边两端引用的节点必须都在 nodes 里能查到。
  var nodeIdSet = {};
  option.series[0].data.forEach(function (item) { nodeIdSet[item.id] = true; });
  var allEdgeEndsExist = option.series[0].links.every(function (link) {
    return nodeIdSet[link.source] === true && nodeIdSet[link.target] === true;
  });
  check("graph() 每条边的 source/target 都能在 nodes 里查到", allEdgeEndsExist);

  // spine：第二条 lines 系列的 coords 必须与 graphData.spine 顺序一致、逐个连续
  // （长度相同、每个坐标点等于对应 spine 节点的 [x, y]），不能中途断开或跳过节点。
  var spineSeries = option.series[1];
  check("graph() series[1].type === \"lines\"（主线流光）", spineSeries.type === "lines");
  check("graph() series[1].polyline === true（一条整路径，不是分段线段）", spineSeries.polyline === true);
  var spineCoords = spineSeries.data[0].coords;
  check(
    "graph() spine 坐标点数 === graphData.spine.length（实测 " + spineCoords.length + "）",
    spineCoords.length === graphData.spine.length
  );
  var spineContinuous = graphData.spine.every(function (nodeId, index) {
    var source = nodeByIdInGraphData[nodeId];
    return spineCoords[index][0] === source.x && spineCoords[index][1] === source.y;
  });
  check("graph() spine 坐标与 graphData.spine 顺序逐个一致（连续不断）", spineContinuous);

  // 默认态：不传 opts 时完全静止，effect.show 必须是 false（"仅交互时播一次"的
  // CPU 取舍在 option 层面的落地，见 chartopts.js 顶部注释）。
  check("graph() 不传 opts 时 series[1].effect.show === false（默认静止）", spineSeries.effect.show === false);

  // opts.spineEffect === true 时才打开流光。
  var effectOnOption = ChartOptions.graph(graphData, { spineEffect: true });
  check("graph({ spineEffect: true }) 时 series[1].effect.show === true", effectOnOption.series[1].effect.show === true);

  // opts.focusId：非邻居节点/边被压暗，邻居和自身保持不透明。
  var focusId = graphData.spine[0];
  var neighborIds = { };
  neighborIds[focusId] = true;
  graphData.edges.forEach(function (edge) {
    if (edge[0] === focusId) neighborIds[edge[1]] = true;
    if (edge[1] === focusId) neighborIds[edge[0]] = true;
  });
  var focusOption = ChartOptions.graph(graphData, { focusId: focusId });
  var dimmedCorrectly = focusOption.series[0].data.every(function (item) {
    var expectFull = neighborIds[item.id] === true;
    return expectFull ? item.itemStyle.opacity === 1 : item.itemStyle.opacity === 0.15;
  });
  check("graph({ focusId }) 时非邻居节点 itemStyle.opacity === 0.15、邻居 / 自身保持 1", dimmedCorrectly);

  checkThrows("graph() 未知 focusId 抛错", function () {
    return ChartOptions.graph(graphData, { focusId: "NOPE" });
  });
  checkThrows("graph(null) 抛错", function () { return ChartOptions.graph(null); });
  checkThrows("graph({ nodes: [] }) 抛错", function () { return ChartOptions.graph({ nodes: [], edges: [], spine: [] }); });

  check(
    "ChartOptions.GRAPH_SPINE_EFFECT_MS 是正数（实测 " + ChartOptions.GRAPH_SPINE_EFFECT_MS + "）",
    typeof ChartOptions.GRAPH_SPINE_EFFECT_MS === "number" && ChartOptions.GRAPH_SPINE_EFFECT_MS > 0
  );
})();

// ---------- 汇总 ----------

console.log("");
if (failures.length === 0) {
  console.log("ALL CHECKS PASSED（" + passCount + " 项断言）");
  process.exit(0);
} else {
  console.log("FAILED（" + failures.length + " 项失败 / 共 " + (passCount + failures.length) + " 项断言）：");
  failures.forEach(function (label) {
    console.log("  - " + label);
  });
  process.exit(1);
}
