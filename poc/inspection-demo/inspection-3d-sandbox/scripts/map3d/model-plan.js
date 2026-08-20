// 站场巡检地图——站点平面图 2.5D 模型：window.Map3DModel。
//
// 与 engine.js 的两调用契约（与被替换掉的 model-sandbox.js 完全一致，引擎不用改
// 调用方式）：
//   createMaterials(THREE) -> materials
//   build(THREE, materials) -> { group, anchors, areaMeshes, itemPins, refreshItemPins }
// anchors 是 { areaId: THREE.Vector3 }（区块顶面中心，供 engine.js 的热点引线用），
// areaMeshes 是 { areaId: [THREE.Mesh, ...] }（该区域所有网格，供选中高亮用），
// 两者键集合与顺序都必须 = Map3DContract.AREA_IDS（build() 内部用 assertIdSet 校验）。
//
// ==========================================================================
// 这个文件替换了什么，为什么
// ==========================================================================
// 前身是 model-sandbox.js（1042 行）：一套程序化的"三维工程沙盘"，12 个区域各有
// 一个手写的设备造型函数（中空房间带窗洞玻璃、立式过滤分离器、高杆放空火炬、
// 调压橇、收发球筒……），布局是自编的 4×3 网格，垂直方向还乘了 2.5 倍夸张系数。
//
// 业务方看完的反馈是"不要这种 3D 站点地图"，并给了自己的站点平面图。这不是嫌
// 造型不够精细——恰恰相反，问题在于**那些精细造型服务的是一个不存在的站**：
// 布局对不上、区域名对不上，做得越细越像"某个别人家的站"。所以这次不是给沙盘
// 调参，是换掉它：
//
//   沙盘版                                本版（平面图 2.5D）
//   ─────────────────────────────────    ─────────────────────────────────
//   自编 4×3 网格布局                     业务方平面图量出来的真实坐标
//   每区一套手写设备造型（~700 行）        统一的挤出色块 + 平面图上真实画出的罐
//   垂直夸张 ×2.5 才读得出体量             不夸张，可读性来自轮廓与配色
//   深蓝工程沙盘配色                       平面图自身的色相（罐橙/工艺黄/消防蓝）
//   没有消防通道概念                       23 个疏散方向箭头（原图核心信息层）
//
// **刻意不做的事**：不为每个区域重新雕设备造型。理由是这次的诉求是"认得出这是
// 我们的站"，而认站靠的是布局、分区名、罐个数和罐号——不是靠能不能看见过滤器上
// 的差压表。把 700 行造型换成统一色块不是偷懒，是把复杂度花在了业务方真正在看的
// 地方（平面图保真度）。真要回到"看单台设备"这条路，正确做法是给某个区域做单独
// 的下钻场景，而不是把 12 个区的设备全塞进一张全站图里。
//
// ==========================================================================
// 坐标与配色真源
// ==========================================================================
// 本文件不定义任何坐标，也不定义任何配色：
//   - 12 个巡检区域的 x/z/w/d/h、palette、tanks 全部现场读 window.DemoStation.areas()
//   - 底图（绿地/地坪/通道/围栏/景物）与调色板全部现场读 window.DemoPlan
// 改一个区的位置只改 station.js，改一处底图只改 plan.js，本文件自动跟着变。
//
// 零 TextureLoader、零对外部图片的 drawImage —— file:// 下的纹理污染陷阱见
// model-shared.js 文件头。业务方那张 JPG **不是**被贴上来的，是被量出坐标重绘的。
(function () {
  "use strict";

  function requireTHREE(THREE, fnName) {
    if (!THREE) {
      throw new Error("[Map3DModel] " + fnName + " 缺少 THREE 参数，请显式传入 three.js 模块");
    }
  }

  function requireShared() {
    if (!window.Map3DShared) {
      throw new Error("[Map3DModel] window.Map3DShared 未加载，请确认 scripts/map3d/model-shared.js 已在本文件之前加载");
    }
    return window.Map3DShared;
  }

  function requireStation() {
    if (!window.DemoStation) {
      throw new Error("[Map3DModel] window.DemoStation 未加载，请确认 scripts/data/station.js 已在本文件之前加载");
    }
    return window.DemoStation;
  }

  function requirePlan() {
    if (!window.DemoPlan) {
      throw new Error("[Map3DModel] window.DemoPlan 未加载，请确认 scripts/data/plan.js 已在本文件之前加载");
    }
    return window.DemoPlan;
  }

  function requireContract() {
    if (!window.Map3DContract) {
      throw new Error("[Map3DModel] window.Map3DContract 未加载");
    }
    return window.Map3DContract;
  }

  // ---------------------------------------------------------------------
  // 尺度常量（单位 = 平面图像素，见 plan.js 文件头）
  // ---------------------------------------------------------------------

  // 罐区/水罐区这类区域的地面是围堰平台：先铺一块矮台，罐立在台上。台高刻意做得
  // 很矮——平面图上围堰只是一圈线，做高了会把罐挡住，而罐（个数 + 罐号）恰恰是
  // 业务方认站最直接的抓手。
  var BUND_HEIGHT = 5;

  // 消防通道箭头贴地高度。ground 平面在 y=0，箭头必须略微抬起，否则与地面共面
  // 会产生 z-fighting（画面上表现为箭头边缘随相机移动闪烁）。
  var ARROW_Y = 1.6;
  var ARROW_LENGTH = 76;
  var ARROW_WIDTH = 18;

  // 巡检点位小球半径。旧沙盘版是 0.55（地块 680 宽），本版地块 1258 宽，等比放大
  // 到 1.0 会小到看不见——这里取 2.6，让 256 个点位在近俯视下能读成"一片散布的
  // 状态点"，同时不至于糊成一团盖住底下的区块配色。
  var PIN_RADIUS = 2.6;

  // ---------------------------------------------------------------------
  // 材质
  // ---------------------------------------------------------------------

  function zoneMaterials(THREE, palette) {
    var out = {};
    ["tank", "process", "safety"].forEach(function (key) {
      var c = palette[key];
      if (!c) throw new Error("[Map3DModel] plan.js 的 PALETTE 缺少配色分组 " + key);
      out[key] = {
        top: new THREE.MeshStandardMaterial({ color: c.top, roughness: 0.72, metalness: 0.12 }),
        side: new THREE.MeshStandardMaterial({ color: c.side, roughness: 0.8, metalness: 0.1 })
      };
    });
    return out;
  }

  function createMaterials(THREE) {
    requireTHREE(THREE, "createMaterials");
    var Shared = requireShared();
    var palette = requirePlan().palette();

    return {
      metal: Shared.createMetalMaterials(THREE),
      status: Shared.createStatusMaterials(THREE),
      zone: zoneMaterials(THREE, palette),
      // 区块顶面轮廓线：平面图的色块之所以好读，一半功劳在那圈描边。
      // LineBasicMaterial.linewidth 在几乎所有平台被钳到 1px（这里正好想要 1px 的
      // 硬边，不需要 TubeGeometry 那套变通），所以直接用 LineSegments。
      edge: new THREE.LineBasicMaterial({ color: palette.fence, transparent: true, opacity: 0.55 }),
      tankBody: new THREE.MeshStandardMaterial({ color: "#9aa7ae", roughness: 0.5, metalness: 0.7 }),
      tankRoof: new THREE.MeshStandardMaterial({ color: "#c2ccd2", roughness: 0.42, metalness: 0.6 }),
      // basin / pad 两个材质已删除：应急池与停车场改成平涂进底图纹理，不再建三维实体。
      house: new THREE.MeshStandardMaterial({ color: palette.house, roughness: 0.68, metalness: 0.12 }),
      // 箭头用 MeshBasicMaterial（不受光照影响）：它是地面标识，不是实物，
      // 任何一盏方向光把它照暗/照亮都是错的——平面图上的红箭头就该恒定醒目。
      arrow: new THREE.MeshBasicMaterial({
        map: Shared.buildArrowTexture(THREE, palette.arrow),
        transparent: true, depthWrite: false
      }),
      hatch: new THREE.MeshStandardMaterial({
        map: Shared.buildHatchTexture(THREE, palette.gateStripe),
        roughness: 0.8, metalness: 0.05
      })
    };
  }

  // ---------------------------------------------------------------------
  // 小工具
  // ---------------------------------------------------------------------

  function addPart(group, list, mesh, castShadow, receiveShadow) {
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    group.add(mesh);
    if (list) list.push(mesh);
    return mesh;
  }

  // 一块带独立顶面材质的挤出块。BoxGeometry 的材质数组顺序是
  // [+X, -X, +Y, -Y, +Z, -Z]，索引 2 是顶面——平面图的色块本质上就是"顶面"，
  // 侧面只是它被挤出后附带的厚度，所以两者用不同明度的同色相。
  function slab(THREE, mats, w, h, d, x, y, z) {
    var faces = [mats.side, mats.side, mats.top, mats.side, mats.side, mats.side];
    return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), faces);
  }

  // 字符串确定性哈希 -> [0,1)。给 256 个巡检点位一个稳定（不随渲染次数变化）
  // 但看起来随机的散布位置，不引入 Math.random（那样每次 refreshItemPins() 会跳动）。
  function hashUnit(str) {
    var h = 2166136261;
    var i;
    for (i = 0; i < str.length; i += 1) {
      h ^= str.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return (h >>> 8) / 16777216;
  }

  // ---------------------------------------------------------------------
  // 底图地面
  // ---------------------------------------------------------------------

  function buildGround(THREE, group) {
    var Shared = requireShared();
    var Plan = requirePlan();
    var yard = Plan.yard();

    var texture = Shared.buildPlanGround(THREE, {
      yard: yard,
      paved: Plan.paved(),
      lanes: Plan.lanes(),
      enclosures: Plan.enclosures(),
      scenery: Plan.scenery(),
      northMark: Plan.northMark(),
      palette: Plan.palette(),
      // build(THREE, materials) 只有两个参数，拿不到 renderer.capabilities.
      // getMaxAnisotropy()。anisotropy 是纯装饰性调参项（值越大只是地面斜视时更
      // 清晰，不影响任何坐标换算是否成立），8 是绝大多数 GPU 都支持的安全值，
      // 不值得为取这一个数字去改两参数的调用契约。
      anisotropy: 8
    });

    var mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(yard.w, yard.d),
      new THREE.MeshStandardMaterial({ map: texture, roughness: 0.95, metalness: 0.0 })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.receiveShadow = true;
    mesh.name = "map3d-ground";
    group.add(mesh);
  }

  // ---------------------------------------------------------------------
  // 12 个巡检区域
  // ---------------------------------------------------------------------

  // 罐：一个 InstancedMesh 装该区所有罐身，另一个装所有罐顶盖板。同区的罐半径
  // 相同（平面图上就是这么画的），所以能合并成实例化绘制；罐号铭牌因为每块贴图
  // 不同，只能一罐一块，故只给平面图上真的标了罐号的罐做（未标注的不编号）。
  function buildTanks(THREE, materials, group, list, area) {
    var tanks = area.tanks;
    if (!tanks.length) return;

    var Shared = requireShared();
    var r = tanks[0].r;
    var baseY = BUND_HEIGHT;
    var bodyH = area.geom.h - BUND_HEIGHT;
    if (bodyH <= 0) {
      throw new Error(
        "[Map3DModel] 区域 " + area.id + " 的 geom.h(" + area.geom.h + ") 必须大于围堰高度 " +
        BUND_HEIGHT + "，否则罐体没有可挤出的高度"
      );
    }

    var body = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(r, r, bodyH, 20), materials.tankBody, tanks.length
    );
    var roof = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(r * 1.04, r * 1.04, bodyH * 0.06, 20), materials.tankRoof, tanks.length
    );
    var m = new THREE.Matrix4();
    tanks.forEach(function (t, i) {
      if (t.r !== r) {
        throw new Error(
          "[Map3DModel] 区域 " + area.id + " 的罐半径不一致（" + t.r + " vs " + r +
          "），实例化绘制要求同区等径；平面图上同一区的罐本来就是等径的，" +
          "出现不等径说明 station.js 的 tanks 数据抄错了"
        );
      }
      m.identity();
      m.setPosition(t.x, baseY + bodyH / 2, t.z);
      body.setMatrixAt(i, m);
      m.identity();
      m.setPosition(t.x, baseY + bodyH, t.z);
      roof.setMatrixAt(i, m);
    });
    body.instanceMatrix.needsUpdate = true;
    roof.instanceMatrix.needsUpdate = true;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body); list.push(body);
    group.add(roof); list.push(roof);

    // 罐号铭牌：平铺在罐顶（rotation.x = -PI/2），近俯视机位下正好朝着相机。
    tanks.forEach(function (t) {
      if (t.label == null) return;
      var tex = Shared.buildNameplateTexture(THREE, { title: t.label, lines: [] }, {
        width: 256, height: 96, bg: "#111a20", ink: "#e6f1f6",
        titleFont: "bold 52px sans-serif", titleY: 66
      });
      var plate = new THREE.Mesh(
        new THREE.PlaneGeometry(r * 1.5, r * 0.56),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
      );
      plate.rotation.x = -Math.PI / 2;
      plate.position.set(t.x, baseY + bodyH + bodyH * 0.06 + 0.6, t.z);
      addPart(group, list, plate, false, false);
    });
  }

  function buildArea(THREE, materials, group, areaMeshes, area) {
    var list = areaMeshes[area.id];
    var g = area.geom;
    var mats = materials.zone[area.palette];
    if (!mats) {
      throw new Error(
        "[Map3DModel] 区域 " + area.id + " 的 palette=" + area.palette +
        " 在 plan.js 的 PALETTE 里没有对应分组"
      );
    }

    // 罐区类只挤出矮围堰台，罐体单独立起来；其余区域整块挤出到 geom.h。
    var blockH = area.tanks.length ? BUND_HEIGHT : g.h;
    var block = slab(THREE, mats, g.w, blockH, g.d, g.x, blockH / 2, g.z);
    block.position.set(g.x, blockH / 2, g.z);
    block.name = "map3d-zone-" + area.id;
    addPart(group, list, block, true, true);

    // 顶面轮廓线：让色块像平面图上那样有清晰的边。用 EdgesGeometry 取整个盒子的
    // 硬边（不只顶面），近俯视下主要看到的就是顶面那一圈。
    var edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(block.geometry), materials.edge
    );
    edges.position.copy(block.position);
    group.add(edges);
    // 不 push 进 list：list 里的元素会被 engine.js 的 cacheAndApplySelection 当作
    // Mesh 读取 .material.emissive 做选中高亮，LineBasicMaterial 没有 emissive，
    // 混进去会在选中该区域时抛错。

    buildTanks(THREE, materials, group, list, area);

    // anchors 用区域的实际最高点（罐区取罐顶 = geom.h，其余取 blockH = geom.h），
    // 热点悬浮在它上方；取矮了热点会插进体块内部。
    return new THREE.Vector3(g.x, g.h, g.z);
  }

  // ---------------------------------------------------------------------
  // 非巡检景物
  // ---------------------------------------------------------------------

  // 只有 plan.js 里 flat:false 的景物才在这里建三维实体。flat:true 的（应急池、
  // 停车场）是平涂进底图纹理的，见 plan.js 的 SCENERY 注释与 model-shared.js 的
  // paintFlatScenery。
  var SCENERY_BUILDERS = {
    // 门卫房 / 安全器材室 / 休息室：矮实体小房子
    house: function (THREE, materials, group, item) {
      var mesh = new THREE.Mesh(new THREE.BoxGeometry(item.w, 14, item.d), materials.house);
      mesh.position.set(item.x, 7, item.z);
      addPart(group, null, mesh, true, true);
    },
    // 大门 / 应急逃生门：斜条纹路障板
    gate: function (THREE, materials, group, item) {
      var mesh = new THREE.Mesh(new THREE.BoxGeometry(item.w, 2, item.d), materials.hatch);
      mesh.position.set(item.x, 1, item.z);
      addPart(group, null, mesh, false, true);
    }
  };

  function buildScenery(THREE, materials, group) {
    requirePlan().scenery().forEach(function (item) {
      if (item.flat === true) return;
      var builder = SCENERY_BUILDERS[item.kind];
      if (!builder) {
        throw new Error(
          "[Map3DModel] plan.js 的景物 \"" + item.name + "\"（flat:false）用了未知 kind=" +
          item.kind + "，三维实体型景物的 kind 应 ∈ [" + Object.keys(SCENERY_BUILDERS).join(", ") + "]"
        );
      }
      builder(THREE, materials, group, item);
    });
  }

  // ---------------------------------------------------------------------
  // 消防通道疏散方向箭头（23 个 → 1 次 draw call）
  // ---------------------------------------------------------------------

  // 全部 23 个箭头共用一张"指向 +X"的纹理，靠每实例的旋转矩阵转成四个朝向，
  // 因此只需要 1 个 InstancedMesh、1 次 draw call、1 张纹理。
  //
  // 旋转的构造顺序很容易写反，记在这里：先绕 X 轴 -90° 把竖立的 plane 放平
  // （法线 +Z → +Y，局部 +X 仍然是世界 +X），再绕世界 Y 轴偏航到目标朝向。
  // three.js 的 q1.multiply(q2) 语义是"q2 先作用、q1 后作用"，所以必须写成
  // qYaw.multiply(qFlat)，写反了箭头会立起来贴在半空。
  var ARROW_YAW = {
    E: 0,                 // 指向 +X
    W: Math.PI,           // 指向 -X
    S: -Math.PI / 2,      // 指向 +Z（世界南）
    N: Math.PI / 2        // 指向 -Z（世界北）
  };

  function buildArrows(THREE, materials, group) {
    var arrows = requirePlan().arrows();
    var mesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(ARROW_LENGTH, ARROW_WIDTH), materials.arrow, arrows.length
    );
    var qFlat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
    var scale = new THREE.Vector3(1, 1, 1);
    var m = new THREE.Matrix4();
    arrows.forEach(function (a, i) {
      if (!Object.prototype.hasOwnProperty.call(ARROW_YAW, a.dir)) {
        throw new Error(
          "[Map3DModel] plan.js 的箭头 #" + i + " 朝向非法：" + a.dir +
          "，应 ∈ [" + Object.keys(ARROW_YAW).join(", ") + "]"
        );
      }
      var qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ARROW_YAW[a.dir]);
      m.compose(new THREE.Vector3(a.x, ARROW_Y, a.z), qYaw.multiply(qFlat), scale);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.name = "map3d-fire-lane-arrows";
    group.add(mesh);
  }

  // ---------------------------------------------------------------------
  // 256 个巡检点位：按状态分 3 组的 InstancedMesh
  // ---------------------------------------------------------------------
  // 必须用 InstancedMesh：256 个独立 Mesh 会产生 280+ 次 draw call（击穿 <200
  // 护栏），按状态分 3 组之后只要 3 次。
  //
  // "状态变更退化成换组"：refresh() 不维护"移动单个实例"的增量逻辑，而是每次都
  // 用当前的 window.DemoItems 全量重建 3 个分组各自的矩阵缓冲并调整 mesh.count。
  // 256 条数据、每次重建几毫秒级，换来的是不需要一套"从分组 A 摘除、插入分组 B"
  // 的索引维护逻辑。

  function createItemPins(THREE, materials) {
    var Contract = requireContract();
    var capacity = Contract.TOTAL_ITEMS;
    var geometry = new THREE.SphereGeometry(PIN_RADIUS, 8, 6);
    var pinGroup = new THREE.Group();
    pinGroup.name = "map3d-item-pins";

    var byStatus = {};
    Contract.STATUSES.forEach(function (status) {
      var mesh = new THREE.InstancedMesh(geometry, materials.status[status], capacity);
      mesh.count = 0;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      pinGroup.add(mesh);
      byStatus[status] = mesh;
    });

    // 位置用 item.id 的确定性哈希在所属区域 footprint 内散布（留 12% 边距，避免
    // 点位贴在区块边沿外）；高度取该区高度的 0.6 倍再抬 4，让点位悬在体块上方
    // 而不是埋进去——罐区的点位因此浮在罐顶附近，符合"这些是这个区里的巡检点"
    // 的读法。
    function refresh(areaDefsById) {
      var counters = { ok: 0, warn: 0, danger: 0 };
      var m = new THREE.Matrix4();
      Contract.AREA_IDS.forEach(function (areaId) {
        var items = window.DemoItems[areaId];
        if (!Array.isArray(items)) {
          throw new Error("[Map3DModel] window.DemoItems." + areaId + " 未加载，无法刷新巡检点位");
        }
        var g = areaDefsById[areaId].geom;
        var marginX = g.w * 0.12;
        var marginZ = g.d * 0.12;
        var y = g.h * 0.6 + 4;
        items.forEach(function (item) {
          if (Contract.STATUSES.indexOf(item.status) < 0) {
            throw new Error("[Map3DModel] 巡检项 " + item.id + " 的 status 非法：" + item.status);
          }
          var hx = hashUnit(item.id + ":x");
          var hz = hashUnit(item.id + ":z");
          var x = g.x + (hx * 2 - 1) * (g.w / 2 - marginX);
          var z = g.z + (hz * 2 - 1) * (g.d / 2 - marginZ);
          var mesh = byStatus[item.status];
          var index = counters[item.status];
          m.identity();
          m.setPosition(x, y, z);
          mesh.setMatrixAt(index, m);
          counters[item.status] += 1;
        });
      });
      Contract.STATUSES.forEach(function (status) {
        var mesh = byStatus[status];
        mesh.count = counters[status];
        mesh.instanceMatrix.needsUpdate = true;
      });
    }

    return { group: pinGroup, byStatus: byStatus, refresh: refresh };
  }

  // ---------------------------------------------------------------------
  // 装配入口
  // ---------------------------------------------------------------------

  function build(THREE, materials) {
    requireTHREE(THREE, "build");
    if (!materials) throw new Error("[Map3DModel] build() 缺少 materials 参数，请先调用 createMaterials(THREE)");
    var Contract = requireContract();
    var station = requireStation();

    var group = new THREE.Group();
    group.name = "map3d-plan";

    buildGround(THREE, group);
    buildScenery(THREE, materials, group);
    buildArrows(THREE, materials, group);

    var areaMeshes = {};
    Contract.AREA_IDS.forEach(function (areaId) { areaMeshes[areaId] = []; });

    var areas = station.areas();
    var areaDefsById = {};
    areas.forEach(function (area) { areaDefsById[area.id] = area; });

    var anchors = {};
    areas.forEach(function (area) {
      anchors[area.id] = buildArea(THREE, materials, group, areaMeshes, area);
    });

    Contract.assertIdSet("Map3DModel anchors", anchors);
    Contract.assertIdSet("Map3DModel areaMeshes", areaMeshes);

    var itemPins = createItemPins(THREE, materials);
    group.add(itemPins.group);
    itemPins.refresh(areaDefsById);

    return {
      group: group,
      anchors: anchors,
      areaMeshes: areaMeshes,
      itemPins: itemPins,
      // 供 engine.js 在 setStatuses()（或任何 window.DemoItems 可能被外部改动之后）
      // 调用，重建 3 组巡检点位——见上方"状态变更退化成换组"的说明。
      refreshItemPins: function () { itemPins.refresh(areaDefsById); }
    };
  }

  window.Map3DModel = {
    createMaterials: createMaterials,
    build: build
  };
})();
