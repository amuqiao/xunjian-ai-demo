// UI 组件层契约验证脚本（P1-G）。纯 Node，无浏览器：scripts/ui/*.js 三个文件都依赖
// window.h（scripts/core/dom.js）和 window.Pump3DContract（scripts/pump3d/contract.js），
// 这里手工搭一个极简 DOM 桩，只实现 h()/append() 真正用到的那几个方法
// （createElement/createTextNode、className/textContent/dataset、setAttribute/
// getAttribute、appendChild、addEventListener、querySelectorAll），不追求和真实 DOM
// 行为完全等价——够跑通 h() 的构建路径、够让测试用例遍历产物树即可。
//
// 用法（在仓库根或本目录执行均可）：
//   node poc/pump-demo/verify/verify_ui.js
"use strict";

var path = require("path");

// ---------- 极简 DOM 桩：只服务于 scripts/core/dom.js 的 h()/append() ----------

// 把 "data-select-id" 这种 kebab 属性名换算成 dataset 的 camelCase key（selectId），
// 只服务于下面 querySelectorAll 对 "[data-select-id]" 这一种存在性选择器的支持，
// 不追求覆盖任意合法 CSS 属性选择器语法。
function attrToDatasetKey(attr) {
  if (attr.indexOf("data-") !== 0) return null;
  var rest = attr.slice(5);
  return rest.replace(/-([a-z0-9])/g, function (all, ch) { return ch.toUpperCase(); });
}

function makeElement(tag) {
  var attrs = {};
  var listeners = {};
  var el = {
    tagName: tag,
    className: "",
    textContent: "",
    innerHTML: "",
    dataset: {},
    children: [],
    setAttribute: function (name, value) { attrs[name] = String(value); },
    getAttribute: function (name) {
      return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null;
    },
    hasAttribute: function (name) { return Object.prototype.hasOwnProperty.call(attrs, name); },
    appendChild: function (child) { el.children.push(child); return child; },
    addEventListener: function (type, handler) {
      listeners[type] = listeners[type] || [];
      listeners[type].push(handler);
    },
    // 测试用：手动派发一个 type 的事件给所有已注册监听器，用来验证 selectlist.js
    // 里 bindRovingFocus/bindRowActivation 注册的 keydown 处理器的真实行为（而不是
    // 只看它们注册没注册）。真实 DOM 没有这个方法，纯粹是测试桩。
    trigger: function (type, event) {
      (listeners[type] || []).forEach(function (handler) { handler(event); });
    },
    // 测试用：selectlist.js 的 bindRowActivation 会在 Enter/Space 时调用 target.click()
    // 桥接非 <button> 元素（目前是 table 变体的 <tr>）的键盘激活。真实 DOM 的 click()
    // 会派发一个真正冒泡的 click 事件，这里只做最简单的计数，够断言“被调用过”即可。
    click: function () { el.clicked = (el.clicked || 0) + 1; },
    // 只服务于 selectlist.js 的 roving focus / 行选择器实现在 keydown 时查子节点；
    // 本测试文件不模拟真实键盘事件的 DOM 派发，所以这里给个够用的递归实现，不强求
    // 匹配任意 CSS 选择器语法，只认 ".className" 和 "[data-xxx]" 存在性两种形式
    // （当前调用点是 container.querySelectorAll(".sl-item" 或 "[data-select-id]")）。
    querySelectorAll: function (selector) {
      var wantClass = selector.indexOf(".") === 0 ? selector.slice(1) : null;
      var wantAttrKey = null;
      if (selector.indexOf("[") === 0 && selector.slice(-1) === "]") {
        wantAttrKey = attrToDatasetKey(selector.slice(1, -1));
      }
      var out = [];
      (function walk(node) {
        if (!node || typeof node !== "object") return;
        if (wantClass && typeof node.className === "string" &&
          (" " + node.className + " ").indexOf(" " + wantClass + " ") >= 0) {
          out.push(node);
        }
        if (wantAttrKey && node.dataset && node.dataset[wantAttrKey] != null) {
          out.push(node);
        }
        if (Array.isArray(node.children)) node.children.forEach(walk);
      })(el);
      return out;
    },
    focus: function () {},
  };
  return el;
}

global.window = {};
global.document = {
  createElement: function (tag) { return makeElement(tag); },
  createElementNS: function (ns, tag) { return makeElement(tag); },
  createTextNode: function (text) { return { nodeType: 3, textContent: text }; },
};

var PUMP3D_DIR = path.join(__dirname, "..", "scripts", "pump3d");
var CORE_DIR = path.join(__dirname, "..", "scripts", "core");
var UI_DIR = path.join(__dirname, "..", "scripts", "ui");

// 加载顺序与 index.html 一致：契约（L1）先于 core（L4）dom.js，dom.js 先于 ui/*（L5）。
require(path.join(PUMP3D_DIR, "contract.js"));
require(path.join(CORE_DIR, "dom.js"));
// 浏览器里 <script> 标签顶层的 var h/window.h 都落在同一个全局对象（window）上，
// 所以 scripts/ui/*.js 里裸写的 h(...) 才能解析到 dom.js 挂的那个函数。Node 的
// CommonJS 模块各自有独立作用域，window 只是我们手搭的一个普通对象，裸标识符 h
// 不会自动落到 global 上，这里手动补上这一步，纯粹是补 Node 环境和浏览器全局作用域
// 的差异，不是给被测代码本身加兜底。
global.h = window.h;
global.append = window.append;
require(path.join(UI_DIR, "cards.js"));
require(path.join(UI_DIR, "selectlist.js"));
require(path.join(UI_DIR, "detailcard.js"));
require(path.join(UI_DIR, "overlay.js"));
require(path.join(UI_DIR, "agentdialog.js"));

