// 状态机契约验证脚本。纯 Node，无浏览器：core/state.js 是一个往 window 上挂
// AppState 的普通脚本，这里搭一个假 window（含假 localStorage）之后 require 即可。
//
// 用法：node poc/diagnosis-flow/verify/verify_state.js
//
// ---- 这个脚本要防的两类问题 ----
//
// 1. 派生量的真值表写错。canExecute / isDivergent / canOpen 这几个判据决定了整条
//    流程能不能走通，而它们错了的表现是"按钮该亮的时候不亮"或"不该亮的时候亮了"，
//    两者都不抛异常。所以这里逐条列真值表，而不是只测几个顺手的组合。
//
// 2. 持久化脏状态。所有断言如果都从一份干净的 localStorage 起跑，那么"某个能通过
//    清洗、但会让场景渲染直接抛错的持久值"这一整类 bug 完全测不到。pump-demo 正是
//    栽在这里：pick 存了一个合法但不在该字段字典里的值，通过了清洗，然后在渲染时
//    抛错 —— 顶栏还在、内容全空，而且状态已落盘，刷新也救不回来。
//    下面第 3 节专门构造畸形持久状态。
"use strict";

var path = require("path");

var ROOT = path.join(__dirname, "..");
var DOMAIN_FILES = [
  "00-meta.js", "01-taxonomy.js", "02-records.js", "03-series.js", "04-vision.js",
  "05-diagnosis.js", "06-review.js", "07-report.js", "08-agentqa.js", "09-kb.js"
];

function makeLocalStorage(initial) {
  var store = {};
  if (initial !== undefined) store["diagnosis-flow-v1-state"] = JSON.stringify(initial);
  return {
    getItem: function (key) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    setItem: function (key, value) { store[key] = value; },
    removeItem: function (key) { delete store[key]; },
    dump: function () { return store; }
  };
}

// persisted === undefined 表示"干净的 localStorage"（首次打开）。
function load(persisted) {
  global.window = { localStorage: makeLocalStorage(persisted) };
  var files = DOMAIN_FILES.map(function (n) { return path.join(ROOT, "domain-skeleton", n); });
  files.push(path.join(ROOT, "scripts", "schema.js"));
  files.push(path.join(ROOT, "scripts", "core", "state.js"));
  files.forEach(function (file) {
    delete require.cache[require.resolve(file)];
    require(file);
  });
  return global.window;
}

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

function expectThrow(label, fn) {
  var threw = false;
  try { fn(); } catch (err) { threw = true; }
  check(label + " → 抛错", threw);
}

// ================================================================ 1. 默认状态

console.log("== 1. 默认状态 ==");

var win = load();
var AppState = win.AppState;
var S = AppState.value;
var META = win.DOMAIN_META;
var REVIEW = win.DOMAIN_REVIEW;

check("首屏落在工作台", S.scene === "workbench");
check("首屏无子屏", S.detail === "");
check("焦点对象来自 entry", S.focus.objectId === META.entry.objectId);
check("焦点部位来自 entry", S.focus.partId === META.entry.partId);
check("选中记录来自 entry", S.pick.workbench === META.entry.recordId);
check("默认复核人来自 defaultReviewerId", S.review.reviewerId === META.defaultReviewerId);
check("默认未表决", S.review.vote === "");
check("默认未选结论", S.review.outcomeId === "");
check("默认未执行", S.review.executed === false);
check("默认未归档", S.archived === false);
check("默认复测状态为 null", S.review.retestPassed === null);
check("流程条起点是质检", S.flowVisited.length === 1 && S.flowVisited[0] === "inspection");
check("默认时间范围是第一个区间", S.range === win.DOMAIN_SERIES.ranges()[0].key);

// ================================================================ 2. 派生量真值表

console.log("");
console.log("== 2. 派生量真值表 ==");

var suggestion = AppState.suggestedOutcome();
check("入口记录能取到 AI 建议结论", !!suggestion);

// ---- canOpen ----
check("canOpen(workbench) 恒真", AppState.canOpen("workbench") === true);
check("canOpen(review) 恒真", AppState.canOpen("review") === true);
check("canOpen(knowledge) 恒真", AppState.canOpen("knowledge") === true);
check("canOpen(archive) 未执行时为假", AppState.canOpen("archive") === false);
S.review.executed = true;
check("canOpen(archive) 执行后为真", AppState.canOpen("archive") === true);
S.review.executed = false;

