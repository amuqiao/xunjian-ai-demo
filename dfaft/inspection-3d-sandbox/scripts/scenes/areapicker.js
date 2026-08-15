// 「选择区域」弹层：window.AreaPickerScene（L6 场景层）。
//
// DOM 结构必须照 styles/11-overlay.css 文件头已冻结的类名契约实现，不得另起
// 字面量类名：
//   div.area-picker
//     div.area-picker-search > span.area-picker-search-icon + input.area-picker-search-input
//     div.area-picker-station > span.area-picker-station-name + span.area-picker-station-count
//     ul.area-picker-areas[role=list]
//       li > button.area-picker-row[.active][data-area-id]
//              span.area-picker-row-name + span.area-picker-row-count
//              + span.area-picker-row-check + span.area-picker-row-arrow
//
// 交互点没有 data-action（11-overlay.css 的注释里只点名了 data-area-id 这一个
// 钩子），boot.js 按 pump-demo 对 [data-unit] 的同样处理方式，直接用属性选择器
// [data-area-id] 和 .area-picker-search-input 类名做事件委托，不在这里发明一套
// data-action 名字。
(function () {
  "use strict";

  var DATA = window.DemoData;

  function renderRow(area, progress, isActive) {
    var attrs = { type: "button", class: "area-picker-row" + (isActive ? " active" : "") };
    attrs["data-area-id"] = area.id;
    return h("li", {}, [
      h("button", attrs, [
        h("span", { class: "area-picker-row-name", text: area.icon + " " + area.name }),
        h("span", { class: "area-picker-row-count", text: progress.done + "/" + progress.total }),
        h("span", { class: "area-picker-row-check", "aria-hidden": "true", text: "✓" }),
        h("span", { class: "area-picker-row-arrow", "aria-hidden": "true", text: "›" }),
      ]),
    ]);
  }

  function matches(area, query) {
    if (!query) return true;
    var haystack = (area.name + area.short).toLowerCase();
    return haystack.indexOf(query) >= 0;
  }

  function render(state) {
    if (!DATA) throw new Error("[AreaPickerScene] window.DemoData 未加载");
    var isOpen = state.overlay.kind === "area-picker";
    var query = state.overlay.query.trim().toLowerCase();
    var areas = DATA.areas().filter(function (area) { return matches(area, query); });
    var meta = DATA.meta();

    var rows = areas.length
      ? areas.map(function (area) {
          return renderRow(area, DATA.progress(area.id), area.id === state.focus.areaId);
        })
      : [h("li", { class: "area-picker-row", text: "未找到匹配的区域" })];

    var body = h("div", { class: "area-picker" }, [
      h("div", { class: "area-picker-search" }, [
        h("span", { class: "area-picker-search-icon", "aria-hidden": "true", text: "⌕" }),
        h("input", {
          type: "search",
          class: "area-picker-search-input",
          placeholder: "搜索区域名称",
          value: state.overlay.query,
          "aria-label": "搜索区域名称",
        }),
      ]),
      h("div", { class: "area-picker-station" }, [
        h("span", { class: "area-picker-station-name", text: meta.shortName }),
        h("span", { class: "area-picker-station-count", text: meta.areaTotal + " 个区域 · " + meta.itemTotal + " 项" }),
      ]),
      h("ul", { class: "area-picker-areas", role: "list" }, rows),
    ]);

    return window.Overlay.render({
      title: "选择区域",
      kicker: meta.fullName,
      open: isOpen,
      body: body,
      actions: [],
      panelClass: "area-picker-overlay",
      onCloseAction: "close-overlay",
    });
  }

  window.AreaPickerScene = { render: render };
})();
