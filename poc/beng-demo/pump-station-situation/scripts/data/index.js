// 数据层出口：把 scripts/data/catalog.js、scripts/data/knowledge.js 的裸数据对象和
  // scripts/data/series.js、scripts/data/records.js 的生成器合并为具名函数外壳
// window.DemoData，取代原来的裸对象 window.PUMP_DEMO_DATA。
//
// 本文件（P1-C）补齐了 P1-A 留下的 series/records 占位，并新增 ranges/points/point/
// primaryPoint/healthSeries/anomalyMix/unitCompare/record/scenario 出口。所有"未知 id"
// 一律直接抛错，不做兜底或默认值。
//
// 阶段三 G1 新增了 kbCategories/kbDocuments/kbDocument/kbChunks/kbRetrieve/
// kbIngestPlan/qaPresets/graphData 这一组"数据集架构"出口（见文件末尾单独的一节），
// 转发 scripts/data/kb.js 和 scripts/data/graph.js。knowledgeBase()/graph() 这两个
// 旧出口原样保留、转发 scripts/data/knowledge.js 的裸数据，不做任何改动——见那一节
// 顶部的说明。
//
  // 依赖顺序：本文件读取 window.DemoDataCatalog、window.DemoDataKnowledge、
  // window.DemoDataSeed、window.DemoDataSeries、window.DemoDataRecords、
  // window.DemoAgentQa、window.DemoKb、window.DemoGraph，因此 scripts/data/seed.js、scripts/data/catalog.js、
  // scripts/data/knowledge.js、scripts/data/kb-dataset.js、scripts/data/agentqa.js、scripts/data/graph-spec.js、