var Cards = window.Cards;
var SelectList = window.SelectList;
var DetailCard = window.DetailCard;
var Overlay = window.Overlay;
var AgentDialog = window.AgentDialog;

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

// 递归遍历 h() 产物树，收集满足 matchFn 的节点（用于结构断言，不依赖真实 querySelector）。
function queryAll(node, matchFn) {
  var out = [];
  (function walk(n) {
    if (!n || typeof n !== "object") return;
    if (matchFn(n)) out.push(n);
    if (Array.isArray(n.children)) n.children.forEach(walk);
  })(node);
  return out;
}

function hasClass(node, cls) {
  return typeof node.className === "string" && (" " + node.className + " ").indexOf(" " + cls + " ") >= 0;
}

// =====================================================================================
// 1. Cards：硬校验都真的会抛错
// =====================================================================================

(function cardsThrows() {
  checkThrows("Cards.metric 缺 label 抛错", function () {
    return Cards.metric({ value: 1, status: "ok" });
  });
  checkThrows("Cards.metric 缺 value 抛错", function () {
    return Cards.metric({ label: "主测点", status: "ok" });
  });
  checkThrows("Cards.metric status 非法抛错", function () {
    return Cards.metric({ label: "主测点", value: 1, status: "critical" });
  });
  checkThrows("Cards.chart 缺 chartId 抛错", function () {
    return Cards.chart({ title: "关键指标趋势" });
  });
  checkThrows("Cards.chart 缺 title 抛错", function () {
    return Cards.chart({ chartId: "trendChart" });
  });
  checkThrows("Cards.evidence tags 超过 3 个抛错", function () {
    return Cards.evidence({ status: "warn", conclusion: "相位差与频谱并发", tags: ["a", "b", "c", "d"] });
  });
  checkThrows("Cards.evidence status 非法抛错", function () {
    return Cards.evidence({ status: "critical", conclusion: "x", tags: [] });
  });
  checkThrows("Cards.evidence 缺 conclusion 抛错", function () {
    return Cards.evidence({ status: "ok", tags: [] });
  });
})();

// =====================================================================================
// 2. Cards：正常输入的产物结构
// =====================================================================================

(function cardsStructure() {
  var m = Cards.metric({ label: "主测点振动", value: 5.82, unit: "mm/s", status: "danger", note: "关注线 4.5", sparkId: "spark-1" });
  check("Cards.metric 根节点 class 含 card-metric 与 status", m.tagName === "article" && hasClass(m, "card-metric") && hasClass(m, "danger"));
  var metricSlot = queryAll(m, function (n) { return n.dataset && n.dataset.chartSlot === "spark-1"; });
  check("Cards.metric 的 sparkId 渲染为 [data-chart-slot] 占位容器", metricSlot.length === 1);

  var c = Cards.chart({ title: "机组健康对比", meta: "P-1/P-2", chartId: "unitChart", tall: true });
  check("Cards.chart 根节点 class 含 card-chart 与 tall", hasClass(c, "card-chart") && hasClass(c, "tall"));
  var chartSlot = queryAll(c, function (n) { return n.dataset && n.dataset.chartSlot === "unitChart"; });
  check("Cards.chart 的 chartId 渲染为 [data-chart-slot] 占位容器", chartSlot.length === 1);

  var e = Cards.evidence({ status: "warn", conclusion: "振动、相位与频谱证据已会聚", tags: ["振动", "相位差"] });
  check("Cards.evidence 根节点 class 含 card-evidence 与 status", hasClass(e, "card-evidence") && hasClass(e, "warn"));
  var tags = queryAll(e, function (n) { return hasClass(n, "tag"); });
  check("Cards.evidence 的 tags 渲染出等量 .tag", tags.length === 2);
})();

// =====================================================================================
// 3. SelectList：硬校验都真的会抛错
// =====================================================================================

(function selectListThrows() {
  var items = [
    { id: "a", label: "A", status: "ok" },
    { id: "b", label: "B", status: "warn" },
  ];
  checkThrows("SelectList variant 非法抛错", function () {
    return SelectList.render({ name: "sl-variant-illegal", variant: "nope", activeId: "a", ariaLabel: "测试", items: items });
  });
  checkThrows("SelectList activeId 不在 items 里抛错", function () {
    return SelectList.render({ name: "sl-activeid-missing", variant: "row", activeId: "z", ariaLabel: "测试", items: items });
  });
  checkThrows("SelectList items 空数组抛错", function () {
    return SelectList.render({ name: "sl-items-empty", variant: "row", activeId: "a", ariaLabel: "测试", items: [] });
  });
  checkThrows("SelectList items[].status 非法抛错", function () {
    return SelectList.render({
      name: "sl-status-illegal", variant: "row", activeId: "a", ariaLabel: "测试",
      items: [{ id: "a", label: "A", status: "critical" }],
    });
  });

  SelectList.resetRenderPass();
  SelectList.render({ name: "sl-dup", variant: "row", activeId: "a", ariaLabel: "测试", items: items });
  checkThrows("SelectList 同名在同一轮 render 内重复抛错", function () {
    return SelectList.render({ name: "sl-dup", variant: "row", activeId: "a", ariaLabel: "测试", items: items });
  });
  SelectList.resetRenderPass();
})();

// =====================================================================================
// 4. SelectList：正常输入的产物结构
// =====================================================================================

