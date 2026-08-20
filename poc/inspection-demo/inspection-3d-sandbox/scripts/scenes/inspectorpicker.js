// 「添加人员」弹层：window.InspectorPickerScene（L6 场景层）。
//
// 候选名单来自 window.DemoData.inspectorCandidates()（唯一真源，见 scripts/data/task.js
// 头部注释——姓名池只从本项目已有的两处真实姓名字段现场收集去重，本文件不编造任何
// 姓名）。已经在当前任务巡检人字段里的姓名渲染成禁用行（disabled + "已在列"徽标），
// 不可再点：点一个可选行会直接把该姓名追加进当前任务、并关闭弹层，
// 不为"添加人员"发明一套"先选中、再点确认"的两步流程。
//
// DOM 结构必须照 styles/11-overlay.css 文件头已冻结的类名契约实现，不得另起字面量
// 类名：
//   div.inspector-picker
//     p.inspector-picker-hint
//     ul.inspector-picker-list[role=list]
//       li > button.inspector-picker-row[.disabled][data-inspector-name]
//              span.inspector-picker-row-name
//              + span.inspector-picker-row-badge（仅禁用行）
//              | span.inspector-picker-row-arrow（仅可选行，"›"）
//
// 交互点没有 data-action：boot.js 直接用属性选择器 [data-inspector-name] 做事件委托，
// 不在这里发明一套 data-action 名字。
//
// 2026-08-20：这是页面上唯一剩下的弹层。同期删除的 scenes/areapicker.js（切换区域）
// 与 scenes/issuereport.js（问题上报）曾与本文件共用 styles/11-overlay.css 的外壳
// 类名契约，那两份样式已从该文件移除。
(function () {
  "use strict";

  var DATA = window.DemoData;

  function renderRow(candidate) {
    var attrs = {
      type: "button",
      class: "inspector-picker-row" + (candidate.alreadyAssigned ? " disabled" : ""),
    };
    if (candidate.alreadyAssigned) {
      attrs.disabled = "disabled";
    } else {
      attrs["data-inspector-name"] = candidate.name;
    }
    var trailing = candidate.alreadyAssigned
      ? h("span", { class: "inspector-picker-row-badge", text: "已在列" })
      : h("span", { class: "inspector-picker-row-arrow", "aria-hidden": "true", text: "›" });
    return h("li", {}, [
      h("button", attrs, [
        h("span", { class: "inspector-picker-row-name", text: candidate.name }),
        trailing,
      ]),
    ]);
  }

  function render(state) {
    if (!DATA) throw new Error("[InspectorPickerScene] window.DemoData 未加载");
    var isOpen = state.overlay.kind === "inspector-picker";
    var candidates = DATA.inspectorCandidates();

    var body = h("div", { class: "inspector-picker" }, [
      h("p", { class: "inspector-picker-hint", text: "点选一位巡检人加入本次任务" }),
      h("ul", { class: "inspector-picker-list", role: "list" }, candidates.map(renderRow)),
    ]);

    return window.Overlay.render({
      title: "添加人员",
      kicker: DATA.task().formName,
      open: isOpen,
      body: body,
      actions: [],
      panelClass: "inspector-picker-overlay",
      onCloseAction: "close-overlay",
    });
  }

  window.InspectorPickerScene = { render: render };
})();
