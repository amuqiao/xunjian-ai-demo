// 数据层契约验证脚本（P1-C，阶段三 G1 扩展）。纯 Node，无浏览器：scripts/data/*.js
// 都是往 window 上挂东西的 IIFE，这里手工搭一个假 window 之后按加载顺序依次
// require 即可。
//
// 用法（在仓库根或本目录执行均可）：
//   node poc/pump-demo/verify/verify_data.js
"use strict";

var path = require("path");

var DATA_DIR = path.join(__dirname, "..", "scripts", "data");
var PUMP3D_DIR = path.join(__dirname, "..", "scripts", "pump3d");

// 按 index.html 里 <script> 的顺序依次 require 一遍数据层，供整份脚本复用；每次
// 调用都是一次全新加载（用 delete require.cache 逼真实现"刷新页面"），保证前一个
// 场景（比如"临时改一份 body"）改的是内存里的对象、不落盘，不会互相污染。
function loadDemoData() {
  var files = [
    path.join(PUMP3D_DIR, "contract.js"),
    path.join(DATA_DIR, "seed.js"),
    path.join(DATA_DIR, "schema.js"),
    path.join(DATA_DIR, "catalog.js"),
    path.join(DATA_DIR, "knowledge.js"),
    path.join(DATA_DIR, "kb-dataset.js"),
    path.join(DATA_DIR, "agentqa.js"),
    path.join(DATA_DIR, "graph-spec.js"),
    path.join(DATA_DIR, "series.js"),
    path.join(DATA_DIR, "records.js"),
    path.join(DATA_DIR, "kb.js"),
    path.join(DATA_DIR, "graph.js"),
    path.join(DATA_DIR, "index.js")
  ];
  global.window = {};
  files.forEach(function (file) {
    delete require.cache[require.resolve(file)];
    require(file);
  });
  return window;
}

var win = loadDemoData();
var DemoData = win.DemoData;
var Pump3DContract = win.Pump3DContract;
var DemoDataSchema = win.DemoDataSchema;
var DemoKb = win.DemoKb;
var DemoGraph = win.DemoGraph;
var DemoGraphSpec = win.DemoGraphSpec;
var DemoDataCatalog = win.DemoDataCatalog;

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

function approxEqual(a, b, epsilon) {
  return Math.abs(a - b) <= epsilon;
}

// ---------- 1. 确定性：同一 (unit, point, range) 连算两次逐点全等 ----------

(function determinism() {
  var a = DemoData.series("P-1", "P-DE-V", "7d");
  var b = DemoData.series("P-1", "P-DE-V", "7d");
  var i, allEqual = true;
  if (a.values.length !== b.values.length) allEqual = false;
  for (i = 0; i < a.values.length; i += 1) {
    if (a.values[i] !== b.values[i]) allEqual = false;
  }
  check("确定性：同一 (P-1, P-DE-V, 7d) 连算两次逐点全等", allEqual && a.latest === b.latest);
})();

// ---------- 2. 跨区间自洽：7d 第 i 天 === 30d 里同一天 ----------

(function crossRangeConsistency() {
  var s7 = DemoData.series("P-1", "P-DE-V", "7d");
  var s30 = DemoData.series("P-1", "P-DE-V", "30d");
  var i, allEqual = true;
  // 30d 数组的最后 7 个元素 = 最近 7 天，应与 7d 数组逐点相同（种子不含区间键的直接验证）。
  var offset = s30.values.length - s7.values.length;
  for (i = 0; i < s7.values.length; i += 1) {
    if (s7.values[i] !== s30.values[offset + i]) allEqual = false;
  }
  check("跨区间自洽：7d 第 i 天 === 30d 里同一天（种子不含区间键）", allEqual);
  console.log("  实测 7d.values=" + JSON.stringify(s7.values.map(function (v) { return Math.round(v * 100) / 100; })));
  console.log("  实测 30d 尾部 7 天=" + JSON.stringify(s30.values.slice(offset).map(function (v) { return Math.round(v * 100) / 100; })));
})();

// ---------- 3. 各区间点数 ----------

(function rangePointCounts() {
  var expect = { "24h": 24, "7d": 7, "30d": 30, "90d": 45 };
  var key;
  for (key in expect) {
    var s = DemoData.series("P-1", "P-DE-V", key);
    check("区间点数 " + key + " === " + expect[key] + "（实测 " + s.values.length + "）", s.values.length === expect[key]);
  }
})();

// ---------- 4. 叙事末点精确落位 ----------

(function narrativeLatest() {
  var s = DemoData.series("P-1", "P-DE-V", "7d");
  check("series(\"P-1\",\"P-DE-V\",\"7d\").latest === 5.82（实测 " + s.latest + "）", s.latest === 5.82);
})();

// ---------- 5. 斜坡区间单调不减；startDay 之前落在 base±noise 内 ----------

(function rampMonotonicAndBaseline() {
  var scenario = DemoData.scenario();
  var ramp = null;
  var i;
  for (i = 0; i < scenario.ramps.length; i += 1) {
    if (scenario.ramps[i].unitId === "P-1" && scenario.ramps[i].pointId === "P-DE-V") ramp = scenario.ramps[i];
  }
  var point = DemoData.point("P-DE-V");

  // 斜坡区间（startDay 到 0）内，逐日聚合值应单调不减：噪声按测点原始噪声幅度的
  // 1.5 倍留容差，避免把统计噪声误判成"非单调"（聚合值本身已经把逐小时噪声平均掉，
  // 这里再放宽一点纯粹是给随机噪声留余地，不改变"斜坡本身是抬升的"这个判定目标）。
  var s90 = DemoData.series("P-1", "P-DE-V", "90d");
  var tolerance = point.noise * 1.5;
  var monotonic = true;
  for (i = 1; i < s90.values.length; i += 1) {
    if (s90.values[i] < s90.values[i - 1] - tolerance) monotonic = false;
  }
  check("斜坡区间内 90d 逐点聚合值单调不减（容差 " + tolerance.toFixed(2) + "）", monotonic);

  // startDay（-5 天）之前的取值应落在 base ± noise 内。90d 区间每点跨 2 天（48 小时），
  // 45 个点从旧到新排列，索引 39 对应 hourEnd = -(45-1-39)*48 = -240 小时（10 天前），
  // 明显早于 ramp 的 startDay(-5 天 = -120 小时)，此时 ramp 偏移应恒为 0。
  var s90b = DemoData.series("P-1", "P-DE-V", "90d");
  var tenDaysAgoValue = s90b.values[39];
  check(
    "startDay 之前的值落在 base±noise 内（实测 " + tenDaysAgoValue.toFixed(3) + "，期望区间 [" +
      (point.base - point.noise).toFixed(3) + ", " + (point.base + point.noise).toFixed(3) + "]）",
    approxEqual(tenDaysAgoValue, point.base, point.noise)
  );
})();

