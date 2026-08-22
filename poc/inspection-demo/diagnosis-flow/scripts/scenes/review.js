// 场景：人工复核。演示重点是"AI 给出摘要，人只确认业务结论"。
//
// 主页面只保留 AI 摘要和人工确认面板。证据看详情，报告看弹窗；不做完成态页面，
// 不把真实项目里的完整闭环流程塞进 demo。
(function () {
  "use strict";

  var AppState = window.AppState;
  var META = window.DOMAIN_META;
  var REVIEW = window.DOMAIN_REVIEW;
  var REPORT = window.DOMAIN_REPORT;
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

  function renderAiSummary() {
    var record = AppState.currentRecord();
    var item = AppState.currentCase();
    var outcome = AppState.suggestedOutcome();
    return h("section", { class: "panel rv-ai-summary" }, [
      AppState.panelTitle("AI 摘要", record.no ? "第 " + record.no + " 项" : "当前巡检记录"),
      h("article", { class: "rv-summary-card" }, [
        h("div", { class: "rv-summary-head" }, [
          h("span", { text: "AI 建议" }),
          h("strong", { text: outcome ? outcome.label : "未匹配建议" })
        ]),
        h("div", { class: "rv-summary-score" }, [
          h("span", { text: "置信度" }),
          h("strong", { text: item ? String(item.confidence) + "%" : "--" })
        ]),
        h("p", { class: "rv-summary-text", text: item ? item.summary : "本条记录没有模型判读，需人工直接判定。" })
      ]),
      h("dl", { class: "rv-summary-points" }, [
        h("dt", { text: "巡检项" }), h("dd", { text: record.item }),
        h("dt", { text: "当前读数" }), h("dd", { text: record.result || "未填写" })
      ])
    ]);
  }

  function firstTreatmentOutcome() {
    var found = REVIEW.outcomes.filter(function (outcome) { return outcome.track === "treatment"; })[0];
    if (!found) throw new Error("[review] 缺少处置型复核结论");
    return found;
  }

  function rejectOutcome() {
    var found = REVIEW.outcomes.filter(function (outcome) { return outcome.id === "reject"; })[0];
    if (!found) throw new Error("[review] 缺少 reject 复核结论");
    return found;
  }

  function voteTitle(vote) {
    var suggestion = AppState.suggestedOutcome();
    if (vote.id === "accept") return suggestion ? "按 AI 结论归档" : "无 AI 结论";
    if (vote.id === "revise") {
      if (!suggestion || suggestion.id === "reject") return "人工转处置";
      if (suggestion.track === "treatment") return suggestion.label;
      return firstTreatmentOutcome().label;
    }
    if (vote.id === "reject") return rejectOutcome().label;
    throw new Error("[review] 未知表决按钮：" + vote.id);
  }

  function voteHint(vote) {
    var suggestion = AppState.suggestedOutcome();
    if (vote.id === "accept") return suggestion ? "采用建议，直接生成报告" : "当前记录无模型建议";
    if (vote.id === "revise") {
      if (!suggestion) return "人工选择处置路径";
      if (suggestion.id === "reject") return "推翻误报建议，进入处置路径";
      if (suggestion.track === "treatment") return "补充人工意见后生成报告";
      return "推翻观察建议，转入处置复核";
    }
    if (vote.id === "reject") return "记录为误报样本";
    throw new Error("[review] 未知表决说明：" + vote.id);
  }

  function renderReviewConclusion() {
    return h("div", { class: "rv-review-block rv-review-conclusion" }, [
      h("div", { class: "rv-block-head" }, [
        h("span", { text: "人工结论" }),
        h("strong", { text: AppState.currentOutcome() ? AppState.currentOutcome().label : "待确认" })
      ]),
      h("div", { class: "rv-decision-votes" }, REVIEW.votes.map(renderDecisionVote))
    ]);
  }

  function renderDecisionVote(vote) {
    var state = AppState.value;
    var active = state.review.vote === vote.id;
    var disabled = vote.id === "accept" && !AppState.suggestedOutcome();
    return h("button", {
      type: "button",
      class: "rv-decision-vote" + (active ? " active" : ""),
      "aria-pressed": active ? "true" : "false",
      disabled: disabled ? "disabled" : null,
      dataset: { action: "review-vote", voteId: vote.id, focusKey: "vote:" + vote.id }
    }, [
      h("strong", { text: voteTitle(vote) }),
      h("span", { text: voteHint(vote) })
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
        required ? h("i", { class: "rv-required", text: "* 必填" }) : h("small", { class: "muted", text: "自动生成，可改" })
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
      renderAiSummary(),
      h("section", { class: "panel rv-review-confirm" }, [
        AppState.panelTitle("人工确认", AppState.currentReviewer().name),
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

  function reportSectionsById() {
    var out = {};
    ReportModel.sections().forEach(function (section) {
      out[section.id] = section;
    });
    return out;
  }

  function renderReportDigest() {
    var sections = reportSectionsById();
    var items = [
      { title: "异常", section: sections.finding },
      { title: "依据", section: sections.evidence },
      { title: "人工结论", section: sections.review },
      { title: "入库去向", section: sections.archive }
    ];
    return h("div", { class: "rv-report-digest" }, items.map(function (item) {
      if (!item.section) throw new Error("[review] 报告摘要缺少段落：" + item.title);
      return h("article", { class: "rv-report-digest-card" }, [
        h("span", { text: item.title }),
        h("p", { text: item.section.text })
      ]);
    }));
  }

  function reportRetestStatus(outcome) {
    var state = AppState.value;
    if (!outcome.retest.enable) return null;
    var passed = state.review.retestPassed === true;
    return h("div", { class: "rv-report-retest" + (passed ? " passed" : "") }, [
      h("strong", { text: passed ? "复测已通过" : "需要复测确认" }),
      h("span", {
        text: passed
          ? "处置结果已完成确认，可以归档到知识库。"
          : "处置型结论先确认复测，再归档为可复用案例。"
      })
    ]);
  }

  function reportActions(outcome) {
    var needsRetest = outcome.retest.enable && AppState.value.review.retestPassed !== true;
    var actions = [
      { text: "返回修改", action: "close-report-archive" },
      { text: "查看完整报告", href: REPORT.previewPdf.src }
    ];
    if (needsRetest) {
      actions.push({ text: outcome.retest.failLabel, action: "retest-fail" });
      actions.push({ text: outcome.retest.passLabel, action: "retest-pass", primary: true });
    } else {
      actions.push({ text: "归档到知识库", action: "archive-report", primary: true });
    }
    return actions;
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
        reportRetestStatus(outcome),
        h("p", { class: "rv-report-tip", text: "确认后写入知识库，并作为后续相似记录的命中依据。" }),
        renderReportDigest()
      ],
      actions: reportActions(outcome),
      onCloseAction: "close-report-archive",
      key: "review-report-archive:" + (outcome.retest.enable && state.review.retestPassed !== true ? "retest" : "ready"),
      panelClass: "rv-report-overlay"
    });
  }

  function renderReview() {
    return AppState.pageShell(
      "人工复核 / 结论确认",
      AppState.currentObject().label + " " + AppState.currentPart().label,
      renderReviewerChip(),
      renderConfirmPanel()
    );
  }

  function renderReviewCharts() {
    // 复核主页面不画图。证据统一从工作台 AI 判断浮层进入详情。
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
