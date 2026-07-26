/*
 * remote.js — 顶部进度轴(#progressRail) + 唤出式遥控器(#remote/#remoteHotzone)
 *
 * 进度轴:主叙事进度指示(总览→分析→复检→报告),常驻顶栏,反映当前走到哪。
 * 遥控器:演示者兜底/快速跳转工具,平时几乎隐形,hover 或数字键 1-4 唤出,点击秒跳任意场景。
 *
 * 两者的点击跳转均为 direction:'jump'(平级跳转,兜底用途,允许自由跳转不受主线约束)。
 */
(function () {
  "use strict";

  var DATA = window.DEMO_DATA;
  var RAIL_STEPS = DATA.railSteps;
  var ORDER = DATA.sceneOrder;

  var railEl = document.getElementById("progressRail");
  var remoteEl = document.getElementById("remote");

  var railStepNodes = {}; // scene -> .rail-step 节点
  var remoteBtnNodes = {}; // scene -> .remote-btn 节点
  var remoteOpenTimer = null;

  // 统一跳转:进度轴/遥控器/数字键都走平级跳转(兜底用途)
  function jumpTo(scene) {
    Router.go(scene, { direction: "jump" });
  }

  /* ============ 进度轴渲染 ============ */

  function renderRail() {
    RAIL_STEPS.forEach(function (step, i) {
      if (i > 0) {
        railEl.appendChild(DemoUtil.el("span", { class: "rail-sep" }));
      }
      // rail-step 用 div(非 button):shell.css 未给它设 border/background 重置,
      // 用 button 会带出默认按钮外观;用 role=button + tabindex 保留可点击/可键盘操作的语义。
      var node = DemoUtil.el(
        "div",
        {
          class: "rail-step",
          role: "button",
          tabindex: "0",
          style: "cursor:pointer",
          dataset: { scene: step.scene },
          onClick: function () {
            jumpTo(step.scene);
          },
          onKeydown: function (e) {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              jumpTo(step.scene);
            }
          },
        },
        [
          DemoUtil.el("span", { class: "rail-idx", text: String(i + 1) }),
          DemoUtil.el("span", { class: "rail-text", text: step.label }),
        ]
      );
      railStepNodes[step.scene] = node;
      railEl.appendChild(node);
    });
  }

  // 根据当前场景刷新进度轴的 active/done 状态
  function syncRail(name) {
    var curIdx = ORDER.indexOf(name);
    RAIL_STEPS.forEach(function (step) {
      var node = railStepNodes[step.scene];
      var idx = ORDER.indexOf(step.scene);
      node.classList.toggle("active", step.scene === name);
      node.classList.toggle("done", idx < curIdx);
    });
  }

  /* ============ 遥控器渲染 ============ */

  function renderRemote() {
    remoteEl.appendChild(DemoUtil.el("span", { class: "remote-label", text: "快速跳转" }));
    RAIL_STEPS.forEach(function (step, i) {
      var node = DemoUtil.el(
        "button",
        {
          class: "remote-btn",
          type: "button",
          dataset: { scene: step.scene },
          onClick: function () {
            jumpTo(step.scene);
          },
        },
        [
          DemoUtil.el("span", { class: "remote-text", text: step.label }),
          DemoUtil.el("kbd", { text: String(i + 1) }),
        ]
      );
      remoteBtnNodes[step.scene] = node;
      remoteEl.appendChild(node);
    });
  }

  // 根据当前场景刷新遥控器按钮的 active 状态
  function syncRemote(name) {
    RAIL_STEPS.forEach(function (step) {
      remoteBtnNodes[step.scene].classList.toggle("active", step.scene === name);
    });
  }

  /* ============ 数字键 1-4 唤出遥控器 ============ */

  function openRemoteFeedback() {
    remoteEl.classList.add("is-open");
    if (remoteOpenTimer) window.clearTimeout(remoteOpenTimer);
    remoteOpenTimer = window.setTimeout(function () {
      remoteEl.classList.remove("is-open");
    }, 1500);
  }

  function isTypingTarget(target) {
    var tag = target.tagName;
    return tag === "INPUT" || tag === "TEXTAREA";
  }

  function onKeydown(e) {
    if (isTypingTarget(e.target)) return;
    var idx = Number(e.key) - 1;
    if (idx < 0 || idx >= ORDER.length) return;
    var scene = ORDER[idx];
    openRemoteFeedback();
    jumpTo(scene);
  }

  /* ============ 初始化 ============ */

  function init() {
    renderRail();
    renderRemote();
    Router.onChange(function (name) {
      syncRail(name);
      syncRemote(name);
    });
    window.addEventListener("keydown", onKeydown);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