// ---------- 6. parts() id 序列 === Pump3DContract.PART_IDS（含顺序） ----------

(function partIdsMatchContract() {
  var parts = DemoData.parts();
  var ids = parts.map(function (p) { return p.id; });
  var expect = Pump3DContract.PART_IDS;
  var same = ids.length === expect.length;
  var i;
  if (same) {
    for (i = 0; i < ids.length; i += 1) {
      if (ids[i] !== expect[i]) same = false;
    }
  }
  check("parts() id 序列 === Pump3DContract.PART_IDS（实测 [" + ids.join(",") + "]）", same);
})();

// ---------- 7. 每个部位有 primary 测点；每个测点 type 在白名单内 ----------

(function primaryPointsAndTypes() {
  var TYPE_WHITELIST = ["不对中特征", "温升关注", "基础振动", "轴承振动", "工况"];
  var parts = DemoData.parts();
  var i;
  var allHavePrimary = true;
  for (i = 0; i < parts.length; i += 1) {
    var caught = null;
    try {
      caught = DemoData.primaryPoint(parts[i].id);
    } catch (e) {
      caught = null;
    }
    if (!caught) allHavePrimary = false;
  }
  check("每个部位都能取到 primary 测点", allHavePrimary);

  var points = DemoData.points();
  var allTypesValid = true;
  for (i = 0; i < points.length; i += 1) {
    if (TYPE_WHITELIST.indexOf(points[i].type) < 0) allTypesValid = false;
  }
  check("每个测点的 type 都在白名单内（" + TYPE_WHITELIST.join("/") + "）", allTypesValid);
})();

// ---------- 8. 每个 part 的派生 status ∈ ["ok","warn","danger"] ----------

(function derivedStatusValid() {
  var parts = DemoData.parts();
  var i;
  var allValid = true;
  var report = [];
  for (i = 0; i < parts.length; i += 1) {
    if (Pump3DContract.STATUSES.indexOf(parts[i].status) < 0) allValid = false;
    report.push(parts[i].id + "=" + parts[i].status);
  }
  check("每个 part 的派生 status 合法（实测 " + report.join(", ") + "）", allValid);
})();

// ---------- 9. healthSeries("P-1","7d") 最新值落在 70-74 ----------

(function healthInRange() {
  var h = DemoData.healthSeries("P-1", "7d");
  check("healthSeries(\"P-1\",\"7d\").latest 落在 [70,74]（实测 " + h.latest.toFixed(2) + "）", h.latest >= 70 && h.latest <= 74);
})();

// ---------- 10. 未知 id 一律抛错（逐个 API 试一遍） ----------

(function unknownIdsThrow() {
  checkThrows("unit(\"NOPE\") 抛错", function () { return DemoData.unit("NOPE"); });
  checkThrows("part(\"nope\") 抛错", function () { return DemoData.part("nope"); });
  checkThrows("point(\"NOPE\") 抛错", function () { return DemoData.point("nope"); });
  checkThrows("primaryPoint(\"nope\") 抛错", function () { return DemoData.primaryPoint("nope"); });
  checkThrows("media(\"nope\") 抛错", function () { return DemoData.media("nope"); });
  checkThrows("series(\"P-99\",\"P-DE-V\",\"7d\") 抛错（未知机组）", function () { return DemoData.series("P-99", "P-DE-V", "7d"); });
  checkThrows("series(\"P-1\",\"NOPE\",\"7d\") 抛错（未知测点）", function () { return DemoData.series("P-1", "NOPE", "7d"); });
  checkThrows("series(\"P-1\",\"P-DE-V\",\"999d\") 抛错（未知区间）", function () { return DemoData.series("P-1", "P-DE-V", "999d"); });
  checkThrows("healthSeries(\"P-99\",\"7d\") 抛错", function () { return DemoData.healthSeries("P-99", "7d"); });
  checkThrows("anomalyMix(\"P-99\",\"7d\") 抛错", function () { return DemoData.anomalyMix("P-99", "7d"); });
  checkThrows("unitCompare(\"NOPE\",\"7d\") 抛错", function () { return DemoData.unitCompare("NOPE", "7d"); });
  checkThrows("records(\"P-99\",\"7d\") 抛错", function () { return DemoData.records("P-99", "7d"); });
  checkThrows("record(\"REC-NOPE\") 抛错", function () { return DemoData.record("REC-NOPE"); });
})();

// ---------- 11. records() 数量与 4 条叙事记录 ----------

(function recordsCounts() {
  var r7 = DemoData.records("P-1", "7d");
  var r30 = DemoData.records("P-1", "30d");
  var r90 = DemoData.records("P-1", "90d");
  check("records(\"P-1\",\"7d\").length 约 7（实测 " + r7.length + "）", Math.abs(r7.length - 7) <= 1);
  check("records(\"P-1\",\"30d\").length 约 24（实测 " + r30.length + "）", Math.abs(r30.length - 24) <= 2);
  check("records(\"P-1\",\"90d\").length === 40（实测 " + r90.length + "）", r90.length === 40);

  var narrativeIds = ["REC-0722-18", "REC-0721-18", "REC-0720-06", "REC-0719-18"];
  var i, allFound = true;
  for (i = 0; i < narrativeIds.length; i += 1) {
    var found = null;
    try {
      found = DemoData.record(narrativeIds[i]);
    } catch (e) {
      found = null;
    }
    if (!found) allFound = false;
  }
  check("4 条叙事记录都能查到：" + narrativeIds.join(", "), allFound);

  var conflict = DemoData.record("REC-0722-18");
  check("REC-0722-18 是默认选中的冲突记录（aiFlag===\"conflict\"）", conflict.aiFlag === "conflict");
})();

// ============================================================
// 阶段三 G1：数据集架构（kb-dataset / kb / graph-spec / graph / schema）
// ============================================================

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

// ---------- 12. schema 校验器对每一条不合规输入都真的抛错 ----------