// ---- isDivergent ----
var other = REVIEW.outcomes.filter(function (o) { return o.id !== suggestion.id; })[0];
check("未选结论时无分歧", AppState.isDivergent() === false);
S.review.outcomeId = suggestion.id;
check("选中 AI 建议时无分歧", AppState.isDivergent() === false);
S.review.outcomeId = other.id;
check("选中其它结论时有分歧", AppState.isDivergent() === true);

// ---- noteRequired ----
check("分歧时理由必填", AppState.noteRequired() === true);
S.review.outcomeId = suggestion.id;
check("无分歧时理由非必填", AppState.noteRequired() === false);

// ---- missingFields / canExecute ----
S.review.outcomeId = suggestion.id;
S.review.fields = AppState.defaultFields(suggestion.id);
S.review.note = "";
var requiredIds = suggestion.fields.filter(function (f) { return REVIEW.fields[f].required; });
check("刚选结论时必填项都还空着（共 " + requiredIds.length + " 项）",
  AppState.missingFields().length === requiredIds.length);
check("必填项没填齐时不可执行", AppState.canExecute() === false);

requiredIds.forEach(function (fieldId) {
  var field = REVIEW.fields[fieldId];
  S.review.fields[fieldId] = field.type === "checkbox" ? [field.options[0].id] : field.options[0].id;
});
check("必填项填齐后 missingFields 为空", AppState.missingFields().length === 0);
check("无分歧 + 必填齐 + 空意见 → 可执行", AppState.canExecute() === true);

// ---- 分歧路径的闸门 ----
S.review.outcomeId = other.id;
S.review.fields = AppState.defaultFields(other.id);
other.fields.filter(function (f) { return REVIEW.fields[f].required; }).forEach(function (fieldId) {
  var field = REVIEW.fields[fieldId];
  S.review.fields[fieldId] = field.type === "checkbox" ? [field.options[0].id] : field.options[0].id;
});
S.review.note = "";
check("有分歧 + 必填齐 + 空意见 → 不可执行（这是分歧必填理由的机械落点）",
  AppState.canExecute() === false);
S.review.note = "   ";
check("有分歧 + 意见只有空白字符 → 仍不可执行", AppState.canExecute() === false);
S.review.note = "占位复核依据";
check("有分歧 + 填了理由 → 可执行", AppState.canExecute() === true);

// ---- 未选结论时恒不可执行 ----
S.review.outcomeId = "";
check("未选结论时恒不可执行", AppState.canExecute() === false);

// ---- reuseUnlocked ----
var unlockOutcome = REVIEW.outcomes.filter(function (o) { return o.unlocksReuse; })[0];
var lockOutcome = REVIEW.outcomes.filter(function (o) { return !o.unlocksReuse; })[0];
S.review.outcomeId = unlockOutcome.id;
S.archived = false;
check("未归档时二次命中不解锁", AppState.reuseUnlocked() === false);
S.archived = true;
check("归档 + 解锁型结论 → 二次命中解锁", AppState.reuseUnlocked() === true);
S.review.outcomeId = lockOutcome.id;
check("归档 + 非解锁型结论 → 二次命中不解锁", AppState.reuseUnlocked() === false);

// ---- retestFailed ----
S.review.retestPassed = null;
check("复测未表态时 retestFailed 为假", AppState.retestFailed() === false);
S.review.retestPassed = true;
check("复测通过时 retestFailed 为假", AppState.retestFailed() === false);
S.review.retestPassed = false;
check("复测不通过时 retestFailed 为真", AppState.retestFailed() === true);

// ================================================================ 3. 脏持久状态清洗

console.log("");
console.log("== 3. 脏持久状态清洗（这一整类 bug 从干净状态起跑是测不到的）==");

function loadWith(patch) {
  var base = {
    scene: "workbench", detail: "", range: "7d",
    focus: { objectId: "OBJ-A", partId: "PART-1" },
    pick: {
      workbench: "REC-001",
      trend: { pointId: null },
      vision: { frameId: null, zoomOpen: false },
      knowledge: { categoryId: null, docId: null, chunkIndex: null, ingestStep: 0, ingestOpen: false }
    },
    agent: { open: false, contextId: "", questionId: "", skillId: "", phase: "idle" },
    review: {
      reviewerId: "reviewer-a", vote: "", outcomeId: "", fields: {},
      note: "", executed: false, retestPassed: null
    },
    archived: false, flowVisited: ["inspection"]
  };
  Object.keys(patch).forEach(function (key) { base[key] = patch[key]; });
  return load(base).AppState.value;
}

