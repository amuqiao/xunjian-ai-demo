// 引导层：渲染管线 + action 分发 + 顶部导航。
//
// ---- 分层纪律 ----
// 场景文件（scripts/scenes/*.js）只负责把 state 渲染成 DOM，**不绑定任何事件监听**。
// 所有交互统一走 data-action / data-select 属性，由本文件的事件委托读取属性 → 改 state
// → 调 render()。同层场景文件之间不得互相引用。
//
// 这条纪律的作用：任何一次"点了没反应"或"点了改错了东西"，排查范围恒定在本文件的
// 一张分发表里，而不是散在五个场景文件的十几处 addEventListener 里。
//
// ---- 每轮 render 的边界 ----
// render() 开头必须依次调用 Charts.beginPass() / SelectList.resetRenderPass() /
// SceneTimers.clearAll()，三者都是"上一轮的残留在这一轮已经过期"的显式声明。
(function () {
  "use strict";

  var META = window.DOMAIN_META;
  var REVIEW = window.DOMAIN_REVIEW;
  var AGENTQA = window.DOMAIN_AGENTQA;
  var KB = window.DOMAIN_KB;
  var AppState = window.AppState;
  var state = AppState.value;

  var stage = null;
  var sceneNav = null;
  var flowTrack = null;

  // ---------------------------------------------------------------- 场景注册表

  function sceneRenderer() {
    var Scenes = window.Scenes || {};
    if (state.scene === "workbench" && state.detail) {
      if (typeof Scenes.renderDetailScreen !== "function") {
        throw new Error("[boot] 子屏渲染器未注册：Scenes.renderDetailScreen");
      }
      return Scenes.renderDetailScreen;
    }
    var map = {
      workbench: Scenes.renderWorkbench,
      review: Scenes.renderReview,
      knowledge: Scenes.renderKnowledge
    };
    var fn = map[state.scene];
    if (typeof fn !== "function") {
      throw new Error("[boot] 场景渲染器未注册：" + state.scene);
    }
    return fn;
  }

  // ---------------------------------------------------------------- 顶栏

  function renderNav() {
    sceneNav.innerHTML = "";
    META.scenes.forEach(function (scene) {
      var enabled = AppState.canOpen(scene.key);
      var active = state.scene === scene.key;
      sceneNav.appendChild(h("button", {
        type: "button",
        class: "scene-nav-btn" + (active ? " active" : "") + (enabled ? "" : " locked"),
        disabled: enabled ? null : "disabled",
        title: enabled ? scene.node : "完成人工复核的执行动作后解锁",
        dataset: { action: "go-scene", sceneKey: scene.key },
        text: scene.label
      }));
    });
  }

  function renderFlow() {
    if (!flowTrack) return;
    flowTrack.innerHTML = "";
    META.flowSteps.forEach(function (step, index) {
      var visited = state.flowVisited.indexOf(step.key) >= 0;
      var current = activeFlowKey() === step.key;
      flowTrack.appendChild(h("div", {
        class: "flow-step" + (visited ? " visited" : "") + (current ? " current" : "")
      }, [
        h("span", { class: "flow-index", text: String(index + 1) }),
        h("span", { class: "flow-label", text: step.label }),
        h("small", { class: "flow-desc", text: step.desc })
      ]));
    });
  }

  // "现在讲到哪"：按当前界面派生，不额外存字段。子屏优先于场景，因为用户此刻确实
  // 在看子屏。
  function activeFlowKey() {
    if (state.agent.open) return "agent";
    if (state.detail === "trend") return "trend";
    if (state.detail === "vision") return "vision";
    if (state.scene === "review") return "review";
    if (state.scene === "knowledge") return "archive";
    return "inspection";
  }

  // ---------------------------------------------------------------- 渲染

  function captureFocusKey() {
    var el = document.activeElement;
    return (el && el.dataset && el.dataset.focusKey) ? el.dataset.focusKey : null;
  }

  // 焦点恢复：整屏重建 DOM 之后，把焦点落回新 DOM 里同名的那一个控件。没有这一步，
  // 用下拉框选一个值就会因为 render() 重建而丢焦点，键盘用户每选一次都要重新 Tab 回来。
  function restoreFocus(key) {
    if (!key) return;
    var el = stage.querySelector('[data-focus-key="' + key + '"]');
    if (el) el.focus();
  }

  // 整屏渲染的计数器。它是给验证脚本用的：动画期间只要发生整屏渲染，浮层就会被
  // 重挂、CSS 入场动画重播，肉眼看到的就是闪。数次数是能直接断言这件事的唯一办法
  // ——"没有闪"本身没法从 DOM 上读出来。
  var renderCount = 0;

  function render() {
    renderCount += 1;
    var focusKey = captureFocusKey();

    window.Charts.beginPass();
    window.SelectList.resetRenderPass();
    window.SceneTimers.clearAll();

    renderNav();
    renderFlow();

    stage.innerHTML = "";
    stage.appendChild(sceneRenderer()());

    // 浮层挂在 stage 之外，避免被场景的 overflow 裁掉。
    renderOverlays();
    // 挂完立刻定点刷新一次：浮层的结构是静态的（见 knowledge.js 的说明），随状态变的
    // 那些类名/宽度/文本一律由 refreshXxx() 写。不在这里补一次，刚打开的浮层会停在
    // "第 0 步"的静态样子，要等下一个定时器到了才跳一下。
    refreshOverlays();

    // 图表分两段：场景渲染时只创建/挂载槽位，数据在这里统一 draw()。分开是因为
    // Charts.slot() 返回的节点必须先进 DOM 树，ECharts 才能量到宿主尺寸——反过来
    // 会静默画出一张 0 高度的空图，不报错。
    drawSceneCharts();
    window.Charts.flush();

    restoreFocus(focusKey);
  }

  function drawSceneCharts() {
    var Scenes = window.Scenes || {};
    var hook;
    if (state.scene === "workbench" && state.detail) hook = Scenes.renderDetailScreenCharts;
    else if (state.scene === "workbench") hook = Scenes.renderWorkbenchCharts;
    else if (state.scene === "review") hook = Scenes.renderReviewCharts;
    if (typeof hook === "function") hook();
  }

  function collectOverlays() {
    var Scenes = window.Scenes || {};
    var nodes = [];
    if (typeof Scenes.renderAgentOverlay === "function") nodes.push(Scenes.renderAgentOverlay());
    if (state.scene === "workbench" && !state.detail && typeof Scenes.renderWorkbenchOverlays === "function") {
      nodes = nodes.concat(Scenes.renderWorkbenchOverlays());
    }
    if (state.scene === "review" && typeof Scenes.renderReviewOverlays === "function") {
      nodes = nodes.concat(Scenes.renderReviewOverlays());
    }
    if (state.scene === "knowledge" && typeof Scenes.renderKnowledgeOverlays === "function") {
      nodes = nodes.concat(Scenes.renderKnowledgeOverlays());
    }
    if (state.detail && typeof Scenes.renderDetailOverlays === "function") {
      nodes = nodes.concat(Scenes.renderDetailOverlays());
    }
    return nodes.filter(function (node) { return !!node; });
  }

  // 浮层按 key 增量挂载：**已经挂着的同 key 浮层原地保留，绝不重建**。
  //
  // 原来这里是 host.innerHTML = "" 之后全量重挂。后果是入库动画每推进一步、Agent 每
  // 从"检索中"切到"答案"，浮层都被销毁重建一次，.overlay-mask 的淡入动画和 chunk 的
  // 落下动画跟着从头重播——用户看到的就是每 700ms 闪一下。不抛错、不进日志。
  //
  // 现在只做三件事：删掉不该在的、补上还没有的、同 key 的一律不动。同 key 浮层内部
  // 需要跟着状态变的部分，由各自的 refreshXxx() 做定点更新（与 refreshReviewGates
  // 同一种模式），不经过这里。
  function renderOverlays() {
    var host = document.getElementById("overlayRoot");
    var keyAttr = window.Overlay.KEY_ATTR;
    var incoming = collectOverlays();

    var wanted = {};
    incoming.forEach(function (node) { wanted[node.getAttribute(keyAttr)] = node; });

    var mounted = {};
    Array.prototype.slice.call(host.children).forEach(function (child) {
      var key = child.getAttribute(keyAttr);
      if (wanted[key]) mounted[key] = true;
      else host.removeChild(child);
    });

    incoming.forEach(function (node) {
      if (!mounted[node.getAttribute(keyAttr)]) host.appendChild(node);
    });
  }

  // 定点刷新：动画推进时**不重建任何 DOM**，只让相关场景更新自己那几处类名和文本。
  // 这条路径不碰 stage、不碰浮层外壳，因此不会有任何重播或闪烁。
  function refreshOverlays() {
    var Scenes = window.Scenes || {};
    if (typeof Scenes.refreshAgent === "function") Scenes.refreshAgent();
    if (typeof Scenes.refreshIngest === "function") Scenes.refreshIngest();
  }

  // 只落盘 + 定点刷新，不 render()。动画的每一帧都走这条路径。
  function tick() {
    AppState.save();
    refreshOverlays();
  }

  function commit() {
    AppState.save();
    render();
  }

  function resetScroll() {
    stage.scrollTop = 0;
    if (stage.scrollTo) stage.scrollTo(0, 0);
  }

  // ---------------------------------------------------------------- 场景切换

  function setScene(sceneKey) {
    if (!AppState.canOpen(sceneKey)) return;
    if (state.scene !== sceneKey) window.SceneTimers.clearScene(state.scene);
    state.scene = sceneKey;
    state.detail = "";
    state.pick.workbenchAiListOpen = false;
    state.pick.workbenchAiService = "";
    state.pick.reviewArchiveOpen = false;
    closeAgentState();
    AppState.markFlowStep(flowStepOfScene(sceneKey));
    commit();
    resetScroll();
  }

  function flowStepOfScene(sceneKey) {
    if (sceneKey === "review") return "review";
    if (sceneKey === "knowledge") return "archive";
    return "inspection";
  }

  // ---------------------------------------------------------------- 选择分发

  var selectHandlers = {
    "workbench-record": function (id) {
      AppState.recordById(id);
      state.pick.workbench = id;
      // 选中记录时把焦点部位一并对齐：右侧的时序 / 视觉 / AI 判断都按部位取数，
      // 不对齐就会出现"标题是 A 部位、曲线画的是 B 部位"这种只能靠肉眼发现的错配。
      state.focus.partId = AppState.recordById(id).partId;
      state.pick.workbenchAiListOpen = true;
      state.pick.workbenchAiService = "";
      state.pick.trend.pointId = null;
      state.pick.vision.frameId = null;
    },
    "kb-category": function (id) {
      if (!window.DOMAIN_KB.categories().some(function (c) { return c.id === id; })) {
        throw new Error("[boot] 未知知识库分类：" + id);
      }
      state.pick.knowledge.categoryId = id;
    }
  };

  function handleSelect(name, id) {
    var handler = selectHandlers[name];
    if (!handler) throw new Error("[boot] 未注册的选择器：" + name);
    handler(id);
    commit();
  }

  // ---------------------------------------------------------------- Agent

  function closeAgentState() {
    state.agent.open = false;
    state.agent.contextId = "";
    state.agent.questionId = "";
    state.agent.phase = "idle";
  }

  function agentContext(contextId) {
    var found = null;
    AGENTQA.contexts.forEach(function (context) {
      if (context.id === contextId) found = context;
    });
    if (!found) throw new Error("[boot] 未知 Agent 上下文：" + contextId);
    return found;
  }

  var AGENT_THINKING_MS = 850;

  function openAgent(element) {
    var contextId = element.dataset.agentContext;
    agentContext(contextId);
    state.agent.open = true;
    state.agent.contextId = contextId;
    state.agent.questionId = "";
    state.agent.phase = "idle";
    AppState.markFlowStep("agent");
    commit();
  }

  // 提问 → 检索中 → 答案，全程走 tick()：不重建浮层，只换对话区那一块。
  // 用 commit() 的话，每次相位切换都会重建整个浮层，淡入动画重播 = 闪。
  function askAgent() {
    tick();
    window.SceneTimers.setTimeout(state.scene, function () {
      if (state.agent.phase !== "thinking") return;
      state.agent.phase = "answered";
      tick();
    }, AGENT_THINKING_MS, true);
  }

  function selectAgentQuestion(element) {
    var questionId = element.dataset.agentQuestionId;
    var context = agentContext(state.agent.contextId);
    if (!context.questions.some(function (q) { return q.id === questionId; })) {
      throw new Error("[boot] 未知 Agent 问题：" + questionId + "（上下文 " + context.id + "）");
    }
    state.agent.questionId = questionId;
    state.agent.freeText = "";
    state.agent.phase = "thinking";
    // persist:true —— 这是"定完就等它自己触发"的动画定时器。用渲染级定时器注册的话，
    // 用户在这 850ms 内点任何别的东西都会触发一次 render()，把它 clearAll() 掉，
    // Agent 就永远停在"检索中…"，而且不报错。
    askAgent();
  }

  function submitAgentInput(element) {
    // 非预设输入统一走 fallbackAnswer：questionId 置空，AgentPanel 据此渲染那句
    // "本演示环境暂不支持"。输入的原文存进 state 再回显——不存的话，定点刷新重建
    // 对话区之后输入框会被清空，看起来像"我打的字没了"。
    var host = element && element.closest ? element.closest(".ag-input-row") : null;
    var input = host ? host.querySelector(".ag-input") : null;
    state.agent.freeText = input ? input.value : "";
    state.agent.questionId = "";
    state.agent.phase = "thinking";
    askAgent();
  }

  // ---------------------------------------------------------------- 知识库入库动画

  function startIngest() {
    var steps = KB.ingestion();
    state.pick.knowledge.ingestOpen = true;
    state.pick.knowledge.ingestStep = 1;
    // 只有这一次走 commit()：浮层要被创建出来。之后每一步都走 tick()。
    commit();
    scheduleIngest(1, steps);
  }

  // 六步推进全程 tick()：不重建浮层，只改类名。用 commit() 的话每 700ms 重建一次
  // 浮层，overlay-in 淡入 + chunk 落下动画一起重播，肉眼就是连续闪烁。
  function scheduleIngest(step, steps) {
    if (step >= steps.length) return;
    window.SceneTimers.setTimeout("knowledge", function () {
      if (!state.pick.knowledge.ingestOpen) return;
      state.pick.knowledge.ingestStep = step + 1;
      tick();
      scheduleIngest(step + 1, steps);
    }, steps[step].ms, true);
  }

  function closeIngest() {
    if (state.pick.knowledge.ingestStep < KB.ingestion().length) {
      state.pick.knowledge.ingestStep = 0;
    }
    state.pick.knowledge.ingestOpen = false;
    commit();
  }

  // ---------------------------------------------------------------- 复核

  function selectOutcome(element) {
    var outcomeId = element.dataset.outcomeId;
    AppState.outcomeById(outcomeId);
    state.review.outcomeId = outcomeId;
    // 换结论 = 换一套结构化字段。保留上一套的值会让"处置班组"这种只属于维修路径的
    // 字段跟着观察结论一起进报告。
    state.review.fields = AppState.defaultFields(outcomeId);
    state.review.executed = false;
    state.review.retestPassed = null;
    state.archived = false;
    state.pick.reviewArchiveOpen = false;
    AppState.markFlowStep("review");
    commit();
  }

  function reviewVote(element) {
    var vote = element.dataset.voteId;
    var voteDef = REVIEW.votes.filter(function (v) { return v.id === vote; })[0];
    if (!voteDef) {
      throw new Error("[boot] 未知表决：" + vote);
    }
    state.review.vote = vote;
    var suggestion = AppState.suggestedOutcome();
    var outcome = suggestion;
    var rejectOutcome = REVIEW.outcomes.filter(function (item) { return item.id === "reject"; })[0];
    var treatmentOutcome = REVIEW.outcomes.filter(function (item) { return item.id === "fix"; })[0];
    if (vote === "reject") outcome = rejectOutcome;
    if (vote === "revise" && (!outcome || outcome.id === "reject")) outcome = treatmentOutcome;
    if (!outcome) {
      throw new Error("[boot] 表决缺少可用结论：" + vote);
    }
    state.review.outcomeId = outcome.id;
    state.review.fields = AppState.defaultFields(outcome.id);
    if (typeof voteDef.defaultNote !== "string" || voteDef.defaultNote.trim() === "") {
      throw new Error("[boot] 表决缺少默认复核意见：" + vote);
    }
    if (vote === "accept" && outcome.id === "reject") {
      state.review.note = "同意 AI 建议，现场复核后确认本项为误报，按误报样本归档。";
    } else if (vote === "revise" && suggestion && suggestion.id === "reject") {
      state.review.note = "人工复核后认为仍需转处置，请补充现场依据后生成报告。";
    } else {
      state.review.note = voteDef.defaultNote;
    }
    state.review.executed = false;
    state.review.retestPassed = null;
    state.archived = false;
    state.pick.reviewArchiveOpen = false;
    AppState.markFlowStep("review");
    commit();
  }

  function setField(element) {
    var fieldId = element.dataset.fieldId;
    var field = REVIEW.fields[fieldId];
    if (!field) throw new Error("[boot] 未知复核字段：" + fieldId);
    var value = element.value;
    if (value !== "" && !field.options.some(function (o) { return o.id === value; })) {
      throw new Error("[boot] 复核字段 " + fieldId + " 的取值不在选项里：" + value);
    }
    state.review.fields[fieldId] = value;
    commit();
  }

  function toggleFlag(element) {
    var fieldId = element.dataset.fieldId;
    var optionId = element.dataset.optionId;
    var field = REVIEW.fields[fieldId];
    if (!field || field.type !== "checkbox") throw new Error("[boot] 不是勾选型字段：" + fieldId);
    if (!field.options.some(function (o) { return o.id === optionId; })) {
      throw new Error("[boot] 未知勾选项：" + optionId);
    }
    var list = state.review.fields[fieldId] || [];
    var at = list.indexOf(optionId);
    if (at >= 0) list.splice(at, 1);
    else list.push(optionId);
    state.review.fields[fieldId] = list;
    commit();
  }

  function appendPhrase(element) {
    var phrase = element.dataset.phrase;
    if (REVIEW.phrases.indexOf(phrase) < 0) throw new Error("[boot] 未知常用语：" + phrase);
    var current = state.review.note;
    state.review.note = current && !/\s$/.test(current) ? current + phrase : current + phrase;
    commit();
    var box = stage.querySelector('[data-focus-key="review-note"]');
    if (box) {
      box.focus();
      box.selectionStart = box.value.length;
      box.selectionEnd = box.value.length;
    }
  }

  // 文本框每敲一个字都整屏重渲染会丢光标位置，所以这里只写 state + 落盘，然后做一次
  // 定点更新（执行按钮的可用性、分歧提示），不走 render()。
  function inputNote(element) {
    state.review.note = element.value;
    AppState.save();
    refreshGates();
  }

  function refreshGates() {
    var Scenes = window.Scenes || {};
    if (typeof Scenes.refreshReviewGates === "function") Scenes.refreshReviewGates();
  }

  function executeReview() {
    if (!AppState.canExecute()) return;
    state.review.executed = true;
    state.review.retestPassed = null;
    state.pick.reviewArchiveOpen = true;
    AppState.markFlowStep("archive");
    commit();
    resetScroll();
  }

  function retestPass() {
    if (!state.review.executed) return;
    state.review.retestPassed = true;
    commit();
  }

  // 复测不通过 → 退回复核。结论和意见都保留（允许维持原判，也允许改），只把
  // executed 置回 false。一条只能往前点的 demo，观众一眼就知道是假的。
  function retestFail() {
    if (!state.review.executed) return;
    state.review.retestPassed = false;
    state.review.executed = false;
    state.archived = false;
    state.scene = "review";
    state.pick.reviewArchiveOpen = false;
    commit();
    resetScroll();
  }

  function openReportArchive() {
    if (!state.review.executed) return;
    state.scene = "review";
    state.pick.reviewArchiveOpen = true;
    AppState.markFlowStep("archive");
    commit();
  }

  function closeReportArchive() {
    state.pick.reviewArchiveOpen = false;
    commit();
  }

  function archiveReport() {
    if (!state.review.executed) return;
    state.archived = true;
    state.pick.reviewArchiveOpen = false;
    state.scene = "review";
    state.detail = "";
    state.pick.knowledge.categoryId = KB.archiveTarget().categoryId;
    state.pick.knowledge.docId = null;
    state.pick.knowledge.chunkIndex = null;
    closeAgentState();
    AppState.markFlowStep("archive");
    commit();
    resetScroll();
  }

  // 归档产物是一篇"运行期才存在"的文档（core/report.js 的 archivedDocument），
  // 它不在领域契约里，所以按 id 取文档时必须先问它一次，否则点开归档报告会抛
  // "未知文档"。
  function resolveDoc(docId) {
    var archived = window.ReportModel.archivedDocument();
    if (archived && archived.id === docId) return archived;
    return window.DOMAIN_KB.document(docId);
  }

  // ---------------------------------------------------------------- 证据链跳转

  // 依据链芯片按 kind 分发。这是"AI 说的每一句都能当场翻到底稿"的机械实现。
  function openEvidence(element) {
    var kind = element.dataset.evidenceKind;
    if (element.dataset.evidenceLocked === "true") return;
    state.pick.workbenchAiListOpen = false;
    state.pick.workbenchAiService = "";
    state.pick.reviewArchiveOpen = false;
    if (kind === "series") {
      state.scene = "workbench";
      state.detail = "trend";
      state.pick.trend.pointId = element.dataset.pointId;
      AppState.pointById(state.pick.trend.pointId);
      AppState.markFlowStep("trend");
    } else if (kind === "vision") {
      state.scene = "workbench";
      state.detail = "vision";
      state.pick.vision.frameId = element.dataset.frameId;
      AppState.frameById(state.pick.vision.frameId);
      AppState.markFlowStep("vision");
    } else if (kind === "rule") {
      // 规则就地展开，不跳页：它是一段短文本，跳页的代价大于收益。
      var card = stage.querySelector('[data-rule-card="' + element.dataset.ruleId + '"]');
      if (!card) throw new Error("[boot] 找不到规则卡：" + element.dataset.ruleId);
      card.classList.toggle("open");
      return;
    } else if (kind === "case") {
      window.SceneTimers.clearScene(state.scene);
      state.scene = "knowledge";
      state.detail = "";
      var doc = resolveDoc(element.dataset.docId);
      state.pick.knowledge.categoryId = doc.categoryId;
      state.pick.knowledge.docId = doc.id;
      state.pick.knowledge.chunkIndex = 0;
      AppState.markFlowStep("archive");
    } else {
      throw new Error("[boot] 未知依据类型：" + kind);
    }
    commit();
    resetScroll();
  }

  // ---------------------------------------------------------------- action 分发

  function handleAction(action, element) {
    if (action === "reset-demo") {
      window.SceneTimers.clearEverything();
      window.Charts.disposeAll();
      AppState.reset();
      render();
      resetScroll();
      return;
    }

    if (action === "go-scene") return setScene(element.dataset.sceneKey);
    if (action === "go-workbench") return setScene("workbench");
    if (action === "go-review") return setScene("review");
    if (action === "go-archive") return openReportArchive();
    if (action === "go-knowledge") return setScene("knowledge");

    if (action === "set-range") {
      var rangeKey = element.dataset.rangeKey;
      if (!window.DOMAIN_SERIES.ranges().some(function (r) { return r.key === rangeKey; })) {
        throw new Error("[boot] 未知时间范围：" + rangeKey);
      }
      state.range = rangeKey;
      return commit();
    }

    if (action === "open-evidence") return openEvidence(element);

    if (action === "open-ai-list") {
      state.pick.workbenchAiListOpen = true;
      state.pick.workbenchAiService = "";
      return commit();
    }
    if (action === "close-ai-list") {
      state.pick.workbenchAiListOpen = false;
      state.pick.workbenchAiService = "";
      return commit();
    }
    if (action === "open-ai-service") {
      var serviceKind = element.dataset.aiServiceKind;
      if (["series", "vision", "rule"].indexOf(serviceKind) < 0) {
        throw new Error("[boot] 未知 AI 服务判断类型：" + serviceKind);
      }
      state.pick.workbenchAiService = serviceKind;
      return commit();
    }
    if (action === "close-ai-service") {
      state.pick.workbenchAiService = "";
      return commit();
    }

    if (action === "open-trend-detail") {
      state.detail = "trend";
      state.pick.workbenchAiListOpen = false;
      state.pick.workbenchAiService = "";
      state.pick.trend.pointId = AppState.primaryPoint(state.focus.partId).id;
      AppState.markFlowStep("trend");
      commit();
      return resetScroll();
    }
    if (action === "open-vision-detail") {
      state.detail = "vision";
      state.pick.workbenchAiListOpen = false;
      state.pick.workbenchAiService = "";
      state.pick.vision.frameId = AppState.currentFrameOf(state.focus.partId).id;
      AppState.markFlowStep("vision");
      commit();
      return resetScroll();
    }
    if (action === "close-detail") {
      state.detail = "";
      state.pick.vision.zoomOpen = false;
      commit();
      return resetScroll();
    }
    if (action === "select-point") {
      state.pick.trend.pointId = element.dataset.pointId;
      AppState.pointById(state.pick.trend.pointId);
      return commit();
    }
    if (action === "select-frame") {
      state.pick.vision.frameId = element.dataset.frameId;
      AppState.frameById(state.pick.vision.frameId);
      return commit();
    }
    if (action === "zoom-frame") {
      state.pick.vision.zoomOpen = true;
      return commit();
    }
    if (action === "close-zoom") {
      state.pick.vision.zoomOpen = false;
      return commit();
    }

    if (action === "open-agent") return openAgent(element);
    if (action === "select-agent-question") return selectAgentQuestion(element);
    if (action === "submit-agent-input") return submitAgentInput(element);
    if (action === "close-agent") {
      closeAgentState();
      return commit();
    }

    if (action === "select-reviewer") return;   // 由 change 事件处理，见 bindInputs
    if (action === "review-vote") return reviewVote(element);
    if (action === "select-outcome") return selectOutcome(element);
    if (action === "toggle-flag") return toggleFlag(element);
    if (action === "append-phrase") return appendPhrase(element);
    if (action === "execute-review") return executeReview();
    if (action === "retest-pass") return retestPass();
    if (action === "retest-fail") return retestFail();

    if (action === "open-report-archive") return openReportArchive();
    if (action === "close-report-archive") return closeReportArchive();
    if (action === "archive-report") return archiveReport();

    if (action === "open-doc") {
      var docId = element.dataset.docId;
      resolveDoc(docId);
      state.pick.knowledge.docId = docId;
      state.pick.knowledge.chunkIndex = null;
      return commit();
    }
    if (action === "close-doc") {
      state.pick.knowledge.docId = null;
      state.pick.knowledge.chunkIndex = null;
      return commit();
    }
    if (action === "open-doc-chunk") {
      var hitDocId = element.dataset.docId;
      var doc = resolveDoc(hitDocId);
      state.scene = "knowledge";
      state.pick.knowledge.categoryId = doc.categoryId;
      state.pick.knowledge.docId = hitDocId;
      state.pick.knowledge.chunkIndex = Number(element.dataset.chunkIndex);
      closeAgentState();
      commit();
      return resetScroll();
    }
    if (action === "start-ingest") return startIngest();
    if (action === "close-ingest") return closeIngest();

    throw new Error("[boot] 未注册的 action：" + action);
  }

  // ---------------------------------------------------------------- 事件绑定

  function bindClicks() {
    document.addEventListener("click", function (event) {
      var selectTarget = event.target.closest ? event.target.closest("[data-select-id]") : null;
      if (selectTarget && selectTarget.dataset.select) {
        handleSelect(selectTarget.dataset.select, selectTarget.dataset.selectId);
        return;
      }
      var actionTarget = event.target.closest ? event.target.closest("[data-action]") : null;
      if (!actionTarget || actionTarget.disabled) return;
      handleAction(actionTarget.dataset.action, actionTarget);
    });
  }

  function bindInputs() {
    document.addEventListener("input", function (event) {
      var el = event.target;
      if (!el.dataset || el.dataset.action !== "input-note") return;
      inputNote(el);
    });

    document.addEventListener("change", function (event) {
      var el = event.target;
      if (!el.dataset) return;
      if (el.dataset.action === "set-field") return setField(el);
      if (el.dataset.action === "select-reviewer") {
        AppState.reviewerById(el.value);
        state.review.reviewerId = el.value;
        return commit();
      }
    });
  }

  function bindKeys() {
    document.addEventListener("keydown", function (event) {
      if (event.key !== "Escape") return;
      if (state.pick.vision.zoomOpen) {
        state.pick.vision.zoomOpen = false;
        return commit();
      }
      if (state.pick.workbenchAiService) {
        state.pick.workbenchAiService = "";
        return commit();
      }
      if (state.pick.workbenchAiListOpen) {
        state.pick.workbenchAiListOpen = false;
        return commit();
      }
      if (state.pick.reviewArchiveOpen) {
        state.pick.reviewArchiveOpen = false;
        return commit();
      }
      if (state.agent.open) {
        closeAgentState();
        return commit();
      }
      if (state.pick.knowledge.docId) {
        state.pick.knowledge.docId = null;
        state.pick.knowledge.chunkIndex = null;
        return commit();
      }
      if (state.pick.knowledge.ingestOpen) return closeIngest();
    });
  }

  window.addEventListener("message", function (event) {
    var data = event.data;
    if (!data || data.type !== "beng-demo:visibility") return;
    if (data.active) window.SceneTimers.resumeAll();
    else window.SceneTimers.pauseAll();
  });

  // ---------------------------------------------------------------- 启动

  function boot() {
    stage = document.getElementById("stage");
    sceneNav = document.getElementById("sceneNav");
    flowTrack = document.getElementById("flowTrack");
    if (!stage || !sceneNav) throw new Error("[boot] 页面骨架节点缺失");

    window.DomainSchema.assertAll();

    document.getElementById("brandTitle").textContent = META.title;
    document.getElementById("brandSub").textContent = META.subtitle;
    document.getElementById("clock").textContent = META.clockText;
    document.getElementById("statusLine").textContent = META.statusLine;

    bindClicks();
    bindInputs();
    bindKeys();

    // 单页打磨入口（index.html#preset=xxx）。preset 状态**不落盘**——打磨完刷掉
    // hash 就该回到正常演示状态，不该在演示机上留下一份被改过的状态。
    if (window.DevPresets && window.DevPresets.applyFromHash()) {
      render();
      return;
    }

    render();
  }

  window.Boot = {
    render: render,
    commit: commit,
    handleAction: handleAction,
    boot: boot,
    debugInfo: function () { return { renderCount: renderCount }; }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
