// 报告模型：把 domain/06-report.js 的模板 + 一份复核上下文解析成可渲染的报告。
//
// 【为什么 resolve() 收一个显式 ctx，而不是自己去读 AppState】
// 这份模型有两个消费者：①归档浮窗的屏上预览（ctx 由场景层从当前 state 拼出来）；
// ②tools/build_report.py 的 PDF 构建（ctx 是脚本里写死的一份剧本，跑在无 AppState 的
// 环境里）。让它自己读全局状态，第二个消费者就没法用了 —— 而两种形态必须来自同一份
// 模板，否则屏上和下载下来的报告对不上。
//
// 【插槽纪律】解析完如果字符串里还残留 {{...}}，直接抛错。防的是插槽名拼错：它不会
// 报异常，只会把 {{reviewNote}} 原文印在报告正文里，而演示时没人会盯着报告逐字读。
window.ReportModel = (function () {
  "use strict";

  var SLOT_RE = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;

  function requireDomain(name) {
    if (!window[name]) throw new Error("[ReportModel] 需要先加载 " + name);
    return window[name];
  }

  // 把 ctx 摊平成 { 插槽名: 字符串 }。这里是插槽的唯一真源 —— 新增插槽要同时改这里
  // 和 domain/06-report.js 的 slots 数组。
  //
  // 【两边真的会比对，就在这个函数末尾】曾经这条注释说"schema 会比对两边"，但那只是
  // 一句愿望：原来的实现只是把 REPORT.slots 塞进 values.__slots 这个键，从没有任何
  // 代码读过它、比过它。真正兜底插槽名拼错的是 fill() 里"解析完还残留 {{...}} 就抛错"
  // 那一段，但它只朝一个方向生效：模板里引用了 values 没有的键会被抓到；反过来，
  // values 里多产出一个键、却忘了登记进 domain/06-report.js 的 slots 数组，什么都不会
  // 发生 —— 这个键既不会被任何模板引用（不报错），也不会被任何人读到。checkSlotSchema
  // 把这条路也堵上：values 的每个真实键都必须出现在 slots 里，slots 里的每一项也都
  // 必须能在 values 里找到，双向都不允许静默漏项。
  function checkSlotSchema(values, slots) {
    var key;
    for (key in values) {
      if (!Object.prototype.hasOwnProperty.call(values, key)) continue;
      if (key.indexOf("__") === 0) continue; // __divergent 等是内部标记，不是插槽
      if (slots.indexOf(key) < 0) {
        throw new Error("[ReportModel] slotValues() 产出了插槽「" + key +
          "」，但 domain/06-report.js 的 slots 数组没有登记它");
      }
    }
    for (var i = 0; i < slots.length; i++) {
      if (!Object.prototype.hasOwnProperty.call(values, slots[i])) {
        throw new Error("[ReportModel] domain/06-report.js 的 slots 数组声明了「" + slots[i] +
          "」，但 slotValues() 没有产出这个键");
      }
    }
  }

  function slotValues(ctx) {
    var REPORT = requireDomain("DOMAIN_REPORT");
    var divergent = ctx.outcome.id !== ctx.record.suggestion.outcomeId;
    var values = {
      caseId: ctx.caseId,
      generatedAt: ctx.generatedAt,
      objectLabel: ctx.object.label,
      partLabel: ctx.part.label,
      cameraLabel: ctx.part.cameraLabel,
      recordNo: ctx.record.no,
      recordItem: ctx.record.item,
      recordStandard: ctx.record.standard,
      recordResult: ctx.record.result,
      aiLabel: ctx.record.suggestion.label.replace(/^建议结论：/, ""),
      aiConfidence: String(ctx.record.suggestion.confidence),
      aiText: ctx.record.suggestion.text,
      reviewerName: ctx.reviewer.name,
      reviewerRole: ctx.reviewer.role,
      outcomeLabel: ctx.outcome.label,
      // 复核意见为空时写「未填写」而不是留空 —— 留空看起来像模板坏了。
      reviewNote: ctx.note && ctx.note.trim() ? ctx.note.trim() : "未填写",
      divergenceNote: divergent
        ? (ctx.note && ctx.note.trim() ? ctx.note.trim() : "未填写分歧理由")
        : "无分歧",
      seriesSummary: ctx.seriesSummary,
      visionSummary: ctx.visionSummary,
      behaviorSummary: ctx.behaviorSummary,
      __divergent: divergent
    };
    checkSlotSchema(values, REPORT.slots);
    return values;
  }

  function fill(text, values) {
    var out = String(text).replace(SLOT_RE, function (whole, name) {
      if (!Object.prototype.hasOwnProperty.call(values, name)) return whole;
      return values[name];
    });
    var leftover = out.match(SLOT_RE);
    if (leftover) {
      throw new Error("[ReportModel] 未解析的插槽：" + leftover.join(", ") + "（在「" + text + "」中）");
    }
    return out;
  }

  // 返回 { meta, header, pages: [{ page, sections }] }。sections 已按 showIf 过滤、
  // 插槽已填好，渲染层和 PDF 构建器都直接用，不再各自解析一遍。
  function resolve(ctx) {
    var REPORT = requireDomain("DOMAIN_REPORT");
    var values = slotValues(ctx);
    var divergent = values.__divergent;

    // 中文数字编号。报告最多七八段，写到十够用；越界直接抛错而不是退回阿拉伯数字
    // —— 那种降级在 PDF 上表现为「一、二、8、四」，比报错难发现得多。
    var CN_NUM = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
    var numberSeq = 0;

    var sections = REPORT.sections
      .filter(function (sec) {
        if (sec.showIf === "divergent") return divergent;
        return true;
      })
      .map(function (sec) {
        var title = sec.title;
        if (sec.numbered) {
          if (numberSeq >= CN_NUM.length) {
            throw new Error("[ReportModel] 需要编号的段落超过 " + CN_NUM.length + " 段，请扩充 CN_NUM");
          }
          title = CN_NUM[numberSeq] + "、" + sec.title;
          numberSeq += 1;
        }
        var out = { id: sec.id, page: sec.page, kind: sec.kind, tone: sec.tone || null, title: title };
        if (sec.body) out.body = fill(sec.body, values);
        if (sec.items) out.items = sec.items.map(function (t) { return fill(t, values); });
        if (sec.tags) out.tags = sec.tags.map(function (t) { return fill(t, values); });
        if (sec.rows) {
          out.rows = sec.rows.map(function (row) { return [fill(row[0], values), fill(row[1], values)]; });
        }
        return out;
      });

    var pageNumbers = [];
    sections.forEach(function (sec) {
      if (pageNumbers.indexOf(sec.page) < 0) pageNumbers.push(sec.page);
    });
    pageNumbers.sort(function (a, b) { return a - b; });

    return {
      meta: REPORT.meta,
      divergent: divergent,
      header: {
        title: REPORT.meta.title,
        subtitle: REPORT.meta.subtitle,
        caseId: values.caseId,
        generatedAt: values.generatedAt
      },
      pages: pageNumbers.map(function (n) {
        return {
          page: n,
          total: pageNumbers.length,
          sections: sections.filter(function (sec) { return sec.page === n; })
        };
      })
    };
  }

  // 从当前运行状态拼 ctx。只有场景层用；PDF 构建器自己写死一份剧本。
  function contextFromState(state) {
    var STATION = requireDomain("DOMAIN_STATION");
    var RECORDS = requireDomain("DOMAIN_RECORDS");
    var REVIEW = requireDomain("DOMAIN_REVIEW");
    var SERIES = requireDomain("DOMAIN_SERIES");
    var VISION = requireDomain("DOMAIN_VISION");

    var record = RECORDS.recordById(state.recordId);
    var part = STATION.partById(record.partId);
    var seriesEvidence = record.evidence.filter(function (e) { return e.kind === "series"; })[0];
    // pose/route 是 REC-7 的行为复核证据（姿态、轨迹），画面里同样带 boxes/paths，
    // 归档报告的「视觉」段引用的就是它们 —— 漏掉这两个 kind 不会抛错，只会静默印出
    // 「本条不涉及视觉证据」，而 REC-7 全部的意义就是靠视觉洗清行为异常。
    var visionEvidence = record.evidence.filter(function (e) {
      return e.kind === "vision" || e.kind === "compare" || e.kind === "pose" || e.kind === "route";
    })[0];
    var trackEvidence = record.evidence.filter(function (e) { return e.kind === "track"; })[0];

    return {
      caseId: "XJ-AI-" + record.date.replace(/-/g, "") + "-" + record.id.replace("REC-", ""),
      generatedAt: state.generatedAt,
      object: STATION.objectById(record.objectId),
      part: part,
      record: record,
      reviewer: REVIEW.reviewerById(state.reviewerId),
      outcome: REVIEW.outcomeById(state.outcomeId),
      note: state.note,
      seriesSummary: seriesEvidence
        ? (function () {
            var point = STATION.pointById(seriesEvidence.pointId);
            // 阈值一律保留 1 位小数：warnAt 是 9（数字），直接拼字符串会印成「高报警 9MPa」，
            // 而标准原文写的是「高报警 9.0MPa」—— 报告上这两个写法不一致会被当成笔误。
            function mpa(v) { return v.toFixed(1) + point.unit; }
            return point.label + " 末点 " + mpa(point.fieldReading) +
              "，高报警 " + mpa(point.warnAt) + "，高高报警 " + mpa(point.dangerAt) +
              "（" + SERIES.rangeLabel(state.range) + "）";
          })()
        : "本条不涉及数值型测点",
      visionSummary: visionEvidence
        ? (function () {
            var frame = VISION.frameById(visionEvidence.frameId);
            return frame.camera + " " + frame.shotAt + "，识别 " + frame.boxes.length + " 处对象";
          })()
        : "本条不涉及视觉证据",
      // 行为核查摘要：点出停留秒数与命中条数，与依据链上 track 那枚芯片的 detail
      // 用词保持一致（「停留 X 秒，命中 N 条规则」），不重新编一套措辞。
      behaviorSummary: trackEvidence
        ? (function () {
            var track = RECORDS.trackById(trackEvidence.trackId);
            var stayRow = track.rows.filter(function (r) { return r.label === "本项现场停留"; })[0];
            if (!stayRow) {
              throw new Error("[ReportModel] " + track.id + " 缺少「本项现场停留」这一行，behaviorSummary 无法派生");
            }
            var hits = track.rows.filter(function (r) { return r.hit; }).length;
            return "停留 " + stayRow.value + "，命中 " + hits + " 条规则";
          })()
        : "本条不涉及行为核查"
    };
  }

  return { resolve: resolve, contextFromState: contextFromState };
})();
