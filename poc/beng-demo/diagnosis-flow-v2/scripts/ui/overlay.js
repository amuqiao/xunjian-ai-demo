// window.Overlay —— 浮层外壳。三处共用一套：证据放大 / 归档报告 / 文档入库。
//
// 旧目录有 6 个浮层（agent / workbench-ai-list / review-report-archive / kb-doc /
// kb-ingest / vision-zoom）加 2 个整屏子屏。本版收敛到 3 个浮层 + 1 个 Agent 抽屉：
//   - workbench-ai-list 没有了 —— AI 判断搬上主屏（旧版首屏那张 4 行表之外什么都没有，
//     全部内容藏在这个浮层里，还得先点一行才弹）
//   - vision-zoom / 两个整屏子屏合并成一个"证据放大"浮层
//   - kb-doc 合进知识库右栏的 Agent 引用，不再单开阅读器
//
// 本文件只建外壳（遮罩 + 面板 + 头 + 关闭按钮），内容由调用方传进来。
window.Overlay = (function () {
  "use strict";

  // opts: { key, title, sub, closeAction, narrow, bodyClass, body, actions }
  //
  // key 是**浮层身份**，boot.js 用它判断"这一轮是同一个浮层在更新，还是换了一个浮层"：
  // 同一个 key 连续出现就不重播入场动画。入库动画每 780ms 推进一步、每步都整屏重建，
  // 没有这个 key 就会闪 5 下。
  function render(opts) {
    if (!opts || !opts.title) throw new Error("[Overlay] 必须传 title");
    if (!opts.key) throw new Error("[Overlay] 必须传 key —— boot.js 靠它判断要不要播入场动画");
    if (!opts.closeAction) throw new Error("[Overlay] 必须传 closeAction —— 没有关闭方式的浮层是陷阱");

    return h("div", {
      class: "ov-mask",
      dataset: { overlay: "1", overlayKey: opts.key, action: opts.closeAction }
    }, [
      // 面板上挂 data-stop：boot.js 的委托看到它就不把点击当成"点遮罩关闭"。
      // 不用 stopPropagation —— 那要在这里绑监听，违反"本层不绑事件"的纪律。
      h("div", {
        class: "ov-panel" + (opts.narrow ? " narrow" : ""),
        dataset: { stop: "1" },
        role: "dialog", "aria-modal": "true", "aria-label": opts.title
      }, [
        h("div", { class: "ov-head" }, [
          h("h3", { text: opts.title }),
          opts.sub ? h("span", { class: "ov-sub", text: opts.sub }) : null,
          h("span", { class: "spacer" }),
          opts.actions || null,
          h("button", {
            type: "button", class: "ov-close",
            dataset: { action: opts.closeAction },
            "aria-label": "关闭", title: "关闭（Esc）"
          }, "×")
        ]),
        h("div", { class: "ov-body" + (opts.bodyClass ? " " + opts.bodyClass : "") }, opts.body)
      ])
    ]);
  }

  return { render: render };
})();