(function selectListStructure() {
  SelectList.resetRenderPass();
  var container = SelectList.render({
    name: "overview-metric",
    variant: "metric",
    activeId: "coupling",
    ariaLabel: "输油泵部位状态",
    items: [
      { id: "coupling", label: "联轴器", value: 5.82, unit: "mm/s", status: "danger", note: "主测点振动" },
      { id: "seal", label: "密封", value: 2.1, unit: "mm/s", status: "ok" },
      { id: "base", label: "底座", status: "warn", badge: "关注" },
    ],
  });

  check("SelectList 容器 class 为 sl sl-metric", container.className === "sl sl-metric");
  check("SelectList 容器 role=group", container.getAttribute("role") === "group");
  check("SelectList 容器 aria-label 透传", container.getAttribute("aria-label") === "输油泵部位状态");
  check("SelectList 容器 data-select 写入 name", container.dataset.select === "overview-metric");

  var buttons = queryAll(container, function (n) { return n.tagName === "button"; });
  check("SelectList 渲染出等量 .sl-item 按钮", buttons.length === 3);

  var active = buttons.filter(function (b) { return b.dataset.selectId === "coupling"; })[0];
  var inactive = buttons.filter(function (b) { return b.dataset.selectId === "seal"; })[0];

  check("激活项 class 含 active", hasClass(active, "active") && hasClass(active, "danger"));
  check("激活项 aria-pressed=true，tabindex=0", active.getAttribute("aria-pressed") === "true" && active.getAttribute("tabindex") === "0");
  check("非激活项 class 不含 active", !hasClass(inactive, "active") && hasClass(inactive, "ok"));
  check("非激活项 aria-pressed=false，tabindex=-1", inactive.getAttribute("aria-pressed") === "false" && inactive.getAttribute("tabindex") === "-1");
  check("每个 .sl-item 都带 data-select=name", buttons.every(function (b) { return b.dataset.select === "overview-metric"; }));

  var sparkContainer = SelectList.render({
    name: "workbench-record",
    variant: "row",
    activeId: "r1",
    ariaLabel: "巡检记录",
    items: [{ id: "r1", label: "R-1", status: "ok", sparkId: "spark-r1" }],
  });
  var sparkSlot = queryAll(sparkContainer, function (n) { return n.dataset && n.dataset.chartSlot === "spark-r1"; });
  check("SelectList items[].sparkId 渲染为 [data-chart-slot] 占位容器", sparkSlot.length === 1);
  SelectList.resetRenderPass();
})();

// =====================================================================================
// 5. SelectList table 变体：硬校验都真的会抛错（含反例：缺列/非法 type/cells 缺 key/
//    activeId 不存在等，构造出真实会破坏契约的输入，断言它们真的抛错）
// =====================================================================================

var TABLE_COLUMNS = [
  { key: "aiFlag", label: "", width: 28, type: "status-dot" },
  { key: "dateShift", label: "日期·班次", width: 110, type: "text" },
  { key: "partLabel", label: "部位", width: 80, type: "text" },
  { key: "item", label: "检查项", width: 150, type: "text" },
  { key: "result", label: "人工结论", width: 90, type: "text" },
  { key: "aiFlagText", label: "AI 质检口径", width: 110, type: "badge-icon" },
];

var TABLE_ITEMS = [
  {
    id: "REC-20260722-N", status: "danger",
    cells: { dateShift: "07-22 夜班", partLabel: "联轴器", item: "轴承状态", result: "未见异常", aiFlagText: "人机冲突" },
  },
  {
    id: "REC-20260721-A", status: "ok",
    cells: { dateShift: "07-21 白班", partLabel: "密封", item: "泄漏检查", result: "正常", aiFlagText: "一致" },
  },
];

(function selectListTableThrows() {
  checkThrows("SelectList variant=table 缺 columns 抛错", function () {
    SelectList.resetRenderPass();
    return SelectList.render({
      name: "sl-table-no-columns", variant: "table", activeId: "REC-20260722-N", ariaLabel: "巡检记录",
      items: TABLE_ITEMS,
    });
  });

  checkThrows("SelectList table columns 为空数组抛错", function () {
    SelectList.resetRenderPass();
    return SelectList.render({
      name: "sl-table-columns-empty", variant: "table", activeId: "REC-20260722-N", ariaLabel: "巡检记录",
      columns: [], items: TABLE_ITEMS,
    });
  });

  checkThrows("SelectList columns[].key 缺失抛错", function () {
    SelectList.resetRenderPass();
    var badColumns = TABLE_COLUMNS.slice();
    badColumns[2] = { label: "部位", width: 80, type: "text" };
    return SelectList.render({
      name: "sl-table-key-missing", variant: "table", activeId: "REC-20260722-N", ariaLabel: "巡检记录",
      columns: badColumns, items: TABLE_ITEMS,
    });
  });

  checkThrows("SelectList columns[].type 非法抛错", function () {
    SelectList.resetRenderPass();
    var badColumns = TABLE_COLUMNS.slice();
    badColumns[1] = { key: "dateShift", label: "日期·班次", width: 110, type: "number" };
    return SelectList.render({
      name: "sl-table-bad-type", variant: "table", activeId: "REC-20260722-N", ariaLabel: "巡检记录",
      columns: badColumns, items: TABLE_ITEMS,
    });
  });

  checkThrows("SelectList columns[].width 非正数抛错", function () {
    SelectList.resetRenderPass();
    var badColumns = TABLE_COLUMNS.slice();
    badColumns[3] = { key: "item", label: "检查项", width: 0, type: "text" };
    return SelectList.render({
      name: "sl-table-width-invalid", variant: "table", activeId: "REC-20260722-N", ariaLabel: "巡检记录",
      columns: badColumns, items: TABLE_ITEMS,
    });
  });

  checkThrows("SelectList table 某行 cells 缺列抛错", function () {
    SelectList.resetRenderPass();
    var badItems = [{
      id: "REC-BAD", status: "warn",
      cells: { dateShift: "07-20 白班", partLabel: "联轴器", item: "轴承状态", result: "未见异常" },
      // 缺 aiFlagText，对应 badge-icon 列
    }];
    return SelectList.render({
      name: "sl-table-missing-cell", variant: "table", activeId: "REC-BAD", ariaLabel: "巡检记录",
      columns: TABLE_COLUMNS, items: badItems,
    });
  });

  checkThrows("SelectList table cells[key] 非字符串抛错", function () {
    SelectList.resetRenderPass();
    var badItems = [{
      id: "REC-NUM", status: "ok",
      cells: { dateShift: "07-19 白班", partLabel: "密封", item: "泄漏检查", result: 100, aiFlagText: "一致" },
    }];
    return SelectList.render({
      name: "sl-table-cell-type", variant: "table", activeId: "REC-NUM", ariaLabel: "巡检记录",
      columns: TABLE_COLUMNS, items: badItems,
    });
  });

  checkThrows("SelectList table items[].status 非法抛错", function () {
    SelectList.resetRenderPass();
    var badItems = [{
      id: "REC-STATUS", status: "critical",
      cells: { dateShift: "x", partLabel: "x", item: "x", result: "x", aiFlagText: "x" },
    }];
    return SelectList.render({
      name: "sl-table-status-illegal", variant: "table", activeId: "REC-STATUS", ariaLabel: "巡检记录",
      columns: TABLE_COLUMNS, items: badItems,
    });
  });

  checkThrows("SelectList table activeId 不在 items 里抛错", function () {
    SelectList.resetRenderPass();
    return SelectList.render({
      name: "sl-table-activeid-missing", variant: "table", activeId: "NOPE", ariaLabel: "巡检记录",
      columns: TABLE_COLUMNS, items: TABLE_ITEMS,
    });
  });

  SelectList.resetRenderPass();
})();

