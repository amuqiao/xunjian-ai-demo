// 引导层：全局存在性断言 + render 管线 + 事件委托 + 启动。是加载顺序里最后一个文件，
// 因此可以引用之前任何一层暴露的全局（contract → vendor → data → pump3d → core →
// scenes），但反过来任何更早的文件都不能引用 boot.js 里的东西。
//
// 分层与加载顺序（写在这里是因为 index.html 的 <script> 顺序就是照这份清单排的，
// 违反顺序会被下面的全局存在性断言第一时间指名道姓地指出来，而不是留给后续某个
// 随机的 undefined 报错）：
//   L0 vendor  : vendor/echarts.min.js, vendor/three.min.js
//   L1 契约    : scripts/pump3d/contract.js
//   L2 数据    : scripts/data/catalog.js, scripts/data/knowledge.js, scripts/data/index.js
//   L3 3D      : scripts/pump3d/model.js, scripts/pump3d/engine.js
//   L4 core    : scripts/core/dom.js, scripts/core/state.js, scripts/core/charts.js,
//                scripts/core/chartopts.js
//   L5 ui      : scripts/ui/cards.js, scripts/ui/selectlist.js, scripts/ui/detailcard.js,
//                scripts/ui/overlay.js, scripts/ui/agentdialog.js
//   L6 场景    : scripts/scenes/overview.js station.js workbench.js confirm.js
//                archive.js knowledge.js graph.js
//   L7 引导    : scripts/boot.js（本文件）
// 同一层内部不得互相引用（scenes/*.js 之间尤其不能，每个场景文件必须能被单独抽走）；
// 只能引用严格更早层暴露的全局。
(function () {
  "use strict";

  function assertGlobal(name, value) {
    if (!value) {
      throw new Error("缺少全局依赖 " + name + "，请检查 index.html 的 <script> 加载顺序");
    }
  }

  assertGlobal("echarts", window.echarts);
  assertGlobal("THREE", window.THREE);
  assertGlobal("Pump3DContract", window.Pump3DContract);
  assertGlobal("DemoData", window.DemoData);
  assertGlobal("Pump3DModel", window.Pump3DModel);
  assertGlobal("Pump3D", window.Pump3D);
  assertGlobal("h", window.h);
  assertGlobal("append", window.append);
  assertGlobal("renderPumpTrain", window.renderPumpTrain);
  assertGlobal("AppState", window.AppState);
  assertGlobal("Charts", window.Charts);
  assertGlobal("ChartOptions", window.ChartOptions);
  assertGlobal("SelectList", window.SelectList);
  assertGlobal("SceneTimers", window.SceneTimers);
  assertGlobal("DemoDataSchema", window.DemoDataSchema);
  assertGlobal("Overlay", window.Overlay);
  assertGlobal("AgentDialog", window.AgentDialog);
  assertGlobal("Scenes", window.Scenes);

  var DATA = window.DemoData;
  var AppState = window.AppState;
  var Scenes = window.Scenes;
  var state = window.AppState.value;
  var sceneOrder = AppState.sceneOrder;

  var stage = document.getElementById("stage");
  var sceneNav = document.getElementById("sceneNav");
  var brandSub = document.getElementById("brandSub");
  var clock = document.getElementById("clock");
  var statusLine = document.getElementById("statusLine");
  var flowHint = document.getElementById("flowHint");
  var flowTrack = document.getElementById("flowTrack");

  // 首次 render 前的数据/DOM 契约断言：见 scripts/pump3d/contract.js 顶部注释。
  window.Pump3DContract.assertData();
  // 数据集 schema 校验：换了 kb-dataset.js / graph-spec.js 之后，不合规会在这里指名道姓
  // 地抛错，而不是等到某个场景静默渲染成空白（本项目已因这类静默失败折腾过两次）。
  // 与 assertData() 互相独立，谁先谁后都可以。
  window.DemoDataSchema.assertAll();

  // 启动序列里只跑一次：把 styles/01-tokens.css 里的主题色变量读出来注入
  // ChartOptions，ECharts 的配色跟着 CSS 变量走，不在 JS 里另抄一份色值
  // （chartopts.js 顶部注释里点名要求"配色只有一份真源"）。放在 render() 外面，
  // 不要挪进 render() 里逐帧重复调用。
  window.ChartOptions.setTheme(readCssTheme());

  function readCssTheme() {
    var computed = getComputedStyle(document.documentElement);
    function cssVar(name) {
      var value = computed.getPropertyValue(name).trim();
      if (!value) throw new Error("缺少 CSS 变量 " + name + "，请检查 styles/01-tokens.css");
      return value;
    }
    return {
      cyan: cssVar("--cyan"),
      green: cssVar("--green"),
      amber: cssVar("--amber"),
      red: cssVar("--red"),
      ink: cssVar("--ink"),
      muted: cssVar("--muted"),
      lineStrong: cssVar("--line-strong")
    };
  }

  function setScene(sceneKey) {
    if (sceneKey !== "station") return;
    if (sceneOrder.indexOf(sceneKey) < 0 || !AppState.canOpen(sceneKey)) return;
    // 必须在 state.scene 改写之前、对**被离开的那个场景**清一次：残留定时器会继续调
    // render()，把已经切走的场景反复重渲染。clearScene 无差别清掉该场景全部定时器，
    // 包括 persist 的。
    window.SceneTimers.clearScene(state.scene);
    state.scene = sceneKey;
    if (sceneKey === "workbench") state.diagnosisReady = true;
    if (sceneKey === "workbench" || sceneKey === "confirm" || sceneKey === "archive") state.focus.unitId = AppState.diagnosisUnit().id;
    state.detail = "";
    state.closureOpen = false;
    if (sceneKey !== "knowledge") state.pick.knowledge.ingestOpen = false;
    closeAgentDialogState();
    AppState.markFlowStep(sceneKey === "overview" ? "task" : sceneKey === "workbench" ? "inspection" : sceneKey);
    AppState.save();
    render();
    resetScroll();
    stage.focus();
  }

  function resetScroll() {
    stage.scrollTop = 0;
    if (document.scrollingElement) document.scrollingElement.scrollTop = 0;
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    window.scrollTo(0, 0);
  }

  function resetState() {
    // "重置演示"要等价于刚加载页面，所以逐个场景清干净——clearAll() 放过 persist 定时器，
    // 单靠它会让上一轮留下的动画定时器活到重置之后。
    AppState.sceneOrder.forEach(function (key) { window.SceneTimers.clearScene(key); });
    AppState.reset();
    // Charts.disposeAll() 按 core/charts.js 顶部注释"仅'重置演示'调用"的约定，只在
    // 这个入口调用：把持久化的图表实例/槽位一并清空，回到与刚加载页面等价的初始
    // 状态，而不是让旧图表实例带着上一轮的 option 残留下去。
    window.Charts.disposeAll();
    render();
    stage.focus();
  }

  function render() {
    // 记焦点必须在拆 DOM 之前：拆完再读 document.activeElement 只会读到 <body>。
    // 见文件末尾 Focus 的注释。
    var focusMark = Focus.remember();
    brandSub.textContent = DATA.meta().subtitle + " · " + DATA.meta().batch;
    clock.textContent = DATA.meta().clock;
    statusLine.textContent = currentStatusLine();
    renderNav();
    // 这里曾经调用 AppCharts.dispose()：旧版 overview.js 直接用 AppCharts.chart(id)
    // （每次 render 都 dispose 再重新 init 一遍 ECharts 实例），需要在拆 DOM 前先解绑。
    // 所有场景都已迁到 window.Charts 的持久化槽位（Charts.slot/draw/flush），旧的
    // window.AppCharts 整套 API 已在阶段三整合时删除，见 core/charts.js 顶部注释。
    // detach 必须在 stage.innerHTML="" 之前：canvas 若被 innerHTML="" 整体拆除，
    // pointer capture 会卡死（engine.js 的 detach() 注释里有说明）。
    window.Pump3D.detach();
    stage.innerHTML = "";
    // 每轮渲染开始时清空 SelectList 的"同一轮内 name 不得重复"记录：必须在
    // renderScene() 真正产出新一轮 DOM 之前调用，否则上一轮渲染留下的记录会把这一轮
    // 的第一次使用误判成重复（scripts/ui/selectlist.js 顶部注释里的原话）。
    window.SelectList.resetRenderPass();
    // 同理划清"一轮 render"的边界，让 Charts 的重复 id 守卫按 render 次数判定，
    // 而不是按 rAF 周期判定——见 core/charts.js 的 beginPass() 注释。
    window.Charts.beginPass();
    // 渲染级定时器同批清理。persist 定时器不在此清（RAG 五段动画的完成定时器需要跨越
    // "触发动画的那次 render"存活），它们由 setScene 里的 clearScene 在离开场景时清掉。
    window.SceneTimers.clearAll();
    stage.appendChild(renderScene());
    stage.appendChild(renderAgentDialog());
    renderGlobalFlowRail();
    bindStage();
    // 通用步骤：把 Cards.chart/sparkId 渲染出的空 [data-chart-slot] 占位容器换成
    // Charts.slot() 返回的持久化图表节点。这一步只做"接上容器"，不关心容器里要画
    // 什么 option——和 mountPump3d() 一样，是渲染管线里"把已知的 DOM 契约点位接好"
    // 这一类通用步骤，因此放在 boot.js 而不是场景文件里；场景专属的"画什么"逻辑
    // 留在 renderSceneCharts() 里调用各场景自己的 renderXxxCharts()。必须在
    // stage.appendChild(renderScene()) 之后调用，占位容器才真的在 DOM 里。
    mountChartSlots();
    renderSceneCharts();
    // mount 必须在 append 之后：3D 宿主要先真的挂到 DOM 树上，clientWidth/clientHeight
    // 才有意义（见 mountPump3d 里 stage.contains(host) 的断言）。
    mountPump3d();
    // 每次 render 之后校验 data-part 命名空间：这条只有在 DOM 已经渲染完时才有意义，
    // 放在首次 render 之前（assertData 里）等于空判断。
    window.Pump3DContract.assertPinNamespace();
    // 找回焦点必须在新 DOM 已经挂好、bindStage() 已经重新绑好事件之后，否则
    // element.focus() 找到的是一个还没有点击/键盘监听的节点。
    Focus.restore(focusMark);
    focusActiveKnowledgeModal();
  }

  function currentStatusLine() {
    if (state.scene === "graph" && state.pick.knowledge.view === "library") return "参考视图：泵知识库已加载作业卡、规则、报告和归档案例，可打开 Agent 问答查看静态命中标签。";
    if (state.scene === "graph") return "参考视图：新知识图谱模块已加载，可在知识图和知识库之间切换。";
    if (state.archived && DATA.isMaintenanceVerdict(state.expertVerdict)) return "输油泵故障复核案例已归档，相似工单命中已解锁。";
    if (state.archived) return "非维修结论已归档为观察/模型反馈记录，不触发二次维修案例命中。";
    if (state.treatmentDone) return "处置票卡和复测证据已确认，可生成归档报告。";
    if (state.observationDone) return "非维修结论已形成闭环记录，可归档为观察/模型反馈样本。";
    if (DATA.isMaintenanceVerdict(state.expertVerdict)) return "专家已确认进入输油泵故障复核，待执行处置票卡和复测确认。";
    if (state.expertVerdict) return "专家已选择非维修结论，待生成观察记录或误报反馈。";
    if (state.scene === "confirm") return "已进入复核确认，请选择专家结论和处置路径。";
    if (state.scene === "workbench") return "诊断工作台已加载巡检记录、时序模型、视觉/数据、规则和 Agent 证据。";
    if (state.scene === "station") return "部位态势已定位到 P-1 输油泵关键部位和风险点。";
    return "本轮 P-1 典型故障复核任务已加载，请从泵部位态势进入部位诊断。";
  }

  function renderNav() {
    sceneNav.innerHTML = "";
    DATA.scenes().forEach(function (scene, index) {
      var locked = !AppState.canOpen(scene.key);
      var active = state.scene === scene.key;
      var button = h("button", {
        type: "button",
        class: "scene-button " + (active ? "active " : "") + (locked ? "locked" : ""),
        disabled: locked,
        dataset: { scene: scene.key },
      }, [
        h("span", { class: "scene-index", text: String(index + 1).padStart(2, "0") }),
        h("span", { class: "scene-label", text: scene.label }),
        h("span", { class: "scene-node", text: scene.node }),
      ]);
      button.addEventListener("click", function () { setScene(scene.key); });
      sceneNav.appendChild(button);
    });
  }

  function renderScene() {
    if (state.scene !== "station") state.scene = "station";
    return Scenes.renderStation();
  }

  // 通用挂接步骤：找到本轮渲染出的所有 [data-chart-slot] 占位容器，把
  // Charts.slot(id) 返回的持久化节点塞进去。sl-item-spark（SelectList items[].sparkId）
  // 和 card-metric-spark（Cards.metric 的 sparkId）都是"卡片内置迷你图"占位符，天然
  // 没有可继承的显式高度（chart-box 默认 height:100%，需要一个已定尺寸的祖先才撑得
  // 开）；04-charts.css 已经准备好 .chart-box-mini 变体（height:auto，min-height:96px）
  // 正是为了这种场景，这里按占位符的 class 决定要不要打上这个变体类，而不需要每个
  // 场景各自记得加——这是"挂接图表容器"这个通用步骤本身该负责的事。
  function mountChartSlots() {
    stage.querySelectorAll("[data-chart-slot]").forEach(function (placeholder) {
      var id = placeholder.dataset.chartSlot;
      var node = window.Charts.slot(id);
      var isMiniSlot = placeholder.className.indexOf("sl-item-spark") >= 0 ||
        placeholder.className.indexOf("card-metric-spark") >= 0;
      if (isMiniSlot && node.className.indexOf("chart-box-mini") < 0) {
        node.className += " chart-box-mini";
      }
      placeholder.appendChild(node);
    });
  }

  function renderSceneCharts() {
    Scenes.renderStationCharts();
  }

  function mountPump3d() {
    var hosts = stage.querySelectorAll("[" + window.Pump3DContract.HOST_ATTR + "]");
    if (hosts.length > 1) throw new Error("同一场景渲染了多个 3D 泵机组宿主，Pump3D 只支持一个：" + hosts.length);
    if (!hosts.length) return;
    var host = hosts[0];
    // 防止有人把 mountPump3d 挪到 stage.appendChild(renderScene()) 之前：host 必须已经
    // 真的挂在 stage 下，assertDom 里读 clientWidth 才有意义。
    if (!stage.contains(host)) throw new Error("mountPump3d 必须在 3D 宿主 append 到 stage 之后调用");
    var statuses = {};
    DATA.parts().forEach(function (part) {
      statuses[part.id] = part.status;
    });
    window.Pump3D.mount(host, {
      preset: host.dataset.pump3dPreset,
      activeId: state.focus.partId,
      statuses: statuses,
    });
  }

  function activeFlowIndex() {
    if (state.scene === "archive" || state.archived || state.treatmentDone || state.observationDone) return 7;
    if (state.scene === "confirm" || state.expertVerdict) return 6;
    if (state.scene === "workbench") {
      if (state.agentDialog.open && state.agentDialog.dialogId === "workbench-agent") return 5;
      if (state.detail === "vision") return 4;
      if (state.detail === "trend") return 3;
      return 2;
    }
    if (state.scene === "station") return 1;
    return 0;
  }


  function flowTarget(stepKey) {
    if (stepKey === "task") return "overview";
    if (stepKey === "station") return "station";
    if (stepKey === "inspection" || stepKey === "trend" || stepKey === "vision" || stepKey === "agent") return "workbench";
    if (stepKey === "confirm") return "confirm";
    if (stepKey === "archive") return "archive";
    return "overview";
  }

  function canVisitFlowStep(stepKey) {
    if (stepKey === "archive") return state.treatmentDone || state.observationDone || state.archived;
    if (stepKey === "confirm") return state.diagnosisReady || state.expertVerdict !== "" || state.treatmentDone || state.observationDone || state.archived;
    return true;
  }

  function openFlowStep(stepKey) {
    if (!canVisitFlowStep(stepKey)) return;
    if (stepKey === "trend" || stepKey === "vision" || stepKey === "agent" || stepKey === "inspection") {
      state.scene = "workbench";
      state.focus.unitId = AppState.diagnosisUnit().id;
      state.diagnosisReady = true;
      state.detail = stepKey === "trend" ? "trend" : stepKey === "vision" ? "vision" : "";
      if (stepKey === "agent") openAgentDialogState("workbench-agent");
      else closeAgentDialogState();
      AppState.markFlowStep("inspection");
      AppState.markFlowStep(stepKey);
      AppState.save();
      render();
      if (stepKey === "trend" || stepKey === "vision") focusInlineDetail();
      else resetScroll();
      if (stepKey === "agent") focusAgentDialog();
      return;
    }
    setScene(flowTarget(stepKey));
  }

  function renderGlobalFlowRail() {
    if (!flowHint || !flowTrack) return;
    flowHint.textContent = state.scene === "graph"
      ? "流程步骤 · 当前为知识参考视图，不改变主闭环进度"
      : state.archived && DATA.isMaintenanceVerdict(state.expertVerdict)
        ? "流程步骤 · 输油泵故障案例已归档，可供相似工单命中"
        : "流程步骤 · 部位、时序、视觉/数据、规则和 Agent 均只辅助专家判断";
    var active = activeFlowIndex();
    flowTrack.innerHTML = "";
    flowStepsForVerdict().forEach(function (step, index) {
      var disabled = !canVisitFlowStep(step.key);
      var visited = state.flowVisited.indexOf(step.key) >= 0;
      var cls = "flow-step";
      if (visited && index !== active) cls += " done";
      if (index === active) cls += " active";
      var button = h("button", {
        class: cls,
        type: "button",
        disabled: disabled,
        dataset: { flowStep: step.key, idx: String(index + 1) },
        title: disabled ? "请先完成前序确认" : step.label,
      }, [
        h("strong", { text: step.label }),
        h("small", { text: step.desc || "" }),
      ]);
      button.addEventListener("click", function () {
        if (disabled) return;
        openFlowStep(step.key);
      });
      flowTrack.appendChild(button);
    });
  }

  function flowStepsForVerdict() {
    if (!AppState.isNonMaintenanceVerdict(state.expertVerdict)) return DATA.flowSteps();
    return DATA.flowSteps().map(function (step) {
      if (step.key === "archive") return { key: step.key, label: "结论归档", desc: "观察 / 误报 / 反馈" };
      return step;
    });
  }

  // ---------- 选中态写入入口（data-select 分发表 + 双向联动的两个入口函数） ----------
  //
  // 这几个函数处理的都是"刚刚发生的一次真实用户交互"：id 来自 DemoData 派生出的
  // dataset 值，理应必然合法。一旦查不到，说明契约被破坏（比如渲染层拼错了 id），
  // 这里全部直接借 DemoData 自带的会抛错的查找函数（DATA.point/DATA.unit/
  // DATA.primaryPoint）来校验——查不到直接抛错，不做兜底、不静默退回默认值。
  // 这跟 core/state.js 里 normalizeState/cleanFocus/cleanPick 对"持久化状态"的
  // 宽松校验（查不到就退回默认值）是两条不同的路径，不要糊到一起。

  // 时间范围是全局的，但 state.pick.* 里有一项是**随范围变化的集合的成员**：
  // pick.workbench 指向 DATA.records(unitId, range) 里的一条，而记录条数随范围变化
  // （7d≈7 条 / 30d≈24 条 / 90d=40 条）。所以在 90d 下选中一条只存在于 90d 的记录、
  // 再把范围缩到 7d 之后，那个 id 就不在 workbench 的 SelectList items 里了，
  // activeId 校验会直接抛错、整个 workbench 渲染中断、页面空白。
  //
  // 这和之前 pick.overview 存成 MOT-DE-H 导致整页空白是**同一个模式**：
  // "某个 pick 值对它自己的语义集合而言已经失效，却没有人在集合变化时收紧它"。
  // 区别在于那次是持久化路径（normalizeState 的字典用错了），这次是运行期路径
  // （range 改变会让集合缩小，但没有同步收紧 pick）。
  //
  // 收紧到"新范围内最近的一条"而不是抛错：缩小时间范围是完全正常的用户操作，
  // 让它报错是错的；也不是兜底吞错——这是显式维护"pick 必须落在当前可见集合内"
  // 这条不变量，行为是定义好的、可预期的。
  function clampPicksToRange() {
    var records = DATA.records(AppState.diagnosisUnit().id, state.range);
    // 记录是按日期**新→旧**排的（实测 records("P-1","7d")[0] 是 07-22、末项是 07-16），
    // 所以"新范围内最近的一条"是 records[0]，不是末项。
    if (!records.length) throw new Error("时间范围 " + state.range + " 内没有任何巡检记录，无法收紧 pick.workbench");
    var stillThere = records.some(function (record) { return record.id === state.pick.workbench; });
    if (!stillThere) state.pick.workbench = records[0].id;
  }

  function selectRange(rangeKey) {
    if (!DATA.ranges().some(function (range) { return range.key === rangeKey; })) {
      throw new Error("未知的时间范围：" + rangeKey);
    }
    state.range = rangeKey;
    clampPicksToRange();
    AppState.save();
    render();
  }

  // 双向联动之一：从 overview 状态卡选中的测点推出它所属的部位，两者一起写完
  // 之后只调一次 render()。渲染管线是 pull 式的（render() 每次都从 state 现读
  // 现画，不缓存派生值），selectOverviewCard 和 selectPart 各自是完全独立的一个
  // 函数、互相不调用对方，所以不会因为"你推我、我推你"而成环——环需要 A 调 B、
  // B 又调 A 才会发生，这里两个入口各自终止在自己的一次 render() 上。
  // UNIT-H（机组健康）是 series.js healthSeries() 算出的整机聚合分，不是
  // DemoData.points() 里的任何一个测点，因此没有 partId 可推导——选中它时
  // focus.partId 保持不变。这是刻意设计的行为（健康分是整机口径，不应该因为点了
  // 这张卡就把 3D 高亮和其它测点卡跳到某个具体部位去），不是漏做的兜底：其余任何
  // 未知 id 仍然会经过 DATA.point(pointId) 直接抛错暴露出来。
  function selectOverviewCard(pointId) {
    state.pick.overview = pointId;
    if (pointId !== "UNIT-H") {
      var point = DATA.point(pointId);
      if (point.partId) state.focus.partId = point.partId;
    }
    AppState.save();
    render();
  }

  // 双向联动之二：从 3D 热点 / 部位列表选中的部位推出它的主测点，理由同上。
  //
  // 例外：overview 只有 6 张状态卡（见 scenes/overview.js 的 CARD_DEFS），覆盖的是
  // 4 个部位（front-bearing 上有 P-DE-V 和 BRG-T 两张，coupling/base/pump-body 各
  // 一张），motor 和 seal 的主测点（MOT-DE-H/SEAL-L）不在这 6 张卡里。这两个部位
  // 的 3D 热点被点击时，没有一张"该部位主测点"卡可跳，因此 pick.overview 保持
  // 不变——只更新 focus.partId（3D 高亮）。这不是兜底：如果不做这个判断，
  // pick.overview 会被写成一个不在 SelectList items 里的 id，下一次 render 时
  // SelectList 的 activeId 校验会直接抛错，把整个 overview 页面渲染炸掉。
  function selectPart(partId) {
    var primary = DATA.primaryPoint(partId);
    state.focus.partId = partId;
    if (window.Scenes.overviewPickablePoints.indexOf(primary.id) >= 0) {
      state.pick.overview = primary.id;
    }
    AppState.save();
    render();
  }

  function selectUnitFocus(unitId) {
    DATA.unit(unitId);
    state.focus.unitId = unitId;
    AppState.save();
    render();
  }

  // 分发表：data-select 支持的 name 清单。overview-metric/unit/range 是本轮接进来
  // 的三个，其余暂时没有实际渲染方（knowledge/graph 的选中项还没有对应的 UI），
  // 但结构留在这里，以后加一种可选列表只需要在这张表里加一行。
  // 选中一条巡检记录：写 pick.workbench，并把 focus.partId 同步到该记录关联的部位。
  // 同步 focus 是整个应用连贯性的收益点——切回 station/overview 时 3D 已经高亮在
  // 对应部位上，而不是让用户再点一次。
  function selectWorkbenchRecord(recordId) {
    var record = DATA.record(recordId);
    state.pick.workbench = record.id;
    if (record.partId) state.focus.partId = DATA.part(record.partId).id;
    AppState.save();
    render();
  }

  function openDoc(element) {
    if (!element) throw new Error("open-doc 需要触发元素");
    var docId = element.getAttribute("data-select-id");
    state.pick.knowledge.docId = DATA.kbDocument(docId).id;
    state.pick.knowledge.chunkIndex = null;
    state.pick.knowledge.ingestOpen = false;
    AppState.save();
    render();
    focusActiveKnowledgeModal();
  }

  function closeAgentDialogState() {
    state.agentDialog.open = false;
    state.agentDialog.dialogId = "";
    state.agentDialog.questionId = "";
  }

  function openAgentDialogState(dialogId) {
    DATA.agentDialog(dialogId);
    state.agentDialog.open = true;
    state.agentDialog.dialogId = dialogId;
    state.agentDialog.questionId = "";
  }

  function openAgentDialog(element) {
    if (!element) throw new Error("open-agent-dialog 需要触发元素");
    var dialogId = element.getAttribute("data-agent-dialog-id");
    if (!dialogId) throw new Error("open-agent-dialog 缺少 data-agent-dialog-id");
    openAgentDialogState(dialogId);
    if (dialogId === "workbench-agent") {
      state.scene = "workbench";
      state.focus.unitId = AppState.diagnosisUnit().id;
      state.diagnosisReady = true;
      AppState.markFlowStep("inspection");
      AppState.markFlowStep("agent");
    }
    AppState.save();
    render();
    focusAgentDialog();
  }

  function selectAgentQuestion(element) {
    if (!element) throw new Error("select-agent-question 需要触发元素");
    if (!state.agentDialog.open) throw new Error("select-agent-question 要求 AgentDialog 已打开");
    var questionId = element.getAttribute("data-agent-question-id");
    if (!questionId) throw new Error("select-agent-question 缺少 data-agent-question-id");
    var dialog = DATA.agentDialog(state.agentDialog.dialogId);
    if (!dialog.questions.some(function (question) { return question.id === questionId; })) {
      throw new Error("AgentDialog 问题不属于当前 dialog：" + questionId);
    }
    state.agentDialog.questionId = questionId;
    AppState.save();
    render();
    focusAgentQuestion(questionId);
  }

  function closeAgentDialog() {
    closeAgentDialogState();
    AppState.save();
    render();
    stage.focus();
  }

  function renderAgentDialog() {
    var dialog = state.agentDialog.dialogId ? DATA.agentDialog(state.agentDialog.dialogId) : DATA.agentDialog("workbench-agent");
    return window.AgentDialog.render({
      open: state.agentDialog.open,
      dialog: dialog,
      activeQuestionId: state.agentDialog.questionId,
      onCloseAction: "close-agent-dialog"
    });
  }

  function closeDoc() {
    state.pick.knowledge.docId = null;
    state.pick.knowledge.chunkIndex = null;
    AppState.save();
    render();
    stage.focus();
  }

  // 入库动画：只在这里推进一次状态。视觉分段全部由 CSS animation-delay 承担，
  // 不做"每段一次 render"（那是 5 次全量重渲染，还会丢焦点、重置图表 pass）。
  // 定时器必须带 persist=true 才能跨越"触发动画的这次 render"存活（render 开头会
  // clearAll 掉非 persist 的），但仍会在离开 knowledge 场景时被 clearScene 清掉。
  var INGEST_ANIM_MS = 6200;

  function startIngest() {
    state.pick.knowledge.docId = null;
    state.pick.knowledge.chunkIndex = null;
    state.pick.knowledge.ingestOpen = true;
    state.pick.knowledge.ingestStep = 1;
    AppState.save();
    render();
    focusActiveKnowledgeModal();
    window.SceneTimers.setTimeout("knowledge", function () {
      state.pick.knowledge.ingestStep = DATA.kbIngestionSteps().length;
      AppState.save();
      render();
    }, INGEST_ANIM_MS, true);
  }

  function closeIngest() {
    if (state.pick.knowledge.ingestStep < DATA.kbIngestionSteps().length) {
      window.SceneTimers.clearScene("knowledge");
      state.pick.knowledge.ingestStep = 0;
    }
    state.pick.knowledge.ingestOpen = false;
    AppState.save();
    render();
    stage.focus();
  }

  function selectKbCategory(categoryId) {
    state.pick.knowledge.categoryId = DATA.kbCategories().filter(function (c) { return c.id === categoryId; })[0].id;
    // 切分类时清掉选中文档：旧文档很可能不属于新分类，留着会让"分类 → 文档列表"这一层
    // 的选中态和列表内容互相矛盾。
    state.pick.knowledge.docId = null;
    state.pick.knowledge.chunkIndex = null;
    AppState.save();
    render();
  }

  var selectHandlers = {
    "kb-category": selectKbCategory,
    range: selectRange,
    "overview-metric": selectOverviewCard,
    "workbench-record": selectWorkbenchRecord,
    unit: selectUnitFocus
  };

  function handleSelect(el) {
    var name = el.getAttribute("data-select");
    var id = el.getAttribute("data-select-id");
    var handler = selectHandlers[name];
    if (!handler) throw new Error("未知的 data-select name：" + name);
    handler(id);
  }

  function bindStage() {
    stage.querySelectorAll("[data-scene]").forEach(function (button) {
      button.addEventListener("click", function () { setScene(button.dataset.scene); });
    });
    // data-select/data-select-id 事件委托：并行的 SelectList 组件只负责渲染 DOM
    // 和"容器 keydown 的 roving tabindex"（方向键在选项间移动焦点），点击/回车之后
    // 具体把哪个值写进 state 的哪个字段，完全由 selectHandlers 这张分发表决定——
    // SelectList 不需要、也不应该知道任何业务语义。新增一种可选列表时，只需要在
    // selectHandlers 里加一行、并按需补一个 selectXxx 函数，不需要改 SelectList。
    // 键盘可达性：这里同时监听 click 和 keydown 的 Enter/Space，不假设渲染出来的
    // 一定是原生 <button>（roving tabindex 列表项常见做法是 div/li + tabindex），
    // 原生按钮的 Enter/Space 本来就会派发 click，这里的 keydown 分支对它们只是
    // 多绑一次、不会重复触发（select 之后会整体重渲染）。
    stage.querySelectorAll("[data-select][data-select-id]").forEach(function (el) {
      el.addEventListener("click", function () { handleSelect(el); });
      el.addEventListener("keydown", function (event) {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        handleSelect(el);
      });
    });
    // data-unit 是 station.js 机组对照按钮的既有选择器（先于 data-select 存在，
    // 场景文件本轮不在改造范围内，暂时保留），统一改走 selectUnitFocus 这一个入口，
    // 跟未来 data-select name="unit" 那条路径写的是同一个字段、同一套校验。
    stage.querySelectorAll("[data-unit]").forEach(function (button) {
      button.addEventListener("click", function () { selectUnitFocus(button.dataset.unit); });
    });
    // PIN_ATTR 对应的属性命名空间只属于 3D 热点标签（见 Pump3DContract 顶部注释），
    // 这里用契约常量拼选择器/读属性，不在本文件里重新硬编码那个属性名字符串。
    stage.querySelectorAll("[" + window.Pump3DContract.PIN_ATTR + "]").forEach(function (button) {
      button.addEventListener("click", function () {
        closeAgentDialogState();
        selectPart(button.getAttribute(window.Pump3DContract.PIN_ATTR));
      });
    });
    stage.querySelectorAll("[data-verdict]").forEach(function (button) {
      button.addEventListener("click", function () {
        state.expertVerdict = button.dataset.verdict;
        state.closureOpen = false;
        state.treatmentDone = false;
        state.observationDone = false;
        state.archived = false;
        closeAgentDialogState();
        AppState.removeFlowSteps(["archive"]);
        AppState.markFlowStep("confirm");
        AppState.save();
        render();
      });
    });
    stage.querySelectorAll("[data-action]").forEach(function (button) {
      // 传元素本身而不只是 action 名：有些动作需要读同一个元素上的附带参数。
      button.addEventListener("click", function () { handleAction(button.dataset.action, button); });
    });
  }

  function handleAction(action, element) {
    if (action === "reset-demo") return resetState();
    // ---- 知识库：文档浮层与入库动画 ----
    // 浮层的开合不额外存布尔量，直接由 pick.knowledge.docId 是否为空派生——少一个
    // 需要和 docId 保持同步的状态字段，就少一处可能不一致的地方。
    if (action === "open-doc") return openDoc(element);
    if (action === "close-doc") return closeDoc();
    if (action === "start-ingest") return startIngest();
    if (action === "close-ingest") return closeIngest();
    if (action === "open-agent-dialog") return openAgentDialog(element);
    if (action === "select-agent-question") return selectAgentQuestion(element);
    if (action === "close-agent-dialog") return closeAgentDialog();
    if (action === "go-station") return setScene("station");
    if (action === "go-workbench") {
      state.diagnosisReady = true;
      return setScene("workbench");
    }
    if (action === "go-confirm") return setScene("confirm");
    if (action === "go-treatment") {
      if (!state.expertVerdict) return;
      state.scene = "confirm";
      state.focus.unitId = AppState.diagnosisUnit().id;
      state.closureOpen = true;
      AppState.markFlowStep("confirm");
      AppState.save();
      render();
      resetScroll();
      return;
    }
    if (action === "go-archive") return setScene("archive");
    if (action === "go-knowledge" || action === "show-knowledge-library") {
      state.scene = "graph";
      state.pick.knowledge.view = "library";
      closeAgentDialogState();
      AppState.save();
      render();
      resetScroll();
      return;
    }
    if (action === "go-graph" || action === "show-knowledge-graph") {
      state.scene = "graph";
      state.pick.knowledge.view = "graph";
      closeAgentDialogState();
      AppState.save();
      render();
      resetScroll();
      return;
    }
    if (action === "confirm-treatment") {
      state.treatmentDone = true;
      state.observationDone = false;
      state.closureOpen = false;
      state.scene = "archive";
      AppState.markFlowStep("archive");
      AppState.save();
      render();
      resetScroll();
      return;
    }
    if (action === "confirm-observation") {
      state.observationDone = true;
      state.treatmentDone = false;
      state.closureOpen = false;
      state.scene = "archive";
      AppState.markFlowStep("archive");
      AppState.save();
      render();
      resetScroll();
      return;
    }
    if (action === "archive-report") {
      if (!state.treatmentDone && !state.observationDone) return;
      state.archived = true;
      AppState.markFlowStep("archive");
      AppState.save();
      render();
      return;
    }
    if ((action === "open-trend-detail" || action === "open-vision-detail") && state.scene !== "workbench") {
      state.scene = "workbench";
      state.focus.unitId = AppState.diagnosisUnit().id;
      state.diagnosisReady = true;
    }
    var resetView = action === "open-trend-detail" || action === "open-vision-detail" || action === "close-detail";
    if (action === "open-trend-detail") {
      state.focus.unitId = AppState.diagnosisUnit().id;
      state.diagnosisReady = true;
      state.detail = "trend";
      AppState.markFlowStep("inspection");
      AppState.markFlowStep("trend");
    }
    if (action === "open-vision-detail") {
      state.focus.unitId = AppState.diagnosisUnit().id;
      state.diagnosisReady = true;
      state.detail = "vision";
      AppState.markFlowStep("inspection");
      AppState.markFlowStep("vision");
    }
    if (action === "close-detail") state.detail = "";
    AppState.save();
    render();
    if (resetView) {
      if (action === "close-detail") {
        resetScroll();
        window.requestAnimationFrame(resetScroll);
        window.setTimeout(resetScroll, 0);
      } else {
        focusInlineDetail();
      }
    }
  }

  function focusInlineDetail() {
    window.requestAnimationFrame(function () {
      var panel = stage.querySelector(".inline-detail-panel");
      if (!panel) return;
      panel.focus();
      panel.scrollIntoView({ block: "start" });
    });
  }

  function focusAgentDialog() {
    var dialog = stage.querySelector(".agent-dialog");
    if (dialog) dialog.focus();
  }

  function activeKnowledgeModal() {
    var docPanel = stage.querySelector(".kb-doc-overlay");
    if (docPanel && docPanel.closest(".overlay-layer").classList.contains("open")) return docPanel;
    var ingestPanel = stage.querySelector(".kb-ingest-overlay");
    if (ingestPanel && ingestPanel.closest(".overlay-layer").classList.contains("open")) return ingestPanel;
    return null;
  }

  function focusActiveKnowledgeModal() {
    var panel = activeKnowledgeModal();
    if (!panel) return;
    var firstControl = panel.querySelector("button:not([disabled]), a[href]");
    (firstControl || panel).focus();
  }

  function focusableKnowledgeModalControls(panel) {
    return Array.prototype.slice.call(panel.querySelectorAll("button:not([disabled]), a[href]"));
  }

  function focusAgentQuestion(question) {
    var button = stage.querySelector("[data-agent-question-id='" + question + "']");
    if (button) button.focus();
    else focusAgentDialog();
  }

  function focusableAgentControls() {
    var dialog = stage.querySelector(".agent-dialog");
    if (!dialog) return [];
    return Array.prototype.slice.call(dialog.querySelectorAll("button:not([disabled])"));
  }

  // Focus.remember()/Focus.restore()：render() 每次都整体重建 DOM
  // （stage.innerHTML = ""），意味着"当前有焦点的元素"必然被销毁，浏览器会把焦点
  // 静默地丢给 document.body——这也是本文件历史上散落着 focusInlineDetail/
  // focusAgentDialog/focusAgentQuestion 这几个各写一次的函数的
  // 根本原因：每新增一种"渲染后需要找回焦点"的场景，就得再手写一个"渲染后找某个
  // 具体节点 focus()"的函数。
  //
  // Focus 把"记住渲染前是谁有焦点、渲染后找回同一个东西"这件事收敛成一套通用机制，
  // 直接嵌进 render() 自身（remember 在拆 DOM 之前调用、restore 在 bindStage() 把
  // 新 DOM 的事件重新绑好之后调用），对调用方完全透明：任何触发 render() 的
  // [data-select][data-select-id] 或 [data-action] 元素，点击/回车之后焦点都会
  // 自动落回新 DOM 里同名的那一个，不需要每个 handleAction 分支都手写一次。这是
  // 并行 SelectList 组件键盘可达性的前提——用方向键在列表项间移动、回车选中后触发
  // 一次 render()，若没有这套机制，焦点会在每次选中后弹回 <body>，键盘用户没法
  // 连续操作。
  //
  // 只识别这两种标识、不识别其余 data-*（data-verdict/data-unit/data-scene/
  // data-flow-step 等）：这些既有交互原本就没有"渲染后找回同一个触发元素"的诉求
  // ——要么像 open-agent-dialog 那样明确要把焦点带去一个新出现的、不同的目标
  // （.agent-dialog/.inline-detail-panel），
  // 要么像 data-scene 那样在 setScene() 里显式把焦点交给 stage 本身。
  // focusInlineDetail/focusAgentDialog/focusAgentQuestion 这几个
  // "焦点跳转去一个不同目标"的函数因此原样保留、继续在各自 handleAction 分支里显式
  // 调用——它们发生在 render() 返回之后，天然会覆盖掉 Focus.restore 刚落下的焦点，
  // 两者互不冲突、不需要合并成一套。
  var Focus = {
    remember: function () {
      var el = document.activeElement;
      if (!el || !stage.contains(el)) return null;
      if (el.hasAttribute("data-select") && el.hasAttribute("data-select-id")) {
        return { select: el.getAttribute("data-select"), selectId: el.getAttribute("data-select-id") };
      }
      if (el.hasAttribute("data-action")) {
        return { action: el.getAttribute("data-action") };
      }
      return null;
    },
    restore: function (mark) {
      if (!mark) return;
      // "range" 是 overview.js 的时间范围选择器（原生 <details>/<summary> 菜单，见
      // scenes/overview.js 的 renderRangePicker()）：选中某档触发 render() 后，
      // 新渲染出的 <details> 没有 open 属性、天然回到收起态，菜单里那 4 个
      // data-select-id 选项此刻是浏览器原生的 display:none、拿不到焦点。这不是
      // "找不到就算了"——焦点理应回到触发这个菜单的 summary 上，而不是同名的菜单项，
      // 这是这个交互本身的设计终点，因此单独处理，而不是走下面通用的按选择器查找。
      if (mark.select === "range") {
        var summary = stage.querySelector(".range-picker summary");
        if (!summary) throw new Error("Focus.restore: 缺少 .range-picker summary，无法归还时间范围选择器的焦点");
        summary.focus();
        return;
      }
      var selector = mark.select
        ? "[data-select='" + mark.select + "'][data-select-id='" + mark.selectId + "']"
        : "[data-action='" + mark.action + "']";
      var el = stage.querySelector(selector);
      if (el) el.focus();
    }
  };

  document.addEventListener("keydown", function (event) {
    var knowledgeModal = activeKnowledgeModal();
    if (knowledgeModal) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (knowledgeModal.classList.contains("kb-doc-overlay")) closeDoc();
        else if (state.pick.knowledge.ingestStep === DATA.kbIngestionSteps().length) closeIngest();
        return;
      }
      if (event.key !== "Tab") return;
      var modalControls = focusableKnowledgeModalControls(knowledgeModal);
      if (!modalControls.length) {
        event.preventDefault();
        knowledgeModal.focus();
        return;
      }
      var modalFirst = modalControls[0];
      var modalLast = modalControls[modalControls.length - 1];
      if (event.shiftKey && document.activeElement === modalFirst) {
        event.preventDefault();
        modalLast.focus();
        return;
      }
      if (!event.shiftKey && document.activeElement === modalLast) {
        event.preventDefault();
        modalFirst.focus();
        return;
      }
      if (modalControls.indexOf(document.activeElement) < 0) {
        event.preventDefault();
        modalFirst.focus();
      }
      return;
    }
    if (!state.agentDialog.open) return;
    if (event.key === "Escape") {
      closeAgentDialog();
      return;
    }
    if (event.key !== "Tab") return;
    var controls = focusableAgentControls();
    if (!controls.length) {
      event.preventDefault();
      focusAgentDialog();
      return;
    }
    var first = controls[0];
    var last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
      return;
    }
    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
      return;
    }
    if (controls.indexOf(document.activeElement) < 0) {
      event.preventDefault();
      first.focus();
    }
  });

  document.querySelectorAll("[data-action='reset-demo']").forEach(function (button) {
    button.addEventListener("click", resetState);
  });

  window.addEventListener("message", function (event) {
    var data = event.data;
    if (!data || data.type !== "beng-demo:visibility") return;
    window.Pump3D.setShellActive(!!data.active);
    if (data.active) window.SceneTimers.resumeAll();
    else window.SceneTimers.pauseAll();
  });

  // 这里没有 window.addEventListener("resize", ...)，是有意的：所有图表都走
  // window.Charts，它内部用单个 ResizeObserver 直接观察每个 chart-box 节点
  // （见 core/charts.js 的 ensureResizeObserver()/resizeAll()），比监听 window resize
  // 更精确——比如侧栏折叠、时间范围切换导致容器尺寸变化而窗口本身没变时也能响应。
  // 旧的 AppCharts.scheduleResize 连同整套旧 API 已在阶段三整合时删除。

  render();
})();
