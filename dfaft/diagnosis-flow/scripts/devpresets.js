// 单页打磨入口：把演示状态直接跳到某一步，不用每次从工作台一路点过来。
//
// 用法：index.html#preset=review-divergent
//       dev/index.html 是这些 preset 的目录页。
//
// ---- 为什么不做成 dev/workbench.html 这样的四份独立页面 ----
// 那需要把 index.html 的 40 多个 <script> 标签复制四份，加一个组件就要改五处，
// 迟早漂移。preset 走 URL hash，页面只有一个，永远不会和主入口不一致。
//
// ---- 为什么 preset 从契约现算，而不是写死一份 state ----
// 写死的 state 里含 "observe"、"crew-1" 这类 domain-skeleton 专属 id，换成
// domain-pump 就全是悬空引用。这里一律现查：结论取"第一条与 AI 建议不同的"，
// 字段取"该字段的第一个选项"，于是任何一包领域数据都能用同一套 preset。
//
// 这个文件只在开发时有用，不影响演示——没有 hash 时它什么都不做。
window.DevPresets = (function () {
  "use strict";

  var AppState = window.AppState;
  var REVIEW = window.DOMAIN_REVIEW;

  function fillRequiredFields(state) {
    var outcome = AppState.currentOutcome();
    if (!outcome) return;
    state.review.fields = AppState.defaultFields(outcome.id);
    outcome.fields.forEach(function (fieldId) {
      var field = REVIEW.fields[fieldId];
      if (field.type === "checkbox") return;      // 勾选项已有默认值
      state.review.fields[fieldId] = field.options[0].id;
    });
  }

  function pickDivergentOutcome() {
    var suggestion = AppState.suggestedOutcome();
    var other = REVIEW.outcomes.filter(function (o) {
      return !suggestion || o.id !== suggestion.id;
    })[0];
    if (!other) throw new Error("[DevPresets] 领域包只有一条结论，构造不出分歧态");
    return other;
  }

  // 每个 preset 都从默认态出发叠加，不互相继承——继承会让"改一个 preset 顺带改坏
  // 另一个"这种事发生在只有开发者会用的代码里，没人会注意到。
  var PRESETS = {
    "workbench": function () {},

    "agent": function (state) {
      state.agent = { open: true, contextId: "workbench", questionId: "", phase: "idle" };
    },

    "trend": function (state) {
      state.detail = "trend";
      state.pick.trend.pointId = AppState.primaryPoint(state.focus.partId).id;
    },

    "vision": function (state) {
      state.detail = "vision";
      state.pick.vision.frameId = AppState.currentFrameOf(state.focus.partId).id;
    },

    "review-empty": function (state) {
      state.scene = "review";
    },

    "review-accept": function (state) {
      state.scene = "review";
      state.review.vote = "accept";
      var suggestion = AppState.suggestedOutcome();
      if (suggestion) state.review.outcomeId = suggestion.id;
      fillRequiredFields(state);
    },

    "review-divergent": function (state) {
      state.scene = "review";
      state.review.vote = "reject";
      state.review.outcomeId = pickDivergentOutcome().id;
      fillRequiredFields(state);
      state.review.note = "";        // 刻意留空：这正是"分歧必填理由"要展示的那一态
    },

    "executed": function (state) {
      PRESETS["review-accept"](state);
      state.review.note = "占位复核意见：现场已确认，按处置流程执行。";
      state.review.executed = true;
    },

    "retest-failed": function (state) {
      PRESETS["executed"](state);
      state.review.executed = false;
      state.review.retestPassed = false;
      state.scene = "review";
    },

    "archive": function (state) {
      PRESETS["executed"](state);
      state.review.retestPassed = true;
      state.scene = "archive";
    },

    "archived": function (state) {
      PRESETS["archive"](state);
      state.archived = true;
    },

    "knowledge": function (state) {
      state.scene = "knowledge";
    },

    "knowledge-archived": function (state) {
      PRESETS["archived"](state);
      state.scene = "knowledge";
      state.pick.knowledge.categoryId = window.DOMAIN_KB.archiveTarget().categoryId;
    }
  };

  function presetNames() {
    return Object.keys(PRESETS);
  }

  function readHash() {
    var match = /(?:^|[#&])preset=([A-Za-z0-9-]+)/.exec(window.location.hash || "");
    return match ? match[1] : null;
  }

  // 返回是否应用了 preset，供 boot.js 决定要不要落盘（preset 状态**不落盘**：
  // 打磨完刷掉 hash 就该回到正常演示状态，不该在演示机上留下一份被改过的状态）。
  function applyFromHash() {
    var name = readHash();
    if (!name) return false;
    var apply = PRESETS[name];
    if (!apply) {
      throw new Error("[DevPresets] 未知 preset：" + name + "，可用：" + presetNames().join(" / "));
    }
    var state = AppState.value;
    var fresh = AppState.defaultStateForTest();
    Object.keys(state).forEach(function (key) { delete state[key]; });
    Object.keys(fresh).forEach(function (key) { state[key] = fresh[key]; });
    apply(state);
    return true;
  }

  return { applyFromHash: applyFromHash, presetNames: presetNames, PRESETS: PRESETS };
})();