(function schemaRejectsInvalidKbDataset() {
  var real = win.DemoKbDataset;

  var noId = cloneJson(real);
  delete noId.categories[0].id;
  checkThrows("assertKbDataset 拒绝 categories[0] 缺失 id", function () {
    return DemoDataSchema.assertKbDataset(noId);
  });

  var dupId = cloneJson(real);
  dupId.documents[1].id = dupId.documents[0].id;
  checkThrows("assertKbDataset 拒绝 documents 里重复的 id", function () {
    return DemoDataSchema.assertKbDataset(dupId);
  });

  var danglingCategory = cloneJson(real);
  danglingCategory.documents[0].categoryId = "cat-does-not-exist";
  checkThrows("assertKbDataset 拒绝 documents[].categoryId 悬空", function () {
    return DemoDataSchema.assertKbDataset(danglingCategory);
  });

  var citesNoBodyDoc = cloneJson(real);
  citesNoBodyDoc.qaPresets[0].citations[0].docId = "doc-safety-isolation"; // 真实存在但 body===null
  checkThrows("assertKbDataset 拒绝 citations 指向没有正文的文档", function () {
    return DemoDataSchema.assertKbDataset(citesNoBodyDoc);
  });

  var hintOutOfRange = cloneJson(real);
  hintOutOfRange.qaPresets[0].citations[0].docId = "doc-align-card";
  hintOutOfRange.qaPresets[0].citations[0].hintChunks = [9999];
  checkThrows("assertKbDataset 拒绝越界的 hintChunks 下标", function () {
    return DemoDataSchema.assertKbDataset(hintOutOfRange);
  });

  var badVersion = cloneJson(real);
  badVersion.schemaVersion = 2;
  checkThrows("assertKbDataset 拒绝不匹配的 schemaVersion", function () {
    return DemoDataSchema.assertKbDataset(badVersion);
  });
})();

(function schemaRejectsInvalidGraphSpec() {
  var real = win.DemoGraphSpec;

  var badVersion = cloneJson(real);
  badVersion.schemaVersion = 2;
  checkThrows("assertGraphSpec 拒绝不匹配的 schemaVersion", function () {
    return DemoDataSchema.assertGraphSpec(badVersion);
  });

  var overlapping = cloneJson(real);
  overlapping.bands.part = [overlapping.bands.asset[0], overlapping.bands.asset[1] + 5];
  checkThrows("assertGraphSpec 拒绝重叠的列带（part 与 asset 重叠）", function () {
    return DemoDataSchema.assertGraphSpec(overlapping);
  });

  var unknownEntityType = cloneJson(real);
  unknownEntityType.edgeRules[0].from = "no-such-type";
  checkThrows("assertGraphSpec 拒绝 edgeRules 引用未声明的实体类型", function () {
    return DemoDataSchema.assertGraphSpec(unknownEntityType);
  });
})();

(function schemaRejectsInvalidGraphData() {
  var spec = win.DemoGraphSpec;

  var groupNotDeclared = {
    nodes: [{ id: "n1", label: "n1", group: "no-such-group", x: 10, y: 10 }],
    edges: [],
    spine: ["n1", "n1"]
  };
  checkThrows("assertGraphData 拒绝 group 不在 bands 声明内的节点", function () {
    return DemoDataSchema.assertGraphData(groupNotDeclared, spec);
  });

  var outOfBandX = {
    nodes: [{ id: "n1", label: "n1", group: "asset", x: 99, y: 10 }],
    edges: [],
    spine: ["n1", "n1"]
  };
  checkThrows("assertGraphData 拒绝落在列带之外的 x 坐标", function () {
    return DemoDataSchema.assertGraphData(outOfBandX, spec);
  });

  var danglingEdge = {
    nodes: [{ id: "n1", label: "n1", group: "asset", x: 8, y: 10 }],
    edges: [["n1", "n2", "label"]],
    spine: ["n1", "n1"]
  };
  checkThrows("assertGraphData 拒绝端点不存在的边", function () {
    return DemoDataSchema.assertGraphData(danglingEdge, spec);
  });
})();

// ---------- 13. chunksOf 确定性：同一 docId 连算两次逐段全等 ----------

(function chunksDeterminism() {
  var a = DemoKb.chunksOf("doc-misalign-rule");
  var b = DemoKb.chunksOf("doc-misalign-rule");
  var same = a.length === b.length;
  var i;
  for (i = 0; i < a.length && same; i += 1) {
    if (a[i].text !== b[i].text || a[i].chars !== b[i].chars) same = false;
  }
  check("chunksOf(\"doc-misalign-rule\") 连算两次逐段全等（实测 " + a.length + " 段）", same);
})();

// ---------- 14. 换正文 -> chunk 跟着变（"别写死"的直接验证） ----------

(function chunksFollowBodyChange() {
  var doc = win.DemoKbDataset.documents.filter(function (d) { return d.id === "doc-vibration-threshold"; })[0];
  var before = DemoKb.chunksOf("doc-vibration-threshold");
  var originalBody = doc.body;

  doc.body = [
    "临时替换正文第一段，用于验证 chunk 是否随 body 重新计算，不依赖任何手写的 chunk 列表。",
    "临时替换正文第二段，内容和长度都与原正文不同，chunk 的文本和数量都应该跟着变化。",
    "临时替换正文第三段，专门加长这一段来验证超过单段字符上限时会被再次切分成多个 chunk。临时替换正文第三段，专门加长这一段来验证超过单段字符上限时会被再次切分成多个 chunk。临时替换正文第三段，专门加长这一段来验证超过单段字符上限时会被再次切分成多个 chunk。"
  ];
  var after = DemoKb.chunksOf("doc-vibration-threshold");

  var countChanged = after.length !== before.length;
  var textChanged = after[0].text !== before[0].text;
  check(
    "换正文后 chunk 数量跟着变（原 " + before.length + " 段，新 " + after.length + " 段）",
    countChanged
  );
  check("换正文后 chunk[0] 的文本跟着变（不是遗留的旧文本）", textChanged);
  check("换正文后新 chunk[0] 内容确实来自新正文", after[0].text.indexOf("临时替换正文第一段") === 0);

  doc.body = originalBody; // 还原，避免影响后续断言
})();

// ---------- 15. similarity 确定性；hintChunks 指定段被抬到 0.88+ 并排进前 3 ----------

(function similarityDeterminismAndHints() {
  var s1 = DemoKb.similarity("qa-misalign-rule", "doc-misalign-rule", 1);
  var s2 = DemoKb.similarity("qa-misalign-rule", "doc-misalign-rule", 1);
  check("similarity() 同一组参数连算两次结果全等（实测 " + s1 + "）", s1 === s2);

  var allPresetsPass = true;
  var report = [];
  DemoKb.qaPresets().forEach(function (preset) {
    var hits = DemoKb.retrieve(preset.id).hits;
    preset.citations.forEach(function (citation) {
      citation.hintChunks.forEach(function (chunkIndex) {
        var score = DemoKb.similarity(preset.id, citation.docId, chunkIndex);
        var inTop3 = hits.some(function (hit) {
          return hit.docId === citation.docId && hit.chunkIndex === chunkIndex;
        });
        report.push(preset.id + "/" + citation.docId + "#" + chunkIndex + "=" + score + (inTop3 ? "(命中)" : "(缺失)"));
        if (score < 0.88 || !inTop3) allPresetsPass = false;
      });
    });
  });
  check("每个 qaPreset 的 hintChunks 分数均 >= 0.88 且都在 retrieve() 返回集合里：\n    " + report.join("\n    "), allPresetsPass);
})();

// ---------- 16. graphData() 节点数、列带、边两端存在、spine 连续 ----------

