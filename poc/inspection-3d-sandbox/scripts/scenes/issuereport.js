// 「问题上报」弹层：window.IssueReportScene（L6 场景层）。
//
// 字段与 4 步流程条数据全部来自 window.DemoData.issueDraft(areaId, itemId)
// （字段名照抄 IMS 事件中心真实字段，见 scripts/data/task.js 文件头注释），
// 本文件不再编造或补充任何字段。
//
// DOM 结构必须照 styles/11-overlay.css 文件头已冻结的类名契约实现：
//   div.issue-form
//     ol.issue-form-steps[role=list]
//       li.issue-form-step[.done][.active] > span.issue-form-step-idx + span.issue-form-step-title
//     div.issue-form-grid
//       div.issue-form-field[.wide]? > label.issue-form-label + input.issue-form-control
//
// 13 个字段全部渲染为只读（disabled）输入框：这是一张"预览生成的问题上报单"，
// 字段值由 issueDraft() 现场派生，不是给用户临时改的表单字段（"自动"字段本来就
// 不该在这里被改动，用户能改的字段——比如真正的处置意见——不在当前数据模型
// 涵盖范围内，见 task.js 文件头"已知的口径缺口"）。
(function () {
  "use strict";

  var DATA = window.DemoData;

  var FIELD_DEFS = [
    { key: "eventTitle", label: "事件标题", wide: true },
    { key: "eventCode", label: "事件编码" },
    { key: "eventSource", label: "事件来源" },
    { key: "urgency", label: "紧要程度" },
    { key: "eventLevel", label: "事件等级" },
    { key: "eventLocation", label: "事件位置" },
    { key: "targetType", label: "作业对象类型" },
    { key: "hierarchy", label: "所在层级" },
    { key: "areaCode", label: "区域编码" },
    { key: "stationDepot", label: "所属站库" },
    { key: "enterprise", label: "所属企业" },
    { key: "secondaryUnit", label: "二级单位" },
    { key: "managementUnit", label: "管理单位" },
  ];

  function renderSteps(draft) {
    var activeIndex = draft.flowSteps.indexOf(draft.currentStep);
    if (activeIndex < 0) {
      throw new Error("[IssueReportScene] draft.currentStep（" + draft.currentStep + "）不在 draft.flowSteps 里");
    }
    return h("ol", { class: "issue-form-steps", role: "list" }, draft.flowSteps.map(function (label, index) {
      var cls = "issue-form-step";
      if (index < activeIndex) cls += " done";
      if (index === activeIndex) cls += " active";
      return h("li", { class: cls }, [
        h("span", { class: "issue-form-step-idx", text: String(index + 1) }),
        h("span", { class: "issue-form-step-title", text: label }),
      ]);
    }));
  }

  function renderField(def, draft) {
    return h("div", { class: def.wide ? "issue-form-field wide" : "issue-form-field" }, [
      h("label", { class: "issue-form-label", text: def.label }),
      h("input", { type: "text", class: "issue-form-control", value: draft[def.key], disabled: "disabled", readonly: "readonly" }),
    ]);
  }

  function render(state) {
    if (!DATA) throw new Error("[IssueReportScene] window.DemoData 未加载");
    var isOpen = state.overlay.kind === "issue-report";

    var body;
    if (isOpen) {
      var draft = DATA.issueDraft(state.overlay.areaId, state.overlay.itemId);
      body = h("div", { class: "issue-form" }, [
        renderSteps(draft),
        h("div", { class: "issue-form-grid" }, FIELD_DEFS.map(function (def) { return renderField(def, draft); })),
      ]);
    } else {
      // 关闭态仍要渲染出一棵合法的 .issue-form 结构（Overlay 组件的开合动画
      // 依赖"关闭前那份 DOM 仍然存在"，见 scripts/ui/overlay.js 文件头注释），
      // 但没有 overlay.areaId/itemId 时不能调用 issueDraft()——用一段空提示占位。
      body = h("div", { class: "issue-form" }, [
        h("p", { class: "muted", text: "尚未选择要上报的巡检项。" }),
      ]);
    }

    return window.Overlay.render({
      title: "问题上报",
      kicker: "IMS 事件中心 · 日常巡检",
      open: isOpen,
      body: body,
      actions: isOpen ? [{ action: "submit-issue-report", text: "提交上报单", primary: true }] : [],
      panelClass: "issue-form-overlay",
      wide: true,
      onCloseAction: "close-overlay",
    });
  }

  window.IssueReportScene = { render: render };
})();
