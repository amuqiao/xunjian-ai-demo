// 领域契约验证脚本。纯 Node，无浏览器：domain-*/ 下的文件都是往 window 上挂东西的
// 普通脚本，这里手工搭一个假 window 之后按加载顺序依次 require 即可。
//
// 用法（在仓库根或本目录执行均可）：
//   node poc/diagnosis-flow/verify/verify_domain.js            # 校验 domain-skeleton
//   node poc/diagnosis-flow/verify/verify_domain.js domain-pump
//
// ---- 这个脚本的一半篇幅是"构造反例" ----
// 只断言"合法数据能通过"是不够的：一个什么都不检查的空校验器同样能让那种断言全绿。
// 所以每一条规则都配一个把数据改坏的反例，断言校验器**真的抛错**。这条纪律来自
// pump-demo verify/README.md 记录的教训：那套验证自己空转过四次，每次都是全绿状态下
// 偶然发现的。写完一条断言要能回答——如果这个功能坏了，它会红吗？
"use strict";

var path = require("path");

var ROOT = path.join(__dirname, "..");
var DOMAIN_DIR_NAME = process.argv[2] || "domain-skeleton";

var DOMAIN_FILES = [
  "00-meta.js",
  "01-taxonomy.js",
  "02-records.js",
  "03-series.js",
  "04-vision.js",
  "05-diagnosis.js",
  "06-review.js",
  "07-report.js",
  "08-agentqa.js",
  "09-kb.js"
];

