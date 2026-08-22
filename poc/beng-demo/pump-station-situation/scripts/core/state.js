// 应用状态：state 对象定义 / normalize / load / save / reset，以及一组跨多个场景
// 文件共享的小型只读派生逻辑（selectedPart/selectedUnit/diagnosisUnit、canOpen 系列、
// isNonMaintenanceVerdict）。pageShell/panelTitle/legend/renderStatusStack/statusPill
// 这几个通用 UI 小组件因为 renderStatusStack 依赖 state，且当前没有独立的 ui/* 分层
// （按分工由后续任务建立），暂时一并放在这里，而不是 core/dom.js —— dom.js 严格早于
// 本文件加载，不能反过来引用 state。
//
// state 对象本身只在这里创建一次，此后任何文件都通过 window.AppState.value 拿到
// 同一个引用并直接读写属性；resetState 也只做属性级别的清空重建（不整体替换引用），
// 这样已经缓存了 var state = window.AppState.value 的调用方永远不会拿到一份过期对象。
//
// P1-H 状态模型重构（两层结构）：
//   - state.focus：跨场景共享的"当前主体"（当前关注的机组 / 部位），3D 视图和多个
//     场景都只读这里，语义上等价于旧版扁平的 selectedUnit/selectedPart。
//   - state.pick：按场景命名空间隔离的"当前页面选中项"（overview 的状态卡、
//     workbench 的巡检记录、knowledge 的分类/文档/接入进度、graph 的图节点……）。
//     隔离成按场景分的子对象，是为了让"overview 选中的测点"和"workbench 选中的
//     巡检记录"结构性地不可能共用同一个字段、互相踩踏——如果摊平成一个字段，
//     来回切场景就会互相冲掉对方的选中态。
//   - state.range：新增的全局时间范围，所有场景都是 pull 式取数，切换后直接
//     重新 render() 即可，不需要跟 focus/pick 联动。
  //   - state.agentDialog：静态 Agent 问答弹窗状态，按 dialogId 指向数据层的一份
  //     问答模板，questionId 指向当前选中的预设问题。
