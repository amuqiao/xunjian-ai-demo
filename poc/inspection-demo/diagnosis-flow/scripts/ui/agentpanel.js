// UI 组件：Agent 对话浮层。三个上下文（工作台 / 复核 / 知识库）共用这一个组件，
// 只换 contextId —— 组件本身不认识任何业务概念。
//
// ---- 为什么一定要做"未命中"态 ----
// 全命中反而假。hit:false 的问题让 Agent 明说"知识库暂无直接依据，以下为模型推断，
// 建议人工确认"——既真实，又顺势把"所以下一步要人工复核"讲出来。契约强制每个上下文
// 至少有一条未命中（见 scripts/schema.js）。
//
// ---- 输入框保留但收敛 ----
// 可以打字，任何非预设输入统一回 fallbackAnswer。诚实，而且现场有人抢键盘时不会翻车。
//
// ---- unlockedBy ----
// 标了 unlockedBy:"archived" 的问题在归档完成前不出现，归档后才冒出来——它承载
// 二次命中包袱在 Agent 这一侧的体现。
(function () {
  "use strict";

  var AppState = window.AppState;
  var AGENTQA = window.DOMAIN_AGENTQA;

  function contextById(contextId) {
    var found = null;
    AGENTQA.contexts.forEach(function (context) {
      if (context.id === contextId) found = context;
    });
    if (!found) throw new Error("[AgentPanel] 未知上下文：" + contextId);
    return found;
  }

  function visibleQuestions(context) {
    var archived = AppState.value.archived;
    return context.questions.filter(function (question) {
      if (question.unlockedBy === "archived") return archived;
      return true;
    });
  }

  function renderQuestionList(context, activeId) {
    return h("div", { class: "ag-questions", role: "group", "aria-label": "预设问题" },
      visibleQuestions(context).map(function (question) {
        var active = question.id === activeId;
        return h("button", {
          type: "button",
          class: "ag-question" + (active ? " active" : "") + (question.hit ? "" : " miss"),
          "aria-pressed": active ? "true" : "false",
          dataset: { action: "select-agent-question", agentQuestionId: question.id, focusKey: "aq:" + question.id },
          text: question.label
        });
      }));
  }

  function renderHits(question) {
    if (!question.hit) {
      return h("div", { class: "ag-miss" }, [
        h("strong", { text: "✖ 知识库暂无直接依据" }),
        h("span", { text: "以上为模型基于现有特征的推断，建议由人工确认后再采用。" })
      ]);
    }
    return h("div", { class: "ag-hits" }, [
      h("strong", { class: "ag-hits-title", text: "命中依据" }),
      h("div", { class: "ag-hit-list" }, question.hits.map(function (hit) {
        return h("button", {
          type: "button",
          class: "ag-hit " + hit.kind,
          // 命中卡可点：跳到知识库并定位到具体那一段。这样"引用不是贴标签，是真指到
          // 某一段"才立得住。
          dataset: {
            action: "open-doc-chunk",
            docId: hit.docId,
            chunkIndex: String(hit.chunkIndex),
            focusKey: "hit:" + hit.docId + ":" + hit.chunkIndex
          }
        }, [
          h("span", { class: "ag-hit-check", "aria-hidden": "true", text: "✔" }),
          h("span", { class: "ag-hit-text", text: hit.text }),
          h("span", { class: "ag-hit-go", "aria-hidden": "true", text: "→" })
        ]);
      }))
    ]);
  }

  function questionSkillOptions(question) {
    if (!Object.prototype.hasOwnProperty.call(question, "skillOptions")) return [];
    if (!Array.isArray(question.skillOptions)) {
      throw new Error("[AgentPanel] skillOptions 必须是数组：" + question.id);
    }
    return question.skillOptions;
  }

  function normalizeSkillOption(option, index, questionId) {
    if (!option || typeof option.id !== "string" || typeof option.label !== "string" || typeof option.enhancedAnswer !== "string") {
      throw new Error("[AgentPanel] 非法的 skillOptions[" + index + "]：" + questionId);
    }
    return option;
  }

  function activeSkillOption(question, skillId) {
    if (!skillId) return null;
    var options = questionSkillOptions(question);
    for (var i = 0; i < options.length; i += 1) {
      var option = normalizeSkillOption(options[i], i, question.id);
      if (option.id === skillId) return option;
    }
    return null;
  }

  function renderSkillOptions(question, skillId) {
    var options = questionSkillOptions(question);
    if (!options.length) return null;

    return h("div", { class: "ag-skill-picker", role: "group", "aria-label": "可选 Skill" }, [
      h("strong", { class: "ag-skill-picker-title", text: "可选 Skill" }),
      h("div", { class: "ag-skill-chip-list" }, options.map(function (item, index) {
        var option = normalizeSkillOption(item, index, question.id);
        var active = option.id === skillId;

        return h("button", {
          type: "button",
          class: "ag-skill-chip" + (active ? " active" : ""),
          "aria-pressed": active ? "true" : "false",
          dataset: {
            action: "select-agent-skill",
            agentSkillId: option.id,
            focusKey: "skill:" + option.id
          },
          text: option.label
        });
      }))
    ]);
  }

  // 对话区是浮层里唯一随状态变化的部分。它被包在 [data-agent-thread] 里，refreshAgent()
  // 只替换这一块——浮层外壳原地不动，淡入动画不会重播。
  function renderThread(context, state) {
    var questionId = state.agent.questionId;
    var phase = state.agent.phase;

    if (!questionId && phase === "idle") {
      return h("div", { class: "ag-thread empty" }, [
        h("p", { class: "muted", text: context.emptyText })
      ]);
    }

    var question = questionId
      ? visibleQuestions(context).filter(function (q) { return q.id === questionId; })[0]
      : null;
    if (questionId && !question) {
      throw new Error("[AgentPanel] 找不到问题：" + questionId + "（上下文 " + context.id + "）");
    }

    var askText = question ? question.question : (state.agent.freeText || "（自由输入）");
    var thinkingText = question ? question.thinkingText : "正在检索知识库…";
    var skill = question ? activeSkillOption(question, state.agent.skillId) : null;
    var answerText = question ? (skill ? skill.enhancedAnswer : question.answer) : context.fallbackAnswer;

    return h("div", { class: "ag-thread", "aria-live": "polite" }, [
      h("div", { class: "ag-turn ag-turn-user" }, [
        h("span", { class: "ag-role", text: "我" }),
        h("p", { text: askText })
      ]),
      h("div", { class: "ag-turn ag-turn-agent" }, [
        h("span", { class: "ag-role", text: "Agent" }),
        phase === "thinking"
          ? h("p", { class: "ag-thinking" }, [
            h("i", { class: "ag-dots", "aria-hidden": "true" }, [h("b", {}), h("b", {}), h("b", {})]),
            h("span", { text: thinkingText })
          ])
          : h("div", { class: "ag-answer" }, [
            question ? renderSkillOptions(question, state.agent.skillId) : null,
            h("div", { class: "ag-answer-card" + (skill ? " enhanced" : "") }, [
              h("div", { class: "ag-answer-head" }, [
                h("strong", { class: "ag-answer-title", text: skill ? "增强回答" : "基础回答" }),
                skill ? h("span", { class: "ag-answer-skill", text: skill.label }) : null
              ]),
              h("p", { class: "ag-answer-text", text: answerText })
            ]),
            question ? renderHits(question) : null
          ])
      ])
    ]);
  }

  function render() {
    var state = AppState.value;
    if (!state.agent.open) return null;
    var context = contextById(state.agent.contextId);

    return window.Overlay.render({
      open: true,
      title: context.entryTitle + " · " + context.kicker,
      kicker: context.summary,
      body: [
        h("div", { class: "ag-grid" }, [
          h("div", { class: "ag-side" }, [
            h("p", { class: "ag-side-title", text: "预设问题" }),
            renderQuestionList(context, state.agent.questionId),
            h("div", { class: "ag-input-row" }, [
              h("input", {
                class: "ag-input",
                type: "text",
                value: state.agent.freeText,
                placeholder: "也可以直接输入问题…",
                "aria-label": "自由输入问题",
                dataset: { focusKey: "agent-input" }
              }),
              h("button", {
                type: "button",
                class: "plain-button",
                dataset: { action: "submit-agent-input" },
                text: "提问"
              })
            ])
          ]),
          h("div", { class: "ag-thread-host", dataset: { agentThread: "1" } }, [
            renderThread(context, state)
          ])
        ])
      ],
      actions: [],
      onCloseAction: "close-agent",
      key: "agent",
      wide: true,
      panelClass: "ag-overlay"
    });
  }

  // 定点刷新：只换对话区 + 更新问题按钮的选中态，浮层外壳一动不动。
  // 与 scenes/review.js 的 refreshReviewGates 同一种模式——凡是"动画或高频交互驱动的
  // 局部变化"，一律走定点刷新，不走整屏 render()。
  function refreshAgent() {
    var state = AppState.value;
    if (!state.agent.open) return;
    var host = document.querySelector("[data-agent-thread]");
    if (!host) return;
    var context = contextById(state.agent.contextId);
    var active = document.activeElement;
    var focusKey = (active && active.dataset) ? active.dataset.focusKey : "";

    host.innerHTML = "";
    host.appendChild(renderThread(context, state));

    document.querySelectorAll(".ag-question").forEach(function (button) {
      var active = button.dataset.agentQuestionId === state.agent.questionId;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });

    var input = document.querySelector(".ag-input");
    if (input && input.value !== state.agent.freeText) input.value = state.agent.freeText;

    if (focusKey) {
      var nextFocus = document.querySelector('[data-focus-key="' + focusKey + '"]');
      if (nextFocus) nextFocus.focus();
    }
  }

  window.AgentPanel = { render: render, visibleQuestions: visibleQuestions, contextById: contextById };

  window.Scenes = window.Scenes || {};
  window.Scenes.renderAgentOverlay = render;
  window.Scenes.refreshAgent = refreshAgent;
})();