// =====================================================================================
// 6. SelectList table 变体：正常输入的产物结构 + 可访问性语义 + 键盘激活行为
// =====================================================================================

(function selectListTableStructure() {
  SelectList.resetRenderPass();
  var table = SelectList.render({
    name: "workbench-record",
    variant: "table",
    activeId: "REC-20260722-N",
    ariaLabel: "巡检记录",
    columns: TABLE_COLUMNS,
    items: TABLE_ITEMS,
  });

  check("SelectList table 根节点是 <table>，class 为 sl sl-table", table.tagName === "table" && table.className === "sl sl-table");
  check("SelectList table 根节点 aria-label 透传", table.getAttribute("aria-label") === "巡检记录");
  check("SelectList table 根节点 data-select 写入 name", table.dataset.select === "workbench-record");

  var cols = queryAll(table, function (n) { return n.tagName === "col"; });
  check("SelectList table 渲染等量 <col>", cols.length === TABLE_COLUMNS.length, cols.length);

  // 这条断言原来写的是 cols[1].getAttribute("style") === "width:110px"——测的是一个
  // 魔法字符串，而不是契约。改成百分比之后它就红了，但它本该测的东西其实没变：
  // columns[].width 是**相对权重**，组件负责把它换算成占总宽的百分比，这样表格恒等于
  // 容器宽度、窄屏下各列等比收窄（写死 px 时 6 列合计 568px 超过容器宽，table-layout:fixed
  // 下会整体溢出、最右一列直接消失，实测过）。所以这里验三件事：全是百分比、总和为
  // 100%、任意两列的比值等于声明宽度的比值。换列定义时这三条依然成立，不需要改断言。
  var colPercents = cols.map(function (col) {
    var style = col.getAttribute("style");
    if (!/^width:\d+(\.\d+)?%$/.test(style)) throw new Error("col 宽度不是百分比: " + style);
    return parseFloat(style.slice("width:".length));
  });
  var percentSum = 0;
  colPercents.forEach(function (value) { percentSum += value; });
  check("SelectList table 的 <col> 宽度全部是百分比且总和为 100%",
    Math.abs(percentSum - 100) < 0.001, percentSum);

  var declaredRatio = TABLE_COLUMNS[1].width / TABLE_COLUMNS[2].width;
  var renderedRatio = colPercents[1] / colPercents[2];
  check("SelectList table 的列宽比例与 columns[].width 声明的比例一致（width 是相对权重）",
    Math.abs(declaredRatio - renderedRatio) < 0.001, [declaredRatio, renderedRatio]);

  var ths = queryAll(table, function (n) { return n.tagName === "th"; });
  check(
    "SelectList table 渲染等量 <th scope=col>，文本为 column.label",
    ths.length === TABLE_COLUMNS.length &&
    ths.every(function (th) { return th.getAttribute("scope") === "col"; }) &&
    ths[1].textContent === "日期·班次" && ths[0].textContent === ""
  );

  var rows = queryAll(table, function (n) { return hasClass(n, "sl-table-row"); });
  check("SelectList table 渲染等量 <tr> 行", rows.length === TABLE_ITEMS.length);
  check("SelectList table 的行不借用 .sl-item 视觉类（行为/样式解耦）", rows.every(function (r) { return !hasClass(r, "sl-item"); }));

  var activeRow = rows.filter(function (r) { return r.dataset.selectId === "REC-20260722-N"; })[0];
  var inactiveRow = rows.filter(function (r) { return r.dataset.selectId === "REC-20260721-A"; })[0];

  check("SelectList table 激活行 class 含 active/danger", hasClass(activeRow, "active") && hasClass(activeRow, "danger"));
  check("SelectList table 激活行 aria-selected=true，tabindex=0", activeRow.getAttribute("aria-selected") === "true" && activeRow.getAttribute("tabindex") === "0");
  check("SelectList table 非激活行 aria-selected=false，tabindex=-1", inactiveRow.getAttribute("aria-selected") === "false" && inactiveRow.getAttribute("tabindex") === "-1");
  check("SelectList table 每行都带 data-select=name", rows.every(function (r) { return r.dataset.select === "workbench-record"; }));

  var dots = queryAll(activeRow, function (n) { return hasClass(n, "sl-table-dot"); });
  check(
    "SelectList table status-dot 列渲染圆点，颜色取 item.status，aria-label 给出文本状态（不能只靠颜色）",
    dots.length === 1 && hasClass(dots[0], "danger") && dots[0].getAttribute("aria-label") === "异常"
  );

  var textCells = queryAll(activeRow, function (n) { return n.tagName === "td" && n.textContent === "07-22 夜班"; });
  check("SelectList table text 列直接渲染 cells[key] 文本", textCells.length === 1);

  var badgeIcons = queryAll(activeRow, function (n) { return hasClass(n, "sl-table-badge-icon"); });
  var badgeTexts = queryAll(activeRow, function (n) { return hasClass(n, "sl-table-badge-text"); });
  check(
    "SelectList table badge-icon 列渲染图标（按 status 取 ⚠/△/✓）+ cells[key] 文本",
    badgeIcons.length === 1 && badgeIcons[0].textContent === "⚠" && badgeIcons[0].getAttribute("aria-hidden") === "true" &&
    badgeTexts.length === 1 && badgeTexts[0].textContent === "人机冲突"
  );

  // 可访问性：Enter/Space 都要能触发选中。<tr> 没有原生键盘激活语义，
  // bindRowActivation 必须把它桥接成 click()——不是只“注册了监听器”就算数，
  // 这里真的派发事件，断言 click() 真的被调用。
  table.trigger("keydown", { key: "Enter", target: inactiveRow, preventDefault: function () {} });
  check("SelectList table 行 Enter 键触发 click()", inactiveRow.clicked === 1);
  table.trigger("keydown", { key: " ", target: inactiveRow, preventDefault: function () {} });
  check("SelectList table 行 Space 键也触发 click()", inactiveRow.clicked === 2);

  // 反向验证：如果这条守卫坏了（比如把 tagName 判断删掉），button 变体的 Enter 会被
  // 重复触发一次 click()（浏览器原生激活之外又多一次），这条断言就会变红。
  table.trigger("keydown", { key: "Enter", target: table, preventDefault: function () {} });
  check("SelectList table 对没有 data-select-id 的元素（表格自身）Enter 不触发 click()", table.clicked === undefined);

  // 可访问性：Tab 顺序之外，方向键 roving focus 在 table 变体里也要生效（复用同一套机制）。
  table.trigger("keydown", { key: "ArrowDown", target: activeRow, preventDefault: function () {} });
  check(
    "SelectList table 方向键 roving focus 生效：焦点行 tabindex 从 0 移到下一行",
    activeRow.getAttribute("tabindex") === "-1" && inactiveRow.getAttribute("tabindex") === "0"
  );

  SelectList.resetRenderPass();
})();