function loadDomain() {
  var files = DOMAIN_FILES.map(function (name) {
    return path.join(ROOT, DOMAIN_DIR_NAME, name);
  });
  files.push(path.join(ROOT, "scripts", "schema.js"));

  global.window = {};
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

// 反例：把领域数据改坏，断言 assertAll() 真的抛错。
// mutate 自己抛错不算通过——那说明反例构造得不对（比如改了一个不存在的字段路径）。
function expectReject(label, mutate) {
  var win = loadDomain();
  try {
    mutate(win);
  } catch (err) {
    check("反例 " + label + "（构造失败：" + err.message + "）", false);
    return;
  }
  var threw = false;
  try {
    win.DomainSchema.assertAll();
  } catch (err) {
    threw = true;
  }
  check("反例 " + label + " → 校验器抛错", threw);
}

// ---------------------------------------------------------------- 正向

var win = loadDomain();
var Schema = win.DomainSchema;

console.log("== 领域包：" + DOMAIN_DIR_NAME + " ==");

check("DomainSchema 已加载且暴露 assertAll", !!Schema && typeof Schema.assertAll === "function");
check("契约全局恰好 10 份", Schema.CONTRACT_GLOBALS.length === 10);
Schema.CONTRACT_GLOBALS.forEach(function (name) {
  check("契约全局已挂载：" + name, !!win[name]);
});

var passed = true;
var firstError = "";
try {
  Schema.assertAll();
} catch (err) {
  passed = false;
  firstError = err.message;
}
check("assertAll() 通过" + (passed ? "" : "（" + firstError + "）"), passed);

var META = win.DOMAIN_META;
var TAXONOMY = win.DOMAIN_TAXONOMY;
var RECORDS = win.DOMAIN_RECORDS;
var SERIES = win.DOMAIN_SERIES;
var VISION = win.DOMAIN_VISION;
var DIAGNOSIS = win.DOMAIN_DIAGNOSIS;
var REVIEW = win.DOMAIN_REVIEW;
var REPORT = win.DOMAIN_REPORT;
var AGENTQA = win.DOMAIN_AGENTQA;
var KB = win.DOMAIN_KB;

// ---- 导航与流程条：数量和 key 都不能靠"手数出来" ----
check("scenes 恰好 4 项", META.scenes.length === 4);
check("flowSteps 恰好 6 步", META.flowSteps.length === 6);
check("flowSteps 不含大屏/站点的步骤（那两步在本 POC 里永远点不亮）",
  META.flowSteps.every(function (step) { return step.key !== "task" && step.key !== "station"; }));

// ---- 入口契约：三个 id 都要能解析 ----
check("entry.objectId 可解析",
  TAXONOMY.objects.some(function (o) { return o.id === META.entry.objectId; }));
check("entry.partId 可解析",
  TAXONOMY.parts.some(function (p) { return p.id === META.entry.partId; }));
check("entry.recordId 可解析",
  RECORDS.records.some(function (r) { return r.id === META.entry.recordId; }));
check("entry 记录有对应的 AI 判断（否则首屏 AI 卡是空的）",
  DIAGNOSIS.cases.some(function (c) { return c.recordId === META.entry.recordId; }));

// ---- 复核人身份 ----
check("reviewers 非空", META.reviewers.length >= 1);
check("defaultReviewerId 可解析",
  META.reviewers.some(function (r) { return r.id === META.defaultReviewerId; }));
check("每个 reviewer 都有 role（报告插槽 reviewerRole 要用）",
  META.reviewers.every(function (r) { return typeof r.role === "string" && r.role.length > 0; }));

// ---- 时序生成器：确定性 + latest 同源 ----
var rangeKeys = SERIES.ranges().map(function (r) { return r.key; });
var s1 = SERIES.series(META.entry.objectId, TAXONOMY.points[0].id, rangeKeys[0]);
var s2 = SERIES.series(META.entry.objectId, TAXONOMY.points[0].id, rangeKeys[0]);
check("series() 确定：同参数两次调用完全相同", JSON.stringify(s1) === JSON.stringify(s2));
check("series().latest 等于 values 末位（大屏卡片与详情屏必须读同一个数）",
  s1.latest === s1.values[s1.values.length - 1]);
check("series() 覆盖全部区间",
  rangeKeys.every(function (key) {
    var s = SERIES.series(META.entry.objectId, TAXONOMY.points[0].id, key);
    return s.values.length === SERIES.rangeDef(key).points;
  }));
check("主线对象的主测点在本轮剧本里越线（否则工作台首屏没有异常可讲）",
  SERIES.series(META.entry.objectId, "PT-1", "7d").status === "danger");
check("对照对象不复现主线异常",
  SERIES.series("OBJ-B", "PT-1", "7d").status !== "danger");

// ---- 视觉：归一化 bbox ----
check("所有 bbox 都在 [0,1] 且不越界", VISION.frames.every(function (f) {
  var b = f.bbox;
  return b.x >= 0 && b.y >= 0 && b.w > 0 && b.h > 0 && b.x + b.w <= 1 && b.y + b.h <= 1;
}));
check("每个部位恰好一帧 role:current", TAXONOMY.parts.every(function (part) {
  return VISION.frames.filter(function (f) {
    return f.partId === part.id && f.role === "current";
  }).length === 1;
}));

// ---- AI 判断：依据链四类齐全 ----
var entryCase = DIAGNOSIS.cases.filter(function (c) { return c.recordId === META.entry.recordId; })[0];
var kinds = entryCase.evidenceChain.map(function (e) { return e.kind; });
["series", "vision", "rule", "case"].forEach(function (kind) {
  check("入口案例的依据链含 " + kind + " 类依据", kinds.indexOf(kind) >= 0);
});
check("依据链里的 case 类依据带 locked 标志（二次命中包袱的开关）",
  entryCase.evidenceChain.filter(function (e) { return e.kind === "case"; })
    .every(function (e) { return typeof e.locked === "boolean"; }));

// ---- 复核：两条 track 都有、至少一条解锁复用 ----
check("outcomes 覆盖 treatment 与 closure 两条 track",
  REVIEW.outcomes.some(function (o) { return o.track === "treatment"; })
  && REVIEW.outcomes.some(function (o) { return o.track === "closure"; }));
check("至少一条 outcome 解锁复用",
  REVIEW.outcomes.some(function (o) { return o.unlocksReuse; }));
check("分歧要求填写理由", REVIEW.divergence.requireNote === true);
check("常用语非空（现场不用打字的那条通路）", REVIEW.phrases.length >= 1);
check("每条 outcome 的 fields 都能在 fields 字典里查到",
  REVIEW.outcomes.every(function (o) {
    return o.fields.every(function (f) { return !!REVIEW.fields[f]; });
  }));

// ---- 报告：插槽闭合、两条支线产出不同 ----
function slotsIn(text) {
  var out = [];
  var re = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;
  var m = re.exec(text);
  while (m) { out.push(m[1]); m = re.exec(text); }
  return out;
}
var declaredSlots = {};
REPORT.slots.forEach(function (s) { declaredSlots[s] = true; });
var usedSlots = {};
slotsIn(REPORT.titleTpl).forEach(function (s) { usedSlots[s] = true; });
REPORT.sections.forEach(function (sec) {
  slotsIn(sec.text).forEach(function (s) { usedSlots[s] = true; });
});
check("模板用到的插槽全部已声明",
  Object.keys(usedSlots).every(function (s) { return !!declaredSlots[s]; }));
check("声明的插槽全部被用到（声明了没人用是数据腐坏的前兆）",
  REPORT.slots.every(function (s) { return !!usedSlots[s]; }));
check("声明的插槽全部在骨架可提供清单内",
  REPORT.slots.every(function (s) { return !!Schema.PROVIDED_SLOTS[s]; }));
check("报告含 reviewerName / reviewerRole 两个身份插槽",
  !!declaredSlots.reviewerName && !!declaredSlots.reviewerRole);
check("报告含 reviewNote 插槽（人工原文回显的落点）", !!declaredSlots.reviewNote);

var divergenceSection = REPORT.sections.filter(function (s) {
  return s.id === REVIEW.divergence.reportSectionId;
})[0];
check("分歧段存在且 showIf 为 divergent",
  !!divergenceSection && divergenceSection.showIf === "divergent");

function sectionsFor(track, divergent) {
  return REPORT.sections.filter(function (s) {
    if (!s.showIf) return true;
    if (s.showIf === "divergent") return divergent;
    if (s.showIf === "retestFailed") return false;
    return s.showIf === track;
  }).length;
}
var acceptCount = sectionsFor("treatment", false);
var rejectCount = sectionsFor("closure", true);
check("采纳支线与驳回支线的报告段数不同（" + acceptCount + " vs " + rejectCount
  + "；相同则说明人工介入只是装饰）", acceptCount !== rejectCount);

// ---- Agent：每个上下文都有未命中态 ----
AGENTQA.contexts.forEach(function (context) {
  check("Agent 上下文 " + context.id + " 至少有 1 条 hit:false",
    context.questions.some(function (q) { return q.hit === false; }));
  check("Agent 上下文 " + context.id + " 的 fallbackAnswer 非空",
    typeof context.fallbackAnswer === "string" && context.fallbackAnswer.length > 0);
});
check("存在 unlockedBy:archived 的问题（二次命中包袱）",
  AGENTQA.contexts.some(function (c) {
    return c.questions.some(function (q) { return q.unlockedBy === "archived"; });
  }));

// ---- 知识库：检索恒等于 citations ----
KB.qaPresets().forEach(function (preset) {
  var expected = [];
  preset.citations.forEach(function (c) {
    c.hintChunks.forEach(function (i) { expected.push(c.docId + "#" + i); });
  });
  var actual = KB.retrieve(preset.id).hits.map(function (h) { return h.docId + "#" + h.chunkIndex; });
  check("retrieve(" + preset.id + ") 恒等于 citations（不是取前 N 名）",
    expected.sort().join(",") === actual.sort().join(","));
});
check("仅摘要文档的 chunksOf() 返回空数组",
  KB.documents().filter(function (d) { return !d.body; })
    .every(function (d) { return KB.chunksOf(d.id).length === 0; }));
check("归档落点分类可解析",
  KB.categories().some(function (c) { return c.id === KB.archiveTarget().categoryId; }));
check("入库演示文档有正文", !!KB.document(KB.ingestDemoDocId()).body);
check("DOMAIN_KB 的出口全部是函数（不能混用函数与快照值）",
  ["categories", "documents", "document", "chunksOf", "qaPresets", "qaPreset",
    "retrieve", "ingestion", "ingestDemoDocId", "archiveTarget"]
    .every(function (name) { return typeof KB[name] === "function"; }));

// ---------------------------------------------------------------- 反例

console.log("");
console.log("== 构造反例：验校验器真的会抛错 ==");

// 00-meta
expectReject("contractVersion 不匹配", function (w) { w.DOMAIN_META.contractVersion = 99; });
expectReject("scenes 少一项", function (w) { w.DOMAIN_META.scenes.pop(); });
expectReject("scenes 顺序被打乱", function (w) {
  var tmp = w.DOMAIN_META.scenes[0];
  w.DOMAIN_META.scenes[0] = w.DOMAIN_META.scenes[1];
  w.DOMAIN_META.scenes[1] = tmp;
});
expectReject("flowSteps 混入大屏步骤", function (w) {
  w.DOMAIN_META.flowSteps.unshift({ key: "task", label: "任务总览", desc: "大屏" });
});
expectReject("defaultReviewerId 悬空", function (w) { w.DOMAIN_META.defaultReviewerId = "nobody"; });
expectReject("reviewer 缺 role", function (w) { delete w.DOMAIN_META.reviewers[0].role; });
expectReject("entry.recordId 悬空", function (w) { w.DOMAIN_META.entry.recordId = "REC-NONE"; });
expectReject("entry 记录没有 AI 判断", function (w) {
  w.DOMAIN_DIAGNOSIS.cases = w.DOMAIN_DIAGNOSIS.cases.filter(function (c) {
    return c.recordId !== w.DOMAIN_META.entry.recordId;
  });
});

// 01-taxonomy
expectReject("部位没有 primary 测点", function (w) {
  w.DOMAIN_TAXONOMY.points[0].primary = false;
});
expectReject("部位有两个 primary 测点", function (w) {
  w.DOMAIN_TAXONOMY.points[1].primary = true;
});
expectReject("测点 partId 悬空", function (w) { w.DOMAIN_TAXONOMY.points[0].partId = "PART-X"; });
expectReject("safeSide 非法取值", function (w) { w.DOMAIN_TAXONOMY.points[0].safeSide = "middle"; });
expectReject("part 漏写 objectId 字段", function (w) { delete w.DOMAIN_TAXONOMY.parts[0].objectId; });
expectReject("part.objectId 悬空", function (w) { w.DOMAIN_TAXONOMY.parts[0].objectId = "OBJ-X"; });
expectReject("对象 id 重复", function (w) {
  w.DOMAIN_TAXONOMY.objects[1].id = w.DOMAIN_TAXONOMY.objects[0].id;
});

// 02-records
expectReject("status-dot 列的 key 不是 aiFlag", function (w) {
  w.DOMAIN_RECORDS.columns[0].key = "flag";
});
expectReject("出现两列 status-dot", function (w) {
  w.DOMAIN_RECORDS.columns[1].type = "status-dot";
  w.DOMAIN_RECORDS.columns[1].key = "aiFlag2";
});
expectReject("列宽为 0", function (w) { w.DOMAIN_RECORDS.columns[1].width = 0; });
expectReject("记录的 aiFlag 不在字典里", function (w) {
  w.DOMAIN_RECORDS.records[0].aiFlag = "unknown";
});
expectReject("aiFlagText 缺一态", function (w) { delete w.DOMAIN_RECORDS.aiFlagText.gap; });
expectReject("记录 id 重复", function (w) {
  w.DOMAIN_RECORDS.records[1].id = w.DOMAIN_RECORDS.records[0].id;
});
expectReject("记录 partId 悬空", function (w) { w.DOMAIN_RECORDS.records[0].partId = "PART-X"; });

// 03-series
expectReject("series() 不确定（用了随机数）", function (w) {
  var original = w.DOMAIN_SERIES.series;
  w.DOMAIN_SERIES = Object.assign({}, w.DOMAIN_SERIES, {
    series: function (objectId, pointId, rangeKey) {
      var s = original(objectId, pointId, rangeKey);
      s.values[0] = Math.random();
      return s;
    }
  });
});
expectReject("series().latest 与 values 末位不一致", function (w) {
  var original = w.DOMAIN_SERIES.series;
  w.DOMAIN_SERIES = Object.assign({}, w.DOMAIN_SERIES, {
    series: function (objectId, pointId, rangeKey) {
      var s = original(objectId, pointId, rangeKey);
      s.latest = s.values[0];
      return s;
    }
  });
});
expectReject("series() 点数与区间声明不符", function (w) {
  var original = w.DOMAIN_SERIES.series;
  w.DOMAIN_SERIES = Object.assign({}, w.DOMAIN_SERIES, {
    series: function (objectId, pointId, rangeKey) {
      var s = original(objectId, pointId, rangeKey);
      s.values.pop();
      return s;
    }
  });
});

// 04-vision
expectReject("bbox 越界（x+w > 1）", function (w) { w.DOMAIN_VISION.frames[0].bbox.w = 0.9; });
expectReject("bbox 用了像素而非归一化比例", function (w) { w.DOMAIN_VISION.frames[0].bbox.x = 320; });
expectReject("frame.src 不在 media 映射表里", function (w) {
  w.DOMAIN_VISION.frames[0].src = "notExist";
});
expectReject("同一部位出现两帧 current", function (w) {
  w.DOMAIN_VISION.frames[1].role = "current";
});
expectReject("frame.findings 为空", function (w) { w.DOMAIN_VISION.frames[0].findings = []; });
expectReject("frame.confidence 超出 [0,1]", function (w) { w.DOMAIN_VISION.frames[0].confidence = 89; });

// 05-diagnosis
expectReject("suggestion.outcomeId 悬空（分歧态判断会失效）", function (w) {
  w.DOMAIN_DIAGNOSIS.cases[0].suggestion.outcomeId = "nope";
});
expectReject("依据链的 pointId 悬空", function (w) {
  w.DOMAIN_DIAGNOSIS.cases[0].evidenceChain[0].pointId = "PT-X";
});
expectReject("依据链的 frameId 悬空", function (w) {
  w.DOMAIN_DIAGNOSIS.cases[0].evidenceChain[1].frameId = "FRM-X";
});
expectReject("依据链的 docId 悬空", function (w) {
  w.DOMAIN_DIAGNOSIS.cases[0].evidenceChain[3].docId = "DOC-X";
});
expectReject("confidence 超出 [0,100]", function (w) { w.DOMAIN_DIAGNOSIS.cases[0].confidence = 820; });
expectReject("confidenceBand 非法", function (w) { w.DOMAIN_DIAGNOSIS.cases[0].confidenceBand = "medium"; });
expectReject("一条记录挂了两份 AI 判断", function (w) {
  w.DOMAIN_DIAGNOSIS.cases[1].recordId = w.DOMAIN_DIAGNOSIS.cases[0].recordId;
});

// 06-review
expectReject("votes 顺序或 id 被改", function (w) { w.DOMAIN_REVIEW.votes[0].id = "agree"; });
expectReject("outcome.fields 引用未声明字段", function (w) {
  w.DOMAIN_REVIEW.outcomes[0].fields.push("nosuch");
});
expectReject("outcome.track 非法", function (w) { w.DOMAIN_REVIEW.outcomes[0].track = "other"; });
expectReject("outcome.archive.categoryId 悬空", function (w) {
  w.DOMAIN_REVIEW.outcomes[0].archive.categoryId = "cat-x";
});
expectReject("outcome.label 重复", function (w) {
  w.DOMAIN_REVIEW.outcomes[1].label = w.DOMAIN_REVIEW.outcomes[0].label;
});
expectReject("没有任何 outcome 解锁复用（二次命中演示不出来）", function (w) {
  w.DOMAIN_REVIEW.outcomes.forEach(function (o) { o.unlocksReuse = false; });
});
expectReject("outcome.steps 为空", function (w) { w.DOMAIN_REVIEW.outcomes[0].steps = []; });
expectReject("checkbox 选项漏写 default", function (w) {
  delete w.DOMAIN_REVIEW.fields.flags.options[0].default;
});

// 07-report
expectReject("模板用了未声明的插槽", function (w) {
  w.DOMAIN_REPORT.sections[0].text += " {{unknownSlot}}";
  w.DOMAIN_REPORT.slots.push("unknownSlot");
});
expectReject("slots 声明了骨架提供不了的插槽", function (w) {
  w.DOMAIN_REPORT.slots.push("weatherToday");
  w.DOMAIN_REPORT.sections[0].text += " {{weatherToday}}";
});
expectReject("slots 声明了但模板从未使用", function (w) {
  w.DOMAIN_REPORT.sections = w.DOMAIN_REPORT.sections.filter(function (s) { return s.id !== "archive"; });
});
expectReject("删掉分歧段", function (w) {
  w.DOMAIN_REPORT.sections = w.DOMAIN_REPORT.sections.filter(function (s) { return s.id !== "divergence"; });
});
expectReject("分歧段的 showIf 被改成恒显示", function (w) {
  w.DOMAIN_REPORT.sections.forEach(function (s) {
    if (s.id === "divergence") delete s.showIf;
  });
});
expectReject("closure 支线没有专属段落（两条路径报告会完全相同）", function (w) {
  w.DOMAIN_REPORT.sections = w.DOMAIN_REPORT.sections.filter(function (s) { return s.showIf !== "closure"; });
});
expectReject("段落 status 非法三色", function (w) { w.DOMAIN_REPORT.sections[0].status = "info"; });

// 08-agentqa
expectReject("hit:true 但 hits 为空", function (w) {
  w.DOMAIN_AGENTQA.contexts[0].questions[0].hits = [];
});
expectReject("hit:false 却带了命中卡", function (w) {
  var ctx = w.DOMAIN_AGENTQA.contexts[0];
  var miss = ctx.questions.filter(function (q) { return !q.hit; })[0];
  miss.hits = [{ kind: "standard", text: "x", docId: "DOC-STD", chunkIndex: 0 }];
});
expectReject("某个上下文全部命中（失去未命中态）", function (w) {
  w.DOMAIN_AGENTQA.contexts[0].questions =
    w.DOMAIN_AGENTQA.contexts[0].questions.filter(function (q) { return q.hit; });
});
expectReject("命中卡 chunkIndex 越界", function (w) {
  w.DOMAIN_AGENTQA.contexts[0].questions[0].hits[0].chunkIndex = 99;
});
expectReject("命中卡 docId 悬空", function (w) {
  w.DOMAIN_AGENTQA.contexts[0].questions[0].hits[0].docId = "DOC-X";
});
expectReject("命中卡引用了无正文文档", function (w) {
  w.DOMAIN_KB.raw.documents.filter(function (doc) { return doc.id === "DOC-CARD"; })[0].body = null;
  w.DOMAIN_AGENTQA.contexts[0].questions[0].hits[0].docId = "DOC-CARD";
});
expectReject("unlockedBy 非法取值", function (w) {
  w.DOMAIN_AGENTQA.contexts[2].questions[1].unlockedBy = "someday";
});
expectReject("skillOptions 为空数组", function (w) {
  w.DOMAIN_AGENTQA.contexts[0].questions[0].skillOptions = [];
});
expectReject("skillOptions 缺 id", function (w) {
  delete w.DOMAIN_AGENTQA.contexts[0].questions[0].skillOptions[0].id;
});
expectReject("skillOptions id 重复", function (w) {
  w.DOMAIN_AGENTQA.contexts[0].questions[0].skillOptions[1].id =
    w.DOMAIN_AGENTQA.contexts[0].questions[0].skillOptions[0].id;
});
expectReject("skillOptions 缺 label", function (w) {
  delete w.DOMAIN_AGENTQA.contexts[0].questions[0].skillOptions[0].label;
});
expectReject("skillOptions 缺 enhancedAnswer", function (w) {
  delete w.DOMAIN_AGENTQA.contexts[0].questions[0].skillOptions[0].enhancedAnswer;
});
expectReject("上下文缺失一个", function (w) { w.DOMAIN_AGENTQA.contexts.pop(); });

// 09-kb
expectReject("文档 body 是空数组（应显式写 null）", function (w) {
  w.DOMAIN_KB.raw.documents[0].body = [];
});
expectReject("文档 categoryId 悬空", function (w) {
  w.DOMAIN_KB.raw.documents[0].categoryId = "cat-x";
});
expectReject("citations 引用了无正文文档", function (w) {
  w.DOMAIN_KB.raw.documents.filter(function (doc) { return doc.id === "DOC-STD"; })[0].body = null;
  w.DOMAIN_KB.raw.qaPresets[0].citations[0].docId = "DOC-STD";
});
expectReject("hintChunks 越界", function (w) {
  w.DOMAIN_KB.raw.qaPresets[0].citations[0].hintChunks = [99];
});
expectReject("retrieve 结果与 citations 不一致（取前 N 名那种写法）", function (w) {
  var original = w.DOMAIN_KB.retrieve;
  w.DOMAIN_KB = Object.assign({}, w.DOMAIN_KB, {
    retrieve: function (presetId) {
      var out = original(presetId);
      out.hits.push({ docId: "DOC-STD", chunkIndex: 0, text: "x", score: 0.5 });
      return out;
    }
  });
});
expectReject("ingestion 步数不足 5", function (w) {
  w.DOMAIN_KB.raw.ingestion = w.DOMAIN_KB.raw.ingestion.slice(0, 3);
});
expectReject("ingestDemoDocId 指向无正文文档", function (w) {
  w.DOMAIN_KB.raw.documents.filter(function (doc) { return doc.id === "DOC-CARD"; })[0].body = null;
  w.DOMAIN_KB.raw.ingestDemoDocId = "DOC-CARD";
});
expectReject("archiveTarget.categoryId 悬空", function (w) {
  w.DOMAIN_KB.raw.archiveTarget.categoryId = "cat-x";
});

// 契约整体
expectReject("缺少一份契约全局", function (w) { delete w.DOMAIN_VISION; });

// ---------------------------------------------------------------- 汇总

console.log("");
if (failures.length) {
  console.log("FAILED（" + failures.length + " 项）：");
  failures.forEach(function (label) { console.log("  - " + label); });
  process.exit(1);
}
console.log("ALL CHECKS PASSED（" + passCount + " 项断言）");
