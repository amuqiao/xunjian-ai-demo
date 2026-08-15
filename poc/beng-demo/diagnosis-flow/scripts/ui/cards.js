// UI 组件层：指标卡 / 结论卡。
//
// Cards.metric 的 sparkId 只渲染出一个空的 [data-chart-slot] 占位容器，**不自己创建
// 图表**——场景层拿到卡片之后自己 querySelector 找到这个占位容器，再塞入
// Charts.slot(id)。这条契约是刻意的：图表实例要跨渲染持久存活，而卡片每轮都重建，
// 两者的生命周期不同，不能由卡片持有图表。
(function () {
  "use strict";

  var STATUSES = ["ok", "warn", "danger"];

  function assertStatus(status, where) {
    if (STATUSES.indexOf(status) < 0) {
      throw new Error(where + " 的 status 非法：" + status + "，应为 " + STATUSES.join("/"));
    }
  }

  function metric(options) {
    options = options || {};
    if (typeof options.label !== "string" || options.label === "") {
      throw new Error("Cards.metric 的 label 必须是非空字符串");
    }
    if (options.value == null) throw new Error("Cards.metric 的 value 不能为空");
    assertStatus(options.status, "Cards.metric");

    return h("article", { class: "card card-metric " + options.status }, [
      h("p", { class: "card-metric-label", text: options.label }),
      h("strong", { class: "card-metric-value" }, [
        h("span", { text: String(options.value) }),
        options.unit ? h("span", { class: "card-metric-unit", text: options.unit }) : null
      ]),
      options.sparkId ? h("div", { class: "card-metric-spark", dataset: { chartSlot: options.sparkId } }) : null,
      options.note ? h("small", { class: "card-metric-note", text: options.note }) : null
    ]);
  }

  // 结论卡：一句结论 + 最多 3 个标签。超过 3 个直接抛错而不是截断——截断会让"标签
  // 没显示全"看起来像"本来就只有这几个"。
  function evidence(options) {
    options = options || {};
    assertStatus(options.status, "Cards.evidence");
    if (typeof options.conclusion !== "string" || options.conclusion === "") {
      throw new Error("Cards.evidence 的 conclusion 必须是非空字符串");
    }
    var tags = options.tags || [];
    if (!Array.isArray(tags)) throw new Error("Cards.evidence 的 tags 必须是数组");
    if (tags.length > 3) throw new Error("Cards.evidence 的 tags 最多 3 个，实际 " + tags.length);

    return h("article", { class: "card card-evidence " + options.status }, [
      h("div", { class: "card-evidence-head" }, [
        h("i", { class: "dot " + options.status, "aria-hidden": "true" }),
        h("strong", { text: options.conclusion })
      ]),
      tags.length ? h("div", { class: "card-evidence-tags" }, tags.map(function (tag) {
        return h("span", { text: tag });
      })) : null
    ]);
  }

  window.Cards = { metric: metric, evidence: evidence };
})();
