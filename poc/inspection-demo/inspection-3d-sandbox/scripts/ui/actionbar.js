// UI 组件层（L5）：地图页底部的悬浮操作栏，复刻真实巡检 App 的按钮（含顺序、
// action 名、角标、警示色），当前保留其中 3 个（见下方 DEFAULT_ACTIONS 的说明）。本组件只渲染，不 addEventListener 改 state：按钮上的
// data-action 由 boot.js 的 bindStage() 事件委托统一处理。
//
// 图标：题面要求“不要外部图片/字体图标，用 Unicode 字符或纯 CSS 形状”——本文件不允许
// 改 styles/*，做不到“纯 CSS 形状”，所以走 Unicode 字符这条路；选的都是符号类字符（非
// emoji pictograph），保证在系统无彩色 emoji 字体时也能以单色字形渲染，交给
// styles/09-actionbar.css 用 color/font-size 去配色。图标 span 标了 aria-hidden，真正的
// 语义由旁边的 .map-action-label 文本承担。
(function () {
  "use strict";

  var TONES = ["warn"];

  var DEFAULT_ICONS = {
    "add-inspector": "＋",
    "toggle-track": "↝",
    "refresh-map": "↻"
  };

  // 真实 App 底部操作栏从左到右是 5 个：添加人员 / 轨迹 / 刷新 / 切换区域 / 问题上报。
  // 2026-08-20 按需求把后两个整套移出演示范围（「切换区域」的弹层
  // scripts/scenes/areapicker.js 与「问题上报」的弹层 scripts/scenes/issuereport.js
  // 都已删除），所以这里只剩前 3 个。
  //
  // 为什么不把它们留成 disabled 占位：这一栏是"逐字复刻真实 App"的地方，留两个点不动
  // 的灰按钮既不像真实 App（真实 App 里它们是能点的），也不像本演示（本演示里它们
  // 压根没有对应功能），两头都不占。要恢复的话按 actionbar → boot.js 的 handleAction
  // → scenes/*.js 三处一起加回来。
  var DEFAULT_ACTIONS = [
    { action: "add-inspector", label: "添加人员" },
    { action: "toggle-track", label: "轨迹", badge: "0" },
    { action: "refresh-map", label: "刷新" }
  ];

  function assertNonEmptyString(value, name) {
    if (typeof value !== "string" || value === "") {
      throw new Error(name + " 必须是非空字符串");
    }
  }

  function assertActions(actions) {
    if (!Array.isArray(actions) || actions.length === 0) {
      throw new Error("ActionBar 的 actions 必须是非空数组");
    }
    actions.forEach(function (item, index) {
      if (!item || typeof item !== "object") {
        throw new Error("ActionBar actions[" + index + "] 不是合法对象，实际 " + item);
      }
      assertNonEmptyString(item.action, "ActionBar actions[" + index + "].action");
      assertNonEmptyString(item.label, "ActionBar actions[" + index + "].label");
      if (item.tone != null && TONES.indexOf(item.tone) < 0) {
        throw new Error(
          "ActionBar actions[" + index + "].tone 非法：" + item.tone + "，应为 " + TONES.join("/")
        );
      }
      if (item.badge != null && typeof item.badge !== "string" && typeof item.badge !== "number") {
        throw new Error("ActionBar actions[" + index + "].badge 必须是字符串或数字");
      }
      if (item.icon != null && typeof item.icon !== "string") {
        throw new Error("ActionBar actions[" + index + "].icon 必须是字符串");
      }
      // 图标不允许静默缺失：内置 5 个 action 有 DEFAULT_ICONS 兜底查表；调用方传入的自定义
      // action 若不在这张表里，必须显式带上 icon 字段，否则在这里直接报错，而不是渲染出
      // 一个空的图标位让人以为“这个按钮本来就没图标”。
      if (item.icon == null && !DEFAULT_ICONS[item.action]) {
        throw new Error(
          "ActionBar actions[" + index + "]（action=" + item.action + "）没有内置图标，必须显式提供 icon 字段"
        );
      }
    });
  }

  function renderAction(item) {
    var icon = item.icon != null ? item.icon : DEFAULT_ICONS[item.action];
    var iconChildren = [h("span", { text: icon, "aria-hidden": "true" })];
    if (item.badge != null) {
      iconChildren.push(h("span", { class: "map-action-badge", text: String(item.badge) }));
    }
    return h("li", {}, [
      h("button", {
        type: "button",
        class: "map-action" + (item.tone === "warn" ? " map-action-warn" : ""),
        dataset: { action: item.action },
      }, [
        h("span", { class: "map-action-icon" }, iconChildren),
        h("span", { class: "map-action-label", text: item.label }),
      ]),
    ]);
  }

  function render(options) {
    options = options || {};
    assertNonEmptyString(options.state, "ActionBar 的 state");
    var actions = options.actions != null ? options.actions : DEFAULT_ACTIONS;
    assertActions(actions);

    return h("div", { class: "map-actionbar" }, [
      h("div", { class: "map-actionbar-status" }, [
        h("span", { class: "map-actionbar-icon", text: "📢", "aria-hidden": "true" }),
        h("strong", { class: "map-actionbar-state", text: options.state }),
      ]),
      h("ul", { class: "map-actionbar-list", role: "list" }, actions.map(renderAction)),
    ]);
  }

  window.ActionBar = {
    render: render
  };
})();
