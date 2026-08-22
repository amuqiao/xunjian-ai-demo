// 场景：人工复核。这是主语从"AI 在组织证据"换成"人在做决定"的那一页。
//
// 主结构：① AI 匹配票卡（只读）② 人工介入（ReviewForm 四层）③ 处置路径。
// 执行之后（state.review.executed）整页切成执行屏——处置票卡 / 闭环卡 + 复测验收。
//
// ---- 这一页的三个机关 ----
// 1. 分歧必填理由：不填则执行按钮不可用（判据在 AppState.canExecute）
// 2. 复核意见原文进报告：本页只负责写 state.review.note，回显在 archive.js
// 3. 复测不通过可退回本页：executed 置回 false，结论和意见都保留
//
// 本文件不绑任何事件，全部走 data-action 交给 boot.js。
(function () {
  "use strict";

  var AppState = window.AppState;
  var META = window.DOMAIN_META;
  var KB = window.DOMAIN_KB;
  var ReportModel = window.ReportModel;

  // ---------------------------------------------------------------- 身份芯片

  // 复核人不是结论的附属字段，而是"谁在做这个决定"，所以它在页头而不在 ReviewForm
  // 的 L2 里。它的值会进报告的 {{reviewerName}} / {{reviewerRole}}。
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

  // ---------------------------------------------------------------- ① AI 匹配票卡

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
      }) : null
    ]);
  }

  function renderTicketCard() {
    var record = AppState.currentRecord();
    var part = AppState.partById(record.partId);
    var item = AppState.currentCase();
    var outcome = AppState.suggestedOutcome();
    return h("section", { class: "panel rv-ticket-match" }, [
      AppState.panelTitle("AI 匹配票卡", record.no ? "第 " + record.no + " 项 · " + part.short : part.short),
      h("article", { class: "rv-match-card" }, [
        h("div", { class: "rv-match-card-head" }, [
          h("span", { text: "匹配票卡" }),
          h("strong", { text: outcome ? outcome.label : "未匹配票卡" })
        ]),
        h("div", { class: "rv-match-score" }, [
          h("span", { text: "置信度" }),
          h("strong", { text: item ? String(item.confidence) + "%" : "--" })
        ]),
        h("dl", { class: "rv-match-meta" }, [
          h("dt", { text: "票卡编号" }), h("dd", { text: ticketNo(outcome) }),
          h("dt", { text: "适用对象" }), h("dd", { text: AppState.currentObject().label + " · " + part.label }),
          h("dt", { text: "生成动作" }), h("dd", { text: outcome ? outcome.executeText : "待人工确认" })
        ]),
        h("p", {
          class: "rv-match-note",
          text: outcome ? outcome.impact : "AI 未匹配到可用票卡，需人工确认。"
        })
      ]),
      h("div", { class: "rv-ticket-record" }, [
        h("span", { text: "巡检项" }),
        h("strong", { text: record.item + " · " + (record.result || "未填写") })
      ]),
      item ? h("p", { class: "rv-ticket-summary", text: item.summary }) : null,
      renderEvidenceActions(item)
    ]);
  }

  // ---------------------------------------------------------------- ③ 处置路径

  // 未选结论前：整段可见但变暗且不可交互，三条路径**平铺列出**，不暗示哪条是默认。
  // 步数用 steps.length 现算，不写"（6 步）"这类手数出来的字面量——改了数据就不符，
  // 而且不会报错。
  function renderPathPreview() {
    return h("div", { class: "rv-path-preview" }, [
      h("p", { class: "muted", text: "选择②的复核结论后，这里会展开对应的处置路径：" }),
      h("ul", { class: "rv-path-list" }, window.DOMAIN_REVIEW.outcomes.map(function (outcome) {
        return h("li", {
          text: outcome.label + " → " + outcome.steps.length + " 步：" + outcome.steps[outcome.steps.length - 1]
        });
      }))
    ]);
  }

  function renderMissingHint() {
    var missing = AppState.missingFields();
    var parts = [];
    if (missing.length) {
      parts.push("还需填写：" + missing.map(function (fieldId) {
        return window.DOMAIN_REVIEW.fields[fieldId].label;
      }).join("、"));
    }
    if (AppState.noteRequired() && AppState.value.review.note.trim() === "") {
      parts.push("与 AI 建议不一致，必须填写复核意见");
    }
    return h("p", {
      class: "rv-gate-hint" + (parts.length ? "" : " hidden"),
      dataset: { gate: "hint" },
      text: parts.join("；")
    });
  }

  function renderPathSteps(outcome) {
    return h("div", { class: "rv-path-body" }, [
      h("p", { class: "rv-path-label", text: outcome.label + " · " + outcome.steps.length + " 步" }),
      h("ol", { class: "rv-path-steps" }, outcome.steps.map(function (step) {
        return h("li", { text: step });
      })),
      renderMissingHint(),
      h("button", {
        type: "button",
        class: "primary-action rv-execute",
        disabled: AppState.canExecute() ? null : "disabled",
        dataset: { action: "execute-review", gate: "execute", focusKey: "execute" },
        text: outcome.executeText
      })
    ]);
  }

  function renderPath() {
    var outcome = AppState.currentOutcome();
    var pending = !outcome;
    return h("section", {
      class: "panel rv-path" + (pending ? " pending" : ""),
      "aria-disabled": pending ? "true" : "false"
    }, [
      window.ReviewForm.sectionHead("③", "处置路径", pending ? "待选择结论" : outcome.label),
      pending ? renderPathPreview() : renderPathSteps(outcome)
    ]);
  }

  // ---------------------------------------------------------------- 复测退回横幅

  function renderRetestBanner() {
    if (!AppState.retestFailed()) return null;
    return h("div", { class: "rv-retest-banner", role: "status" }, [
      h("strong", { text: "复测未通过，已退回复核" }),
      h("span", { text: "结论与复核意见都保留，可以维持原判，也可以改。" })
    ]);
  }

  function renderReviewAgentFab() {
    return h("button", {
      type: "button",
      class: "wb-agent-fab rv-agent-fab",
      title: "Agent 助手",
      "aria-label": "打开复核 Agent 助手",
      dataset: { action: "open-agent", agentContext: "review", focusKey: "review-agent" },
      text: "AI"
    });
  }

  // ---------------------------------------------------------------- 执行屏

  function renderExecuted() {
    var outcome = AppState.currentOutcome();
    var state = AppState.value;
    var retest = outcome.retest;
    var reportBlocked = retest.enable && state.review.retestPassed !== true;
    return AppState.pageShell(
      "处置闭环 / 执行",
      outcome.label,
      h("button", {
        type: "button",
        class: "primary-action",
        disabled: (reportBlocked || state.archived) ? "disabled" : null,
        dataset: { action: "go-archive" },
        text: state.archived ? "已归档到知识库" : "预览报告"
      }),
      h("div", { class: "rv-exec-grid" }, [
        h("section", { class: "panel rv-ticket" }, [
          AppState.panelTitle(META.terms.workOrder, outcome.executedText),
          h("div", { class: "rv-ticket-meta" }, [
            h("span", { text: "复核人 " + AppState.currentReviewer().name }),
            h("span", { text: AppState.currentReviewer().role })
          ].concat(outcome.fields.map(function (fieldId) {
            var field = window.DOMAIN_REVIEW.fields[fieldId];
            return h("span", { text: field.label + "：" + fieldValueText(fieldId) });
          }))),
          h("ol", { class: "rv-ticket-steps" }, outcome.steps.map(function (step) {
            return h("li", { text: step });
          }))
        ]),
        h("section", { class: "panel rv-exec-note" }, [
          AppState.panelTitle("复核意见", AppState.isDivergent() ? "与 AI 建议不一致" : "与 AI 建议一致"),
          h("p", { class: "rv-exec-note-body", text: state.review.note || "（未填写）" }),
          AppState.isDivergent()
            ? h("p", { class: "rv-exec-diverge", text: "本条意见将进入报告的分歧段，并作为模型反馈样本回流知识库。" })
            : null
        ]),
        renderRetestPanel(retest),
        renderReviewAgentFab()
      ])
    );
  }

  function fieldValueText(fieldId) {
    var field = window.DOMAIN_REVIEW.fields[fieldId];
    var value = AppState.value.review.fields[fieldId];
    if (field.type === "checkbox") {
      var picked = (value || []).map(function (optionId) {
        return field.options.filter(function (o) { return o.id === optionId; })[0].label;
      });
      return picked.length ? picked.join("、") : "无";
    }
    if (!value) return "未填写";
    return field.options.filter(function (o) { return o.id === value; })[0].label;
  }

  // 复测：这是 demo 里唯一的一条回头路。一条只能往前点的流程，观众一眼就知道是假的。
  function renderRetestPanel(retest) {
    var state = AppState.value;
    if (!retest.enable) {
      return h("aside", { class: "panel rv-retest" }, [
        AppState.panelTitle("闭环确认", "无复测环节"),
        h("p", { class: "muted", text: "本结论不生成处置票卡，也不需要复测，可直接进入归档。" })
      ]);
    }
    var decided = state.review.retestPassed === true;
    var archived = state.archived === true;
    return h("aside", { class: "panel rv-retest" }, [
      AppState.panelTitle("复测验收", archived ? "已归档" : (decided ? "已通过" : "待确认")),
      h("p", { class: "muted", text: archived ? "报告已归档，复测结果已锁定。" : "处置完成后由现场回填复测结果。" }),
      h("div", { class: "rv-retest-actions" }, [
        h("button", {
          type: "button",
          class: "primary-action",
          disabled: (decided || archived) ? "disabled" : null,
          dataset: { action: "retest-pass" },
          text: decided ? "复测已通过" : retest.passLabel
        }),
        h("button", {
          type: "button",
          class: "plain-button rv-retest-fail",
          disabled: archived ? "disabled" : null,
          dataset: { action: "retest-fail" },
          text: archived ? "归档后不可退回" : retest.failLabel
        })
      ])
    ]);
  }

  // ---------------------------------------------------------------- 报告归档浮层

  function categoryById(categoryId) {
    var found = KB.categories().filter(function (category) { return category.id === categoryId; })[0];
    if (!found) throw new Error("[review] 归档分类不存在：" + categoryId);
    return found;
  }

  function reportArchiveBlocked(outcome) {
    return outcome.retest.enable && AppState.value.review.retestPassed !== true;
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
    return h("div", { class: "rv-report-document" }, ReportModel.sections().map(function (section) {
      return h("article", { class: "ar-section" + (section.human ? " human" : "") }, [
        h("div", { class: "ar-section-head" }, [
          h("i", { class: "dot " + section.status, "aria-hidden": "true" }),
          h("strong", { text: section.title })
        ]),
        h("p", { text: section.text }),
        section.human ? h("small", { class: "ar-human-tag", text: "人工填写" }) : null
      ]);
    }));
  }

  function renderReportArchiveOverlay() {
    var state = AppState.value;
    if (!state.pick.reviewArchiveOpen || !state.review.executed) return null;
    var outcome = AppState.currentOutcome();
    if (!outcome) throw new Error("[review] 打开报告归档浮层时必须已选定结论");

    var blocked = reportArchiveBlocked(outcome);
    return window.Overlay.render({
      open: true,
      title: "报告预览",
      kicker: "由人工复核结果自动生成",
      body: [
        renderReportSummary(outcome),
        h("p", {
          class: "rv-report-tip",
          text: blocked
            ? "复测通过后才能归档。当前报告可先预览，确认复测结果后再写入知识库。"
            : "确认后写入知识库，本页不跳转。"
        }),
        renderReportPreview()
      ],
      actions: [
        { text: "返回修改", action: "close-report-archive" },
        { text: state.archived ? "已归档" : "归档到知识库", action: "archive-report", primary: true, disabled: blocked || state.archived }
      ],
      onCloseAction: "close-report-archive",
      key: "review-report-archive",
      panelClass: "rv-report-overlay"
    });
  }

  // ---------------------------------------------------------------- 顶层

  function renderReview() {
    if (AppState.value.review.executed) return renderExecuted();

    return AppState.pageShell(
      "人工复核 / AI 匹配票卡",
      AppState.currentObject().label + " " + AppState.currentPart().label,
      renderReviewerChip(),
      h("div", { class: "rv-stack rv-review-stack" }, [
        renderRetestBanner(),
        h("div", { class: "rv-grid rv-review-page" }, [
          renderTicketCard(),
          h("div", { class: "rv-review-column" }, [
            window.ReviewForm.render(),
            renderPath()
          ])
        ]),
        renderReviewAgentFab()
      ])
    );
  }

  function renderReviewCharts() {
    // 复核主页面不画图。时序/视觉证据通过左侧票卡按钮进入详情。
  }

  // 定点刷新：文本框输入不走 render()（每敲一个字整屏重建会丢光标），只更新受影响的
  // 两处——执行按钮的可用性和缺项提示。
  function refreshReviewGates() {
    var button = document.querySelector('[data-gate="execute"]');
    if (button) button.disabled = !AppState.canExecute();

    var hint = document.querySelector('[data-gate="hint"]');
    if (!hint) return;
    var missing = AppState.missingFields();
    var parts = [];
    if (missing.length) {
      parts.push("还需填写：" + missing.map(function (fieldId) {
        return window.DOMAIN_REVIEW.fields[fieldId].label;
      }).join("、"));
    }
    if (AppState.noteRequired() && AppState.value.review.note.trim() === "") {
      parts.push("与 AI 建议不一致，必须填写复核意见");
    }
    hint.textContent = parts.join("；");
    hint.classList.toggle("hidden", parts.length === 0);
  }

  window.Scenes = window.Scenes || {};
  window.Scenes.renderReview = renderReview;
  window.Scenes.renderReviewCharts = renderReviewCharts;
  window.Scenes.renderReviewOverlays = function () { return [renderReportArchiveOverlay()]; };
  window.Scenes.refreshReviewGates = refreshReviewGates;
})();
