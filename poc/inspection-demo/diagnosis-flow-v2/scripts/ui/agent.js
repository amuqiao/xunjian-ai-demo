// window.AgentPanel —— 常驻 AI 助手抽屉。三页都挂（这是刻意的设计：模拟常驻助手，
// 不是三处重复入口）。组件本身不读领域数据，只按 contextKey 取语料
// —— 换页只换 contextKey，组件不变。
//
// 【答案是预设的，"检索中"是定时器】没有真实模型。点一个预设问题：
//   ① 立刻把问题作为"我"的气泡插进对话流
//   ② 显示三点跳动画（agentPending）
//   ③ 定时器到点后清 pending，答案气泡出现，带引用胶囊
// 三点跳那 0.9 秒不是装饰 —— 没有它，答案瞬间出现会让人以为是写死的文本。
window.AgentPanel = (function () {
  "use strict";

  function need(name) {
    if (!window[name]) throw new Error("[AgentPanel] 需要先加载 " + name);
    return window[name];
  }

  function render() {
    var AppState = need("AppState");
    var KB = need("DOMAIN_KB");
    var state = AppState.value;
    if (!state.agentOpen) return null;

    var ctx = KB.contextOf(state.scene);
    var asked = state.agentAsked;

    // 对话流：按提问顺序渲染。正在检索的那一条只出问题气泡 + 三点，答案还没到。
    var stream = [];
    asked.forEach(function (qid) {
      var q = ctx.questions.filter(function (x) { return x.id === qid; })[0];
      // 换页之后语境变了，历史里可能有当前语境没有的问题 id —— 跳过而不是抛错：
      // 那不是数据错误，是用户真的换了页。
      if (!q) return;
      stream.push(h("div", { class: "ag-msg me" }, [
        h("span", { class: "ag-msg-who", text: "我" }),
        h("div", { class: "ag-bubble", text: q.text })
      ]));
      if (state.agentPending === qid) {
        stream.push(h("div", { class: "ag-msg" }, [
          h("span", { class: "ag-msg-who", text: "AI 助手" }),
          h("div", { class: "ag-bubble" }, [
            h("span", { class: "ag-typing" }, [h("i", {}), h("i", {}), h("i", {})]),
            h("span", { class: "muted", text: " 正在检索知识库…" })
          ])
        ]));
        return;
      }
      // 【引用的状态感知】本轮复核报告（DOC-CASE）在归档前还没入库，所以引用它的那一问
      // 必须如实说"还没入库"，而不是照样给一个引用 —— 那会变成"AI 引用了一篇还不存在的
      // 文档"，是这类演示最容易被追问的地方。
      // 这段逻辑原先写在知识库页右栏那个常驻问答面板里；右栏撤掉之后搬到这里，
      // 三页的抽屉共用同一份判断，不再有第二处实现。
      var citesReady = q.cites.every(function (id) {
        return id !== "DOC-CASE" || AppState.value.archived;
      });
      stream.push(h("div", { class: "ag-msg" }, [
        h("span", { class: "ag-msg-who", text: "AI 助手" }),
        h("div", { class: "ag-bubble", text: citesReady
          ? q.answer
          : "这一问要引用本轮的归档报告，但它还没通过人工复核确认、尚未入库。先去人工复核页确认结论并归档，我就能引用它了。" }),
        citesReady && q.cites.length
          ? h("div", { class: "ag-cites" }, q.cites.map(function (id) {
              return h("span", { text: "引用 · " + KB.assetById(id).title });
            }))
          : null
      ]));
    });

    if (!stream.length) {
      stream.push(h("div", { class: "ag-msg" }, [
        h("span", { class: "ag-msg-who", text: "AI 助手" }),
        h("div", { class: "ag-bubble", text: "我能看到这一屏的证据和知识库里的资料。点上面的问题，或者直接问我。" })
      ]));
    }

    return h("aside", { class: "ag-drawer", dataset: { stop: "1" }, "aria-label": "AI 助手" }, [
      h("div", { class: "ov-head" }, [
        h("h3", { text: "AI 助手" }),
        h("span", { class: "ov-sub", text: "语境 · " + ctx.label }),
        h("span", { class: "spacer" }),
        h("button", {
          type: "button", class: "ov-close",
          dataset: { action: "close-agent" },
          "aria-label": "关闭", title: "关闭（Esc）"
        }, "×")
      ]),
      // 抽屉改半屏之后问题列表独占左栏，需要一行小标题说明这一栏是什么 ——
      // 否则一列胶囊贴在对话流左边，看着像筛选器。
      h("div", { class: "ag-questions" }, [
        h("div", { class: "ag-side-label" }, [
          h("span", { text: "高频问题" }),
          h("span", { class: "muted", text: ctx.questions.length + " 条" })
        ])
      ].concat(ctx.questions.map(function (q) {
        var used = asked.indexOf(q.id) >= 0;
        return h("button", {
          type: "button",
          class: "chip" + (used ? " active" : ""),
          dataset: { action: "ask-agent", questionId: q.id }
        }, [
          h("span", { class: "chip-kind", text: "问" }),
          h("span", { class: "chip-text" }, [h("strong", { text: q.text })])
        ]);
      }))),
      h("div", { class: "ag-stream", dataset: { scrollKey: "agent-stream", scrollAnchor: "bottom" } }, stream),
      // 输入框是**展示性**的：本 POC 没有真实模型，自由提问无法给出可信答案。
      // 做成 disabled + 明确提示，比做成能打字但回一句套话诚实。
      h("div", { class: "ag-foot" }, [
        h("input", {
          type: "text", disabled: "disabled",
          placeholder: "本演示只回答上方预设问题",
          "aria-label": "自由提问（本演示未启用）"
        }),
        h("button", { type: "button", class: "tool-btn", disabled: "disabled" }, "发送")
      ])
    ]);
  }

  return { render: render };
})();
