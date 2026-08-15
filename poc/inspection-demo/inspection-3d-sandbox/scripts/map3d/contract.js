// 3D 巡检地图隔离契约（L1）：零依赖，必须作为本页面第一个业务 <script> 加载——早于
// 数据层 scripts/data/*.js、早于 scripts/map3d/model-*.js 与 engine.js、早于 core/、ui/、
// scenes/ 和 boot.js。
// 这里定义的 12 个区域 id 顺序、区域项数、DOM 命名常量是全仓库唯一真源，以下几处
// 必须与 AREA_IDS / AREA_ITEM_COUNTS 完全一致（含顺序）：
//   scripts/data/station.js 的区域数据键集合与顺序，items-*.js 的每区项数
//   scripts/map3d/model-sandbox.js 的区域网格键
//   scripts/map3d/engine.js 的热点创建顺序（setActiveArea / setStatuses / syncLabels）
//   DOM 内 .map3d-labels 容器下 12 个 [data-map3d-area] 热点
//
// 分工边界：本文件只管「12 区键集合 + 每区项数 + DOM 命名」这三件事。单条巡检项的
// 字段级校验（inputType / unit / value / status / seq 连续性等）归 scripts/data/schema.js，
// 它复用本文件的 AREA_IDS 与 AREA_ITEM_COUNTS 做真源，不另起一套 12 区列表。
(function () {
  "use strict";

  // ---- id 空间：12 个区域，顺序即真源 ----
  var AREA_IDS = [
    "gate", "filter", "metering", "regulate", "vent", "blowdown",
    "cabinet", "power", "control", "genset", "ups", "launcher"
  ];

  // 每个区域的真实巡检项数，来自现场资料清单。本项目数据骨架的全部价值就在
  // 「真实项数」——这份表本身也是真源，改一个区的项数只改这里，其余处一律派生。
  var AREA_ITEM_COUNTS = {
    gate: 49, filter: 17, metering: 19, regulate: 19, vent: 7, blowdown: 8,
    cabinet: 67, power: 18, control: 19, genset: 7, ups: 12, launcher: 14
  };

  // 派生值：对 AREA_ITEM_COUNTS 求和，绝不手写字面量 256——改一个区的项数必须自动传导，
  // 而不是要求人记得同步改这里。
  var TOTAL_ITEMS = 0;
  Object.keys(AREA_ITEM_COUNTS).forEach(function (areaId) {
    TOTAL_ITEMS += AREA_ITEM_COUNTS[areaId];
  });

  // 本 POC 只有一种视觉表达：程序化三维沙盘。原先设计过「沙盘 / 卫星」双模式可切换，
  // 已于 2026-08-13 拆分为两个互不耦合的独立 POC（俯视/卫星那一版在 poc/inspection-3d-aerial）。
  // 拆分的收益：引擎回到「终生单例、单模型、无 dispose」——也就是 pump-demo 已验证过的
  // 形态，contextCreated === 1 这条断言原样成立。双模式的 setMode 会要求一条真正的
  // dispose 路径（区域热点每个 4 几何 + 4 材质、完全不共享，12 区每模式 96 个 GPU 对象，
  // 不释放就每切一次漏 96 个），那是本代码库刻意不提供、且把「不提供」写进设计论证的东西。
  // 所以这里没有 MODES / MODE_ATTR / assertModeSwitch，不要"为了将来扩展"把它们加回来。
  var STATUSES = ["ok", "warn", "danger"];
  var CONTROL_TYPES = ["bool", "number"];
  // 真实资料里数值型巡检项只出现这三种单位，其余单位视为数据录入错误。
  var UNITS = ["MPa", "℃", "V"];

  // ---- DOM 常量 ----
  var HOST_ATTR = "data-map3d-host";
  // ⚠️ 命名空间炸弹：属性名之所以是 data-map3d-area 而不是更直白的 data-area，
  // 正是因为 poc/prototype-v3/index.html 的 inline SVG 地图已经占用了 data-area
  // 这个属性名。未来两个页面若合并、或本页面被拼进同一份 DOM，data-area 会被
  // querySelectorAll 一起收进标签集合，且不会有任何报错——具体机制见 assertPinNamespace
  // 的注释。取 data-map3d-area 这个更长的前缀就是为了从命名上直接避开这次静默相撞。
  var PIN_ATTR = "data-map3d-area";
  var ITEM_PIN_ATTR = "data-map3d-item";
  var ACTIVE_LABEL_ATTR = "data-active-area-label";
  var LABELS_CLASS = "map3d-labels";
  var CANVAS_CLASS = "map3d-canvas";

  function arraysEqual(a, b) {
    var i;
    if (a.length !== b.length) return false;
    for (i = 0; i < a.length; i += 1) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  // 键集合与顺序都比：任一不符抛错并打印两个差集，方便定位到底是「少了」「多了」还是
  // 「顺序错了」。
  //
  // 防的是什么：本项目至少有四处各自独立维护一份「12 区」的键集合——数据层、
  // model.js 的 mesh 键、engine.js 的遍历顺序、DOM 里的 12 个热点 pin。这四处只要有
  // 任意一处漂移（少写一个区、多写一个区、或者顺序换了），画面表现只是「某个区域
  // 颜色不对」或者「某个热点点不动」——控制台不会报任何错，因为 JS 层面每一处
  // 单独看都是合法的对象/数组。assertIdSet 就是把这四处摆到同一把尺子上量。
  function assertIdSet(label, obj) {
    var keys = Object.keys(obj);
    if (arraysEqual(keys, AREA_IDS)) return;
    var missing = AREA_IDS.filter(function (id) { return keys.indexOf(id) < 0; });
    var extra = keys.filter(function (id) { return AREA_IDS.indexOf(id) < 0; });
    throw new Error(
      "[Map3DContract] " + label + " 与 AREA_IDS 不一致：" +
      "缺少 [" + missing.join(", ") + "]，多余 [" + extra.join(", ") + "]；" +
      "实际顺序 [" + keys.join(", ") + "]，应为 [" + AREA_IDS.join(", ") + "]"
    );
  }

  // 防的是什么：本项目数据骨架的全部价值就在「真实项数」。data.areaItems(areaId) 少写
  // 两条巡检项完全不会让 JS 报错——区域徽标该显示 49/49 却渲染成 47/49，这种偏差在
  // 现场演示时没人会盯着一个个数，只会在被甲方拿真实清单核对时才炸出来。这里把
  // 「每区项数」与「12 区项数之和」两条都钉在构建期，而不是等人工核对。
  function assertItemCounts(data) {
    if (!data || typeof data.areaItems !== "function") {
      throw new Error(
        "[Map3DContract] assertItemCounts 需要 data.areaItems(areaId) 方法，" +
        "实际 data.areaItems 为 " + (data ? typeof data.areaItems : "undefined（data 本身未传入）")
      );
    }
    var total = 0;
    AREA_IDS.forEach(function (areaId) {
      var items = data.areaItems(areaId);
      if (!Array.isArray(items)) {
        throw new Error(
          "[Map3DContract] data.areaItems(\"" + areaId + "\") 未返回数组，实际为 " + typeof items
        );
      }
      var expected = AREA_ITEM_COUNTS[areaId];
      if (items.length !== expected) {
        throw new Error(
          "[Map3DContract] 区域 " + areaId + " 的巡检项数为 " + items.length +
          "，应为 " + expected
        );
      }
      total += items.length;
    });
    if (total !== TOTAL_ITEMS) {
      throw new Error(
        "[Map3DContract] 12 区实际项数之和为 " + total + "，应为 TOTAL_ITEMS=" + TOTAL_ITEMS
      );
    }
  }

  // 数据层入口断言：boot/app 在首次 render 前调用一次。本契约对数据层唯一明确的具体
  // 要求就是上面这条「12 区项数」，因此直接复用 assertItemCounts；不在契约层预先
  // 猜测尚未定案的逐项字段名（比如某条巡检项的 status/type/unit 到底叫什么字段），
  // 避免契约先于数据层的真实实现拍板、日后互相打架。数据层自己若要补充逐项字段
  // 校验，应在 data 模块内部完成，并仍然通过 assertIdSet / assertItemCounts 复用本文件
  // 的真源，而不是另起一套 12 区键集合。
  function assertData(data) {
    if (!data) {
      throw new Error("[Map3DContract] assertData 缺少 data 参数，请传入数据层模块");
    }
    assertItemCounts(data);
  }

  // DOM 命名空间纪律：data-map3d-area 归 3D 区域热点独占，其余任何地方都不得使用。
  //
  // 防的是什么：如果页面别处（例如一张 inline SVG 地图，见上方 PIN_ATTR 的注释）也用了
  // 同名属性，document.querySelectorAll("[" + PIN_ATTR + "]") 会把它们一起收进热点集合，
  // 后出现的元素同名覆盖先出现的元素，结果是真正的 12 个区域标签全部堆叠在宿主左上角
  // 0,0 处互相重叠，而外来的那个元素则被每帧写入不属于它的 translate3d、在页面上诡异
  // 跳动——这整个过程**一个错都不报**，因为 querySelectorAll 本身不区分「谁应该在这里」，
  // JS 每一步单独看都执行成功。这是本项目历史上最难排查的一类暗坑，因为症状（标签乱跳/
  // 消失）离真正原因（属性名撞车）隔着好几层间接调用。
  //
  // 必须在每次 render/mount 之后调用，不能放进 assertData()：assertData 跑在首次 render
  // 之前，那时 DOM 里还没有任何 [data-map3d-area]，检查形同虚设。
  function assertPinNamespace() {
    Array.prototype.forEach.call(document.querySelectorAll("[" + PIN_ATTR + "]"), function (el) {
      if (!el.closest("." + LABELS_CLASS)) {
        var html = el.outerHTML || "";
        throw new Error(
          "[Map3DContract] 发现 [" + PIN_ATTR + "] 元素落在 ." + LABELS_CLASS + " 之外：" +
          html.slice(0, 200) + "；" +
          PIN_ATTR + " 归 3D 区域热点独占，其余场景选择器请勿复用"
        );
      }
    });
  }

  // 挂载 / 渲染完成后调用（插入 canvas、写好 12 个热点之后）。
  function assertDom(host, options) {
    if (!host || !host.hasAttribute(HOST_ATTR)) {
      throw new Error(
        "[Map3DContract] host 不存在或缺少 [" + HOST_ATTR + "] 属性，实际 host=" +
        (host ? host.outerHTML.slice(0, 200) : "null")
      );
    }

    var hosts = document.querySelectorAll("[" + HOST_ATTR + "]");
    if (hosts.length !== 1) {
      throw new Error("[Map3DContract] 页面中 [" + HOST_ATTR + "] 元素应恰好 1 个，实际 " + hosts.length + " 个");
    }

    var labelsRoots = host.querySelectorAll("." + LABELS_CLASS);
    if (labelsRoots.length !== 1) {
      throw new Error(
        "[Map3DContract] 宿主内 ." + LABELS_CLASS + " 容器应恰好 1 个，实际 " + labelsRoots.length + " 个"
      );
    }
    var labelsRoot = labelsRoots[0];

    var pins = labelsRoot.querySelectorAll("[" + PIN_ATTR + "]");
    if (pins.length !== AREA_IDS.length) {
      throw new Error(
        "[Map3DContract] ." + LABELS_CLASS + " 内的 [" + PIN_ATTR + "] 数量为 " + pins.length +
        "，应为 " + AREA_IDS.length
      );
    }
    var pinIds = {};
    Array.prototype.forEach.call(pins, function (pin) { pinIds[pin.getAttribute(PIN_ATTR)] = true; });
    assertIdSet("." + LABELS_CLASS + " 内的 [" + PIN_ATTR + "] id 集合", pinIds);

    if (!options || !options.statuses) {
      throw new Error("[Map3DContract] assertDom 缺少 options.statuses");
    }
    assertIdSet("options.statuses", options.statuses);

    // 宿主盒非零：mount 是 append 之后同步调用的，读取包围盒会强制回流。合法的 0×0
    // 不存在——CSS 网格把 3D 面板算出 0 尺寸时，3D 静默不渲染（resize/RAF 循环里的
    // 尺寸为 0 分支通常直接 return），这里在第一次渲染就必须把它炸出来。
    var rect = host.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      throw new Error(
        "[Map3DContract] 3D 宿主盒尺寸非法（width=" + rect.width + ", height=" + rect.height +
        "），host.className=" + host.className
      );
    }
  }

  // 防的是什么：标签重建逻辑漏渲染了某一个区域，结果只剩 11 个标签——剩下那一个
  // 不会报错，也不会消失得很明显，而是静默错位到另一个区域的坐标上，看起来像是
  // 「两个标签重叠在一起」，很容易被误判成投影算法的碰撞检测问题，而不是「压根少
  // 画了一个」。这条是现有 pump3d 契约缺失的一条，3D 巡检地图必须补上。
  function assertLabelKeys(labelEls) {
    assertIdSet("labelEls（模式渲染出的区域标签映射）", labelEls);
  }

  // 不要 try/catch，让浏览器的 SecurityError 自然抛出去。这是 fail-fast，不是 fallback。
  //
  // 原理：file:// 页面的 origin 是 null，任何本地图片一旦通过 drawImage 画进 canvas 就会
  // 把这个 canvas 标记为「已污染」（tainted）。而 Three.js r160 在 WebGLState 内部给
  // texSubImage2D 相关调用包了一层 try/catch，捕获到污染纹理抛出的 SecurityError 后只是
  // console.error 一行、然后继续往下执行——结果是纹理渲染成纯黑，three 内部 threw 标志位
  // 为 false，WebGL 的 getError() 也不会报任何错误码，整条渲染管线看起来完全正常。这是
  // 本项目最痛恨的一类静默失效：画面是错的，但没有任何机制会告诉你哪里错了。
  //
  // 这个断言直接对同一块 canvas 调用 2D context 的 getImageData(0,0,1,1)——如果 canvas
  // 已被污染，浏览器会在这一行原生抛出 SecurityError，附带清晰的调用栈，把 three.js
  // 悄悄吞掉的那个错误在构建期一次性翻译成一次带栈的快速失败。
  function assertTextureUntainted(canvas) {
    canvas.getContext("2d").getImageData(0, 0, 1, 1);
  }

  window.Map3DContract = {
    AREA_IDS: AREA_IDS,
    AREA_ITEM_COUNTS: AREA_ITEM_COUNTS,
    TOTAL_ITEMS: TOTAL_ITEMS,
    STATUSES: STATUSES,
    CONTROL_TYPES: CONTROL_TYPES,
    UNITS: UNITS,
    HOST_ATTR: HOST_ATTR,
    PIN_ATTR: PIN_ATTR,
    ITEM_PIN_ATTR: ITEM_PIN_ATTR,
    ACTIVE_LABEL_ATTR: ACTIVE_LABEL_ATTR,
    LABELS_CLASS: LABELS_CLASS,
    CANVAS_CLASS: CANVAS_CLASS,
    assertIdSet: assertIdSet,
    assertItemCounts: assertItemCounts,
    assertData: assertData,
    assertPinNamespace: assertPinNamespace,
    assertDom: assertDom,
    assertLabelKeys: assertLabelKeys,
    assertTextureUntainted: assertTextureUntainted
  };
})();
