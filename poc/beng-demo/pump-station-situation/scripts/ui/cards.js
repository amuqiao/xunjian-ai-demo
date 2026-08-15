// UI 组件层（L5，早于 scenes/*，晚于 core/*）：四类卡片工厂。四类之外没有工厂——
// 想加第五类文字面板必须先在这里加一个新的工厂函数，这一步一定会在 review 里被看到，
// 这就是治“字太多、设计不好看、感觉很乱”的机械约束（任务 P1-G）。
//
// 图表容器插入约定（写给场景层）：Cards.metric 的 sparkId / Cards.chart 的 chartId
// 只会在卡片里渲染出一个空的 [data-chart-slot="<id>"] 占位容器，本文件不创建、也不
// 依赖 Charts.* 的具体实现（否则会让这一层直接绑死某一种图表初始化方式）。场景层在
// render() 把卡片挂到 DOM 之后，自己找到这个占位容器再塞入 Charts.slot(id)：
//   var slot = stage.querySelector('[data-chart-slot="' + id + '"]');
//   slot.appendChild(Charts.slot(id));
//
// 命名空间纪律：本文件绝不使用 Pump3DContract.PIN_ATTR 对应的那个属性名（3D 热点标签
// 独占，见 scripts/pump3d/contract.js 的 assertPinNamespace）。
(function () {
  "use strict";

  var STATUSES = window.Pump3DContract.STATUSES;

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

  function chartSlot(className, id) {
    return h("div", { class: className, dataset: { chartSlot: id } });
  }

  // Cards.metric：大数字 + 状态色，卡片分级里视觉权重最高的一类，一屏只应该出现少数几个。
  function metric(options) {
    options = options || {};
    assertNonEmptyString(options.label, "Cards.metric 的 label");
    assertPrimitive(options.value, "Cards.metric 的 value");
    assertStatus(options.status, "Cards.metric");
    if (options.unit != null && typeof options.unit !== "string") {
      throw new Error("Cards.metric 的 unit 必须是字符串");
    }
    var unit = options.unit || "";
    if (options.note != null && typeof options.note !== "string") {
      throw new Error("Cards.metric 的 note 必须是字符串");
    }

    var children = [
      h("div", { class: "card-metric-head" }, [
        h("span", { class: "card-metric-label", text: options.label }),
        h("span", { class: "dot " + options.status, "aria-hidden": "true" }),
      ]),
      h("div", { class: "card-metric-value" }, [
        h("strong", { text: String(options.value) }),
        unit ? h("span", { class: "card-metric-unit", text: unit }) : null,
      ]),
    ];
    if (options.note) children.push(h("small", { class: "card-metric-note", text: options.note }));
    if (options.sparkId != null) {
      assertNonEmptyString(options.sparkId, "Cards.metric 的 sparkId");
      children.push(chartSlot("card-metric-spark", options.sparkId));
    }
    return h("article", { class: "card-metric " + options.status }, children);
  }

  // Cards.chart：只有标题 + 图，卡片分级里最“安静”的容器类，不掺任何结论性文字。
  function chart(options) {
    options = options || {};
    assertNonEmptyString(options.title, "Cards.chart 的 title");
    assertNonEmptyString(options.chartId, "Cards.chart 的 chartId");
    if (options.meta != null && typeof options.meta !== "string") {
      throw new Error("Cards.chart 的 meta 必须是字符串");
    }
    if (options.tall != null && typeof options.tall !== "boolean") {
      throw new Error("Cards.chart 的 tall 必须是布尔值");
    }

    var head = [h("span", { class: "card-chart-title", text: options.title })];
    if (options.meta) head.push(h("small", { class: "card-chart-meta", text: options.meta }));

    return h("section", { class: "card-chart" + (options.tall ? " tall" : "") }, [
      h("div", { class: "card-chart-head" }, head),
      chartSlot("card-chart-body", options.chartId),
    ]);
  }

  // Cards.evidence：一句结论 + 最多 3 个标签，卡片分级里权重最低的一类，专治“证据堆砌”。
  function evidence(options) {
    options = options || {};
    assertStatus(options.status, "Cards.evidence");
    assertNonEmptyString(options.conclusion, "Cards.evidence 的 conclusion");
    if (!Array.isArray(options.tags)) throw new Error("Cards.evidence 的 tags 必须是数组");
    if (options.tags.length > 3) {
      throw new Error("Cards.evidence 的 tags 最多 3 个，实际 " + options.tags.length);
    }

    var children = [h("p", { class: "card-evidence-conclusion", text: options.conclusion })];
    if (options.tags.length > 0) {
      children.push(h("div", { class: "card-evidence-tags" }, options.tags.map(function (tag) {
        if (typeof tag !== "string" || tag === "") {
          throw new Error("Cards.evidence 的 tags 元素必须是非空字符串");
        }
        return h("span", { class: "tag", text: tag });
      })));
    }
    return h("article", { class: "card-evidence " + options.status }, children);
  }

  window.Cards = {
    metric: metric,
    chart: chart,
    evidence: evidence
  };
})();
