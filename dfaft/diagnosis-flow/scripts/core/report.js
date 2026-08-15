// 报告模型：把 07-report.js 的模板 + 当前 state 解析成一份可渲染的报告。
//
// 放在 core 而不是 scenes，是因为它有两个消费者——报告归档页要渲染它，知识库页要把
// 归档结果当成一篇新文档插进列表。同层场景文件之间不得互相引用，所以共用逻辑必须
// 上提一层。
//
// ---- 插槽解析的硬约束 ----
// 模板里出现的每个 {{x}} 都必须在 DOMAIN_REPORT.slots 里声明（schema 启动时已校验），
// 而这里再加一道运行期的：解析后如果字符串里还残留 {{...}}，直接抛错。
// 这防的是"插槽名拼错"——它不会抛异常，只会把 {{reviewNote}} 原文印在报告正文里，
// 而演示时没人会盯着报告逐字读，很可能一直到客户看到才被发现。
window.ReportModel = (function () {
  "use strict";

  var REPORT = window.DOMAIN_REPORT;
  var REVIEW = window.DOMAIN_REVIEW;
  var KB = window.DOMAIN_KB;
  var AppState = window.AppState;

  var SLOT_RE = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;

  function fieldText(fieldId) {
    var field = REVIEW.fields[fieldId];
    if (!field) return "未涉及";
    var outcome = AppState.currentOutcome();
    // 该结论根本不要求这个字段时，报告里如实写"未涉及"，而不是留空——留空看起来
    // 像"该填没填"。
    if (!outcome || outcome.fields.indexOf(fieldId) < 0) return "未涉及";
    var value = AppState.value.review.fields[fieldId];
    if (field.type === "checkbox") {
      var picked = (value || []).map(function (id) {
        return field.options.filter(function (o) { return o.id === id; })[0].label;
      });
      return picked.length ? picked.join("、") : "无";
    }
    if (!value) return "未填写";
    return field.options.filter(function (o) { return o.id === value; })[0].label;
  }

  function retestText() {
    var state = AppState.value;
    var outcome = AppState.currentOutcome();
    if (!outcome || !outcome.retest.enable) return "本结论无复测环节";
    if (state.review.retestPassed === true) return "已通过";
    if (state.review.retestPassed === false) return "未通过（已退回复核）";
    return "待确认";
  }

  // caseId 单独一步解析：caseIdTpl 自己也带插槽（比如 {{date}}），所以先用不含
  // caseId 的基础表把它解出来，再把结果并进完整表。不这么分会自引用。
  function baseSlots() {
    var state = AppState.value;
    var record = AppState.currentRecord();
    var item = AppState.currentCase();
    var outcome = AppState.currentOutcome();
    var reviewer = AppState.currentReviewer();
    return {
      objectLabel: AppState.currentObject().label,
      partLabel: AppState.partById(record.partId).label,
      date: record.date,
      inspector: record.inspector,
      aiConclusion: item ? item.suggestion.text : "本条记录无模型判读",
      confidence: item ? String(item.confidence) : "0",
      reviewerName: reviewer.name,
      reviewerRole: reviewer.role,
      outcomeLabel: outcome ? outcome.label : "未选定",
      // 复核意见原文逐字进报告——这是"人机协同"从口号变成看得见的东西的那一处。
      reviewNote: state.review.note.trim() || "（未填写复核意见）",
      divergenceReason: state.review.note.trim() || "（未填写）",
      crew: fieldText("crew"),
      window: fieldText("window"),
      riskLevel: fieldText("riskLevel"),
      retestResult: retestText()
    };
  }

  function fill(template, slots, where) {
    var out = template.replace(SLOT_RE, function (whole, name) {
      if (!Object.prototype.hasOwnProperty.call(slots, name)) return whole;
      return slots[name];
    });
    if (SLOT_RE.test(out)) {
      SLOT_RE.lastIndex = 0;
      throw new Error("[ReportModel] " + where + " 存在无法解析的插槽：" + out.match(SLOT_RE));
    }
    SLOT_RE.lastIndex = 0;
    return out;
  }

  function caseId() {
    var outcome = AppState.currentOutcome();
    if (!outcome) return "";
    return fill(outcome.archive.caseIdTpl, baseSlots(), "caseIdTpl");
  }

  function slots() {
    var map = baseSlots();
    map.caseId = caseId() || "未生成";
    return map;
  }

  // showIf 决定段落出现与否。这是"两条支线跑出两份不同报告"的机械落点——如果两次
  // 演示的产出一模一样，说明人工介入只是装饰。
  function sectionVisible(section) {
    if (!section.showIf) return true;
    var outcome = AppState.currentOutcome();
    if (section.showIf === "divergent") return AppState.isDivergent();
    if (section.showIf === "retestFailed") return AppState.retestFailed();
    if (section.showIf === "treatment") return !!outcome && outcome.track === "treatment";
    if (section.showIf === "closure") return !!outcome && outcome.track === "closure";
    throw new Error("[ReportModel] 未知 showIf：" + section.showIf);
  }

  function sections() {
    var map = slots();
    return REPORT.sections.filter(sectionVisible).map(function (section) {
      return {
        id: section.id,
        title: section.title,
        status: section.status,
        text: fill(section.text, map, "sections[" + section.id + "]"),
        // 人工原文所在的两段要高亮：观众要一眼看出"这句话是刚才那个人打的"。
        human: section.id === "review" || section.id === "divergence"
      };
    });
  }

  function title() {
    return fill(REPORT.titleTpl, slots(), "titleTpl");
  }

  // 归档产物：一篇可以插进知识库列表的文档。它不写回领域数据（契约是只读的），
  // 由知识库页在渲染时把它拼进列表——演示重置后自然消失，不留残渣。
  function archivedDocument() {
    var state = AppState.value;
    if (!state.archived) return null;
    var outcome = AppState.currentOutcome();
    return {
      id: "DOC-ARCHIVED",
      categoryId: KB.archiveTarget().categoryId,
      title: title(),
      type: "归档案例",
      summary: outcome.archive.statusText,
      source: "本轮演示归档 · " + AppState.currentReviewer().name,
      updatedAt: AppState.currentRecord().date,
      body: sections().map(function (section) { return section.title + "：" + section.text; }),
      isNew: true
    };
  }

  return {
    slots: slots,
    sections: sections,
    sectionVisible: sectionVisible,
    title: title,
    caseId: caseId,
    archivedDocument: archivedDocument,
    fill: fill
  };
})();