// =====================================================================================
// 6b. SelectList：table 变体引入的“行为按 data-select-id 识别”不能影响旧变体（回归）
// =====================================================================================

(function selectListRegressionForOldVariants() {
  SelectList.resetRenderPass();
  var rowContainer = SelectList.render({
    name: "sl-guard-button",
    variant: "row",
    activeId: "a",
    ariaLabel: "测试",
    items: [{ id: "a", label: "A", status: "ok" }, { id: "b", label: "B", status: "ok" }],
  });
  var buttons = queryAll(rowContainer, function (n) { return n.tagName === "button"; });

  rowContainer.trigger("keydown", { key: "ArrowDown", target: buttons[0], preventDefault: function () {} });
  check(
    "SelectList 旧变体（row）的方向键 roving focus 在改用 [data-select-id] 选择器后仍生效（回归）",
    buttons[0].getAttribute("tabindex") === "-1" && buttons[1].getAttribute("tabindex") === "0"
  );

  rowContainer.trigger("keydown", { key: "Enter", target: buttons[0], preventDefault: function () {} });
  check(
    "SelectList 对 <button> 型 item 的 Enter 不重复触发 click()（浏览器已原生处理，bindRowActivation 应跳过）",
    buttons[0].clicked === undefined
  );

  SelectList.resetRenderPass();
})();

// =====================================================================================
// 7. DetailCard：硬校验都真的会抛错
// =====================================================================================

(function detailCardThrows() {
  var baseValid = {
    kicker: "当前主线事件",
    title: "P-1 联轴器疑似不对中",
    badge: { status: "danger", text: "P1" },
    metrics: [{ label: "主测点", value: "5.82", unit: "mm/s" }, { label: "相位差", value: "-81.06", unit: "°" }],
    conclusion: "振动、相位与频谱证据已会聚，人工记录尚未确认异常。",
    tags: ["振动", "相位差"],
    actions: [{ action: "go-workbench", text: "进入诊断工作台", primary: true }],
  };

  checkThrows("DetailCard metrics 只有 1 个抛错", function () {
    return DetailCard.render(mergeOptions(baseValid, { metrics: [baseValid.metrics[0]] }));
  });
  checkThrows("DetailCard metrics 有 4 个抛错", function () {
    return DetailCard.render(mergeOptions(baseValid, {
      metrics: [baseValid.metrics[0], baseValid.metrics[1], baseValid.metrics[0], baseValid.metrics[1]],
    }));
  });
  checkThrows("DetailCard conclusion 超过 80 字抛错", function () {
    return DetailCard.render(mergeOptions(baseValid, { conclusion: repeatChar("证", 81) }));
  });
  check("DetailCard conclusion 恰好 80 字不抛错", (function () {
    var threw = false;
    try {
      DetailCard.render(mergeOptions(baseValid, { conclusion: repeatChar("证", 80) }));
    } catch (e) {
      threw = true;
    }
    return !threw;
  })());
  checkThrows("DetailCard tags 超过 3 个抛错", function () {
    return DetailCard.render(mergeOptions(baseValid, { tags: ["a", "b", "c", "d"] }));
  });
  checkThrows("DetailCard badge.status 非法抛错", function () {
    return DetailCard.render(mergeOptions(baseValid, { badge: { status: "critical", text: "P1" } }));
  });
  checkThrows("DetailCard 缺 title 抛错", function () {
    return DetailCard.render(mergeOptions(baseValid, { title: undefined }));
  });
})();