(function graphDataShape() {
  var g = DemoData.graphData();
  check("graphData().nodes 非空数组（实测 " + g.nodes.length + " 个）", Array.isArray(g.nodes) && g.nodes.length > 0);
  check("graphData().edges 非空数组（实测 " + g.edges.length + " 条）", Array.isArray(g.edges) && g.edges.length > 0);

  var idSet = {};
  g.nodes.forEach(function (node) { idSet[node.id] = node; });

  var allInBand = true;
  g.nodes.forEach(function (node) {
    var band = DemoGraphSpec.bands[node.group];
    if (!band || node.x < band[0] || node.x > band[1]) allInBand = false;
  });
  check("每个节点的 x 都落在其 group 声明的列带内", allInBand);

  var allEdgesResolve = true;
  g.edges.forEach(function (edge) {
    if (!idSet[edge[0]] || !idSet[edge[1]]) allEdgesResolve = false;
  });
  check("每条边的两端节点都存在于 graphData().nodes", allEdgesResolve);

  var spineContinuous = g.spine.length >= 2;
  g.spine.forEach(function (nodeId) {
    if (!idSet[nodeId]) spineContinuous = false;
  });
  check("spine 路径连续（每个节点 id 都能在 nodes 里找到，实测 " + g.spine.length + " 个锚点）", spineContinuous);

  // schema.js 已经在加载阶段跑过 assertAll()（见本文件顶部的 loadDemoData()
  // 隐含调用链：本脚本不直接调用 assertAll，这里补一次显式调用，确认它对当前这份
  // 真实数据集始终不抛错）。
  var assertAllOk = true;
  try {
    DemoDataSchema.assertAll();
  } catch (e) {
    assertAllOk = false;
  }
  check("DemoDataSchema.assertAll() 对当前真实数据集不抛错", assertAllOk);
})();

// ---------- 17. 投影不漂移：临时给 catalog.parts 加一项，断言图谱节点数跟着增加 ----------

(function graphProjectionDoesNotDrift() {
  var before = DemoData.graphData();
  var beforeCount = before.nodes.length;
  var beforePartEdges = before.edges.filter(function (e) { return e[2] === "定位部位"; }).length;

  DemoDataCatalog.parts.push({ id: "test-part-tmp", label: "临时测试部位（verify_data 专用）" });
  var after = DemoData.graphData();
  var afterCount = after.nodes.length;
  var afterPartEdges = after.edges.filter(function (e) { return e[2] === "定位部位"; }).length;
  DemoDataCatalog.parts.pop(); // 还原，避免影响后续断言

  check(
    "临时给 catalog.parts 加一项后，graphData().nodes 数量从 " + beforeCount + " 增加到 " + afterCount,
    afterCount === beforeCount + 1
  );
  check(
    "同时新增一条 \"定位部位\" 边（从 " + beforePartEdges + " 条增加到 " + afterPartEdges + " 条）",
    afterPartEdges === beforePartEdges + 1
  );
})();

// ---------- 18. 未知 id 全部抛错 ----------

(function kbAndGraphUnknownIdsThrow() {
  checkThrows("kbDocument(\"nope\") 抛错", function () { return DemoData.kbDocument("nope"); });
  checkThrows("kbDocuments(\"cat-nope\") 抛错", function () { return DemoData.kbDocuments("cat-nope"); });
  checkThrows("kbChunks(\"nope\") 抛错", function () { return DemoData.kbChunks("nope"); });
  checkThrows("kbChunks(\"doc-safety-isolation\") 抛错（该文档没有正文）", function () { return DemoData.kbChunks("doc-safety-isolation"); });
  checkThrows("kbRetrieve(\"qa-nope\") 抛错", function () { return DemoData.kbRetrieve("qa-nope"); });
  checkThrows("kbIngestPlan(\"nope\") 抛错", function () { return DemoData.kbIngestPlan("nope"); });
  checkThrows("qaPreset(\"qa-nope\") 抛错", function () { return DemoData.qaPreset("qa-nope"); });
  checkThrows(
    "DemoKb.similarity(\"qa-align-standard\",\"doc-align-card\", 9999) 抛错（chunk index 越界）",
    function () { return DemoKb.similarity("qa-align-standard", "doc-align-card", 9999); }
  );
})();

// ---------- 汇总 ----------

// ---------------------------------------------------------------
// kbRetrieve 的返回集合必须恒等于该问答声明的 citations 集合
//
// 这条此前完全没有断言，而 66 项全绿时它实际是不成立的：retrieve 曾经 hits.slice(0,3)
// 硬返回 3 条，而多数问答只声明 1-2 个命中段，于是前 3 名必然掺进非命中段。
// 后果是"动画高亮的段"与"答案实际引用的段"对不上——本项目一路在防的那类穿帮
// （文案和数字来自同一份数据却各自解释一遍）。
// ---------------------------------------------------------------
DemoData.qaPresets().forEach(function (preset) {
  var declared = [];
  preset.citations.forEach(function (citation) {
    citation.hintChunks.forEach(function (index) {
      declared.push(citation.docId + "#" + index);
    });
  });
  var result = DemoData.kbRetrieve(preset.id);
  var got = result.hits.map(function (hit) { return hit.docId + "#" + hit.chunkIndex; });
  check(
    "kbRetrieve(" + preset.id + ") 的命中集合恒等于声明的 citations",
    declared.slice().sort().join("|") === got.slice().sort().join("|"),
    { declared: declared, got: got }
  );
  check(
    "kbRetrieve(" + preset.id + ") 按分数降序",
    result.hits.every(function (hit, i) { return i === 0 || result.hits[i - 1].score >= hit.score; }),
    result.hits.map(function (h) { return h.score; })
  );
  check(
    "kbRetrieve(" + preset.id + ") 每条命中分数 >= 0.88（严格高于非命中段上界 0.82）",
    result.hits.every(function (hit) { return hit.score >= 0.88; }),
    result.hits.map(function (h) { return h.score; })
  );
  check(
    "kbRetrieve(" + preset.id + ") 报出的全库规模等于所有带正文文档的 chunk 总数",
    result.corpusChunks === DemoData.kbDocuments().filter(function (d) { return d.body && d.body.length; })
      .reduce(function (n, d) { return n + DemoData.kbChunks(d.id).length; }, 0),
    result.corpusChunks
  );
});

// 命中段的最低分必须严格高于任意非命中段的最高分——亮暗分层在视觉上永远成立，
// 不靠缩小检索候选池来保证。
DemoData.qaPresets().forEach(function (preset) {
  var declared = {};
  preset.citations.forEach(function (citation) {
    citation.hintChunks.forEach(function (index) { declared[citation.docId + "#" + index] = true; });
  });
  var minHint = 1;
  var maxOther = 0;
  DemoData.kbDocuments().forEach(function (doc) {
    if (!doc.body || !doc.body.length) return;
    DemoData.kbChunks(doc.id).forEach(function (chunk) {
      var score = window.DemoKb.similarity(preset.id, doc.id, chunk.index);
      if (declared[doc.id + "#" + chunk.index]) {
        if (score < minHint) minHint = score;
      } else if (score > maxOther) maxOther = score;
    });
  });
  check(
    preset.id + "：命中段最低分 > 非命中段最高分（全库范围内）",
    minHint > maxOther,
    { minHint: minHint, maxOther: maxOther }
  );
});

