// 数据集 schema 定义与校验器（阶段三 G1）。校验器的作用是让"换错了数据集"在启动时
// 就指名道姓地报错，而不是等到某个场景静默渲染成空白——这个项目已经因为这类静默失败
// 折腾过两次（pick.overview 存成 MOT-DE-H 整页空白、station 雷达图纯黑）。
//
// 本文件只定义函数，不在加载时读取任何其它数据文件的全局（那些文件的加载顺序在
// index.html 里排在本文件前后都有），所有跨文件的读取都发生在 assertAll() 被调用
// 的那一刻——按 index.html 现有顺序，assertAll() 应该在 scripts/boot.js 里、所有
// L2 数据文件都加载完之后调用（boot.js 已有的 Pump3DContract.assertData() 调用点
// 之前或之后均可，两者是独立的断言，互不依赖）。
//
// 对外只暴露一个函数：window.DemoDataSchema.assertAll()，无参数，无返回值，
// 发现任何不合规直接 throw Error，不做兜底、不吞错、不返回校验结果列表。
window.DemoDataSchema = (function () {
  "use strict";

  var SCHEMA_VERSION = 1;

  function fail(message) {
    throw new Error("[DemoDataSchema] " + message);
  }

  function isNonEmptyString(value) {
    return typeof value === "string" && value.length > 0;
  }

  // 校验 list 里每一项的 idKey 字段存在、非空、且互不重复；返回一个 { id: true } 的
  // 字典供调用方做后续的悬空引用校验。
  function assertUniqueIds(label, list, idKey) {
    var seen = {};
    var i, id;
    for (i = 0; i < list.length; i += 1) {
      id = list[i][idKey];
      if (!isNonEmptyString(id)) fail(label + "[" + i + "]." + idKey + " 缺失或不是非空字符串");
      if (seen[id]) fail(label + " 的 " + idKey + " 重复：" + id);
      seen[id] = true;
    }
    return seen;
  }

  // ---------- catalog.js: parts[].vision.frames ----------
  //
  // frames 是给"证据质检"场景用的可点选关键帧列表，bbox 是 0~1 的归一化比例（不是
  // 像素），换分辨率不同的图也不会错位。frame.src 必须能在 CATALOG.media 里查到，
  // 查不到、bbox 越界、findings 数量不对，全部直接抛错，不做兜底。

  var BOX_LABEL_MIN = 1;
  var FINDINGS_MIN = 1;
  var FINDINGS_MAX = 4;

  function isFiniteNumber(value) {
    return typeof value === "number" && isFinite(value);
  }

  function assertBbox(label, bbox) {
    if (!bbox || typeof bbox !== "object") fail(label + " 缺失或不是对象");
    var keys = ["x", "y", "w", "h"];
    keys.forEach(function (key) {
      if (!isFiniteNumber(bbox[key])) fail(label + "." + key + " 必须是数字：" + bbox[key]);
      if (bbox[key] < 0 || bbox[key] > 1) fail(label + "." + key + " 必须落在 [0,1] 区间内，实际为 " + bbox[key]);
    });
    if (bbox.x + bbox.w > 1) fail(label + " 越界：x(" + bbox.x + ") + w(" + bbox.w + ") > 1");
    if (bbox.y + bbox.h > 1) fail(label + " 越界：y(" + bbox.y + ") + h(" + bbox.h + ") > 1");
  }

  function assertPartsVisionFrames(catalog) {
    if (!Array.isArray(catalog.parts) || !catalog.parts.length) fail("DemoDataCatalog.parts 必须是非空数组");

    var frameIdSeen = {};
    catalog.parts.forEach(function (part, i) {
      var label = "parts[" + i + "]（" + part.id + "）.vision";
      var vision = part.vision;
      if (!vision || typeof vision !== "object") fail(label + " 缺失");
      if (!Array.isArray(vision.frames) || !vision.frames.length) fail(label + ".frames 必须是非空数组");

      vision.frames.forEach(function (frame, j) {
        var flabel = label + ".frames[" + j + "]";
        if (!isNonEmptyString(frame.id)) fail(flabel + ".id 缺失或不是非空字符串");
        if (frameIdSeen[frame.id]) fail("vision.frames 的 id 全局重复：" + frame.id);
        frameIdSeen[frame.id] = true;

        if (!isNonEmptyString(frame.src)) fail(flabel + ".src 缺失或不是非空字符串");
        if (!catalog.media[frame.src]) fail(flabel + ".src 在 media 映射表里查不到：" + frame.src);

        assertBbox(flabel + ".bbox", frame.bbox);

        if (!isNonEmptyString(frame.boxLabel) || frame.boxLabel.length < BOX_LABEL_MIN) {
          fail(flabel + ".boxLabel 必须是非空字符串");
        }

        if (!Array.isArray(frame.findings) || frame.findings.length < FINDINGS_MIN || frame.findings.length > FINDINGS_MAX) {
          fail(flabel + ".findings 长度必须在 [" + FINDINGS_MIN + "," + FINDINGS_MAX + "] 之间，实际为 " + (frame.findings && frame.findings.length));
        }
        frame.findings.forEach(function (finding, k) {
          if (!isNonEmptyString(finding)) fail(flabel + ".findings[" + k + "] 必须是非空字符串");
        });
      });
    });
  }

  // ---------- records.js: recordColumns() ----------

  var RECORD_COLUMN_TYPES = { "status-dot": true, "text": true, "badge-icon": true };

  function assertRecordColumns(columns) {
    if (!Array.isArray(columns) || !columns.length) fail("DemoDataRecords.recordColumns() 必须是非空数组");
    var seenKeys = {};
    columns.forEach(function (column, i) {
      var label = "recordColumns[" + i + "]";
      if (!isNonEmptyString(column.key)) fail(label + ".key 缺失或不是非空字符串");
      if (seenKeys[column.key]) fail("recordColumns 的 key 重复：" + column.key);
      seenKeys[column.key] = true;

      if (typeof column.label !== "string") fail(label + "（" + column.key + "）.label 必须是字符串");

      if (!RECORD_COLUMN_TYPES[column.type]) {
        fail(label + "（" + column.key + "）.type 不是合法取值（status-dot/text/badge-icon）：" + column.type);
      }

      if (!isFiniteNumber(column.width) || column.width <= 0) {
        fail(label + "（" + column.key + "）.width 必须是正数：" + column.width);
      }
    });
  }

  // ---------- verdicts / evidencePoints / statusText（专家结论与口径文案） ----------
  //
  // 这三样是业务最常改的数据，校验因此写得比较严：结论 id/label 都不能重复（label
  // 重复会让 verdictByLabel 反查出错误的那条）、必须恰好有一条 isMaintenance
  // （维修路径是闭环解锁的唯一判据，0 条会让归档永远不解锁、2 条会让判断产生歧义）、
  // 非维修结论必须自带 steps 和 archiveCaseId（维修那条刻意留 null，走 workOrder
  // 和 reuse 的数据，不重复存）。
  var STATUS_KEYS = { danger: true, warn: true, ok: true };

  function assertVerdicts(catalog) {
    var list = catalog.verdicts;
    if (!Array.isArray(list) || !list.length) fail("DemoDataCatalog.verdicts 必须是非空数组");
    var seenIds = {};
    var seenLabels = {};
    var maintenanceCount = 0;
    list.forEach(function (item, i) {
      var label = "verdicts[" + i + "]";
      if (!isNonEmptyString(item.id)) fail(label + ".id 缺失或不是非空字符串");
      if (seenIds[item.id]) fail("verdicts 的 id 重复：" + item.id);
      seenIds[item.id] = true;

      if (!isNonEmptyString(item.label)) fail(label + "（" + item.id + "）.label 缺失");
      if (seenLabels[item.label]) fail("verdicts 的 label 重复：" + item.label + "（label 是 verdictByLabel 的反查键，重复会取到错误的结论）");
      seenLabels[item.label] = true;

      if (item.isMaintenance !== true && item.isMaintenance !== false) {
        fail(label + "（" + item.id + "）.isMaintenance 必须显式为 true/false");
      }
      if (item.isMaintenance) maintenanceCount += 1;

      ["hint", "impact", "archiveTitle", "archiveStatusText", "agentClosureText"].forEach(function (field) {
        if (!isNonEmptyString(item[field])) fail(label + "（" + item.id + "）." + field + " 缺失或不是非空字符串");
      });

      if (item.isMaintenance) {
        if (item.steps !== null) fail(label + "（" + item.id + "）.steps 必须为 null：维修路径的步骤取 workOrder.steps，不在 verdicts 里重复存");
        if (item.archiveCaseId !== null) fail(label + "（" + item.id + "）.archiveCaseId 必须为 null：维修路径的案例号取 reuse().matchedCase");
      } else {
        if (!Array.isArray(item.steps) || !item.steps.length) fail(label + "（" + item.id + "）.steps 必须是非空数组");
        item.steps.forEach(function (step, j) {
          if (!isNonEmptyString(step)) fail(label + "（" + item.id + "）.steps[" + j + "] 必须是非空字符串");
        });
        if (!isNonEmptyString(item.archiveCaseId)) fail(label + "（" + item.id + "）.archiveCaseId 缺失");
      }
    });
    if (maintenanceCount !== 1) {
      fail("verdicts 必须恰好有 1 条 isMaintenance:true（实际 " + maintenanceCount + " 条）：它是归档成维修案例、解锁 P-2 复用的唯一判据");
    }
  }

  // 报告段落：维修路径的 report.sections 和非维修路径的 verdicts[].reportSections
  // 用同一套形状校验（title/text/status 三件都必须在），因为 archive.js 用同一个
  // 渲染函数消费它们。status 必须是合法三色——原来它是调用方按位置补的一个数组，
  // 段落数量一变就整体错位，现在放进数据、逐条校验。
  function assertReportSectionList(list, label) {
    if (!Array.isArray(list) || !list.length) fail(label + " 必须是非空数组");
    list.forEach(function (section, i) {
      var at = label + "[" + i + "]";
      if (!isNonEmptyString(section.title)) fail(at + ".title 缺失或不是非空字符串");
      if (!isNonEmptyString(section.text)) fail(at + ".text 缺失或不是非空字符串");
      if (!STATUS_KEYS[section.status]) fail(at + "（" + section.title + "）.status 不是合法三色取值：" + section.status);
    });
  }

  function assertReportSections(catalog) {
    if (!catalog.report || !isNonEmptyString(catalog.report.title)) fail("DemoDataCatalog.report.title 缺失");
    assertReportSectionList(catalog.report.sections, "report.sections");
    catalog.verdicts.forEach(function (item) {
      if (item.isMaintenance) {
        if (item.reportSections !== null) {
          fail("verdicts（" + item.id + "）.reportSections 必须为 null：维修路径的报告段落取 report.sections，不重复存");
        }
      } else {
        assertReportSectionList(item.reportSections, "verdicts（" + item.id + "）.reportSections");
      }
    });
  }

  function assertEvidencePoints(catalog) {
    var list = catalog.evidencePoints;
    if (!Array.isArray(list) || !list.length) fail("DemoDataCatalog.evidencePoints 必须是非空数组");
    var pointIds = {};
    catalog.points.forEach(function (point) { pointIds[point.id] = true; });
    list.forEach(function (id, i) {
      if (!isNonEmptyString(id)) fail("evidencePoints[" + i + "] 必须是非空字符串");
      if (!pointIds[id]) fail("evidencePoints[" + i + "] 在 points 表里查不到：" + id);
    });
  }

  function assertStatusText(catalog) {
    var text = catalog.statusText;
    if (!text || typeof text !== "object") fail("DemoDataCatalog.statusText 缺失");
    if (!text.badge || typeof text.badge !== "object") fail("statusText.badge 缺失");
    Object.keys(STATUS_KEYS).forEach(function (key) {
      if (!isNonEmptyString(text.badge[key])) fail("statusText.badge." + key + " 缺失（三色语义必须全覆盖）");
    });
    if (!text.aiFlag || typeof text.aiFlag !== "object") fail("statusText.aiFlag 缺失");
    var flags = Object.keys(text.aiFlag);
    if (!flags.length) fail("statusText.aiFlag 不能为空");
    flags.forEach(function (flag) {
      var entry = text.aiFlag[flag];
      if (!entry || typeof entry !== "object") fail("statusText.aiFlag." + flag + " 必须是对象");
      if (!STATUS_KEYS[entry.status]) fail("statusText.aiFlag." + flag + ".status 不是合法三色取值：" + entry.status);
      if (!isNonEmptyString(entry.badge)) fail("statusText.aiFlag." + flag + ".badge 缺失");
      if (!isNonEmptyString(entry.lead)) fail("statusText.aiFlag." + flag + ".lead 缺失");
    });
  }

  // ---------- kb-dataset.js ----------

  function assertKbDataset(kbDataset) {
    if (!kbDataset || typeof kbDataset !== "object") fail("DemoKbDataset 未加载或不是对象");
    if (kbDataset.schemaVersion !== SCHEMA_VERSION) {
      fail("DemoKbDataset.schemaVersion 应为 " + SCHEMA_VERSION + "，实际为 " + kbDataset.schemaVersion);
    }

    if (!Array.isArray(kbDataset.categories) || !kbDataset.categories.length) {
      fail("DemoKbDataset.categories 必须是非空数组");
    }
    var categoryIds = assertUniqueIds("DemoKbDataset.categories", kbDataset.categories, "id");
    kbDataset.categories.forEach(function (category, i) {
      if (!isNonEmptyString(category.title)) fail("categories[" + i + "].title 缺失");
      if (!isNonEmptyString(category.desc)) fail("categories[" + i + "].desc 缺失");
    });

    if (!Array.isArray(kbDataset.documents) || !kbDataset.documents.length) {
      fail("DemoKbDataset.documents 必须是非空数组");
    }
    assertUniqueIds("DemoKbDataset.documents", kbDataset.documents, "id");
    var documentById = {};
    kbDataset.documents.forEach(function (doc, i) {
      documentById[doc.id] = doc;
      if (!categoryIds[doc.categoryId]) fail("documents[" + i + "]（" + doc.id + "）的 categoryId 悬空：" + doc.categoryId);
      if (!isNonEmptyString(doc.title)) fail("documents[" + i + "]（" + doc.id + "）.title 缺失");
      if (!isNonEmptyString(doc.type)) fail("documents[" + i + "]（" + doc.id + "）.type 缺失");
      if (!isNonEmptyString(doc.summary)) fail("documents[" + i + "]（" + doc.id + "）.summary 缺失");
      if (!isNonEmptyString(doc.source)) fail("documents[" + i + "]（" + doc.id + "）.source 缺失");
      if (!isNonEmptyString(doc.updatedAt)) fail("documents[" + i + "]（" + doc.id + "）.updatedAt 缺失");
      if (doc.body !== null && !Array.isArray(doc.body)) {
        fail("documents[" + i + "]（" + doc.id + "）.body 必须是 null 或字符串数组");
      }
      if (Array.isArray(doc.body) && !doc.body.length) {
        fail("documents[" + i + "]（" + doc.id + "）.body 不能是空数组，没有正文请显式写 null");
      }
    });

    if (!Array.isArray(kbDataset.qaPresets) || !kbDataset.qaPresets.length) {
      fail("DemoKbDataset.qaPresets 必须是非空数组");
    }
    assertUniqueIds("DemoKbDataset.qaPresets", kbDataset.qaPresets, "id");
    kbDataset.qaPresets.forEach(function (preset, i) {
      if (!isNonEmptyString(preset.question)) fail("qaPresets[" + i + "]（" + preset.id + "）.question 缺失");
      if (!isNonEmptyString(preset.answer)) fail("qaPresets[" + i + "]（" + preset.id + "）.answer 缺失");
      if (!Array.isArray(preset.citations) || !preset.citations.length) {
        fail("qaPresets[" + i + "]（" + preset.id + "）.citations 必须是非空数组");
      }
      preset.citations.forEach(function (citation, j) {
        var doc = documentById[citation.docId];
        if (!doc) fail("qaPresets[" + i + "].citations[" + j + "].docId 悬空：" + citation.docId);
        if (!doc.body) fail("qaPresets[" + i + "].citations[" + j + "] 引用了没有正文的文档：" + citation.docId);
        if (!Array.isArray(citation.hintChunks) || !citation.hintChunks.length) {
          fail("qaPresets[" + i + "].citations[" + j + "].hintChunks 必须是非空数组：" + citation.docId);
        }
        var chunkCount = window.DemoKb.chunksOf(citation.docId).length;
        citation.hintChunks.forEach(function (chunkIndex) {
          if (typeof chunkIndex !== "number" || chunkIndex < 0 || chunkIndex >= chunkCount) {
            fail(
              "qaPresets[" + i + "].citations[" + j + "].hintChunks 越界：docId=" + citation.docId +
              " index=" + chunkIndex + "（该文档共 " + chunkCount + " 个 chunk）"
            );
          }
        });
      });
    });

    if (!Array.isArray(kbDataset.ingestion) || kbDataset.ingestion.length !== 5) {
      fail("DemoKbDataset.ingestion 必须是长度为 5 的数组");
    }
  }

  // ---------- graph-spec.js ----------

  function assertGraphSpec(spec) {
    if (!spec || typeof spec !== "object") fail("DemoGraphSpec 未加载或不是对象");
    if (spec.schemaVersion !== SCHEMA_VERSION) {
      fail("DemoGraphSpec.schemaVersion 应为 " + SCHEMA_VERSION + "，实际为 " + spec.schemaVersion);
    }
    if (!spec.bands || typeof spec.bands !== "object") fail("DemoGraphSpec.bands 缺失");

    var entityTypes = Object.keys(spec.bands);
    if (!entityTypes.length) fail("DemoGraphSpec.bands 不能为空");

    var ranges = entityTypes.map(function (type) {
      var band = spec.bands[type];
      if (!Array.isArray(band) || band.length !== 2 || typeof band[0] !== "number" || typeof band[1] !== "number" || band[0] >= band[1]) {
        fail("DemoGraphSpec.bands." + type + " 必须是 [start, end] 且 start < end");
      }
      return { type: type, start: band[0], end: band[1] };
    });
    ranges.sort(function (a, b) { return a.start - b.start; });
    var k;
    for (k = 1; k < ranges.length; k += 1) {
      if (ranges[k].start < ranges[k - 1].end) {
        fail(
          "DemoGraphSpec.bands 列带重叠：" + ranges[k - 1].type + "[" + ranges[k - 1].start + "," + ranges[k - 1].end +
          "] 与 " + ranges[k].type + "[" + ranges[k].start + "," + ranges[k].end + "]"
        );
      }
    }

    if (!Array.isArray(spec.edgeRules) || !spec.edgeRules.length) fail("DemoGraphSpec.edgeRules 必须是非空数组");
    spec.edgeRules.forEach(function (rule, i) {
      if (entityTypes.indexOf(rule.from) < 0) fail("edgeRules[" + i + "].from 不是已声明的实体类型：" + rule.from);
      if (entityTypes.indexOf(rule.to) < 0) fail("edgeRules[" + i + "].to 不是已声明的实体类型：" + rule.to);
      if (!isNonEmptyString(rule.label)) fail("edgeRules[" + i + "].label 缺失");
    });

    if (!Array.isArray(spec.spine) || spec.spine.length < 2) fail("DemoGraphSpec.spine 必须至少包含 2 个节点锚点");
    spec.spine.forEach(function (anchor, i) {
      if (!isNonEmptyString(anchor.id)) fail("spine[" + i + "].id 缺失");
      if (typeof anchor.x !== "number" || typeof anchor.y !== "number") fail("spine[" + i + "]（" + anchor.id + "）缺少数值型 x/y");
    });
  }

  // ---------- graph.js 投影结果 ----------

  function assertGraphData(graphData, spec) {
    if (!graphData || !Array.isArray(graphData.nodes) || !Array.isArray(graphData.edges) || !Array.isArray(graphData.spine)) {
      fail("DemoGraph.build() 必须返回 { nodes: [], edges: [], spine: [] }");
    }

    var idSet = {};
    graphData.nodes.forEach(function (node, i) {
      if (!isNonEmptyString(node.id)) fail("graph nodes[" + i + "].id 缺失");
      if (idSet[node.id]) fail("graph nodes 的 id 重复：" + node.id);
      idSet[node.id] = true;
      var band = spec.bands[node.group];
      if (!band) fail("graph node " + node.id + " 的 group 不在 DemoGraphSpec.bands 声明内：" + node.group);
      if (node.x < band[0] || node.x > band[1]) {
        fail("graph node " + node.id + "（group=" + node.group + "）的 x=" + node.x + " 落在列带 [" + band[0] + "," + band[1] + "] 之外");
      }
    });

    graphData.edges.forEach(function (edge, i) {
      if (!idSet[edge[0]]) fail("graph edges[" + i + "] 的起点不存在：" + edge[0]);
      if (!idSet[edge[1]]) fail("graph edges[" + i + "] 的终点不存在：" + edge[1]);
    });

    if (graphData.spine.length < 2) fail("graph.spine 必须至少包含 2 个节点 id");
    graphData.spine.forEach(function (nodeId, i) {
      if (!idSet[nodeId]) fail("graph.spine[" + i + "] 引用的节点不存在：" + nodeId);
    });
  }

  // ---------- 总入口 ----------

  function assertAll() {
    var kbDataset = window.DemoKbDataset;
    var graphSpec = window.DemoGraphSpec;
    if (!window.DemoDataCatalog) fail("DemoDataCatalog 未加载，请检查 scripts/data/catalog.js 是否已加载");
    if (!window.DemoDataRecords || typeof window.DemoDataRecords.recordColumns !== "function") {
      fail("DemoDataRecords 未加载或未实现 recordColumns，请检查 scripts/data/records.js");
    }
    if (!window.DemoKb || typeof window.DemoKb.chunksOf !== "function") fail("DemoKb 未加载或未实现，请检查 scripts/data/kb.js");
    if (!window.DemoGraph || typeof window.DemoGraph.build !== "function") fail("DemoGraph 未加载或未实现，请检查 scripts/data/graph.js");

    assertPartsVisionFrames(window.DemoDataCatalog);
    assertRecordColumns(window.DemoDataRecords.recordColumns());
    assertVerdicts(window.DemoDataCatalog);
    assertReportSections(window.DemoDataCatalog);
    assertEvidencePoints(window.DemoDataCatalog);
    assertStatusText(window.DemoDataCatalog);

    assertKbDataset(kbDataset);
    assertGraphSpec(graphSpec);

    var graphData = window.DemoGraph.build();
    assertGraphData(graphData, graphSpec);
  }

  return {
    SCHEMA_VERSION: SCHEMA_VERSION,
    assertKbDataset: assertKbDataset,
    assertGraphSpec: assertGraphSpec,
    assertGraphData: assertGraphData,
    assertPartsVisionFrames: assertPartsVisionFrames,
    assertRecordColumns: assertRecordColumns,
    assertVerdicts: assertVerdicts,
    assertReportSections: assertReportSections,
    assertEvidencePoints: assertEvidencePoints,
    assertStatusText: assertStatusText,
    assertAll: assertAll
  };
})();
