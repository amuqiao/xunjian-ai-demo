// 最底层 DOM 构建工具：h()/append() 逐字搬自 poc/pump-demo/scripts/core/dom.js（仅改了
// 本文件顶部与下方函数的说明性注释，h()/append() 本体一字未改）。
//
// renderMapHost() 是本 POC 的"3D 宿主骨架生成器"：3D 宿主 + .map3d-labels 内 12 个
// [data-map3d-area] 热点 + 图例 + 指北针 + 比例尺 + 缩放/轨迹按钮。它消费
// window.Map3DContract 的 HOST_ATTR/PIN_ATTR/LABELS_CLASS/AREA_IDS/STATUSES 作为唯一
// 真源，而不是在这里重新硬编码一份宿主标记属性名/标签容器 class 名/热点属性名/
// 区域 id 顺序/状态枚举字符串；同样消费 window.DemoStation 作为区域数据的唯一真源
// （areas()/progress()），不在本文件里另编一份区域名称/进度/状态。
//
// 区域信息面板（列表 + 详情卡）不在本文件——按任务分工放在 scripts/app.js，本文件只
// 负责地图本体的骨架。
//
// 事件绑定纪律：本文件只负责渲染 DOM，绝不在这里 addEventListener 处理交互状态变更
// （pointerenter/pointerleave 的热点悬停发光是 map3d/engine.js 自己在 buildLabelMap
// 里绑的，属于引擎内部实现细节，不算"业务交互"）——点击/键盘等业务交互统一由
// scripts/app.js 做事件委托（读取 data-action / data-map3d-area / data-select-id 等
// 属性去改状态、再调用相应的 Map3D API），本文件产出的按钮/热点只负责"天然带上
// 这些属性"，不负责处理交互本身。
//
// ⚠️ .map-scale-bar / .map-scale-value 这两个 class 名是与 scripts/map3d/engine.js
// 的"契约"——engine.js 每帧用它们找到比例尺 DOM 并现算宽度，改这两个 class 名
// 必须两处同步改，否则比例尺会静默失效（querySelector 返回 null，engine.js 里
// 找不到就会直接抛错，不会静默吞掉——这是本项目一贯的 fail-fast 纪律）。
(function () {
  "use strict";

  var SVG_NS = "http://www.w3.org/2000/svg";
  var svgTags = ["svg", "line", "polyline", "circle", "g", "text", "polygon", "path"];

  function h(tag, attrs, children) {
    var isSvg = svgTags.indexOf(tag) >= 0;
    var node = isSvg ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (key) {
      var value = attrs[key];
      if (key === "class") {
        if (isSvg) node.setAttribute("class", value);
        else node.className = value;
      }
      else if (key === "text") node.textContent = value;
      else if (key === "html") node.innerHTML = value;
      else if (key === "dataset") {
        Object.keys(value).forEach(function (name) { node.dataset[name] = value[name]; });
      } else if (value !== false && value != null) {
        node.setAttribute(key, value === true ? "" : value);
      }
    });
    append(node, children);
    return node;
  }

  function append(node, children) {
    if (children == null) return;
    (Array.isArray(children) ? children : [children]).forEach(function (child) {
      if (child == null) return;
      if (Array.isArray(child)) {
        append(node, child);
        return;
      }
      node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
    });
  }

  // 三色状态图例的最小单元：span.map-legend-item > i.dot.<status> + span(label)。
  function legendDot(status, label) {
    var C = window.Map3DContract;
    if (C.STATUSES.indexOf(status) < 0) {
      throw new Error("[legendDot] status 非法：" + status + "，应 ∈ [" + C.STATUSES.join(", ") + "]");
    }
    if (typeof label !== "string" || label === "") {
      throw new Error("[legendDot] label 必须是非空字符串，实际为 " + JSON.stringify(label));
    }
    return h("span", { class: "map-legend-item" }, [
      h("i", { class: "dot " + status, "aria-hidden": "true" }),
      h("span", { text: label })
    ]);
  }

  // 12 个区域热点标签：两行紧凑排布（区域简称 + 已提交/总数），问题数 > 0 时叠一个
  // 右上角红色角标。activeAreaId 允许为 null（全景态，没有任何标签带 .active）。
  function renderAreaPin(C, area, progress, isActive) {
    var pinAttrs = {
      type: "button",
      class: "area-pin " + area.status + (isActive ? " active" : ""),
      "aria-pressed": isActive ? "true" : "false",
      "aria-label": area.name + "（" + area.status + "，已提交 " + progress.done + "/" + progress.total + "）"
    };
    pinAttrs[C.PIN_ATTR] = area.id;
    var children = [
      h("span", { class: "area-pin-name", text: area.short }),
      h("span", { class: "area-pin-count", text: progress.done + "/" + progress.total })
    ];
    if (area.issueCount > 0) {
      children.push(h("span", { class: "area-pin-issue", "aria-hidden": "true", text: String(area.issueCount) }));
    }
    return h("button", pinAttrs, children);
  }

  // 指北针：纯 CSS 三角形箭头 + "N" 字样，见文件头「北向指示的简化」说明——静态绘制，
  // 不随镜头方位角实时重算（方位角本身也被引擎钳制在初始值附近很小范围内）。
  function renderCompass() {
    return h("div", { class: "map-compass", "aria-hidden": "true" }, [
      h("span", { class: "map-compass-arrow" }),
      h("span", { class: "map-compass-label", text: "N" })
    ]);
  }

  // 比例尺：条形宽度由 engine.js 每帧现算（把两个相距 100 世界单位的地面参考点投影到
  // 屏幕，量它们的像素距离），不是写死的像素数——随镜头缩放/俯仰联动。数值单位诚实标
  // 注为"世界单位"，不换算成米：data/track.js 明确说过"尚无真实米制换算表"（见该文件
  // 头部注释），本页面不应该在没有换算依据的情况下自己编一个"米"出来。
  function renderScaleBar() {
    return h("div", { class: "map-scale", "aria-hidden": "true" }, [
      h("span", { class: "map-scale-bar" }),
      h("span", { class: "map-scale-value", text: "100 世界单位" })
    ]);
  }

  // 站场俯视地图的"宿主 + 12 区域热点标签 + 图例 + 指北针 + 比例尺 + 控制按钮"骨架。
  // activeAreaId 非 null 时必须是合法 areaId，非法直接抛错，不做兜底纠正。
  function renderMapHost(activeAreaId) {
    var DATA = window.DemoStation;
    var C = window.Map3DContract;

    if (activeAreaId != null && C.AREA_IDS.indexOf(activeAreaId) < 0) {
      throw new Error(
        "[renderMapHost] activeAreaId 非法：" + activeAreaId + "，应 ∈ [" + C.AREA_IDS.join(", ") + "] 或 null"
      );
    }

    var areasById = {};
    DATA.areas().forEach(function (area) { areasById[area.id] = area; });
    // 顺序校验：12 个热点必须严格按 AREA_IDS 的顺序渲染（assertIdSet 同时比键集合与顺序）。
    C.assertIdSet("DemoStation.areas()", areasById);

    var doneAreaCount = C.AREA_IDS.filter(function (areaId) {
      var progress = DATA.progress(areaId);
      return progress.done === progress.total;
    }).length;

    // 不能用 role="img"：ARIA 下它会把子元素变成 presentational，辅助技术拿不到内部
    // 12 个区域热点按钮。3D 造型对屏幕阅读器是纯装饰（canvas 由引擎插入并标 aria-hidden），
    // 信息由这些热点按钮承载。
    var hostAttrs = {
      class: "station-map",
      role: "group",
      "aria-label": "站场俯视巡检地图三维视图，含 " + C.AREA_IDS.length + " 个区域热点"
    };
    hostAttrs[C.HOST_ATTR] = "1";

    return h("section", { class: "panel map-panel" }, [
      h("div", { class: "map-panel-head" }, [
        h("div", {}, [
          h("p", { class: "kicker", text: "俯视巡检地图 / 区域态势" }),
          h("h3", { text: "广西支干线永州站 · 12 个巡检区域" })
        ]),
        h("div", { class: "map-legend" }, [
          legendDot("danger", "异常"),
          legendDot("warn", "关注"),
          legendDot("ok", "正常"),
          h("span", { class: "map-legend-sep" }),
          h("span", { class: "map-legend-item" }, [
            h("i", { class: "map-legend-track", "aria-hidden": "true" }),
            h("span", { text: "巡检轨迹" })
          ]),
          h("span", { class: "map-legend-item" }, [
            h("i", { class: "map-legend-start", "aria-hidden": "true" }),
            h("span", { text: "起点" })
          ]),
          h("span", { class: "map-legend-item" }, [
            h("i", { class: "map-legend-end", "aria-hidden": "true" }),
            h("span", { text: "终点" })
          ]),
          h("span", { class: "map-legend-item" }, [
            h("i", { class: "map-legend-walker", "aria-hidden": "true" }),
            h("span", { text: "巡检人" })
          ])
        ])
      ]),
      // ← 引擎会往这里 appendChild 一个 canvas.map3d-canvas；这里只留位置。
      h("div", hostAttrs, [
        h("div", { class: "map-submit-banner" }, [
          h("span", { class: "map-submit-icon", "aria-hidden": "true" }),
          h("strong", { class: "map-submit-text", text: "巡检区域提交情况" }),
          h("span", { class: "map-submit-count", text: doneAreaCount + " / " + C.AREA_IDS.length })
        ]),
        h("div", { class: C.LABELS_CLASS }, C.AREA_IDS.map(function (areaId) {
          var area = areasById[areaId];
          if (C.STATUSES.indexOf(area.status) < 0) {
            throw new Error(
              "[renderMapHost] 区域 " + areaId + " 的 status 非法：" + area.status +
              "，应 ∈ [" + C.STATUSES.join(", ") + "]"
            );
          }
          var progress = DATA.progress(areaId);
          return renderAreaPin(C, area, progress, areaId === activeAreaId);
        })),
        renderCompass(),
        renderScaleBar(),
        h("div", { class: "map-controls" }, [
          h("button", {
            type: "button", class: "map-track-btn active",
            dataset: { action: "map-track-toggle" },
            "aria-pressed": "true", text: "巡检轨迹"
          }),
          h("div", { class: "map-zoom" }, [
            h("button", {
              type: "button", class: "map-zoom-btn", dataset: { action: "map-zoom-in" },
              "aria-label": "放大", text: "+"
            }),
            h("button", {
              type: "button", class: "map-zoom-btn", dataset: { action: "map-zoom-out" },
              "aria-label": "缩小", text: "−"
            })
          ])
        ])
      ])
    ]);
  }

  window.h = h;
  window.append = append;
  window.legendDot = legendDot;
  window.renderMapHost = renderMapHost;
})();
