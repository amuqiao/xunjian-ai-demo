// UI 组件层（L5）：可选列表/卡片组，是“选中态 DOM/ARIA”的唯一所有者——.active 类、
// aria-pressed/aria-selected、roving tabindex、方向键导航只在这一个文件里出现，别处不许
// 再写选中态逻辑（任务 P1-G）。三个页面原本各写一套“点状态卡/点表单记录/点分类”的选择器，
// 现在收敛成同一套 variant（metric/row/tile 只决定 CSS 类，不决定行为）。table 变体是第四个：
// 把同一套“单选列表”渲染成多列表格（诊断工作台巡检记录），复用选中态/键盘可达这整套机制，
// 不新开一个平行组件。
//
// 命名空间纪律：选择器统一用 data-select + data-select-id，绝不使用 Pump3DContract.PIN_ATTR
// 对应的那个属性名（3D 热点标签独占，见 scripts/pump3d/contract.js 的 assertPinNamespace）。
//
// 行为边界（写给 boot.js）：点击本身不在这里绑定监听——items/rows 上天然带
// data-select/data-select-id 这两个属性，点击只会让它们出现在事件目标上，由 boot.js
// 的 bindStage() 统一用事件委托读取这两个属性去改 state、再调用 render()；本文件只处理
// 容器上的 keydown：一是做 roving tabindex 焦点移动，二是给“不是原生 <button> 的可选中
// 元素”（目前只有 table 变体的 <tr>）补 Enter/Space→click() 的桥接（浏览器不会给 <tr> 这
// 类元素原生的键盘激活语义，metric/row/tile 用 <button> 渲染，Enter/Space 已经是原生行为，
// 这里的桥接对它们是空操作）。这两处 keydown 处理都绝不直接改 data-select-id、不改
// aria-pressed/aria-selected（那两个只在下一轮 render() 因为 state 变了才会变）。
(function () {
  "use strict";

  var STATUSES = window.Pump3DContract.STATUSES;
  var VARIANTS = ["metric", "row", "tile", "table"];
  var COLUMN_TYPES = ["status-dot", "text", "badge-icon"];
  var ARROW_KEYS = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"];
  // 焦点/激活相关的 keydown 处理统一按“带 data-select-id 的元素”识别可选中节点，
  // 不绑定某个 variant 专属的样式类——这样 table 变体的 <tr> 不需要借用按钮那套
  // 视觉类（.sl-item 的 border/padding/display:grid 是给 <button> 设计的，套到 <tr>
  // 上会破坏表格布局），行为和样式彻底解耦。
  var ITEM_SELECTOR = "[data-select-id]";
  var STATUS_TEXT = { ok: "正常", warn: "关注", danger: "异常" };
  var BADGE_ICON = { ok: "✓", warn: "△", danger: "⚠" };

  // 同一 name 在“一轮 render”内只能出现一次。boot.js 必须在每次 render() 最开始调用
  // SelectList.resetRenderPass() 清空这张表，否则上一轮渲染的记录会跨轮误判成重复。
  var usedNames = {};

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

  function renderItem(name, item, activeId) {
    assertNonEmptyString(item.id, "SelectList items[].id");
    assertNonEmptyString(item.label, "SelectList items[].label");
    assertStatus(item.status, "SelectList items[]");
    var active = item.id === activeId;

    var children = [h("span", { class: "sl-item-label", text: item.label })];
    if (item.badge != null) {
      if (typeof item.badge !== "string") throw new Error("SelectList items[].badge 必须是字符串");
      children.push(h("span", { class: "sl-item-badge", text: item.badge }));
    }
    if (item.value != null) {
      if (typeof item.value !== "string" && typeof item.value !== "number") {
        throw new Error("SelectList items[].value 必须是字符串或数字");
      }
      if (item.unit != null && typeof item.unit !== "string") {
        throw new Error("SelectList items[].unit 必须是字符串");
      }
      var unit = item.unit || "";
      children.push(h("strong", { class: "sl-item-value" }, [
        h("span", { text: String(item.value) }),
        unit ? h("span", { class: "sl-item-unit", text: unit }) : null,
      ]));
    }
    if (item.note != null) {
      if (typeof item.note !== "string") throw new Error("SelectList items[].note 必须是字符串");
      children.push(h("small", { class: "sl-item-note", text: item.note }));
    }
    if (item.sparkId != null) {
      assertNonEmptyString(item.sparkId, "SelectList items[].sparkId");
      children.push(h("div", { class: "sl-item-spark", dataset: { chartSlot: item.sparkId } }));
    }

    return h("button", {
      type: "button",
      class: "sl-item " + item.status + (active ? " active" : ""),
      "aria-pressed": active ? "true" : "false",
      tabindex: active ? "0" : "-1",
      dataset: { select: name, selectId: item.id },
    }, children);
  }

  // ---------------------------------------------------------------------------------
  // table 变体：columns 描述表头/列宽/单元格渲染方式，items[].cells 按 column.key 取值。
  // ---------------------------------------------------------------------------------

  function assertColumns(columns) {
    if (!Array.isArray(columns) || columns.length === 0) {
      throw new Error("SelectList 的 variant=table 时必须提供非空的 columns 数组");
    }
    columns.forEach(function (col) {
      assertNonEmptyString(col.key, "SelectList columns[].key");
      // label 允许空字符串：status-dot 列按契约就是没有表头文字（状态已经在单元格里
      // 用 aria-label 表达），不能用 assertNonEmptyString。
      if (typeof col.label !== "string") {
        throw new Error("SelectList columns[].label 必须是字符串");
      }
      if (COLUMN_TYPES.indexOf(col.type) < 0) {
        throw new Error("SelectList columns[].type 非法：" + col.type + "，应为 " + COLUMN_TYPES.join("/"));
      }
      if (typeof col.width !== "number" || col.width <= 0) {
        throw new Error("SelectList columns[].width 必须是正数");
      }
    });
  }

  // status-dot 列的值完全取自 item.status，忽略 cells 里同名 key（契约明确规定这一列
  // “忽略 cells 里的值”），所以这里跳过它、只校验 text/badge-icon 两类真的会读 cells 的列。
  // 少一个 key 就直接抛错——静默渲染成空单元格会让“数据没接上”看起来像“这格本来就是空的”。
  function assertRowCells(cells, columns, itemId) {
    if (cells == null || typeof cells !== "object") {
      throw new Error("SelectList table 行 " + itemId + " 缺少 cells 对象");
    }
    columns.forEach(function (col) {
      if (col.type === "status-dot") return;
      if (!(col.key in cells) || cells[col.key] == null) {
        throw new Error("SelectList table 行 " + itemId + " 的 cells 缺少列 " + col.key);
      }
      if (typeof cells[col.key] !== "string") {
        throw new Error("SelectList table 行 " + itemId + " 的 cells[" + col.key + "] 必须是字符串");
      }
    });
  }

  function renderTableCell(col, item) {
    if (col.type === "status-dot") {
      // 状态不能只靠颜色表达：圆点本身只是视觉强调，真正的状态文本挂在 aria-label 上，
      // 色盲用户和读屏器都能拿到“异常/关注/正常”这三个词，不是只有一个纯色块。
      return h("td", { class: "sl-table-td sl-table-td-dot" }, [
        h("span", { class: "sl-table-dot " + item.status, "aria-label": STATUS_TEXT[item.status] }),
      ]);
    }
    if (col.type === "text") {
      return h("td", { class: "sl-table-td", text: item.cells[col.key] });
    }
    // badge-icon：图标是装饰性补充（aria-hidden），旁边的文字本身已经把结论说清楚了。
    return h("td", { class: "sl-table-td sl-table-td-badge" }, [
      h("span", { class: "sl-table-badge-icon " + item.status, "aria-hidden": "true", text: BADGE_ICON[item.status] }),
      h("span", { class: "sl-table-badge-text", text: item.cells[col.key] }),
    ]);
  }

  function renderTableRow(name, item, activeId, columns) {
    assertNonEmptyString(item.id, "SelectList items[].id");
    assertStatus(item.status, "SelectList items[]");
    assertRowCells(item.cells, columns, item.id);
    var active = item.id === activeId;
    var cells = columns.map(function (col) { return renderTableCell(col, item); });

    return h("tr", {
      class: "sl-table-row " + item.status + (active ? " active" : ""),
      // 行不是 <button>，选中态用 aria-selected 而不是 aria-pressed（行语义是 row，不是
      // 按钮）；tabindex 的 roving 规则和 metric/row/tile 完全一样，只是挂在 <tr> 上。
      "aria-selected": active ? "true" : "false",
      tabindex: active ? "0" : "-1",
      dataset: { select: name, selectId: item.id },
    }, cells);
  }

  function renderTableContainer(options) {
    assertColumns(options.columns);
    // columns[].width 是**相对权重**，不是死的像素值：这里换算成占总宽的百分比再落到
    // <col> 上。原来直接写 "width: Npx" 时，表格总宽被钉死在各列声明宽度之和（当前
    // 6 列合计 568px），容器比它窄的时候（诊断工作台在 1280 下左列只有 440px、扣掉
    // 内边距剩 416px）表格不会跟着缩——table-layout:fixed 下浏览器按声明的 px 布局
    // 然后整体溢出，被容器的 overflow 裁掉，实测表现是最右边那一列**整列消失**、
    // 倒数第二列文字被截成"未见异…"，而且不报错、不出现横向滚动条。
    // 用百分比之后表格恒等于容器宽度，各列按声明宽度的比例分配，窄屏下一起等比收窄。
    // 同时保住了"列定义在数据层、业务改列不用改代码"这条：换列只要改
    // data/records.js 的 recordColumns()，不需要动这里，也不需要动任何 CSS。
    var totalWidth = 0;
    options.columns.forEach(function (col) {
      totalWidth += col.width;
    });
    var colNodes = options.columns.map(function (col) {
      return h("col", { style: "width:" + (col.width / totalWidth * 100) + "%" });
    });
    var headCells = options.columns.map(function (col) {
      return h("th", { scope: "col", class: "sl-table-th", text: col.label });
    });
    var bodyRows = options.items.map(function (item) {
      return renderTableRow(options.name, item, options.activeId, options.columns);
    });

    // 真正的表格语义（table/thead/tbody/th[scope=col]），不用一堆 div 假装表格。
    return h("table", {
      class: "sl sl-table",
      "aria-label": options.ariaLabel,
      dataset: { select: options.name },
    }, [
      h("colgroup", {}, colNodes),
      h("thead", { class: "sl-table-head" }, [h("tr", {}, headCells)]),
      h("tbody", { class: "sl-table-body" }, bodyRows),
    ]);
  }

  // 容器 keydown → roving tabindex 焦点移动。方向键在两端截断（不绕回），Home/End
  // 跳首尾；Enter/Space 的“真正选中”交给浏览器对 <button> 的原生激活语义 + 事件委托，
  // 这里绝不直接触发选中或改 DOM 上的 data-select-id。
  function bindRovingFocus(container) {
    container.addEventListener("keydown", function (event) {
      if (ARROW_KEYS.indexOf(event.key) < 0) return;
      var items = Array.prototype.slice.call(container.querySelectorAll(ITEM_SELECTOR));
      var current = items.indexOf(event.target);
      if (current < 0) return;
      var next = current;
      if (event.key === "ArrowDown" || event.key === "ArrowRight") next = Math.min(current + 1, items.length - 1);
      if (event.key === "ArrowUp" || event.key === "ArrowLeft") next = Math.max(current - 1, 0);
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = items.length - 1;
      if (next === current) return;
      event.preventDefault();
      items[current].setAttribute("tabindex", "-1");
      items[next].setAttribute("tabindex", "0");
      items[next].focus();
    });
  }

  // <button> 已经有原生的 Enter/Space→click 激活语义，浏览器自己处理，这里什么都不用做。
  // <tr> 没有这个原生语义，table 变体的行必须在这里手动把 Enter/Space 桥接成 click()，
  // 否则“Tab 能走到但 Enter/Space 选不中”——键盘可达性名不副实。
  function bindRowActivation(container) {
    container.addEventListener("keydown", function (event) {
      if (event.key !== "Enter" && event.key !== " ") return;
      var target = event.target;
      if (!target || !target.tagName) return;
      if (target.tagName.toLowerCase() === "button") return;
      if (!target.dataset || target.dataset.selectId == null) return;
      event.preventDefault();
      target.click();
    });
  }

  function render(options) {
    options = options || {};
    assertNonEmptyString(options.name, "SelectList 的 name");
    if (VARIANTS.indexOf(options.variant) < 0) {
      throw new Error("SelectList 的 variant 非法：" + options.variant + "，应为 " + VARIANTS.join("/"));
    }
    assertNonEmptyString(options.activeId, "SelectList 的 activeId");
    assertNonEmptyString(options.ariaLabel, "SelectList 的 ariaLabel");
    if (!Array.isArray(options.items) || options.items.length === 0) {
      throw new Error("SelectList 的 items 不能为空");
    }
    if (usedNames[options.name]) {
      throw new Error("SelectList 的 name 在同一轮 render 内重复：" + options.name);
    }
    usedNames[options.name] = true;

    var hasActive = options.items.some(function (item) { return item.id === options.activeId; });
    if (!hasActive) {
      throw new Error("SelectList 的 activeId 不在 items 里：" + options.activeId);
    }

    var container;
    if (options.variant === "table") {
      container = renderTableContainer(options);
    } else {
      container = h("div", {
        class: "sl sl-" + options.variant,
        role: "group",
        "aria-label": options.ariaLabel,
        dataset: { select: options.name },
      }, options.items.map(function (item) {
        return renderItem(options.name, item, options.activeId);
      }));
    }

    bindRovingFocus(container);
    bindRowActivation(container);
    return container;
  }

  window.SelectList = {
    render: render,
    resetRenderPass: function () { usedNames = {}; }
  };
})();