// ============================================================
// 阶段三 G2：vision.frames（关键帧/bbox）与 recordColumns（表格列声明）
// ============================================================
//
// 教训（写在这里避免重犯）：曾经有一条 retrieve() 的不变量没人断言，结果 66 条
// 断言全绿而功能是错的；也曾经有断言把 STORAGE_KEY 写死导致探针往一个 app 根本
// 不读的 key 里写，6 条断言长期空转通过。下面每一条都反过来问一次"如果这个功能
// 坏了，它会红吗"——因此除了正例，还专门构造反例（越界 bbox / 非法 type / 重复
// key）断言它们真的抛错，不只是测"正常数据不报错"这种空转检查。

// ---------- 19. parts()[].vision.frames 形状与内容（正例，覆盖全部 6 个部位） ----------

(function visionFramesShape() {
  var parts = DemoData.parts();
  var globalFrameIds = {};
  var totalFrames = 0;
  var allPartsHaveFrames = true;
  var allBboxValid = true;
  var allSrcResolves = true;
  var allBoxLabelNonEmpty = true;
  var allFindingsInRange = true;
  var noDuplicateFrameId = true;

  parts.forEach(function (part) {
    var frames = part.vision && part.vision.frames;
    if (!Array.isArray(frames) || frames.length < 2) allPartsHaveFrames = false;
    (frames || []).forEach(function (frame) {
      totalFrames += 1;
      if (globalFrameIds[frame.id]) noDuplicateFrameId = false;
      globalFrameIds[frame.id] = true;

      try {
        DemoData.media(frame.src);
      } catch (e) {
        allSrcResolves = false;
      }

      var b = frame.bbox;
      var bboxOk =
        b && typeof b.x === "number" && typeof b.y === "number" && typeof b.w === "number" && typeof b.h === "number" &&
        b.x >= 0 && b.y >= 0 && b.w >= 0 && b.h >= 0 && b.x <= 1 && b.y <= 1 && b.w <= 1 && b.h <= 1 &&
        b.x + b.w <= 1 && b.y + b.h <= 1;
      if (!bboxOk) allBboxValid = false;

      if (typeof frame.boxLabel !== "string" || frame.boxLabel.length === 0) allBoxLabelNonEmpty = false;
      if (!Array.isArray(frame.findings) || frame.findings.length < 1 || frame.findings.length > 4) allFindingsInRange = false;
    });
  });

  check("每个部位（" + parts.length + " 个）的 vision.frames 都是长度 >= 2 的数组", allPartsHaveFrames);
  check("vision.frames 的 id 全局唯一（实测共 " + totalFrames + " 帧）", noDuplicateFrameId);
  check("每个 frame.src 都能通过 DemoData.media() 解析（在 media 映射表里查得到）", allSrcResolves);
  check("每个 frame.bbox 的 x/y/w/h 都落在 [0,1] 且 x+w<=1、y+h<=1", allBboxValid);
  check("每个 frame.boxLabel 都是非空字符串", allBoxLabelNonEmpty);
  check("每个 frame.findings 长度都落在 [1,4]", allFindingsInRange);
})();

// ---------- 20. assertPartsVisionFrames 拒绝反例（构造越界 bbox / 非法 src / 重复 id） ----------

(function schemaRejectsInvalidVisionFrames() {
  var real = cloneJson(win.DemoDataCatalog);

  var noFrames = cloneJson(real);
  delete noFrames.parts[0].vision.frames;
  checkThrows("assertPartsVisionFrames 拒绝 vision.frames 缺失", function () {
    return DemoDataSchema.assertPartsVisionFrames(noFrames);
  });

  var emptyFrames = cloneJson(real);
  emptyFrames.parts[0].vision.frames = [];
  checkThrows("assertPartsVisionFrames 拒绝 vision.frames 为空数组", function () {
    return DemoDataSchema.assertPartsVisionFrames(emptyFrames);
  });

  var dupId = cloneJson(real);
  dupId.parts[1].vision.frames[0].id = dupId.parts[0].vision.frames[0].id;
  checkThrows("assertPartsVisionFrames 拒绝跨部位重复的 frame.id", function () {
    return DemoDataSchema.assertPartsVisionFrames(dupId);
  });

  var unknownSrc = cloneJson(real);
  unknownSrc.parts[0].vision.frames[0].src = "noSuchMediaKey";
  checkThrows("assertPartsVisionFrames 拒绝在 media 映射表里查不到的 src", function () {
    return DemoDataSchema.assertPartsVisionFrames(unknownSrc);
  });

  var bboxOutOfUnitRange = cloneJson(real);
  bboxOutOfUnitRange.parts[0].vision.frames[0].bbox.x = 1.5;
  checkThrows("assertPartsVisionFrames 拒绝 bbox.x 超出 [0,1]", function () {
    return DemoDataSchema.assertPartsVisionFrames(bboxOutOfUnitRange);
  });

  var bboxNegative = cloneJson(real);
  bboxNegative.parts[0].vision.frames[0].bbox.y = -0.1;
  checkThrows("assertPartsVisionFrames 拒绝 bbox.y 为负数", function () {
    return DemoDataSchema.assertPartsVisionFrames(bboxNegative);
  });

  var bboxOverflowX = cloneJson(real);
  bboxOverflowX.parts[0].vision.frames[0].bbox.x = 0.9;
  bboxOverflowX.parts[0].vision.frames[0].bbox.w = 0.5;
  checkThrows("assertPartsVisionFrames 拒绝 x+w>1（框跑到图外）", function () {
    return DemoDataSchema.assertPartsVisionFrames(bboxOverflowX);
  });

  var bboxOverflowY = cloneJson(real);
  bboxOverflowY.parts[0].vision.frames[0].bbox.y = 0.85;
  bboxOverflowY.parts[0].vision.frames[0].bbox.h = 0.4;
  checkThrows("assertPartsVisionFrames 拒绝 y+h>1（框跑到图外）", function () {
    return DemoDataSchema.assertPartsVisionFrames(bboxOverflowY);
  });

  var emptyBoxLabel = cloneJson(real);
  emptyBoxLabel.parts[0].vision.frames[0].boxLabel = "";
  checkThrows("assertPartsVisionFrames 拒绝空字符串 boxLabel", function () {
    return DemoDataSchema.assertPartsVisionFrames(emptyBoxLabel);
  });

  var noFindings = cloneJson(real);
  noFindings.parts[0].vision.frames[0].findings = [];
  checkThrows("assertPartsVisionFrames 拒绝 findings 为空数组", function () {
    return DemoDataSchema.assertPartsVisionFrames(noFindings);
  });

  var tooManyFindings = cloneJson(real);
  tooManyFindings.parts[0].vision.frames[0].findings = ["a", "b", "c", "d", "e"];
  checkThrows("assertPartsVisionFrames 拒绝 findings 超过 4 条", function () {
    return DemoDataSchema.assertPartsVisionFrames(tooManyFindings);
  });

  // 确认上面这些构造确实各自只改了一处、真实数据本身仍然合法（避免"反例其实
  // 也命中了正例断言里的漏洞"这种自欺）。
  var stillOk = true;
  try {
    DemoDataSchema.assertPartsVisionFrames(real);
  } catch (e) {
    stillOk = false;
  }
  check("未被篡改的真实 catalog 副本本身能通过 assertPartsVisionFrames", stillOk);
})();

