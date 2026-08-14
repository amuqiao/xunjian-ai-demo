// 场景：诊断工作台 / 证据质检（DemoData.scenes() 中 key === "workbench"）。
//
// 任务 P2-B：巡检记录从"1 条固定数据"改成"可点选的列表"，右侧内容全部跟随
// state.pick.workbench 联动（选中态本身已经由 boot.js 的 selectWorkbenchRecord 处理，
// 见 selectHandlers["workbench-record"]，本文件只负责渲染）。
//
// 任务 P4-重排（本次改动）：原布局把"分类文本塞进大数字 metric 组件""列表最大字号
// 显示最不重要的人工结论""时序卡净高只有 132px""视觉卡没有任何标注""四张卡面积均分
// 但内容量差三倍"这五处问题一次性修掉，具体对照见 styles/08-workbench.css 顶部注释：
//   ① 删掉 3 个 metric 框的记录详情卡 → 换成 44px 的纯文本摘要条（renderSummaryBar）。
//   ② 左列从 SelectList(variant="row") 换成 variant="table"（scripts/ui/selectlist.js
//      新增的表格变体），人工结论/AI 质检口径都是表格里的普通单元格，不再用最大字号。
//   ③ 时序卡改用 ChartOptions.trend() 而不是 spark()：曲线净高从 132px 提到 ~340px，
//      换回带坐标轴/刻度/图例/"关注线" markLine 标注的完整图。
//   ④ 视觉卡在缩略图上叠一层 bbox 标注框（数据来自 part.vision.frames[0]）。
//   ⑤ 右侧网格从"四块等分"改成"时序/视觉 1fr（按内容撑满）+ AI 建议/Agent 问答
//      固定 216px（按内容定死）"，不再用同一种尺寸装不同信息量的内容。
//
// 时序详情 / 视觉详情已经不是本文件渲染的内容：boot.js 的 renderScene() 里
// `state.scene === "workbench" && state.detail` 会整体切到 Scenes.renderDetailScreen()
// （另一个并行任务实现的独立整屏场景），renderWorkbench() 只在 state.detail 为空
// 时才会被调用——因此本文件不渲染内联的时序/视觉详情面板。
// 「展开时序详情」/「展开视觉详情」两个按钮沿用既有 data-action
// （open-trend-detail / open-vision-detail，boot.js 的 handleAction 里已经有对应分支，
// 会把 state.focus.unitId/diagnosisReady/detail 都置好），本文件不新造事件通路。
(function () {
  "use strict";

  var DATA = window.DemoData;
  var AppState = window.AppState;
  var Charts = window.Charts;
  var ChartOptions = window.ChartOptions;
  var state = window.AppState.value;

  // aiFlag 的三种口径：conflict=人机冲突（危）/ gap=记录缺项（关注）/ ok=人机一致（对照）。
  // 三张字典必须同源同 key，任何未覆盖到的 aiFlag 直接抛错，不悄悄退回默认文案——
  // 这跟 scripts/data/records.js 生成器目前只会产出这三种取值是同一份契约。
  // aiFlag 的三种口径（conflict/gap/ok）连同它们的三色映射、徽标文字和建议开头语，
  // 已挪到数据层 catalog.js 的 statusText.aiFlag——那三张字典是业务口径文案，
  // 不是渲染逻辑。DATA.aiFlagText() 对未知 aiFlag 直接抛错，与这里原来的行为一致，
  // 没有引入兜底。
  function aiFlagStatus(aiFlag) {
    return DATA.aiFlagText(aiFlag).status;
  }

  function aiFlagBadgeText(aiFlag) {
    return DATA.aiFlagText(aiFlag).badge;
  }

  function aiFlagLead(aiFlag) {
    return DATA.aiFlagText(aiFlag).lead;
  }

  function rangeLabel() {
    var matches = DATA.ranges().filter(function (range) { return range.key === state.range; });
    return matches[0].label;
  }

  function selectedRecord() {
    return DATA.record(state.pick.workbench);
  }

  function renderWorkbench() {
    var unitId = AppState.selectedUnitId();
    var record = selectedRecord();
    var part = DATA.part(record.partId);

    var shell = AppState.pageShell(
      "部位诊断 / 模型证据",
      "P-1 输油泵诊断工作台",
      h("button", { type: "button", class: "primary-action", dataset: { action: "go-confirm" }, text: "进入复核确认" }),
      h("div", { class: "workbench-stack" }, [
        h("div", { class: "workbench-layout" }, [
          renderRecordPanel(unitId),
          renderFocusArea(record, part),
        ]),
      ])
    );
    // .workbench-shell 只负责把这个场景的高度锁定在 #stage 剩余高度内（见
    // styles/08-workbench.css 顶部说明），跟 overview.js 给 DetailCard 追加
    // " overview-detail" 是同一种"组件产出通用节点、场景自己追加定位类"的写法，
    // 不改 pageShell() 本身。
    shell.className += " workbench-shell";
    return shell;
  }

  // ---------- 左列：可选巡检记录表格 ----------
  //
  // variant="table" 是 scripts/ui/selectlist.js 新增的表格变体：列定义在数据层
  // （DATA.recordColumns()，见 scripts/data/records.js），场景层只负责把每条 record
  // 映射成 { id, status, cells }。status-dot 列（key=aiFlag）的取值完全来自
  // item.status，cells 里不需要给这个 key；其余每个声明了的列 key 缺一个组件就直接
  // 抛错——这是刻意的硬校验，不在这里绕开。
  function renderRecordPanel(unitId) {
    var records = DATA.records(unitId, state.range);
    var columns = DATA.recordColumns();
    var items = records.map(function (record) {
      return {
        id: record.id,
        status: aiFlagStatus(record.aiFlag),
        cells: {
          dateShift: record.date + " · " + record.shift,
          partLabel: DATA.part(record.partId).label,
          item: record.item,
          result: record.result,
          aiFlagText: aiFlagBadgeText(record.aiFlag),
        },
      };
    });
    var table = window.SelectList.render({
      name: "workbench-record",
      variant: "table",
      activeId: state.pick.workbench,
      ariaLabel: "巡检记录",
      columns: columns,
      items: items,
    });
    return h("section", { class: "panel record-panel" }, [
      AppState.panelTitle("巡检记录", rangeLabel() + " · 共 " + records.length + " 条"),
      h("div", { class: "record-list-scroll" }, [table]),
    ]);
  }

  // ---------- 右侧：44px 摘要条 + 时序/视觉（按内容撑满）+ AI 建议/Agent 问答
  // （固定 216px） ----------

  function renderFocusArea(record, part) {
    return h("div", { class: "workbench-focus-grid" }, [
      renderSummaryBar(record, part),
      renderTrendCard(part),
      renderVisionCard(part),
      renderAiSuggestCard(record, part),
      renderAgentEntryCard(),
    ]);
  }

  // 摘要条：只承担"你现在看的是哪一条记录"这一件事——日期·班次·巡检人·部位·
  // 检查项，普通字号的一行文字，不用 metric 组件（旧版的记录详情卡在这里塞了 3 个
  // metric 框显示"关联部位/AI 质检口径"这类短分类文本，是整页最刺眼的一处，见
  // styles/08-workbench.css 顶部注释①）。人工结论 / AI 质检口径这两项已经是左侧
  // 表格里的常规单元格，不必在这里重复。
  function renderSummaryBar(record, part) {
    var text = [record.date, record.shift, record.inspector, part.label, record.item].join(" · ");
    return h("div", { class: "panel workbench-summary" }, [
      h("span", { text: text }),
    ]);
  }

  // 时序模型：该部位主测点在**当前时间范围**内的曲线。
  //
  // 这里原来读的是 part.trend（catalog.js 里写死的 5 个日期 + 5 个值）并交给手写 SVG
  // 的 AppCharts.miniChart() 渲染。那是一处真实的穿帮：这张卡上的「展开时序详情」
  // 打开的 scripts/scenes/detailscreen.js 用的是 DATA.series(unitId, pointId, state.range)
  // ——同一个测点，全屏跟随时间范围、卡片不跟随，两处数字对不上；顶栏切 7d/30d/90d 时
  // 全屏动、这张卡不动。现在两边同源于 DATA.series()，口径和 station.js 的
  // renderDetail() 也一致（同一个 primaryPoint、同一个 s.alert）。
  //
  // 图表走 Charts.slot() + ChartOptions.trend()（单条 series 的数组形式），与
  // station/confirm 同一套管线；draw() 由 boot.js 的 renderSceneCharts() 在
  // mountChartSlots() 之后调用，见本文件末尾的 renderWorkbenchCharts()。
  //
  // 改用 trend() 而不是 spark()：卡片净高从 132px 提到 ~340px 之后，spark() 那种
  // "无轴迷你折线"就浪费了多出来的高度——trend() 自带坐标轴/刻度/图例，以及标好
  // "关注线"文字的 markLine + 越线 markArea，同一份 series 数据换一个构造器就能把
  // 净高变大之后腾出来的空间用满，不需要改 core/chartopts.js。
  var TREND_SLOT_ID = "wb-chart-trend";

  function trendPoint(part) {
    return DATA.primaryPoint(part.id);
  }

  function renderTrendCard(part) {
    var point = trendPoint(part);
    var s = DATA.series(AppState.selectedUnitId(), point.id, state.range);
    var slot = Charts.slot(TREND_SLOT_ID);
    return h("section", { class: "panel focus-card trend-focus" }, [
      AppState.panelTitle("时序模型", point.label),
      h("p", { class: "trend-alert", text: s.alert }),
      h("div", { class: "trend-chart-wrap" }, [slot]),
      h("button", { type: "button", class: "plain-button", dataset: { action: "open-trend-detail" }, text: "展开时序详情" }),
    ]);
  }

  // 视觉模型：该 partId 的现场图 + 该图第一帧的 bbox 标注框。
  //
  // part.vision.frames[] 是数据层新增的字段（见 scripts/data/catalog.js），每帧含
  // { id, label, src, bbox:{x,y,w,h}, boxLabel, findings[] }，bbox 是相对**图片本身**
  // 的 0~1 归一化比例，不是相对外层容器——这张卡只取第一帧演示"有标注框"，完整的
  // 多帧切换是视觉详情屏（另一个任务）的事。
  //
  // bbox 必须相对图片实际渲染区域定位：.vision-frame（<figure>）直接只包一个
  // <img>，不设固定宽高、不用 object-fit，让 figure 的盒子精确等于图片渲染出来的
  // 盒子——图片按可用高度等比缩放（height:100%/width:auto），figure 用
  // display:inline-block 收缩到图片实际宽度，那么 bbox 的百分比定位就不会因为
  // "容器是横的、图片是竖的"这种宽高比不一致而整体偏移。figure 之外真正需要
  // letterbox 的留白（图片没铺满整个卡片宽度的部分）用 .vision-frame-wrap 的深色
  // 背景填充，不是现有详情屏那种刺眼的纯白留白。
  function renderVisionCard(part) {
    var frame = part.vision.frames[0];
    var bbox = frame.bbox;
    var boxStyle = "left:" + (bbox.x * 100) + "%;top:" + (bbox.y * 100) + "%;width:" + (bbox.w * 100) + "%;height:" + (bbox.h * 100) + "%;";
    var figure = h("figure", { class: "vision-frame" }, [
      h("img", { class: "vision-frame-img", src: DATA.media(frame.src), alt: frame.label }),
      h("div", { class: "vision-frame-box", style: boxStyle }, [
        h("span", { class: "vision-frame-box-label", text: frame.boxLabel }),
      ]),
    ]);
    return h("section", { class: "panel focus-card vision-focus" }, [
      AppState.panelTitle("视觉模型", part.vision.title),
      h("div", { class: "vision-frame-wrap" }, [figure]),
      h("p", { text: part.vision.finding }),
      h("button", { type: "button", class: "plain-button", dataset: { action: "open-vision-detail" }, text: "展开视觉详情" }),
    ]);
  }

  // AI 建议：status 按 aiFlag 三色，conclusion = aiFlag 口径前缀 + 该部位的 Agent
  // 建议原文（part.agent，6 个部位各自不同），tags 复用该部位的 evidence 前 3 条。
  function renderAiSuggestCard(record, part) {
    var status = aiFlagStatus(record.aiFlag);
    var card = window.Cards.evidence({
      status: status,
      conclusion: aiFlagLead(record.aiFlag) + part.agent,
      tags: part.evidence.slice(0, 3),
    });
    card.className += " ai-suggest-focus";
    return card;
  }

  // Agent 问答入口：保持现状，不随选中记录变化——它是打开浮层的固定入口，浮层内部
  // 使用静态 AgentDialog 数据，不接真实检索或文档跳转。
  function renderAgentEntryCard() {
    var dialog = DATA.agentDialog("workbench-agent");
    return h("section", { class: "panel focus-card agent-focus" }, [
      AppState.panelTitle(dialog.entryTitle, "assistant"),
      h("strong", { text: "综合表单、时序、视觉和知识依据" }),
      h("p", { text: dialog.entryText }),
      h("button", {
        type: "button",
        class: "plain-button",
        dataset: { action: "open-agent-dialog", agentDialogId: "workbench-agent" },
        text: "打开 Agent 问答"
      }),
    ]);
  }

  // ---------- 图表数据绘制（由 boot.js 的 renderSceneCharts() 在 mountChartSlots()
  // 之后调用，与 overview.js/station.js 同一种约定：只往已经 mount 好的槽位里 draw()，
  // 不负责创建/挂载槽位容器本身） ----------
  //
  // 只在 workbench 自身（state.detail 为空）时被调用；state.detail 非空时整屏切到
  // detailscreen.js，画的是那边自己的槽位，见 boot.js 里的分支。
  // part 必须与 renderWorkbench() 里那一份同源——那里是 DATA.part(record.partId)
  // （**选中记录**对应的部位），不是 AppState.selectedPart()（读 state.focus.partId）。
  // 这两者目前大多数时候重合，但依赖这种重合就会出现"卡片标题是 A 部位、曲线画的是
  // B 部位"这种只能靠肉眼发现的错配，所以这里逐字复用同一条推导。
  function renderWorkbenchCharts() {
    var record = selectedRecord();
    var part = DATA.part(record.partId);
    var point = trendPoint(part);
    var s = DATA.series(AppState.selectedUnitId(), point.id, state.range);
    Charts.draw(TREND_SLOT_ID, ChartOptions.trend([s]));
    Charts.flush();
  }

  window.Scenes = window.Scenes || {};
  window.Scenes.renderWorkbench = renderWorkbench;
  window.Scenes.renderWorkbenchCharts = renderWorkbenchCharts;
})();