check("未知场景退回工作台", loadWith({ scene: "nowhere" }).scene === "workbench");
check("未知子屏退回空", loadWith({ scene: "workbench", detail: "hologram" }).detail === "");
check("未知时间范围退回第一个区间", loadWith({ range: "999d" }).range === "7d");

var cleaned = loadWith({ focus: { objectId: "OBJ-X", partId: "PART-X" } });
check("悬空对象退回 entry 对象", cleaned.focus.objectId === META.entry.objectId);
check("悬空部位退回 entry 部位", cleaned.focus.partId === META.entry.partId);

// 子屏只属于工作台：scene=knowledge 且 detail=trend 是"字段都合法但语义矛盾"的脏
// 状态，不清掉的话知识库页会被时序子屏整屏盖住。
check("非工作台场景强制清空子屏",
  loadWith({ scene: "knowledge", detail: "trend" }).detail === "");

// 记录字典必须是"当前对象的记录"，不是全部记录。用更宽的字典正是 pump-demo 那次
// 整页空白的根因。
check("其它对象的记录不被当作当前对象的合法选中项",
  loadWith({ focus: { objectId: "OBJ-A", partId: "PART-1" },
    pick: { workbench: "REC-004" } }).pick.workbench !== "REC-004");

var ingest = loadWith({
  pick: { knowledge: { categoryId: null, docId: null, chunkIndex: null, ingestStep: 3, ingestOpen: true } }
});
check("入库动画的中间态不持久化（定时器不会跨刷新恢复，否则永远卡在第 3 步）",
  ingest.pick.knowledge.ingestStep === 0 && ingest.pick.knowledge.ingestOpen === false);

var ingestDone = loadWith({
  pick: { knowledge: { categoryId: null, docId: null, chunkIndex: null,
    ingestStep: win.DOMAIN_KB.ingestion().length, ingestOpen: true } }
});
check("入库动画的完成态可以持久化",
  ingestDone.pick.knowledge.ingestStep === win.DOMAIN_KB.ingestion().length);

var chunk = loadWith({
  pick: { knowledge: { categoryId: "cat-std", docId: "DOC-STD", chunkIndex: 99, ingestStep: 0, ingestOpen: false } }
});
check("越界的 chunkIndex 被清掉（换数据集后正文变短就会出现）", chunk.pick.knowledge.chunkIndex === null);

var agentMid = loadWith({ agent: { open: true, contextId: "workbench", questionId: "wb-q1", phase: "thinking" } });
check("Agent 的 thinking 中间态不持久化（否则刷新后永远停在检索中）",
  agentMid.agent.phase === "answered");

var agentSkill = loadWith({
  agent: { open: true, contextId: "workbench", questionId: "wb-q1", skillId: "multi-evidence", phase: "answered" }
});
check("合法的 Agent Skill 选择可以持久化", agentSkill.agent.skillId === "multi-evidence");

var agentSkillBad = loadWith({
  agent: { open: true, contextId: "workbench", questionId: "wb-q1", skillId: "skill-x", phase: "answered" }
});
check("悬空的 Agent Skill 选择被清掉", agentSkillBad.agent.skillId === "");

var agentBad = loadWith({ agent: { open: true, contextId: "nowhere", questionId: "x", phase: "answered" } });
check("悬空的 Agent 上下文导致浮层关闭", agentBad.agent.open === false);

var reviewBad = loadWith({
  review: { reviewerId: "nobody", vote: "agree", outcomeId: "nope", fields: { crew: "crew-x" },
    note: "x", executed: true, retestPassed: true }
});
check("悬空复核人退回默认", reviewBad.review.reviewerId === META.defaultReviewerId);
check("非法表决退回空", reviewBad.review.vote === "");
check("悬空结论退回空", reviewBad.review.outcomeId === "");
check("未选结论时 executed 强制为假", reviewBad.review.executed === false);
check("未执行时 retestPassed 强制为 null", reviewBad.review.retestPassed === null);

