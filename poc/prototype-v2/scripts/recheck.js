/*
 * recheck.js —— 复检工作台场景
 *
 * 场景目标:证明系统不只报风险,而是"证据链 → 复检清单 → 人工确认"可执行闭环。
 * 结构:顶部窄标题带 / 主体三列(异常说明·知识依据命中·复检清单) / 底部人工确认区。
 * 视觉重心:复检清单逐条生成动画 + 人工确认弹窗,保留安全生产的人工确认边界。
 */
(function () {
  "use strict";

  var DATA = window.DEMO_DATA;
  var root = document.querySelector('.scene[data-scene="recheck"]');

  // 结论 → 徽章语气映射(纯呈现用,不属于业务数据,文案一律取自 DEMO_DATA)
  var DECISION_TONE = { confirmed: "danger", "false-positive": "ok", observe: "warn" };

  // 缓存需要动态刷新的节点引用
  var refs = {};
  // 弹窗打开前的焦点元素,关闭后归还(WCAG 焦点管理)
  var previouslyFocused = null;

  buildSkeleton();
  Router.register("recheck", { onEnter: onEnter });

  /* ============ 静态骨架(一次性渲染) ============ */
  function buildSkeleton() {
    var header = DemoUtil.el("div", { class: "rc-header" }, [
      DemoUtil.el("div", { class: "rc-header-text" }, [
        DemoUtil.el("h2", { class: "rc-title", text: "复检工作台" }),
        DemoUtil.el("span", {
          class: "rc-subtitle",
          text: DATA.task.title + " · 证据链 → 复检清单 → 人工确认",
        }),
      ]),
      DemoUtil.el("button", {
        class: "rc-back",
        type: "button",
        text: "← 返回分析",
        onClick: function () { Router.go("analysis"); },
      }),
    ]);

    var body = DemoUtil.el("div", { class: "rc-body" }, [
      buildSummaryCol(),
      buildKnowledgeCol(),
      buildChecklistCol(),
    ]);

    var footer = buildFooter();

    root.appendChild(DemoUtil.el("div", { class: "rc-root" }, [header, body, footer]));
    root.appendChild(buildModal());
  }

  // 【异常说明】列:trigger/relation/source + 高优先级徽章 + 差压趋势小卡
  function buildSummaryCol() {
    refs.trendBox = DemoUtil.el("div", { class: "rc-trend" });
    refs.trendNote = DemoUtil.el("p", { class: "rc-trend-note" });

    return DemoUtil.el("section", { class: "rc-col rc-col-summary panel" }, [
      DemoUtil.el("div", { class: "panel-title" }, [
        DemoUtil.el("span", { text: "异常说明" }),
        DemoUtil.el("span", {
          class: "badge " + DATA.areas.metering.badgeTone,
          text: DATA.areas.metering.badge,
        }),
      ]),
      DemoUtil.el("dl", { class: "rc-summary-list" }, [
        DemoUtil.el("dt", { text: "触发条件" }),
        DemoUtil.el("dd", { text: DATA.recheckSummary.trigger }),
        DemoUtil.el("dt", { text: "关联对象" }),
        DemoUtil.el("dd", { text: DATA.recheckSummary.relation }),
        DemoUtil.el("dt", { text: "证据来源" }),
        DemoUtil.el("dd", { text: DATA.recheckSummary.source }),
      ]),
      DemoUtil.el("div", { class: "rc-trend-wrap" }, [refs.trendBox, refs.trendNote]),
    ]);
  }

  // 【知识依据命中】列:渲染 DEMO_DATA.knowledge[],逐条淡入
  function buildKnowledgeCol() {
    refs.knowledgeBadge = DemoUtil.el("span", { class: "badge info" });
    refs.knowledgeList = DemoUtil.el("div", { class: "rc-list rc-knowledge-list" });

    return DemoUtil.el("section", { class: "rc-col rc-col-knowledge panel" }, [
      DemoUtil.el("div", { class: "panel-title" }, [
        DemoUtil.el("span", { text: "知识依据命中" }),
        refs.knowledgeBadge,
      ]),
      refs.knowledgeList,
    ]);
  }

  // 【复检清单】列:渲染 DEMO_DATA.recheckChecklist[],逐条生成动画
  function buildChecklistCol() {
    refs.checklistBadge = DemoUtil.el("span", { class: "badge warn" });
    refs.checklistList = DemoUtil.el("div", { class: "rc-list rc-checklist-list" });

    return DemoUtil.el("section", { class: "rc-col rc-col-checklist panel" }, [
      DemoUtil.el("div", { class: "panel-title" }, [
        DemoUtil.el("span", { text: "复检清单" }),
        refs.checklistBadge,
      ]),
      refs.checklistList,
    ]);
  }

  // 底部人工确认区:结论按钮 + 主 CTA
  function buildFooter() {
    refs.decisionGroup = DemoUtil.el("div", { class: "rc-decision-group" });
    DATA.decisions.forEach(function (d) {
      refs.decisionGroup.appendChild(DemoUtil.el("button", {
        class: "rc-decision-btn",
        type: "button",
        text: d.label,
        dataset: { key: d.key },
        onClick: function () { selectDecision(d.key); },
      }));
    });

    refs.hint = DemoUtil.el("span", { class: "rc-hint" });
    refs.confirmBtn = DemoUtil.el("button", {
      class: "action primary rc-confirm-btn",
      type: "button",
      text: "人工确认复检",
      onClick: onConfirmClick,
    });

    return DemoUtil.el("div", { class: "rc-footer panel" }, [
      DemoUtil.el("div", { class: "rc-footer-left" }, [
        DemoUtil.el("span", { class: "rc-footer-label", text: "人工确认结论" }),
        refs.decisionGroup,
        refs.hint,
      ]),
      refs.confirmBtn,
    ]);
  }

  /* ============ 结论选择:写状态 + 联动清单徽章 ============ */
  function selectDecision(key) {
    DemoState.set("decision", key);
    syncDecisionButtons();
    renderChecklistStatus();
    clearHint();
  }

  function syncDecisionButtons() {
    var current = DemoState.get("decision");
    Array.prototype.forEach.call(refs.decisionGroup.children, function (btn) {
      btn.classList.toggle("active", btn.dataset.key === current);
    });
  }

  function clearHint() {
    refs.hint.textContent = "";
    refs.decisionGroup.classList.remove("rc-attn");
  }

  // 依据当前结论(有则用结论状态,无则用清单原始 auto/待确认状态)刷新每条清单徽章 + 列头徽章
  function renderChecklistStatus() {
    var decision = DemoState.get("decision");
    Array.prototype.forEach.call(refs.checklistList.children, function (row, i) {
      var badge = row.querySelector(".rc-item-status");
      applyItemBadge(badge, DATA.recheckChecklist[i], decision);
    });
    applyHeaderBadge(decision);
  }

  function applyItemBadge(badge, item, decision) {
    if (decision) {
      badge.className = "badge " + DECISION_TONE[decision] + " rc-item-status";
      badge.textContent = DATA.decisionStatus[decision];
    } else if (item.auto) {
      badge.className = "badge ok rc-item-status";
      badge.textContent = "AI 自动核验";
    } else {
      badge.className = "badge warn rc-item-status";
      badge.textContent = "待确认";
    }
  }

  function applyHeaderBadge(decision) {
    if (decision) {
      refs.checklistBadge.className = "badge " + DECISION_TONE[decision];
      refs.checklistBadge.textContent = DATA.decisionStatus[decision];
    } else {
      var pending = DATA.recheckChecklist.filter(function (i) { return !i.auto; }).length;
      refs.checklistBadge.className = "badge warn";
      refs.checklistBadge.textContent = pending + " 项待确认";
    }
  }

  /* ============ 知识依据渲染(逐条淡入) ============ */
  function renderKnowledge() {
    refs.knowledgeBadge.textContent = DATA.knowledge.length + " 条命中";
    refs.knowledgeList.innerHTML = "";
    DATA.knowledge.forEach(function (item, i) {
      var row = DemoUtil.el("article", { class: "rc-knowledge-item" }, [
        DemoUtil.el("span", { class: "rc-k-type", text: item.type }),
        DemoUtil.el("h4", { class: "rc-k-title", text: item.title }),
        DemoUtil.el("p", { class: "rc-k-desc", text: item.desc }),
        DemoUtil.el("span", { class: "rc-k-source", text: "依据 · " + item.source }),
      ]);
      row.style.animation = "fadeUp .5s var(--ease) both";
      row.style.animationDelay = (i * 150) + "ms";
      refs.knowledgeList.appendChild(row);
    });
  }

  /* ============ 复检清单渲染(逐条生成动画,auto 项先自动勾选) ============ */
  function renderChecklist() {
    refs.checklistList.innerHTML = "";
    var decision = DemoState.get("decision");
    DATA.recheckChecklist.forEach(function (item, i) {
      var badge = DemoUtil.el("span", { class: "rc-item-status" });
      applyItemBadge(badge, item, decision);

      var idx = DemoUtil.el("span", { class: "rc-item-idx", text: String(i + 1) });
      var row = DemoUtil.el("div", { class: "rc-checklist-item" }, [
        idx,
        DemoUtil.el("span", { class: "rc-item-text", text: item.text }),
        badge,
      ]);
      // 逐条点亮:淡入 + 序号短促脉冲,依次延迟
      var delay = i * 220;
      row.style.animation = "fadeUp .45s var(--ease) both";
      row.style.animationDelay = delay + "ms";
      idx.style.animation = "pulse .9s var(--ease) 1";
      idx.style.animationDelay = delay + "ms";
      refs.checklistList.appendChild(row);
    });
    applyHeaderBadge(decision);
  }

  /* ============ 差压趋势小卡(作证据) ============ */
  function renderTrendCard() {
    var res = DemoUtil.renderTrend(refs.trendBox, "filterDp", {});
    refs.trendNote.textContent =
      res.summary + "(末值 " + res.latest + " · 距阈值 " + res.marginText + ")";
  }

  /* ============ 主 CTA:未选结论则提示并高亮,不前进 ============ */
  function onConfirmClick() {
    var decision = DemoState.get("decision");
    if (!decision) {
      refs.hint.textContent = "请先选择一个复检结论,再确认复检。";
      refs.decisionGroup.classList.add("rc-attn");
      return;
    }
    openModal(decision);
  }

  /* ============ 人工确认弹窗(自建,.rc- 命名) ============ */
  function buildModal() {
    refs.modalDecisionEcho = DemoUtil.el("strong", { class: "rc-modal-decision" });
    refs.modalNote = DemoUtil.el("textarea", { class: "rc-modal-note", rows: "3" });
    refs.modalHandover = DemoUtil.el("input", { type: "checkbox", class: "rc-modal-checkbox" });
    refs.modalConfirmBtn = DemoUtil.el("button", {
      class: "action primary", type: "button", text: "确认", onClick: confirmModal,
    });
    var cancelBtn = DemoUtil.el("button", {
      class: "action", type: "button", text: "取消", onClick: closeModal,
    });

    refs.modal = DemoUtil.el("div", {
      class: "rc-modal", role: "dialog", "aria-modal": "true", "aria-label": "人工确认复检",
    }, [
      DemoUtil.el("div", { class: "rc-modal-inner" }, [
        DemoUtil.el("h3", { class: "rc-modal-title", text: "人工确认复检" }),
        DemoUtil.el("div", { class: "rc-modal-row" }, [
          DemoUtil.el("span", { class: "rc-modal-label", text: "复检结论" }),
          refs.modalDecisionEcho,
        ]),
        DemoUtil.el("div", { class: "rc-modal-row" }, [
          DemoUtil.el("span", { class: "rc-modal-label", text: "确认备注" }),
          refs.modalNote,
        ]),
        DemoUtil.el("label", { class: "rc-modal-checkline" }, [
          refs.modalHandover,
          DemoUtil.el("span", { text: "纳入交接班关注项" }),
        ]),
        DemoUtil.el("div", { class: "rc-modal-actions" }, [cancelBtn, refs.modalConfirmBtn]),
      ]),
    ]);
    refs.modal.addEventListener("keydown", onModalKeydown);
    refs.modal.addEventListener("click", function (e) {
      if (e.target === refs.modal) closeModal();
    });
    return refs.modal;
  }

  function onModalKeydown(e) {
    if (e.key === "Escape") {
      e.stopPropagation();
      closeModal();
    } else if (e.key === "Enter" && e.target.tagName !== "TEXTAREA" && e.target.tagName !== "BUTTON") {
      // 焦点在按钮上时交给按钮自身的 Enter→click(避免在"取消"上按 Enter 误触确认)
      e.preventDefault();
      confirmModal();
    }
  }

  function openModal(decision) {
    previouslyFocused = document.activeElement;
    var label = DATA.decisions.filter(function (d) { return d.key === decision; })[0].label;
    refs.modalDecisionEcho.textContent = label;
    refs.modalDecisionEcho.className = "rc-modal-decision badge " + DECISION_TONE[decision];
    refs.modalNote.value =
      "复检清单共 " + DATA.recheckChecklist.length + " 项已核对,结论为“" + label +
      "”,详见知识依据与差压趋势证据。";
    refs.modalHandover.checked = decision === "confirmed" || decision === "observe";
    refs.modal.classList.add("open");
    refs.modalConfirmBtn.focus();
  }

  function closeModal() {
    refs.modal.classList.remove("open");
    if (previouslyFocused && previouslyFocused.focus) previouslyFocused.focus();
    previouslyFocused = null;
  }

  // 确认后:关闭弹窗、推进 stepProgress、进入报告归档场景
  function confirmModal() {
    closeModal();
    Router.go("report");
  }

  /* ============ 场景进入:动态刷新 + 清单生成动画重播 ============ */
  function onEnter() {
    renderTrendCard();
    renderKnowledge();
    renderChecklist();
    syncDecisionButtons();
    clearHint();
  }
})();