function mergeOptions(base, overrides) {
  var out = {};
  Object.keys(base).forEach(function (key) { out[key] = base[key]; });
  Object.keys(overrides).forEach(function (key) { out[key] = overrides[key]; });
  return out;
}

function repeatChar(ch, times) {
  var out = "";
  var i;
  for (i = 0; i < times; i += 1) out += ch;
  return out;
}

// =====================================================================================
// 8. DetailCard：正常输入的产物结构，含 activePartLabel 契约钩子
// =====================================================================================

(function detailCardStructure() {
  var card = DetailCard.render({
    kicker: "当前主线事件",
    title: "P-1 联轴器疑似不对中",
    badge: { status: "danger", text: "P1" },
    metrics: [
      { label: "主测点", value: "5.82", unit: "mm/s" },
      { label: "相位差", value: "-81.06", unit: "°" },
      { label: "知识命中", value: "4", unit: "项" },
    ],
    conclusion: "人工记录未确认异常，但振动、相位和频谱证据已会聚。",
    tags: ["振动", "相位差", "频谱"],
    sections: [{ title: "关键指标趋势", node: { tagName: "div", className: "chart-box", children: [] } }],
    actions: [
      { action: "go-workbench", text: "进入诊断工作台", primary: true },
      { action: "go-station", text: "查看泵设备态势" },
    ],
    activePartLabel: "联轴器",
  });

  check("DetailCard 根节点 class 为 card-detail", card.tagName === "article" && card.className === "card-detail");

  var badges = queryAll(card, function (n) { return hasClass(n, "badge"); });
  check("DetailCard 渲染 badge（含 status 类）", badges.length === 1 && hasClass(badges[0], "danger") && badges[0].textContent === "P1");

  var metricNodes = queryAll(card, function (n) { return hasClass(n, "detail-metric"); });
  check("DetailCard 渲染 3 个 metric", metricNodes.length === 3);

  var tagNodes = queryAll(card, function (n) { return hasClass(n, "tag"); });
  check("DetailCard 渲染 3 个 tag", tagNodes.length === 3);

  var actionButtons = queryAll(card, function (n) { return n.tagName === "button"; });
  check("DetailCard 渲染 2 个 action 按钮，含 data-action", actionButtons.length === 2 &&
    actionButtons[0].dataset.action === "go-workbench" && actionButtons[1].dataset.action === "go-station");
  check("DetailCard 的 primary action 用 primary-action 类", hasClass(actionButtons[0], "primary-action"));
  check("DetailCard 的非 primary action 用 plain-button 类", hasClass(actionButtons[1], "plain-button"));

  var activePartAttr = window.Pump3DContract.ACTIVE_LABEL_ATTR;
  var activePartNodes = queryAll(card, function (n) { return n.hasAttribute && n.hasAttribute(activePartAttr); });
  check(
    "DetailCard 的 activePartLabel 渲染出唯一 [" + activePartAttr + "]，文本为部位中文名",
    activePartNodes.length === 1 && activePartNodes[0].textContent === "联轴器"
  );

  var cardWithoutActivePart = DetailCard.render({
    kicker: "机组对照",
    title: "P-2 对照机组",
    badge: { status: "ok", text: "对照" },
    metrics: [{ label: "健康分", value: "92", unit: "" }, { label: "振动", value: "1.2", unit: "mm/s" }],
    conclusion: "对照机组运行正常，无需处置。",
    tags: [],
    actions: [],
  });
  var noActivePartNodes = queryAll(cardWithoutActivePart, function (n) { return n.hasAttribute && n.hasAttribute(activePartAttr); });
  check("不传 activePartLabel 时不渲染 [" + activePartAttr + "]", noActivePartNodes.length === 0);
})();

// =====================================================================================
// 9. Overlay：硬校验都真的会抛错
// =====================================================================================

(function overlayThrows() {
  var baseValid = {
    open: true,
    title: "Agent 辅助问答",
    kicker: "当前诊断",
    body: h("div", { class: "probe-body" }, [h("span", { text: "内容" })]),
    actions: [{ action: "go-confirm", text: "进入复核确认" }],
    onCloseAction: "close-agent-dialog",
  };

  checkThrows("Overlay 缺 title 抛错", function () {
    return Overlay.render(mergeOptions(baseValid, { title: undefined }));
  });
  checkThrows("Overlay 的 open 非布尔值抛错", function () {
    return Overlay.render(mergeOptions(baseValid, { open: "true" }));
  });
  checkThrows("Overlay 缺 onCloseAction 抛错", function () {
    return Overlay.render(mergeOptions(baseValid, { onCloseAction: undefined }));
  });
  checkThrows("Overlay 的 body 为空抛错", function () {
    return Overlay.render(mergeOptions(baseValid, { body: undefined }));
  });
  checkThrows("Overlay 的 actions 非数组抛错", function () {
    return Overlay.render(mergeOptions(baseValid, { actions: undefined }));
  });
  checkThrows("Overlay actions[] 缺 action 抛错", function () {
    return Overlay.render(mergeOptions(baseValid, { actions: [{ text: "仅文本" }] }));
  });
  checkThrows("Overlay actions[] 缺 text 抛错", function () {
    return Overlay.render(mergeOptions(baseValid, { actions: [{ action: "go-confirm" }] }));
  });
  checkThrows("Overlay 的 kicker 为空字符串抛错", function () {
    return Overlay.render(mergeOptions(baseValid, { kicker: "" }));
  });
  checkThrows("Overlay 的 panelClass 为空字符串抛错", function () {
    return Overlay.render(mergeOptions(baseValid, { panelClass: "" }));
  });
  checkThrows("Overlay 的 wide 非布尔值抛错", function () {
    return Overlay.render(mergeOptions(baseValid, { wide: 1 }));
  });
  checkThrows("Overlay 的 closeDisabled 非布尔值抛错", function () {
    return Overlay.render(mergeOptions(baseValid, { closeDisabled: "yes" }));
  });
})();