// ---------- 21. recordColumns() 形状与关键列锁定（正例） ----------

(function recordColumnsShape() {
  var columns = DemoData.recordColumns();
  var expectKeys = ["aiFlag", "dateShift", "partLabel", "item", "result", "aiFlagText"];
  var actualKeys = columns.map(function (c) { return c.key; });
  check(
    "recordColumns() 的 key 序列恰好等于约定列表（实测 [" + actualKeys.join(",") + "]）",
    actualKeys.join("|") === expectKeys.join("|")
  );

  var validTypes = { "status-dot": true, "text": true, "badge-icon": true };
  var allTypesValid = columns.every(function (c) { return validTypes[c.type]; });
  check("recordColumns() 每列的 type 都在合法取值内（status-dot/text/badge-icon）", allTypesValid);

  var allWidthsPositive = columns.every(function (c) { return typeof c.width === "number" && c.width > 0; });
  check("recordColumns() 每列的 width 都是正数", allWidthsPositive);

  var byKey = {};
  columns.forEach(function (c) { byKey[c.key] = c; });
  check("recordColumns() 的 aiFlag 列 type === \"status-dot\"（用于渲染状态圆点）", byKey.aiFlag.type === "status-dot");
  check("recordColumns() 的 aiFlagText 列 type === \"badge-icon\"（用于渲染 AI 质检口径徽标）", byKey.aiFlagText.type === "badge-icon");
})();

// ---------- 22. assertRecordColumns 拒绝反例（重复 key / 非法 type / 非正数 width） ----------

(function schemaRejectsInvalidRecordColumns() {
  var real = cloneJson(DemoData.recordColumns());

  checkThrows("assertRecordColumns 拒绝非数组输入", function () {
    return DemoDataSchema.assertRecordColumns(null);
  });

  checkThrows("assertRecordColumns 拒绝空数组", function () {
    return DemoDataSchema.assertRecordColumns([]);
  });

  var dupKey = cloneJson(real);
  dupKey[1].key = dupKey[0].key;
  checkThrows("assertRecordColumns 拒绝重复的 key", function () {
    return DemoDataSchema.assertRecordColumns(dupKey);
  });

  var badType = cloneJson(real);
  badType[0].type = "not-a-real-type";
  checkThrows("assertRecordColumns 拒绝不在白名单内的 type", function () {
    return DemoDataSchema.assertRecordColumns(badType);
  });

  var zeroWidth = cloneJson(real);
  zeroWidth[0].width = 0;
  checkThrows("assertRecordColumns 拒绝 width === 0", function () {
    return DemoDataSchema.assertRecordColumns(zeroWidth);
  });

  var negativeWidth = cloneJson(real);
  negativeWidth[0].width = -10;
  checkThrows("assertRecordColumns 拒绝负数 width", function () {
    return DemoDataSchema.assertRecordColumns(negativeWidth);
  });

  var stillOk = true;
  try {
    DemoDataSchema.assertRecordColumns(real);
  } catch (e) {
    stillOk = false;
  }
  check("未被篡改的真实 recordColumns() 副本本身能通过 assertRecordColumns", stillOk);
})();

// ---------- 23. 专家结论字典：verdicts / evidencePoints / statusText ----------
//
// 这一节守的是一条曾经不成立的不变量：三条结论的文本此前是字面量散在 8 个文件里
  // （boot.js / state.js / confirm.js / archive.js），靠 `=== "确认不对中"`
// 驱动"是否解锁 P-2 复用""归档成维修案例还是观察记录"。漏改一处不会报错，只会让
// 比较恒为 false，功能静默失效。收口成字典之后，这些断言保证字典本身是自洽的。

(function verdictsDictionary() {
  var list = DemoData.verdicts();
  check("verdicts() 返回非空数组", Array.isArray(list) && list.length > 0, list.length);

  var maintenance = list.filter(function (item) { return item.isMaintenance; });
  check("verdicts() 恰好有 1 条 isMaintenance:true（解锁维修闭环的唯一判据）",
    maintenance.length === 1, maintenance.length);

  var ids = {};
  var labels = {};
  var dupId = false;
  var dupLabel = false;
  list.forEach(function (item) {
    if (ids[item.id]) dupId = true;
    if (labels[item.label]) dupLabel = true;
    ids[item.id] = true;
    labels[item.label] = true;
  });
  check("verdicts() 的 id 互不重复", !dupId);
  check("verdicts() 的 label 互不重复（label 是 verdictByLabel 的反查键）", !dupLabel);

  check("verdict(id) 能按 id 取到结论", DemoData.verdict("maintenance").isMaintenance === true);
  checkThrows("verdict() 对未知 id 抛错", function () { return DemoData.verdict("no-such-verdict"); });

  // verdictByLabel 对空值返回 null 而不抛错：'还没选结论' 是状态机的合法状态。
  check("verdictByLabel('') 返回 null（未选结论是合法状态，不是错误）",
    DemoData.verdictByLabel("") === null);
  check("verdictByLabel(null) 返回 null", DemoData.verdictByLabel(null) === null);
  checkThrows("verdictByLabel() 对非空但对不上的 label 抛错（说明字典与持久状态脱节）", function () {
    return DemoData.verdictByLabel("这不是一条真的结论");
  });

  // isMaintenanceVerdict 是替掉那 14 处字面量比较的判据，逐条对照字典验证。
  var maintenanceLabel = maintenance[0].label;
  check("isMaintenanceVerdict(维修结论的 label) === true",
    DemoData.isMaintenanceVerdict(maintenanceLabel) === true);
  check("isMaintenanceVerdict('') === false（未选结论不算维修路径）",
    DemoData.isMaintenanceVerdict("") === false);
  list.filter(function (item) { return !item.isMaintenance; }).forEach(function (item) {
    check("isMaintenanceVerdict(\"" + item.label + "\") === false",
      DemoData.isMaintenanceVerdict(item.label) === false);
  });

  // 维修那条刻意把 steps/archiveCaseId 留 null：步骤取 workOrder.steps、案例号取
  // reuse().matchedCase，不在两处各存一份。
  check("维修结论的 steps 为 null（步骤取 workOrder.steps，不重复存）",
    maintenance[0].steps === null);
  check("维修结论的 archiveCaseId 为 null（案例号取 reuse().matchedCase）",
    maintenance[0].archiveCaseId === null);
  check("archiveCaseIdFor(维修结论) 等于 reuse().matchedCase",
    DemoData.archiveCaseIdFor(maintenanceLabel) === DemoData.reuse().matchedCase,
    DemoData.archiveCaseIdFor(maintenanceLabel));

  list.filter(function (item) { return !item.isMaintenance; }).forEach(function (item) {
    check("非维修结论 \"" + item.label + "\" 自带非空 steps",
      Array.isArray(item.steps) && item.steps.length > 0);
    check("archiveCaseIdFor(\"" + item.label + "\") 等于该结论的 archiveCaseId",
      DemoData.archiveCaseIdFor(item.label) === item.archiveCaseId);
  });

  checkThrows("archiveCaseIdFor('') 抛错（归档必须已选定结论）", function () {
    return DemoData.archiveCaseIdFor("");
  });

  // 每条结论的五个文案字段都必须非空：缺一个会让界面上出现空白说明而不报错。
  list.forEach(function (item) {
    ["hint", "impact", "archiveTitle", "archiveStatusText", "agentClosureText"].forEach(function (field) {
      check("verdict \"" + item.id + "\" 的 " + field + " 非空",
        typeof item[field] === "string" && item[field].length > 0);
    });
  });
})();

