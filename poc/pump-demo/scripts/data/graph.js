// 图谱投影器（阶段三 G1）：按 scripts/data/graph-spec.js 从 scripts/data/catalog.js
// （units/parts/points/workOrder）+ scripts/data/kb-dataset.js（规则/作业卡/案例
// 文档）投影出 { nodes, edges, spine }。目的是消除漂移——旧版 scripts/data/knowledge.js
// 的 graph.nodes 是独立手写的，改了 parts 图谱不会跟着变；投影之后，加一份规则文档
// 或改一个部位，图谱自动跟着变。
//
// 依赖顺序：必须晚于 scripts/data/graph-spec.js、scripts/data/catalog.js、
// scripts/data/kb.js，早于 scripts/data/index.js。
window.DemoGraph = (function () {
  "use strict";

  var SPEC = window.DemoGraphSpec;
  if (!SPEC) {
    throw new Error("DemoGraphSpec is required，请检查 scripts/data/graph-spec.js 是否已加载");
  }
  var CATALOG = window.DemoDataCatalog;
  if (!CATALOG) {
    throw new Error("DemoDataCatalog is required，请检查 scripts/data/catalog.js 是否已加载");
  }
  var KB = window.DemoKb;
  if (!KB) {
    throw new Error("DemoKb is required，请检查 scripts/data/kb.js 是否已加载");
  }

  function round2(value) {
    return Math.round(value * 100) / 100;
  }

  function spineOverride(id) {
    var i;
    for (i = 0; i < SPEC.spine.length; i += 1) {
      if (SPEC.spine[i].id === id) return SPEC.spine[i];
    }
    return null;
  }

  // 同一列带内、非 spine 锚点的节点按索引把列带（x）和 verticalSpan（y）都均分：
  // 第 i 个（0-based）落在 (i+1)/(count+1) 的位置，这样 count 个节点里没有谁贴在
  // 列带边缘上。
  function autoPosition(index, count, band) {
    var x = band[0] + (band[1] - band[0]) * (index + 1) / (count + 1);
    var y = SPEC.verticalSpan[0] + (SPEC.verticalSpan[1] - SPEC.verticalSpan[0]) * (index + 1) / (count + 1);
    return { x: round2(x), y: round2(y) };
  }

  function makeNode(id, label, group, index, count) {
    var band = SPEC.bands[group];
    if (!band) throw new Error("Missing graph band for group: " + group);
    var override = spineOverride(id);
    var pos = override ? { x: override.x, y: override.y } : autoPosition(index, count, band);
    return { id: id, label: label, group: group, x: pos.x, y: pos.y };
  }

  // ---------- 按 entitySources 从 catalog / kb 投影出各类节点 ----------

  function buildAssetNodes() {
    var units = CATALOG.pumpUnits;
    return units.map(function (unit, i) {
      return makeNode(unit.id, unit.name, "asset", i, units.length);
    });
  }

  function buildPartNodes() {
    var parts = CATALOG.parts;
    return parts.map(function (part, i) {
      return makeNode(part.id, part.label, "part", i, parts.length);
    });
  }

  function buildPointNodes() {
    var points = CATALOG.points;
    return points.map(function (point, i) {
      return makeNode(point.id, point.label, "point", i, points.length);
    });
  }

  function buildKbGroupNodes(group, categoryId) {
    var docs = KB.documents(categoryId);
    return docs.map(function (doc, i) {
      return makeNode(doc.id, doc.title, group, i, docs.length);
    });
  }

  function buildAgentNode() {
    var source = SPEC.entitySources.agent;
    return [makeNode(source.id, source.label, "agent", 0, 1)];
  }

  function buildTicketNode() {
    var workOrder = CATALOG.workOrder;
    return [makeNode(workOrder.id, workOrder.title, "ticket", 0, 1)];
  }

  // ---------- 关系成边 ----------

  function edgeLabel(from, to) {
    var i;
    for (i = 0; i < SPEC.edgeRules.length; i += 1) {
      if (SPEC.edgeRules[i].from === from && SPEC.edgeRules[i].to === to) return SPEC.edgeRules[i].label;
    }
    throw new Error("Missing edge rule: " + from + " -> " + to);
  }

  function buildEdges() {
    var edges = [];

    // asset -> part：主叙事机组（primaryAssetId）定位到全部部位。
    CATALOG.parts.forEach(function (part) {
      edges.push([SPEC.primaryAssetId, part.id, edgeLabel("asset", "part")]);
    });

    // part -> point：直接按 catalog.points[].partId 关联，不手写。
    CATALOG.points.forEach(function (point) {
      edges.push([point.partId, point.id, edgeLabel("part", "point")]);
    });

    // point -> rule：按 spec.pointRuleTriggers 声明表。
    SPEC.pointRuleTriggers.forEach(function (link) {
      edges.push([link.pointId, link.docId, edgeLabel("point", "rule")]);
    });

    // rule -> workcard：按 spec.ruleWorkcardLinks 声明表。
    SPEC.ruleWorkcardLinks.forEach(function (link) {
      edges.push([link.ruleDocId, link.workcardDocId, edgeLabel("rule", "workcard")]);
    });

    // rule -> agent、workcard -> agent：全部规则/作业卡节点都汇入唯一的 Agent 节点。
    var agentId = SPEC.entitySources.agent.id;
    KB.documents(SPEC.entitySources.rule.categoryId).forEach(function (doc) {
      edges.push([doc.id, agentId, edgeLabel("rule", "agent")]);
    });
    KB.documents(SPEC.entitySources.workcard.categoryId).forEach(function (doc) {
      edges.push([doc.id, agentId, edgeLabel("workcard", "agent")]);
    });

    // agent -> ticket：Agent 生成处置票卡建议。
    edges.push([agentId, CATALOG.workOrder.id, edgeLabel("agent", "ticket")]);

    // ticket -> case：按 spec.ticketCaseLinks 声明表。
    SPEC.ticketCaseLinks.forEach(function (link) {
      edges.push([link.ticketId, link.caseDocId, edgeLabel("ticket", "case")]);
    });

    // case -> asset：按 spec.caseReuseLinks 声明表（对应旧版"P-2 二次命中"）。
    SPEC.caseReuseLinks.forEach(function (link) {
      edges.push([link.caseDocId, link.assetId, edgeLabel("case", "asset")]);
    });

    return edges;
  }

  function build() {
    var nodes = []
      .concat(buildAssetNodes())
      .concat(buildPartNodes())
      .concat(buildPointNodes())
      .concat(buildKbGroupNodes("rule", SPEC.entitySources.rule.categoryId))
      .concat(buildKbGroupNodes("workcard", SPEC.entitySources.workcard.categoryId))
      .concat(buildKbGroupNodes("case", SPEC.entitySources.case.categoryId))
      .concat(buildAgentNode())
      .concat(buildTicketNode());

    var spine = SPEC.spine.map(function (item) { return item.id; });

    return { nodes: nodes, edges: buildEdges(), spine: spine };
  }

  return {
    build: build
  };
})();
