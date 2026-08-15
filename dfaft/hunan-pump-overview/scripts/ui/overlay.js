// 通用浮层：AgentDialog、知识库文档查看浮层和视觉放大预览复用同一份外壳。
// 和 ui/detailcard.js 刻意不知道自己在
// "右侧栏"是同一个原则——本组件只负责"遮罩 + 面板 + 头部(kicker/title/关闭按钮) +
// body 容器 + 操作区"这套外壳结构，不关心 body 里装的是什么（Agent 问答弹窗、知识库
// 文档正文……），也不关心自己被放在页面的什么位置（右下抽屉/居中弹层由调用方的
// CSS 决定）。
//
// open 为 false 时依然完整渲染这套结构（不拆 DOM），只用 class 切可见性、
// aria-hidden 切可访问性：CSS 过渡（transform/opacity）需要"关闭前"那份 DOM 仍然
// 存在才能演出"收起去"的动画，而不是打开/关闭两种状态各画一棵不同的树。
//
// 焦点陷阱（Tab 在浮层内循环）与 Escape 关闭，这两件事本组件**不实现**：
// 现有实现整段在 boot.js 的 document.keydown 监听里（focusableAgentControls()/
// Focus.remember·restore），通过 querySelector(".agent-dialog") 找面板做 Tab 循环、
// Escape 时直接改 state.agentDialog 并调用 render()——这本来就是"浏览器全局键盘事件
// → 改 state → render()"这一类逻辑，天然只能挂在 boot.js 的全局委托里，不可能下沉进
// 一个不持有 state、也不该自己 addEventListener 去改 state 的可复用组件。本组件因此
// 只负责把"关闭"这个交互点用 data-action=onCloseAction 渲染到遮罩和头部关闭按钮上；
// 当 closeDisabled=true 时，遮罩不带 data-action、关闭按钮禁用，用于上传演示这类
// 需要等流程完成后才能关闭的弹窗。
//
// panelClass / layerClass：在题面给的 4 个字段（open/title/kicker/body/actions/
// onCloseAction/wide）之外新增的两个可选字段，纯粹是为了在不改 boot.js 的前提下，
// 让面板/外层能额外带上宿主要求的 class——比如 AgentDialog 传入 ".agent-dialog"，
// boot.js 的 focusableAgentControls()/focusAgentDialog() 就能找到同一个节点。
// 不传时面板只带组件自身的 overlay-* 类。
(function () {
  "use strict";

  function assertNonEmptyString(value, name) {
    if (typeof value !== "string" || value === "") {
      throw new Error(name + " 必须是非空字符串");
    }
  }

  function assertBoolean(value, name) {
    if (typeof value !== "boolean") {
      throw new Error(name + " 必须是布尔值");
    }
  }

  function renderActions(actions) {
    if (!Array.isArray(actions)) throw new Error("Overlay 的 actions 必须是数组");
    return actions.map(function (item) {
      assertNonEmptyString(item.action, "Overlay actions[].action");
      assertNonEmptyString(item.text, "Overlay actions[].text");
      return h("button", {
        type: "button",
        class: item.primary ? "primary-action" : "plain-button",
        dataset: { action: item.action },
        text: item.text,
      });
    });
  }

  // 把组件自身的基础 class 和调用方传入的可选额外 class（panelClass/layerClass）
  // 拼起来；额外 class 不传则跳过，传了必须是非空字符串——不接受"传了但是空字符串"
  // 这种模糊输入。
  function joinClass(base, extra, name) {
    if (extra == null) return base;
    assertNonEmptyString(extra, name);
    return base + " " + extra;
  }

  function render(options) {
    options = options || {};
    assertNonEmptyString(options.title, "Overlay 的 title");
    assertBoolean(options.open, "Overlay 的 open");
    assertNonEmptyString(options.onCloseAction, "Overlay 的 onCloseAction");
    if (options.body == null) throw new Error("Overlay 的 body 不能为空");
    if (options.kicker != null) assertNonEmptyString(options.kicker, "Overlay 的 kicker");
    if (options.wide != null) assertBoolean(options.wide, "Overlay 的 wide");
    if (options.closeDisabled != null) assertBoolean(options.closeDisabled, "Overlay 的 closeDisabled");

    var actionButtons = renderActions(options.actions);
    var closeDisabled = options.closeDisabled === true;
    var maskAttrs = { class: "overlay-mask" + (closeDisabled ? " overlay-mask-locked" : "") };
    var closeAttrs = {
      type: "button",
      class: "tool-btn",
      disabled: closeDisabled ? "disabled" : null,
      text: closeDisabled ? "处理中" : "关闭",
    };
    if (!closeDisabled) {
      maskAttrs.dataset = { action: options.onCloseAction };
      closeAttrs.dataset = { action: options.onCloseAction };
    }

    var headText = [h("h3", { class: "overlay-title", text: options.title })];
    if (options.kicker != null) headText.unshift(h("p", { class: "kicker", text: options.kicker }));

    var panelClass = joinClass(
      "panel overlay-panel" + (options.wide === true ? " overlay-wide" : ""),
      options.panelClass,
      "Overlay 的 panelClass"
    );
    var layerClass = joinClass(
      "overlay-layer" + (options.open ? " open" : ""),
      options.layerClass,
      "Overlay 的 layerClass"
    );

    return h("div", { class: layerClass, "aria-hidden": options.open ? "false" : "true" }, [
      h("div", maskAttrs),
      h("aside", {
        class: panelClass,
        role: "dialog",
        "aria-modal": "true",
        "aria-label": options.title,
        tabindex: "-1",
      }, [
        h("div", { class: "overlay-head" }, [
          h("div", {}, headText),
          h("button", closeAttrs),
        ]),
        h("div", { class: "overlay-body" }, options.body),
        actionButtons.length ? h("div", { class: "overlay-foot" }, actionButtons) : null,
      ]),
    ]);
  }

  window.Overlay = {
    render: render
  };
})();
