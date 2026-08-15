// 3D 隔离契约：零依赖，必须作为第一个 <script> 加载（早于 vendor/three、Pump3DModel、
// Pump3D 引擎，也早于数据层和场景层）。这里定义的部位 id 顺序是全仓库唯一真源，以下四处
// 必须与 PART_IDS 完全一致（含顺序）：
//   scripts/data/catalog.js 的 parts
//   scripts/pump3d/model.js 的 partMeshes 键与 anchors 键
//   scripts/pump3d/engine.js 的热点创建顺序（HOTSPOT 渲染 / setStatuses / syncLabels）
(function () {
  "use strict";

  var PART_IDS = ["pump-body", "seal", "front-bearing", "coupling", "motor", "base"];
  var STATUSES = ["ok", "warn", "danger"];
  var PRESETS = ["dashboard", "station"];
  var HOST_ATTR = "data-pump3d-host";
  var LABELS_CLASS = "pump3d-labels";
  var PIN_ATTR = "data-part";
  var ACTIVE_LABEL_ATTR = "data-active-part-label";

  function arraysEqual(a, b) {
    var i;
    if (a.length !== b.length) return false;
    for (i = 0; i < a.length; i += 1) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  // 键集合与顺序都比：任一不符抛错并打印差集，方便定位到底是"少了""多了"还是"顺序错了"。
  function assertIdSet(label, obj) {
    var keys = Object.keys(obj);
    if (arraysEqual(keys, PART_IDS)) return;
    var missing = PART_IDS.filter(function (id) { return keys.indexOf(id) < 0; });
    var extra = keys.filter(function (id) { return PART_IDS.indexOf(id) < 0; });
    throw new Error(
      "[Pump3DContract] " + label + " 与 PART_IDS 不一致：" +
      "缺少 [" + missing.join(", ") + "]，多余 [" + extra.join(", ") + "]；" +
      "实际顺序 [" + keys.join(", ") + "]，应为 [" + PART_IDS.join(", ") + "]"
    );
  }

  // boot.js 首次 render 前调用，失败直接抛。此时全局存在性已由 boot.js 自己的断言先行保证，
  // 这里不重复检查 window.DemoData 是否存在。
  function assertData() {
    if (!window.THREE) throw new Error("[Pump3DContract] window.THREE 未加载，请检查 vendor/three.min.js");
    if (!window.Pump3DModel) throw new Error("[Pump3DContract] window.Pump3DModel 未加载，请检查 scripts/pump3d/model.js");
    if (!window.Pump3D) throw new Error("[Pump3DContract] window.Pump3D 未加载，请检查 scripts/pump3d/engine.js");

    var parts = window.DemoData.parts();
    var partsIndex = {};
    parts.forEach(function (part) { partsIndex[part.id] = true; });
    assertIdSet("scripts/data/catalog.js 的 parts", partsIndex);

    parts.forEach(function (part) {
      if (STATUSES.indexOf(part.status) < 0) {
        throw new Error("[Pump3DContract] 部位 " + part.id + " 的 status 非法：" + part.status);
      }
    });

  }

  // DOM 命名空间纪律：data-part 归 3D 热点独占，其余任何地方（含 overview 状态卡）都
  // 不得使用 data-part。一旦被复用，engine.js 的 buildLabelMap 会把非 3D 元素也收进
  // labelEls（同名后者覆盖前者），syncLabels 就会给它写 translate3d，
  // 3D 标签同时消失且不报错——这是本项目最容易踩且最难排查的暗坑。
  //
  // 必须在**每次 render 之后**调用，不能放进 assertData()：assertData 跑在首次 render 之前，
  // 那时 DOM 里还没有任何 [data-part]，无论渲染对不对都会通过，检查形同虚设。
  function assertPinNamespace() {
    Array.prototype.forEach.call(document.querySelectorAll("[" + PIN_ATTR + "]"), function (el) {
      if (!el.closest("." + LABELS_CLASS)) {
        throw new Error(
          "[Pump3DContract] 发现 [" + PIN_ATTR + "] 元素落在 ." + LABELS_CLASS + " 之外（" +
          (el.className || el.tagName) + "）：" +
          "3D 热点标签独占 " + PIN_ATTR + "，其余场景选择器请改用 data-select/data-select-id"
        );
      }
    });
  }

  // 搬进 Pump3D.mount 内调用（insert canvas 之后），这样 app.js/boot.js 被重写也带不走它。
  function assertDom(host, options) {
    var hosts = document.querySelectorAll("[" + HOST_ATTR + "]");
    if (hosts.length !== 1) {
      throw new Error("[Pump3DContract] 页面中 [" + HOST_ATTR + "] 元素应恰好 1 个，实际 " + hosts.length + " 个");
    }

    var labelsRoot = host.querySelector("." + LABELS_CLASS);
    if (!labelsRoot) {
      throw new Error("[Pump3DContract] 宿主内缺少 ." + LABELS_CLASS + " 容器");
    }
    var pins = labelsRoot.querySelectorAll("[" + PIN_ATTR + "]");
    if (pins.length !== PART_IDS.length) {
      throw new Error(
        "[Pump3DContract] ." + LABELS_CLASS + " 内的 [" + PIN_ATTR + "] 数量为 " + pins.length +
        "，应为 " + PART_IDS.length
      );
    }
    var pinIds = {};
    Array.prototype.forEach.call(pins, function (pin) { pinIds[pin.getAttribute(PIN_ATTR)] = true; });
    assertIdSet("." + LABELS_CLASS + " 内的 [" + PIN_ATTR + "] id 集合", pinIds);

    if (!options || !options.statuses) {
      throw new Error("[Pump3DContract] Pump3D.mount 缺少 options.statuses");
    }
    assertIdSet("options.statuses", options.statuses);

    // 宿主盒非零：insert canvas 之后立刻读，任一为 0 就抛错。合法的 0×0 不存在——mount 是
    // append 之后同步调用的，读 clientWidth 会强制回流，且 stage 是整体替换、没有
    // display:none 场景；CSS 网格给 3D 面板算出 0 高度时，这里第一次渲染就必须炸出来，
    // 而不是像 resize()/RAF 循环那样静默 return。
    if (host.clientWidth === 0 || host.clientHeight === 0) {
      throw new Error(
        "[Pump3DContract] 3D 宿主盒尺寸为 0（clientWidth=" + host.clientWidth +
        ", clientHeight=" + host.clientHeight + "），host.className=" + host.className
      );
    }
  }

  window.Pump3DContract = {
    PART_IDS: PART_IDS,
    STATUSES: STATUSES,
    PRESETS: PRESETS,
    HOST_ATTR: HOST_ATTR,
    LABELS_CLASS: LABELS_CLASS,
    PIN_ATTR: PIN_ATTR,
    ACTIVE_LABEL_ATTR: ACTIVE_LABEL_ATTR,
    assertIdSet: assertIdSet,
    assertData: assertData,
    assertPinNamespace: assertPinNamespace,
    assertDom: assertDom
  };
})();
