// 站场 3D 巡检地图（俯视/卫星质感 POC）——俯视地面 + 12 区挤出块（L3，晚于 contract.js /
// model-shared.js / data/station.js，早于 engine.js）。
//
// ==== 本文件与 scripts/pump3d/model.js 的关系 ====
// THREE 通过函数参数传入的风格、createMaterials()/build() 两段式导出、"共享材质模板 +
// 每个实例各自 clone 一份自己的材质"的纪律，全部照抄 pump3d/model.js 的既有约定（详见
// 该文件与 README 第 4 章）。但本文件的挤出块**位置/尺寸是数据驱动的**——每个区域的
// x/z/w/d/h 来自 window.DemoStation.area(id).geom（真实站场布局，见 data/station.js
// 文件头的坐标系与 ASCII 草图），不是像泵机组各部位那样的固定硬编码数字。这是本文件与
// pump3d/model.js 最大的结构性差异，读者不应假设两者的"数据来源"是同一类东西。
//
// ==== 视觉路线：诚实的站场平面总图 + 卫星质感底纹的融合 ====
// 见 README「视觉路线选择」一节的完整论证。本文件负责的是"卫星质感底纹"那一半：调用
// Map3DShared.buildSatelliteGround 生成航拍风格地面纹理（田块/林冠/水塘/道路/围墙/
// 硬化地坪，见该函数文件头注释），"诚实总图"那一半（区域编号/图例/指北针/比例尺）
// 由 scripts/core/dom.js 与 styles/03-map3d.css 负责。
//
// ==== 建筑投影 ====
// 本文件不in 地面纹理里烘一份假的建筑阴影——12 个区域挤出块的阴影完全依赖 three.js
// 真实的 DirectionalLight 阴影贴图（castShadow/receiveShadow + engine.js 里
// autoUpdate=false 配 needsUpdate=true 的那对开关），这样阴影方向、长度、软硬度
// 都随实际光源与挤出高度联动，比在纹理里画一块固定偏移的暗色矩形更"诚实"。
//
// ==== 代码风格 / 错误处理约束（与 model-shared.js 相同，不重复展开）====
// 纯 ES5 IIFE + window.Map3DAerial。不写 fallback / silent catch / 默认值吞错。
(function () {
  "use strict";

  // ---------------------------------------------------------------------
  // 世界布局常量：地面纹理/几何覆盖的范围，比站场地块（680×460）大一圈，
  // 用来容纳装饰性的周边农田/林带/水塘——这圈"周边地物"是本 POC 为了让俯视
  // 底纹读起来更像航拍图而添加的舞台美术，不是这座真实站场的实测周边环境，
  // 见 README「地面纹理诚实评价」一节的明确声明。
  // ---------------------------------------------------------------------
  var GROUND_WIDTH = 1200;
  var GROUND_DEPTH = 900;

  // 每个区域挤出块之外再留出的"硬化地坪"外扩边距（世界单位），让纹理里的浅色地坪块
  // 比挤出块本体略大一圈，读起来像"设备/建筑坐落在地坪上"而不是地坪与建筑边缘完全重合。
  var PAD_MARGIN = 22;

  // 装饰性周边地物：田块（矩形条纹）/ 林带（密集圆点簇）/ 水塘（不规则暗色闭合区）。
  // 全部落在站场围墙（见下方 PERIMETER）之外的舞台边缘，不与站场本体重叠。
  var FARMLAND_FIELDS = [
    { x: -470, z: -260, w: 220, d: 260, rotation: -0.05, stripeWidth: 16 },
    { x: -470, z: 230, w: 220, d: 300, rotation: 0.04, stripeWidth: 18 },
    { x: 470, z: -180, w: 200, d: 220, rotation: 0.06, stripeWidth: 14 },
    { x: 430, z: 300, w: 300, d: 220, rotation: -0.07, stripeWidth: 20 },
    { x: -30, z: -390, w: 560, d: 100, rotation: 0.02, stripeWidth: 16 }
  ];
  var TREE_CLUSTERS = [
    { x: -560, z: -360, r: 95, count: 150 },
    { x: 560, z: -380, r: 85, count: 130 },
    { x: -540, z: 390, r: 100, count: 150 },
    { x: 545, z: 360, r: 90, count: 130 },
    { x: -580, z: 60, r: 70, count: 100 },
    { x: 0, z: -430, r: 60, count: 90 }
  ];
  var WATER_PONDS = [{ x: 520, z: -30, r: 50 }];

  // 围墙：贴着站场地块（680×460，半宽 340、半深 230）内侧收一圈，围出真正的站内范围。
  var PERIMETER = [
    { x: -330, z: -225 },
    { x: 330, z: -225 },
    { x: 330, z: 225 },
    { x: -330, z: 225 }
  ];

  // 道路：① 站外南向进站道路，接到 gate（进出站区）南边界；② 站内东西向主干道，
  // 对应 data/station.js 里 row1"主通道"这条实际存在的空档通行带。两条路的坐标
  // 都直接取自 station.js 的区域 geom，不是凭空另起一套。
  var ROADS = [
    { points: [{ x: -225, z: 450 }, { x: -225, z: 45 }], width: 26 },
    { points: [{ x: -320, z: 0 }, { x: 320, z: 0 }], width: 30 }
  ];

  // 区域 kind → 挤出块侧面材质配色：process（工艺设备区，偏冷金属灰）/ room（综合楼
  // 房间，偏暖建筑米黄）/ boundary（边界敞开设施，偏绿灰）。三种配色只是为了让"这是
  // 设备区还是房间还是边界棚"在不点击的情况下也能从颜色上大致分辨，不承载状态语义
  // （状态语义只在顶面，见 buildAreaMesh）。
  var SIDE_PALETTE = {
    process: { color: "#7f8a90", roughness: 0.6, metalness: 0.35 },
    room: { color: "#a89873", roughness: 0.75, metalness: 0.05 },
    boundary: { color: "#6f7d5f", roughness: 0.8, metalness: 0.05 }
  };

  function requireGlobal(obj, name) {
    if (!obj) throw new Error("[Map3DAerial] " + name + " 未加载，请检查 index.html 的脚本顺序");
    return obj;
  }

  function contract() {
    return requireGlobal(window.Map3DContract, "window.Map3DContract");
  }

  function station() {
    return requireGlobal(window.DemoStation, "window.DemoStation");
  }

  function shared() {
    return requireGlobal(window.Map3DShared, "window.Map3DShared");
  }

  // ---------------------------------------------------------------------
  // 材质
  // ---------------------------------------------------------------------

  function buildGroundTexture(THREE, renderer) {
    var anisotropy = renderer.capabilities.getMaxAnisotropy();
    var areas = station().areas().map(function (area) {
      return { x: area.geom.x, z: area.geom.z, w: area.geom.w + PAD_MARGIN * 2, d: area.geom.d + PAD_MARGIN * 2 };
    });
    return shared().buildSatelliteGround(THREE, {
      size: 1024,
      stationWidth: GROUND_WIDTH,
      stationDepth: GROUND_DEPTH,
      anisotropy: anisotropy,
      baseColor: "#514a34",
      patchCount: 300,
      grainAlpha: 0.14,
      farmlandFields: FARMLAND_FIELDS,
      treeClusters: TREE_CLUSTERS,
      waterPonds: WATER_PONDS,
      vignetteStrength: 0.16,
      areas: areas,
      roads: ROADS,
      perimeter: PERIMETER,
      tankRings: []
    });
  }

  function createMaterials(THREE, renderer) {
    if (!renderer) throw new Error("[Map3DAerial] createMaterials 缺少 renderer 参数（用于查询各向异性过滤上限）");
    var groundTexture = buildGroundTexture(THREE, renderer);
    return {
      ground: new THREE.MeshStandardMaterial({ map: groundTexture, roughness: 0.96, metalness: 0 }),
      side: {
        process: new THREE.MeshStandardMaterial(SIDE_PALETTE.process),
        room: new THREE.MeshStandardMaterial(SIDE_PALETTE.room),
        boundary: new THREE.MeshStandardMaterial(SIDE_PALETTE.boundary)
      },
      roofCap: new THREE.MeshStandardMaterial({ color: "#4c5942", roughness: 0.7, metalness: 0.05 }),
      // 三色状态模板：直接复用 Map3DShared.createStatusMaterials，保证色值口径与
      // styles/01-tokens.css / engine.js 的 HOTSPOT.colors 三处完全一致。
      statusTemplates: shared().createStatusMaterials(THREE)
    };
  }

  // ---------------------------------------------------------------------
  // 几何：地面 + 12 区挤出块
  // ---------------------------------------------------------------------

  function buildGround(THREE, materials, group) {
    var ground = new THREE.Mesh(new THREE.PlaneGeometry(GROUND_WIDTH, GROUND_DEPTH), materials.ground);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    ground.receiveShadow = true;
    ground.castShadow = false;
    group.add(ground);
  }

  // 单个区域的挤出块：薄 BoxGeometry，六面材质数组 [侧,侧,顶,底,侧,侧]（three.js
  // BoxGeometry 默认的 6 个面组顺序：+x,-x,+y,-y,+z,-z）。顶面材质是该区域独占的
  // status 材质 clone（不与其它区域共享，setStatuses()/setActiveArea() 需要能安全
  // 修改它而不影响别的区域，参见 scripts/pump3d/engine.js 的 cacheAndApplySelection
  // 注释——道理完全一样）。room 类区域额外叠一层"屋顶压顶"薄板，读作真实建筑屋顶。
  function buildAreaMesh(THREE, materials, area) {
    var sideMaterial = materials.side[area.kind];
    if (!sideMaterial) throw new Error("[Map3DAerial] 未知的区域 kind：" + area.kind + "（区域 " + area.id + "）");

    var statusTemplate = materials.statusTemplates[area.status];
    if (!statusTemplate) throw new Error("[Map3DAerial] 区域 " + area.id + " 的初始 status 非法：" + area.status);
    var topMaterial = statusTemplate.clone();

    var geometry = new THREE.BoxGeometry(area.geom.w, area.geom.h, area.geom.d);
    var box = new THREE.Mesh(geometry, [
      sideMaterial.clone(), sideMaterial.clone(),
      topMaterial, sideMaterial.clone(),
      sideMaterial.clone(), sideMaterial.clone()
    ]);
    box.position.set(area.geom.x, area.geom.h / 2, area.geom.z);
    box.castShadow = true;
    box.receiveShadow = true;

    var meshes = [box];

    if (area.kind === "room") {
      var cap = new THREE.Mesh(
        new THREE.BoxGeometry(area.geom.w * 0.94, 0.6, area.geom.d * 0.94),
        materials.roofCap.clone()
      );
      cap.position.set(area.geom.x, area.geom.h + 0.3, area.geom.z);
      cap.castShadow = true;
      cap.receiveShadow = true;
      meshes.push(cap);
    }

    return { meshes: meshes, topMaterial: topMaterial };
  }

  function build(THREE, materials) {
    var C = contract();
    var group = new THREE.Group();
    var areaMeshes = {};
    var areaTopMaterials = {};
    var anchors = {};

    buildGround(THREE, materials, group);

    station().areas().forEach(function (area) {
      var built = buildAreaMesh(THREE, materials, area);
      built.meshes.forEach(function (mesh) { group.add(mesh); });
      areaMeshes[area.id] = built.meshes;
      areaTopMaterials[area.id] = built.topMaterial;
      // 锚点落在挤出块顶面正上方一点（供 3D 热点与 DOM 标签投影使用），不是块的几何中心。
      anchors[area.id] = new THREE.Vector3(area.geom.x, area.geom.h + 2, area.geom.z);
    });

    C.assertIdSet("Map3DAerial anchors", anchors);
    C.assertIdSet("Map3DAerial areaMeshes", areaMeshes);

    return { group: group, anchors: anchors, areaMeshes: areaMeshes, areaTopMaterials: areaTopMaterials };
  }

  window.Map3DAerial = {
    GROUND_WIDTH: GROUND_WIDTH,
    GROUND_DEPTH: GROUND_DEPTH,
    createMaterials: createMaterials,
    build: build
  };
})();
