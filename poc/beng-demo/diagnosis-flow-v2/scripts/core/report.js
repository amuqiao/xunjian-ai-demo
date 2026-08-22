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
  // 和 domain/06-report.js 的 slots 数组，resolve() 末尾会比对两边。
  //
  // 【泵课题相对参照物多了 8 个插槽】altLabel / altConfidence（备选诊断，Q&A 的 Q2）、
  // alignSummary（对中前后实测）、caseSummary + weightSummary（历史检索与置信度构成，
  // Q&A 的 Q1 和 Q5-Q7）、planSummary + windowBasis + partsNote（分级处置，Q&A 的
  // Q13-Q16）。它们全都是"专家追问过、所以必须落到纸上"的东西。
  function slotValues(ctx) {
    var REPORT = requireDomain("DOMAIN_REPORT");
    var divergent = ctx.outcome.id !== ctx.record.suggestion.outcomeId;
    return {
      caseId: ctx.caseId,
      generatedAt: ctx.generatedAt,
      objectLabel: ctx.object.name,
      unitLabel: ctx.object.unit,
      partLabel: ctx.part.label,
      photoLabel: ctx.part.photoLabel,
      recordNo: ctx.record.no,
      recordItem: ctx.record.item,
      recordStandard: ctx.recordStandard,
      recordResult: ctx.record.result,
      aiLabel: ctx.record.suggestion.label.replace(/^建议结论：/, ""),
      aiConfidence: String(ctx.record.suggestion.confidence),
      aiText: ctx.record.suggestion.text,
      // 备选诊断。REC-2 / REC-3 没有备选（alternative 为 null），写「无」而不是留空 ——
      // 报告里那一行必须始终成句，不能出现「备选诊断：，置信度 %」。
      altLabel: ctx.record.suggestion.alternative
        ? ctx.record.suggestion.alternative.label : "无",
      altConfidence: ctx.record.suggestion.alternative
        ? String(ctx.record.suggestion.alternative.confidence) : "—",
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
      alignSummary: ctx.alignSummary,
      caseSummary: ctx.caseSummary,
      weightSummary: ctx.weightSummary,
      planSummary: ctx.planSummary,
      windowBasis: ctx.windowBasis,
      partsNote: ctx.partsNote,
      __divergent: divergent,
      __slots: REPORT.slots
    };
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
    var visionEvidence = record.evidence.filter(function (e) { return e.kind === "vision"; })[0];
    var alignEvidence = record.evidence.filter(function (e) { return e.kind === "alignment"; })[0];
    var caseEvidence = record.evidence.filter(function (e) { return e.kind === "case"; })[0];
    var planEvidence = record.evidence.filter(function (e) { return e.kind === "plan"; })[0];
    var ruleEvidence = record.evidence.filter(function (e) { return e.kind === "rule"; })[0];

    return {
      // 案例编号：站场代号 + 日期 + 记录序号。日期不从 record.date 取（泵这边的记录
      // 没有 date 字段，事件时间在测点与视觉帧上），统一用报告生成日。
      caseId: "BP-AI-" + state.generatedAt.slice(0, 10).replace(/-/g, "") + "-"
        + record.id.replace("REC-", ""),
      generatedAt: state.generatedAt,
      object: STATION.objectById(record.objectId),
      part: part,
      record: record,
      reviewer: REVIEW.reviewerById(state.reviewerId),
      outcome: REVIEW.outcomeById(state.outcomeId),
      note: state.note,
      // 判定口径：有数值型测点时取测点的 standardText，否则取第一枚 rule 依据的标签。
      // 与 scripts/scenes/workbench.js 的 standardOf() 同一规则 —— 报告和屏上必须一致。
      recordStandard: seriesEvidence
        ? STATION.pointById(seriesEvidence.pointId).standardText
        : (ruleEvidence ? RECORDS.ruleById(ruleEvidence.ruleId).label : "—"),
      seriesSummary: seriesEvidence
        ? (function () {
            var point = STATION.pointById(seriesEvidence.pointId);
            var st = SERIES.stats(seriesEvidence.pointId);
            // 数值一律保留 1 位小数：末点是 11.9，拼字符串时若某个值恰好是整数
            // （比如基线写成 9），会印成「基线 9mm/s」而标准写法是「9.0mm/s」，
            // 报告上两种写法并存会被当成笔误。
            function v(x) { return x.toFixed(1) + point.unit; }
            return point.label + "（" + point.tag + "）末点 " + v(point.fieldReading)
              + "，峰值 " + v(st.max) + "，相对基线 " + v(st.baseline) + " 上升 "
              + st.risePercent + "%；" + st.startAt.slice(11) + "-" + st.endAt.slice(11)
              + " 共 " + st.total + " 点，其中 " + st.overDangerCount + " 点在 ISO D 档以上"
              + "（" + SERIES.rangeLabel(state.range) + "）";
          })()
        : "本条不涉及数值型测点",
      visionSummary: visionEvidence
        ? (function () {
            var frame = VISION.frameById(visionEvidence.frameId);
            return frame.camera + " " + frame.shotAt + "，识别 " + frame.boxes.length + " 处对象";
          })()
        : "本条不涉及视觉证据",
      alignSummary: alignEvidence
        ? (function () {
            var al = RECORDS.alignmentById(alignEvidence.alignmentId);
            return al.instrument + " 实测 " + al.rows.map(function (r) {
              return r.label + " " + r.before + " → " + r.after;
            }).join("；") + "。" + al.conclusion;
          })()
        : "本条不涉及对中实测",
      caseSummary: caseEvidence
        ? (function () {
            var hit = RECORDS.caseHitById(caseEvidence.caseHitId);
            return "检索命中 " + hit.rows.length + " 条：" + hit.rows.map(function (r) {
              return r.code + "（" + r.score.toFixed(2) + "，确诊" + r.verdict + "）";
            }).join("；");
          })()
        : "本条未触发案例检索",
      weightSummary: caseEvidence
        ? (function () {
            var hit = RECORDS.caseHitById(caseEvidence.caseHitId);
            return hit.weighting.map(function (w) {
              return w.label + " " + w.value.toFixed(2);
            }).join(" × ") + " ≈ " + (hit.weighting.reduce(function (a, w) {
              return a * w.value;
            }, 1)).toFixed(2);
          })()
        : "本条无加权明细",
      planSummary: planEvidence
        ? (function () {
            var plan = RECORDS.planById(planEvidence.planId);
            return plan.steps.map(function (st) {
              return st.at + "：" + st.label + " —— " + st.detail;
            }).join("\n");
          })()
        : "本条不涉及分级处置",
      windowBasis: planEvidence
        ? RECORDS.planById(planEvidence.planId).windowBasis.join(" ")
        : "—",
      // ⚠️ 备件与移动端作业卡：报告里也只写说明，不写"已推送"。
      partsNote: planEvidence
        ? RECORDS.planById(planEvidence.planId).partsNote
        : "—"
    };
  }

  return { resolve: resolve, contextFromState: contextFromState };
})();
