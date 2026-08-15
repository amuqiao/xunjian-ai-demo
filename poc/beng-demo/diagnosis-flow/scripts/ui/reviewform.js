// UI 组件：人工介入区（本 POC 唯一真正新写的复杂组件）。
//
// ---- 四层，缺一层这一页就退化成"按部就班点三个按钮" ----
//   L0 表决    对 AI 结论的采纳 / 修正 / 驳回。讲"AI 不是判决者"。
//   L1 结论    排他单选，驱动整个分支状态机。
//   L2 结构化  随结论动态换的下拉 + 勾选。讲"人的判断有结构，能被系统消费"。
//   L3 自由文本 真输入框 + 常用语快捷追加。讲"系统不限制专家表达"。
//
// ---- 关键不在形态而在后果 ----
// 只给选项 = 按部就班；只给输入框 = 现场没人愿意当众打字，会尬住。所以两者都要，
// 而真正让这一页站得住的是三个机关：
//   1. 分歧时 L3 变必填，不填则执行按钮不可用（见 AppState.canExecute）
//   2. L3 的原文逐字进报告（见 scenes/archive.js 的 {{reviewNote}} 插槽）
//   3. 执行屏的复测可以退回本页（见 boot.js 的 retestFail）
//
// 组件只产出 DOM，不绑事件、不改状态——所有变更走 data-action 由 boot.js 分发。
(function () {
  "use strict";

  var REVIEW = window.DOMAIN_REVIEW;
  var AppState = window.AppState;

  function sectionHead(index, title, meta) {
    return h("div", { class: "panel-title rv-section-head" }, [
      h("span", { class: "rv-section-title" }, [
        h("span", { class: "rv-step-index", "aria-hidden": "true", text: index }),
        h("span", { text: title })
      ]),
      h("small", { text: meta })
    ]);
  }

  // ---------------------------------------------------------------- L0 表决

  function renderVotes(state) {
    var suggestion = AppState.suggestedOutcome();
    var item = AppState.currentCase();
    return h("div", { class: "rv-vote-block" }, [
      h("div", { class: "rv-vote-head" }, [
        h("span", { class: "rv-vote-kicker", text: "AI 建议" }),
        h("strong", { text: suggestion ? suggestion.label : "本条记录没有模型判读" }),
        item ? window.ConfidenceBar.render(item) : null
      ]),
      h("div", { class: "rv-vote-options", role: "group", "aria-label": "对 AI 结论的表决" },
        REVIEW.votes.map(function (vote) {
          var active = state.review.vote === vote.id;
          return h("button", {
            type: "button",
            class: "rv-vote " + vote.id + (active ? " active" : ""),
            "aria-pressed": active ? "true" : "false",
            disabled: suggestion ? null : "disabled",
            title: vote.hint,
            dataset: { action: "review-vote", voteId: vote.id, focusKey: "vote:" + vote.id }
          }, [
            h("strong", { text: vote.label }),
            h("small", { text: vote.hint })
          ]);
        }))
    ]);
  }

  // ---------------------------------------------------------------- L1 结论

  function renderOutcomes(state) {
    // 未表决前 L1 是灰的：这一页的顺序是"先对 AI 表态，再下自己的结论"，直接跳到
    // 选结论会让 L0 变成可有可无的装饰。
    var pending = state.review.vote === "";
    var current = AppState.currentOutcome();
    return h("div", {
      class: "rv-outcome-block" + (pending ? " pending" : ""),
      "aria-disabled": pending ? "true" : "false"
    }, [
      h("div", { class: "rv-outcome-options", role: "group", "aria-label": "复核结论" },
        REVIEW.outcomes.map(function (outcome) {
          var active = state.review.outcomeId === outcome.id;
          return h("button", {
            type: "button",
            class: "rv-outcome" + (active ? " active" : ""),
            "aria-pressed": active ? "true" : "false",
            dataset: { action: "select-outcome", outcomeId: outcome.id, focusKey: "outcome:" + outcome.id }
          }, [
            h("span", { class: "rv-outcome-radio", "aria-hidden": "true" }),
            h("span", {}, [
              h("strong", { text: outcome.label }),
              h("small", { text: outcome.hint })
            ])
          ]);
        })),
      // impact 只在选中后出现：hint 说的是"选了会怎样"，impact 说的是"选了之后不会
      // 怎样、和另外几条互斥"，帮专家确认这是一次排他选择而不是可叠加的多选。
      current ? h("p", { class: "rv-outcome-impact", text: current.impact }) : null
    ]);
  }

  // ---------------------------------------------------------------- L2 结构化

  function renderSelectField(state, fieldId, field) {
    var value = state.review.fields[fieldId];
    var missing = field.required && (typeof value !== "string" || value === "");
    return h("label", { class: "rv-field" + (missing ? " missing" : "") }, [
      h("span", { class: "rv-field-label" }, [
        h("span", { text: field.label }),
        field.required ? h("i", { class: "rv-required", "aria-label": "必填", text: "*" }) : null
      ]),
      h("select", {
        class: "rv-select",
        dataset: { action: "set-field", fieldId: fieldId, focusKey: "field:" + fieldId }
      }, [h("option", { value: "", text: "请选择", selected: value === "" ? "selected" : null })].concat(
        field.options.map(function (option) {
          return h("option", {
            value: option.id,
            selected: value === option.id ? "selected" : null,
            text: option.label
          });
        })
      ))
    ]);
  }

  function renderCheckboxField(state, fieldId, field) {
    var picked = state.review.fields[fieldId] || [];
    return h("div", { class: "rv-field rv-field-checks" }, [
      h("span", { class: "rv-field-label" }, [
        h("span", { text: field.label }),
        field.required ? h("i", { class: "rv-required", "aria-label": "必填", text: "*" }) : null
      ]),
      h("div", { class: "rv-check-row", role: "group", "aria-label": field.label },
        field.options.map(function (option) {
          var on = picked.indexOf(option.id) >= 0;
          return h("button", {
            type: "button",
            class: "rv-check" + (on ? " on" : ""),
            "aria-pressed": on ? "true" : "false",
            dataset: {
              action: "toggle-flag", fieldId: fieldId, optionId: option.id,
              focusKey: "flag:" + fieldId + ":" + option.id
            }
          }, [
            h("span", { class: "rv-check-box", "aria-hidden": "true", text: on ? "✓" : "" }),
            h("span", { text: option.label })
          ]);
        }))
    ]);
  }

  function renderFields(state) {
    var outcome = AppState.currentOutcome();
    if (!outcome) return null;
    return h("div", { class: "rv-fields-block" }, outcome.fields.map(function (fieldId) {
      var field = REVIEW.fields[fieldId];
      if (!field) throw new Error("[ReviewForm] 结论引用了未声明的字段：" + fieldId);
      return field.type === "checkbox"
        ? renderCheckboxField(state, fieldId, field)
        : renderSelectField(state, fieldId, field);
    }));
  }

  // ---------------------------------------------------------------- 分歧

  function renderDivergence(state) {
    if (!AppState.isDivergent()) return null;
    return h("div", { class: "rv-divergence", role: "status", dataset: { gate: "divergence" } }, [
      h("strong", { text: "⚠ " + REVIEW.divergence.badgeText }),
      h("span", { text: REVIEW.divergence.noteHint })
    ]);
  }

  // ---------------------------------------------------------------- L3 文本

  function renderNote(state) {
    if (!AppState.currentOutcome()) return null;
    var required = AppState.noteRequired();
    return h("div", { class: "rv-note-block" + (required ? " required" : "") }, [
      h("div", { class: "rv-note-head" }, [
        h("span", { text: "复核意见" }),
        required ? h("i", { class: "rv-required", text: "* 必填" }) : h("small", { class: "muted", text: "选填" })
      ]),
      h("textarea", {
        class: "rv-note",
        rows: 3,
        placeholder: REVIEW.notePlaceholder,
        // 输入不走 render()，只写 state + 定点刷新闸门——每敲一个字整屏重渲染会丢光标。
        dataset: { action: "input-note", focusKey: "review-note" },
        text: state.review.note
      }),
      // 常用语：演示现场没人愿意当众打字，点两下就能凑出一句话；输入框本身仍是真的。
      h("div", { class: "rv-phrases", role: "group", "aria-label": "常用语" },
        REVIEW.phrases.map(function (phrase, i) {
          return h("button", {
            type: "button",
            class: "rv-phrase",
            dataset: { action: "append-phrase", phrase: phrase, focusKey: "phrase:" + i },
            text: phrase
          });
        }))
    ]);
  }

  // ---------------------------------------------------------------- 组装

  function render() {
    var state = AppState.value;
    return h("section", { class: "panel rv-panel" }, [
      sectionHead("②", "人工介入", AppState.currentReviewer().name),
      renderVotes(state),
      renderOutcomes(state),
      renderFields(state),
      renderDivergence(state),
      renderNote(state)
    ]);
  }

  window.ReviewForm = { render: render, sectionHead: sectionHead };
})();
