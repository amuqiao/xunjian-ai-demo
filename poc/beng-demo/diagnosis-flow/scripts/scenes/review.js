// 场景：人工复核。演示重点是"AI 匹配集团既有票卡，人确认是否采用"。
//
// 主页面只保留票卡匹配和人工确认面板。证据看详情，报告看弹窗；不做完成态页面，
// 不把真实项目里的完整闭环流程塞进 demo。
(function () {
  "use strict";

  var AppState = window.AppState;
  var META = window.DOMAIN_META;
  var REVIEW = window.DOMAIN_REVIEW;
  var KB = window.DOMAIN_KB;
  var ReportModel = window.ReportModel;

  function renderReviewerChip() {
    var current = AppState.currentReviewer();
    return h("label", { class: "rv-identity" }, [
      h("span", { class: "rv-identity-label", text: "复核人" }),
      h("select", {
        class: "rv-identity-select",
        "aria-label": "选择复核人",
        dataset: { action: "select-reviewer", focusKey: "reviewer" }
      }, META.reviewers.map(function (reviewer) {
        return h("option", {
          value: reviewer.id,
          selected: reviewer.id === current.id ? "selected" : null,
          text: reviewer.name + "（" + reviewer.role + "）"
        });
      }))
    ]);
  }

  function evidenceOf(item, kind) {
    if (!item) return null;
    var matches = item.evidenceChain.filter(function (evidence) { return evidence.kind === kind; });
    if (matches.length > 1) throw new Error("[review] " + kind + " 依据不唯一");
    return matches[0] || null;
  }

  function ticketNo(outcome) {
    return outcome ? outcome.archive.caseIdTpl.replace("{{date}}", AppState.currentRecord().date) : "未匹配";
  }

  function renderEvidenceActions(item) {
    var series = evidenceOf(item, "series");
    var vision = evidenceOf(item, "vision");
    return h("div", { class: "rv-ticket-actions" }, [
      series ? h("button", {
        type: "button",
        class: "plain-button",
        dataset: {
          action: "open-evidence",
          evidenceKind: "series",
          pointId: series.pointId,
          focusKey: "review-evidence:series"
        },
        text: "时序证据"
      }) : null,
      vision ? h("button", {
        type: "button",
        class: "plain-button",
        dataset: {
          action: "open-evidence",
          evidenceKind: "vision",
          frameId: vision.frameId,
          focusKey: "review-evidence:vision"
        },
        text: "视觉证据"
      }) : null,
      h("button", {
        type: "button",
        class: "plain-button",
        dataset: { action: "open-agent", agentContext: "review", focusKey: "review-agent" },
        text: "问 Agent"
      })
    ]);
  }

  function renderTicketCard() {
    var record = AppState.currentRecord();
    var part = AppState.partById(record.partId);
    var item = AppState.currentCase();
    var outcome = AppState.suggestedOutcome();
    return h("section", { class: "panel rv-ticket-match" }, [
      AppState.panelTitle("AI 匹配票卡", record.no ? "第 " + record.no + " 项 · " + part.short : part.short),
      h("article", { class: "rv-ticket-card" }, [
        h("div", { class: "rv-ticket-card-head" }, [
          h("span", { text: "匹配票卡" }),
          h("strong", { text: outcome ? outcome.label : "未匹配票卡" })
        ]),
        h("div", { class: "rv-ticket-score" }, [
          h("span", { text: "置信度" }),
          h("strong", { text: item ? String(item.confidence) + "%" : "--" })
        ]),
        h("dl", { class: "rv-ticket-meta" }, [
          h("dt", { text: "票卡编号" }), h("dd", { text: ticketNo(outcome) }),
          h("dt", { text: "适用对象" }), h("dd", { text: AppState.currentObject().label + " · " + part.label }),
          h("dt", { text: "生成动作" }), h("dd", { text: outcome ? outcome.executeText : "待人工确认" })
        ]),
        h("p", { class: "rv-ticket-note", text: outcome ? outcome.impact : "AI 未匹配到可用票卡，需人工确认。" })
      ]),
      h("div", { class: "rv-ticket-record" }, [
        h("span", { text: "巡检项" }),
        h("strong", { text: record.item + " · " + (record.result || "未填写") })
      ]),
      renderEvidenceActions(item)
    ]);
  }

  function renderAiOpinion() {
    var item = AppState.currentCase();
    var suggestion = AppState.suggestedOutcome();
    return h("div", { class: "rv-review-block rv-ai-opinion" }, [
      h("div", { class: "rv-block-head" }, [
        h("span", { text: "AI 意见" }),
        h("strong", { text: suggestion ? suggestion.label : "未匹配" })
      ]),
      h("p", { text: item ? item.suggestion.text : "本条记录没有模型判读。" })
    ]);
  }

  function renderReviewConclusion() {
    return h("div", { class: "rv-review-block rv-review-conclusion" }, [
      h("div", { class: "rv-block-head" }, [
        h("span", { text: "人工复核结论" }),
        h("strong", { text: AppState.currentOutcome() ? AppState.currentOutcome().label : "待确认" })
      ]),
      h("div", { class: "rv-decision-votes" }, REVIEW.votes.map(renderDecisionVote))
    ]);
  }

  function renderDecisionVote(vote) {
    var state = AppState.value;
    var active = state.review.vote === vote.id;
    return h("button", {
      type: "button",
      class: "rv-decision-vote" + (active ? " active" : ""),
      "aria-pressed": active ? "true" : "false",
      dataset: { action: "review-vote", voteId: vote.id, focusKey: "vote:" + vote.id }
    }, [
      h("strong", { text: vote.label }),
      h("span", { text: vote.hint })
    ]);
  }

  function renderDivergence() {
    if (!AppState.isDivergent()) return null;
    return h("div", { class: "rv-divergence", role: "status", dataset: { gate: "divergence" } }, [
      h("strong", { text: REVIEW.divergence.badgeText }),
      h("span", { text: REVIEW.divergence.noteHint })
    ]);
  }

  function renderNote() {
    var required = AppState.noteRequired();
    return h("div", { class: "rv-review-block rv-confirm-note" + (required ? " required" : "") }, [
      h("div", { class: "rv-block-head" }, [
        h("span", { text: "复核意见" }),
        required ? h("i", { class: "rv-required", text: "* 分歧必填" }) : h("small", { class: "muted", text: "自动填充，可修改" })
      ]),
      h("textarea", {
        class: "rv-note",
        rows: 3,
        placeholder: REVIEW.notePlaceholder,
        dataset: { action: "input-note", focusKey: "review-note" },
        text: AppState.value.review.note
      }),
      h("div", { class: "rv-phrases", role: "group", "aria-label": "常用语" },
        REVIEW.phrases.slice(0, 3).map(function (phrase, i) {
          return h("button", {
            type: "button",
            class: "rv-phrase",
            dataset: { action: "append-phrase", phrase: phrase, focusKey: "phrase:" + i },
            text: phrase
          });
        }))
    ]);
  }

  function renderMissingHint() {
    var parts = [];
    if (!AppState.currentOutcome()) parts.push("请选择人工复核结论");
    if (AppState.noteRequired() && AppState.value.review.note.trim() === "") {
      parts.push("与 AI 匹配不一致，需要填写复核意见");
    }
    if (AppState.value.archived) parts.push("本轮报告已归档到知识库");
    return h("p", {
      class: "rv-gate-hint" + (parts.length ? "" : " hidden"),
      dataset: { gate: "hint" },
      text: parts.join("；")
    });
  }

  function renderConfirmPanel() {
    var archived = AppState.value.archived;
    return h("div", { class: "rv-review-page" }, [
      renderTicketCard(),
      h("section", { class: "panel rv-review-confirm" }, [
        AppState.panelTitle("人工确认", AppState.currentReviewer().name),
        renderAiOpinion(),
        renderReviewConclusion(),
        renderDivergence(),
        renderNote(),
        h("div", { class: "rv-confirm-footer" }, [
          renderMissingHint(),
          h("button", {
            type: "button",
            class: "primary-action rv-execute",
            disabled: (!AppState.canExecute() || archived) ? "disabled" : null,
            dataset: { action: "execute-review", gate: "execute", focusKey: "execute" },
            text: archived ? "已归档到知识库" : "生成报告"
          })
        ])
      ])
    ]);
  }

  function categoryById(categoryId) {
    var found = KB.categories().filter(function (category) { return category.id === categoryId; })[0];
    if (!found) throw new Error("[review] 归档分类不存在：" + categoryId);
    return found;
  }

  function renderReportSummary(outcome) {
    var reviewer = AppState.currentReviewer();
    var category = categoryById(outcome.archive.categoryId);
    return h("dl", { class: "rv-report-summary" }, [
      h("dt", { text: "报告标题" }), h("dd", { text: ReportModel.title() }),
      h("dt", { text: "人工结论" }), h("dd", { text: outcome.label }),
      h("dt", { text: "复核人" }), h("dd", { text: reviewer.name + "（" + reviewer.role + "）" }),
      h("dt", { text: "归档去向" }), h("dd", { text: category.title + " · " + ReportModel.caseId() })
    ]);
  }

  function renderReportPreview() {
    return h("div", { class: "rv-report-preview" }, ReportModel.sections().map(function (section) {
      return h("article", {
        class: "ar-section" + (section.human ? " human" : ""),
        dataset: { reportSectionId: section.id }
      }, [
        h("div", { class: "ar-section-head" }, [
          h("i", { class: "dot " + section.status, "aria-hidden": "true" }),
          h("strong", { text: section.title })
        ]),
        h("p", { text: section.text }),
        section.human ? h("small", { class: "ar-human-tag", text: "人工确认" }) : null
      ]);
    }));
  }

  function renderReportArchiveOverlay() {
    var state = AppState.value;
    if (!state.pick.reviewArchiveOpen || !state.review.executed) return null;
    var outcome = AppState.currentOutcome();
    if (!outcome) throw new Error("[review] 打开报告归档浮层时必须已选定结论");

    return window.Overlay.render({
      open: true,
      title: "报告预览",
      kicker: "由人工复核结果自动生成",
      body: [
        renderReportSummary(outcome),
        h("p", { class: "rv-report-tip", text: "确认后写入知识库。本页不跳转，后续可从顶部知识库查看归档结果。" }),
        renderReportPreview()
      ],
      actions: [
        { text: "返回修改", action: "close-report-archive" },
        { text: "归档到知识库", action: "archive-report", primary: true }
      ],
      onCloseAction: "close-report-archive",
      key: "review-report-archive",
      panelClass: "rv-report-overlay"
    });
  }

  function renderReview() {
    return AppState.pageShell(
      "人工复核 / AI 匹配票卡",
      AppState.currentObject().label + " " + AppState.currentPart().label,
      renderReviewerChip(),
      renderConfirmPanel()
    );
  }

  function renderReviewCharts() {
    // 复核主页面不画图。证据通过左侧票卡按钮进入详情。
  }

  function refreshReviewGates() {
    var button = document.querySelector('[data-gate="execute"]');
    if (button) button.disabled = !AppState.canExecute() || AppState.value.archived;

    var hint = document.querySelector('[data-gate="hint"]');
    if (!hint) return;
    var parts = [];
    if (!AppState.currentOutcome()) parts.push("请选择人工复核结论");
    if (AppState.noteRequired() && AppState.value.review.note.trim() === "") {
      parts.push("与 AI 匹配不一致，需要填写复核意见");
    }
    if (AppState.value.archived) parts.push("本轮报告已归档到知识库");
    hint.textContent = parts.join("；");
    hint.classList.toggle("hidden", parts.length === 0);
  }

  window.Scenes = window.Scenes || {};
  window.Scenes.renderReview = renderReview;
  window.Scenes.renderReviewCharts = renderReviewCharts;
  window.Scenes.renderReviewOverlays = function () { return [renderReportArchiveOverlay()]; };
  window.Scenes.refreshReviewGates = refreshReviewGates;
})();