(function evidencePointsAndStatusText() {
  var pts = DemoData.evidencePoints();
  check("evidencePoints() 返回非空数组", Array.isArray(pts) && pts.length > 0, pts.length);
  var allPointIds = {};
  DemoData.points().forEach(function (point) { allPointIds[point.id] = true; });
  var missing = pts.filter(function (id) { return !allPointIds[id]; });
  check("evidencePoints() 的每个测点都能在 points() 里查到", missing.length === 0, missing);

  // 三色语义必须全覆盖：缺一个会在某个状态出现时抛错，而那个状态可能只在特定数据下出现。
  ["danger", "warn", "ok"].forEach(function (status) {
    check("badgeText(\"" + status + "\") 返回非空文案",
      typeof DemoData.badgeText(status) === "string" && DemoData.badgeText(status).length > 0,
      DemoData.badgeText(status));
  });
  checkThrows("badgeText() 对未知 status 抛错（不静默退回默认文案）", function () {
    return DemoData.badgeText("not-a-status");
  });

  ["conflict", "gap", "ok"].forEach(function (flag) {
    var entry = DemoData.aiFlagText(flag);
    check("aiFlagText(\"" + flag + "\") 的 status 是合法三色",
      ["danger", "warn", "ok"].indexOf(entry.status) >= 0, entry.status);
    check("aiFlagText(\"" + flag + "\") 的 badge/lead 非空",
      entry.badge.length > 0 && entry.lead.length > 0);
  });
  checkThrows("aiFlagText() 对未知 aiFlag 抛错", function () {
    return DemoData.aiFlagText("not-a-flag");
  });
})();

// ---------- 24. schema 拒绝畸形的 verdicts / evidencePoints / statusText ----------

(function schemaRejectsInvalidVerdicts() {
  var catalog = window.DemoDataCatalog;
  var realVerdicts = cloneJson(catalog.verdicts);

  function withVerdicts(list) {
    return { verdicts: list, points: catalog.points, statusText: catalog.statusText, evidencePoints: catalog.evidencePoints };
  }

  checkThrows("assertVerdicts 拒绝空数组", function () {
    return DemoDataSchema.assertVerdicts(withVerdicts([]));
  });

  var dupLabel = cloneJson(realVerdicts);
  dupLabel[1].label = dupLabel[0].label;
  checkThrows("assertVerdicts 拒绝重复的 label（反查键重复会取到错误结论）", function () {
    return DemoDataSchema.assertVerdicts(withVerdicts(dupLabel));
  });

  var dupId = cloneJson(realVerdicts);
  dupId[1].id = dupId[0].id;
  checkThrows("assertVerdicts 拒绝重复的 id", function () {
    return DemoDataSchema.assertVerdicts(withVerdicts(dupId));
  });

  var noMaintenance = cloneJson(realVerdicts).map(function (item) {
    item.isMaintenance = false;
    if (item.steps === null) item.steps = ["占位步骤"];
    if (item.archiveCaseId === null) item.archiveCaseId = "PLACEHOLDER-01";
    return item;
  });
  checkThrows("assertVerdicts 拒绝 0 条维修结论（归档将永远不解锁）", function () {
    return DemoDataSchema.assertVerdicts(withVerdicts(noMaintenance));
  });

  var twoMaintenance = cloneJson(realVerdicts);
  twoMaintenance[1].isMaintenance = true;
  twoMaintenance[1].steps = null;
  twoMaintenance[1].archiveCaseId = null;
  checkThrows("assertVerdicts 拒绝 2 条维修结论（判断产生歧义）", function () {
    return DemoDataSchema.assertVerdicts(withVerdicts(twoMaintenance));
  });

  var nonMaintenanceNoSteps = cloneJson(realVerdicts);
  nonMaintenanceNoSteps[1].steps = [];
  checkThrows("assertVerdicts 拒绝非维修结论的空 steps", function () {
    return DemoDataSchema.assertVerdicts(withVerdicts(nonMaintenanceNoSteps));
  });

  var maintenanceWithSteps = cloneJson(realVerdicts);
  maintenanceWithSteps[0].steps = ["不该在这里重复存的步骤"];
  checkThrows("assertVerdicts 拒绝维修结论自带 steps（必须为 null，避免与 workOrder 存两份）", function () {
    return DemoDataSchema.assertVerdicts(withVerdicts(maintenanceWithSteps));
  });

  var emptyHint = cloneJson(realVerdicts);
  emptyHint[0].hint = "";
  checkThrows("assertVerdicts 拒绝空的 hint 文案", function () {
    return DemoDataSchema.assertVerdicts(withVerdicts(emptyHint));
  });

  var badEvidence = { points: catalog.points, evidencePoints: ["NO-SUCH-POINT"] };
  checkThrows("assertEvidencePoints 拒绝在 points 表里查不到的测点", function () {
    return DemoDataSchema.assertEvidencePoints(badEvidence);
  });

  var missingBadge = cloneJson(catalog.statusText);
  delete missingBadge.badge.warn;
  checkThrows("assertStatusText 拒绝三色未全覆盖（缺 warn）", function () {
    return DemoDataSchema.assertStatusText({ statusText: missingBadge });
  });

  var badFlagStatus = cloneJson(catalog.statusText);
  badFlagStatus.aiFlag.conflict.status = "not-a-status";
  checkThrows("assertStatusText 拒绝 aiFlag 里非法的三色取值", function () {
    return DemoDataSchema.assertStatusText({ statusText: badFlagStatus });
  });

  // 反向确认：真数据依然通过（否则上面那些反例可能只是因为构造方式本身就非法）
  var stillOk = true;
  try {
    DemoDataSchema.assertVerdicts(catalog);
    DemoDataSchema.assertEvidencePoints(catalog);
    DemoDataSchema.assertStatusText(catalog);
  } catch (e) {
    stillOk = false;
  }
  check("真实的 verdicts/evidencePoints/statusText 通过全部校验（反例不是因为构造方式非法才抛错）", stillOk);
})();

