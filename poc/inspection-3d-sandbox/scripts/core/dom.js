// 最底层 DOM 构建工具：h()/append() 逐字搬自 poc/pump-demo/scripts/core/dom.js（仅改了本
// 文件顶部与下方函数的说明性注释，h()/append() 本体一字未改）。
//
// legendDot()/renderStationMap() 是个例外：它们构建的三色图例小标签、以及 3D 主视面板的
// 宿主 + .map3d-labels 12 区域热点标签 DOM，会被后续的 scenes/*.js 场景文件复用（按"同层
// 不得互相引用"的纪律，这段代码不能只定义在其中一个场景文件里被另一个引用，必须上提到
// 更早的层）；当前又没有独立的 ui/* 分层承接这类"跨场景复用的 3D 结构生成器"（按分工由
// 后续任务建立），所以暂放在这里。renderStationMap 消费 window.Map3DContract 的
// HOST_ATTR/PIN_ATTR/LABELS_CLASS/AREA_IDS/STATUSES 作为唯一真源，而不是在这里
// 重新硬编码一份宿主标记属性名/标签容器 class 名/热点属性名/区域 id 顺序/状态枚举字符
// 串——这正是契约要收敛的 DOM 命名与 id 空间。它同样消费 window.DemoStation 作为区域数据
// 的唯一真源（areas()/progress()），不在本文件里另编一份区域名称、进度或状态。
//
// 加载顺序要求：Map3DContract（L1）与 DemoStation（数据层）必须先于本文件挂好——不是指
// dom.js 自身求值时就要用到它们（h()/append()/legendDot 的定义本身不依赖它们），而是指
// renderStationMap() 真正被调用时，window.Map3DContract 与 window.DemoStation 必须已经
// 存在，否则会在调用点直接抛出"undefined 没有该方法"这类原生错误，而不是本文件主动兜底。
//
// 事件绑定纪律：本文件只负责渲染 DOM，绝不在这里 addEventListener——点击/键盘等交互统一由
// boot.js 的 bindStage() 做事件委托（读取 data-action / data-map3d-area 等属性去改 state、
// 再调用 render()），本文件产出的按钮/热点只负责"天然带上这些属性"，不负责处理交互本身。
(function () {
  "use strict";

  var SVG_NS = "http://www.w3.org/2000/svg";
  var svgTags = ["svg", "line", "polyline", "circle", "g", "text"];

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
  // 供 station-map-panel 头部的 .map-legend 与其它可能出现三色图例的地方复用，避免同一份
  // "ok/warn/danger 三色说明"在两个文件里各拼一遍、日后改配色只改一处却漏了另一处。
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
      h("span", { text: label }),
    ]);
  }

  // 站场地图版的“宿主 + 12 区域热点标签”骨架，改写自本项目旧版 scripts/dom.js 的
  // renderPumpTrain（泵机组 6 部位版）：泵机组的“部位”换成站场的“区域”，6 个部位换成
  // Map3DContract.AREA_IDS 的 12 个区域，命名空间从 Pump3DContract 换成 Map3DContract。
  //
  // activeAreaId 允许为 null（站场全景态，没有任何 .area-pin 带 .active）；非 null 时必须
  // 是合法 areaId，非法直接抛错，不做兜底纠正。
  //
  // 本函数原先还收一个 mode 参数（sandbox / satellite 双模式）。双模式已拆成两个独立
  // POC，本 POC 只有沙盘一种表达，所以 mode 参数与 MODE_ATTR 一并移除——见
  // scripts/map3d/contract.js 里关于拆分理由的注释。
  function renderStationMap(activeAreaId) {
    var DATA = window.DemoStation;
    var C = window.Map3DContract;

    if (activeAreaId != null && C.AREA_IDS.indexOf(activeAreaId) < 0) {
      throw new Error(
        "[renderStationMap] activeAreaId 非法：" + activeAreaId +
        "，应 ∈ [" + C.AREA_IDS.join(", ") + "] 或 null"
      );
    }

    var areasById = {};
    DATA.areas().forEach(function (area) { areasById[area.id] = area; });
    // 顺序校验：12 个热点必须严格按 AREA_IDS 的顺序渲染（assertIdSet 同时比键集合与顺序）。
    // 防的是数据层 areas() 漂移——少一个区/多一个区/顺序换了，画面上只会表现成“某个区域
    // 热点消失/重叠/错位”，控制台不会报错，这里在构建期就把它炸出来。
    C.assertIdSet("DemoStation.areas()", areasById);

    // “巡检区域提交情况”banner 的计数：某区域算“已提交”，当且仅当该区域的巡检项已全部
    // 填完（done === total）。不写死“12 / 12”这种字面量——分母取 AREA_IDS.length，分子
    // 由 DemoStation.progress() 逐区累加得出，数据变化时这行文案自动跟着变。
    var doneAreaCount = C.AREA_IDS.filter(function (areaId) {
      var progress = DATA.progress(areaId);
      return progress.done === progress.total;
    }).length;

    // 不能用 role="img"：ARIA 下它会把子元素变成 presentational，辅助技术拿不到内部 12 个
    // 区域热点按钮。3D 造型对屏幕阅读器是纯装饰（canvas 由引擎插入并标 aria-hidden），
    // 信息由这些热点按钮承载。
    var hostAttrs = {
      class: "station-map",
      role: "group",
      "aria-label": "站场巡检地图三维视图，含 " + C.AREA_IDS.length + " 个区域热点",
    };
    hostAttrs[C.HOST_ATTR] = "1";

    return h("section", { class: "panel station-map-panel" }, [
      h("div", { class: "station-map-head" }, [
        h("div", {}, [
          h("p", { class: "kicker", text: "站场巡检地图 / 区域态势" }),
          h("h3", { text: "广西支干线永州站 · 12 个巡检区域" }),
        ]),
        h("div", { class: "map-legend" }, [
          legendDot("danger", "异常"),
          legendDot("warn", "关注"),
          legendDot("ok", "正常"),
          h("span", { class: "map-legend-sep" }),
          h("span", { class: "map-legend-item" }, [
            h("i", { class: "map-legend-track", "aria-hidden": "true" }),
            h("span", { text: "巡检轨迹" }),
          ]),
          h("span", { class: "map-legend-item" }, [
            h("i", { class: "map-legend-start", "aria-hidden": "true" }),
            h("span", { text: "起点" }),
          ]),
          h("span", { class: "map-legend-item" }, [
            h("i", { class: "map-legend-end", "aria-hidden": "true" }),
            h("span", { text: "终点" }),
          ]),
          h("span", { class: "map-legend-item" }, [
            h("i", { class: "map-legend-walker", "aria-hidden": "true" }),
            h("span", { text: "巡检人" }),
          ]),
        ]),
      ]),
      // ← 引擎会往这里 appendChild 一个 canvas.map3d-canvas；这里只留位置，不预先塞一个
      // 占位 <canvas>，canvas 由 map3d/engine.js 独占创建与生命周期管理。
      // 底部悬浮操作栏（ui/actionbar.js）不在这里渲染，由 scenes/map.js 追加进本容器——
      // 所以这里不额外套包裹层，保证本容器本身就能直接承载绝对定位的子节点。
      h("div", hostAttrs, [
        h("div", { class: "map-submit-banner" }, [
          h("span", { class: "map-submit-icon", "aria-hidden": "true" }),
          h("strong", { class: "map-submit-text", text: "巡检区域提交情况" }),
          h("span", { class: "map-submit-count", text: doneAreaCount + " / " + C.AREA_IDS.length }),
          h("span", { class: "map-submit-arrow", "aria-hidden": "true", text: "›" }),
        ]),
        h("div", { class: C.LABELS_CLASS }, C.AREA_IDS.map(function (areaId) {
          var area = areasById[areaId];
          if (C.STATUSES.indexOf(area.status) < 0) {
            throw new Error(
              "[renderStationMap] 区域 " + areaId + " 的 status 非法：" + area.status +
              "，应 ∈ [" + C.STATUSES.join(", ") + "]"
            );
          }
          var progress = DATA.progress(areaId);
          var isActive = areaId === activeAreaId;
          var pinAttrs = {
            type: "button",
            class: "area-pin " + area.status + (isActive ? " active" : ""),
            "aria-pressed": isActive ? "true" : "false",
          };
          pinAttrs[C.PIN_ATTR] = areaId;
          return h("button", pinAttrs, [
            h("span", { class: "area-pin-name", text: area.name }),
            h("span", { class: "area-pin-count", text: progress.done + "/" + progress.total }),
          ]);
        })),
        h("div", { class: "map-zoom" }, [
          h("button", {
            type: "button", class: "map-zoom-btn", dataset: { action: "map-zoom-in" },
            "aria-label": "放大", text: "+",
          }),
          h("button", {
            type: "button", class: "map-zoom-btn", dataset: { action: "map-zoom-out" },
            "aria-label": "缩小", text: "−",
          }),
        ]),
      ]),
    ]);
  }

  window.h = h;
  window.append = append;
  window.legendDot = legendDot;
  window.renderStationMap = renderStationMap;
})();
