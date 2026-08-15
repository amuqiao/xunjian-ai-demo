// 分类法 + 数据契约验证脚本。纯 Node，无浏览器：scripts/kg/*.js 都是往 window 上挂东西
// 的经典脚本，这里手工搭一个假 window 之后按加载顺序依次 require 即可。
//
// 用法：
//   node poc/graph-stage/verify/verify_taxonomy.js
//
// ---- 这个脚本的一半篇幅是"构造反例" ----
// 只断言"合法数据能通过"是不够的：一个什么都不检查的空校验器同样能让那种断言全绿。
// 所以每一条规则都配一个把数据改坏的反例，断言校验器**真的抛错**。这条纪律照抄
// poc/diagnosis-flow/verify/verify_domain.js 的 expectReject() 骨架与 README 纪律：
// 写完一条断言要能回答——如果这个功能坏了，它会红吗？
"use strict";

var path = require("path");

var ROOT = path.join(__dirname, "..");
var TAXONOMY_FILE = path.join(ROOT, "scripts", "kg", "taxonomy.js");
var CONTRACT_FILE = path.join(ROOT, "scripts", "kg", "contract.js");

// 按 L1 契约层的加载顺序（taxonomy.js → contract.js）搭一个全新的假 window，
// 每次都清 require 缓存重新 require，保证测试之间互不污染。
function loadModules() {
  global.window = {};
  [TAXONOMY_FILE, CONTRACT_FILE].forEach(function (file) {
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

// 反例框架：mutate 自身抛错不算通过——那说明反例构造得不对（比如改了一个不存在
// 的字段路径），要记 FAIL，不是校验器生效了。
function expectReject(label, mutate, run) {
  var win = loadModules();
  try {
    mutate(win);
  } catch (err) {
    check("反例 " + label + "（构造失败：" + err.message + "）", false);
    return;
  }
  var threw = false;
  try {
    run(win);
  } catch (err) {
    threw = true;
  }
  check("反例 " + label + " → 校验器抛错", threw);
}

function assertTaxonomyOf(win) {
  return win.KGContract.assertTaxonomy();
}

function assertDataOf(win) {
  return win.KGContract.assertData(buildValidData());
}

// ---------------------------------------------------------------- 合法数据 fixture
//
// 一棵最小但完整的合法树：root → T01 → T01-F01 → T01-F01-K01 → T01-F01-K01-C01，
// 外加两个 facet 成员 D1（技术领域）、B1（业务），一份 domainOf/bizOf 派生边、
// 一条 crossRels（supports）边、一份文档。每次调用都返回全新对象，避免跨用例污染。
function buildValidData() {
  var nodes = [
    {
      id: "root", type: "root", level: 0,
      name: "图谱根", short: "图谱根", summary: "国家管网技术图谱的根节点。",
      weight: 6, parentId: null, domainIds: [], businessIds: [], docId: "DOC-ROOT"
    },
    {
      id: "T01", type: "task", level: 1,
      name: "管道失效与灾害控制", short: "失效与灾害控制", summary: "十大重点任务之一。",
      weight: 5, parentId: "root", domainIds: [], businessIds: []
    },
    {
      id: "T01-F01", type: "direction", level: 2,
      name: "管道失效机理与完整性评价", short: "失效机理与评价", summary: "T01 下的攻关方向。",
      weight: 4, parentId: "T01", domainIds: [], businessIds: []
    },
    {
      id: "T01-F01-K01", type: "technology", level: 3,
      name: "高钢级管道断裂控制与止裂技术", short: "断裂控制与止裂", summary: "F01 下的攻关技术。",
      weight: 3, parentId: "T01-F01", domainIds: [], businessIds: []
    },
    {
      id: "T01-F01-K01-C01", type: "content", level: 4,
      name: "止裂韧性判据修正研究", short: "止裂判据修正", summary: "K01 下的攻关内容。",
      weight: 2, parentId: "T01-F01-K01", domainIds: ["D1"], businessIds: ["B1"]
    },
    {
      id: "D1", type: "domain", level: null,
      name: "安全与维护", short: "安全维护", summary: "七大技术领域之一。",
      weight: 4, parentId: "root", domainIds: [], businessIds: []
    },
    {
      id: "B1", type: "business", level: null,
      name: "管道", short: "管道", summary: "三大业务之一。",
      weight: 4, parentId: "root", domainIds: [], businessIds: []
    }
  ];
  var edges = [
    { s: "root", t: "T01", rel: "contains" },
    { s: "T01", t: "T01-F01", rel: "contains" },
    { s: "T01-F01", t: "T01-F01-K01", rel: "contains" },
    { s: "T01-F01-K01", t: "T01-F01-K01-C01", rel: "contains" },
    { s: "root", t: "D1", rel: "contains" },
    { s: "root", t: "B1", rel: "contains" },
    { s: "D1", t: "T01-F01-K01-C01", rel: "domainOf" },
    { s: "B1", t: "T01-F01-K01-C01", rel: "bizOf" },
    { s: "T01-F01-K01-C01", t: "T01", rel: "supports" }
  ];
  var docs = {
    "DOC-ROOT": { title: "图谱说明", body: "国家管网技术图谱总览文档正文。" }
  };
  return { nodes: nodes, edges: edges, docs: docs };
}

// ---------------------------------------------------------------- 正向

var win = loadModules();
var Taxonomy = win.KGTaxonomy;
var Contract = win.KGContract;

console.log("== graph-stage 分类法 + 数据契约 ==");

check("window.KGTaxonomy 已加载", !!Taxonomy && typeof Taxonomy === "object");
check("window.KGContract 已加载", !!Contract && typeof Contract === "object");
check("KGContract 暴露全部 7 个公开函数",
  ["assertTaxonomy", "assertNodeShape", "assertEdgeShape", "assertDocShape", "assertData",
    "buildIdPattern", "buildFacetIdPattern"].every(function (name) { return typeof Contract[name] === "function"; }));

var taxonomyPassed = true, taxonomyErr = "";
try { Contract.assertTaxonomy(); } catch (err) { taxonomyPassed = false; taxonomyErr = err.message; }
check("assertTaxonomy() 对默认合法分类法通过" + (taxonomyPassed ? "" : "（" + taxonomyErr + "）"), taxonomyPassed);

check("levels/facets 数量符合国家管网口径（5 层 + 2 维）",
  Taxonomy.levels.length === 5 && Taxonomy.facets.length === 2);

check("buildIdPattern(0) 匹配 \"root\"", Contract.buildIdPattern(0).test("root"));
check("buildIdPattern(1) 匹配 \"T01\"", Contract.buildIdPattern(1).test("T01"));
check("buildIdPattern(2) 匹配 \"T01-F01\"", Contract.buildIdPattern(2).test("T01-F01"));
check("buildIdPattern(3) 匹配 \"T01-F01-K01\"", Contract.buildIdPattern(3).test("T01-F01-K01"));
check("buildIdPattern(4) 匹配 \"T01-F01-K01-C01\"", Contract.buildIdPattern(4).test("T01-F01-K01-C01"));
check("buildIdPattern(4) 不匹配缺最后一段的 \"T01-F01-K01\"", !Contract.buildIdPattern(4).test("T01-F01-K01"));

check("buildFacetIdPattern(\"domain\") 匹配 \"D1\"", Contract.buildFacetIdPattern("domain").test("D1"));
check("buildFacetIdPattern(\"business\") 匹配 \"B1\"", Contract.buildFacetIdPattern("business").test("B1"));

check("typeOf(\"root\") === \"root\"", Contract.typeOf("root") === "root");
check("typeOf(\"T01\") === \"task\"", Contract.typeOf("T01") === "task");
check("typeOf(\"T01-F01\") === \"direction\"", Contract.typeOf("T01-F01") === "direction");
check("typeOf(\"T01-F01-K01\") === \"technology\"", Contract.typeOf("T01-F01-K01") === "technology");
check("typeOf(\"T01-F01-K01-C01\") === \"content\"", Contract.typeOf("T01-F01-K01-C01") === "content");
check("typeOf(\"D1\") === \"domain\"", Contract.typeOf("D1") === "domain");
check("typeOf(\"B1\") === \"business\"", Contract.typeOf("B1") === "business");

check("levelOf(\"root\") === 0", Contract.levelOf("root") === 0);
check("levelOf(\"T01\") === 1", Contract.levelOf("T01") === 1);
check("levelOf(\"T01-F01-K01-C01\") === 4", Contract.levelOf("T01-F01-K01-C01") === 4);

check("parentIdOf(\"T01\") === \"root\"", Contract.parentIdOf("T01") === "root");
check("parentIdOf(\"T01-F01\") === \"T01\"", Contract.parentIdOf("T01-F01") === "T01");
check("parentIdOf(\"T01-F01-K01-C01\") === \"T01-F01-K01\"", Contract.parentIdOf("T01-F01-K01-C01") === "T01-F01-K01");
check("parentIdOf(\"D1\") === \"root\"（横切维度成员挂在根节点下）", Contract.parentIdOf("D1") === "root");

var relEnum = Contract.validRelNames();
check("validRelNames() 恰好含 5 个关系名", relEnum.length === 5);
check("validRelNames() 集合与期望完全一致",
  relEnum.slice().sort().join(",") === ["bizOf", "contains", "domainOf", "relatesTo", "supports"].sort().join(","));

var validData = buildValidData();
var nodeShapeAllOk = validData.nodes.every(function (node) {
  try { Contract.assertNodeShape(node); return true; } catch (e) { return false; }
});
check("assertNodeShape() 对全部 " + validData.nodes.length + " 个合法节点逐一通过", nodeShapeAllOk);

var edgeShapeAllOk = validData.edges.every(function (edge) {
  try { Contract.assertEdgeShape(edge); return true; } catch (e) { return false; }
});
check("assertEdgeShape() 对全部 " + validData.edges.length + " 条合法边逐一通过", edgeShapeAllOk);

var docOk = true, docErr = "";
try { Contract.assertDocShape(validData.docs["DOC-ROOT"]); } catch (e) { docOk = false; docErr = e.message; }
check("assertDocShape(DOC-ROOT) 对合法文档通过" + (docOk ? "" : "（" + docErr + "）"), docOk);

var dataOk = true, dataErr = "";
try { Contract.assertData(buildValidData()); } catch (e) { dataOk = false; dataErr = e.message; }
check("assertData(合法数据集) 通过" + (dataOk ? "" : "（" + dataErr + "）"), dataOk);

// ---- 元断言：深度真的是数据 ----
// 把 levels 砍到 3 层（root/task/direction）后，buildIdPattern() 拼出的、覆盖最深层
// 的正则必须不再匹配原来 5 层才够得着的 "T01-F01-K01-C01"。这条证明层数不是写死在
// 某处的常量，而是每次都从 window.KGTaxonomy.levels 现读出来的。
(function metaAssertion() {
  var metaWin = loadModules();
  var before = metaWin.KGContract.buildIdPattern(metaWin.KGTaxonomy.levels.length - 1);
  check("砍层前：最深层正则匹配 \"T01-F01-K01-C01\"", before.test("T01-F01-K01-C01"));
  metaWin.KGTaxonomy.levels = metaWin.KGTaxonomy.levels.slice(0, 3); // 只留 root/task/direction
  var after = metaWin.KGContract.buildIdPattern(metaWin.KGTaxonomy.levels.length - 1);
  check("【元断言】砍层后（3 层）：最深层正则不再匹配 \"T01-F01-K01-C01\"", !after.test("T01-F01-K01-C01"));
})();

// ---------------------------------------------------------------- 反例：分类法自身形状

console.log("");
console.log("== 构造反例：分类法自身形状 ==");

expectReject("levels[2].seg.prefix 与 levels[1] 重复", function (w) {
  w.KGTaxonomy.levels[2].seg.prefix = w.KGTaxonomy.levels[1].seg.prefix;
}, assertTaxonomyOf);

expectReject("facets[0] 缺少 rel（保留 memberField）", function (w) {
  delete w.KGTaxonomy.facets[0].rel;
}, assertTaxonomyOf);

expectReject("facets[1] 缺少 memberField（保留 rel）", function (w) {
  delete w.KGTaxonomy.facets[1].memberField;
}, assertTaxonomyOf);

expectReject("levels[3].level 不连续（跳号）", function (w) {
  w.KGTaxonomy.levels[3].level = 7;
}, assertTaxonomyOf);

expectReject("根层 levels[0].seg 非 null", function (w) {
  w.KGTaxonomy.levels[0].seg = { prefix: "X", digits: 1 };
}, assertTaxonomyOf);

expectReject("facets[0].type 与 levels[1].type 撞名", function (w) {
  w.KGTaxonomy.facets[0].type = w.KGTaxonomy.levels[1].type;
}, assertTaxonomyOf);

expectReject("facets[].seg.prefix 重复（横切维度之间）", function (w) {
  w.KGTaxonomy.facets[1].seg.prefix = w.KGTaxonomy.facets[0].seg.prefix;
}, assertTaxonomyOf);

expectReject("crossRels 与某 facet.rel 重名", function (w) {
  w.KGTaxonomy.crossRels.push(w.KGTaxonomy.facets[0].rel);
}, assertTaxonomyOf);

expectReject("rootId 为空字符串", function (w) {
  w.KGTaxonomy.rootId = "";
}, assertTaxonomyOf);

// ---------------------------------------------------------------- 反例：节点 / 边 / 数据集

console.log("");
console.log("== 构造反例：节点 / 边 / 数据集 ==");

expectReject("节点 id 重复", function (w) {
  w.__data = buildValidData();
  w.__data.nodes.push(Object.assign({}, w.__data.nodes[1]));
}, function (w) { return w.KGContract.assertData(w.__data); });

expectReject("节点缺少 name 字段", function (w) {
  w.__data = buildValidData();
  delete w.__data.nodes[1].name;
}, function (w) { return w.KGContract.assertData(w.__data); });

expectReject("节点 type 与 id 格式不一致", function (w) {
  w.__data = buildValidData();
  w.__data.nodes[1].type = "direction";
}, function (w) { return w.KGContract.assertData(w.__data); });

expectReject("节点 level 与 id 推导层级不一致", function (w) {
  w.__data = buildValidData();
  w.__data.nodes[1].level = 2;
}, function (w) { return w.KGContract.assertData(w.__data); });

expectReject("facet 节点（D1）却带了非 null 的 level", function (w) {
  w.__data = buildValidData();
  w.__data.nodes[5].level = 1;
}, function (w) { return w.KGContract.assertData(w.__data); });

expectReject("节点 weight 越界（0）", function (w) {
  w.__data = buildValidData();
  w.__data.nodes[1].weight = 0;
}, function (w) { return w.KGContract.assertData(w.__data); });

expectReject("根节点却有 parentId", function (w) {
  w.__data = buildValidData();
  w.__data.nodes[0].parentId = "T01";
}, function (w) { return w.KGContract.assertData(w.__data); });

expectReject("非根节点 parentId 与推导值不一致", function (w) {
  w.__data = buildValidData();
  w.__data.nodes[2].parentId = "root";
}, function (w) { return w.KGContract.assertData(w.__data); });

expectReject("节点 domainIds 含非法格式 id", function (w) {
  w.__data = buildValidData();
  w.__data.nodes[4].domainIds.push("DX");
}, function (w) { return w.KGContract.assertData(w.__data); });

expectReject("节点 docId 指向不存在的文档", function (w) {
  w.__data = buildValidData();
  w.__data.nodes[0].docId = "DOC-NONE";
}, function (w) { return w.KGContract.assertData(w.__data); });

expectReject("边缺少 s", function (w) {
  w.__data = buildValidData();
  delete w.__data.edges[0].s;
}, function (w) { return w.KGContract.assertData(w.__data); });

expectReject("边 s 与 t 相同（自环）", function (w) {
  w.__data = buildValidData();
  w.__data.edges[0].t = w.__data.edges[0].s;
}, function (w) { return w.KGContract.assertData(w.__data); });

expectReject("边 rel 不在合法枚举内", function (w) {
  w.__data = buildValidData();
  w.__data.edges[0].rel = "unknown";
}, function (w) { return w.KGContract.assertData(w.__data); });

expectReject("contains 边与 id 推导父子关系不一致", function (w) {
  w.__data = buildValidData();
  w.__data.edges[1].s = "root";
}, function (w) { return w.KGContract.assertData(w.__data); });

expectReject("domainOf 边的 s 不匹配 domain 格式", function (w) {
  w.__data = buildValidData();
  w.__data.edges[6].s = "T01";
}, function (w) { return w.KGContract.assertData(w.__data); });

expectReject("边端点 s 在 nodes 中不存在", function (w) {
  w.__data = buildValidData();
  w.__data.edges[0].s = "T99";
}, function (w) { return w.KGContract.assertData(w.__data); });

expectReject("contains 边多父（某节点两条入边）", function (w) {
  w.__data = buildValidData();
  w.__data.edges.push({ s: "D1", t: "T01-F01", rel: "contains" });
}, function (w) { return w.KGContract.assertData(w.__data); });

expectReject("contains 成环", function (w) {
  w.__data = buildValidData();
  w.__data.edges = w.__data.edges.filter(function (e) { return !(e.s === "T01" && e.t === "T01-F01"); });
  w.__data.edges.push({ s: "T01-F01-K01-C01", t: "T01", rel: "contains" });
  w.__data.edges.push({ s: "T01", t: "T01-F01", rel: "contains" });
}, function (w) { return w.KGContract.assertData(w.__data); });

expectReject("主干层级节点未通过 contains 从根可达（孤儿）", function (w) {
  w.__data = buildValidData();
  w.__data.edges = w.__data.edges.filter(function (e) { return !(e.s === "T01-F01" && e.t === "T01-F01-K01"); });
}, function (w) { return w.KGContract.assertData(w.__data); });

expectReject("节点声明了 domainIds 但缺对应 domainOf 边", function (w) {
  w.__data = buildValidData();
  w.__data.edges = w.__data.edges.filter(function (e) { return e.rel !== "domainOf"; });
}, function (w) { return w.KGContract.assertData(w.__data); });

expectReject("文档缺少 title", function (w) {
  w.__data = buildValidData();
  delete w.__data.docs["DOC-ROOT"].title;
}, function (w) { return w.KGContract.assertData(w.__data); });

// ---------------------------------------------------------------- 汇总

console.log("");
if (failures.length) {
  console.log("FAILED（" + failures.length + " 项）：");
  failures.forEach(function (label) { console.log("  - " + label); });
  process.exit(1);
}
console.log("ALL CHECKS PASSED（" + passCount + " 项断言）");
