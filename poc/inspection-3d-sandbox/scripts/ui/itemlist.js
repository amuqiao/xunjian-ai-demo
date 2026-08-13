// UI 组件层（L5，早于 scenes/*，晚于 core/* 与 data/*）：区域巡检项列表，逐字复刻真实
// 巡检 App 的“区域详情 → 巡检项列表”这一层。只负责渲染，不 addEventListener 改 state
// （唯一例外见下方 bindRovingFocus 的说明）；点击交互（切换开关 / 步进加减 / 选中某一行）
// 全部走 data-action / data-item-id，由 boot.js 的 bindStage() 事件委托统一处理。
//
// 命名空间纪律：.item-row 用 data-item-id，绝不使用 Map3DContract.ITEM_PIN_ATTR
// （data-map3d-item）——那个属性名归 3D 场景里的设备点位独占，见 scripts/map3d/contract.js
// 的 assertPinNamespace 讲的“同名属性被 querySelectorAll 静默收编”那类坑。这里同一条
// 巡检项会在 <li> 本身、以及它内部的开关/步进按钮上重复挂 data-item-id（同一个 id，三个
// 不同的可点入口），这是有意的：它们代表同一条数据的三种不同动作（选中该行 / 切换布尔值 /
// 数值 ±1），不是命名空间冲突。
//
// 显示串唯一真源：任何“读数”文本都必须来自 window.DemoFlow.controlDisplay(item)，不在这里
// 自己拼接格式化字符串。bool 行的可见文本（.item-switch-text）直接使用它。number 行的两个
// 可见节点（.item-value / .item-unit）为什么反而分别取 item.value / item.unit 的原始值、
// 不整串塞进单一节点——是因为 .item-stepper 的布局需要“− 数字 + 单位”四个独立子节点各自
// 定位（步进按钮夹在数字两侧），这是结构性拆分，不是又发明一套格式化规则：只要
// DemoFlow.controlDisplay 对 number 类型也只是“item.value 值 + 单位”的确定性拼接（未对
// 精度做二次加工），两条路径就是同一份数据的等价切法，不会出现“列表 3MPa / 详情 3.0MPa”
// 那种两处各自格式化导致的漂移。为了不让这条假设变成一个没人验证的暗坑，number 行的
// aria-label（给 .item-stepper 用，见下方 renderNumberControl）额外调用了一次
// controlDisplay，把它当作这条巡检项“权威读数”的可访问名——如果 DemoFlow 的实现日后偏离
// “纯拼接”这个前提，这里会先在无障碍标注里体现出不一致，而不是被两个都各自“看起来对”的
// 数字互相掩盖。
//
// aria-valuemin/max 的来源：**逐项从数据层读 item.min / item.max**，本文件不持有任何
// 量程表。这里曾经有过一张按单位给的"保守通用量程"占位表（MPa 0~10 之类），已删除——
// 那种表会让页面显示一个看起来权威、实际是本层编出来的数字，且没有任何机制提示它是编的。
// 现在量程归数据层：tools/area-mapping.py 的 NUMBER_RANGES 逐条给出 min/max/rangeSource，
// build-items.py 在构建期强制每个 number 项都有量程条目（缺了直接抛异常，不给默认值）。
// rangeSource 区分三种可信度："standard:<原文>"（区间来自该项自身的正确状态列）、
// "sibling:<项id>:<原文>"（来自同区另一条巡检项的标准文字，真实交叉依据）、
// "demo-assumed"（xlsx 全表确实无阈值依据）。当前 12 条数值项里 3 条有真实依据、9 条为假定。
// 本文件的责任只有一条：item.min / item.max 缺失或非法就抛错，绝不代为补值。
(function () {
  "use strict";

  var C = window.Map3DContract;
  var STATUSES = C.STATUSES;
  var CONTROL_TYPES = C.CONTROL_TYPES;
  var UNITS = C.UNITS;

  var EMPTY_HINT = "请在左侧或地图上选择一个巡检区域";

  // 方向键导航的可移动焦点集合：只认 .item-row 这一层，不能用更宽的 "[data-item-id]"
  // 选择器——.item-switch / .item-step-minus / .item-step-plus 三个按钮也带
  // data-item-id（同一条巡检项的三种可点入口共享同一个 id，供 boot.js 的事件委托取值），
  // 如果拿 "[data-item-id]" 当 roving 候选集，方向键会在“行 → 行内按钮 → 下一行”之间
  // 跳来跳去，Home/End 也会落在错误的元素上。selectlist.js 里 "[data-select-id]" 能直接
  // 当候选集，是因为那个组件里这个属性只出现在唯一可选中的那层元素上，不像这里一条数据
  // 开了三个可点入口。
  var ROW_SELECTOR = ".item-row";
  var ARROW_KEYS = ["ArrowUp", "ArrowDown", "Home", "End"];

  function assertNonEmptyString(value, name) {
    if (typeof value !== "string" || value === "") {
      throw new Error(name + " 必须是非空字符串");
    }
  }

  function assertStatus(status, where) {
    if (STATUSES.indexOf(status) < 0) {
      throw new Error(where + " 的 status 非法：" + status + "，应为 " + STATUSES.join("/"));
    }
  }

  function assertPositiveInt(value, name) {
    if (typeof value !== "number" || value <= 0 || Math.floor(value) !== value) {
      throw new Error(name + " 必须是正整数，实际 " + value);
    }
  }

  // 逐项量程校验。数据层（tools/area-mapping.py 的 NUMBER_RANGES）负责给出 min/max，
  // 本层只校验、不补值：缺失或非法一律抛错，让缺口在页面渲染时立刻暴露，而不是悄悄
  // 显示一个本层编出来的区间。
  function itemRange(item, where) {
    if (typeof item.min !== "number" || typeof item.max !== "number") {
      throw new Error(
        where + " 是 number 型但缺少量程：min=" + item.min + " max=" + item.max +
        "。量程由数据层提供（见 tools/area-mapping.py 的 NUMBER_RANGES），本层不代为补值"
      );
    }
    if (item.min >= item.max) {
      throw new Error(where + " 的量程非法：min(" + item.min + ") 必须小于 max(" + item.max + ")");
    }
    return { min: item.min, max: item.max };
  }

  function renderBoolControl(item) {
    if (typeof item.value !== "boolean") {
      throw new Error(
        "ItemList items[] " + item.id + " 的 inputType=bool 时 value 必须是布尔值，实际 " +
        typeof item.value + "(" + item.value + ")"
      );
    }
    var display = window.DemoFlow.controlDisplay(item);
    var switchAttrs = {
      type: "button",
      class: "item-switch",
      role: "switch",
      "aria-checked": item.value ? "true" : "false",
      "aria-label": item.point + "：" + display,
      dataset: { action: "item-toggle", itemId: item.id },
    };
    return h("div", { class: "item-control" }, [
      h("span", { class: "item-switch-text", text: display }),
      h("button", switchAttrs, [
        h("span", { class: "item-switch-track" }, [
          h("span", { class: "item-switch-knob" }),
        ]),
      ]),
    ]);
  }

  function renderNumberControl(item) {
    if (typeof item.value !== "number") {
      throw new Error(
        "ItemList items[] " + item.id + " 的 inputType=number 时 value 必须是数字，实际 " +
        typeof item.value + "(" + item.value + ")"
      );
    }
    assertNonEmptyString(item.unit, "ItemList items[] " + item.id + " 的 unit（inputType=number 时必填）");
    if (UNITS.indexOf(item.unit) < 0) {
      throw new Error(
        "ItemList items[] " + item.id + " 的 unit 非法：" + item.unit + "，应为 " + UNITS.join("/")
      );
    }
    var range = itemRange(item, "ItemList items[] " + item.id);
    var display = window.DemoFlow.controlDisplay(item);
    var stepperAttrs = {
      class: "item-stepper",
      role: "spinbutton",
      "aria-valuenow": item.value,
      "aria-valuemin": range.min,
      "aria-valuemax": range.max,
      "aria-label": item.point + "：" + display,
    };
    return h("div", { class: "item-control" }, [
      h("div", stepperAttrs, [
        h("button", {
          type: "button",
          class: "item-step item-step-minus",
          "aria-label": "减小",
          dataset: { action: "item-dec", itemId: item.id },
          text: "−",
        }),
        h("span", { class: "item-value", text: String(item.value) }),
        h("button", {
          type: "button",
          class: "item-step item-step-plus",
          "aria-label": "增大",
          dataset: { action: "item-inc", itemId: item.id },
          text: "+",
        }),
        h("span", { class: "item-unit", text: item.unit }),
      ]),
    ]);
  }

  function renderControl(item) {
    if (item.inputType === "bool") return renderBoolControl(item);
    if (item.inputType === "number") return renderNumberControl(item);
    throw new Error(
      "ItemList items[] " + item.id + " 的 inputType 非法：" + item.inputType +
      "，应为 " + CONTROL_TYPES.join("/")
    );
  }

  function renderRow(item, index, activeItemId, isFirstRow) {
    if (!item || typeof item !== "object") {
      throw new Error("ItemList items[" + index + "] 不是合法对象，实际 " + item);
    }
    assertNonEmptyString(item.id, "ItemList items[" + index + "].id");
    assertPositiveInt(item.seq, "ItemList items[] " + item.id + " 的 seq");
    assertNonEmptyString(item.point, "ItemList items[] " + item.id + " 的 point");
    assertNonEmptyString(item.title, "ItemList items[] " + item.id + " 的 title");
    assertNonEmptyString(item.standard, "ItemList items[] " + item.id + " 的 standard");
    assertStatus(item.status, "ItemList items[] " + item.id);
    if (item.tag != null && (typeof item.tag !== "string" || item.tag === "")) {
      throw new Error("ItemList items[] " + item.id + " 的 tag 必须是非空字符串或 null");
    }

    var active = item.id === activeItemId;

    var titleChildren = [
      h("span", { class: "item-seq", text: item.seq + "." }),
      h("span", { class: "item-name", text: item.title }),
    ];
    if (item.tag != null) titleChildren.push(h("span", { class: "item-tag", text: item.tag }));

    var rowAttrs = {
      class: "item-row " + item.status + (active ? " active" : ""),
      tabindex: (active || (activeItemId == null && isFirstRow)) ? "0" : "-1",
      dataset: { itemId: item.id },
    };

    return h("li", rowAttrs, [
      h("span", { class: "item-dot", "aria-hidden": "true" }),
      h("div", { class: "item-main" }, [
        h("p", { class: "item-title" }, titleChildren),
        h("p", { class: "item-standard", text: item.standard }),
      ]),
      renderControl(item),
    ]);
  }

  // 容器 keydown → roving tabindex 焦点移动，做法与 selectlist.js 的
  // bindRovingFocus 一致：只移动焦点、不改选中态（不碰 .active / aria-checked），
  // “真正选中”仍然交给点击（事件委托）或原生 <button> 的 Enter/Space 激活语义。
  function bindRovingFocus(container) {
    container.addEventListener("keydown", function (event) {
      if (ARROW_KEYS.indexOf(event.key) < 0) return;
      var rows = Array.prototype.slice.call(container.querySelectorAll(ROW_SELECTOR));
      var current = rows.indexOf(event.target);
      if (current < 0) return;
      var next = current;
      if (event.key === "ArrowDown") next = Math.min(current + 1, rows.length - 1);
      if (event.key === "ArrowUp") next = Math.max(current - 1, 0);
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = rows.length - 1;
      if (next === current) return;
      event.preventDefault();
      rows[current].setAttribute("tabindex", "-1");
      rows[next].setAttribute("tabindex", "0");
      rows[next].focus();
    });
  }

  function render(options) {
    options = options || {};
    assertNonEmptyString(options.ariaLabel, "ItemList 的 ariaLabel");
    if (!Array.isArray(options.items)) {
      throw new Error("ItemList 的 items 必须是数组，实际 " + typeof options.items);
    }
    if (options.activeItemId != null) {
      assertNonEmptyString(options.activeItemId, "ItemList 的 activeItemId");
    }

    var containerAttrs = { class: "item-list", role: "list", "aria-label": options.ariaLabel };

    if (options.items.length === 0) {
      if (options.activeItemId != null) {
        throw new Error(
          "ItemList 的 activeItemId 不在 items 里（items 为空）：" + options.activeItemId
        );
      }
      return h("ul", containerAttrs, [
        h("li", { class: "item-empty", text: EMPTY_HINT }),
      ]);
    }

    if (options.activeItemId != null) {
      var hasActive = options.items.some(function (item) {
        return item && item.id === options.activeItemId;
      });
      if (!hasActive) {
        throw new Error("ItemList 的 activeItemId 不在 items 里：" + options.activeItemId);
      }
    }

    var container = h("ul", containerAttrs, options.items.map(function (item, index) {
      return renderRow(item, index, options.activeItemId, index === 0);
    }));

    bindRovingFocus(container);
    return container;
  }

  window.ItemList = {
    render: render
  };
})();