// =====================================================================================
// 10. Overlay：正常输入的产物结构（open/关闭态、class、aria-hidden、data-action、
//    panelClass 透传、body 转发、actions 渲染）
// =====================================================================================

(function overlayStructure() {
  var bodyMarker = h("div", { class: "probe-body-marker", text: "探针内容" });
  var openOverlay = Overlay.render({
    open: true,
    title: "历史案例增强诊断",
    kicker: "Agent 辅助问答",
    body: [bodyMarker],
    actions: [
      { action: "go-confirm", text: "进入复核确认" },
      { action: "close-agent-dialog", text: "回到诊断", primary: true },
    ],
    onCloseAction: "close-agent-dialog",
    panelClass: "agent-dialog",
    wide: true,
  });

  check("Overlay 打开态：外层 class 含 overlay-layer 与 open", hasClass(openOverlay, "overlay-layer") && hasClass(openOverlay, "open"));
  check("Overlay 打开态：aria-hidden=false", openOverlay.getAttribute("aria-hidden") === "false");

  var masks = queryAll(openOverlay, function (n) { return hasClass(n, "overlay-mask"); });
  check("Overlay 渲染唯一 .overlay-mask，且 data-action=onCloseAction", masks.length === 1 && masks[0].dataset.action === "close-agent-dialog");

  var panels = queryAll(openOverlay, function (n) { return hasClass(n, "overlay-panel"); });
  check(
    "Overlay 面板 class 含 overlay-panel/overlay-wide/panelClass(agent-dialog)",
    panels.length === 1 && hasClass(panels[0], "overlay-wide") && hasClass(panels[0], "agent-dialog")
  );
  check("Overlay 面板 role=dialog 且 aria-label=title", panels[0].getAttribute("role") === "dialog" && panels[0].getAttribute("aria-label") === "历史案例增强诊断");

  var kickers = queryAll(openOverlay, function (n) { return hasClass(n, "kicker"); });
  check("Overlay 渲染 kicker 文本", kickers.length === 1 && kickers[0].textContent === "Agent 辅助问答");

  var titles = queryAll(openOverlay, function (n) { return hasClass(n, "overlay-title"); });
  check("Overlay 渲染 title 文本", titles.length === 1 && titles[0].textContent === "历史案例增强诊断");

  var markers = queryAll(openOverlay, function (n) { return hasClass(n, "probe-body-marker"); });
  check("Overlay 把 body 原样转发进 .overlay-body", markers.length === 1 && markers[0].textContent === "探针内容");

  var headButtons = queryAll(openOverlay, function (n) { return n.tagName === "button" && hasClass(n, "tool-btn"); });
  check("Overlay 头部关闭按钮 data-action=onCloseAction", headButtons.length === 1 && headButtons[0].dataset.action === "close-agent-dialog");

  var lockedOverlay = Overlay.render({
    open: true,
    title: "文档入库演示",
    body: h("div", {}),
    actions: [],
    onCloseAction: "close-ingest",
    closeDisabled: true,
  });
  var lockedMasks = queryAll(lockedOverlay, function (n) { return hasClass(n, "overlay-mask"); });
  var lockedHeadButtons = queryAll(lockedOverlay, function (n) { return n.tagName === "button" && hasClass(n, "tool-btn"); });
  check("Overlay closeDisabled=true 时遮罩不带 data-action", lockedMasks.length === 1 && lockedMasks[0].dataset.action === undefined);
  check(
    "Overlay closeDisabled=true 时头部关闭按钮禁用且不带 data-action",
    lockedHeadButtons.length === 1 &&
      lockedHeadButtons[0].dataset.action === undefined &&
      lockedHeadButtons[0].getAttribute("disabled") === "disabled"
  );

  var footButtons = queryAll(openOverlay, function (n) { return n.tagName === "button" && (hasClass(n, "primary-action") || hasClass(n, "plain-button")); });
  check("Overlay 渲染 2 个 actions 按钮，含 data-action", footButtons.length === 2 &&
    footButtons[0].dataset.action === "go-confirm" && footButtons[1].dataset.action === "close-agent-dialog");
  check("Overlay 的 primary action 用 primary-action 类", hasClass(footButtons[1], "primary-action") && !hasClass(footButtons[0], "primary-action"));

  var closedOverlay = Overlay.render({
    open: false,
    title: "当前异常智能诊断",
    body: h("div", {}),
    actions: [],
    onCloseAction: "close-agent-dialog",
  });
  check("Overlay 关闭态依然渲染完整结构（不拆 DOM）", !hasClass(closedOverlay, "open"));
  check("Overlay 关闭态 aria-hidden=true", closedOverlay.getAttribute("aria-hidden") === "true");
  var closedFoot = queryAll(closedOverlay, function (n) { return hasClass(n, "overlay-foot"); });
  check("Overlay 的 actions 为空数组时不渲染 .overlay-foot", closedFoot.length === 0);
})();

// =====================================================================================
// 11. AgentDialog：硬校验都真的会抛错
// =====================================================================================

