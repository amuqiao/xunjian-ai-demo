// window.AppState —— 运行时状态 + 派生量。
//
// 【比旧目录薄很多，且不持久化】旧的 core/state.js 是 567 行：localStorage 持久化 +
// 脏状态清洗 + flowVisited（喂那条从未渲染的 6 步流程轨）+ overlay 种类枚举 +
// canOpen（恒 return true 的假锁）。本版去掉这四样：
//   - 不持久化：单场景 demo，刷新回到工作台是可接受的行为，一套清洗逻辑换不来什么。
//   - 不要 flowVisited：本版没有流程轨，导航的三步完成态是**派生**的（见 steps()）。
//   - 不要 canOpen：三步随时可点。旧版那个 title「完成人工复核的执行动作后解锁」
//     永远不会出现，因为 canOpen 恒真 —— 假锁比没锁糟。
//
// 【唯二的写入口】选记录 / 选依据 / 选结论 …… 全部经由本文件的 set* 函数，场景层只读。
window.AppState = (function () {
  "use strict";

  function need(name) {
    if (!window[name]) throw new Error("[AppState] 需要先加载 " + name);
    return window[name];
  }

  var STATION = need("DOMAIN_STATION");
  var RECORDS = need("DOMAIN_RECORDS");
  var REVIEW = need("DOMAIN_REVIEW");
  var SERIES = need("DOMAIN_SERIES");
  var KB = need("DOMAIN_KB");

  var SCENES = ["workbench", "review", "knowledge"];

  // 演示入口：从哪个对象、哪条记录开始。写在这里而不是散落在各场景里 ——
  // 换课题只改这两行。
  var ENTRY = { objectId: "OBJ-A", recordId: "REC-1" };

  // 报告生成日。固定值不用 new Date() —— 演示机跨天之后报告编号和上面的时间戳
  // 不该跟着变（素材里那几张照片的时间戳是固定的，对不上就露）。
  // scripts/ui/reportview.js 的 generatedAt 用的是同一天，两处必须一致。
  var REPORT_DATE = "2026-07-22";

  var state = {
    scene: "workbench",
    objectId: ENTRY.objectId,
    recordId: ENTRY.recordId,
    // 当前选中的依据链下标。-1 = 还没点过任何依据（证据台显示"点左侧依据查看"）。
    evidenceIndex: -1,
    // 看过证据没有 —— 导航第一步的完成态就是它。一个布尔，不做成访问集合：
    // 三步进度只需要"到过没到过"，不需要知道点过哪几枚。
    evidenceOpened: false,
    range: SERIES.ranges()[0].key,
    zoomOpen: false,

    reviewerId: REVIEW.defaultReviewerId,
    outcomeId: "",
    note: "",

    archiveOpen: false,
    archived: false,

    ingestOpen: false,
    ingestStep: 0,

    agentOpen: false,
    // 已问过的问题 id 列表，按提问顺序。对话流就是照它渲染的，不另存消息数组 ——
    // 答案是预设的，从 id 就能查回来，存两份必然分叉。
    agentAsked: [],
    // 正在"检索中"的问题 id（打字机三点动画期间）。答案落地后清空。
    agentPending: ""
  };

  // ---------------------------------------------------------------- 派生量

  function record() { return RECORDS.recordById(state.recordId); }
  function part() { return STATION.partById(record().partId); }
  function object() { return STATION.objectById(state.objectId); }
  function reviewer() { return REVIEW.reviewerById(state.reviewerId); }
  function outcome() { return state.outcomeId ? REVIEW.outcomeById(state.outcomeId) : null; }

  function evidenceList() { return record().evidence; }

  function currentEvidence() {
    var list = evidenceList();
    if (state.evidenceIndex < 0 || state.evidenceIndex >= list.length) return null;
    return list[state.evidenceIndex];
  }

  // 分歧 = 人工结论与 AI 建议不一致。它驱动三件事：复核页的橙色提示条、意见变必填、
  // 报告多一段「复核分歧说明」。三处都读这一个函数，不各自比一遍。
  function divergent() {
    var o = outcome();
    return !!o && o.id !== record().suggestion.outcomeId;
  }

  // 归档按钮可点的条件。分歧时意见必填 —— 这是"人工介入产生后果"的机械约束：
  // 不填理由就不让归档，而不是填了更好。
  function canArchive() {
    if (!state.outcomeId) return false;
    if (divergent() && !state.note.trim()) return false;
    return true;
  }

  // 归档后是否解锁"二次命中"（依据链里 locked 的那枚 case 芯片亮起）。
  function reuseUnlocked() {
    var o = outcome();
    return state.archived && !!o && o.unlocksReuse;
  }

  // 导航三步的完成态，全部派生、不存字段。
  function steps() {
    return [
      { key: "workbench", label: "诊断工作台", done: state.evidenceOpened },
      { key: "review", label: "人工复核", done: !!state.outcomeId },
      { key: "knowledge", label: "知识库", done: state.archived }
    ];
  }

  function caseId() {
    var r = record();
    // 【与 scripts/core/report.js 的 contextFromState 必须同一规则】两处都在拼案例编号，
    // 屏上顶栏显示的和报告里印的必须逐字相同。
    // 日期不从 r.date 取 —— 泵这边的记录没有 date 字段（事件时间在测点与视觉帧上），
    // 统一用报告生成日 REPORT_DATE。
    return "BP-AI-" + REPORT_DATE.replace(/-/g, "") + "-" + r.id.replace("REC-", "");
  }

  // ---------------------------------------------------------------- 写入口

  function setScene(key) {
    if (SCENES.indexOf(key) < 0) throw new Error("[AppState] 未知场景：" + key);
    state.scene = key;
    // 换场景关掉浮层：浮层是"当前这一屏上的东西"，跟着场景走比留着更符合预期。
    state.zoomOpen = false;
    state.archiveOpen = false;
    state.ingestOpen = false;
  }

  function setRecord(id) {
    RECORDS.recordById(id);
    state.recordId = id;
    // 换记录必须重置依据下标：依据链长度 2~4 不等，留着旧下标会越界。
    state.evidenceIndex = -1;
    state.zoomOpen = false;
  }

  function setEvidence(index) {
    var list = evidenceList();
    if (index < 0 || index >= list.length) {
      throw new Error("[AppState] 依据下标越界：" + index + "，当前记录有 " + list.length + " 条");
    }
    state.evidenceIndex = index;
    state.evidenceOpened = true;
  }

  function setRange(key) {
    SERIES.rangeLabel(key);
    state.range = key;
  }

  function setReviewer(id) { REVIEW.reviewerById(id); state.reviewerId = id; }

  function setOutcome(id) { REVIEW.outcomeById(id); state.outcomeId = id; }

  function setNote(text) { state.note = String(text); }

  function appendPhrase(text) {
    var cur = state.note.trim();
    state.note = cur ? cur + " " + text : text;
  }

  function archive() {
    if (!canArchive()) {
      throw new Error("[AppState] 归档条件不满足：需要选定结论" + (divergent() ? "，且分歧时必须填写复核意见" : ""));
    }
    state.archived = true;
    state.archiveOpen = false;
  }

  function askAgent(questionId) {
    var ctx = KB.contextOf(state.scene);
    var found = ctx.questions.filter(function (q) { return q.id === questionId; })[0];
    if (!found) throw new Error("[AppState] 当前语境没有这个问题：" + questionId);
    if (state.agentAsked.indexOf(questionId) < 0) state.agentAsked.push(questionId);
    state.agentPending = questionId;
  }

  function settleAgent() { state.agentPending = ""; }

  function reset() {
    state.scene = "workbench";
    state.recordId = ENTRY.recordId;
    state.evidenceIndex = -1;
    state.evidenceOpened = false;
    state.range = SERIES.ranges()[0].key;
    state.zoomOpen = false;
    state.outcomeId = "";
    state.note = "";
    state.archiveOpen = false;
    state.archived = false;
    state.ingestOpen = false;
    state.ingestStep = 0;
    state.agentOpen = false;
    state.agentAsked = [];
    state.agentPending = "";
  }

  return {
    value: state,
    SCENES: SCENES,
    record: record, part: part, object: object,
    reviewer: reviewer, outcome: outcome,
    evidenceList: evidenceList, currentEvidence: currentEvidence,
    divergent: divergent, canArchive: canArchive, reuseUnlocked: reuseUnlocked,
    steps: steps, caseId: caseId,
    setScene: setScene, setRecord: setRecord, setEvidence: setEvidence, setRange: setRange,
    setReviewer: setReviewer, setOutcome: setOutcome, setNote: setNote, appendPhrase: appendPhrase,
    archive: archive, askAgent: askAgent, settleAgent: settleAgent, reset: reset
  };
})();
