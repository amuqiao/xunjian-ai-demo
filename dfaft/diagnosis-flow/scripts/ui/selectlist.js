// UI 组件层：可选列表 / 表格。它是"选中态 DOM 与 ARIA"的唯一所有者——`.active` 类、
// aria-pressed / aria-selected、roving tabindex、方向键导航只在这一个文件里出现，
// 别处不许再写选中态逻辑。
//
// 移植自 pump-demo scripts/ui/selectlist.js，去掉了对 Pump3DContract 的依赖
//（STATUSES 改为本地常量），其余机制未改。
//
// 行为边界（写给 boot.js）：点击本身不在这里绑定——items / rows 上带 data-select 和
// data-select-id 两个属性，boot.js 用事件委托读取它们去改 state 再 render()。本文件
// 只处理容器上的 keydown：roving tabindex 焦点移动，以及给 <tr> 这种没有原生键盘激活
// 语义的元素补 Enter/Space → click() 的桥接（否则"Tab 能走到但 Enter 选不中"，
// 键盘可达性名不副实）。
(function () {
  "use strict";

  var STATUSES = ["ok", "warn", "danger"];
  var VARIANTS = ["metric", "row", "tile", "table"];
  var COLUMN_TYPES = ["status-dot", "text", "badge-icon"];
  var ARROW_KEYS = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"];
  var ITEM_SELECTOR = "[data-select-id]";
  var STATUS_TEXT = { ok: "正常", warn: "关注", danger: "异常" };
  var BADGE_ICON = { ok: "✓", warn: "△", danger: "⚠" };

  // 同一 name 在"一轮 render"内只能出现一次。boot.js 必须在每次 render() 最开始调用
  // resetRenderPass() 清空这张表，否则上一轮的记录会跨轮误判成重复。
  var usedNames = {};

  function assertStatus(status, where) {
    if (STATUSES.indexOf(status) < 0) {
      throw new Error(where + " 的 status 非法：" + status + "，应为 " + STATUSES.join("/"));
    }
  }

  function assertNonEmptyString(value, name) {
    if (typeof value !== "string" || value === "") throw new Error(name + " 必须是非空字符串");
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
    if (item.note != null) {
      if (typeof item.note !== "string") throw new Error("SelectList items[].note 必须是字符串");
      children.push(h("small", { class: "sl-item-note", text: item.note }));
    }

    return h("button", {
      type: "button",
      class: "sl-item " + item.status + (active ? " active" : ""),
      "aria-pressed": active ? "true" : "false",
      tabindex: active ? "0" : "-1",
      dataset: { select: name, selectId: item.id, focusKey: name + ":" + item.id }
    }, children);
  }

  function assertColumns(columns) {
    if (!Array.isArray(columns) || columns.length === 0) {
      throw new Error("SelectList 的 variant=table 时必须提供非空的 columns 数组");
    }
    columns.forEach(function (col) {
      assertNonEmptyString(col.key, "SelectList columns[].key");
      // label 允许空串：status-dot 列按契约就是没有表头文字（状态由单元格的 aria-label
      // 表达），不能用 assertNonEmptyString。
      if (typeof col.label !== "string") throw new Error("SelectList columns[].label 必须是字符串");
      if (COLUMN_TYPES.indexOf(col.type) < 0) {
        throw new Error("SelectList columns[].type 非法：" + col.type);
      }
      if (typeof col.width !== "number" || col.width <= 0) {
        throw new Error("SelectList columns[].width 必须是正数");
      }
    });
  }

  // status-dot 列的值完全取自 item.status，忽略 cells 里的同名 key；其余列少一个 key
  // 就直接抛错——静默渲染成空单元格会让"数据没接上"看起来像"这格本来就是空的"。
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
      // 状态不能只靠颜色表达：圆点是视觉强调，真正的状态词挂在 aria-label 上，
      // 色盲用户和读屏器都能拿到"异常 / 关注 / 正常"。
      return h("td", { class: "sl-table-td sl-table-td-dot" }, [
        h("span", { class: "sl-table-dot " + item.status, "aria-label": STATUS_TEXT[item.status] })
      ]);
    }
    if (col.type === "text") {
      return h("td", { class: "sl-table-td", text: item.cells[col.key] });
    }
    return h("td", { class: "sl-table-td sl-table-td-badge" }, [
      h("span", { class: "sl-table-badge-icon " + item.status, "aria-hidden": "true", text: BADGE_ICON[item.status] }),
      h("span", { class: "sl-table-badge-text", text: item.cells[col.key] })
    ]);
  }

  function renderTableRow(name, item, activeId, columns) {
    assertNonEmptyString(item.id, "SelectList items[].id");
    assertStatus(item.status, "SelectList items[]");
    assertRowCells(item.cells, columns, item.id);
    var active = item.id === activeId;
    return h("tr", {
      class: "sl-table-row " + item.status + (active ? " active" : ""),
      "aria-selected": active ? "true" : "false",
      tabindex: active ? "0" : "-1",
      dataset: { select: name, selectId: item.id, focusKey: name + ":" + item.id }
    }, columns.map(function (col) { return renderTableCell(col, item); }));
  }

  function renderTableContainer(options) {
    assertColumns(options.columns);
    // columns[].width 是**相对权重**，不是死的像素值：这里换算成百分比落到 <col> 上。
    // 直接写 px 时表格总宽被钉死在各列之和，容器更窄的时候 table-layout:fixed 会按
    // 声明的 px 布局然后整体溢出、被容器裁掉——实测表现是最右边那列整列消失、
    // 倒数第二列文字被截断，而且不报错、不出现横向滚动条。
    var total = 0;
    options.columns.forEach(function (col) { total += col.width; });
    return h("table", {
      class: "sl sl-table",
      "aria-label": options.ariaLabel,
      dataset: { select: options.name }
    }, [
      h("colgroup", {}, options.columns.map(function (col) {
        return h("col", { style: "width:" + (col.width / total * 100) + "%" });
      })),
      h("thead", { class: "sl-table-head" }, [
        h("tr", {}, options.columns.map(function (col) {
          return h("th", { scope: "col", class: "sl-table-th", text: col.label });
        }))
      ]),
      h("tbody", { class: "sl-table-body" }, options.items.map(function (item) {
        return renderTableRow(options.name, item, options.activeId, options.columns);
      }))
    ]);
  }

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
      throw new Error("SelectList 的 variant 非法：" + options.variant);
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

    if (!options.items.some(function (item) { return item.id === options.activeId; })) {
      throw new Error("SelectList 的 activeId 不在 items 里：" + options.activeId);
    }

    var container = options.variant === "table"
      ? renderTableContainer(options)
      : h("div", {
        class: "sl sl-" + options.variant,
        role: "group",
        "aria-label": options.ariaLabel,
        dataset: { select: options.name }
      }, options.items.map(function (item) {
        return renderItem(options.name, item, options.activeId);
      }));

    bindRovingFocus(container);
    bindRowActivation(container);
    return container;
  }

  window.SelectList = {
    render: render,
    resetRenderPass: function () { usedNames = {}; }
  };
})();