(function agentDialogThrows() {
  var baseDialog = {
    id: "workbench-agent",
    title: "诊断工作台 Agent 辅助问答",
    kicker: "诊断依据解释",
    summary: "围绕 P-1 疑似不对中事件。",
    emptyText: "请选择一个问题。",
    questions: [
      {
        id: "why",
        label: "为什么判断为疑似不对中？",
        answer: "因为相位差、振动和 2X 频谱证据会聚。",
        hits: [{ kind: "rule", text: "不对中诊断专家规则" }]
      }
    ]
  };

  checkThrows("AgentDialog 的 open 非布尔值抛错", function () {
    return AgentDialog.render({ open: "true", dialog: baseDialog, activeQuestionId: "", onCloseAction: "close-agent-dialog" });
  });
  checkThrows("AgentDialog 缺 dialog 抛错", function () {
    return AgentDialog.render({ open: true, activeQuestionId: "", onCloseAction: "close-agent-dialog" });
  });
  checkThrows("AgentDialog dialog.questions 为空数组抛错", function () {
    return AgentDialog.render({ open: true, dialog: mergeOptions(baseDialog, { questions: [] }), activeQuestionId: "", onCloseAction: "close-agent-dialog" });
  });
  checkThrows("AgentDialog questions[] 缺 answer 抛错", function () {
    return AgentDialog.render({
      open: true,
      dialog: mergeOptions(baseDialog, { questions: [{ id: "why", label: "为什么？", hits: [] }] }),
      activeQuestionId: "",
      onCloseAction: "close-agent-dialog"
    });
  });
  checkThrows("AgentDialog questions[].hits 非数组抛错", function () {
    return AgentDialog.render({
      open: true,
      dialog: mergeOptions(baseDialog, { questions: [{ id: "why", label: "为什么？", answer: "x", hits: "bad" }] }),
      activeQuestionId: "",
      onCloseAction: "close-agent-dialog"
    });
  });
  checkThrows("AgentDialog hit kind 非法抛错", function () {
    return AgentDialog.render({
      open: true,
      dialog: mergeOptions(baseDialog, { questions: [{ id: "why", label: "为什么？", answer: "x", hits: [{ kind: "citation", text: "旧引用" }] }] }),
      activeQuestionId: "",
      onCloseAction: "close-agent-dialog"
    });
  });
  checkThrows("AgentDialog activeQuestionId 非字符串抛错", function () {
    return AgentDialog.render({ open: true, dialog: baseDialog, activeQuestionId: null, onCloseAction: "close-agent-dialog" });
  });
  checkThrows("AgentDialog activeQuestionId 不属于当前 dialog 抛错", function () {
    return AgentDialog.render({ open: true, dialog: baseDialog, activeQuestionId: "missing", onCloseAction: "close-agent-dialog" });
  });
})();

// =====================================================================================
// 12. AgentDialog：正常输入的产物结构（问题按钮、静态回答、命中标签不可点）
// =====================================================================================

(function agentDialogStructure() {
  var dialogData = {
    id: "workbench-agent",
    title: "诊断工作台 Agent 辅助问答",
    kicker: "诊断依据解释",
    summary: "围绕 P-1 疑似不对中事件。",
    emptyText: "请选择一个问题。",
    questions: [
      {
        id: "why",
        label: "为什么优先关注这个部位？",
        answer: "主要依据驱动端轴承振动与相位差。",
        hits: [{ kind: "rule", text: "不对中诊断专家规则" }]
      },
      {
        id: "points",
        label: "哪些测点支持这个判断？",
        answer: "主要依据 P-DE-V 与 COUP-PH。",
        hits: [
          { kind: "current", text: "P-DE-V 振动趋势" },
          { kind: "workcard", text: "输油泵对中作业标准模板卡" }
        ]
      }
    ]
  };

  var dialog = AgentDialog.render({
    open: true,
    dialog: dialogData,
    activeQuestionId: "points",
    onCloseAction: "close-agent-dialog"
  });

  var panels = queryAll(dialog, function (n) { return hasClass(n, "agent-dialog"); });
  check("AgentDialog 复用 Overlay，面板 class 含 agent-dialog", panels.length === 1);

  var buttons = queryAll(dialog, function (n) { return hasClass(n, "agent-dialog-question"); });
  check("AgentDialog 渲染等量问题按钮", buttons.length === 2);
  var active = buttons.filter(function (b) { return b.dataset.agentQuestionId === "points"; })[0];
  var inactive = buttons.filter(function (b) { return b.dataset.agentQuestionId === "why"; })[0];
  check("AgentDialog 激活问题按钮带 active 与 data-agent-question-id", !!active && hasClass(active, "active"));
  check("AgentDialog 非激活问题按钮不带 active", !!inactive && !hasClass(inactive, "active"));
  check("AgentDialog 问题按钮统一走 select-agent-question action", buttons.every(function (b) { return b.dataset.action === "select-agent-question"; }));

  var answers = queryAll(dialog, function (n) { return hasClass(n, "agent-dialog-answer"); });
  check("AgentDialog 渲染唯一回答区", answers.length === 1);
  check("AgentDialog 回答区展示当前问题答案", answers[0].children.some(function (n) { return n.textContent === "主要依据 P-DE-V 与 COUP-PH。"; }));

  var hits = queryAll(dialog, function (n) { return hasClass(n, "agent-dialog-hit"); });
  check("AgentDialog 渲染静态命中文档标签", hits.length === 2);
  check("AgentDialog 命中标签不可点、没有文档跳转 action/data-select-id", hits.every(function (hit) {
    return hit.tagName === "span" && hit.dataset.action == null && hit.dataset.selectId == null;
  }));

  var emptyDialog = AgentDialog.render({
    open: false,
    dialog: dialogData,
    activeQuestionId: "",
    onCloseAction: "close-agent-dialog"
  });
  var emptyAnswers = queryAll(emptyDialog, function (n) { return hasClass(n, "agent-dialog-answer") && hasClass(n, "empty"); });
  check("AgentDialog 未选中问题时渲染 emptyText", emptyAnswers.length === 1);
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
