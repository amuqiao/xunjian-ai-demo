// UI 组件层（L5）：详情卡，只负责“内部结构”，不知道自己在哪。用户的诉求是“详情要么
// 在右侧栏、要么独占一屏”——如果组件自带位置语义就得写两个组件；所以位置（右侧栏 /
// 独占一屏 / 表单记录详情）完全交给外层网格，这样 overview 右栏、station 右栏、
// workbench 记录详情、独占屏头部才能共用同一个组件（任务 P1-G）。
//
// activePartLabel 是 3D 契约钩子：契约是——任何承载 3D 的场景，其“当前部位”显示元素
// 必须带 Pump3DContract.ACTIVE_LABEL_ATTR（data-active-part-label），文本内容为该部位
// 的中文名。这里直接用契约常量当属性 key（属性值固定为 "1"，只是“这是那个元素”的
// 存在性标记，真正要给验证脚本读的可见文本走 text:），不在本文件里重新硬编码那个
// 属性名字符串。overview 场景负责在渲染时把当前部位的中文名传进 activePartLabel。
(function () {
  "use strict";

  var C = window.Pump3DContract;
  var STATUSES = C.STATUSES;
  var CONCLUSION_MAX = 80;

  function assertStatus(status, where) {
    if (STATUSES.indexOf(status) < 0) {
      throw new Error(where + " 的 status 非法：" + status + "，应为 " + STATUSES.join("/"));
    }
  }

  function assertNonEmptyString(value, name) {
    if (typeof value !== "string" || value === "") {
      throw new Error(name + " 必须是非空字符串");
    }
  }

  function assertPrimitive(value, name) {
    if (value == null || (typeof value !== "string" && typeof value !== "number")) {
      throw new Error(name + " 必须是字符串或数字");
    }
  }

  function renderBadge(badge) {
    if (!badge || typeof badge !== "object") {
      throw new Error("DetailCard 的 badge 必须提供 { status, text }");
    }
    assertStatus(badge.status, "DetailCard 的 badge");
    assertNonEmptyString(badge.text, "DetailCard 的 badge.text");
    return h("span", { class: "badge " + badge.status, text: badge.text });
  }

  function renderMetrics(metrics) {
    if (!Array.isArray(metrics) || (metrics.length !== 2 && metrics.length !== 3)) {
      throw new Error(
        "DetailCard 的 metrics 必须是 2 或 3 个，实际 " +
        (Array.isArray(metrics) ? metrics.length : typeof metrics)
      );
    }
    return h("div", { class: "detail-metrics" }, metrics.map(function (item) {
      assertNonEmptyString(item.label, "DetailCard metrics[].label");
      assertPrimitive(item.value, "DetailCard metrics[].value");
      if (item.unit != null && typeof item.unit !== "string") {
        throw new Error("DetailCard metrics[].unit 必须是字符串");
      }
      var unit = item.unit || "";
      return h("div", { class: "detail-metric" }, [
        h("small", { text: item.label }),
        h("strong", {}, [
          h("span", { text: String(item.value) }),
          unit ? h("span", { class: "detail-metric-unit", text: unit }) : null,
        ]),
      ]);
    }));
  }

  function renderTags(tags) {
    if (!Array.isArray(tags)) throw new Error("DetailCard 的 tags 必须是数组");
    if (tags.length > 3) throw new Error("DetailCard 的 tags 最多 3 个，实际 " + tags.length);
    if (tags.length === 0) return null;
    return h("div", { class: "detail-tags" }, tags.map(function (tag) {
      if (typeof tag !== "string" || tag === "") {
        throw new Error("DetailCard 的 tags 元素必须是非空字符串");
      }
      return h("span", { class: "tag", text: tag });
    }));
  }

  function renderSections(sections) {
    if (!Array.isArray(sections)) throw new Error("DetailCard 的 sections 必须是数组");
    return h("div", { class: "detail-sections" }, sections.map(function (section) {
      assertNonEmptyString(section.title, "DetailCard sections[].title");
      if (section.node == null) throw new Error("DetailCard sections[].node 不能为空");
      return h("section", { class: "detail-section" }, [
        h("div", { class: "detail-section-title", text: section.title }),
        section.node,
      ]);
    }));
  }

  function renderActions(actions) {
    if (!Array.isArray(actions)) throw new Error("DetailCard 的 actions 必须是数组");
    return h("div", { class: "detail-actions" }, actions.map(function (item) {
      assertNonEmptyString(item.action, "DetailCard actions[].action");
      assertNonEmptyString(item.text, "DetailCard actions[].text");
      return h("button", {
        type: "button",
        class: item.primary ? "primary-action" : "plain-button",
        dataset: { action: item.action },
        text: item.text,
      });
    }));
  }

  function render(options) {
    options = options || {};
    assertNonEmptyString(options.kicker, "DetailCard 的 kicker");
    assertNonEmptyString(options.title, "DetailCard 的 title");
    assertNonEmptyString(options.conclusion, "DetailCard 的 conclusion");
    if (options.conclusion.length > CONCLUSION_MAX) {
      throw new Error(
        "DetailCard 的 conclusion 超过 " + CONCLUSION_MAX + " 字，实际 " + options.conclusion.length
      );
    }

    var headInner = [
      h("p", { class: "kicker", text: options.kicker }),
      h("h3", { class: "detail-title", text: options.title }),
    ];
    if (options.activePartLabel != null) {
      assertNonEmptyString(options.activePartLabel, "DetailCard 的 activePartLabel");
      var labelAttrs = { class: "detail-active-part", text: options.activePartLabel };
      labelAttrs[C.ACTIVE_LABEL_ATTR] = "1";
      headInner.push(h("span", labelAttrs));
    }

    var children = [
      h("div", { class: "detail-head" }, [
        h("div", {}, headInner),
        renderBadge(options.badge),
      ]),
      renderMetrics(options.metrics),
      h("p", { class: "detail-conclusion", text: options.conclusion }),
      renderTags(options.tags),
    ];
    if (options.sections != null) children.push(renderSections(options.sections));
    children.push(renderActions(options.actions));

    return h("article", { class: "card-detail" }, children);
  }

  window.DetailCard = {
    render: render
  };
})();
