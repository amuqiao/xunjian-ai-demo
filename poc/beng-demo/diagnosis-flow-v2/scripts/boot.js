// 引导层（最后加载）：全局断言 + render 管线 + 事件委托 + 定时器 + 启动。
//
// 【比旧目录 899 行的 boot.js 薄很多】去掉的东西：6 步流程轨的渲染（那条轨从来没
// 挂载过，index.html 里没有 #flowTrack，renderFlow() 每次第一行就 return）、
// canOpen 假锁、localStorage 持久化与脏状态清洗、增量挂载浮层的那套 key 比对
// （本版浮层每轮重建，因为浮层里没有需要跨轮保活的动画状态 —— 入库动画的进度存在
// state.ingestStep 里，重建后按它渲染就行）。
//
// 【焦点恢复】整屏重建 DOM 之后把焦点落回同名控件，并恢复光标位置。没有这一步，
// 在复核意见框里每打一个字就会因为 render() 重建而丢焦点 —— 那是 textarea 走
// input 事件驱动重渲染时必须配的一步，不是可选的润色。
//
// 【入场动画门 —— 2026-08-23 修的那个"动画会闪"】
// 每次 render() 都 innerHTML="" 全量重建，所以写在 .ov-panel / .ag-drawer / 场景顶层块
// 上的 CSS 入场动画会**在每一次 render 时重播**。定时器驱动的更新（入库动画每 780ms
// 推进一步、Agent 问答的三点→答案）因此一路闪。实测：入库 5 步期间 overlayIn 重播 6 次、
// 场景 fadeUp 重播 12 次；Agent 问一次 fadeUp 重播 4 次。
//
// 修法不是"关掉动画"，而是**只在真的进场时才播**：记住上一轮挂了什么（场景 key、浮层
// key、抽屉开没开），只有变了才给对应元素加 .is-enter（CSS 里动画挂在这个类上）。
// 顺带解决了另一个毛病：点一行记录、选一枚依据、在意见框里打一个字，原先都会让整屏
// 重新淡入。
//
// 【滚动保持】同理，全量重建会把所有滚动容器打回顶部。带 data-scroll-key 的容器在
// render 前记下 scrollTop、render 后写回；data-scroll-anchor="bottom" 的（对话流）
// 直接贴底 —— 聊天流新消息进来就该在视野里，恢复旧位置反而看不到答案。
(function () {
  "use strict";

  function need(name) {
    if (!window[name]) throw new Error("[boot] 缺少全局依赖 " + name + "，请检查 index.html 的 <script> 顺序");
    return window[name];
  }

  ["echarts", "h", "append",
   "DOMAIN_STATION", "DOMAIN_VISION", "DOMAIN_SERIES", "DOMAIN_RECORDS",
   "DOMAIN_REVIEW", "DOMAIN_REPORT", "DOMAIN_KB",
   "Charts", "ChartOptions", "ReportModel", "AppState",
   "Overlay", "AgentPanel", "EvidenceView", "ReportView",
   "SceneWorkbench", "SceneReview", "SceneKnowledge"].forEach(need);

  var AppState = window.AppState;
  var state = AppState.value;

  var root = document.getElementById("appRoot");
  if (!root) throw new Error("[boot] 缺少挂载点 #appRoot");

  var SCENES = {
    workbench: window.SceneWorkbench,
    review: window.SceneReview,
    knowledge: window.SceneKnowledge
  };
  var SHELL_CONTEXT_STEPS = [
    { key: "overview", label: "大屏总览", mark: "总览", href: "../hunan-pump-overview-v2/index.html" },
    { key: "station", label: "泵站态势", mark: "态势", href: "../pump-station-situation-v2/index.html" }
  ];

  // 在 poc/inspection-demo/index.html 的 iframe 外壳里运行时，外壳广播可见性。
  // 本 POC 没有 3D，不需要停渲染循环 —— 但要在切回来时 resize 图表，否则
  // 在隐藏状态下 init 的实例会停在 0 宽高。
  window.addEventListener("message", function (event) {
    var data = event.data;
    if (!data || data.type !== "inspection-demo:visibility") return;
    if (data.active) window.Charts.resizeAll();
  });

  // ---------------------------------------------------------------- 定时器
  //
  // 两个：Agent 的"检索中"三点动画，和入库动画的逐步推进。都是模块级单例句柄，
  // 设新的之前先清旧的 —— 连续点两个问题时不能有两个定时器抢着改同一个字段。
  var agentTimer = null;
  var ingestTimer = null;

  var AGENT_THINK_MS = 900;
  var INGEST_STEP_MS = 780;

  function scheduleAgentSettle() {
    if (agentTimer) window.clearTimeout(agentTimer);
    agentTimer = window.setTimeout(function () {
      agentTimer = null;
      AppState.settleAgent();
      render();
    }, AGENT_THINK_MS);
  }

  function stopIngest() {
    if (ingestTimer) window.clearInterval(ingestTimer);
    ingestTimer = null;
  }

  function startIngest() {
    stopIngest();
    var KB = window.DOMAIN_KB;
    state.ingestStep = 0;
    ingestTimer = window.setInterval(function () {
      state.ingestStep += 1;
      if (state.ingestStep >= KB.ingestSteps.length) {
        state.ingestStep = KB.ingestSteps.length;
        stopIngest();
      }
      render();
    }, INGEST_STEP_MS);
  }

  // ---------------------------------------------------------------- 顶栏

  function renderTopbar() {
    var record = AppState.record();
    var steps = AppState.steps();
    var nav = [];
    steps.forEach(function (step, i) {
      if (i > 0) nav.push(h("span", { class: "step-sep" }));
      nav.push(h("button", {
        type: "button",
        class: "step-btn" + (state.scene === step.key ? " active" : "") + (step.done ? " done" : ""),
        dataset: { action: "go-scene", sceneKey: step.key },
        "aria-current": state.scene === step.key ? "step" : null
      }, [
        h("span", { class: "step-index", text: step.done ? "✓" : String(i + 1) }),
        h("span", { text: step.label })
      ]));
    });

    return h("header", { class: "topbar panel" }, [
      h("div", { class: "topbar-left" }, [
        h("span", { class: "brand-mark", "aria-hidden": "true", text: "诊" }),
        h("div", { class: "topbar-site" }, [
          h("strong", { text: AppState.object().name + " " + AppState.object().unit }),
          h("small", { text: AppState.part().label + " · " + record.item })
        ])
      ]),
      h("nav", { class: "step-nav", "aria-label": "诊断主线三步" }, nav),
      h("div", { class: "topbar-right" }, [
        h("div", { class: "topbar-meta" }, [
          h("strong", { class: "num", text: AppState.caseId() }),
          // 泵这边的记录没有 date/shift/inspector —— 那三个字段属于"某个人某一班巡了一轮"
          // 的语境，而这里是"某台机组的一次诊断"。副行改成机组身份：型号 + 厂家 + 班次。
          h("small", { text: AppState.object().model + " · " + AppState.object().vendor
            + " · " + AppState.object().shift })
        ]),
        h("button", { type: "button", class: "tool-btn", dataset: { action: "reset-demo" } }, "重置演示")
      ])
    ]);
  }

  function renderContextRail() {
    return h("nav", { class: "context-rail", "aria-label": "诊断上下文入口" },
      SHELL_CONTEXT_STEPS.map(function (step) {
        return h("button", {
          type: "button",
          class: "context-fab",
          dataset: { action: "open-shell-step", shellKey: step.key, href: step.href },
          title: step.label,
          "aria-label": step.label
        }, [
          h("span", { class: "context-fab-mark", text: step.mark })
        ]);
      }));
  }

  function openShellStep(key, href) {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: "beng-demo:switch", key: key }, "*");
      return;
    }
    window.location.href = href;
  }

  // ---------------------------------------------------------------- render 管线

  // 焦点键 + 光标位置。整屏重建之后按它把焦点和光标放回去。
  function captureFocus() {
    var el = document.activeElement;
    if (!el || !el.dataset || !el.dataset.focusKey) return null;
    var mark = { key: el.dataset.focusKey };
    if (typeof el.selectionStart === "number") {
      mark.start = el.selectionStart;
      mark.end = el.selectionEnd;
    }
    return mark;
  }

  function restoreFocus(mark) {
    if (!mark) return;
    var el = root.querySelector('[data-focus-key="' + mark.key + '"]');
    if (!el) return;
    el.focus();
    if (typeof mark.start === "number" && typeof el.setSelectionRange === "function") {
      el.setSelectionRange(mark.start, mark.end);
    }
  }

  // 滚动位置：render 前收集，render 后写回。
  function captureScroll() {
    var out = {};
    root.querySelectorAll("[data-scroll-key]").forEach(function (el) {
      out[el.dataset.scrollKey] = el.scrollTop;
    });
    return out;
  }

  function restoreScroll(marks) {
    root.querySelectorAll("[data-scroll-key]").forEach(function (el) {
      if (el.dataset.scrollAnchor === "bottom") {
        // 对话流：贴底。答案刚落地就该在视野里，恢复旧位置会让人看不到它。
        el.scrollTop = el.scrollHeight;
        return;
      }
      var prev = marks[el.dataset.scrollKey];
      if (typeof prev === "number") el.scrollTop = prev;
    });
  }

  // 上一轮挂了什么。入场动画只在这三样发生变化时播 —— 见文件头「入场动画门」。
  var lastMount = { scene: null, overlayKey: null, drawerOpen: false };

  var renderCount = 0;

  function render() {
    renderCount += 1;
    var focusMark = captureFocus();
    var scrollMarks = captureScroll();

    window.Charts.beginPass();
    var scene = SCENES[state.scene];

    root.innerHTML = "";
    root.appendChild(renderTopbar());

    var sceneNode = scene.render();
    if (state.scene !== lastMount.scene) sceneNode.classList.add("is-enter");
    root.appendChild(h("main", { class: "stage", id: "stage", tabindex: "-1" }, [sceneNode]));

    // 浮层与 Agent 抽屉挂在 .app-shell 层，不进 .stage —— stage 有 overflow:hidden，
    // 放进去会被裁掉。
    var overlay = scene.overlays();
    var overlayKey = overlay ? overlay.dataset.overlayKey : null;
    if (overlay) {
      // 同一个 key 连续出现 = 同一个浮层在更新，不重播入场动画。
      if (overlayKey !== lastMount.overlayKey) {
        overlay.querySelector(".ov-panel").classList.add("is-enter");
      }
      root.appendChild(overlay);
    }
    var drawer = window.AgentPanel.render();
    if (drawer) {
      if (!lastMount.drawerOpen) drawer.classList.add("is-enter");
      root.appendChild(drawer);
    }

    lastMount.scene = state.scene;
    lastMount.overlayKey = overlayKey;
    lastMount.drawerOpen = !!drawer;

    root.appendChild(renderContextRail());

    // 常驻 AI 助手按钮：三页都有（刻意的设计）。知识库页右栏已经是问答，但按钮仍在 ——
    // 它表达的是"助手随时在"，不是"这页有问答功能"。
    root.appendChild(h("button", {
      type: "button",
      class: "agent-fab" + (state.agentOpen ? " is-open" : ""),
      dataset: { action: state.agentOpen ? "close-agent" : "open-agent" },
      title: state.agentOpen ? "收起 AI 助手" : "打开 AI 助手",
      "aria-expanded": state.agentOpen ? "true" : "false"
    }, "AI"));

    // 图表分两段：场景渲染只挂槽位，数据在 append 之后统一 draw ——
    // ECharts 要量宿主尺寸，反过来会静默画出 0 高度的空图（见 core/charts.js）。
    scene.drawCharts();
    window.Charts.flush();

    restoreFocus(focusMark);
    restoreScroll(scrollMarks);
  }

  // ---------------------------------------------------------------- 事件委托

  function handleAction(action, el) {
    if (action === "go-scene") { AppState.setScene(el.dataset.sceneKey); return render(); }
    if (action === "go-knowledge") { AppState.setScene("knowledge"); return render(); }
    if (action === "select-evidence") { AppState.setEvidence(Number(el.dataset.evidenceIndex)); return render(); }
    if (action === "open-zoom") { state.zoomOpen = true; return render(); }
    if (action === "close-zoom") { state.zoomOpen = false; return render(); }
    if (action === "set-range") { AppState.setRange(el.dataset.rangeKey); return render(); }
    if (action === "select-outcome") { AppState.setOutcome(el.dataset.outcomeId); return render(); }
    if (action === "append-phrase") { AppState.appendPhrase(el.dataset.phrase); return render(); }
    if (action === "open-archive") { state.archiveOpen = true; return render(); }
    if (action === "close-archive") { state.archiveOpen = false; return render(); }
    if (action === "confirm-archive") { AppState.archive(); return render(); }
    if (action === "open-ingest") { state.ingestOpen = true; startIngest(); return render(); }
    if (action === "close-ingest") { state.ingestOpen = false; stopIngest(); return render(); }
    if (action === "open-agent") { state.agentOpen = true; return render(); }
    if (action === "close-agent") { state.agentOpen = false; return render(); }
    if (action === "open-shell-step") { return openShellStep(el.dataset.shellKey, el.dataset.href); }
    if (action === "ask-agent") {
      AppState.askAgent(el.dataset.questionId);
      scheduleAgentSettle();
      return render();
    }
    if (action === "reset-demo") {
      stopIngest();
      if (agentTimer) { window.clearTimeout(agentTimer); agentTimer = null; }
      AppState.reset();
      return render();
    }
    // set-note / set-reviewer 只走 input/change，不走 click。走到这里说明有元素挂了
    // 一个没实现的 action —— 直接抛错，不静默忽略。
    throw new Error("[boot] 未处理的 data-action：" + action);
  }

  root.addEventListener("click", function (event) {
    var target = event.target;
    if (!(target instanceof Element)) return;

    // 浮层遮罩点击关闭：点在面板内部（带 data-stop）就不算点遮罩。
    // 用属性标记而不是 stopPropagation —— 后者要在渲染层绑监听，违反"渲染不绑事件"。
    var stop = target.closest("[data-stop]");
    var actionEl = target.closest("[data-action]");
    if (actionEl && stop && actionEl.contains(stop) && actionEl.dataset.overlay === "1") {
      // 点到的是遮罩上的某个后代，但它在面板里 —— 不关闭。
      return;
    }
    if (actionEl) {
      if (actionEl.hasAttribute("disabled")) return;
      // <select> 和 <textarea> 的 action 由 change/input 处理，点击不触发。
      var tag = actionEl.tagName.toLowerCase();
      if (tag === "select" || tag === "textarea") return;
      handleAction(actionEl.dataset.action, actionEl);
      return;
    }

    var rowEl = target.closest('[data-select="record"][data-select-id]');
    if (rowEl) { AppState.setRecord(rowEl.dataset.selectId); return render(); }
  });

  // textarea 走 input：每输入一次就更新 state 并重渲染（报告草稿要跟着变），
  // 靠 captureFocus/restoreFocus 保住焦点与光标。
  root.addEventListener("input", function (event) {
    var el = event.target;
    if (!(el instanceof Element) || !el.dataset || el.dataset.action !== "set-note") return;
    AppState.setNote(el.value);
    render();
  });

  root.addEventListener("change", function (event) {
    var el = event.target;
    if (!(el instanceof Element) || !el.dataset || el.dataset.action !== "set-reviewer") return;
    AppState.setReviewer(el.value);
    render();
  });

  // Esc 逐层关闭：先 Agent 抽屉，再浮层。一次只关一层，符合"最后打开的先关"。
  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape") return;
    if (state.agentOpen) { state.agentOpen = false; return render(); }
    if (state.zoomOpen) { state.zoomOpen = false; return render(); }
    if (state.archiveOpen) { state.archiveOpen = false; return render(); }
    if (state.ingestOpen) { state.ingestOpen = false; stopIngest(); return render(); }
  });

  window.addEventListener("resize", function () { window.Charts.resizeAll(); });

  // 给验收脚本用的探针。renderCount 能直接断言"动画期间没有整屏重渲染"这类事
  // —— "没有闪"本身没法从 DOM 上读出来。
  window.DemoDebug = {
    renderCount: function () { return renderCount; },
    state: function () { return state; },
    charts: function () { return window.Charts.debugInfo(); },
    // 给验收脚本断言"入场动画没有在 tick 时重播"用。
    mount: function () { return { scene: lastMount.scene, overlayKey: lastMount.overlayKey, drawerOpen: lastMount.drawerOpen }; }
  };

  render();
})();
