// 场景：人工复核。这是主语从"AI 在组织证据"换成"人在做决定"的那一页。
//
// 三段式：① 证据摘要（只读）② 人工介入（ReviewForm 四层）③ 处置路径。
// 执行之后（state.review.executed）整页切成执行屏，并弹出轻量报告归档确认浮层。
//
// ---- 这一页的三个机关 ----
// 1. 分歧必填理由：不填则执行按钮不可用（判据在 AppState.canExecute）
// 2. 复核意见原文进报告：本页写 state.review.note，报告预览浮层用 ReportModel 回显
// 3. 复测不通过可退回本页：executed 置回 false，结论和意见都保留
//
// 本文件不绑任何事件，全部走 data-action 交给 boot.js。
(function () {
  "use strict";

  var AppState = window.AppState;
  var Charts = window.Charts;
  var ChartOptions = window.ChartOptions;
  var Cards = window.Cards;
  var META = window.DOMAIN_META;
  var KB = window.DOMAIN_KB;
  var ReportModel = window.ReportModel;

  var sparkIds = [];

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

  // ---------------------------------------------------------------- ① 证据摘要

  // 证据指纹取"当前部位的全部测点"，而不是跟着用户最后点的那个测点走——这一页要
  // 回答的是"这个案子成不成立"，不是"当前随便看着哪个测点"。
  function renderEvidenceMetric(point) {
    var s = AppState.seriesOf(point.id);
    var sparkId = "rv-spark-" + point.id;
    sparkIds.push({ id: sparkId, series: s });
    var card = Cards.metric({
      label: s.label,
      value: String(s.latest),
      unit: s.unit,
      status: s.status,
      note: s.alert,
      sparkId: sparkId
    });
    var host = card.querySelector("[data-chart-slot='" + sparkId + "']");
    if (!host) throw new Error("[review] 缺少图表占位容器：" + sparkId);
    host.appendChild(Charts.slot(sparkId));
    return card;
  }

  // 知识命中取 AI 判断依据链里的 rule / case 两类——它们就是"这个结论有什么外部
  // 依据"。series / vision 两类是数据本身，已经由上面的 metric 卡表达了。
  function renderKnowledgeHits() {
    var item = AppState.currentCase();
    if (!item) return null;
    var hits = item.evidenceChain.filter(function (evidence) {
      return evidence.kind === "rule" || evidence.kind === "case";
    });
    if (!hits.length) return null;
    return h("div", { class: "rv-hits" }, [
      h("p", { class: "rv-subhead", text: "知识命中" }),
      h("div", { class: "rv-hit-list" }, hits.map(function (evidence) {
        return Cards.evidence({
          status: evidence.locked === true ? "ok" : "warn",
          conclusion: evidence.label + "：" + evidence.detail,
          tags: [evidence.kind === "rule" ? "专家规则" : "历史案例"]
        });
      }))
    ]);
  }

  function renderEvidenceSummary() {
    var part = AppState.currentPart();
    var item = AppState.currentCase();
    return h("section", { class: "panel rv-evidence" }, [
      window.ReviewForm.sectionHead("①", "核心证据", AppState.currentObject().label + " · " + part.label),
      item ? h("p", { class: "rv-lead", text: item.summary }) : null,
      h("div", { class: "rv-metrics" }, AppState.pointsOf(part.id).map(renderEvidenceMetric)),
      renderKnowledgeHits()
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

  // ---------------------------------------------------------------- 执行屏

  function renderExecuted() {
    var outcome = AppState.currentOutcome();
    var state = AppState.value;
    var retest = outcome.retest;
    var action = state.archived
      ? h("button", {
        type: "button",
        class: "plain-button",
        dataset: { action: "go-knowledge" },
        text: "去知识库查看"
      })
      : h("button", {
        type: "button",
        class: "primary-action",
        dataset: { action: "open-report-archive" },
        text: "预览并归档报告"
      });
    return AppState.pageShell(
      "人工复核 / 报告归档",
      outcome.label,
      action,
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
        renderRetestPanel(retest)
      ])
    );
  }

  // ---------------------------------------------------------------- 报告归档浮层

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
      title: "报告归档确认",
      kicker: "人工复核完成后自动生成",
      body: [
        renderReportSummary(outcome),
        h("p", { class: "rv-report-tip", text: "确认后，本报告会进入知识库并可被后续 Agent 检索复用。" }),
        renderReportPreview()
      ],
      actions: [
        { text: "返回修改", action: "close-report-archive" },
        { text: "确认归档到知识库", action: "archive-report", primary: true }
      ],
      onCloseAction: "close-report-archive",
      key: "review-report-archive",
      panelClass: "rv-report-overlay"
    });
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
    return h("aside", { class: "panel rv-retest" }, [
      AppState.panelTitle("复测验收", decided ? "已通过" : "待确认"),
      h("p", { class: "muted", text: "处置完成后由现场回填复测结果。" }),
      h("div", { class: "rv-retest-actions" }, [
        h("button", {
          type: "button",
          class: "primary-action",
          disabled: decided ? "disabled" : null,
          dataset: { action: "retest-pass" },
          text: decided ? "复测已通过" : retest.passLabel
        }),
        h("button", {
          type: "button",
          class: "plain-button rv-retest-fail",
          dataset: { action: "retest-fail" },
          text: retest.failLabel
        })
      ])
    ]);
  }

  // ---------------------------------------------------------------- 顶层

  function renderReview() {
    sparkIds = [];
    if (AppState.value.review.executed) return renderExecuted();

    return AppState.pageShell(
      "人工复核 / 专家决策",
      AppState.currentObject().label + " " + AppState.currentPart().label,
      renderReviewerChip(),
      h("div", { class: "rv-stack" }, [
        renderRetestBanner(),
        h("div", { class: "rv-grid" }, [
          renderEvidenceSummary(),
          window.ReviewForm.render()
        ]),
        renderPath()
      ])
    );
  }

  function renderReviewCharts() {
    sparkIds.forEach(function (entry) {
      Charts.draw(entry.id, ChartOptions.spark(entry.series));
    });
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
