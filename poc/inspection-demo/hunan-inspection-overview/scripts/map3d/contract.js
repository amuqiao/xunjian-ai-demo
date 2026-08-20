// 湖南省油气管网大屏总览 —— 3D 地图隔离契约（L1）：零依赖，必须作为本页面第一个业务
// <script> 加载——早于数据层 scripts/data/*.js、早于 scripts/map3d/model-*.js 与
// engine.js、早于 core/、ui/、scenes/ 和 boot.js。
//
// 【POC：hunan-inspection-overview（巡检站总览，全量油气站场阀室）】
// 本文件与 poc/hunan-pump-overview/scripts/map3d/contract.js 是逐字节相同的独立副本
// （除本段 POC 名称注释）——两块大屏刻意互不耦合，各持完整契约副本，运行时零共享，
// 不要把两者合并成一份"共享契约模块"再互相 import，那会重新引入耦合。
//
// 这里定义的 14 市 id、6 作业区 id、站点形状枚举、DOM 命名常量是本 POC 唯一真源，
// 以下几处必须与 DISTRICT_ADCODES / ZONE_IDS 完全一致（含顺序）：
//   scripts/data/*.js 的地图几何键集合（14 市，按 adcode 升序）
//   scripts/data/*.js 的作业区统计口径键集合（6 作业区）与 zoneDistrictMap
//   scripts/map3d/model-*.js 的区域网格键、着色映射
//   scripts/map3d/engine.js 的热点创建顺序（setActiveZone / setStatuses / syncLabels）
//   DOM 内 .hunan-labels 容器下的 [data-hunan-zone] / [data-hunan-site] 标签
//
// 分工边界：本文件只管「id 空间 + 站点形状枚举 + DOM 命名」这几件事。作业区到底管辖
// 哪些市（zoneDistrictMap 的具体内容）、逐个站点的名称/坐标/状态，都是业务事实，由
// 数据层提供，本文件只提供 assertZoneDistrictMap / assertSiteShape 去校验数据层的产出，
// 不在契约里写死任何一个具体映射或具体站点。
(function () {
  "use strict";

  // ---- 地级行政区：14 个，顺序即真源（按 adcode 升序）----
  // 真实取值已从阿里 DataV 430000_full.json 核实，不是拍脑袋编的占位值。
  var DISTRICT_ADCODES = [
    "430100", "430200", "430300", "430400", "430500", "430600", "430700",
    "430800", "430900", "431000", "431100", "431200", "431300", "433100"
  ];

  var DISTRICT_NAMES = {
    "430100": "长沙市",
    "430200": "株洲市",
    "430300": "湘潭市",
    "430400": "衡阳市",
    "430500": "邵阳市",
    "430600": "岳阳市",
    "430700": "常德市",
    "430800": "张家界市",
    "430900": "益阳市",
    "431000": "郴州市",
    "431100": "永州市",
    "431200": "怀化市",
    "431300": "娄底市",
    "433100": "湘西土家族苗族自治州"
  };

  // ---- 作业区：6 个，顺序即真源 ----
  // 新首页以 assets/.data/站点数据/湖南公司管道基础资料_20260820102547.xlsx 为真源。
  // 该表只覆盖 6 个作业区，旧拓扑里的湘北/湘中/郴州/湘西不再进入首页统计口径。
  // zoneDistrictMap 只表达这 6 个作业区用于地图定位的市域锚点，不再要求覆盖 14 市。
  var ZONE_IDS = [
    "yueyang", "changsha", "hengyang", "yongchen", "xianglou", "zhuzhou"
  ];

  var ZONE_NAMES = {
    yueyang: "岳阳作业区",
    changsha: "长沙作业区",
    hengyang: "衡阳作业区",
    yongchen: "永郴作业区",
    xianglou: "湘娄作业区",
    zhuzhou: "株洲作业区"
  };

  // ---- 枚举 ----
  var SITE_KINDS = ["station", "valve"]; // 站场 / 阀室
  var STATUSES = ["ok", "warn", "danger"];
  var LOD_LEVELS = ["province", "zone", "site"]; // 三级钻取，也是标签 LOD 分级
  // coordSource：见 assertSiteShape 注释——成品油管道站场坐标是实测，
  // 气管道站场坐标是按市质心+管道走向插值出来的近似值，两者绝不能混为一谈。
  var COORD_SOURCES = ["surveyed", "approx"];

  // ---- DOM 常量 ----
  var HOST_ATTR = "data-hunan-host";
  // ⚠️ 命名空间炸弹：属性名之所以是 data-hunan-zone / data-hunan-site 而不是更直白的
  // data-area / data-zone，正是因为本仓库 poc/prototype-v3/index.html 的 inline SVG
  // 地图已经占用了 data-area，poc/inspection-3d-sandbox 占用了 data-map3d-area。若这些
  // 页面未来被拼进同一份 DOM，同名属性会被 querySelectorAll 一起收进标签集合，且不会
  // 有任何报错——具体机制见 assertPinNamespace 的注释。取 data-hunan-* 这个专属前缀
  // 就是为了从命名上直接避开这次静默相撞。
  var ZONE_PIN_ATTR = "data-hunan-zone";
  var SITE_PIN_ATTR = "data-hunan-site";
  var ACTIVE_LABEL_ATTR = "data-active-zone-label";
  var LABELS_CLASS = "hunan-labels";
  var CANVAS_CLASS = "hunan-canvas";

  function arraysEqual(a, b) {
    var i;
    if (a.length !== b.length) return false;
    for (i = 0; i < a.length; i += 1) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  // 通用版：obj 的键集合必须等于 expectedIds 且顺序一致，不等时打印缺失/多余两个差集
  // 以及实际顺序 vs 期望顺序，方便定位到底是「少了」「多了」还是「顺序错了」。
  //
  // 防的是什么：本项目至少有四处各自独立维护一份 id 列表——地图几何、数据层统计、
  // 着色映射、DOM 标签。这四处只要有任意一处漂移（少写一个、多写一个、或者顺序
  // 换了），画面表现只是「某个区颜色不对」或者「某个标签缺失」——控制台不会报任何
  // 错，因为 JS 层面每一处单独看都是合法的对象/数组。assertIdSet 就是把这些处摆到
  // 同一把尺子上量。
  function assertIdSet(label, obj, expectedIds) {
    var keys = Object.keys(obj);
    if (arraysEqual(keys, expectedIds)) return;
    var missing = expectedIds.filter(function (id) { return keys.indexOf(id) < 0; });
    var extra = keys.filter(function (id) { return expectedIds.indexOf(id) < 0; });
    throw new Error(
      "[HunanContract] " + label + " 与期望 id 集合不一致：" +
      "缺少 [" + missing.join(", ") + "]，多余 [" + extra.join(", ") + "]；" +
      "实际顺序 [" + keys.join(", ") + "]，应为 [" + expectedIds.join(", ") + "]"
    );
  }

  // assertIdSet 针对 14 市的特化包装。
  function assertDistrictSet(label, obj) {
    assertIdSet(label, obj, DISTRICT_ADCODES);
  }

  // assertIdSet 针对 10 作业区的特化包装。
  function assertZoneSet(label, obj) {
    assertIdSet(label, obj, ZONE_IDS);
  }

  // 校验数据层提供的「作业区 → adcode 列表」映射：
  //   ① 键集合与顺序必须等于 ZONE_IDS；
  //   ② 所有出现的 adcode 必须 ∈ DISTRICT_ADCODES；
  //   ③ 允许 14 市里存在未被 6 个作业区认领的市。那些市只作为底图显示，不计入
  //      首页区域统计，也不参与作业区高亮。
  function assertZoneDistrictMap(map) {
    if (!map) {
      throw new Error("[HunanContract] assertZoneDistrictMap 缺少 map 参数，请传入数据层的作业区→adcode 映射");
    }
    assertZoneSet("zoneDistrictMap 的键集合", map);

    var owner = {}; // adcode -> 认领它的 zoneId 列表
    ZONE_IDS.forEach(function (zoneId) {
      var adcodes = map[zoneId];
      if (!Array.isArray(adcodes)) {
        throw new Error(
          "[HunanContract] zoneDistrictMap[\"" + zoneId + "\"] 应为 adcode 数组，实际为 " + typeof adcodes
        );
      }
      adcodes.forEach(function (adcode) {
        if (DISTRICT_ADCODES.indexOf(adcode) < 0) {
          throw new Error(
            "[HunanContract] zoneDistrictMap[\"" + zoneId + "\"] 包含非法 adcode " + adcode +
            "，应 ∈ DISTRICT_ADCODES=[" + DISTRICT_ADCODES.join(", ") + "]"
          );
        }
        if (!owner[adcode]) owner[adcode] = [];
        owner[adcode].push(zoneId);
      });
    });

    // owner 只用于上方合法性校验。未被认领的市是新版台账口径之外的底图，不是错误。
  }

  // 单个站点对象的字段级校验。
  //
  // 关于 coordSource：成品油管道那 9 个站场能从业务方给的《长郴管道走向全图》上读出
  // 真实位置（"surveyed"），而气管道站场只有拓扑关系没有坐标、需要按「所在市质心 +
  // 沿管道顺序插值」近似出来（"approx"）。这个字段必须存在且必填——假定必须可辨认，
  // 不能把插值出来的近似坐标伪装成实测坐标，否则地图上"这个点位精确到什么程度"这条
  // 信息会在传递过程中丢失，等有人拿真实测绘图核对时才发现某个点位置是编的。这与
  // 本项目数据层里那 9 条 demo-assumed 量程同一条纪律：假定必须可辨认。
  function assertSiteShape(site) {
    if (!site || typeof site !== "object") {
      throw new Error("[HunanContract] assertSiteShape 需要一个站点对象，实际为 " + typeof site);
    }
    if (!site.id) {
      throw new Error("[HunanContract] 站点缺少非空 id，实际站点=" + JSON.stringify(site));
    }
    if (!site.name) {
      throw new Error("[HunanContract] 站点 " + site.id + " 缺少非空 name");
    }
    if (SITE_KINDS.indexOf(site.kind) < 0) {
      throw new Error(
        "[HunanContract] 站点 " + site.id + " 的 kind=" + site.kind +
        "，应 ∈ SITE_KINDS=[" + SITE_KINDS.join(", ") + "]"
      );
    }
    if (ZONE_IDS.indexOf(site.zoneId) < 0) {
      throw new Error(
        "[HunanContract] 站点 " + site.id + " 的 zoneId=" + site.zoneId +
        "，应 ∈ ZONE_IDS=[" + ZONE_IDS.join(", ") + "]"
      );
    }
    if (DISTRICT_ADCODES.indexOf(site.adcode) < 0) {
      throw new Error(
        "[HunanContract] 站点 " + site.id + " 的 adcode=" + site.adcode +
        "，应 ∈ DISTRICT_ADCODES=[" + DISTRICT_ADCODES.join(", ") + "]"
      );
    }
    if (STATUSES.indexOf(site.status) < 0) {
      throw new Error(
        "[HunanContract] 站点 " + site.id + " 的 status=" + site.status +
        "，应 ∈ STATUSES=[" + STATUSES.join(", ") + "]"
      );
    }
    // 湖南省经纬度范围：经度 108.5~114.5、纬度 24.5~30.5（稍放宽边界，容纳插值误差）。
    if (typeof site.lon !== "number" || !isFinite(site.lon) || site.lon < 108.5 || site.lon > 114.5) {
      throw new Error(
        "[HunanContract] 站点 " + site.id + " 的 lon=" + site.lon +
        " 不是落在 [108.5, 114.5] 内的有限数"
      );
    }
    if (typeof site.lat !== "number" || !isFinite(site.lat) || site.lat < 24.5 || site.lat > 30.5) {
      throw new Error(
        "[HunanContract] 站点 " + site.id + " 的 lat=" + site.lat +
        " 不是落在 [24.5, 30.5] 内的有限数"
      );
    }
    if (COORD_SOURCES.indexOf(site.coordSource) < 0) {
      throw new Error(
        "[HunanContract] 站点 " + site.id + " 的 coordSource=" + site.coordSource +
        "，应 ∈ COORD_SOURCES=[" + COORD_SOURCES.join(", ") + "]（坐标来源必须可辨认，" +
        "不能把插值近似坐标伪装成实测坐标）"
      );
    }
  }

  // 数据层入口断言：boot/app 在首次 render 前调用一次。校验数据层提供的方法存在性，
  // 跑 assertZoneDistrictMap，并对每个站点跑 assertSiteShape。同时校验一条重要的派生
  // 一致性：每个作业区的站点数之和必须等于全省站点总数——防止某个站点的 zoneId 写了
  // 个不存在的值（虽然 assertSiteShape 已经会挡掉非法值，但如果数据层的"按作业区
  // 分组"逻辑和"全量站点列表"逻辑各自独立实现、彼此漂移，两边数出来的总数会不等，
  // 这条断言把这类"两套统计口径互相打架"的错误也钉在构建期）。
  function assertData(data) {
    if (!data) {
      throw new Error("[HunanContract] assertData 缺少 data 参数，请传入数据层模块");
    }
    if (typeof data.zoneDistrictMap !== "function" && typeof data.zoneDistrictMap !== "object") {
      throw new Error(
        "[HunanContract] assertData 需要 data.zoneDistrictMap（函数或对象），实际为 " + typeof data.zoneDistrictMap
      );
    }
    if (typeof data.allSites !== "function") {
      throw new Error(
        "[HunanContract] assertData 需要 data.allSites() 方法，实际 data.allSites 为 " + typeof data.allSites
      );
    }
    if (typeof data.sitesByZone !== "function") {
      throw new Error(
        "[HunanContract] assertData 需要 data.sitesByZone(zoneId) 方法，实际 data.sitesByZone 为 " + typeof data.sitesByZone
      );
    }

    var zoneDistrictMap = typeof data.zoneDistrictMap === "function" ? data.zoneDistrictMap() : data.zoneDistrictMap;
    assertZoneDistrictMap(zoneDistrictMap);

    var allSites = data.allSites();
    if (!Array.isArray(allSites)) {
      throw new Error("[HunanContract] data.allSites() 未返回数组，实际为 " + typeof allSites);
    }
    allSites.forEach(function (site) { assertSiteShape(site); });

    var sumByZone = 0;
    ZONE_IDS.forEach(function (zoneId) {
      var sites = data.sitesByZone(zoneId);
      if (!Array.isArray(sites)) {
        throw new Error(
          "[HunanContract] data.sitesByZone(\"" + zoneId + "\") 未返回数组，实际为 " + typeof sites
        );
      }
      sumByZone += sites.length;
    });
    if (sumByZone !== allSites.length) {
      throw new Error(
        "[HunanContract] 按作业区分组统计出的站点数之和为 " + sumByZone +
        "，应等于 data.allSites() 的总数 " + allSites.length +
        "（可能是某个站点的 zoneId 未被任何分组统计口径认领，或被重复计入）"
      );
    }
  }

  // DOM 命名空间纪律：data-hunan-zone / data-hunan-site 归本项目的作业区/站点标签
  // 独占，其余任何地方都不得使用。
  //
  // 防的是什么：本仓库 poc/prototype-v3/index.html 的 inline SVG 地图已占用
  // data-area，poc/inspection-3d-sandbox 占用 data-map3d-area——同名属性被
  // querySelectorAll 一起收进标签集合时，后出现的元素同名覆盖先出现的元素，结果是
  // 真正的标签全部堆叠在宿主左上角 0,0 处互相重叠，而外来的那个元素则被每帧写入
  // 不属于它的 transform、在页面上诡异跳动——这整个过程一个错都不报，因为
  // querySelectorAll 本身不区分「谁应该在这里」，JS 每一步单独看都执行成功。这是
  // 本项目历史上最难排查的一类暗坑，因为症状（标签乱跳/消失）离真正原因（属性名
  // 撞车）隔着好几层间接调用。
  //
  // 必须在每次 render/mount 之后调用，不能放进 assertData()：assertData 跑在首次
  // render 之前，那时 DOM 里还没有任何 [data-hunan-zone]/[data-hunan-site]，检查形同
  // 虚设。
  function assertPinNamespace() {
    var selector = "[" + ZONE_PIN_ATTR + "], [" + SITE_PIN_ATTR + "]";
    Array.prototype.forEach.call(document.querySelectorAll(selector), function (el) {
      if (!el.closest("." + LABELS_CLASS)) {
        var html = el.outerHTML || "";
        throw new Error(
          "[HunanContract] 发现 [" + ZONE_PIN_ATTR + "]/[" + SITE_PIN_ATTR + "] 元素落在 ." +
          LABELS_CLASS + " 之外：" + html.slice(0, 200) + "；" +
          ZONE_PIN_ATTR + " / " + SITE_PIN_ATTR + " 归本项目标签独占，其余场景选择器请勿复用"
        );
      }
    });
  }

  // 挂载 / 渲染完成后调用（插入 canvas、写好标签之后）。
  function assertDom(host, options) {
    if (!host || !host.hasAttribute(HOST_ATTR)) {
      throw new Error(
        "[HunanContract] host 不存在或缺少 [" + HOST_ATTR + "] 属性，实际 host=" +
        (host ? host.outerHTML.slice(0, 200) : "null")
      );
    }

    var hosts = document.querySelectorAll("[" + HOST_ATTR + "]");
    if (hosts.length !== 1) {
      throw new Error("[HunanContract] 页面中 [" + HOST_ATTR + "] 元素应恰好 1 个，实际 " + hosts.length + " 个");
    }

    var labelsRoots = host.querySelectorAll("." + LABELS_CLASS);
    if (labelsRoots.length !== 1) {
      throw new Error(
        "[HunanContract] 宿主内 ." + LABELS_CLASS + " 容器应恰好 1 个，实际 " + labelsRoots.length + " 个"
      );
    }

    if (!options) {
      throw new Error("[HunanContract] assertDom 缺少 options 参数");
    }
    if (LOD_LEVELS.indexOf(options.level) < 0) {
      throw new Error(
        "[HunanContract] options.level=" + options.level +
        "，应 ∈ LOD_LEVELS=[" + LOD_LEVELS.join(", ") + "]"
      );
    }
    if (!options.zoneStatuses) {
      throw new Error("[HunanContract] assertDom 缺少 options.zoneStatuses");
    }
    assertZoneSet("options.zoneStatuses", options.zoneStatuses);

    // 宿主盒非零：mount 是 append 之后同步调用的，读取包围盒会强制回流。合法的 0×0
    // 不存在——CSS 网格把 3D 面板算出 0 尺寸时，3D 静默不渲染（resize/RAF 循环里的
    // 尺寸为 0 分支通常直接 return），这里在第一次渲染就必须把它炸出来。
    var rect = host.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      throw new Error(
        "[HunanContract] 3D 宿主盒尺寸非法（width=" + rect.width + ", height=" + rect.height +
        "），host.className=" + host.className
      );
    }
  }

  // 按 LOD 分级校验标签键集合——这里与 poc/inspection-3d-sandbox 的母本不同，母本只
  // 有一级、"键集必须等于全集"就够用；本项目是三级钻取，同一条断言不能不分级地套
  // 用到全部三级上。
  //
  // level === "province" 时键集必须等于 ZONE_IDS（省域态只显全部业务作业区标签）；
  // level === "zone" 或 "site" 时只校验"每个键都是合法 id 且无重复"，不要求全集
  // （下钻态刻意只显部分标签——比如钻到某个作业区后，只显示这个作业区内的站点标签，
  // 其余作业区/站点的标签本该消失）。
  //
  // 防的是什么：如果直接照搬母本"键集必须等于全集"的断言，在这里会误报——省域态看
  // 不出问题的是"某个作业区标签压根没画出来"（对应 province 分支要抓的错），而下钻
  // 态刻意隐藏大部分标签是设计，不是 bug。把两者用同一条断言管，结果是要么放宽到
  // 测不出东西、要么在正常下钻时假红。
  function assertLabelKeys(labelEls, level) {
    if (LOD_LEVELS.indexOf(level) < 0) {
      throw new Error(
        "[HunanContract] assertLabelKeys 的 level=" + level +
        "，应 ∈ LOD_LEVELS=[" + LOD_LEVELS.join(", ") + "]"
      );
    }
    var keys = Object.keys(labelEls);
    if (level === "province") {
      assertIdSet("labelEls（省域态标签映射）", labelEls, ZONE_IDS);
      return;
    }
    // zone / site 级：只要求每个键都是合法 id（作业区 id 或非空字符串站点 id）且无重复。
    var seen = {};
    var duplicated = [];
    keys.forEach(function (key) {
      if (seen[key]) {
        duplicated.push(key);
      }
      seen[key] = true;
    });
    if (duplicated.length > 0) {
      throw new Error(
        "[HunanContract] labelEls（" + level + " 级标签映射）出现重复键：[" + duplicated.join(", ") + "]"
      );
    }
    var empty = keys.filter(function (key) { return !key; });
    if (empty.length > 0) {
      throw new Error(
        "[HunanContract] labelEls（" + level + " 级标签映射）出现空 id 键，keys=[" + keys.join(", ") + "]"
      );
    }
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

  window.HunanContract = {
    DISTRICT_ADCODES: DISTRICT_ADCODES,
    DISTRICT_NAMES: DISTRICT_NAMES,
    ZONE_IDS: ZONE_IDS,
    ZONE_NAMES: ZONE_NAMES,
    SITE_KINDS: SITE_KINDS,
    STATUSES: STATUSES,
    LOD_LEVELS: LOD_LEVELS,
    COORD_SOURCES: COORD_SOURCES,
    HOST_ATTR: HOST_ATTR,
    ZONE_PIN_ATTR: ZONE_PIN_ATTR,
    SITE_PIN_ATTR: SITE_PIN_ATTR,
    ACTIVE_LABEL_ATTR: ACTIVE_LABEL_ATTR,
    LABELS_CLASS: LABELS_CLASS,
    CANVAS_CLASS: CANVAS_CLASS,
    assertIdSet: assertIdSet,
    assertDistrictSet: assertDistrictSet,
    assertZoneSet: assertZoneSet,
    assertZoneDistrictMap: assertZoneDistrictMap,
    assertSiteShape: assertSiteShape,
    assertData: assertData,
    assertPinNamespace: assertPinNamespace,
    assertDom: assertDom,
    assertLabelKeys: assertLabelKeys,
    assertTextureUntainted: assertTextureUntainted
  };
})();
