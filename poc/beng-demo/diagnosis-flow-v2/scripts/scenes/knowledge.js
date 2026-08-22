// 场景 ③：知识库。回答「这次处置怎么沉淀下来、怎么被检索到」。
//
// 职责收窄为两件事：资产索引 + 入库动画。**不画任何关系图或节点连线** —— 文档之间的
// 关系可视化由独立的知识图谱 POC（kg-template）承担，本页不放图谱入口。
//
// 【Agent 问答不在本页常驻】第一版把问答面板做成右栏常驻（1000px），结果和右下角那个
// 常驻 AI 助手按钮是两个入口指向同一件事，画面上还挨着重叠。现在统一：三页的 Agent
// 都只从右下角浮窗按钮进抽屉，本页把整个宽度让给资产清单。
// 「归档前如实说报告还没入库」那段状态感知逻辑随之搬进 scripts/ui/agent.js，
// 三页抽屉共用一份判断，不再有第二处实现。
//
// 【归档前后是同一页的两个状态，不是两页】归档案例那一篇在归档前是虚线框 + 「等待人工
// 复核确认」且不可检索，归档后变实线 + 「已索引」，分类计数从 0/1 变 1/1，Agent 的
// 「有没有同类案例」那一问才能引用它。这是把归档和知识库缝上的那一针。
window.SceneKnowledge = (function () {
  "use strict";

  function need(name) {
    if (!window[name]) throw new Error("[SceneKnowledge] 需要先加载 " + name);
    return window[name];
  }

  function renderCats() {
    var AppState = need("AppState");
    var KB = need("DOMAIN_KB");
    var cats = KB.categories(AppState.value.archived);
    return h("div", { class: "kb-cats" }, cats.map(function (c) {
      var full = c.indexed === c.total;
      return h("div", { class: "stat " + (full ? "ok" : "warn") }, [
        h("span", { text: c.label }),
        h("strong", { class: "num", text: c.indexed + " / " + c.total }),
        h("span", { class: "muted", text: c.note })
      ]);
    }));
  }

  function renderAssets() {
    var AppState = need("AppState");
    var KB = need("DOMAIN_KB");
    var archived = AppState.value.archived;

    return h("div", { class: "kb-assets" }, KB.assets.map(function (a) {
      // 归档案例那一篇的状态是派生的：archived 之后才算已索引。其余三篇恒为已索引。
      var indexed = a.state === "indexed" || (a.id === "DOC-CASE" && archived);
      var pending = !indexed;
      return h("article", { class: "kb-asset" + (pending ? " pending" : "") }, [
        h("div", { class: "kb-asset-main" }, [
          h("div", { class: "kb-asset-title", text: a.title }),
          h("div", { class: "kb-asset-src", text: "来源：" + a.source }),
          h("div", { class: "kb-asset-tags" }, a.tags.map(function (t) {
            return h("span", { text: t });
          }))
        ]),
        h("div", { class: "kb-asset-side" }, [
          h("span", { class: "badge " + (indexed ? "ok" : "warn"), text: indexed ? "已索引" : "等待归档" }),
          h("span", { class: "muted", style: "font-size:13px",
            text: a.chunks.length + " 个检索块" })
        ]),
        // 【为什么把检索块摊在卡里】右栏那个常驻问答面板撤掉之后，这一页只剩 6 张卡，
        // 下半屏空着一大片。更重要的是：本页要回答「怎么被检索到」，而"3 个检索块"这个
        // 数字回答不了 —— 把块的原文摊出来，Agent 引用哪一篇、命中的是哪句话，
        // 在同一屏里对得上。归档前那篇是虚的，块文也照样显示（它就是将要入库的内容）。
        h("ul", { class: "kb-asset-chunks" }, a.chunks.map(function (c) {
          return h("li", { text: c });
        }))
      ]);
    }));
  }

  function render() {
    var AppState = need("AppState");
    var KB = need("DOMAIN_KB");
    var archived = AppState.value.archived;
    var cats = KB.categories(archived);
    var indexed = cats.reduce(function (s, c) { return s + c.indexed; }, 0);
    var total = cats.reduce(function (s, c) { return s + c.total; }, 0);

    return h("div", { class: "kb-scene" }, [
      h("section", { class: "card auto" }, [
        h("div", { class: "card-head" }, [
          h("span", { class: "card-title", text: "知识库资产" }),
          h("span", { class: "card-sub", text: indexed + " / " + total + " 份可检索" }),
          h("button", {
            type: "button", class: "tool-btn",
            dataset: { action: "open-ingest" },
            style: "margin-left:12px"
          }, "上传文档"),
          // 明确把问答指向右下角那个入口。不再在本页放第二个问答面板 ——
          // 但也不能让"怎么被检索到"这件事没有出口，所以给一句指路。
          h("button", {
            type: "button", class: "tool-btn",
            dataset: { action: "open-agent" },
            style: "margin-left:8px"
          }, "问 AI 助手")
        ]),
        renderCats()
      ]),
      h("section", { class: "card" }, [
        h("div", { class: "card-head" }, [
          h("span", { class: "card-title", text: "资产清单" }),
          h("span", { class: "card-sub",
            text: (archived ? "本轮报告已入库" : "本轮报告等待归档") + " · 问答走右下角 AI 助手" })
        ]),
        h("div", { class: "card-body scroll", dataset: { scrollKey: "kb-assets" } }, [renderAssets()])
      ])
    ]);
  }

  // 入库动画浮层：5 步，定时器推进。这是本页唯一值得留的动画 —— 「资料怎么进来」
  // 只能靠它演示。步骤数据在 domain/07-kb.js 的 ingestSteps。
  function overlays() {
    var AppState = need("AppState");
    var KB = need("DOMAIN_KB");
    var Overlay = need("Overlay");
    var state = AppState.value;
    if (!state.ingestOpen) return null;

    var steps = KB.ingestSteps;
    var done = state.ingestStep >= steps.length;

    return Overlay.render({
      key: "ingest",
      title: "文档入库",
      sub: done ? "已可检索" : "第 " + (state.ingestStep + 1) + " / " + steps.length + " 步",
      closeAction: "close-ingest",
      narrow: true,
      body: h("div", { class: "ig-steps" }, steps.map(function (step, i) {
        var cls = i < state.ingestStep ? "done" : (i === state.ingestStep ? "current" : "");
        return h("div", { class: "ig-step " + cls }, [
          h("span", { class: "ig-ic", text: i < state.ingestStep ? "✓" : String(i + 1) }),
          h("div", { class: "ig-text" }, [
            h("strong", { text: step.label }),
            h("small", { text: step.detail })
          ])
        ]);
      }))
    });
  }

  return { render: render, overlays: overlays, drawCharts: function () {} };
})();