var fieldBad = loadWith({
  review: { reviewerId: "reviewer-a", vote: "accept", outcomeId: "fix",
    fields: { crew: "crew-x", flags: ["flag-x", "flag-handover"] },
    note: "", executed: false, retestPassed: null }
});
check("字段里悬空的下拉取值被清掉", fieldBad.review.fields.crew === "");
check("字段里悬空的勾选项被过滤，合法的保留",
  fieldBad.review.fields.flags.length === 1 && fieldBad.review.fields.flags[0] === "flag-handover");

var archivedBad = loadWith({ archived: true, review: { executed: false, outcomeId: "" } });
check("未执行时 archived 强制为假", archivedBad.archived === false);

var flowBad = loadWith({ flowVisited: ["inspection", "task", "station", "trend"] });
check("流程条里混入的非法步骤被过滤",
  flowBad.flowVisited.indexOf("task") < 0 && flowBad.flowVisited.indexOf("station") < 0);
check("流程条恒含起点 inspection", loadWith({ flowVisited: [] }).flowVisited.indexOf("inspection") === 0);

var flowDerived = loadWith({
  scene: "review",
  review: { reviewerId: "reviewer-a", vote: "accept", outcomeId: "fix", fields: {},
    note: "", executed: true, retestPassed: null }
});
check("流程条按状态派生：选了结论就点亮复核", flowDerived.flowVisited.indexOf("review") >= 0);
check("流程条按状态派生：执行后点亮归档", flowDerived.flowVisited.indexOf("archive") >= 0);

// ================================================================ 4. 运行期入口抛错

console.log("");
console.log("== 4. 运行期入口：未知 id 必须抛错，不能悄悄退回默认 ==");

// 这与第 3 节是两条不同的路径：那里处理的是磁盘上可能来自旧版本的数据，退回默认；
// 这里处理的是当前这次交互刚发生的操作，值对不上说明代码有 bug 或契约被破坏，
// 必须立刻炸出来。两者都要校验，但"校验不过怎么办"必须分开写。
expectThrow("objectById 未知 id", function () { AppState.objectById("OBJ-X"); });
expectThrow("partById 未知 id", function () { AppState.partById("PART-X"); });
expectThrow("pointById 未知 id", function () { AppState.pointById("PT-X"); });
expectThrow("recordById 未知 id", function () { AppState.recordById("REC-X"); });
expectThrow("frameById 未知 id", function () { AppState.frameById("FRM-X"); });
expectThrow("outcomeById 未知 id", function () { AppState.outcomeById("nope"); });
expectThrow("reviewerById 未知 id", function () { AppState.reviewerById("nobody"); });
expectThrow("markFlowStep 未知步骤", function () { AppState.markFlowStep("task"); });

// ================================================================ 5. 结构不变量

console.log("");
console.log("== 5. 结构不变量 ==");

var fresh = load().AppState;
check("state 引用在 reset 后保持不变（其它模块缓存的引用不能失效）", (function () {
  var ref = fresh.value;
  fresh.value.scene = "knowledge";
  fresh.reset();
  return fresh.value === ref && ref.scene === "workbench";
})());

check("partsOf 包含 objectId=null 的共用部位",
  fresh.partsOf("OBJ-B").some(function (p) { return p.id === "PART-1"; }));
check("pointsOf 把 primary 排在第一个", fresh.pointsOf("PART-1")[0].primary === true);
check("primaryPoint 与 pointsOf[0] 一致",
  fresh.primaryPoint("PART-1").id === fresh.pointsOf("PART-1")[0].id);
check("framesOf 把 current 排在第一个", fresh.framesOf("PART-1")[0].role === "current");
check("currentFrameOf 与 framesOf[0] 一致",
  fresh.currentFrameOf("PART-1").id === fresh.framesOf("PART-1")[0].id);
check("defaultFields 按 checkbox 的 default 预勾",
  fresh.defaultFields("fix").flags.indexOf("flag-handover") >= 0);
check("defaultFields 的下拉项默认为空串（必须由人来选）", fresh.defaultFields("fix").crew === "");

// ================================================================ 汇总

console.log("");
if (failures.length) {
  console.log("FAILED（" + failures.length + " 项）：");
  failures.forEach(function (label) { console.log("  - " + label); });
  process.exit(1);
}
console.log("ALL CHECKS PASSED（" + passCount + " 项断言）");
