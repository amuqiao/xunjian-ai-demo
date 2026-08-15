// 场景：报告归档 / 案例复用（DemoData.scenes() 中 key === "archive"）。
//
// 任务 P3-E（阶段三 G2）：精简归档场景，只保留三件事——
//   ① 报告预览（六段式，改用 Cards.evidence 承载：每段一句结论 + <=3 标签，
//      替换原来逐段展示的长文字块 report-section）；
//   ② 归档动作（页头单个 primary 按钮，state.archived 的判断/文案原样保留）；
//   ③ 二次命中解锁卡（归档后 P-2 可引用 P-1 案例，是整条闭环的收尾包袱）。
// 原来右侧的"归档状态"卡片（case-card + tag-cloud）和"已归档案例上下文"
// （archive-case-context：label/summary/来源 4 条/事实 4 条）不在这三件之内，
// 本任务整体去掉——它们承载的信息在这三件里都能找到落点：archived 状态本身由
// 归档按钮 disabled + 文案体现；案例编号/复用上下文由二次命中解锁卡承载
// （DATA.reuse().matchedCase / DATA.caseKnowledge().secondPass）。
//
// state.expertVerdict / treatmentDone / observationDone / archived 这些闭环标志位
// 的语义，以及三条结论路径（确认不对中 -> 维修归档；继续观察 / 排除误报 -> 非维修
// 归档，不触发二次命中）各自的分支判断和文案，本任务原样保留，只改呈现形式——
// nonMaintenanceArchiveTitle() / reportEntries()（原 archiveSections()）/
// renderReuseCard() / reuseText() 这几个函数里原有的分支逻辑不改，只是把
// "标题 + 一段长文字"的返回形状换成 Cards.evidence 需要的
// { title/conclusion, tags, status }。
(function () {
  "use strict";

  var DATA = window.DemoData;
  var AppState = window.AppState;
  var state = window.AppState.value;

  // maintenance 由数据层的 isMaintenance 派生，不再比较中文串 `=== "确认不对中"`。
  // 业务把这条结论改叫别的说法时，只改 catalog.js 的 verdicts[].label 即可，
  // 这里不需要跟着改；而以前那种字面量比较漏改一处就恒为 false，页面会静默走成
  // 非维修分支（归档成观察记录、P-2 永远不解锁），不报错、很难查。
  function renderArchive() {
    var maintenance = DATA.isMaintenanceVerdict(state.expertVerdict);
    return AppState.pageShell(
      maintenance ? "报告归档 / 案例复用" : "结论归档 / 模型反馈",
      maintenance ? DATA.report().title : nonMaintenanceArchiveTitle(),
      h("button", { type: "button", class: "primary-action", disabled: state.archived, dataset: { action: "archive-report" }, text: state.archived ? "已归档" : "确认归档" }),
      h("div", { class: "archive-stack" }, [
        renderReportPreview(),
        renderReuseCard(),
      ])
    );
  }

  // 归档标题取数据层的 archiveTitle 字段（每条结论各自带一个），不再靠三元表达式
  // 在两个写死的标题之间二选一——那种写法在增加第四条结论时会静默落到 else 分支。
  function nonMaintenanceArchiveTitle() {
    var current = DATA.verdictByLabel(state.expertVerdict);
    if (!current) throw new Error("归档场景要求已选定专家结论，当前为空");
    return current.archiveTitle;
  }

  // ---------- ① 报告预览：段落全部来自数据层 ----------
  //
  // 三条路径的报告段落此前写死在本文件的 reportEntries() 里（维修路径读
  // report().sections，另两条各有一组三段式字面量），而且 status 是一个按位置对齐的
  // ["warn","warn","warn","ok","ok","warn"] 数组——业务增删一段报告，颜色就整体
  // 错位且不报错。现在段落和它的 status 一起放在数据层（catalog.js 的 report.sections
  // 与 verdicts[].reportSections），本文件只负责渲染。段落数量随数据变化，不写死。

  function renderReportPreview() {
    // 副标题用实际段落数，不写死 "six sections"——业务增删段落时那个词就不对了，
    // 而且不会有任何报错。
    var sections = DATA.reportSectionsFor(state.expertVerdict);
    return h("section", { class: "panel report-panel" }, [
      AppState.panelTitle("报告预览", sections.length + " 段"),
      h("div", { class: "report-grid" }, sections.map(function (entry) {
        return window.Cards.evidence({
          status: entry.status,
          conclusion: entry.text,
          tags: [entry.title],
        });
      })),
    ]);
  }

  // ---------- ② 归档动作：单个 primary 按钮，承载于 renderArchive() 顶部的 pageShell
  // action 位——state.archived 的判断和"已归档 / 确认归档"文案原样保留，未挪动、未改写。

  // ---------- ③ 二次命中解锁卡：归档后 P-2 可引用 P-1 案例，闭环收尾 ----------

  function renderReuseCard() {
    var canReuse = state.archived && DATA.isMaintenanceVerdict(state.expertVerdict);
    var buttonText = canReuse ? "查看 P-2 命中建议" : state.archived ? "查看归档记录问答" : "查看当前 Agent 解释";
    var dialogId = canReuse ? "archive-case-agent" : state.archived ? "archive-record-agent" : "workbench-agent";
    return h("section", { class: "panel reuse-panel " + (canReuse ? "unlocked" : "locked") }, [
      AppState.panelTitle("二次 Agent 命中预览", canReuse ? "P-2 reused" : "locked"),
      h("div", { class: "reuse-grid" }, [
        h("div", {}, [
          h("h3", { text: canReuse ? "二次 Agent 命中 · " + DATA.reuse().title : DATA.reuse().title }),
          h("p", { text: reuseText(canReuse) }),
          h("button", {
            type: "button",
            class: "plain-button",
            dataset: { action: "open-agent-dialog", agentDialogId: dialogId },
            text: buttonText,
          }),
        ]),
        h("div", { class: "reuse-tags" }, DATA.reuse().reasons.map(function (reason) { return h("span", { text: reason }); })),
        h("div", { class: "case-id", text: canReuse ? DATA.reuse().matchedCase : "未解锁" }),
      ]),
    ]);
  }

  function reuseText(canReuse) {
    if (canReuse) return DATA.caseKnowledge().secondPass.summary;
    if (state.archived && AppState.isNonMaintenanceVerdict(state.expertVerdict)) return "本轮为非维修闭环，仅归档观察/误报记录，不触发 P-2 维修案例命中。";
    return "完成 P-1 维修处置案例归档后，P-2 相似异常命中才会解锁。";
  }

  window.Scenes = window.Scenes || {};
  window.Scenes.renderArchive = renderArchive;
})();
