// 场景：诊断工作台。要回答的问题是"这条异常，证据齐不齐"。
//
// 上方是可点选的记录表（报表），AI 辅助判断、时序、视觉都从点击记录后的浮层进入。
// 所有下钻内容必须同源于**选中记录对应的部位**，不能各读各的。pump-demo 在这里踩过：卡片
// 标题取的是记录的部位、曲线取的是全局焦点部位，大多数时候两者重合，一旦分开就是
// "标题是 A 部位、曲线画的是 B 部位"这种只能靠肉眼发现的错配。
//
// 时序 / 视觉的完整详情不在本文件：boot.js 的 sceneRenderer() 在 state.detail 非空时
// 整屏切到 scenes/detailscreen.js，renderWorkbench() 只在 detail 为空时被调用。
(function () {
  "use strict";

  var AppState = window.AppState;
  var RECORDS = window.DOMAIN_RECORDS;
  var SERIES = window.DOMAIN_SERIES;

  // ---------------------------------------------------------------- 时间范围

  function renderRangeSwitch() {
    var state = AppState.value;
    return h("div", { class: "wb-range", role: "group", "aria-label": "时间范围" },
      SERIES.ranges().map(function (range) {
        var active = state.range === range.key;
        return h("button", {
          type: "button",
          class: "wb-range-btn" + (active ? " active" : ""),
          "aria-pressed": active ? "true" : "false",
          dataset: { action: "set-range", rangeKey: range.key, focusKey: "range:" + range.key },
          text: range.label
        });
      }));
  }

  // ---------------------------------------------------------------- 上方报表

  function renderRecordPanel() {
    var state = AppState.value;
    var records = AppState.recordsOf(state.focus.objectId);
    var columns = RECORDS.columns;
    var items = records.map(function (record) {
      var flag = RECORDS.aiFlagText[record.aiFlag];
      return {
        id: record.id,
        status: flag.status,
        cells: {
          formNo: record.no ? "第 " + record.no + " 项" : record.id,
          area: record.area || AppState.partById(record.partId).short,
          device: record.device || AppState.partById(record.partId).component,
          item: record.item,
          // 表格单元格不接受 null；若后续演示数据确实留空，这里显式转成可读文案。
          result: record.result || "（未填写）",
          aiFlagText: flag.badge
        }
      };
    });
    return h("section", { class: "panel wb-records" }, [
      AppState.panelTitle("巡检记录", "共 " + records.length + " 条"),
      h("div", { class: "wb-records-scroll" }, [
        window.SelectList.render({
          name: "workbench-record",
          variant: "table",
          activeId: state.pick.workbench,
          ariaLabel: "巡检记录",
          columns: columns,
          items: items
        })
      ])
    ]);
  }

  // ---------------------------------------------------------------- AI 判断浮层

  function evidenceOf(item, kind) {
    var matches = item.evidenceChain.filter(function (evidence) { return evidence.kind === kind; });
    if (matches.length !== 1) throw new Error("[workbench] AI 服务判断需要唯一 " + kind + " 依据");
    return matches[0];
  }

  function serviceJudgments(item) {
    var series = evidenceOf(item, "series");
    var vision = evidenceOf(item, "vision");
    var rule = evidenceOf(item, "rule");
    function confidenceOf(evidence) {
      if (typeof evidence.confidence === "number") return evidence.confidence;
      if (typeof item.confidence === "number") return item.confidence;
      throw new Error("[workbench] AI 判断缺少 confidence：" + evidence.label);
    }
    return [
      {
        kind: "series",
        service: "时序异常检测服务",
        status: "danger",
        verdict: series.label,
        detail: series.detail,
        tag: "趋势/阈值",
        evidence: series,
        confidence: confidenceOf(series)
      },
      {
        kind: "vision",
        service: "视觉证据识别服务",
        status: "warn",
        verdict: vision.label,
        detail: vision.detail,
        tag: "关键帧/目标",
        evidence: vision,
        confidence: confidenceOf(vision)
      },
      {
        kind: "rule",
        service: "规则知识核验服务",
        status: "warn",
        verdict: rule.label,
        detail: rule.detail,
        tag: "专家规则",
        evidence: rule,
        confidence: confidenceOf(rule)
      }
    ];
  }

  function renderEvidenceEntry(row) {
    if (row.kind === "series") {
      return h("button", {
        type: "button",
        class: "plain-button wb-ai-evidence-link",
        dataset: {
          action: "open-evidence",
          evidenceKind: "series",
          pointId: row.evidence.pointId,
          focusKey: "ai-evidence:series"
        },
        text: "查看告警数据"
      });
    }
    if (row.kind === "vision") {
      return h("button", {
        type: "button",
        class: "plain-button wb-ai-evidence-link",
        dataset: {
          action: "open-evidence",
          evidenceKind: "vision",
          frameId: row.evidence.frameId,
          focusKey: "ai-evidence:vision"
        },
        text: "查看视觉模型"
      });
    }
    return h("span", { class: "wb-ai-evidence-note", text: "规则依据已纳入判断" });
  }

  function renderServiceJudgments(item) {
    return h("div", { class: "wb-ai-service-list" }, serviceJudgments(item).map(function (row) {
      return h("article", {
        class: "wb-ai-service " + row.status,
        dataset: { aiServiceKind: row.kind }
      }, [
        h("div", { class: "wb-ai-service-head" }, [
          h("strong", { text: row.service }),
          h("span", { text: row.tag })
        ]),
        h("p", { text: row.verdict }),
        h("small", { text: row.detail }),
        h("strong", { class: "wb-ai-confidence", text: row.confidence + "%" }),
        h("div", { class: "wb-ai-evidence-entry" }, [
          renderEvidenceEntry(row)
        ])
      ]);
    }));
  }

  function renderKnowledgeEvidence(item) {
    var cases = item.evidenceChain.filter(function (evidence) { return evidence.kind === "case"; });
    if (!cases.length) return null;
    return h("div", { class: "wb-ai-kb-links" }, [
      h("span", { text: "知识库依据" }),
      cases.map(function (evidence) {
        var locked = window.EvidenceChain.isLocked(evidence);
        return h("button", {
          type: "button",
          class: "plain-button wb-ai-kb-link",
          disabled: locked ? "disabled" : null,
          dataset: {
            action: "open-evidence",
            evidenceKind: "case",
            docId: evidence.docId,
            evidenceLocked: locked ? "true" : "false",
            focusKey: "ai-evidence:case"
          },
          text: locked ? evidence.label + "（归档后解锁）" : evidence.label
        });
      })
    ]);
  }

  // ---------------------------------------------------------------- 浮动入口 / 浮层

  function renderAgentFab() {
    return h("button", {
      type: "button",
      class: "wb-agent-fab",
      title: "Agent 助手",
      "aria-label": "打开 Agent 助手",
      dataset: { action: "open-agent", agentContext: "workbench", focusKey: "open-agent" },
      text: "AI"
    });
  }

  function renderAiListOverlay() {
    var state = AppState.value;
    if (!state.pick.workbenchAiListOpen) return null;
    var record = AppState.currentRecord();
    var part = AppState.partById(record.partId);
    var item = AppState.currentCase();
    var body = item
      ? [
        h("p", { class: "wb-ai-list-summary", text: item.suggestion.text }),
        renderServiceJudgments(item),
        renderKnowledgeEvidence(item)
      ]
      : [
        h("p", { class: "muted", text: "本条记录没有模型判读结果，请直接进入人工复核。" })
      ];

    return window.Overlay.render({
      open: true,
      title: "AI 辅助判断列表",
      kicker: [record.no ? "第 " + record.no + " 项" : record.id, part.short, record.item].join(" · "),
      body: body,
      actions: [
        { text: "进入人工复核", action: "go-review", primary: true }
      ],
      onCloseAction: "close-ai-list",
      key: "workbench-ai-list",
      panelClass: "wb-ai-list-overlay"
    });
  }

  // ---------------------------------------------------------------- 顶层

  function renderWorkbench() {
    return AppState.pageShell(
      "证据质检 / 模型判读",
      AppState.currentObject().label + " 诊断工作台",
      renderRangeSwitch(),
      h("div", { class: "wb-page" }, [
        h("div", { class: "wb-layout" }, [
          renderRecordPanel()
        ]),
        renderAgentFab()
      ])
    );
  }

  function renderWorkbenchCharts() {
    // 工作台首屏不渲染证据内容；证据入口在 AI 判断弹窗条目里，下钻后再画图。
  }

  window.Scenes = window.Scenes || {};
  window.Scenes.renderWorkbench = renderWorkbench;
  window.Scenes.renderWorkbenchCharts = renderWorkbenchCharts;
  window.Scenes.renderWorkbenchOverlays = function () { return [renderAiListOverlay()]; };
})();