// scripts/data/series.js、scripts/data/records.js、scripts/data/kb.js、
// scripts/data/graph.js 必须严格排在本文件之前加载。
(function () {
  "use strict";

  var CATALOG = window.DemoDataCatalog;
  if (!CATALOG) {
    throw new Error("DemoDataCatalog is required，请检查 scripts/data/catalog.js 是否已加载");
  }
  var KNOWLEDGE = window.DemoDataKnowledge;
  if (!KNOWLEDGE) {
    throw new Error("DemoDataKnowledge is required，请检查 scripts/data/knowledge.js 是否已加载");
  }
  var AGENT_QA = window.DemoAgentQa;
  if (!AGENT_QA) {
    throw new Error("DemoAgentQa is required，请检查 scripts/data/agentqa.js 是否已加载");
  }
  var SEED = window.DemoDataSeed;
  if (!SEED) {
    throw new Error("DemoDataSeed is required，请检查 scripts/data/seed.js 是否已加载");
  }
  var SERIES = window.DemoDataSeries;
  if (!SERIES) {
    throw new Error("DemoDataSeries is required，请检查 scripts/data/series.js 是否已加载");
  }
  var RECORDS = window.DemoDataRecords;
  if (!RECORDS) {
    throw new Error("DemoDataRecords is required，请检查 scripts/data/records.js 是否已加载");
  }
  var KB = window.DemoKb;
  if (!KB) {
    throw new Error("DemoKb is required，请检查 scripts/data/kb.js 是否已加载");
  }
  var GRAPH = window.DemoGraph;
  if (!GRAPH) {
    throw new Error("DemoGraph is required，请检查 scripts/data/graph.js 是否已加载");
  }

  // parts() 的 status 派生口径统一按 P-1（本轮演示唯一的叙事机组）计算：catalog.parts
  // 本身没有 unitId 字段，其 trend/evidence 文案也都是围绕 P-1 写的，因此这里不需要、
  // 也不应该让调用方传入 unitId。
  var STATUS_UNIT = "P-1";

  function meta() {
    return CATALOG.meta;
  }

  function scenes() {
    return CATALOG.scenes;
  }

  function flowSteps() {
    return CATALOG.flowSteps;
  }

  function media(key) {
    if (!CATALOG.media[key]) throw new Error("Missing media key: " + key);
    return CATALOG.media[key];
  }

  function task() {
    return CATALOG.task;
  }

  function dashboard() {
    return CATALOG.dashboard;
  }

  function inspection() {
    return CATALOG.inspection;
  }

  function units() {
    return CATALOG.pumpUnits;
  }

  function unit(id) {
    var i;
    for (i = 0; i < CATALOG.pumpUnits.length; i += 1) {
      if (CATALOG.pumpUnits[i].id === id) return CATALOG.pumpUnits[i];
    }
    throw new Error("Missing pump unit: " + id);
  }

  // 部位表的主测点：每个部位至少要有一个 primary:true 的测点，是 parts()/part() 派生
  // status 的唯一依据。partId 不存在或没有 primary 测点都直接抛错。
  function primaryPoint(partId) {
    var i;
    for (i = 0; i < CATALOG.points.length; i += 1) {
      if (CATALOG.points[i].partId === partId && CATALOG.points[i].primary) return CATALOG.points[i];
    }
    throw new Error("Missing primary point for part: " + partId);
  }

  // status 只在这里算一次：由主测点在 STATUS_UNIT 上的 series().status 派生，
  // 不再是 catalog.js 里手写、和 trend 数值没有机械关系的字段。
  function derivedPartStatus(partId) {
    var point = primaryPoint(partId);
    return SERIES.pointStatus(STATUS_UNIT, point.id).status;
  }

  function decoratePart(rawPart) {
    return {
      id: rawPart.id,
      label: rawPart.label,
      short: rawPart.short,
      status: derivedPartStatus(rawPart.id),
      badge: rawPart.badge,
      component: rawPart.component,
      position: rawPart.position,
      summary: rawPart.summary,
      checkItem: rawPart.checkItem,
      trend: rawPart.trend,
      vision: rawPart.vision,
      evidence: rawPart.evidence,
      agent: rawPart.agent
    };
  }

  function parts() {
    return CATALOG.parts.map(decoratePart);
  }

  function part(id) {
    var i;
    for (i = 0; i < CATALOG.parts.length; i += 1) {
      if (CATALOG.parts[i].id === id) return decoratePart(CATALOG.parts[i]);
    }
    throw new Error("Missing pump part: " + id);
  }

  function workOrder() {
    return CATALOG.workOrder;
  }

  function report() {
    return CATALOG.report;
  }

  function knowledgeHits() {
    return KNOWLEDGE.knowledgeHits;
  }

  function reuse() {
    return KNOWLEDGE.reuse;
  }

  // ---------- 旧出口：原样转发 scripts/data/knowledge.js 的裸数据（legacy） ----------
  //
  // knowledgeBase()/graph() 是阶段三 G1 之前就存在的出口，scripts/scenes/knowledge.js、
  // scripts/scenes/graph.js、scripts/scenes/confirm.js、scripts/core/state.js 仍在按
  // 它们原有的返回形状读取（documents 是 [title,type,desc] 三元组数组、graph.nodes 是
  // 手写的 9 个节点等），这四个文件都不在本任务的改动范围内，因此这里不改变这两个
  // 函数的行为——本任务新增的"数据集架构"出口在下面单独一节（kbCategories/
  // kbDocuments/.../graphData），两条路径并存，互不影响。是否把 scripts/scenes/
  // knowledge.js 和 scripts/scenes/graph.js 迁移到消费新出口，见任务报告里的说明。
  function knowledgeBase() {
    return KNOWLEDGE.knowledgeBase;
  }

  function graph() {
    return KNOWLEDGE.graph;
  }

  function caseKnowledge() {
    return KNOWLEDGE.caseKnowledge;
  }

  function agentDialogs() {
    return AGENT_QA.dialogs;
  }

  function agentDialog(id) {
    var found = null;
    AGENT_QA.dialogs.forEach(function (dialog) {
      if (dialog.id === id) found = dialog;
    });
    if (!found) throw new Error("Missing agent dialog: " + id);
    return found;
  }

  // ---------- 时序数据生成器出口（P1-C 新增） ----------

  function ranges() {
    return SEED.rangeList();
  }

  function points() {
    return CATALOG.points;
  }

  // overview 大屏的 6 张状态卡名单，见 catalog.js 里的长注释（它同时是 scenes/overview.js
  // 的渲染源和 core/state.js 校验 pick.overview 的字典，只能有一份）。
  function overviewCards() {
    return CATALOG.overviewCards;
  }

  function overviewCard(id) {
    var found = null;
    CATALOG.overviewCards.forEach(function (card) { if (card.id === id) found = card; });
    if (!found) throw new Error("Missing overview card: " + id);
    return found;
  }

  // ---------- 专家结论字典 ----------
  //
  // 代码一律按 id 取结论（verdict("maintenance")），或反查 label（verdictByLabel）。
  // state.expertVerdict 存的仍是 label（沿用既有持久化格式，不改 STORAGE_KEY），
  // 但所有"这条结论意味着什么"的判断都走 isMaintenance 等字段，不再比较中文串。
  function verdicts() {
    return CATALOG.verdicts;
  }

  function verdict(id) {
    var i;
    for (i = 0; i < CATALOG.verdicts.length; i += 1) {
      if (CATALOG.verdicts[i].id === id) return CATALOG.verdicts[i];
    }
    throw new Error("Missing verdict: " + id);
  }

  // 传空（未选结论）时返回 null——"还没选"是这个状态机的合法状态，不是错误；
  // 传一个非空但对不上任何结论的 label 才抛错（那意味着字典和持久状态脱节了）。
  function verdictByLabel(label) {
    if (!label) return null;
    var i;
    for (i = 0; i < CATALOG.verdicts.length; i += 1) {
      if (CATALOG.verdicts[i].label === label) return CATALOG.verdicts[i];
    }
    throw new Error("Missing verdict label: " + label);
  }

  // "当前结论是否要进维修闭环"——归档成维修案例还是观察记录、要不要解锁 P-2 复用，
  // 全部由这一个判据决定，替掉原先散在 3 个文件里的 `=== "确认不对中"`。
  function isMaintenanceVerdict(label) {
    var found = verdictByLabel(label);
    return !!found && found.isMaintenance;
  }

  // 归档案例号：维修路径取 reuse().matchedCase（那份复用数据本身带案例号），
  // 其余路径取各自的 archiveCaseId。判据是 isMaintenance，不是中文串。
  function archiveCaseIdFor(label) {
    var current = verdictByLabel(label);
    if (!current) throw new Error("archiveCaseId 要求已选定专家结论，当前为空");
    return current.isMaintenance ? reuse().matchedCase : current.archiveCaseId;
  }

  // 归档报告的段落：维修路径取 report().sections（那份六段式报告本身），
  // 其余路径取各自的 reportSections。段落自带 status，不再由调用方按位置补一个
  // statuses 数组——那种写法在业务增删段落时会静默错位。
  function reportSectionsFor(label) {
    var current = verdictByLabel(label);
    if (!current) throw new Error("reportSections 要求已选定专家结论，当前为空");
    return current.isMaintenance ? CATALOG.report.sections : current.reportSections;
  }

  function evidencePoints() {
    return CATALOG.evidencePoints;
  }

  function statusText() {
    return CATALOG.statusText;
  }

  // 三色徽标文案：未覆盖的 status 直接抛错，不静默退回默认文案——与项目里
  // aiFlag/部位 id 那几处查表的处理方式一致。
  function badgeText(status) {
    var text = CATALOG.statusText.badge[status];
    if (!text) throw new Error("Missing badge text for status: " + status);
    return text;
  }

  function aiFlagText(aiFlag) {
    var entry = CATALOG.statusText.aiFlag[aiFlag];
    if (!entry) throw new Error("Missing aiFlag text: " + aiFlag);
    return entry;
  }

  function point(id) {
    var i;
    for (i = 0; i < CATALOG.points.length; i += 1) {
      if (CATALOG.points[i].id === id) return CATALOG.points[i];
    }
    throw new Error("Missing series point: " + id);
  }

  function scenario() {
    return CATALOG.scenario;
  }

  function series(unitId, pointId, rangeKey) {
    return SERIES.series(unitId, pointId, rangeKey);
  }

  function healthSeries(unitId, rangeKey) {
    return SERIES.healthSeries(unitId, rangeKey);
  }

  function anomalyMix(unitId, rangeKey) {
    return SERIES.anomalyMix(unitId, rangeKey);
  }

  function unitCompare(pointId, rangeKey) {
    return SERIES.unitCompare(pointId, rangeKey);
  }

  function records(unitId, rangeKey) {
    return RECORDS.records(unitId, rangeKey);
  }

  function record(id) {
    return RECORDS.record(id);
  }

  function recordColumns() {
    return RECORDS.recordColumns();
  }

  // ---------- 数据集架构出口（阶段三 G1 新增） ----------
  //
  // 全部转发 scripts/data/kb.js / scripts/data/graph.js，未知 id 一律沿用它们已有的
  // 抛错行为，这里不重复做存在性校验、不加兜底。

  function kbCategories() {
    return KB.categories();
  }

  function kbDocuments(categoryId) {
    return KB.documents(categoryId);
  }

  function kbDocument(docId) {
    return KB.document(docId);
  }

  function kbChunks(docId) {
    return KB.chunksOf(docId);
  }

  function kbRetrieve(qaPresetId) {
    return KB.retrieve(qaPresetId);
  }

  function kbIngestPlan(docId) {
    return KB.ingestPlan(docId);
  }

  function kbIngestionSteps() {
    return KB.ingestionSteps();
  }

  function qaPresets() {
    return KB.qaPresets();
  }

  function qaPreset(qaPresetId) {
    return KB.qaPreset(qaPresetId);
  }

  function graphData() {
    return GRAPH.build();
  }

  window.DemoData = {
    meta: meta,
    scenes: scenes,
    flowSteps: flowSteps,
    media: media,
    task: task,
    dashboard: dashboard,
    inspection: inspection,
    units: units,
    unit: unit,
    parts: parts,
    part: part,
    primaryPoint: primaryPoint,
    overviewCards: overviewCards,
    overviewCard: overviewCard,
    verdicts: verdicts,
    verdict: verdict,
    verdictByLabel: verdictByLabel,
    isMaintenanceVerdict: isMaintenanceVerdict,
    archiveCaseIdFor: archiveCaseIdFor,
    reportSectionsFor: reportSectionsFor,
    evidencePoints: evidencePoints,
    statusText: statusText,
    badgeText: badgeText,
    aiFlagText: aiFlagText,
    workOrder: workOrder,
    report: report,
    knowledgeHits: knowledgeHits,
    reuse: reuse,
    knowledgeBase: knowledgeBase,
    graph: graph,
    caseKnowledge: caseKnowledge,
    agentDialogs: agentDialogs,
    agentDialog: agentDialog,
    ranges: ranges,
    points: points,
    point: point,
    scenario: scenario,
    series: series,
    healthSeries: healthSeries,
    anomalyMix: anomalyMix,
    unitCompare: unitCompare,
    records: records,
    record: record,
    recordColumns: recordColumns,
    kbCategories: kbCategories,
    kbDocuments: kbDocuments,
    kbDocument: kbDocument,
    kbChunks: kbChunks,
    kbRetrieve: kbRetrieve,
    kbIngestPlan: kbIngestPlan,
    kbIngestionSteps: kbIngestionSteps,
    qaPresets: qaPresets,
    qaPreset: qaPreset,
    graphData: graphData
  };
})();