// ---------- 25. 归档报告段落：形状、status、与结论的对应 ----------

(function reportSectionsPerVerdict() {
  var list = DemoData.verdicts();
  var maintenance = list.filter(function (item) { return item.isMaintenance; })[0];

  // 维修路径复用 report().sections，不在 verdicts 里重复存一份。
  check("维修结论的 reportSections 为 null（段落取 report().sections）",
    maintenance.reportSections === null);
  check("reportSectionsFor(维修结论) 返回 report().sections 本身",
    DemoData.reportSectionsFor(maintenance.label) === DemoData.report().sections);

  list.forEach(function (item) {
    var sections = DemoData.reportSectionsFor(item.label);
    check("reportSectionsFor(\"" + item.label + "\") 返回非空数组",
      Array.isArray(sections) && sections.length > 0, sections.length);

    // status 必须写在段落自己身上：原来它是 archive.js 里一个按位置对齐的数组，
    // 业务增删一段报告就整体错位、且不报错。
    var allShaped = sections.every(function (section) {
      return typeof section.title === "string" && section.title.length > 0
        && typeof section.text === "string" && section.text.length > 0
        && ["danger", "warn", "ok"].indexOf(section.status) >= 0;
    });
    check("\"" + item.label + "\" 的每段报告都带 title/text/合法 status",
      allShaped, sections.map(function (x) { return x.title + ":" + x.status; }));
  });

  checkThrows("reportSectionsFor('') 抛错（归档必须已选定结论）", function () {
    return DemoData.reportSectionsFor("");
  });
})();

(function schemaRejectsInvalidReportSections() {
  var catalog = window.DemoDataCatalog;

  function withReport(sections, verdicts) {
    return {
      report: { title: catalog.report.title, sections: sections },
      verdicts: verdicts || catalog.verdicts,
    };
  }

  checkThrows("assertReportSections 拒绝空的 report.sections", function () {
    return DemoDataSchema.assertReportSections(withReport([]));
  });

  var missingStatus = cloneJson(catalog.report.sections);
  delete missingStatus[0].status;
  checkThrows("assertReportSections 拒绝缺 status 的段落（原来 status 靠位置对齐，最易错位）", function () {
    return DemoDataSchema.assertReportSections(withReport(missingStatus));
  });

  var badStatus = cloneJson(catalog.report.sections);
  badStatus[2].status = "not-a-status";
  checkThrows("assertReportSections 拒绝非法三色 status", function () {
    return DemoDataSchema.assertReportSections(withReport(badStatus));
  });

  var emptyText = cloneJson(catalog.report.sections);
  emptyText[1].text = "";
  checkThrows("assertReportSections 拒绝空的段落正文", function () {
    return DemoDataSchema.assertReportSections(withReport(emptyText));
  });

  var maintenanceWithSections = cloneJson(catalog.verdicts);
  maintenanceWithSections.forEach(function (item) {
    if (item.isMaintenance) item.reportSections = [{ title: "重复存的段落", text: "不该在这里", status: "warn" }];
  });
  checkThrows("assertReportSections 拒绝维修结论自带 reportSections（必须为 null，避免与 report.sections 存两份）", function () {
    return DemoDataSchema.assertReportSections(withReport(catalog.report.sections, maintenanceWithSections));
  });

  var nonMaintenanceEmpty = cloneJson(catalog.verdicts);
  nonMaintenanceEmpty.forEach(function (item) {
    if (!item.isMaintenance) item.reportSections = [];
  });
  checkThrows("assertReportSections 拒绝非维修结论的空 reportSections", function () {
    return DemoDataSchema.assertReportSections(withReport(catalog.report.sections, nonMaintenanceEmpty));
  });

  var stillOk = true;
  try {
    DemoDataSchema.assertReportSections(catalog);
  } catch (e) {
    stillOk = false;
  }
  check("真实的 report.sections 与 verdicts[].reportSections 通过校验", stillOk);
})();

(function agentDialogDataContract() {
  var dialogs = DemoData.agentDialogs();
  var expectedIds = ["workbench-agent", "knowledge-agent", "archive-case-agent", "archive-record-agent"];
  var ids = dialogs.map(function (dialog) { return dialog.id; }).sort();
  var seenQuestionIds = {};
  var hitShapeOk = true;
  var noRagLinkFields = true;
  var everyDialogReachable = expectedIds.every(function (id) {
    return DemoData.agentDialog(id).id === id;
  });

  dialogs.forEach(function (dialog) {
    var localQuestionIds = {};
    dialog.questions.forEach(function (question) {
      if (localQuestionIds[question.id]) seenQuestionIds[dialog.id + ":" + question.id] = true;
      localQuestionIds[question.id] = true;
      question.hits.forEach(function (hit) {
        var keys = Object.keys(hit).sort().join(",");
        if (keys !== "kind,text") hitShapeOk = false;
        ["docId", "chunkIndex", "href", "action", "selectId"].forEach(function (field) {
          if (Object.prototype.hasOwnProperty.call(hit, field)) noRagLinkFields = false;
        });
      });
    });
  });

  check("agentDialogs() 返回 4 个静态 Agent 弹窗配置", dialogs.length === 4);
  check("agentDialogs() 的 id 集合符合调用点约定", ids.join("|") === expectedIds.slice().sort().join("|"));
  check("每个 AgentDialog 都能通过 DemoData.agentDialog(id) 读取", everyDialogReachable);
  check("每个 AgentDialog 内的问题 id 不重复", Object.keys(seenQuestionIds).length === 0);
  check("AgentDialog hits 只包含 kind/text 两个静态标签字段", hitShapeOk);
  check("AgentDialog hits 不包含 docId/chunkIndex/href/action/selectId 等真实溯源字段", noRagLinkFields);
  checkThrows("agentDialog(\"no-such-agent\") 抛错", function () {
    return DemoData.agentDialog("no-such-agent");
  });
})();

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
