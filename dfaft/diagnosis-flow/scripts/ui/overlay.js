// UI 组件层：浮层外壳。三个浮层（Agent 对话 / 文档阅读器 / 入库动画）共用它。
//
// 组件只产出 DOM，不绑事件：关闭按钮带 data-action=onCloseAction，由 boot.js 的事件
// 委托接。closeDisabled 用于入库动画未跑完时禁止关闭——那一步关掉就看不到最关键的
// "检索命中"环节了。
//
// ---- key 是防闪烁的关键 ----
// 每个浮层必须声明一个稳定的 key，落到 data-overlay-key 上。boot.js 的
// renderOverlays() 据此判断"这一轮要挂的浮层和现在挂着的是不是同一个"：是同一个就
// **原地保留**，不重新创建。
//
// 不这么做的后果是真的：入库动画每 700ms 推进一步会触发一次渲染，浮层被销毁重建，
// .overlay-mask 上的 overlay-in 淡入动画和 chunk 的落下动画跟着从头重播——每 700ms
// 闪一次。这类问题不抛错、不进日志，只能靠眼睛发现。
(function () {
  "use strict";

  var KEY_ATTR = "data-overlay-key";

  function render(options) {
    options = options || {};
    if (typeof options.open !== "boolean") throw new Error("Overlay 的 open 必须是布尔值");
    if (typeof options.onCloseAction !== "string" || options.onCloseAction === "") {
      throw new Error("Overlay 的 onCloseAction 必须是非空字符串");
    }
    if (typeof options.key !== "string" || options.key === "") {
      throw new Error("Overlay 的 key 必须是非空字符串（boot.js 靠它判断是否原地保留，缺了就会每轮重建、动画反复重播）");
    }
    if (!options.open) return null;
    if (typeof options.title !== "string" || options.title === "") {
      throw new Error("Overlay 的 title 必须是非空字符串");
    }

    var closeDisabled = options.closeDisabled === true;

    var maskAttrs = {
      class: "overlay-mask" + (options.wide ? " wide" : ""),
      role: "dialog",
      "aria-modal": "true",
      "aria-label": options.title
    };
    maskAttrs[KEY_ATTR] = options.key;

    return h("div", maskAttrs, [
      h("section", { class: "overlay-panel " + (options.panelClass || "") }, [
        h("header", { class: "overlay-head" }, [
          h("div", {}, [
            options.kicker ? h("p", { class: "kicker", text: options.kicker }) : null,
            h("h3", { text: options.title })
          ]),
          h("button", {
            type: "button",
            class: "overlay-close",
            disabled: closeDisabled ? "disabled" : null,
            title: closeDisabled ? "处理完成后才能关闭" : "关闭",
            "aria-label": "关闭",
            dataset: { action: options.onCloseAction },
            text: "×"
          })
        ]),
        h("div", { class: "overlay-body" }, options.body),
        (options.actions && options.actions.length)
          ? h("footer", { class: "overlay-foot" }, options.actions.map(function (action) {
            return h("button", {
              type: "button",
              class: action.primary ? "primary-action" : "plain-button",
              // 按钮的存在与否不随状态变化，只有 disabled 变——这样定点刷新可以直接
              // 改 disabled，不需要重建 footer（重建就会连带重建整个浮层）。
              disabled: action.disabled === true ? "disabled" : null,
              dataset: { action: action.action },
              text: action.text
            });
          }))
          : null
      ])
    ]);
  }

  window.Overlay = { render: render, KEY_ATTR: KEY_ATTR };
})();
