/*
 * report.js — 场景:报告归档
 *
 * 场景目标:把前面各场景点出来的分析、复检结果收束成一份"可汇报、可交接、
 * 可归档"的成稿。视觉重心是报告正文按"摘要→异常→复检结论→交接班→归档"
 * 顺序依次渐显(fadeUp),是整段演示的收束高潮。
 *
 * 数据一律取自 window.DEMO_DATA;结论状态一律读写 window.DemoState;
 * 不加兜底 —— DemoState.get('decision') 为空时按契约显式提示,不拼默认成稿。
 */
(function () {
  "use strict";

  var DATA = window.DEMO_DATA;
  var el = window.DemoUtil.el;

  var root = document.querySelector('.scene[data-scene="report"]');

  /* ============ 结论 → 视觉基调(不做兜底,遇到未知结论直接报错) ============ */

  function decisionTone(decision) {
    if (decision === "confirmed") return "danger";
    if (decision === "false-positive") return "ok";
    if (decision === "observe") return "warn";
    throw new Error("[report] 未知复检结论: " + decision);
  }

  function handoverTone(decision) {
    if (decision === "confirmed") return "warn";
    if (decision === "false-positive") return "ok";
    if (decision === "observe") return "info";
    throw new Error("[report] 未知复检结论: " + decision);
  }

  /* ============ 静态骨架:一次性渲染进 .scene[data-scene="report"] ============ */

  // ---- 顶部窄标题带 ----
  var backEntry = el("button", {
    class: "rp-back-entry",
    type: "button",
    text: "‹ 返回复检",
    onClick: function () { window.Router.go("recheck"); },
  });

  var topbar = el("div", { class: "rp-topbar" }, [
    el("div", { class: "rp-topbar-text" }, [
      el("h2", { class: "rp-title", text: "报告归档" }),
      el("p", { class: "rp-subtitle", text: "汇总巡检分析与复检结论,生成可汇报、可交接、可归档的巡检报告。" }),
    ]),
    backEntry,
  ]);

  // ---- 左侧:巡检质量智能分析报告(报告头 + 正文) ----
  var metaGrid = el("div", { class: "rp-meta-grid" }, [
    el("div", { class: "rp-meta-item" }, [el("span", { class: "rp-meta-label", text: "站场" }), el("span", { class: "rp-meta-value", text: DATA.site.name })]),
    el("div", { class: "rp-meta-item" }, [el("span", { class: "rp-meta-label", text: "任务" }), el("span", { class: "rp-meta-value", text: DATA.task.title })]),
    el("div", { class: "rp-meta-item" }, [el("span", { class: "rp-meta-label", text: "巡检人" }), el("span", { class: "rp-meta-value", text: DATA.task.inspector })]),
    el("div", { class: "rp-meta-item" }, [el("span", { class: "rp-meta-label", text: "计划时间" }), el("span", { class: "rp-meta-value", text: DATA.task.planStart })]),
    el("div", { class: "rp-meta-item" }, [el("span", { class: "rp-meta-label", text: "实际时间" }), el("span", { class: "rp-meta-value", text: DATA.task.actualStart + " → " + DATA.task.actualEnd })]),
    el("div", { class: "rp-meta-item" }, [el("span", { class: "rp-meta-label", text: "报告生成时间" }), el("span", { class: "rp-meta-value", text: DATA.site.clock })]),
  ]);

  var reportVersion = el("div", { class: "rp-version", text: "报告版本 · " + DATA.reportVersion });

  var reportContent = el("div", { class: "rp-content" }); // 正文分段容器,onEnter 动态填充

  var reportPanel = el("section", { class: "rp-report panel" }, [
    el("div", { class: "panel-title" }, [el("span", { text: "巡检质量智能分析报告" })]),
    metaGrid,
    reportVersion,
    reportContent,
  ]);

  // ---- 右侧:归档状态(印章 + 案例标签 + 闭环率 + 操作) ----
  var stamp = el("div", { class: "rp-stamp is-draft", text: "◷ 草稿" });

  var tagEls = DATA.caseTags.map(function (tag) {
    return el("span", { class: "rp-tag", text: tag });
  });
  var tagsBox = el("div", { class: "rp-tags" }, tagEls);

  var closedValue = el("span", { class: "num", text: "--" });
  var closedBlock = el("div", { class: "rp-closed" }, [
    el("div", { class: "rp-closed-label", text: "闭环率" }),
    closedValue,
  ]);

  var archiveBtn = el("button", { class: "action primary rp-btn", type: "button", text: "归档为案例" });
  var backBtn = el("button", {
    class: "action rp-btn",
    type: "button",
    text: "回到大屏",
    onClick: function () { window.Router.go("overview", { direction: "back" }); },
  });

  var archivePanel = el("aside", { class: "rp-archive panel rp-fade" }, [
    el("div", { class: "panel-title" }, [el("span", { text: "归档状态" })]),
    stamp,
    el("div", { class: "rp-tags-label", text: "案例标签" }),
    tagsBox,
    closedBlock,
    el("div", { class: "rp-archive-actions" }, [archiveBtn, backBtn]),
  ]);

  var body = el("div", { class: "rp-body" }, [reportPanel, archivePanel]);

  root.appendChild(el("div", { class: "rp-root" }, [topbar, body]));

  /* ============ 动态渲染:报告正文按结论刷新 ============ */

  function renderReportBody() {
    var decision = window.DemoState.get("decision");
    reportContent.innerHTML = "";

    if (!decision) {
      // 异常路径:未选人工结论,不拼默认成稿,显式提示
      reportContent.appendChild(el("div", { class: "rp-empty" }, [
        el("p", { class: "rp-empty-text", text: "请先在复检工作台选择人工结论。" }),
      ]));
      return;
    }

    var draft = DATA.reportDrafts[decision];
    var statusLabel = DATA.decisionStatus[decision];

    var sectionDefs = [
      { title: "巡检摘要", lead: draft.main, text: draft.bullets[0] },
      { title: "异常摘要", text: draft.bullets[1] },
      { title: "复检结论", text: draft.bullets[2], badge: { text: statusLabel, tone: decisionTone(decision) } },
      { title: "交接班关注", text: draft.bullets[3], badge: { text: draft.handover, tone: handoverTone(decision) } },
    ];

    sectionDefs.forEach(function (def) {
      var children = [el("h3", { class: "rp-section-title", text: def.title })];
      if (def.lead) children.push(el("p", { class: "rp-lead", text: def.lead }));
      children.push(el("p", { class: "rp-section-text", text: def.text }));
      if (def.badge) children.push(el("span", { class: "badge " + def.badge.tone }, def.badge.text));
      reportContent.appendChild(el("div", { class: "rp-section rp-fade" }, children));
    });
  }

  /* ============ 分段渐显:摘要 → 异常 → 复检结论 → 交接班 → 归档 ============ */

  function revealSections() {
    var decision = window.DemoState.get("decision");

    if (!decision) {
      // 无成稿:归档面板直接可见,不做分段渐显演出
      archivePanel.classList.add("rp-in");
      return;
    }

    archivePanel.classList.remove("rp-in");
    var nodes = Array.prototype.slice.call(reportContent.querySelectorAll(".rp-fade"));
    nodes.forEach(function (node) { node.classList.remove("rp-in"); });
    nodes.forEach(function (node, i) {
      window.setTimeout(function () { node.classList.add("rp-in"); }, i * 240);
    });
    // 报告各段落渐显完毕后,归档面板作为收束的最后一步渐显出现
    window.setTimeout(function () { archivePanel.classList.add("rp-in"); }, nodes.length * 240);
  }

  /* ============ 归档状态刷新(印章 / 标签 / 闭环率 / 操作按钮) ============ */

  function updateArchiveUI() {
    var archived = window.DemoState.get("archived");
    var decision = window.DemoState.get("decision");

    if (archived) {
      stamp.className = "rp-stamp is-archived";
      stamp.textContent = "✓ 已归档";
      tagEls.forEach(function (t) { t.classList.add("is-lit"); });
      closedValue.className = "num green";
      closedValue.textContent = DATA.closedRate.archived;
      archiveBtn.disabled = true;
      archiveBtn.textContent = "已归档为案例";
    } else {
      stamp.className = "rp-stamp is-draft";
      stamp.textContent = "◷ 草稿";
      tagEls.forEach(function (t) { t.classList.remove("is-lit"); });
      archiveBtn.textContent = "归档为案例";
      if (decision) {
        closedValue.className = "num amber";
        closedValue.textContent = DATA.closedRate[decision];
        archiveBtn.disabled = false;
        archiveBtn.removeAttribute("title");
      } else {
        closedValue.className = "num";
        closedValue.textContent = "--";
        archiveBtn.disabled = true;
        archiveBtn.title = "请先在复检工作台选择人工结论";
      }
    }
  }

  archiveBtn.addEventListener("click", function () {
    window.DemoState.set("archived", true);
  });

  /* ============ 状态订阅:结论变化时报告刷新;归档状态变化时右侧刷新 ============ */

  window.DemoState.subscribe("decision", function () {
    renderReportBody();
    updateArchiveUI();
    if (window.Router.current() === "report") revealSections();
  });

  window.DemoState.subscribe("archived", updateArchiveUI);

  /* ============ 场景注册 ============ */

  window.Router.register("report", {
    onEnter: function () {
      renderReportBody();
      updateArchiveUI();
      revealSections();
    },
  });
})();
