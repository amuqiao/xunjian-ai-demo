// 领域包启动校验器。对外只暴露 window.DomainSchema.assertAll()：无参数、无返回值，
// 发现任何不合规直接 throw，不做兜底、不吞错、不返回校验结果列表。
//
// 它存在的理由是让"换错了数据集"在启动那一刻就指名道姓地报错，而不是等到某个场景
// 静默渲染成空白。这个项目的前身已经因为这类静默失败折腾过两次（pick 存了一个合法
// 但不在该字段字典里的值 → 整页空白且刷新无效；报告段落 status 用按位置对齐的并行
// 数组 → 增删一段就整体错位）。两次都不抛异常。
//
// 本文件只定义函数，加载时不读取任何领域全局——所有跨文件读取都发生在 assertAll()
// 被调用的那一刻，因此它在 index.html 里排在领域包之前或之后都可以。
window.DomainSchema = (function () {
  "use strict";

  var CONTRACT_VERSION = 1;

  // 10 份契约，一个都不能少。数量写成常量并在末尾断言，是因为"手数出来的数量"
  // 是这个项目踩过的坑之一（"（6 步）"这类字面量改了数据就不符，且不会报错）。
  var CONTRACT_GLOBALS = [
    "DOMAIN_META", "DOMAIN_TAXONOMY", "DOMAIN_RECORDS", "DOMAIN_SERIES", "DOMAIN_VISION",
    "DOMAIN_DIAGNOSIS", "DOMAIN_REVIEW", "DOMAIN_REPORT", "DOMAIN_AGENTQA", "DOMAIN_KB"
  ];

  var SCENE_KEYS = ["workbench", "review", "knowledge"];
  var FLOW_KEYS = ["inspection", "trend", "vision", "agent", "review", "archive"];
  var VOTE_IDS = ["accept", "revise", "reject"];
  var TERM_KEYS = ["object", "part", "record", "inspector", "workOrder"];
  var STATUS_KEYS = { danger: true, warn: true, ok: true };
  var COLUMN_TYPES = { "status-dot": true, "text": true, "badge-icon": true };
  var SAFE_SIDES = { above: true, below: true };
  var FRAME_ROLES = { current: true, compare: true, link: true };
  var TRACKS = { treatment: true, closure: true };
  var FIELD_TYPES = { select: true, checkbox: true };
  var CONFIDENCE_BANDS = { high: true, "needs-review": true, insufficient: true };
  var EVIDENCE_KINDS = { series: true, vision: true, rule: true, "case": true };
  var HIT_KINDS = {
    current: true, standard: true, metric: true, workcard: true,
    rule: true, "case": true, report: true
  };
  var AGENT_CONTEXT_IDS = ["workbench", "review", "knowledge"];
  var UNLOCK_KEYS = { archived: true };
  var SHOW_IF_KEYS = { divergent: true, retestFailed: true, treatment: true, closure: true };
  var AI_FLAGS = ["conflict", "gap", "ok"];

  // 骨架运行时真正能提供的插槽。07-report.js 的 slots 必须是它的子集——声明一个
  // 骨架给不出的插槽，页面会静默把 {{xxx}} 原文印在报告里，不抛异常。
  var PROVIDED_SLOTS = {
    objectLabel: true, partLabel: true, date: true, inspector: true,
    aiConclusion: true, confidence: true,
    reviewerName: true, reviewerRole: true, outcomeLabel: true,
    reviewNote: true, divergenceReason: true,
    crew: true, window: true, riskLevel: true, retestResult: true,
    caseId: true
  };

  function fail(message) {
    throw new Error("[DomainSchema] " + message);
  }

  function isNonEmptyString(value) {
    return typeof value === "string" && value.length > 0;
  }

  function isFiniteNumber(value) {
    return typeof value === "number" && isFinite(value);
  }

  function assertNonEmptyArray(value, label) {
    if (!Array.isArray(value) || !value.length) fail(label + " 必须是非空数组");
  }

  function assertString(owner, field, label) {
    if (!isNonEmptyString(owner[field])) fail(label + "." + field + " 缺失或不是非空字符串");
  }

  function assertBool(owner, field, label) {
    if (owner[field] !== true && owner[field] !== false) {
      fail(label + "." + field + " 必须显式为 true/false");
    }
  }

  // 返回 { id: true } 供调用方做后续的悬空引用校验。
  function assertUniqueIds(list, idKey, label) {
    var seen = {};
    list.forEach(function (item, i) {
      var id = item[idKey];
      if (!isNonEmptyString(id)) fail(label + "[" + i + "]." + idKey + " 缺失或不是非空字符串");
      if (seen[id]) fail(label + " 的 " + idKey + " 重复：" + id);
      seen[id] = true;
    });
    return seen;
  }

  function assertKeyOrder(list, expected, idKey, label) {
    if (list.length !== expected.length) {
      fail(label + " 必须恰好有 " + expected.length + " 项，实际 " + list.length + " 项");
    }
    expected.forEach(function (key, i) {
      if (list[i][idKey] !== key) {
        fail(label + "[" + i + "]." + idKey + " 应为 " + key + "，实际为 " + list[i][idKey]);
      }
    });
  }

  // 提取模板里的 {{slot}} 名字。
  function slotsIn(text) {
    var found = [];
    var re = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;
    var m = re.exec(text);
    while (m) {
      found.push(m[1]);
      m = re.exec(text);
    }
    return found;
  }

  // ---------- 00-meta ----------

  function assertMeta(meta, ids) {
    if (meta.contractVersion !== CONTRACT_VERSION) {
      fail("DOMAIN_META.contractVersion 应为 " + CONTRACT_VERSION + "，实际为 " + meta.contractVersion);
    }
    ["domainId", "title", "subtitle", "batchId", "clockText", "statusLine"].forEach(function (field) {
      assertString(meta, field, "DOMAIN_META");
    });

    if (!meta.terms || typeof meta.terms !== "object") fail("DOMAIN_META.terms 缺失");
    TERM_KEYS.forEach(function (key) {
      assertString(meta.terms, key, "DOMAIN_META.terms");
    });

    assertNonEmptyArray(meta.scenes, "DOMAIN_META.scenes");
    assertKeyOrder(meta.scenes, SCENE_KEYS, "key", "DOMAIN_META.scenes");
    meta.scenes.forEach(function (scene, i) {
      assertString(scene, "label", "DOMAIN_META.scenes[" + i + "]");
      assertString(scene, "node", "DOMAIN_META.scenes[" + i + "]");
    });

    assertNonEmptyArray(meta.flowSteps, "DOMAIN_META.flowSteps");
    assertKeyOrder(meta.flowSteps, FLOW_KEYS, "key", "DOMAIN_META.flowSteps");
    meta.flowSteps.forEach(function (step, i) {
      assertString(step, "label", "DOMAIN_META.flowSteps[" + i + "]");
      assertString(step, "desc", "DOMAIN_META.flowSteps[" + i + "]");
    });

    assertNonEmptyArray(meta.reviewers, "DOMAIN_META.reviewers");
    var reviewerIds = assertUniqueIds(meta.reviewers, "id", "DOMAIN_META.reviewers");
    meta.reviewers.forEach(function (reviewer, i) {
      assertString(reviewer, "name", "DOMAIN_META.reviewers[" + i + "]");
      assertString(reviewer, "role", "DOMAIN_META.reviewers[" + i + "]");
    });
    if (!reviewerIds[meta.defaultReviewerId]) {
      fail("DOMAIN_META.defaultReviewerId 在 reviewers 里查不到：" + meta.defaultReviewerId);
    }

    if (!meta.entry || typeof meta.entry !== "object") fail("DOMAIN_META.entry 缺失");
    if (!ids.objects[meta.entry.objectId]) fail("DOMAIN_META.entry.objectId 悬空：" + meta.entry.objectId);
    if (!ids.parts[meta.entry.partId]) fail("DOMAIN_META.entry.partId 悬空：" + meta.entry.partId);
    if (!ids.records[meta.entry.recordId]) fail("DOMAIN_META.entry.recordId 悬空：" + meta.entry.recordId);
  }

  // ---------- 01-taxonomy ----------

  function assertTaxonomy(taxonomy) {
    assertNonEmptyArray(taxonomy.objects, "DOMAIN_TAXONOMY.objects");
    var objectIds = assertUniqueIds(taxonomy.objects, "id", "DOMAIN_TAXONOMY.objects");
    taxonomy.objects.forEach(function (obj, i) {
      assertString(obj, "label", "DOMAIN_TAXONOMY.objects[" + i + "]");
      assertString(obj, "short", "DOMAIN_TAXONOMY.objects[" + i + "]");
    });

    assertNonEmptyArray(taxonomy.parts, "DOMAIN_TAXONOMY.parts");
    var partIds = assertUniqueIds(taxonomy.parts, "id", "DOMAIN_TAXONOMY.parts");
    taxonomy.parts.forEach(function (part, i) {
      var label = "DOMAIN_TAXONOMY.parts[" + i + "]（" + part.id + "）";
      // objectId 必须显式存在：null 表示"所有对象共用"，是一个声明；漏写字段则报错。
      if (!Object.prototype.hasOwnProperty.call(part, "objectId")) {
        fail(label + ".objectId 缺失（所有对象共用请显式写 null）");
      }
      if (part.objectId !== null && !objectIds[part.objectId]) {
        fail(label + ".objectId 悬空：" + part.objectId);
      }
      ["label", "short", "badge", "component", "summary", "checkItem"].forEach(function (field) {
        assertString(part, field, label);
      });
    });

    assertNonEmptyArray(taxonomy.points, "DOMAIN_TAXONOMY.points");
    var pointIds = assertUniqueIds(taxonomy.points, "id", "DOMAIN_TAXONOMY.points");
    var primaryCount = {};
    taxonomy.points.forEach(function (point, i) {
      var label = "DOMAIN_TAXONOMY.points[" + i + "]（" + point.id + "）";
      if (!partIds[point.partId]) fail(label + ".partId 悬空：" + point.partId);
      assertString(point, "label", label);
      assertString(point, "unit", label);
      assertBool(point, "primary", label);
      if (!isFiniteNumber(point.threshold)) fail(label + ".threshold 必须是数字");
      if (!SAFE_SIDES[point.safeSide]) fail(label + ".safeSide 只能是 above/below，实际为 " + point.safeSide);
      if (point.primary) primaryCount[point.partId] = (primaryCount[point.partId] || 0) + 1;
    });
    Object.keys(partIds).forEach(function (partId) {
      var count = primaryCount[partId] || 0;
      if (count !== 1) {
        fail("部位 " + partId + " 必须恰好有 1 个 primary:true 的测点（实际 " + count
          + " 个）：它是该部位状态色的唯一派生依据，0 个算不出、2 个有歧义，两者运行期都不报错");
      }
    });

    return { objects: objectIds, parts: partIds, points: pointIds };
  }

  // ---------- 02-records ----------

  function assertRecords(records, ids) {
    assertNonEmptyArray(records.columns, "DOMAIN_RECORDS.columns");
    var seenKeys = {};
    var statusDotCount = 0;
    records.columns.forEach(function (column, i) {
      var label = "DOMAIN_RECORDS.columns[" + i + "]";
      if (!isNonEmptyString(column.key)) fail(label + ".key 缺失或不是非空字符串");
      if (seenKeys[column.key]) fail("DOMAIN_RECORDS.columns 的 key 重复：" + column.key);
      seenKeys[column.key] = true;
      if (typeof column.label !== "string") fail(label + "（" + column.key + "）.label 必须是字符串");
      if (!COLUMN_TYPES[column.type]) {
        fail(label + "（" + column.key + "）.type 不是合法取值（status-dot/text/badge-icon）：" + column.type);
      }
      if (!isFiniteNumber(column.width) || column.width <= 0) {
        fail(label + "（" + column.key + "）.width 必须是正数：" + column.width);
      }
      if (column.type === "status-dot") {
        statusDotCount += 1;
        if (column.key !== "aiFlag") {
          fail(label + " 是 status-dot 列，key 必须是 aiFlag（行状态由 aiFlag 派生）：" + column.key);
        }
      }
    });
    if (statusDotCount !== 1) {
      fail("DOMAIN_RECORDS.columns 必须恰好有 1 列 status-dot（实际 " + statusDotCount + " 列）");
    }

    if (!records.aiFlagText || typeof records.aiFlagText !== "object") fail("DOMAIN_RECORDS.aiFlagText 缺失");
    AI_FLAGS.forEach(function (flag) {
      var entry = records.aiFlagText[flag];
      if (!entry || typeof entry !== "object") fail("DOMAIN_RECORDS.aiFlagText." + flag + " 缺失（三态必须全覆盖）");
      if (!STATUS_KEYS[entry.status]) {
        fail("DOMAIN_RECORDS.aiFlagText." + flag + ".status 不是合法三色取值：" + entry.status);
      }
      assertString(entry, "badge", "DOMAIN_RECORDS.aiFlagText." + flag);
      assertString(entry, "lead", "DOMAIN_RECORDS.aiFlagText." + flag);
    });

    assertNonEmptyArray(records.records, "DOMAIN_RECORDS.records");
    var recordIds = assertUniqueIds(records.records, "id", "DOMAIN_RECORDS.records");
    records.records.forEach(function (record, i) {
      var label = "DOMAIN_RECORDS.records[" + i + "]（" + record.id + "）";
      if (!ids.objects[record.objectId]) fail(label + ".objectId 悬空：" + record.objectId);
      if (!ids.parts[record.partId]) fail(label + ".partId 悬空：" + record.partId);
      ["date", "shift", "inspector", "item"].forEach(function (field) {
        assertString(record, field, label);
      });
      // result 允许空串：那正是 aiFlag === "gap"（记录缺项）要表达的东西。
      if (typeof record.result !== "string") fail(label + ".result 必须是字符串（缺项请写空串）");
      if (typeof record.note !== "string") fail(label + ".note 必须是字符串");
      if (!records.aiFlagText[record.aiFlag]) {
        fail(label + ".aiFlag 在 aiFlagText 里查不到：" + record.aiFlag);
      }
    });

    return recordIds;
  }

  // ---------- 03-series ----------

  function assertSeries(series, meta, ids) {
    if (typeof series.series !== "function") fail("DOMAIN_SERIES.series 必须是函数");
    if (typeof series.ranges !== "function") fail("DOMAIN_SERIES.ranges 必须是函数");
    if (typeof series.samplingCaliber !== "function") fail("DOMAIN_SERIES.samplingCaliber 必须是函数");

    var ranges = series.ranges();
    assertNonEmptyArray(ranges, "DOMAIN_SERIES.ranges()");
    assertUniqueIds(ranges, "key", "DOMAIN_SERIES.ranges()");
    ranges.forEach(function (range, i) {
      var label = "DOMAIN_SERIES.ranges()[" + i + "]（" + range.key + "）";
      assertString(range, "label", label);
      if (!isFiniteNumber(range.points) || range.points < 2) fail(label + ".points 必须是 >= 2 的数字");
      if (!isFiniteNumber(range.hoursPerPoint) || range.hoursPerPoint <= 0) {
        fail(label + ".hoursPerPoint 必须是正数");
      }
    });

    // 每个测点 × 每个区间都要能算出来，且形状完整。只抽查主线对象不够——换课题时
    // 漏配某个测点的剧本，只有在演示点到那个部位时才炸。
    var objectIds = Object.keys(ids.objects);
    var pointIds = Object.keys(ids.points);
    objectIds.forEach(function (objectId) {
      pointIds.forEach(function (pointId) {
        ranges.forEach(function (range) {
          var s = series.series(objectId, pointId, range.key);
          var label = "DOMAIN_SERIES.series(" + objectId + "," + pointId + "," + range.key + ")";
          assertString(s, "label", label);
          assertString(s, "unit", label);
          assertString(s, "alert", label);
          if (!STATUS_KEYS[s.status]) fail(label + ".status 不是合法三色取值：" + s.status);
          if (!Array.isArray(s.dates) || s.dates.length !== range.points) {
            fail(label + ".dates 长度应为 " + range.points + "，实际 " + (s.dates && s.dates.length));
          }
          if (!Array.isArray(s.values) || s.values.length !== range.points) {
            fail(label + ".values 长度应为 " + range.points + "，实际 " + (s.values && s.values.length));
          }
          s.values.forEach(function (value, k) {
            if (!isFiniteNumber(value)) fail(label + ".values[" + k + "] 不是有限数字：" + value);
          });
          if (s.latest !== s.values[s.values.length - 1]) {
            fail(label + ".latest 必须等于 values 的末位（大屏卡片与详情屏读的是同一个数，"
              + "两者不一致时演示中必然被问住）");
          }
          if (!isFiniteNumber(s.threshold)) fail(label + ".threshold 必须是数字");
          if (!SAFE_SIDES[s.safeSide]) fail(label + ".safeSide 只能是 above/below");
        });
      });
    });

    // 确定性：同一组入参两次调用必须完全相同。用了 Math.random() 或 Date.now() 的
    // 生成器会在这里挂——那种曲线每次刷新都变，演示时"上一屏说的数"就对不上了。
    var probeObject = meta.entry.objectId;
    var probePoint = pointIds[0];
    var a = series.series(probeObject, probePoint, ranges[0].key);
    var b = series.series(probeObject, probePoint, ranges[0].key);
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      fail("DOMAIN_SERIES.series() 不确定：同一组入参两次调用结果不同（禁止使用 Math.random()/Date.now()）");
    }

    ranges.forEach(function (range) {
      if (!isNonEmptyString(series.samplingCaliber(range.key))) {
        fail("DOMAIN_SERIES.samplingCaliber(" + range.key + ") 必须返回非空字符串");
      }
    });
  }

  // ---------- 04-vision ----------

  function assertBbox(bbox, label) {
    if (!bbox || typeof bbox !== "object") fail(label + " 缺失或不是对象");
    ["x", "y", "w", "h"].forEach(function (key) {
      if (!isFiniteNumber(bbox[key])) fail(label + "." + key + " 必须是数字：" + bbox[key]);
      if (bbox[key] < 0 || bbox[key] > 1) {
        fail(label + "." + key + " 必须落在 [0,1] 区间内（bbox 是相对图片的归一化比例，不是像素），实际 " + bbox[key]);
      }
    });
    if (bbox.x + bbox.w > 1) fail(label + " 越界：x(" + bbox.x + ") + w(" + bbox.w + ") > 1");
    if (bbox.y + bbox.h > 1) fail(label + " 越界：y(" + bbox.y + ") + h(" + bbox.h + ") > 1");
  }

  function assertVision(vision, ids) {
    if (!vision.media || typeof vision.media !== "object") fail("DOMAIN_VISION.media 缺失");
    Object.keys(vision.media).forEach(function (key) {
      if (!isNonEmptyString(vision.media[key])) fail("DOMAIN_VISION.media." + key + " 必须是非空字符串");
    });

    assertNonEmptyArray(vision.frames, "DOMAIN_VISION.frames");
    var frameIds = assertUniqueIds(vision.frames, "id", "DOMAIN_VISION.frames");
    var currentCount = {};
    vision.frames.forEach(function (frame, i) {
      var label = "DOMAIN_VISION.frames[" + i + "]（" + frame.id + "）";
      if (!ids.parts[frame.partId]) fail(label + ".partId 悬空：" + frame.partId);
      assertString(frame, "label", label);
      assertString(frame, "boxLabel", label);
      if (!vision.media[frame.src]) fail(label + ".src 在 media 映射表里查不到：" + frame.src);
      assertBbox(frame.bbox, label + ".bbox");
      if (!Array.isArray(frame.findings) || frame.findings.length < 1 || frame.findings.length > 4) {
        fail(label + ".findings 长度必须在 [1,4] 之间，实际 " + (frame.findings && frame.findings.length));
      }
      frame.findings.forEach(function (finding, k) {
        if (!isNonEmptyString(finding)) fail(label + ".findings[" + k + "] 必须是非空字符串");
      });
      if (!isFiniteNumber(frame.confidence) || frame.confidence < 0 || frame.confidence > 1) {
        fail(label + ".confidence 必须落在 [0,1] 区间内：" + frame.confidence);
      }
      if (!FRAME_ROLES[frame.role]) fail(label + ".role 只能是 current/compare/link，实际为 " + frame.role);
      if (frame.role === "current") currentCount[frame.partId] = (currentCount[frame.partId] || 0) + 1;
    });
    Object.keys(ids.parts).forEach(function (partId) {
      var count = currentCount[partId] || 0;
      if (count !== 1) {
        fail("部位 " + partId + " 必须恰好有 1 帧 role:\"current\"（实际 " + count
          + " 帧）：它是工作台视觉卡和详情屏默认展示的那一帧");
      }
    });

    return frameIds;
  }

  // ---------- 05-diagnosis ----------

  function assertDiagnosis(diagnosis, ids) {
    assertNonEmptyArray(diagnosis.rules, "DOMAIN_DIAGNOSIS.rules");
    var ruleIds = assertUniqueIds(diagnosis.rules, "id", "DOMAIN_DIAGNOSIS.rules");
    diagnosis.rules.forEach(function (rule, i) {
      var label = "DOMAIN_DIAGNOSIS.rules[" + i + "]（" + rule.id + "）";
      ["title", "text", "source"].forEach(function (field) {
        assertString(rule, field, label);
      });
    });

    assertNonEmptyArray(diagnosis.cases, "DOMAIN_DIAGNOSIS.cases");
    assertUniqueIds(diagnosis.cases, "id", "DOMAIN_DIAGNOSIS.cases");
    var seenRecord = {};
    diagnosis.cases.forEach(function (item, i) {
      var label = "DOMAIN_DIAGNOSIS.cases[" + i + "]（" + item.id + "）";
      if (!ids.objects[item.objectId]) fail(label + ".objectId 悬空：" + item.objectId);
      if (!ids.parts[item.partId]) fail(label + ".partId 悬空：" + item.partId);
      if (!ids.records[item.recordId]) fail(label + ".recordId 悬空：" + item.recordId);
      // 一条记录只能有一份 AI 判断，否则工作台点中该记录时不知道该显示哪一份。
      if (seenRecord[item.recordId]) fail(label + ".recordId 与另一条判断重复：" + item.recordId);
      seenRecord[item.recordId] = true;

      assertString(item, "summary", label);
      if (!item.suggestion || typeof item.suggestion !== "object") fail(label + ".suggestion 缺失");
      assertString(item.suggestion, "label", label + ".suggestion");
      assertString(item.suggestion, "text", label + ".suggestion");
      if (!ids.outcomes[item.suggestion.outcomeId]) {
        fail(label + ".suggestion.outcomeId 在 DOMAIN_REVIEW.outcomes 里查不到："
          + item.suggestion.outcomeId + "（分歧态的判断建立在这条引用上）");
      }

      if (!isFiniteNumber(item.confidence) || item.confidence < 0 || item.confidence > 100) {
        fail(label + ".confidence 必须落在 [0,100] 区间内：" + item.confidence);
      }
      if (!CONFIDENCE_BANDS[item.confidenceBand]) {
        fail(label + ".confidenceBand 不是合法取值（high/needs-review/insufficient）：" + item.confidenceBand);
      }

      assertNonEmptyArray(item.evidenceChain, label + ".evidenceChain");
      item.evidenceChain.forEach(function (evidence, j) {
        var elabel = label + ".evidenceChain[" + j + "]";
        if (!EVIDENCE_KINDS[evidence.kind]) {
          fail(elabel + ".kind 不是合法取值（series/vision/rule/case）：" + evidence.kind);
        }
        assertString(evidence, "label", elabel);
        assertString(evidence, "detail", elabel);
        if (evidence.kind !== "case") {
          if (!isFiniteNumber(evidence.confidence) || evidence.confidence < 0 || evidence.confidence > 100) {
            fail(elabel + ".confidence 必须落在 [0,100] 区间内：" + evidence.confidence);
          }
        }
        if (evidence.kind === "series" && !ids.points[evidence.pointId]) {
          fail(elabel + ".pointId 悬空：" + evidence.pointId);
        }
        if (evidence.kind === "vision" && !ids.frames[evidence.frameId]) {
          fail(elabel + ".frameId 悬空：" + evidence.frameId);
        }
        if (evidence.kind === "rule" && !ruleIds[evidence.ruleId]) {
          fail(elabel + ".ruleId 悬空：" + evidence.ruleId);
        }
        if (evidence.kind === "case") {
          if (!ids.documents[evidence.docId]) fail(elabel + ".docId 悬空：" + evidence.docId);
          assertBool(evidence, "locked", elabel);
        }
      });
    });

    // 入口那条记录必须有 AI 判断，否则首屏的 AI 卡是空的。
    if (!seenRecord[window.DOMAIN_META.entry.recordId]) {
      fail("DOMAIN_META.entry.recordId（" + window.DOMAIN_META.entry.recordId
        + "）没有对应的 AI 判断，首屏 AI 卡会是空的");
    }
  }

  // ---------- 06-review ----------

  function assertReview(review, kbCategoryIds) {
    assertNonEmptyArray(review.votes, "DOMAIN_REVIEW.votes");
    assertKeyOrder(review.votes, VOTE_IDS, "id", "DOMAIN_REVIEW.votes");
    review.votes.forEach(function (vote, i) {
      assertString(vote, "label", "DOMAIN_REVIEW.votes[" + i + "]");
      assertString(vote, "hint", "DOMAIN_REVIEW.votes[" + i + "]");
    });

    if (!review.fields || typeof review.fields !== "object") fail("DOMAIN_REVIEW.fields 缺失");
    var fieldIds = {};
    Object.keys(review.fields).forEach(function (fieldId) {
      var field = review.fields[fieldId];
      var label = "DOMAIN_REVIEW.fields." + fieldId;
      if (typeof field.label !== "string") fail(label + ".label 必须是字符串");
      if (!FIELD_TYPES[field.type]) fail(label + ".type 只能是 select/checkbox，实际为 " + field.type);
      assertBool(field, "required", label);
      assertNonEmptyArray(field.options, label + ".options");
      assertUniqueIds(field.options, "id", label + ".options");
      field.options.forEach(function (option, i) {
        assertString(option, "label", label + ".options[" + i + "]");
        if (field.type === "checkbox") assertBool(option, "default", label + ".options[" + i + "]");
      });
      fieldIds[fieldId] = true;
    });

    assertNonEmptyArray(review.outcomes, "DOMAIN_REVIEW.outcomes");
    var outcomeIds = assertUniqueIds(review.outcomes, "id", "DOMAIN_REVIEW.outcomes");
    var seenLabels = {};
    review.outcomes.forEach(function (outcome, i) {
      var label = "DOMAIN_REVIEW.outcomes[" + i + "]（" + outcome.id + "）";
      ["label", "hint", "impact", "executeText", "executedText"].forEach(function (field) {
        assertString(outcome, field, label);
      });
      if (seenLabels[outcome.label]) fail("DOMAIN_REVIEW.outcomes 的 label 重复：" + outcome.label);
      seenLabels[outcome.label] = true;

      if (!TRACKS[outcome.track]) fail(label + ".track 只能是 treatment/closure，实际为 " + outcome.track);

      assertNonEmptyArray(outcome.fields, label + ".fields");
      outcome.fields.forEach(function (fieldId) {
        if (!fieldIds[fieldId]) fail(label + ".fields 引用了未声明的字段：" + fieldId);
      });

      assertNonEmptyArray(outcome.steps, label + ".steps");
      outcome.steps.forEach(function (step, j) {
        if (!isNonEmptyString(step)) fail(label + ".steps[" + j + "] 必须是非空字符串");
      });

      if (!outcome.retest || typeof outcome.retest !== "object") fail(label + ".retest 缺失");
      assertBool(outcome.retest, "enable", label + ".retest");
      if (outcome.retest.enable) {
        assertString(outcome.retest, "passLabel", label + ".retest");
        assertString(outcome.retest, "failLabel", label + ".retest");
      }

      assertBool(outcome, "unlocksReuse", label);

      if (!outcome.archive || typeof outcome.archive !== "object") fail(label + ".archive 缺失");
      if (!kbCategoryIds[outcome.archive.categoryId]) {
        fail(label + ".archive.categoryId 在 DOMAIN_KB.categories 里查不到：" + outcome.archive.categoryId);
      }
      ["titleTpl", "caseIdTpl", "statusText"].forEach(function (field) {
        assertString(outcome.archive, field, label + ".archive");
      });
    });

    // 至少一条结论要解锁复用，否则二次命中这个收尾包袱永远演示不出来。
    var unlockCount = review.outcomes.filter(function (o) { return o.unlocksReuse; }).length;
    if (unlockCount < 1) {
      fail("DOMAIN_REVIEW.outcomes 至少要有 1 条 unlocksReuse:true，否则二次命中演示不出来");
    }

    assertNonEmptyArray(review.phrases, "DOMAIN_REVIEW.phrases");
    review.phrases.forEach(function (phrase, i) {
      if (!isNonEmptyString(phrase)) fail("DOMAIN_REVIEW.phrases[" + i + "] 必须是非空字符串");
    });

    if (!review.divergence || typeof review.divergence !== "object") fail("DOMAIN_REVIEW.divergence 缺失");
    assertBool(review.divergence, "requireNote", "DOMAIN_REVIEW.divergence");
    ["badgeText", "noteHint", "reportSectionId"].forEach(function (field) {
      assertString(review.divergence, field, "DOMAIN_REVIEW.divergence");
    });
    assertString(review, "notePlaceholder", "DOMAIN_REVIEW");

    return outcomeIds;
  }

  // ---------- 07-report ----------

  function assertReport(report, review) {
    assertString(report, "titleTpl", "DOMAIN_REPORT");
    assertNonEmptyArray(report.sections, "DOMAIN_REPORT.sections");
    assertUniqueIds(report.sections, "id", "DOMAIN_REPORT.sections");
    assertNonEmptyArray(report.slots, "DOMAIN_REPORT.slots");

    var declared = {};
    report.slots.forEach(function (slot, i) {
      if (!isNonEmptyString(slot)) fail("DOMAIN_REPORT.slots[" + i + "] 必须是非空字符串");
      if (declared[slot]) fail("DOMAIN_REPORT.slots 重复：" + slot);
      if (!PROVIDED_SLOTS[slot]) {
        fail("DOMAIN_REPORT.slots 声明了骨架提供不了的插槽：" + slot
          + "（骨架能提供的清单见 scripts/schema.js 的 PROVIDED_SLOTS）");
      }
      declared[slot] = true;
    });

    var used = {};
    function collect(text, where) {
      slotsIn(text).forEach(function (slot) {
        if (!declared[slot]) {
          fail(where + " 用到了未在 slots 里声明的插槽 {{" + slot + "}}"
            + "（拼错的插槽不会抛异常，会把 {{" + slot + "}} 原文印在报告里）");
        }
        used[slot] = true;
      });
    }

    collect(report.titleTpl, "DOMAIN_REPORT.titleTpl");
    report.sections.forEach(function (section, i) {
      var label = "DOMAIN_REPORT.sections[" + i + "]（" + section.id + "）";
      assertString(section, "title", label);
      assertString(section, "text", label);
      if (!STATUS_KEYS[section.status]) fail(label + ".status 不是合法三色取值：" + section.status);
      if (Object.prototype.hasOwnProperty.call(section, "showIf") && !SHOW_IF_KEYS[section.showIf]) {
        fail(label + ".showIf 不是合法取值（divergent/retestFailed/treatment/closure）：" + section.showIf);
      }
      collect(section.text, label);
    });

    // 声明了却没人用的插槽是数据腐坏的前兆：它会让下一个人以为骨架提供了这个值。
    Object.keys(declared).forEach(function (slot) {
      if (!used[slot]) fail("DOMAIN_REPORT.slots 声明了但模板里从未使用的插槽：" + slot);
    });

    // 分歧段必须存在，且必须是 showIf:"divergent"——它是"两条支线产出不同报告"的
    // 唯一体现，缺了这一段，人工介入就退化成装饰。
    var divergenceId = review.divergence.reportSectionId;
    var divergenceSection = report.sections.filter(function (s) { return s.id === divergenceId; })[0];
    if (!divergenceSection) {
      fail("DOMAIN_REPORT.sections 缺少分歧段（DOMAIN_REVIEW.divergence.reportSectionId = " + divergenceId + "）");
    }
    if (divergenceSection.showIf !== "divergent") {
      fail("分歧段（" + divergenceId + "）的 showIf 必须是 divergent，实际为 " + divergenceSection.showIf);
    }

    // treatment / closure 两条 track 各自至少要有一段专属正文，否则两条路径的报告
    // 只有标题不同。
    ["treatment", "closure"].forEach(function (track) {
      var has = report.sections.some(function (s) { return s.showIf === track; });
      if (!has) fail("DOMAIN_REPORT.sections 缺少 showIf:\"" + track + "\" 的段落：该 track 的报告会与另一条完全相同");
    });
  }

  // ---------- 08-agentqa ----------

  function assertAgentQa(agentqa, kb) {
    assertNonEmptyArray(agentqa.contexts, "DOMAIN_AGENTQA.contexts");
    assertKeyOrder(agentqa.contexts, AGENT_CONTEXT_IDS, "id", "DOMAIN_AGENTQA.contexts");

    agentqa.contexts.forEach(function (context, i) {
      var label = "DOMAIN_AGENTQA.contexts[" + i + "]（" + context.id + "）";
      ["entryTitle", "entryText", "kicker", "summary", "emptyText", "fallbackAnswer"].forEach(function (field) {
        assertString(context, field, label);
      });

      assertNonEmptyArray(context.questions, label + ".questions");
      assertUniqueIds(context.questions, "id", label + ".questions");
      var missCount = 0;
      context.questions.forEach(function (question, j) {
        var qlabel = label + ".questions[" + j + "]（" + question.id + "）";
        ["label", "question", "thinkingText", "answer"].forEach(function (field) {
          assertString(question, field, qlabel);
        });
        assertBool(question, "hit", qlabel);
        if (!Array.isArray(question.hits)) fail(qlabel + ".hits 必须是数组");
        if (question.hit && !question.hits.length) fail(qlabel + " 声明 hit:true 但 hits 为空");
        if (!question.hit && question.hits.length) fail(qlabel + " 声明 hit:false 但 hits 非空");
        if (!question.hit) missCount += 1;

        question.hits.forEach(function (hit, k) {
          var hlabel = qlabel + ".hits[" + k + "]";
          assertString(hit, "text", hlabel);
          if (!HIT_KINDS[hit.kind]) fail(hlabel + ".kind 非法：" + hit.kind);
          var doc = kb.documents().filter(function (d) { return d.id === hit.docId; })[0];
          if (!doc) fail(hlabel + ".docId 悬空：" + hit.docId);
          if (!doc.body) fail(hlabel + " 引用了没有正文的文档，无法定位到具体段落：" + hit.docId);
          var chunkCount = kb.chunksOf(hit.docId).length;
          if (!isFiniteNumber(hit.chunkIndex) || hit.chunkIndex < 0 || hit.chunkIndex >= chunkCount
              || Math.floor(hit.chunkIndex) !== hit.chunkIndex) {
            fail(hlabel + ".chunkIndex 越界：" + hit.chunkIndex + "（" + hit.docId + " 共 " + chunkCount + " 段）");
          }
        });

        if (Object.prototype.hasOwnProperty.call(question, "unlockedBy") && !UNLOCK_KEYS[question.unlockedBy]) {
          fail(qlabel + ".unlockedBy 不是合法取值（archived）：" + question.unlockedBy);
        }
      });

      // 每个上下文至少一条未命中：全命中的 Agent 一眼就是假的，而且失去了"所以需要
      // 人工确认"这句话的落点。
      if (missCount < 1) {
        fail(label + " 至少要有 1 条 hit:false 的问题（全命中反而假，且失去了「知识库没有依据」这一态的落点）");
      }
    });
  }

  // ---------- 09-kb ----------

  function assertKb(kb) {
    // 全部出口都必须是函数。混用"函数 + 直接导出的值"会让一半出口是活的、一半是
    // 加载时的快照，改数据时只有一半生效，而且不会报错。
    ["categories", "documents", "document", "chunksOf", "qaPresets", "qaPreset", "retrieve",
      "ingestion", "ingestDemoDocId", "archiveTarget"]
      .forEach(function (name) {
        if (typeof kb[name] !== "function") fail("DOMAIN_KB." + name + " 必须是函数");
      });

    var categories = kb.categories();
    assertNonEmptyArray(categories, "DOMAIN_KB.categories()");
    var categoryIds = assertUniqueIds(categories, "id", "DOMAIN_KB.categories()");
    categories.forEach(function (category, i) {
      assertString(category, "title", "DOMAIN_KB.categories()[" + i + "]");
      assertString(category, "desc", "DOMAIN_KB.categories()[" + i + "]");
    });

    var documents = kb.documents();
    assertNonEmptyArray(documents, "DOMAIN_KB.documents()");
    var documentIds = assertUniqueIds(documents, "id", "DOMAIN_KB.documents()");
    documents.forEach(function (doc, i) {
      var label = "DOMAIN_KB.documents()[" + i + "]（" + doc.id + "）";
      if (!categoryIds[doc.categoryId]) fail(label + ".categoryId 悬空：" + doc.categoryId);
      ["title", "type", "summary", "source", "updatedAt"].forEach(function (field) {
        assertString(doc, field, label);
      });
      if (doc.body !== null && !Array.isArray(doc.body)) {
        fail(label + ".body 必须是 null 或字符串数组");
      }
      if (Array.isArray(doc.body)) {
        if (!doc.body.length) fail(label + ".body 不能是空数组，没有正文请显式写 null");
        doc.body.forEach(function (paragraph, j) {
          if (!isNonEmptyString(paragraph)) fail(label + ".body[" + j + "] 必须是非空字符串");
        });
        if (kb.chunksOf(doc.id).length !== doc.body.length) {
          fail(label + " 的 chunksOf() 段数与 body 段数不一致");
        }
      } else if (kb.chunksOf(doc.id).length !== 0) {
        fail(label + " 没有正文，chunksOf() 必须返回空数组");
      }
    });

    var presets = kb.qaPresets();
    assertNonEmptyArray(presets, "DOMAIN_KB.qaPresets()");
    assertUniqueIds(presets, "id", "DOMAIN_KB.qaPresets()");
    presets.forEach(function (preset, i) {
      var label = "DOMAIN_KB.qaPresets()[" + i + "]（" + preset.id + "）";
      assertString(preset, "question", label);
      assertString(preset, "answer", label);
      assertNonEmptyArray(preset.citations, label + ".citations");
      preset.citations.forEach(function (citation, j) {
        var clabel = label + ".citations[" + j + "]";
        var doc = kb.document(citation.docId);
        if (!doc.body) fail(clabel + " 引用了没有正文的文档：" + citation.docId);
        assertNonEmptyArray(citation.hintChunks, clabel + ".hintChunks");
        var chunkCount = kb.chunksOf(citation.docId).length;
        citation.hintChunks.forEach(function (chunkIndex) {
          if (!isFiniteNumber(chunkIndex) || chunkIndex < 0 || chunkIndex >= chunkCount
              || Math.floor(chunkIndex) !== chunkIndex) {
            fail(clabel + ".hintChunks 越界：" + chunkIndex + "（" + citation.docId + " 共 " + chunkCount + " 段）");
          }
        });
      });

      // 检索结果必须恒等于声明的 citations 集合，不能是"取前 N 名"。pump-demo 早先
      // 是 hits.slice(0,3)，而多数预设只声明 1~2 段，于是动画高亮的 chunk 和答案
      // 实际引用的 chunk 对不上——当时全套数据断言是绿的，因为没人断言过这件事。
      var expected = [];
      preset.citations.forEach(function (citation) {
        citation.hintChunks.forEach(function (chunkIndex) {
          expected.push(citation.docId + "#" + chunkIndex);
        });
      });
      var actual = kb.retrieve(preset.id).hits.map(function (hit) {
        return hit.docId + "#" + hit.chunkIndex;
      });
      expected.sort();
      actual.sort();
      if (expected.join(",") !== actual.join(",")) {
        fail("DOMAIN_KB.retrieve(" + preset.id + ") 的命中集合与 citations 不一致：期望 ["
          + expected.join(",") + "]，实际 [" + actual.join(",") + "]");
      }
    });

    var ingestion = kb.ingestion();
    if (!Array.isArray(ingestion) || ingestion.length < 5 || ingestion.length > 6) {
      fail("DOMAIN_KB.ingestion() 长度必须在 [5,6] 之间，实际 " + (ingestion && ingestion.length));
    }
    assertUniqueIds(ingestion, "key", "DOMAIN_KB.ingestion()");
    ingestion.forEach(function (step, i) {
      var label = "DOMAIN_KB.ingestion()[" + i + "]（" + step.key + "）";
      assertString(step, "label", label);
      assertString(step, "desc", label);
      if (!isFiniteNumber(step.ms) || step.ms <= 0) fail(label + ".ms 必须是正数");
    });

    var ingestDocId = kb.ingestDemoDocId();
    if (!documentIds[ingestDocId]) {
      fail("DOMAIN_KB.ingestDemoDocId() 悬空：" + ingestDocId);
    }
    if (!kb.document(ingestDocId).body) {
      fail("DOMAIN_KB.ingestDemoDocId() 指向的文档没有正文，入库动画无 chunk 可切：" + ingestDocId);
    }
    var archiveTarget = kb.archiveTarget();
    if (!archiveTarget || !categoryIds[archiveTarget.categoryId]) {
      fail("DOMAIN_KB.archiveTarget().categoryId 悬空：" + (archiveTarget && archiveTarget.categoryId));
    }

    return { categories: categoryIds, documents: documentIds };
  }

  // ---------- 总入口 ----------

  function assertAll() {
    CONTRACT_GLOBALS.forEach(function (name) {
      if (!window[name]) fail(name + " 未加载，请检查领域包的 <script> 是否齐全且顺序正确");
    });

    var meta = window.DOMAIN_META;
    var taxonomy = window.DOMAIN_TAXONOMY;
    var records = window.DOMAIN_RECORDS;
    var series = window.DOMAIN_SERIES;
    var vision = window.DOMAIN_VISION;
    var diagnosis = window.DOMAIN_DIAGNOSIS;
    var review = window.DOMAIN_REVIEW;
    var report = window.DOMAIN_REPORT;
    var agentqa = window.DOMAIN_AGENTQA;
    var kb = window.DOMAIN_KB;

    // 顺序有依赖：taxonomy 先出 id 表，kb 先出分类/文档表（review 的归档分类和
    // diagnosis 的案例文档都要引用它），最后才轮到引用它们的那几份。
    var ids = assertTaxonomy(taxonomy);
    var kbIds = assertKb(kb);
    ids.records = assertRecords(records, ids);
    ids.frames = assertVision(vision, ids);
    ids.documents = kbIds.documents;
    ids.outcomes = assertReview(review, kbIds.categories);

    assertMeta(meta, ids);
    assertSeries(series, meta, ids);
    assertDiagnosis(diagnosis, ids);
    assertReport(report, review);
    assertAgentQa(agentqa, kb);
  }

  return {
    CONTRACT_VERSION: CONTRACT_VERSION,
    CONTRACT_GLOBALS: CONTRACT_GLOBALS,
    PROVIDED_SLOTS: PROVIDED_SLOTS,
    assertAll: assertAll,
    assertTaxonomy: assertTaxonomy,
    assertRecords: assertRecords,
    assertSeries: assertSeries,
    assertVision: assertVision,
    assertDiagnosis: assertDiagnosis,
    assertReview: assertReview,
    assertReport: assertReport,
    assertAgentQa: assertAgentQa,
    assertKb: assertKb,
    assertMeta: assertMeta
  };
})();
