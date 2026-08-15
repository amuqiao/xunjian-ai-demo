// 站场 3D 巡检地图——程序化三维沙盘模型：window.Map3DModel。
//
// 与 /Users/admin/Code/beng-ai-demo/poc/pump-demo/scripts/pump3d/model.js 同构的两调用契约（engine.js 按同样的方式消费）：
//   createMaterials(THREE) -> materials
//   build(THREE, materials) -> { group, anchors, areaMeshes, itemPins, refreshItemPins }
// anchors 是 { areaId: THREE.Vector3 }（区块顶面中心，供 engine.js 的热点引线用），
// areaMeshes 是 { areaId: [THREE.Mesh, ...] }（该区域所有网格，供未来的按区域高亮用），
// 两者键集合与顺序都必须 = Map3DContract.AREA_IDS（build() 内部用 assertIdSet 校验）。
//
// 坐标真源：本文件不重新定义任何区域坐标——12 区的 x/z/w/d/h 全部现场读取
// window.DemoStation.areas()（station.js 是这份坐标系的唯一定义处，见该文件头部
// 注释）。改一个区的位置/尺寸只改 station.js，本文件自动跟着变。
//
// 视觉风格延续 /Users/admin/Code/beng-ai-demo/poc/pump-demo/scripts/pump3d/model.js：PBR MeshStandardMaterial + 程序化
// CanvasTexture（通过 scripts/map3d/model-shared.js 的共享工具），零 TextureLoader、
// 零对外部图片的 drawImage（file:// 下的纹理污染陷阱，见 model-shared.js 文件头）。
//
// 250 个巡检点位（每条巡检项一个）必须用 InstancedMesh：实测 250 个独立 Mesh 会
// 产生 276 次 draw call（击穿 <200 护栏），改成按状态分 3 组的 InstancedMesh 后只要
// 3 次。「状态变更退化成换组」的实现是 refreshItemPins()：不维护"移动单个实例"的
// 增量逻辑，而是每次都用当前的 window.DemoItems 全量重建 3 个分组各自的矩阵缓冲
// 并调整 mesh.count——256 条数据、每次重建都是几毫秒级的开销，换来的是不需要一套
// "从分组 A 摘除、插入分组 B"的索引维护逻辑，这与 sweepLabels 宁可"简单但正确"也
// 不做增量优化是同一种取舍。
//
// ==== 2026-08-13 视觉打磨：三件事 ====
//
// ① 垂直夸张系数 VERTICAL_EXAGGERATION（见下方常量与 exaggerateHeight()）。
// station.js 的 geom.h 是真实比例（多数区域 4~7 世界单位高的单层阀室/机柜间/
// 敞棚，摊在 680x460 的地块上必然显得很扁）——这是数据层的真源，保持不动。
// 工程沙盘/地形沙盘的固有媒介惯例就是垂直方向夸张（不是失真，是媒介惯例），
// 本文件在读取 geom.h 之后一律先经过 exaggerateHeight() 放大，再拿去建几何体/
// 摆放高度，anchors（热点悬浮锚点）也必须用同一个放大后的高度，否则热点会插进
// 被放大后的体块内部。
//
// ② 12 个区域的设备体块从"占位几何体"改成"看得出是什么工艺区"的组合造型
// （见下方 AREA_BUILDERS 与 buildRoomShell/*Interior 系列函数），细节数量与真实
// 巡检点清单（station.js 的 devices 字段，溯源 附件1-3.xlsx）大致对应。
// control/cabinet/ups/power 四间房间从"一整块实心 Box"改成真正的中空建筑
// （四面薄墙 + 屋顶 + 四角立柱，北墙裙墙/窗洞/檐墙三段拼接，窗洞处不放墙体
// 网格、只留高透玻璃——这是"内部可见"的具体落地手段：镶窗户不是在实墙表面
// 贴一张贴图，是真的让中段没有挡光的几何体）。
//
// ③ 同类重复设备一律用 InstancedMesh（机柜阵列、开关柜列、拉线、立柱、支座、
// 阀门簇……），把 draw call 摊薄——渲染预算护栏 renderCalls<200、triangles<260000
// 不能击穿，这是 verify/verify_map3d.js 会现场量的两条硬约束。
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

  function requireContract() {
    if (!window.Map3DContract) {
      throw new Error("[Map3DModel] window.Map3DContract 未加载");
    }
    return window.Map3DContract;
  }

  // ---------------------------------------------------------------------
  // 垂直夸张系数——沙盘媒介惯例，见文件头"① 垂直夸张系数"说明。
  // ---------------------------------------------------------------------

  // 取 2.5：station.js 里多数区域 geom.h 落在 4~7 个世界单位（单层阀室/机柜间/
  // 敞棚），乘 2.5 之后落在 10~17.5，相对 680x460 的站场地块跨度终于能读出
  // "这里立着一栋东西"，同时又不会夸张到让区域之间互相遮挡（vent 的 h=12 是
  // 全站最高的真实值，乘 2.5 = 30，仍明显低于 overview 相机高度~560）。
  // station.js 的 geom.h 保持真实值不动——渲染层的这次放大不回写数据层，
  // 也不影响巡检项/进度等任何业务口径的计算（那些全部走 station.js 现场派生，
  // 不读取本文件）。
  var VERTICAL_EXAGGERATION = 2.5;

  function exaggerateHeight(h) {
    if (typeof h !== "number" || !isFinite(h)) {
      throw new Error("[Map3DModel] exaggerateHeight 需要有限数字，实际为 " + h);
    }
    return h * VERTICAL_EXAGGERATION;
  }

  // ---------------------------------------------------------------------
  // 材质
  // ---------------------------------------------------------------------

  function createMaterials(THREE) {
    requireTHREE(THREE, "createMaterials");
    var Shared = requireShared();
    var metal = Shared.createMetalMaterials(THREE);
    var status = Shared.createStatusMaterials(THREE);

    return {
      metal: metal,
      status: status,
      wall: new THREE.MeshStandardMaterial({ color: "#6b7680", roughness: 0.82, metalness: 0.08 }),
      roof: new THREE.MeshStandardMaterial({ color: "#31363c", roughness: 0.7, metalness: 0.15 }),
      // viewGlass：四间房建筑北墙窗洞专用，透明度比旧 glass 高得多（0.16 vs
      // 0.38），是"内部机柜/操作台要能被外部看见"这条硬要求的具体落地——
      // 窗户本身几乎不挡视线，只留一层很淡的蓝绿色玻璃反光。
      viewGlass: new THREE.MeshPhysicalMaterial({
        color: "#cfeff8", roughness: 0.12, metalness: 0.05,
        transparent: true, opacity: 0.16, emissive: "#0d2630", emissiveIntensity: 0.12
      }),
      // screenGlow：控制室监视墙/操作台屏幕专用，自发光，不依赖场景光照也能
      // 读出"这是一排亮着的屏幕"。
      screenGlow: new THREE.MeshStandardMaterial({
        color: "#0d2630", emissive: "#3fd0ff", emissiveIntensity: 0.6, roughness: 0.4, metalness: 0.1
      }),
      shed: new THREE.MeshStandardMaterial({ color: "#4a5862", roughness: 0.65, metalness: 0.25 }),
      guy: new THREE.MeshStandardMaterial({ color: "#c4d0d6", roughness: 0.3, metalness: 0.85 }),
      warnStripe: new THREE.MeshStandardMaterial({ color: "#eeb44a", roughness: 0.5, metalness: 0.1 }),
      basin: new THREE.MeshStandardMaterial({ color: "#0f1a20", roughness: 0.95, metalness: 0.0 }),
      flare: new THREE.MeshStandardMaterial({ color: "#c96a3a", roughness: 0.55, metalness: 0.35 })
    };
  }

  // ---------------------------------------------------------------------
  // 小工具
  // ---------------------------------------------------------------------

  function addPart(group, list, mesh, castShadow, receiveShadow) {
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    group.add(mesh);
    list.push(mesh);
    return mesh;
  }

  // 字符串确定性哈希 -> [0,1)。用于给 256 个巡检点位一个稳定（不随渲染次数变化）
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
  // 地面
  // ---------------------------------------------------------------------

  function buildGround(THREE, materials, group, station) {
    var Shared = requireShared();
    var yard = station.meta().yard;
    var areas = station.areas();

    var groundOptions = {
      size: 1024,
      stationWidth: yard.w,
      stationDepth: yard.d,
      // 本文件的 build(THREE, materials) 只有两个参数，拿不到 renderer.capabilities.
      // getMaxAnisotropy()（model-shared.js 文件头建议的取值来源）。anisotropy 属于
      // 纯装饰性调参项（值越大只是地面斜视时更清晰，不影响任何坐标系换算是否成立），
      // 8 是绝大多数 GPU 都支持的安全值，不需要为了取这一个数字改变两参数的调用契约。
      anisotropy: 8,
      areas: areas.map(function (a) {
        return { x: a.geom.x, z: a.geom.z, w: a.geom.w, d: a.geom.d };
      }),
      // 三条示意道路：row1 主通道（东西向）、南巡检道（走廊 C，东西向）、
      // 东侧绕行支路（南北向）——与 scripts/data/track.js 的真实巡检动线走向一致，
      // 纯装饰，不参与任何坐标计算。
      roads: [
        { points: [{ x: -yard.w / 2, z: 0 }, { x: yard.w / 2, z: 0 }], width: 26 },
        { points: [{ x: -yard.w / 2, z: 165 }, { x: yard.w / 2, z: 165 }], width: 18 },
        { points: [{ x: 320, z: 0 }, { x: 320, z: 165 }], width: 14 }
      ],
      perimeter: [
        { x: -yard.w / 2, z: -yard.d / 2 },
        { x: yard.w / 2, z: -yard.d / 2 },
        { x: yard.w / 2, z: yard.d / 2 },
        { x: -yard.w / 2, z: yard.d / 2 }
      ]
    };

    var texture = Shared.buildSandboxGround(THREE, groundOptions);
    var groundMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(yard.w, yard.d),
      new THREE.MeshStandardMaterial({ map: texture, roughness: 0.95, metalness: 0.0 })
    );
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.receiveShadow = true;
    groundMesh.name = "map3d-ground";
    group.add(groundMesh);
  }

  // ---------------------------------------------------------------------
  // 共用小造型：管道、竖罐、卧罐、机柜盒、阀门簇（InstancedMesh）
  // ---------------------------------------------------------------------

  // 竖直圆柱罐体，顶部加一个半球封头（LatheGeometry 太重，穹顶用 SphereGeometry 的
  // 上半球即可）。height 由调用方传入前自行经过 exaggerateHeight()——本函数不关心
  // 高度是不是被夸张过，只负责"给定半径与高度画一个立式罐"。baseY 恒为 0（立于
  // 地面），不参与夸张换算。
  function verticalTank(THREE, materials, radius, height, baseY) {
    var g = new THREE.Group();
    var body = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 16), materials.metal.tank.clone());
    body.position.y = baseY + height / 2;
    g.add(body);
    var dome = new THREE.Mesh(new THREE.SphereGeometry(radius, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), materials.metal.tank.clone());
    dome.position.y = baseY + height;
    g.add(dome);
    g.traverse(function (obj) { if (obj.isMesh) { obj.castShadow = true; obj.receiveShadow = true; } });
    return g;
  }

  // 卧式圆柱罐体，两端半球封头，长轴沿世界 X。radius/centerY 刻意不经过垂直夸张：
  // 卧罐是"躺在支座上"的设备，centerY 由 radius 直接决定贴地关系（centerY≈radius+
  // 支座间隙），如果只夸张 centerY 不夸张 radius，罐体会凌空浮在支座上方留出一条
  // 违反物理的空隙——这类"贴地摆放、靠自身截面尺寸决定离地高度"的设备，保持真实
  // 比例反而比强行夸张更可信。
  function horizontalTank(THREE, materials, radius, length, centerY) {
    var g = new THREE.Group();
    var body = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 16), materials.metal.tank.clone());
    body.rotation.z = Math.PI / 2;
    body.position.y = centerY;
    g.add(body);
    var caps = [length / 2, -length / 2];
    caps.forEach(function (x) {
      var cap = new THREE.Mesh(new THREE.SphereGeometry(radius, 16, 8), materials.metal.tank.clone());
      cap.position.set(x, centerY, 0);
      g.add(cap);
    });
    g.traverse(function (obj) { if (obj.isMesh) { obj.castShadow = true; obj.receiveShadow = true; } });
    return g;
  }

  // 阀门/仪表簇：一个 InstancedMesh 代表 count 个小箱体，沿 x 方向等距排开。
  function instancedBoxCluster(THREE, material, count, size, spacing, baseX, baseY, baseZ) {
    var mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(size[0], size[1], size[2]), material, count);
    var m = new THREE.Matrix4();
    var i;
    var start = -((count - 1) * spacing) / 2;
    for (i = 0; i < count; i += 1) {
      m.identity();
      m.setPosition(baseX + start + i * spacing, baseY, baseZ);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  // 与 instancedBoxCluster 同构，但沿 z 方向等距排开（metering 的并联管路/blowdown
  // 的卧罐支座这类"南北向排列"的场景要用它，instancedBoxCluster 只覆盖东西向）。
  function instancedBoxClusterZ(THREE, material, count, size, spacing, baseX, baseY, baseZ) {
    var mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(size[0], size[1], size[2]), material, count);
    var m = new THREE.Matrix4();
    var i;
    var start = -((count - 1) * spacing) / 2;
    for (i = 0; i < count; i += 1) {
      m.identity();
      m.setPosition(baseX, baseY, baseZ + start + i * spacing);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  // 圆柱簇：与 instancedBoxCluster 同构但几何体是 CylinderGeometry，沿 x 方向等距
  // 排开——阀门执行机构的气缸/调压指挥器/放空管顶配件这类"细高圆柱"重复件用它。
  function instancedCylinderCluster(THREE, material, count, radiusTop, radiusBottom, height, radialSegments, spacing, baseX, baseY, baseZ) {
    var mesh = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(radiusTop, radiusBottom, height, radialSegments), material, count
    );
    var m = new THREE.Matrix4();
    var i;
    var start = -((count - 1) * spacing) / 2;
    for (i = 0; i < count; i += 1) {
      m.identity();
      m.setPosition(baseX + start + i * spacing, baseY, baseZ);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  function box(THREE, material, w, h, d, x, y, z) {
    var mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    return mesh;
  }

  // 任意散布位置的箱体簇：与 instancedBoxCluster/instancedBoxClusterZ 不同，这里
  // 直接接受一组 [x,y,z] 位置——用于"两组本该分开摆放、但形状/材质完全相同"的
  // 支腿/支座合并成 1 次 draw call 的场景（比如 gate 两条汇管各 4 条支腿、
  // regulate 两台撬装各 4 条支腿，分开写是 2 次 draw call，合并成一个 InstancedMesh
  // 只要 1 次）。
  function instancedBoxAt(THREE, material, size, positions) {
    var mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(size[0], size[1], size[2]), material, positions.length);
    var m = new THREE.Matrix4();
    positions.forEach(function (p, i) {
      m.identity();
      m.setPosition(p[0], p[1], p[2]);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  // ---------------------------------------------------------------------
  // 室内建筑外壳（control/cabinet/ups/power 四室共用）
  // ---------------------------------------------------------------------

  // 四室 x 边界精确相接、同一栋综合值班楼——真正的中空建筑，不是一整块实心 Box：
  //   南墙（走廊一侧，含门+铭牌）——整面实墙，是该房间面向巡检道的"正脸"；
  //   北墙（面向站场主通道一侧）——裙墙 + 高透玻璃窗洞 + 檐墙三段拼接，中段
  //     刻意不放墙体网格，只留 materials.viewGlass 那块高透玻璃，让内部的机柜/
  //     操作台真的能被外部看见（不是在实墙表面贴一张窗户贴图）；
  //   东西两侧墙——两块窄墙，围合出完整的矩形室内空间；
  //   屋顶——覆盖整个footprint并略微出檐；
  //   四角立柱（1 个 InstancedMesh，4 根柱子只占 1 次 draw call）——北墙镂空之后
  //     屋顶主要靠四角立柱在视觉上"撑住"，柱子本身也是"这是一栋真建筑不是一块
  //     平板"最直接的读法。
  // 返回 { wallH, wallT, interiorMinX, interiorMaxX, interiorZ }供调用方在室内摆放
  // 机柜/操作台等家具时换算坐标——interiorZ 是"贴着北墙窗洞内侧"的 z 坐标，
  // 家具摆在这条线上，从北墙窗洞往里看正好第一眼看到。
  function buildRoomShell(THREE, materials, group, list, area, doorAtEast) {
    var g = area.geom;
    var wallH = exaggerateHeight(g.h);
    var wallT = 2.6;
    var halfW = g.w / 2;
    var halfD = g.d / 2;
    var doorSide = doorAtEast ? 1 : -1;

    // 南墙 + 门 + 铭牌。
    var southZ = g.z + halfD - wallT / 2;
    addPart(group, list, box(THREE, materials.wall, g.w, wallH, wallT, g.x, wallH / 2, southZ), true, true);

    var doorX = g.x + doorSide * g.w * 0.3;
    var door = box(THREE, materials.roof, g.w * 0.14, wallH * 0.5, wallT * 0.4, doorX, wallH * 0.25, g.z + halfD - wallT * 0.15);
    addPart(group, list, door, false, false);

    var nameplateTex = window.Map3DShared.buildNameplateTexture(THREE, { title: area.name, lines: [area.short] }, {
      width: 220, height: 120, bg: "#c7d3d8", ink: "#0d1620"
    });
    var nameplate = new THREE.Mesh(
      new THREE.PlaneGeometry(g.w * 0.2, wallH * 0.24),
      new THREE.MeshStandardMaterial({ map: nameplateTex, roughness: 0.6, metalness: 0.1 })
    );
    nameplate.position.set(g.x - doorSide * g.w * 0.3, wallH * 0.62, g.z + halfD - wallT * 0.15);
    addPart(group, list, nameplate, false, false);

    // 北墙：裙墙 + 窗洞（无网格，只留玻璃）+ 檐墙。
    var sillH = wallH * 0.22;
    var lintelH = wallH * 0.16;
    var northZ = g.z - halfD + wallT / 2;
    addPart(group, list, box(THREE, materials.wall, g.w, sillH, wallT, g.x, sillH / 2, northZ), true, true);
    addPart(group, list, box(THREE, materials.wall, g.w, lintelH, wallT, g.x, wallH - lintelH / 2, northZ), true, true);
    var glass = new THREE.Mesh(
      new THREE.PlaneGeometry(g.w * 0.88, wallH - sillH - lintelH),
      materials.viewGlass
    );
    glass.position.set(g.x, sillH + (wallH - sillH - lintelH) / 2, northZ - wallT / 2 - 0.05);
    addPart(group, list, glass, false, false);

    // 东西两侧墙。
    addPart(group, list, box(THREE, materials.wall, wallT, wallH, g.d, g.x - halfW + wallT / 2, wallH / 2, g.z), true, true);
    addPart(group, list, box(THREE, materials.wall, wallT, wallH, g.d, g.x + halfW - wallT / 2, wallH / 2, g.z), true, true);

    // 屋顶，略出檐。
    addPart(group, list, box(THREE, materials.roof, g.w + 4, wallH * 0.06, g.d + 4, g.x, wallH + wallH * 0.03, g.z), true, true);

    // 四角立柱（InstancedMesh，1 次 draw call 覆盖 4 根）。
    var corners = [
      [g.x - halfW + wallT * 0.6, g.z - halfD + wallT * 0.6],
      [g.x + halfW - wallT * 0.6, g.z - halfD + wallT * 0.6],
      [g.x - halfW + wallT * 0.6, g.z + halfD - wallT * 0.6],
      [g.x + halfW - wallT * 0.6, g.z + halfD - wallT * 0.6]
    ];
    var columnMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.55, 0.55, wallH, 8), materials.metal.stainless.clone(), 4);
    var cm = new THREE.Matrix4();
    corners.forEach(function (c, i) {
      cm.identity();
      cm.setPosition(c[0], wallH / 2, c[1]);
      columnMesh.setMatrixAt(i, cm);
    });
    columnMesh.instanceMatrix.needsUpdate = true;
    columnMesh.castShadow = true;
    columnMesh.receiveShadow = true;
    group.add(columnMesh);
    list.push(columnMesh);

    // 室内补光：engine.js 的场景光照（HemisphereLight + 3 个 DirectionalLight）都是
    // 为"站场室外"设计的方向光，照不进这栋建筑刻意做窄小的窗洞——没有这盏灯，
    // 北墙窗洞后面的机柜/操作台会因为采光不足而糊成一片近黑，"内部可见"就
    // 只剩个名义。这里加一盏不投射阴影的 PointLight（castShadow 默认 false，
    // 不参与 engine.js 那次一次性阴影贴图烘焙，不增加 draw call），只负责把
    // 室内的家具亮度提到能看清造型的水平，供 *Interior() 系列函数摆放的家具
    // 使用。不 push 进 list——list 里的元素会被 engine.js 的 cacheAndApplySelection
    // 当作 Mesh 读取 .material，PointLight 没有这个属性，混进去会在选中该区域时
    // 抛错。
    var interiorLight = new THREE.PointLight(0xbfe9f5, 2.4, Math.max(g.w, g.d) * 1.1, 2);
    interiorLight.position.set(g.x, wallH * 0.62, g.z - g.d * 0.12);
    group.add(interiorLight);

    return {
      wallH: wallH,
      wallT: wallT,
      interiorMinX: g.x - halfW + wallT * 1.4,
      interiorMaxX: g.x + halfW - wallT * 1.4,
      interiorZ: northZ + wallT * 1.8
    };
  }

  // 机柜间室内家具：10 列机柜阵列（InstancedMesh，1 次 draw call）+ 每列顶部一条
  // 状态色 LED 指示条（复用 materials.status.ok，与区域"正常"状态语义一致，也是
  // 全站巡检项最多的区域——67 项，见 station.js devices 字段）+ 顶部空调冷媒管
  // （沿墙走一段细管）。
  function cabinetInterior(THREE, materials, group, list, area, shell) {
    var g = area.geom;
    var count = 10;
    var rackW = 3.0;
    var rackD = 3.2;
    var rackH = shell.wallH * 0.6;
    var span = (shell.interiorMaxX - shell.interiorMinX) * 0.94;
    var startX = g.x - span / 2;
    var stepX = span / (count - 1);
    var z = shell.interiorZ;

    var rackMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(rackW, rackH, rackD), materials.metal.cabinet.clone(), count);
    var ledMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(rackW * 0.72, rackH * 0.04, 0.2), materials.status.ok.clone(), count);
    var m = new THREE.Matrix4();
    var i;
    for (i = 0; i < count; i += 1) {
      var x = startX + i * stepX;
      m.identity();
      m.setPosition(x, rackH / 2, z);
      rackMesh.setMatrixAt(i, m);
      m.identity();
      m.setPosition(x, rackH * 0.94, z - rackD / 2 - 0.12);
      ledMesh.setMatrixAt(i, m);
    }
    rackMesh.instanceMatrix.needsUpdate = true;
    ledMesh.instanceMatrix.needsUpdate = true;
    rackMesh.castShadow = true;
    rackMesh.receiveShadow = true;
    group.add(rackMesh); list.push(rackMesh);
    group.add(ledMesh); list.push(ledMesh);

    // 顶部空调冷媒管：贴着屋顶下方走一段细管，两端各接一个凝汽罐（复用 pipe 材质）。
    var condenserY = shell.wallH + shell.wallH * 0.15;
    var condenser = box(THREE, materials.metal.cabinet, 3.2, shell.wallH * 0.16, 1.6, g.x + g.w * 0.32, condenserY, g.z);
    addPart(group, list, condenser, true, false);
  }

  // 配电间室内家具：高压开关柜列（3 台，35/10/400V）+ 低压配电柜（2 台）+ 电缆沟
  // 盖板（1 条，贴地）。
  function powerInterior(THREE, materials, group, list, area, shell) {
    var g = area.geom;
    var z = shell.interiorZ;
    var hvCount = 3;
    var hvW = 4.2;
    var hvH = shell.wallH * 0.7;
    var hvSpan = (shell.interiorMaxX - shell.interiorMinX) * 0.5;
    var hvStep = hvSpan / (hvCount - 1);
    var hvStartX = g.x - g.w * 0.28 - hvSpan / 2;
    var hvMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(hvW, hvH, 3.2), materials.metal.cabinet.clone(), hvCount);
    var m = new THREE.Matrix4();
    var i;
    for (i = 0; i < hvCount; i += 1) {
      m.identity();
      m.setPosition(hvStartX + i * hvStep, hvH / 2, z);
      hvMesh.setMatrixAt(i, m);
    }
    hvMesh.instanceMatrix.needsUpdate = true;
    hvMesh.castShadow = true;
    hvMesh.receiveShadow = true;
    group.add(hvMesh); list.push(hvMesh);

    var lvCount = 2;
    var lvH = shell.wallH * 0.5;
    var lvSpan = (shell.interiorMaxX - shell.interiorMinX) * 0.28;
    var lvStep = lvSpan / (lvCount - 1);
    var lvStartX = g.x + g.w * 0.22 - lvSpan / 2;
    var lvMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(3.4, lvH, 2.8), materials.metal.cabinet.clone(), lvCount);
    for (i = 0; i < lvCount; i += 1) {
      m.identity();
      m.setPosition(lvStartX + i * lvStep, lvH / 2, z);
      lvMesh.setMatrixAt(i, m);
    }
    lvMesh.instanceMatrix.needsUpdate = true;
    lvMesh.castShadow = true;
    lvMesh.receiveShadow = true;
    group.add(lvMesh); list.push(lvMesh);

    var trench = box(THREE, materials.basin, (shell.interiorMaxX - shell.interiorMinX) * 0.9, 0.2, 2.0, g.x, 0.1, g.z);
    addPart(group, list, trench, false, true);
  }

  // 站控室室内家具：操作台 + 站控机双屏（screenGlow 自发光）+ 工业电视监视墙
  // （2x3 网格，InstancedMesh）+ 配电箱。
  function controlInterior(THREE, materials, group, list, area, shell) {
    var g = area.geom;
    var z = shell.interiorZ;
    var desk = box(THREE, materials.metal.cabinet, g.w * 0.24, shell.wallH * 0.22, 3.6, g.x, shell.wallH * 0.11, z + 3);
    addPart(group, list, desk, true, true);

    var screenW = g.w * 0.06;
    var screenH = shell.wallH * 0.16;
    var screen1 = box(THREE, materials.screenGlow, screenW, screenH, 0.3, g.x - g.w * 0.035, shell.wallH * 0.32, z + 1.2);
    var screen2 = box(THREE, materials.screenGlow, screenW, screenH, 0.3, g.x + g.w * 0.035, shell.wallH * 0.32, z + 1.2);
    addPart(group, list, screen1, false, false);
    addPart(group, list, screen2, false, false);

    var wallCols = 3;
    var wallRows = 2;
    var cellW = g.w * 0.09;
    var cellH = shell.wallH * 0.13;
    var wallSpanX = cellW * (wallCols - 1) * 1.3;
    var wallStartX = g.x - g.w * 0.32 - wallSpanX / 2;
    var monitorMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(cellW, cellH, 0.2), materials.screenGlow.clone(), wallCols * wallRows);
    var m = new THREE.Matrix4();
    var idx = 0;
    var r, c;
    for (r = 0; r < wallRows; r += 1) {
      for (c = 0; c < wallCols; c += 1) {
        m.identity();
        m.setPosition(
          wallStartX + c * cellW * 1.3,
          shell.wallH * 0.55 + r * cellH * 1.25,
          shell.interiorZ - shell.wallT * 0.3
        );
        monitorMesh.setMatrixAt(idx, m);
        idx += 1;
      }
    }
    monitorMesh.instanceMatrix.needsUpdate = true;
    group.add(monitorMesh); list.push(monitorMesh);

    var panel = box(THREE, materials.metal.cabinet, 2.2, shell.wallH * 0.4, 1.4, g.x + g.w * 0.32, shell.wallH * 0.2, z);
    addPart(group, list, panel, true, true);
  }

  // UPS 室室内家具：UPS 控制机柜（2 台）+ 蓄电池架（2 排 x 3 层，InstancedMesh）。
  function upsInterior(THREE, materials, group, list, area, shell) {
    var g = area.geom;
    var z = shell.interiorZ;
    var upsH = shell.wallH * 0.55;
    var upsMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(2.6, upsH, 2.4), materials.metal.cabinet.clone(), 2);
    var m = new THREE.Matrix4();
    m.identity(); m.setPosition(g.x - g.w * 0.26, upsH / 2, z);
    upsMesh.setMatrixAt(0, m);
    m.identity(); m.setPosition(g.x - g.w * 0.26 + 3.2, upsH / 2, z);
    upsMesh.setMatrixAt(1, m);
    upsMesh.instanceMatrix.needsUpdate = true;
    upsMesh.castShadow = true;
    upsMesh.receiveShadow = true;
    group.add(upsMesh); list.push(upsMesh);

    var tiers = 3;
    var cols = 4;
    var cellW = 1.6;
    var tierH = shell.wallH * 0.13;
    var rackStartX = g.x + g.w * 0.06;
    var batteryMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(cellW * 0.86, tierH * 0.8, 1.2), materials.metal.pipe.clone(), tiers * cols);
    var idx = 0;
    var t, c;
    for (t = 0; t < tiers; t += 1) {
      for (c = 0; c < cols; c += 1) {
        m.identity();
        m.setPosition(rackStartX + c * cellW, tierH * 0.5 + t * tierH, z);
        batteryMesh.setMatrixAt(idx, m);
        idx += 1;
      }
    }
    batteryMesh.instanceMatrix.needsUpdate = true;
    batteryMesh.castShadow = true;
    group.add(batteryMesh); list.push(batteryMesh);
  }

  // ---------------------------------------------------------------------
  // 12 区各自的设备造型（按 areaId 分派，geom/devices 全部现场读取，不重复定义坐标）
  // ---------------------------------------------------------------------

  var AREA_BUILDERS = {
    // 进、出站区：两条汇管（带支腿）+ 5 台气液联动阀执行机构（阀体+气缸）+ 电控单元箱。
    gate: function (THREE, materials, group, list, area) {
      var g = area.geom;
      var elev = exaggerateHeight(2.2);
      var manifold1 = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, g.w * 0.7, 16), materials.metal.pipe.clone());
      manifold1.rotation.z = Math.PI / 2;
      manifold1.position.set(g.x, elev, g.z - g.d * 0.22);
      addPart(group, list, manifold1, true, true);
      var manifold2 = manifold1.clone();
      manifold2.material = materials.metal.pipe.clone();
      manifold2.position.z = g.z + g.d * 0.22;
      addPart(group, list, manifold2, true, true);

      // 两条汇管的支腿合并成 1 个 InstancedMesh（8 条支腿只占 1 次 draw call，
      // 见 instancedBoxAt 的注释）。
      var legH = elev;
      var legSpacing = g.w * 0.18;
      var legStart = -(3 * legSpacing) / 2;
      var legPositions = [];
      var li;
      for (li = 0; li < 4; li += 1) {
        legPositions.push([g.x + legStart + li * legSpacing, legH / 2, g.z - g.d * 0.22]);
        legPositions.push([g.x + legStart + li * legSpacing, legH / 2, g.z + g.d * 0.22]);
      }
      var legs = instancedBoxAt(THREE, materials.metal.pad.clone(), [0.5, legH, 0.5], legPositions);
      group.add(legs); list.push(legs);

      var valveH = exaggerateHeight(2.0);
      var valves = instancedBoxCluster(THREE, materials.metal.cabinet.clone(), 5, [1.6, valveH, 1.4], g.w * 0.16, g.x, valveH / 2, g.z);
      group.add(valves); list.push(valves);

      // 气缸（气液联动阀执行机构的标志性部件）：每台阀顶部一根横向气缸筒。
      var actuators = instancedCylinderCluster(
        THREE, materials.metal.stainless.clone(), 5, 0.35, 0.35, exaggerateHeight(1.4), 10,
        g.w * 0.16, g.x, valveH + exaggerateHeight(0.7), g.z
      );
      actuators.rotation.z = Math.PI / 2;
      group.add(actuators); list.push(actuators);

      var cabinetH = exaggerateHeight(1.6);
      var cabinets = instancedBoxCluster(THREE, materials.warnStripe.clone(), 3, [1.2, cabinetH, 1.0], g.w * 0.2, g.x - g.w * 0.3, cabinetH / 2, g.z - g.d * 0.35);
      group.add(cabinets); list.push(cabinets);
    },

    // 过滤分离区：3 台立式过滤分离器（带底座+顶部排放短管）+ 连接集气管。
    filter: function (THREE, materials, group, list, area) {
      var g = area.geom;
      var xs = [-g.w * 0.28, 0, g.w * 0.28];
      var tankH = exaggerateHeight(g.h * 0.75);
      xs.forEach(function (dx) {
        var tank = verticalTank(THREE, materials, 2.0, tankH, 0);
        tank.position.set(g.x + dx, 0, g.z);
        group.add(tank);
        tank.children.forEach(function (mesh) { list.push(mesh); });
      });

      var padH = exaggerateHeight(0.5);
      var pads = instancedBoxCluster(THREE, materials.metal.pad.clone(), 3, [2.6, padH, 2.6], g.w * 0.28, g.x, padH / 2, g.z);
      group.add(pads); list.push(pads);

      var nozzles = instancedCylinderCluster(THREE, materials.metal.stainless.clone(), 3, 0.35, 0.35, exaggerateHeight(1.2), 10, g.w * 0.28, g.x, tankH + exaggerateHeight(0.6), g.z);
      group.add(nozzles); list.push(nozzles);

      var header = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, g.w * 0.56, 14), materials.metal.pipe.clone());
      header.rotation.z = Math.PI / 2;
      header.position.set(g.x, exaggerateHeight(1.5), g.z - g.d * 0.3);
      addPart(group, list, header, true, true);
    },

    // 计量区：3 路并联的超声波流量计直管段（每路带一个流量变送器表体）+ 计量配电盘。
    metering: function (THREE, materials, group, list, area) {
      var g = area.geom;
      var zs = [-g.d * 0.22, 0, g.d * 0.22];
      var elev = exaggerateHeight(1.4);
      zs.forEach(function (dz) {
        var run = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, g.w * 0.7, 16), materials.metal.stainless.clone());
        run.rotation.z = Math.PI / 2;
        run.position.set(g.x, elev, g.z + dz);
        addPart(group, list, run, true, true);
      });

      var transmitterH = exaggerateHeight(1.1);
      var transmitters = instancedBoxClusterZ(THREE, materials.metal.cabinet.clone(), 3, [0.9, transmitterH, 0.7], g.d * 0.22, g.x, elev + exaggerateHeight(0.85), g.z);
      group.add(transmitters); list.push(transmitters);

      var cabinetH = exaggerateHeight(2.4);
      var cabinet = box(THREE, materials.metal.cabinet, 2.2, cabinetH, 1.4, g.x - g.w * 0.32, cabinetH / 2, g.z - g.d * 0.32);
      addPart(group, list, cabinet, true, true);
    },

    // 调压区：2 台调压橇（撬装框架+调压阀体+指挥器）+ 2 台卧式防爆电加热器。
    regulate: function (THREE, materials, group, list, area) {
      var g = area.geom;
      var padH = exaggerateHeight(0.6);
      var riserH = exaggerateHeight(2.6);
      var valveH = exaggerateHeight(1.4);
      // 两台撬装框架的支腿合并成 1 个 InstancedMesh（8 条支腿只占 1 次 draw call，
      // 见 instancedBoxAt 的注释），其余每台各自的竖管/阀体/指挥器仍然分开摆放。
      var legPositions = [];
      [-1, 1].forEach(function (side) {
        var skidX = g.x + side * g.w * 0.24;
        var skidZ = g.z - g.d * 0.18;
        var legOffsets = [-1.3, 1.3];
        legOffsets.forEach(function (dx) {
          legOffsets.forEach(function (dz) {
            legPositions.push([skidX + dx, padH * 0.8, skidZ + dz]);
          });
        });
      });
      var legs = instancedBoxAt(THREE, materials.metal.stainless.clone(), [0.28, padH * 1.6, 0.28], legPositions);
      group.add(legs); list.push(legs);

      [-1, 1].forEach(function (side) {
        var skidX = g.x + side * g.w * 0.24;
        var skidZ = g.z - g.d * 0.18;
        var skidBase = box(THREE, materials.metal.pad, 3.2, padH, 3.2, skidX, padH / 2, skidZ);
        addPart(group, list, skidBase, true, true);

        var riser = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, riserH, 12), materials.metal.pipe.clone());
        riser.position.set(skidX, padH + riserH / 2, skidZ);
        addPart(group, list, riser, true, true);

        // 调压阀体：横向箱体挂在竖管中段。
        var valveBody = box(THREE, materials.metal.cabinet, 1.8, valveH, 1.2, skidX, padH + riserH * 0.55, skidZ);
        addPart(group, list, valveBody, true, true);

        // 指挥器：阀体顶部一根细圆柱。
        var pilot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, exaggerateHeight(0.9), 8), materials.metal.stainless.clone());
        pilot.position.set(skidX + 0.6, padH + riserH * 0.55 + valveH / 2 + exaggerateHeight(0.45), skidZ);
        addPart(group, list, pilot, true, false);

        var tank = horizontalTank(THREE, materials, 1.1, 3.4, 1.3);
        tank.position.set(skidX, 0, g.z + g.d * 0.2);
        group.add(tank);
        tank.children.forEach(function (mesh) { list.push(mesh); });
      });
    },

    // 放空区：高杆放空立管（顶部火炬头）+ 三向拉线 + 点火控制盘落地柜 + 独立围栏。
    vent: function (THREE, materials, group, list, area) {
      var g = area.geom;
      // 立管本体改用高反光的 stainless 材质（原来的 pipe 材质偏暗灰，站在深色
      // 沙盘地面/天空渐变背景前几乎融进背景，配合俯视角度会被压缩成一条不起眼
      // 的细线）+ 一道航空警示色警示环（warnStripe，工程惯例：细高构筑物在腰部
      // 加一道醒目色警示环），两者叠加才能让"全站最高的构筑物"在远景里也读得出来。
      var stackH = exaggerateHeight(g.h * 0.85);
      var stack = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.85, stackH, 14), materials.metal.stainless.clone());
      stack.position.set(g.x, stackH / 2, g.z);
      addPart(group, list, stack, true, true);

      var warnBand = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, stackH * 0.08, 14), materials.warnStripe.clone());
      warnBand.position.set(g.x, stackH * 0.62, g.z);
      addPart(group, list, warnBand, false, true);

      var flareTip = new THREE.Mesh(new THREE.ConeGeometry(0.9, exaggerateHeight(1.3), 10), materials.flare.clone());
      flareTip.position.set(g.x, stackH + exaggerateHeight(0.65), g.z);
      addPart(group, list, flareTip, true, false);

      var anchorR = Math.min(g.w, g.d) * 0.32;
      var i;
      for (i = 0; i < 3; i += 1) {
        var angle = (i * 2 * Math.PI) / 3;
        var ax = g.x + Math.cos(angle) * anchorR;
        var az = g.z + Math.sin(angle) * anchorR;
        var curve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(g.x, stackH * 0.92, g.z),
          new THREE.Vector3(ax, 0.1, az)
        ]);
        var guy = new THREE.Mesh(new THREE.TubeGeometry(curve, 6, 0.05, 5, false), materials.guy.clone());
        addPart(group, list, guy, false, false);
      }

      var cabinetH = exaggerateHeight(1.8);
      var cabinet = box(THREE, materials.metal.cabinet, 1.4, cabinetH, 1.0, g.x + g.w * 0.28, cabinetH / 2, g.z + g.d * 0.2);
      addPart(group, list, cabinet, true, true);

      var fence = new THREE.Mesh(
        new THREE.TorusGeometry(Math.min(g.w, g.d) * 0.42, 0.06, 6, 24),
        materials.warnStripe.clone()
      );
      fence.rotation.x = Math.PI / 2;
      fence.position.set(g.x, exaggerateHeight(0.6), g.z);
      addPart(group, list, fence, false, false);
    },

    // 排污区：1 台卧式排污罐（滑动端支座）+ 2 台排污滑片泵（带电机）+ 敞口排污池。
    blowdown: function (THREE, materials, group, list, area) {
      var g = area.geom;
      var tank = horizontalTank(THREE, materials, 1.6, g.w * 0.45, 1.8);
      tank.position.set(g.x - g.w * 0.12, 0, g.z - g.d * 0.2);
      group.add(tank);
      tank.children.forEach(function (mesh) { list.push(mesh); });

      var supportH = exaggerateHeight(0.5);
      var supports = instancedBoxCluster(THREE, materials.metal.pad.clone(), 2, [1.0, supportH, 2.6], g.w * 0.35, g.x - g.w * 0.12, supportH / 2, g.z - g.d * 0.2);
      group.add(supports); list.push(supports);

      var pumpH = exaggerateHeight(1.0);
      var pumps = instancedBoxCluster(THREE, materials.metal.pipe.clone(), 2, [1.0, pumpH, 1.4], 2.2, g.x + g.w * 0.22, pumpH / 2, g.z - g.d * 0.2);
      group.add(pumps); list.push(pumps);

      var motors = instancedCylinderCluster(THREE, materials.metal.stainless.clone(), 2, 0.42, 0.42, exaggerateHeight(0.8), 10, 2.2, g.x + g.w * 0.22, pumpH + exaggerateHeight(0.4), g.z - g.d * 0.2);
      motors.rotation.x = Math.PI / 2;
      group.add(motors); list.push(motors);

      var gauge = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, exaggerateHeight(1.6), 8), materials.metal.stainless.clone());
      gauge.position.set(g.x - g.w * 0.12 + 2.0, exaggerateHeight(0.8), g.z - g.d * 0.2 + 1.8);
      addPart(group, list, gauge, false, false);

      var basin = box(THREE, materials.basin, g.w * 0.4, 0.3, g.d * 0.3, g.x, 0.15, g.z + g.d * 0.25);
      addPart(group, list, basin, false, true);
    },

    // 机柜间：中空建筑外壳 + 10 列室内机柜阵列（透过北墙窗洞可见）。
    cabinet: function (THREE, materials, group, list, area) {
      var shell = buildRoomShell(THREE, materials, group, list, area, false);
      cabinetInterior(THREE, materials, group, list, area, shell);
    },

    // 配电间：中空建筑外壳 + 高/低压开关柜列 + 2 台油浸式变压器（外置于建筑南侧）。
    power: function (THREE, materials, group, list, area) {
      var shell = buildRoomShell(THREE, materials, group, list, area, true);
      powerInterior(THREE, materials, group, list, area, shell);
      var g = area.geom;
      var tankH = exaggerateHeight(2.4);
      [-1, 1].forEach(function (side) {
        var tank = verticalTank(THREE, materials, 1.2, tankH, 0);
        tank.position.set(g.x + side * g.w * 0.32, 0, g.z + g.d / 2 + 6);
        group.add(tank);
        tank.children.forEach(function (mesh) { list.push(mesh); });
      });
    },

    // 站控室：中空建筑外壳 + 操作台/监视墙等室内家具 + 屋顶天线杆（监控/通信）。
    control: function (THREE, materials, group, list, area) {
      var shell = buildRoomShell(THREE, materials, group, list, area, true);
      controlInterior(THREE, materials, group, list, area, shell);
      var g = area.geom;
      var mast = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.18, exaggerateHeight(3.2), 8), materials.metal.stainless.clone());
      mast.position.set(g.x - g.w * 0.3, shell.wallH + exaggerateHeight(1.6), g.z);
      addPart(group, list, mast, true, false);
    },

    // 发电机棚：敞开式棚（4 立柱 + 顶板，无外墙）+ 内部机组 + 排烟管。
    genset: function (THREE, materials, group, list, area) {
      var g = area.geom;
      var postH = exaggerateHeight(g.h);
      var corners = [
        [g.x - g.w * 0.42, g.z - g.d * 0.42],
        [g.x + g.w * 0.42, g.z - g.d * 0.42],
        [g.x - g.w * 0.42, g.z + g.d * 0.42],
        [g.x + g.w * 0.42, g.z + g.d * 0.42]
      ];
      var postMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.25, 0.25, postH, 8), materials.shed.clone(), 4);
      var m = new THREE.Matrix4();
      corners.forEach(function (c, i) {
        m.identity();
        m.setPosition(c[0], postH / 2, c[1]);
        postMesh.setMatrixAt(i, m);
      });
      postMesh.instanceMatrix.needsUpdate = true;
      postMesh.castShadow = true;
      postMesh.receiveShadow = true;
      group.add(postMesh); list.push(postMesh);

      var roof = box(THREE, materials.roof, g.w * 0.92, postH * 0.05, g.d * 0.92, g.x, postH + postH * 0.025, g.z);
      addPart(group, list, roof, true, true);
      var genBodyH = postH * 0.4;
      var genBody = box(THREE, materials.metal.cabinet, g.w * 0.4, genBodyH, g.d * 0.35, g.x, genBodyH / 2, g.z);
      addPart(group, list, genBody, true, true);
      var exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, postH * 0.6, 10), materials.metal.stainless.clone());
      exhaust.position.set(g.x + g.w * 0.2, genBodyH + postH * 0.3, g.z - g.d * 0.2);
      addPart(group, list, exhaust, true, false);
    },

    // UPS 室：中空建筑外壳 + UPS 控制机柜/蓄电池架室内家具。
    ups: function (THREE, materials, group, list, area) {
      var shell = buildRoomShell(THREE, materials, group, list, area, false);
      upsInterior(THREE, materials, group, list, area, shell);
    },

    // 收发球区：2 座卧式收发球筒（各带端部快开盲板 + 收发球架支座）。
    launcher: function (THREE, materials, group, list, area) {
      var g = area.geom;
      var drumLength = g.w * 0.36;
      [-1, 1].forEach(function (side) {
        var drum = horizontalTank(THREE, materials, 1.3, drumLength, 1.6);
        drum.position.set(g.x + side * g.w * 0.24, 0, g.z);
        group.add(drum);
        drum.children.forEach(function (mesh) { list.push(mesh); });

        // 端部快开盲板：比罐体略粗的短圆盘，贴在两端封头外侧。
        var flangeMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(1.45, 1.45, 0.3, 16), materials.metal.stainless.clone(), 2);
        var fm = new THREE.Matrix4();
        var q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
        fm.compose(new THREE.Vector3(g.x + side * g.w * 0.24 - drumLength / 2, 1.6, g.z), q, new THREE.Vector3(1, 1, 1));
        flangeMesh.setMatrixAt(0, fm);
        fm.compose(new THREE.Vector3(g.x + side * g.w * 0.24 + drumLength / 2, 1.6, g.z), q, new THREE.Vector3(1, 1, 1));
        flangeMesh.setMatrixAt(1, fm);
        flangeMesh.instanceMatrix.needsUpdate = true;
        flangeMesh.castShadow = true;
        group.add(flangeMesh); list.push(flangeMesh);

        // 收发球架支座：两条滑动支座垫块。
        var saddleH = exaggerateHeight(0.5);
        var saddles = instancedBoxClusterZ(THREE, materials.metal.pad.clone(), 2, [1.6, saddleH, 1.0], drumLength * 0.5, g.x + side * g.w * 0.24, saddleH / 2, g.z);
        group.add(saddles); list.push(saddles);
      });

      var rackH = exaggerateHeight(1.2);
      var rack = box(THREE, materials.metal.cabinet, 1.6, rackH, 1.0, g.x, rackH / 2, g.z + g.d * 0.32);
      addPart(group, list, rack, true, true);
    }
  };

  function buildArea(THREE, materials, group, areaMeshes, area) {
    var list = areaMeshes[area.id];
    var builder = AREA_BUILDERS[area.id];
    if (!builder) throw new Error("[Map3DModel] 区域 " + area.id + " 没有对应的造型构建函数");
    builder(THREE, materials, group, list, area);
    // anchors 必须用夸张后的高度：热点悬浮在"放大之后的区块顶面"上方，不是
    // station.js 里的真实矮高度——否则热点/标签会插进被放大后的体块内部
    // （见文件头"① 垂直夸张系数"最后一句）。
    return new THREE.Vector3(area.geom.x, exaggerateHeight(area.geom.h), area.geom.z);
  }

  // ---------------------------------------------------------------------
  // 250 个巡检点位：按状态分 3 组的 InstancedMesh
  // ---------------------------------------------------------------------

  function createItemPins(THREE, materials) {
    var Contract = requireContract();
    var capacity = Contract.TOTAL_ITEMS;
    var geometry = new THREE.SphereGeometry(0.55, 8, 6);
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

    // 现场按 window.DemoItems 的当前内容重建 3 组矩阵缓冲。位置用 item.id 的确定性
    // 哈希在所属区域footprint 内散布（留 12% 边距，避免点位贴在墙上/围栏外）；
    // 高度取该区（夸张后）高度的一半（夹在 [0.9, 3.2] 的夸张倍数内），代表设备
    // 腰线高度的巡检点位，不是贴地也不是探出屋顶——建筑体量被 exaggerateHeight()
    // 放大之后，巡检点位的悬浮高度必须跟着放大同一个系数，否则点位会显得贴在
    // 放大后建筑的地基附近，读不出"悬浮在设备腰线"的意图。
    function refresh(areaDefsById) {
      var counters = { ok: 0, warn: 0, danger: 0 };
      var m = new THREE.Matrix4();
      Contract.AREA_IDS.forEach(function (areaId) {
        var items = window.DemoItems[areaId];
        if (!Array.isArray(items)) {
          throw new Error("[Map3DModel] window.DemoItems." + areaId + " 未加载，无法刷新巡检点位");
        }
        var def = areaDefsById[areaId];
        var g = def.geom;
        var marginX = g.w * 0.12;
        var marginZ = g.d * 0.12;
        var y = Math.min(exaggerateHeight(3.2), Math.max(exaggerateHeight(0.9), exaggerateHeight(g.h) * 0.5));
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
    group.name = "map3d-sandbox";

    buildGround(THREE, materials, group, station);

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
      // 调用，重建 3 组巡检点位——见文件头"状态变更退化成换组"的说明。
      refreshItemPins: function () { itemPins.refresh(areaDefsById); }
    };
  }

  window.Map3DModel = {
    createMaterials: createMaterials,
    build: build
  };
})();
