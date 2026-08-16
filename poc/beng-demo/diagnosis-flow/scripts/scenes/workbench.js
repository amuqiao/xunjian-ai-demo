// 场景：诊断工作台。要回答的问题是"这条异常，证据齐不齐"。
//
// 左列是可点选的记录表（报表），右侧全部内容跟随选中记录联动——时序、视觉、AI 判断
// 三块必须同源于**选中记录对应的部位**，不能各读各的。pump-demo 在这里踩过：卡片
// 标题取的是记录的部位、曲线取的是全局焦点部位，大多数时候两者重合，一旦分开就是
// "标题是 A 部位、曲线画的是 B 部位"这种只能靠肉眼发现的错配。
//
// 时序 / 视觉的完整详情不在本文件：boot.js 的 sceneRenderer() 在 state.detail 非空时
// 整屏切到 scenes/detailscreen.js，renderWorkbench() 只在 detail 为空时被调用。
(function () {
  "use strict";

  var AppState = window.AppState;
  var RECORDS = window.DOMAIN_RECORDS;
  var VISION = window.DOMAIN_VISION;
  var SERIES = window.DOMAIN_SERIES;
  var Charts = window.Charts;
  var ChartOptions = window.ChartOptions;

  var TREND_SLOT = "wb-trend";

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

  // ---------------------------------------------------------------- 左列报表

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

  // ---------------------------------------------------------------- 摘要条

  function renderSummaryBar(record, part) {
    var formNo = record.no ? "第 " + record.no + " 项" : record.id;
    var area = record.area || part.short;
    var device = record.device || part.component;
    return h("div", { class: "panel wb-summary" }, [
      h("span", {
        text: [formNo, area, device, record.item, record.date + " " + record.shift, record.inspector].join(" · ")
      }),
      h("span", { class: "wb-summary-result", text: record.result || "（未填写）" })
    ]);
  }

  // ---------------------------------------------------------------- 时序卡

  function renderTrendCard(part) {
    var point = AppState.primaryPoint(part.id);
    var s = AppState.seriesOf(point.id);
    return h("section", { class: "panel wb-card wb-trend" }, [
      AppState.panelTitle("时序模型", point.label),
      h("p", { class: "wb-alert " + s.status, text: s.alert }),
      h("div", { class: "wb-trend-chart" }, [Charts.slot(TREND_SLOT)]),
      h("button", {
        type: "button",
        class: "plain-button",
        dataset: { action: "open-trend-detail", focusKey: "open-trend" },
        text: "展开时序详情"
      })
    ]);
  }

  // ---------------------------------------------------------------- 视觉卡

  // bbox 是相对**图片实际渲染盒**的 0~1 比例。<figure> 必须紧贴图片（height:100% +
  // width:auto + inline-block），图片没铺满的两侧留白由外层深色底填——否则换一张
  // 宽高比不同的照片，标注框会整体飘走，而且不报错。
  function renderVisionCard(part) {
    var frame = AppState.currentFrameOf(part.id);
    var b = frame.bbox;
    var boxStyle = "left:" + (b.x * 100) + "%;top:" + (b.y * 100) + "%;"
      + "width:" + (b.w * 100) + "%;height:" + (b.h * 100) + "%;";
    return h("section", { class: "panel wb-card wb-vision" }, [
      AppState.panelTitle("视觉模型", frame.label),
      h("div", { class: "wb-frame-wrap" }, [
        h("figure", { class: "wb-frame" }, [
          h("img", { class: "wb-frame-img", src: VISION.media[frame.src], alt: frame.label }),
          h("div", { class: "wb-frame-box", style: boxStyle }, [
            h("span", { class: "wb-frame-box-label", text: frame.boxLabel })
          ])
        ])
      ]),
      h("p", { class: "wb-finding", text: frame.findings[0] }),
      h("button", {
        type: "button",
        class: "plain-button",
        dataset: { action: "open-vision-detail", focusKey: "open-vision" },
        text: "展开视觉详情"
      })
    ]);
  }

  // ---------------------------------------------------------------- AI 判断卡

  function renderAiCard(record) {
    var item = AppState.currentCase();
    var flag = RECORDS.aiFlagText[record.aiFlag];

    // 没有 AI 判断是合法状态（那条记录就是没有模型判读），不是数据缺失。
    if (!item) {
      return h("section", { class: "panel wb-card wb-ai empty" }, [
        AppState.panelTitle("AI 辅助判断", flag.badge),
        h("p", { class: "muted", text: "本条记录没有模型判读结果，请直接进入人工复核。" }),
        h("button", {
          type: "button",
          class: "primary-action",
          dataset: { action: "go-review" },
          text: "进入人工复核"
        })
      ]);
    }

    return h("section", { class: "panel wb-card wb-ai " + flag.status }, [
      AppState.panelTitle("AI 辅助判断", flag.badge),
      h("p", { class: "wb-ai-conclusion", text: flag.lead + item.suggestion.text }),
      window.ConfidenceBar.render(item),
      window.EvidenceChain.render(item),
      h("button", {
        type: "button",
        class: "primary-action wb-ai-go",
        dataset: { action: "go-review", focusKey: "go-review" },
        text: "进入人工复核"
      })
    ]);
  }

  // ---------------------------------------------------------------- Agent 入口

  function renderAgentCard() {
    var context = window.DOMAIN_AGENTQA.contexts.filter(function (c) { return c.id === "workbench"; })[0];
    return h("section", { class: "panel wb-card wb-agent" }, [
      AppState.panelTitle(context.entryTitle, "assistant"),
      h("p", { text: context.entryText }),
      h("div", { class: "wb-agent-tags" }, context.questions.slice(0, 5).map(function (question) {
        return h("span", { text: question.label });
      })),
      h("button", {
        type: "button",
        class: "plain-button",
        dataset: { action: "open-agent", agentContext: "workbench", focusKey: "open-agent" },
        text: "打开 Agent 对话"
      })
    ]);
  }

  // ---------------------------------------------------------------- 顶层

  function renderWorkbench() {
    var record = AppState.currentRecord();
    // 部位必须从**选中记录**推导，不是读全局焦点——两者在正常流程里重合，但依赖这种
    // 重合就会出现标题与曲线错配。
    var part = AppState.partById(record.partId);

    return AppState.pageShell(
      "证据质检 / 模型判读",
      AppState.currentObject().label + " 诊断工作台",
      renderRangeSwitch(),
      h("div", { class: "wb-layout" }, [
        renderRecordPanel(),
        h("div", { class: "wb-focus" }, [
          renderSummaryBar(record, part),
          h("div", { class: "wb-focus-grid" }, [
            renderTrendCard(part),
            renderVisionCard(part),
            renderAiCard(record),
            renderAgentCard()
          ])
        ])
      ])
    );
  }

  function renderWorkbenchCharts() {
    var record = AppState.currentRecord();
    var part = AppState.partById(record.partId);
    var point = AppState.primaryPoint(part.id);
    Charts.draw(TREND_SLOT, ChartOptions.trend([AppState.seriesOf(point.id)]));
  }

  window.Scenes = window.Scenes || {};
  window.Scenes.renderWorkbench = renderWorkbench;
  window.Scenes.renderWorkbenchCharts = renderWorkbenchCharts;
})();
