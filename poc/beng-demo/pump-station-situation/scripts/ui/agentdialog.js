// 静态 Agent 问答弹窗组件：组合 Overlay + 预设问答 + 命中文档标签。
// 本组件只消费调用方传入的数据，不读取 DemoData/AppState，不接真实检索和文档跳转。
(function () {
  "use strict";

  var HIT_KINDS = ["current", "standard", "metric", "workcard", "rule", "case", "report"];

  function assertNonEmptyString(value, name) {
    if (typeof value !== "string" || value === "") {
      throw new Error(name + " 必须是非空字符串");
    }
  }

  function assertBoolean(value, name) {
    if (typeof value !== "boolean") {
      throw new Error(name + " 必须是布尔值");
    }
  }

  function assertArray(value, name) {
    if (!Array.isArray(value)) {
      throw new Error(name + " 必须是数组");
    }
  }

  function questionById(dialog, questionId) {
    var found = null;
    dialog.questions.forEach(function (item) {
      if (item.id === questionId) found = item;
    });
    return found;
  }

  function assertHit(hit) {
    assertNonEmptyString(hit.text, "AgentDialog questions[].hits[].text");
    assertNonEmptyString(hit.kind, "AgentDialog questions[].hits[].kind");
    if (HIT_KINDS.indexOf(hit.kind) < 0) {
      throw new Error("AgentDialog questions[].hits[].kind 非法：" + hit.kind + "，应为 " + HIT_KINDS.join("/"));
    }
  }

  function assertQuestion(question) {
    assertNonEmptyString(question.id, "AgentDialog questions[].id");
    assertNonEmptyString(question.label, "AgentDialog questions[].label");
    assertNonEmptyString(question.answer, "AgentDialog questions[].answer");
    assertArray(question.hits, "AgentDialog questions[].hits");
    question.hits.forEach(assertHit);
  }

  function assertDialog(dialog) {
    if (!dialog || typeof dialog !== "object") throw new Error("AgentDialog 的 dialog 必须是对象");
    assertNonEmptyString(dialog.id, "AgentDialog dialog.id");
    assertNonEmptyString(dialog.title, "AgentDialog dialog.title");
    assertNonEmptyString(dialog.kicker, "AgentDialog dialog.kicker");
    assertNonEmptyString(dialog.summary, "AgentDialog dialog.summary");
    assertNonEmptyString(dialog.emptyText, "AgentDialog dialog.emptyText");
    assertArray(dialog.questions, "AgentDialog dialog.questions");
    if (!dialog.questions.length) throw new Error("AgentDialog dialog.questions 不能为空");
    dialog.questions.forEach(assertQuestion);
  }

  function renderQuestionButton(question, activeQuestionId) {
    return h("button", {
      type: "button",
      class: "agent-dialog-question" + (question.id === activeQuestionId ? " active" : ""),
      dataset: { action: "select-agent-question", agentQuestionId: question.id },
      "aria-pressed": question.id === activeQuestionId ? "true" : "false",
      text: question.label
    });
  }

  function renderHits(hits) {
    return h("div", { class: "agent-dialog-hits", "aria-label": "命中文档" }, hits.map(function (hit) {
      return h("span", { class: "agent-dialog-hit " + hit.kind, text: hit.text });
    }));
  }

  function renderAnswer(dialog, activeQuestion) {
    if (!activeQuestion) {
      return h("div", { class: "agent-dialog-answer empty", "aria-live": "polite" }, [
        h("span", { class: "agent-dialog-role", text: "Agent" }),
        h("p", { text: dialog.emptyText })
      ]);
    }
    return h("div", { class: "agent-dialog-answer", "aria-live": "polite" }, [
      h("span", { class: "agent-dialog-role", text: "Agent" }),
      h("p", { text: activeQuestion.answer }),
      h("strong", { class: "agent-dialog-hit-title", text: "命中文档" }),
      renderHits(activeQuestion.hits)
    ]);
  }

  function render(options) {
    options = options || {};
    assertBoolean(options.open, "AgentDialog 的 open");
    assertDialog(options.dialog);
    if (typeof options.activeQuestionId !== "string") {
      throw new Error("AgentDialog 的 activeQuestionId 必须是字符串");
    }
    assertNonEmptyString(options.onCloseAction, "AgentDialog 的 onCloseAction");

    var activeQuestion = options.activeQuestionId ? questionById(options.dialog, options.activeQuestionId) : null;
    if (options.activeQuestionId && !activeQuestion) {
      throw new Error("AgentDialog 找不到问题：" + options.activeQuestionId + "（dialog=" + options.dialog.id + "）");
    }

    return window.Overlay.render({
      open: options.open,
      title: options.dialog.title,
      kicker: options.dialog.kicker,
      body: [
        h("p", { class: "agent-dialog-summary", text: options.dialog.summary }),
        h("div", { class: "agent-dialog-grid" }, [
          h("div", { class: "agent-dialog-questions", role: "group", "aria-label": "预设问题" },
            options.dialog.questions.map(function (question) {
              return renderQuestionButton(question, options.activeQuestionId);
            })
          ),
          renderAnswer(options.dialog, activeQuestion)
        ])
      ],
      actions: [],
      onCloseAction: options.onCloseAction,
      panelClass: "agent-dialog"
    });
  }

  window.AgentDialog = {
    render: render
  };
})();
