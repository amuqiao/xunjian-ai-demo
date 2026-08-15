// 场景：报告归档。要回答的问题是"这次处置怎么沉淀下来"。
//
// 这一页的全部意义在两段：
//   四、专家复核 —— 上一页打进去的那句话逐字出现在这里
//   五、复核分歧 —— 只在人工结论 ≠ AI 建议时才存在
// 因此"采纳"和"驳回"两条支线会产出段数不同的两份报告。如果两次演示的产出一模一样，
// 说明人工介入是装饰，设计就没成立。
//
// 报告内容全部来自 core/report.js（模板 + 插槽），本文件只负责呈现。
(function () {
  "use strict";

  var AppState = window.AppState;
  var ReportModel = window.ReportModel;
  var KB = window.DOMAIN_KB;

  // 归档飞入动画只在"未归档 → 已归档"这一次跳变时播放。用模块级变量记住上一次的
  // 归档状态，而不是让 CSS 动画随每轮 render 重播——那样在归档页上点任何东西都会
  // 让报告卡再飞一次。
  var lastArchived = false;

  // ---------------------------------------------------------------- 报告草稿

  function renderReport() {
    var sections = ReportModel.sections();
    return h("section", { class: "panel ar-report" }, [
      AppState.panelTitle("报告预览", sections.length + " 段"),
      h("div", { class: "ar-report-scroll" }, sections.map(function (section) {
        return h("article", { class: "ar-section" + (section.human ? " human" : "") }, [
          h("div", { class: "ar-section-head" }, [
            h("i", { class: "dot " + section.status, "aria-hidden": "true" }),
            h("strong", { text: section.title })
          ]),
          h("p", { text: section.text }),
          section.human ? h("small", { class: "ar-human-tag", text: "人工填写" }) : null
        ]);
      }))
    ]);
  }

  // ---------------------------------------------------------------- 归档去向

  function renderTarget() {
    var state = AppState.value;
    var outcome = AppState.currentOutcome();
    var category = KB.categories().filter(function (c) {
      return c.id === outcome.archive.categoryId;
    })[0];
    var docCount = KB.documents(category.id).length + (state.archived ? 1 : 0);

    return h("section", { class: "panel ar-target" }, [
      AppState.panelTitle("归档去向", state.archived ? "已归档" : "待确认"),
      h("dl", { class: "ar-meta" }, [
        h("dt", { text: "目标分类" }), h("dd", { text: category.title }),
        h("dt", { text: "案例编号" }), h("dd", { text: ReportModel.caseId() }),
        h("dt", { text: "复核人" }), h("dd", { text: AppState.currentReviewer().name + "（" + AppState.currentReviewer().role + "）" }),
        h("dt", { text: "可复用" }), h("dd", { text: outcome.unlocksReuse ? "是，可被相似记录命中" : "否，仅存档" })
      ]),

      // 飞入动画：报告卡 → 知识库图标，落地后分类计数 +1。这是把报告归档和知识库
      // 真正缝上的那一针，不然两页各说各的，观众感觉不到闭环。
      h("div", { class: "ar-fly-stage" + (shouldPlayFly() ? " playing" : "") }, [
        h("div", { class: "ar-fly-card", "aria-hidden": "true" }, [h("span", { text: "报告" })]),
        h("div", { class: "ar-kb-icon", "aria-hidden": "true" }, [
          h("span", { class: "ar-kb-glyph", text: "📚" }),
          h("span", { class: "ar-kb-count", text: category.title + " " + docCount + " 篇" })
        ])
      ]),

      h("button", {
        type: "button",
        class: "primary-action",
        disabled: state.archived ? "disabled" : null,
        dataset: { action: "archive-report", focusKey: "archive" },
        text: state.archived ? "已归档" : "确认归档"
      }),
      state.archived
        ? h("button", {
          type: "button",
          class: "plain-button ar-goto-kb",
          dataset: { action: "go-knowledge" },
          text: "去知识库查看这篇报告"
        })
        : null
    ]);
  }

  function shouldPlayFly() {
    var now = AppState.value.archived;
    var play = now && !lastArchived;
    lastArchived = now;
    return play;
  }

  // ---------------------------------------------------------------- 二次命中

  function renderReuse() {
    var unlocked = AppState.reuseUnlocked();
    var outcome = AppState.currentOutcome();
    var state = AppState.value;

    var text;
    if (unlocked) {
      text = "已解锁。回到诊断工作台切换到相似记录，AI 判断的依据链里会多出一枚指向本案例的芯片。";
    } else if (state.archived) {
      text = "本轮是" + outcome.label + "，按契约不解锁案例复用（outcomes[].unlocksReuse = false）。";
    } else {
      text = "完成归档后，相似记录才会命中本案例。";
    }

    return h("section", { class: "panel ar-reuse " + (unlocked ? "unlocked" : "locked") }, [
      AppState.panelTitle("二次命中", unlocked ? "已解锁" : "未解锁"),
      h("div", { class: "ar-reuse-body" }, [
        h("span", { class: "ar-reuse-glyph", "aria-hidden": "true", text: unlocked ? "✨" : "🔒" }),
        h("p", { text: text })
      ]),
      unlocked
        ? h("button", {
          type: "button",
          class: "primary-action",
          dataset: { action: "go-workbench" },
          text: "回工作台看命中效果"
        })
        : null
    ]);
  }

  // ---------------------------------------------------------------- 顶层

  function renderArchive() {
    // canOpen 已经在 boot.js 挡过一道，这里再断言一次：归档页的所有内容都依赖
    // currentOutcome() 非空，没有结论就渲染不出来，静默渲染空白比抛错难查得多。
    if (!AppState.currentOutcome()) {
      throw new Error("[archive] 进入归档页时必须已选定结论");
    }

    return AppState.pageShell(
      "报告归档 / 案例沉淀",
      ReportModel.title(),
      h("button", {
        type: "button",
        class: "plain-button",
        dataset: { action: "go-review" },
        text: "返回复核"
      }),
      h("div", { class: "ar-grid" }, [
        renderReport(),
        h("div", { class: "ar-side" }, [
          renderTarget(),
          renderReuse()
        ])
      ])
    );
  }

  window.Scenes = window.Scenes || {};
  window.Scenes.renderArchive = renderArchive;
})();
