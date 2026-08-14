// 场景：复核确认 / 专家决策（DemoData.scenes() 中 key === "confirm"）。
//
// 任务 P2-D：把复核确认从"三个并列面板"改造成显式的三段式决策流——① 证据摘要
// （固定的三项核心测点 spark + 知识命中）→ ② 结论选择（三个 verdict 按钮 + 边界
// 说明）→ ③ 处置路径（未选结论前只做预览且 dimmed + 不可交互，选定后按结论切换
// 成对应闭环的步骤列表 + 执行按钮）。三个 verdict 的取值、以及
// expertVerdict/closureOpen/treatmentDone/observationDone/archived 这些闭环标志位
// 的语义一行不改——本任务只改这三段的"呈现"，状态机继续由 boot.js 的 handleAction/
// selectHandlers 和 core/state.js 的 normalizeState 等函数管，本文件只读它们、不新增
// 事件通路。closureOpen 打开后的处置票卡/激光对中对比/复测验收子屏（renderTreatment）
// 和非维修结论闭环子屏（renderConclusionClosure）保留为独立的"执行屏"，结构不变。
//
// 证据摘要用的三项测点（P-DE-V 主测点 / COUP-PH 相位 / BASE-V 基础振动）是本轮
// P-1 案例的固定证据组合（对应 DemoData.caseKnowledge().firstPass.facts 里的
// 主触发/核心证据/并发证据三项），跟 state.focus.partId（用户在 3D/状态卡上最后点的
// 部位）无关——复核确认页要回答的是"这个案例成不成立"，不是"当前随便看着哪个部位"，
// 所以这三张 spark 卡固定显示这一案例的证据指纹，而不是像 workbench.js 的
// focus-card 那样跟着 AppState.selectedPart() 切换。
//
// 图表：本文件把原来的 AppCharts.miniChart() 换成 Charts.slot() + ChartOptions.spark()
// （沿用 scripts/ui/cards.js 顶部注释里写明的场景层契约："Cards.metric 的 sparkId 只会
// 渲染出一个空的 [data-chart-slot] 占位容器，场景层自己找到这个占位容器再塞入
// Charts.slot(id)"）。boot.js 的 renderSceneCharts() 目前只在 state.scene === "overview"
// 时才会调用 Scenes.renderOverviewCharts()，本任务的改动范围只限定在这两个文件，因此
// 这里不等 boot.js 的通用钩子，而是在 renderConfirm() 自己构建 vdom 的过程中，紧跟着
// Cards.metric(sparkId) 之后立刻自己找到占位容器、调用 Charts.slot()/Charts.draw()
// 把 option 接上，最后统一调一次 Charts.flush()——这正是 cards.js 顶部注释里写的那套
// "场景层自己找到占位容器再塞入 Charts.slot(id)" 契约，只是把"找占位容器"这一步放在
// 这张卡片刚构建出来、还没挂上 stage 之前就做（h() 产出的都是真实 DOM 节点，
// querySelector 在节点挂上 document 之前一样可用）。boot.js 之后仍会对同一个
// [data-chart-slot] 占位容器跑一遍通用的 mountChartSlots()（Charts.slot() 对同一个 id
// 幂等，重复调用只是把同一个节点从当前父节点摘下来再插回同一个父节点，不会出错，也
// 不会产生第二份图表实例），两者不冲突。
(function () {
  "use strict";

  var DATA = window.DemoData;
  var AppState = window.AppState;
  var Charts = window.Charts;
  var ChartOptions = window.ChartOptions;
  var state = window.AppState.value;

  // 本轮案例的证据指纹（DATA.evidencePoints()）、三条结论的文本/处置步骤
  // （DATA.verdicts()）此前都是本文件里的 var 常量，现已全部挪到数据层
  // （scripts/data/catalog.js 的 evidencePoints / verdicts），本文件不再持有任何
  // 业务口径的中文串——业务改结论说法、改处置步骤、改判定测点都只动数据。

  function round2(value) {
    return Math.round(value * 100) / 100;
  }

  function fmtNum(value) {
    return String(round2(value));
  }

  // ---------- ① 证据摘要：3 张固定测点 spark + ≤3 条知识命中 ----------

  // 把 Cards.metric(sparkId) 产出的空占位容器接上真实图表：sparkId 对应的占位容器
  // 一定存在（Cards.metric 内部按 sparkId 渲染），查不到就是契约被破坏，直接抛错，
  // 不做兜底。
  function attachSpark(card, sparkId, option) {
    var host = card.querySelector("[data-chart-slot='" + sparkId + "']");
    if (!host) throw new Error("缺少图表占位容器: " + sparkId);
    var node = Charts.slot(sparkId);
    Charts.draw(sparkId, option);
    if (node.className.indexOf("chart-box-mini") < 0) node.className += " chart-box-mini";
    host.appendChild(node);
    return card;
  }

  function renderEvidenceMetric(unitId, pointId) {
    var s = DATA.series(unitId, pointId, state.range);
    var sparkId = "confirm-spark-" + pointId;
    var card = window.Cards.metric({
      label: s.label,
      value: fmtNum(s.latest),
      unit: s.unit,
      status: s.status,
      note: s.alert,
      sparkId: sparkId,
    });
    return attachSpark(card, sparkId, ChartOptions.spark(s));
  }

  // 知识命中最多展示 3 条（设计上限），报告模板留给归档场景自己的六段式报告，
  // 复核确认阶段只保留和"这个结论成不成立"直接相关的作业卡/专家规则/历史案例。
  function renderKnowledgeEvidence(hit) {
    return window.Cards.evidence({
      status: "warn",
      conclusion: hit.title + "：" + hit.reason,
      tags: [hit.type, hit.source],
    });
  }

  function renderEvidenceSummary() {
    var unitId = AppState.selectedUnitId();
    return h("section", { class: "panel evidence-summary" }, [
      renderSectionHead("①", "核心证据", unitId + " · 关键测点"),
      h("p", { class: "evidence-lead", text: DATA.caseKnowledge().firstPass.summary }),
      h("div", { class: "evidence-metrics" }, DATA.evidencePoints().map(function (pointId) {
        return renderEvidenceMetric(unitId, pointId);
      })),
      h("div", { class: "evidence-knowledge" }, [
        h("p", { class: "evidence-subhead", text: "知识命中" }),
        h("div", { class: "evidence-knowledge-list" }, DATA.knowledgeHits().slice(0, 3).map(renderKnowledgeEvidence)),
      ]),
    ]);
  }

  // ---------- ② 结论选择：三个 verdict 按钮 + 选中后的边界说明 ----------

  // 按钮和文案全部由 DATA.verdicts() 驱动：三条结论的文本、hint、impact 都在数据层
  // （catalog.js 的 verdicts 数组），这里不再出现任何结论中文串，也不再用 if/else
  // 逐条匹配。业务增删一条结论只改数据，按钮数量和文案自动跟着变。
  function verdictButton(item) {
    return h("button", {
      type: "button",
      class: "verdict-button " + (state.expertVerdict === item.label ? "active" : ""),
      // dataset.verdict 仍存 label：state.expertVerdict 的持久化格式没变（存 label），
      // boot.js 的点击处理也按 label 落盘，避免为这次收口去改 STORAGE_KEY。
      dataset: { verdict: item.label },
    }, [
      h("strong", { text: item.label }),
      h("span", { text: item.hint }),
    ]);
  }

  // 选中之后才出现的一句边界说明（数据层的 impact 字段）：跟按钮里常驻的 hint 不是
  // 一回事——hint 说的是"选了会怎样"，impact 说的是"选了之后不会怎样/和另外两条路径
  // 互斥"，帮助专家确认这是一次排他性的结论选择，不是可以叠加的多选项。
  function renderVerdictPanel() {
    var current = DATA.verdictByLabel(state.expertVerdict);
    return h("aside", { class: "panel verdict-panel" }, [
      renderSectionHead("②", "结论选择", DATA.workOrder().id),
      h("div", { class: "verdict-options" }, DATA.verdicts().map(verdictButton)),
      current ? h("p", { class: "verdict-boundary", text: current.impact }) : null,
    ]);
  }

  // ---------- ③ 处置路径：未选结论前 dimmed 预览，选定后切换成对应闭环步骤 ----------

  // 下面三个函数统一按 DATA.verdictByLabel() 取到的那条结论派生，不再逐条比较中文串。
  // 维修路径的步骤取自 workOrder.steps（处置票卡本身就是那份步骤，数据层的
  // verdicts[].steps 对维修那条刻意留 null，避免同一份步骤存两份、改一处漏一处）。

  function verdictActionText() {
    var current = DATA.verdictByLabel(state.expertVerdict);
    if (!current) return "请选择专家结论";
    return current.isMaintenance ? "生成处置票卡" : current.hint.split("，")[0];
  }

  function treatmentStepsOf(current) {
    return current.isMaintenance ? DATA.workOrder().steps : current.steps;
  }

  // 步数不写死："（4 步）""（6 步）"原来是手数出来的字面量，改了 steps 就会和实际
  // 条数不符。这里直接用数组长度。
  function treatmentPathLabel(current) {
    var steps = treatmentStepsOf(current);
    if (current.isMaintenance) return DATA.workOrder().title + "（" + steps.length + " 步）";
    return current.label + "闭环（" + steps.length + " 步）";
  }

  // 未选结论前：整段可见但 dimmed（CSS 的 .treatment-path.pending，见 10-confirm.css）+
  // pointer-events:none 不可交互，内容是"选完之后会怎样"的固定预览，不是某一条路径的
  // 抢跑展示——三条路径平铺列出，不暗示任何一条是默认项。
  function renderTreatmentPreview() {
    return h("div", { class: "treatment-preview" }, [
      h("p", { class: "muted", text: "选择②的专家结论后，这里会展开对应的处置路径：" }),
      // 三条路径由 DATA.verdicts() 平铺列出，不暗示任何一条是默认项。步数用
      // steps.length 现算，不写死"（6 步）"这类字面量——原来是手数出来的，
      // 业务改了 steps 就会和实际条数不符，而且不会有任何报错。
      h("ul", { class: "treatment-preview-list" }, DATA.verdicts().map(function (item) {
        var steps = treatmentStepsOf(item);
        return h("li", { text: item.label + " → " + treatmentPathLabel(item) + "：" + steps[steps.length - 1] });
      })),
    ]);
  }

  function renderTreatmentSteps(current) {
    return h("div", { class: "treatment-path-body" }, [
      h("p", { class: "treatment-path-label", text: treatmentPathLabel(current) }),
      h("ol", { class: "treatment-path-steps" }, treatmentStepsOf(current).map(function (step) {
        return h("li", { text: step });
      })),
      h("button", {
        type: "button",
        class: "primary-action treatment-execute",
        dataset: { action: "go-treatment" },
        text: verdictActionText(),
      }),
    ]);
  }

  function renderTreatmentPath() {
    // current 为 null 表示"还没选结论"——这是状态机的合法状态（对应 pending 预览），
    // 不是数据缺失，所以 verdictByLabel 对空串返回 null 而不抛错。
    var current = DATA.verdictByLabel(state.expertVerdict);
    var pending = !current;
    return h("section", {
      class: "panel treatment-path" + (pending ? " pending" : ""),
      "aria-disabled": pending ? "true" : "false",
    }, [
      renderSectionHead("③", "处置路径", pending ? "待选择结论" : current.label),
      pending ? renderTreatmentPreview() : renderTreatmentSteps(current),
    ]);
  }

  // ---------- 段头：显式的 ①②③ 序号，视觉上强调这是一条有顺序的决策流程 ----------

  function renderSectionHead(index, title, meta) {
    return h("div", { class: "panel-title confirm-section-head" }, [
      h("span", { class: "confirm-section-title-group" }, [
        h("span", { class: "confirm-step-index", "aria-hidden": "true", text: index }),
        h("span", { text: title }),
      ]),
      h("small", { text: meta }),
    ]);
  }

  // ---------- 顶层：复核确认三段式决策页 ----------

  function renderConfirm() {
    return AppState.pageShell(
      "复核确认 / 专家决策",
      AppState.isNonMaintenanceVerdict(state.expertVerdict) ? "复核确认与结论闭环" : "复核确认与处置票卡",
      h("button", {
        type: "button",
        class: "primary-action",
        disabled: state.expertVerdict === "",
        dataset: { action: "go-treatment" },
        text: verdictActionText(),
      }),
      h("div", { class: "confirm-grid" }, [
        renderEvidenceSummary(),
        renderVerdictPanel(),
        renderTreatmentPath(),
      ])
    );
  }

  // 三段式决策页里 ① 用到的三张固定测点 spark 需要在 renderConfirm() 的 vdom 构建
  // 过程中同步调用 Charts.draw()（见 attachSpark()），因此这里不需要额外的
  // renderConfirmCharts() 导出——render() 本身已经把图表接好了，跟 overview.js 那种
  // "先建占位容器、后由 boot.js 的 renderSceneCharts() 统一 draw" 的两段式不同。
  // Charts.flush() 只需要在所有 draw() 排队完之后调用一次；调用点放在 renderConfirm()
  // 末尾，与 attachSpark() 里的 Charts.draw() 属于同一次 render() 里的同一轮
  // pending 队列。
  function renderConfirmAndFlush() {
    var scene = renderConfirm();
    Charts.flush();
    return scene;
  }

  // ---------- closureOpen 执行屏之一：处置票卡 + 激光对中前后对比 + 复测验收 ----------
  // 结论为"确认不对中"时，state.closureOpen === true 打开这一屏；非维修结论
  // （继续观察/排除误报）走 renderConclusionClosure()。两者都保持原有结构，本任务
  // 不改动。

  function renderTreatment() {
    if (AppState.isNonMaintenanceVerdict(state.expertVerdict)) return renderConclusionClosure();
    return AppState.pageShell(
      "处置闭环 / 票卡复测",
      "P-1 不对中处置票卡与复测反馈",
      h("button", { type: "button", class: "primary-action", disabled: !state.treatmentDone, dataset: { action: "go-archive" }, text: "进入报告归档" }),
      h("div", { class: "treatment-grid" }, [
        h("section", { class: "panel ticket-panel" }, [
          AppState.panelTitle("处置票卡", DATA.workOrder().id),
          h("h3", { text: DATA.workOrder().title }),
          h("div", { class: "role-row" }, DATA.workOrder().roles.map(function (role) { return h("span", { text: role }); })),
          h("ol", { class: "ticket-steps" }, DATA.workOrder().steps.map(function (step) { return h("li", { text: step }); })),
        ]),
        h("section", { class: "panel compare-panel" }, [
          AppState.panelTitle("激光对中前后对比", "visual evidence"),
          h("div", { class: "compare-images" }, [
            h("figure", {}, [
              h("img", { src: DATA.media("laserBefore"), alt: "激光对中调整前" }),
              h("figcaption", { text: "调整前：相位差和对中偏差作为处置前证据。" }),
            ]),
            h("figure", {}, [
              h("img", { src: DATA.media("laserAfter"), alt: "激光对中调整后" }),
              h("figcaption", { text: "调整后：用于报告归档和案例复用的复测证据。" }),
            ]),
          ]),
        ]),
        h("aside", { class: "panel feedback-panel" }, [
          AppState.panelTitle("复测验收", "feedback"),
          h("div", { class: "feedback-cards" }, [
            feedback("振动回落", "5.82 -> 1.80 mm/s"),
            feedback("相位复核", "-81.06° -> -12.4°"),
            feedback("验收结论", "满足演示验收口径"),
          ]),
          h("button", { type: "button", class: "primary-action", disabled: state.treatmentDone, dataset: { action: "confirm-treatment" }, text: state.treatmentDone ? "复测已确认" : "确认复测反馈" }),
        ]),
      ])
    );
  }

  function feedback(label, value) {
    return h("div", {}, [h("span", { text: label }), h("strong", { text: value })]);
  }

  function renderConclusionClosure() {
    var isObserve = DATA.verdictByLabel(state.expertVerdict).id === "observe";
    return AppState.pageShell(
      "结论闭环 / 非维修路径",
      isObserve ? "P-1 继续观察记录" : "P-1 误报反馈记录",
      h("button", { type: "button", class: "primary-action", disabled: !state.observationDone, dataset: { action: "go-archive" }, text: "进入结论归档" }),
      h("div", { class: "closure-grid" }, [
        h("section", { class: "panel closure-panel" }, [
          AppState.panelTitle("专家结论", isObserve ? "observe" : "false positive"),
          h("h3", { text: state.expertVerdict }),
          h("p", { text: isObserve ? "保留当前证据链，设置观察窗口和复评条件，不生成维修处置票卡。" : "记录排除依据并反馈模型标签，不进入维修处置票卡。" }),
          h("div", { class: "closure-tags" }, (isObserve ? ["48h 观察窗口", "振动趋势复评", "不触发维修案例"] : ["误报反馈", "样本回流", "不触发处置票卡"]).map(function (tag) {
            return h("span", { text: tag });
          })),
        ]),
        h("section", { class: "panel closure-panel" }, [
          AppState.panelTitle("依据摘要", AppState.selectedPart().label),
          h("div", { class: "evidence-list" }, AppState.selectedPart().evidence.slice(0, 3).map(function (item) {
            return h("div", {}, [h("span", { class: "dot warn" }), h("span", { text: item })]);
          })),
          h("p", { class: "muted", text: isObserve ? "本轮仅形成观察记录，后续由 Agent 在复评窗口内提醒复核。" : "本轮形成误报样本，用于后续模型阈值和规则解释优化。" }),
        ]),
        h("aside", { class: "panel closure-panel" }, [
          AppState.panelTitle("闭环动作", "archive ready"),
          h("div", { class: "feedback-cards" }, [
            feedback(isObserve ? "观察窗口" : "反馈类型", isObserve ? "48h / 趋势复评" : "模型误报样本"),
            feedback("处置票卡", "不生成"),
            feedback("二次命中", "不解锁维修案例"),
          ]),
          h("button", { type: "button", class: "primary-action", disabled: state.observationDone, dataset: { action: "confirm-observation" }, text: state.observationDone ? "闭环已确认" : "确认闭环记录" }),
        ]),
      ])
    );
  }

  window.Scenes = window.Scenes || {};
  window.Scenes.renderConfirm = renderConfirmAndFlush;
  window.Scenes.renderTreatment = renderTreatment;
})();