(function () {
  "use strict";

  var DATA = window.DemoData;
  if (!DATA) {
    throw new Error("DemoData is required");
  }

  // v4 -> v5：结构变了（selectedUnit/selectedPart 摊平字段收进 focus，新增
  // range/pick），旧版 localStorage 只会被 normalizeState 部分继承出一个变形的
  // 半新半旧状态——这是演示现场最容易翻车的地方，所以直接换 key，旧数据当作
  // 不存在，一律走 defaultState()。
  // v5 -> v6：cleanPick 校验 pick.overview 的字典从"全部测点"改成"大屏卡片集合"。
  // 已经存下 MOT-DE-H / SEAL-L 的旧状态会让 overview 渲染直接抛错、页面空白且刷新无效，
  // 所以必须换 key 把这些坏状态整体丢弃，而不是靠新校验去逐个修正——演示机上留着一份
  // 半坏状态是最容易在现场翻车的东西。
    // v6 -> v7：pick.knowledge 新增 chunkIndex，且 categoryId/docId 从"只做类型校验"
    // 升级为按 kbCategories()/kbDocuments() 做字典校验。旧状态里的值可能不在新字典里。
    // v7 -> v8：旧 Agent 抽屉状态替换为 agentDialog.open/dialogId/questionId，
    // 旧持久化状态整体丢弃。
    // v9 -> v10：知识库不再是顶级场景，统一收进知识图谱模块内的 view 切换。
    var STORAGE_KEY = "beng-demo-pump-station-v1-state";
  var sceneOrder = DATA.scenes().map(function (scene) { return scene.key; });
  var allowedVerdicts = DATA.verdicts().map(function (verdict) { return verdict.label; });
  // 机组选择的场景锁分组：见 normalizeState 末尾那段大注释。
  var freeUnitScenes = ["overview", "station"];

  function defaultState() {
    return {
      scene: "station",
      detail: "",
      range: "7d",
      // focus.partId 与 pick.overview 在**默认态必须指向同一个部位**，否则首屏详情卡的
      // 标题（来自 pick.overview 的测点）和部位名（来自 focus.partId）会互相矛盾，
      // 3D 高亮的部位也和左侧选中的状态卡对不上。
      // 这里取"联轴器 + 相位偏差"：本轮演示的主线事件就是 P-1 联轴器疑似不对中，
      // 首屏应该直接落在这个部位上。
      // 注意：运行期允许两者分离（点"机组健康"卡时是整机指标，刻意不改变部位焦点），
      // 所以不能加"二者必须一致"的不变量断言，只有默认态要求一致。
      focus: {
        unitId: "P-1",
        partId: "coupling"
      },
      pick: {
        overview: "COUP-PH",
        station: null,
        workbench: "REC-0722-18",
        // chunkIndex 是"文档浮层要定位到第几段"，由 Agent 引用卡片点击写入；
        // 文档浮层的开合不额外存布尔量，直接由 docId 是否为空派生。
        knowledge: { view: "graph", categoryId: null, docId: null, chunkIndex: null, ingestStep: 0, ingestOpen: false },
        graph: null
      },
      agentDialog: {
        open: false,
        dialogId: "",
        questionId: ""
      },
      expertVerdict: "",
      closureOpen: false,
      treatmentDone: false,
      observationDone: false,
      archived: false,
      diagnosisReady: false,
      flowVisited: ["task"],
    };
  }

  function loadState() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      window.localStorage.removeItem(STORAGE_KEY);
      console.warn("Reset invalid pump demo state", err);
      return null;
    }
  }

  function saveState() {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  // ---------- 持久化状态清洗：非法则回默认（不抛错） ----------
  //
  // 下面 cleanFocus/cleanPick 只在 normalizeState 里被调用，只服务于"从
  // localStorage 读出来的候选状态"这一条路径——磁盘上的值可能来自旧版本、被手改过、
  // 或者干脆是半次没写完的脏数据，所以这里对每个字段都是"不在字典里就退回默认值"，
  // 不抛错。这跟 boot.js 里 selectRange/selectOverviewCard/selectPart/
  // selectUnitFocus 这些运行期入口函数是两条不同的路径：那些函数处理的是当前这一次
  // 交互里刚发生的用户操作，理应对它拿到的 id 高度确信（都是从 DemoData 派生出的
  // dataset 值），一旦发现不在字典里，说明代码本身有 bug 或契约被破坏，必须直接抛错
  // 暴露出来，不能悄悄退回默认值把问题盖住。两者都要做字典校验，但"通过不了校验时
  // 怎么办"这一步必须分开写，不能糊成一个函数。

  function cleanFocus(rawFocus) {
    var source = (rawFocus && typeof rawFocus === "object") ? rawFocus : {};
    return {
      unitId: DATA.units().some(function (unit) { return unit.id === source.unitId; }) ? source.unitId : "P-1",
      partId: DATA.parts().some(function (part) { return part.id === source.partId; }) ? source.partId : "coupling"
    };
  }

  function cleanPick(rawPick) {
    var source = (rawPick && typeof rawPick === "object") ? rawPick : {};
    var knowledgeSource = (source.knowledge && typeof source.knowledge === "object") ? source.knowledge : {};
    // knowledge.categoryId/docId 目前 DemoData 的知识库数据（categories/documents）
    // 还没有专门的 id 字段（只有 title/desc/count 这类展示字段），所以这里只做类型
    // 结构校验，不做字典校验——不是漏做，是字典暂时不存在；等知识库数据补上 id 字段
    // 后再补齐这两个字段的字典校验。ingestStep 有现成的字典可查
    // （DATA.knowledgeBase().ingestion 的步骤数），按它夹住范围。
    var ingestSteps = DATA.kbIngestionSteps().length;
    var ingestStep = knowledgeSource.ingestStep;
    var ingestStepValid = typeof ingestStep === "number" && ingestStep >= 0 && ingestStep <= ingestSteps && Math.floor(ingestStep) === ingestStep;
    return {
      // 字典必须是**卡片集合**（DATA.overviewCards()），不是全部测点（DATA.points()）。
      // pick.overview 的语义是"大屏上哪张状态卡被选中"，而 7 个测点里 MOT-DE-H（电机）
      // 和 SEAL-L（密封）没有对应卡。早先用 points() 校验，这两个值能通过清洗，然后在
      // scenes/overview.js 的 SelectList activeId 校验处抛错 —— 整个 overview 渲染中断，
      // 页面表现为"顶栏还在、stage 和流程条全空"，而且因为状态已经落盘，刷新也救不回来。
      // 回退值和 defaultState() 保持一致（见那里关于"默认态两者必须同部位"的说明）。
      overview: DATA.overviewCards().some(function (card) { return card.id === source.overview; }) ? source.overview : "COUP-PH",
      // station 目前没有对应的选中项字典（部位/机组已经分别由 focus.partId/
      // focus.unitId 覆盖），先只做类型结构校验，留好命名空间给以后的场景专属选中项。
      station: typeof source.station === "string" ? source.station : null,
      workbench: DATA.records(diagnosisUnit().id, "90d").some(function (record) { return record.id === source.workbench; }) ? source.workbench : "REC-0722-18",
      // categoryId/docId 的字典**现在存在了**（阶段三 G1 给数据集补了 id）。
      // 早先这里只做类型校验并注明"字典暂时不存在，不是漏做"——那条注释描述的缺口
      // 到此填上。字典必须是"该字段语义对应的集合"：docId 用 kbDocuments()，
      // 不是任何更宽的集合（用更宽的字典正是 pick.overview 存成 MOT-DE-H 那次
      // 整页空白的根因）。
      knowledge: (function () {
        var categoryId = DATA.kbCategories().some(function (c) { return c.id === knowledgeSource.categoryId; })
          ? knowledgeSource.categoryId : null;
        var docId = DATA.kbDocuments().some(function (d) { return d.id === knowledgeSource.docId; })
          ? knowledgeSource.docId : null;
        // chunkIndex 只有在 docId 合法时才有意义，且必须落在该文档的切分结果范围内。
        // 换了数据集之后正文变短、chunk 变少，旧的 chunkIndex 会越界——这正是需要
        // 在清洗阶段收紧的那类值（和 pick.workbench 随时间范围失效是同一个模式）。
        var chunkIndex = null;
        if (docId !== null && typeof knowledgeSource.chunkIndex === "number") {
          var count = DATA.kbChunks(docId).length;
          if (knowledgeSource.chunkIndex >= 0 && knowledgeSource.chunkIndex < count
              && Math.floor(knowledgeSource.chunkIndex) === knowledgeSource.chunkIndex) {
            chunkIndex = knowledgeSource.chunkIndex;
          }
        }
        var cleanedIngestStep = ingestStepValid ? ingestStep : 0;
        // 入库演示的"进行中"依赖 boot.js 里一次性注册的 SceneTimers 定时器。
        // 页面刷新后定时器不会恢复，所以未完成状态不能持久化；只保留未开始和已完成。
        if (cleanedIngestStep > 0 && cleanedIngestStep < ingestSteps) cleanedIngestStep = 0;
        return {
          view: knowledgeSource.view === "library" ? "library" : "graph",
          categoryId: categoryId,
          docId: docId,
          chunkIndex: chunkIndex,
          ingestStep: cleanedIngestStep,
          ingestOpen: knowledgeSource.ingestOpen === true && cleanedIngestStep > 0
        };
      })(),
            graph: DATA.graph().nodes.some(function (node) { return node.id === source.graph; }) ? source.graph : null
    };
  }

  function cleanAgentDialog(rawAgentDialog) {
    var source = (rawAgentDialog && typeof rawAgentDialog === "object") ? rawAgentDialog : {};
    var open = source.open === true;
    var dialogId = DATA.agentDialogs().some(function (dialog) { return dialog.id === source.dialogId; }) ? source.dialogId : "";
    var questionId = "";
    if (dialogId && typeof source.questionId === "string") {
      var dialog = DATA.agentDialog(dialogId);
      if (dialog.questions.some(function (question) { return question.id === source.questionId; })) {
        questionId = source.questionId;
      }
    }
    if (!open) {
      dialogId = "";
      questionId = "";
    }
    if (open && !dialogId) open = false;
    return {
      open: open,
      dialogId: dialogId,
      questionId: questionId
    };
  }

  function normalizeState(candidate) {
    var clean = defaultState();
    Object.keys(clean).forEach(function (key) {
      if (Object.prototype.hasOwnProperty.call(candidate, key)) {
        clean[key] = candidate[key];
      }
    });
    var legacyKnowledgeScene = clean.scene === "knowledge";
    if (legacyKnowledgeScene) clean.scene = "graph";
    if (sceneOrder.indexOf(clean.scene) < 0) clean.scene = "overview";
    clean.range = DATA.ranges().some(function (range) { return range.key === clean.range; }) ? clean.range : "7d";
    clean.focus = cleanFocus(clean.focus);
    clean.pick = cleanPick(clean.pick);
    if (legacyKnowledgeScene) clean.pick.knowledge.view = "library";
    clean.agentDialog = cleanAgentDialog(clean.agentDialog);
    if (clean.detail === "agent") {
      clean.detail = "";
      clean.agentDialog = { open: true, dialogId: "workbench-agent", questionId: "" };
    }
    if (["trend", "vision", ""].indexOf(clean.detail) < 0) clean.detail = "";
    clean.expertVerdict = typeof clean.expertVerdict === "string" ? clean.expertVerdict : "";
    if (clean.expertVerdict !== "" && allowedVerdicts.indexOf(clean.expertVerdict) < 0) {
      clean.expertVerdict = "";
    }
    clean.treatmentDone = clean.treatmentDone === true && DATA.isMaintenanceVerdict(clean.expertVerdict);
    clean.observationDone = clean.observationDone === true && isNonMaintenanceVerdict(clean.expertVerdict);
    clean.archived = clean.archived === true && (clean.treatmentDone || clean.observationDone);
    clean.diagnosisReady = clean.diagnosisReady === true || clean.expertVerdict !== "" || clean.treatmentDone || clean.observationDone || clean.archived;
    clean.closureOpen = clean.closureOpen === true && clean.expertVerdict !== "" && !clean.treatmentDone && !clean.observationDone && !clean.archived;
    clean.flowVisited = Array.isArray(clean.flowVisited) ? clean.flowVisited.filter(function (key) {
      return DATA.flowSteps().some(function (step) { return step.key === key; });
    }) : ["task"];
    if (clean.flowVisited.indexOf("task") < 0) clean.flowVisited.unshift("task");
    if (clean.scene === "station") markFlowStepForState(clean, "station");
    if (clean.scene === "workbench" || clean.diagnosisReady) markFlowStepForState(clean, "inspection");
    if (clean.detail === "trend") markFlowStepForState(clean, "trend");
    if (clean.detail === "vision") markFlowStepForState(clean, "vision");
    if (clean.agentDialog.open && clean.agentDialog.dialogId === "workbench-agent") markFlowStepForState(clean, "agent");
    if (clean.expertVerdict) markFlowStepForState(clean, "confirm");
    if (clean.treatmentDone || clean.observationDone || clean.archived) markFlowStepForState(clean, "archive");
    if (!canOpenForState(clean.scene, clean)) clean.scene = "station";
    // 机组选择的场景锁：overview / station 是"机组总览 / 部位态势"性质的场景，数据层
    // 本身就支持在 P-1/P-2/P-3/P-4 之间自由切换对照机组，因此这两个场景允许自由
    // 切换；workbench / confirm / archive 是围绕本轮 P-1 诊断案例
    // （DATA.caseKnowledge().unitId）展开的一整条闭环流程，机组本身就是叙事主体，
    // 不允许切换。
    // 原实现用 `clean.selectedUnit !== "P-1"` 一刀切校验，导致任何合法的非 P-1
    // 机组（比如在 station 场景点了"机组对照"切到 P-2）在下一次 normalizeState
    // （含刷新页面重新读 localStorage）时都会被打回 P-1——即"机组对照"的选择点了
    // 等于白点。这里按最终解析出的场景分别处理：自由场景保留用户的选择（上面
    // cleanFocus 已经做过存在性校验），闭环场景强制收回到诊断机组。必须放在
    // clean.scene 最终确定（上面那行 canOpenForState 重定向）之后，否则会按一个
    // 还可能被改写的中间场景值来判断锁不锁。
    if (freeUnitScenes.indexOf(clean.scene) < 0) clean.focus.unitId = diagnosisUnit().id;
    return clean;
  }

  function markFlowStepForState(target, stepKey) {
    if (target.flowVisited.indexOf(stepKey) < 0) target.flowVisited.push(stepKey);
  }

  function markFlowStep(stepKey) {
    if (!DATA.flowSteps().some(function (step) { return step.key === stepKey; })) return;
    markFlowStepForState(state, stepKey);
  }

  function removeFlowSteps(stepKeys) {
    state.flowVisited = state.flowVisited.filter(function (key) {
      return stepKeys.indexOf(key) < 0;
    });
    if (state.flowVisited.indexOf("task") < 0) state.flowVisited.unshift("task");
  }

  // "已选结论且不是维修路径"。原来是 `verdict === "继续观察" || verdict === "排除误报"`
  // 两个中文串的或——业务增加第四条非维修结论时，这里会静默漏掉它（返回 false，
  // 于是那条结论走不进非维修闭环），而且不报错。现在按数据层的 isMaintenance 取反，
  // 新增结论自动被涵盖。
  function isNonMaintenanceVerdict(verdict) {
    return !!verdict && !DATA.isMaintenanceVerdict(verdict);
  }

  function selectedPart() {
    var part = DATA.parts().find(function (item) { return item.id === state.focus.partId; });
    if (!part) throw new Error("Missing selected pump part: " + state.focus.partId);
    return part;
  }

  function selectedUnit() {
    var unit = DATA.units().find(function (item) { return item.id === state.focus.unitId; });
    if (!unit) throw new Error("Missing selected pump unit: " + state.focus.unitId);
    return unit;
  }

  // 过渡期只读访问器：scripts/scenes/*.js 里绝大多数地方已经在用
  // AppState.selectedPart()/AppState.selectedUnit()（拿完整对象），迁移到
  // focus.partId/focus.unitId 之后这两个函数继续工作、场景文件不用改。唯一的例外
  // 是 scripts/scenes/station.js:61，它直接读 state.selectedUnit 这个 id 字符串
  // （不是完整对象）去判断机组对照按钮是否高亮——那处字段被本轮迁移拿掉了，需要
  // 改成调用下面这两个新访问器之一（selectedUnitId()）。这两个函数只读、不做任何
  // 校验以外的事，不是给 state.selectedPart/state.selectedUnit 造一个假别名，
  // 场景文件需要各自显式改成函数调用（清单见任务报告），而不是在这里悄悄兼容。
  function selectedPartId() {
    return state.focus.partId;
  }

  function selectedUnitId() {
    return state.focus.unitId;
  }

  function diagnosisUnit() {
    var unit = DATA.units().find(function (item) { return item.id === DATA.caseKnowledge().unitId; });
    if (!unit) throw new Error("Missing diagnosis unit: " + DATA.caseKnowledge().unitId);
    return unit;
  }

  function canOpen(sceneKey) {
    return canOpenForState(sceneKey, state);
  }

  function canOpenForState(sceneKey, target) {
    return sceneKey === "station";
  }

  // archiveCaseId/archiveStatusText 原本只在归档场景用，现保留为跨场景复用的归档口径。
  // 案例号和归档状态文案都由数据层按结论派生（catalog.js 的 verdicts[].archiveCaseId /
  // archiveStatusText），这里不再逐条比较中文串、也不再持有任何案例号字面量。
  function archiveCaseId() {
    return DATA.archiveCaseIdFor(state.expertVerdict);
  }

  function archiveStatusText() {
    var current = DATA.verdictByLabel(state.expertVerdict);
    if (!current) throw new Error("archiveStatusText 要求已选定专家结论，当前为空");
    return current.archiveStatusText;
  }

  // 只清空/重建属性，绝不重新赋值 state 变量本身：window.AppState.value 这个引用要
  // 终生保持不变，其他文件在自己模块顶层缓存的 `var state = window.AppState.value;`
  // 才不会在重置演示后失效。focus/pick 这两个嵌套对象在 fresh 里各是一份新对象，
  // 属性级重建会把 state.focus/state.pick 整体替换成新对象——没有任何代码会跨渲染
  // 缓存这两个子对象的引用（都是每次现读 state.focus.xxx），所以这不会造成脏引用。
  function resetState() {
    window.localStorage.removeItem(STORAGE_KEY);
    var fresh = defaultState();
    Object.keys(state).forEach(function (key) { delete state[key]; });
    Object.keys(fresh).forEach(function (key) { state[key] = fresh[key]; });
  }

  var state = normalizeState(loadState() || defaultState());

  // action 必填。原实现是 action || renderStatusStack()，但全部 8 处调用都传了按钮，
  // 那条分支永远走不到（renderStatusStack/statusPill 因此是不可达代码，已删）；
  // 而且 `||` 兜底本身违反"不擅自添加兜底策略"，漏传时应当立刻报错而不是渲染出别的东西。
  function pageShell(kicker, title, action, body) {
    if (!action) throw new Error("pageShell 需要 action 元素：" + title);
    return h("section", { class: "scene-shell" }, [
      h("div", { class: "scene-head" }, [
        h("div", {}, [
          h("p", { class: "kicker", text: kicker }),
          h("h2", { text: title }),
        ]),
        action,
      ]),
      body,
    ]);
  }

  function panelTitle(title, meta) {
    return h("div", { class: "panel-title" }, [
      h("span", { text: title }),
      h("small", { text: meta }),
    ]);
  }

  function legend(status, label) {
    return h("span", {}, [h("i", { class: "dot " + status }), h("span", { text: label })]);
  }

  window.AppState = {
    value: state,
    STORAGE_KEY: STORAGE_KEY,
    sceneOrder: sceneOrder,
    save: saveState,
    reset: resetState,
    markFlowStep: markFlowStep,
    removeFlowSteps: removeFlowSteps,
    isNonMaintenanceVerdict: isNonMaintenanceVerdict,
    selectedPart: selectedPart,
    selectedUnit: selectedUnit,
    selectedPartId: selectedPartId,
    selectedUnitId: selectedUnitId,
    diagnosisUnit: diagnosisUnit,
    canOpen: canOpen,
    archiveCaseId: archiveCaseId,
    archiveStatusText: archiveStatusText,
    pageShell: pageShell,
    panelTitle: panelTitle,
    legend: legend
  };
})();
