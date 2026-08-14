// 场景：知识图谱模块。pump-demo 保留主页/场景导航，本场景把已单独构建的
// kg_stage_beng 作为完整模块内嵌；知识库仍由 scenes/knowledge.js 负责。
(function () {
  "use strict";

  var AppState = window.AppState;
  var state = window.AppState.value;

  function kgStageSrc() {
    return "modules/kg-stage-beng/index.html" + (window.innerWidth <= 1600 ? "?stable=1" : "") + "#/stage";
  }

  function switchButton(label, active, action) {
    var attrs = {
      type: "button",
      class: active ? "primary-action" : "plain-button",
      text: label
    };
    if (active) attrs.disabled = "disabled";
    else attrs.dataset = { action: action };
    return h("button", attrs);
  }

  function renderModeSwitch(activeView) {
    return h("div", { class: "knowledge-head-actions graph-module-switch", role: "group", "aria-label": "知识模块切换" }, [
      switchButton("查看知识图", activeView === "graph", "show-knowledge-graph"),
      switchButton("查看知识库", activeView === "library", "show-knowledge-library")
    ]);
  }

  function renderGraphFrame() {
    return h("section", { class: "graph-module-frame-panel" }, [
      h("iframe", {
        class: "graph-module-frame",
        title: "湖南公司输油泵机组运维知识图谱",
        src: kgStageSrc(),
        loading: "eager",
        referrerpolicy: "no-referrer"
      })
    ]);
  }

  function renderGraph() {
    var activeView = state.pick.knowledge.view === "library" ? "library" : "graph";
    var title = activeView === "library" ? "输油泵诊断知识库" : "湖南公司输油泵机组运维知识图谱";
    var body = activeView === "library" ? window.Scenes.renderKnowledgeLibraryContent() : renderGraphFrame();
    return AppState.pageShell(
      "泵知识模块 / 知识图",
      title,
      renderModeSwitch(activeView),
      body
    );
  }

  window.Scenes = window.Scenes || {};
  window.Scenes.renderGraph = renderGraph;
  window.Scenes.renderGraphCharts = function () {};
})();
