// 站场 3D 巡检地图——程序化三维沙盘模型：window.Map3DModel。
//
// 与 scripts/pump3d/model.js 同构的两调用契约（engine.js 按同样的方式消费）：
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
// 视觉风格延续 scripts/pump3d/model.js：PBR MeshStandardMaterial + 程序化
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
      glass: new THREE.MeshPhysicalMaterial({
        color: "#38c6ec", roughness: 0.2, metalness: 0.1,
        transparent: true, opacity: 0.38, emissive: "#123a44", emissiveIntensity: 0.4
      }),
      shed: new THREE.MeshStandardMaterial({ color: "#4a5862", roughness: 0.65, metalness: 0.25 }),
      guy: new THREE.MeshStandardMaterial({ color: "#c4d0d6", roughness: 0.3, metalness: 0.85 }),
      warnStripe: new THREE.MeshStandardMaterial({ color: "#eeb44a", roughness: 0.5, metalness: 0.1 }),
      basin: new THREE.MeshStandardMaterial({ color: "#0f1a20", roughness: 0.95, metalness: 0.0 })
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
  // 上半球即可）。
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

  // 卧式圆柱罐体，两端半球封头，长轴沿世界 X。
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

  function box(THREE, material, w, h, d, x, y, z) {
    var mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    return mesh;
  }

  // ---------------------------------------------------------------------
  // 室内建筑（control/cabinet/ups/power 四块 x 边界精确相接，同一栋综合值班楼）
  // ---------------------------------------------------------------------

  function buildRoomBuilding(THREE, materials, group, list, area, doorAtEast) {
    var g = area.geom;
    var wallH = g.h;
    var wall = box(THREE, materials.wall, g.w, wallH, g.d, g.x, wallH / 2, g.z);
    addPart(group, list, wall, true, true);
    var roof = box(THREE, materials.roof, g.w + 4, 0.4, g.d + 4, g.x, wallH + 0.2, g.z);
    addPart(group, list, roof, true, true);

    // 朝北（走廊 A/B 一侧，z 更小）的玻璃窗带 + 铭牌，供从站场主通道方向识别建筑。
    var glassStrip = box(THREE, materials.glass, g.w * 0.6, wallH * 0.4, 0.3, g.x, wallH * 0.55, g.z - g.d / 2 - 0.05);
    addPart(group, list, glassStrip, false, false);

    var nameplateTex = window.Map3DShared.buildNameplateTexture(THREE, { title: area.name, lines: [area.short] }, {
      width: 220, height: 120, bg: "#c7d3d8", ink: "#0d1620"
    });
    var nameplate = new THREE.Mesh(
      new THREE.PlaneGeometry(g.w * 0.28, wallH * 0.32),
      new THREE.MeshStandardMaterial({ map: nameplateTex, roughness: 0.6, metalness: 0.1 })
    );
    nameplate.position.set(g.x + (doorAtEast ? g.w * 0.18 : -g.w * 0.18), wallH * 0.6, g.z - g.d / 2 - 0.06);
    addPart(group, list, nameplate, false, false);

    // 门（南侧，朝巡检道一侧，z 更大）。
    var door = box(THREE, materials.roof, g.w * 0.16, wallH * 0.55, 0.3, g.x, wallH * 0.275, g.z + g.d / 2 + 0.05);
    addPart(group, list, door, false, false);

    return new THREE.Vector3(g.x, g.h, g.z);
  }

  // ---------------------------------------------------------------------
  // 12 区各自的设备造型（按 areaId 分派，geom/devices 全部现场读取，不重复定义坐标）
  // ---------------------------------------------------------------------

  var AREA_BUILDERS = {
    // 进、出站区：两条汇管 + ESDV 阀门簇 + 电控单元箱。
    gate: function (THREE, materials, group, list, area) {
      var g = area.geom;
      var manifold1 = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, g.w * 0.7, 16), materials.metal.pipe.clone());
      manifold1.rotation.z = Math.PI / 2;
      manifold1.position.set(g.x, 2.2, g.z - g.d * 0.22);
      addPart(group, list, manifold1, true, true);
      var manifold2 = manifold1.clone();
      manifold2.material = materials.metal.pipe.clone();
      manifold2.position.z = g.z + g.d * 0.22;
      addPart(group, list, manifold2, true, true);

      var valves = instancedBoxCluster(THREE, materials.metal.cabinet.clone(), 5, [1.6, 2.0, 1.4], g.w * 0.16, g.x, 1.0, g.z);
      group.add(valves);
      list.push(valves);

      var cabinets = instancedBoxCluster(THREE, materials.warnStripe.clone(), 3, [1.2, 1.6, 1.0], g.w * 0.2, g.x - g.w * 0.3, 0.8, g.z - g.d * 0.35);
      group.add(cabinets);
      list.push(cabinets);
    },

    // 过滤分离区：3 台立式过滤分离器。
    filter: function (THREE, materials, group, list, area) {
      var g = area.geom;
      var xs = [-g.w * 0.28, 0, g.w * 0.28];
      xs.forEach(function (dx) {
        var tank = verticalTank(THREE, materials, 2.0, g.h * 0.75, 0);
        tank.position.set(g.x + dx, 0, g.z);
        group.add(tank);
        tank.children.forEach(function (mesh) { list.push(mesh); });
      });
    },

    // 计量区：3 路并联的超声波流量计直管段。
    metering: function (THREE, materials, group, list, area) {
      var g = area.geom;
      var zs = [-g.d * 0.22, 0, g.d * 0.22];
      zs.forEach(function (dz) {
        var run = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, g.w * 0.7, 16), materials.metal.stainless.clone());
        run.rotation.z = Math.PI / 2;
        run.position.set(g.x, 1.4, g.z + dz);
        addPart(group, list, run, true, true);
      });
      var cabinet = box(THREE, materials.metal.cabinet, 2.2, 2.4, 1.4, g.x - g.w * 0.32, 1.2, g.z - g.d * 0.32);
      addPart(group, list, cabinet, true, true);
    },

    // 调压区：2 台调压橇 + 2 台卧式电加热器。
    regulate: function (THREE, materials, group, list, area) {
      var g = area.geom;
      [-1, 1].forEach(function (side) {
        var skidX = g.x + side * g.w * 0.24;
        var skidBase = box(THREE, materials.metal.pad, 3.2, 0.6, 3.2, skidX, 0.3, g.z - g.d * 0.18);
        addPart(group, list, skidBase, true, true);
        var riser = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 2.6, 12), materials.metal.pipe.clone());
        riser.position.set(skidX, 1.9, g.z - g.d * 0.18);
        addPart(group, list, riser, true, true);
        var tank = horizontalTank(THREE, materials, 1.1, 3.4, 1.3);
        tank.position.set(skidX, 0, g.z + g.d * 0.2);
        group.add(tank);
        tank.children.forEach(function (mesh) { list.push(mesh); });
      });
    },

    // 放空区：高杆放空立管 + 三向拉线 + 点火控制盘 + 独立围栏。
    vent: function (THREE, materials, group, list, area) {
      var g = area.geom;
      var stackH = g.h * 0.85;
      var stack = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, stackH, 14), materials.metal.pipe.clone());
      stack.position.set(g.x, stackH / 2, g.z);
      addPart(group, list, stack, true, true);

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

      var cabinet = box(THREE, materials.metal.cabinet, 1.4, 1.8, 1.0, g.x + g.w * 0.28, 0.9, g.z + g.d * 0.2);
      addPart(group, list, cabinet, true, true);

      var fence = new THREE.Mesh(
        new THREE.TorusGeometry(Math.min(g.w, g.d) * 0.42, 0.06, 6, 24),
        materials.warnStripe.clone()
      );
      fence.rotation.x = Math.PI / 2;
      fence.position.set(g.x, 0.6, g.z);
      addPart(group, list, fence, false, false);
    },

    // 排污区：1 台卧式排污罐 + 2 台排污滑片泵 + 敞口排污池。
    blowdown: function (THREE, materials, group, list, area) {
      var g = area.geom;
      var tank = horizontalTank(THREE, materials, 1.6, g.w * 0.45, 1.8);
      tank.position.set(g.x - g.w * 0.12, 0, g.z - g.d * 0.2);
      group.add(tank);
      tank.children.forEach(function (mesh) { list.push(mesh); });

      var pumps = instancedBoxCluster(THREE, materials.metal.pipe.clone(), 2, [1.0, 1.0, 1.4], 2.2, g.x + g.w * 0.22, 0.5, g.z - g.d * 0.2);
      group.add(pumps);
      list.push(pumps);

      var basin = box(THREE, materials.basin, g.w * 0.4, 0.3, g.d * 0.3, g.x, 0.15, g.z + g.d * 0.25);
      addPart(group, list, basin, false, true);
    },

    // 机柜间：室内建筑 + 顶部空调冷媒管示意。
    cabinet: function (THREE, materials, group, list, area) {
      buildRoomBuilding(THREE, materials, group, list, area, false);
      var g = area.geom;
      var condenser = box(THREE, materials.metal.cabinet, 2.4, 0.8, 1.4, g.x + g.w * 0.3, g.h + 0.6, g.z);
      addPart(group, list, condenser, true, false);
    },

    // 配电间：室内建筑 + 2 台油浸式变压器（外置于建筑一侧）。
    power: function (THREE, materials, group, list, area) {
      buildRoomBuilding(THREE, materials, group, list, area, true);
      var g = area.geom;
      [-1, 1].forEach(function (side) {
        var tank = verticalTank(THREE, materials, 1.2, 2.4, 0);
        tank.position.set(g.x + side * g.w * 0.32, 0, g.z + g.d * 0.42);
        group.add(tank);
        tank.children.forEach(function (mesh) { list.push(mesh); });
      });
    },

    // 站控室：室内建筑 + 屋顶天线杆（示意监控/通信）。
    control: function (THREE, materials, group, list, area) {
      buildRoomBuilding(THREE, materials, group, list, area, true);
      var g = area.geom;
      var mast = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.18, 3.2, 8), materials.metal.stainless.clone());
      mast.position.set(g.x - g.w * 0.3, g.h + 1.6, g.z);
      addPart(group, list, mast, true, false);
    },

    // 发电机棚：敞开式棚（4 立柱 + 顶板）+ 内部机组 + 排烟管。
    genset: function (THREE, materials, group, list, area) {
      var g = area.geom;
      var corners = [
        [g.x - g.w * 0.42, g.z - g.d * 0.42],
        [g.x + g.w * 0.42, g.z - g.d * 0.42],
        [g.x - g.w * 0.42, g.z + g.d * 0.42],
        [g.x + g.w * 0.42, g.z + g.d * 0.42]
      ];
      corners.forEach(function (c) {
        var post = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, g.h, 8), materials.shed.clone());
        post.position.set(c[0], g.h / 2, c[1]);
        addPart(group, list, post, true, true);
      });
      var roof = box(THREE, materials.roof, g.w * 0.92, 0.3, g.d * 0.92, g.x, g.h + 0.15, g.z);
      addPart(group, list, roof, true, true);
      var genBody = box(THREE, materials.metal.cabinet, g.w * 0.4, g.h * 0.4, g.d * 0.35, g.x, g.h * 0.2, g.z);
      addPart(group, list, genBody, true, true);
      var exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, g.h * 0.6, 10), materials.metal.stainless.clone());
      exhaust.position.set(g.x + g.w * 0.2, g.h * 0.4 + g.h * 0.3, g.z - g.d * 0.2);
      addPart(group, list, exhaust, true, false);
    },

    // UPS 室：室内建筑（与 control/cabinet/power 精确相接，属于同一栋综合值班楼）。
    ups: function (THREE, materials, group, list, area) {
      buildRoomBuilding(THREE, materials, group, list, area, false);
    },

    // 收发球区：2 座卧式收发球筒。
    launcher: function (THREE, materials, group, list, area) {
      var g = area.geom;
      [-1, 1].forEach(function (side) {
        var drum = horizontalTank(THREE, materials, 1.3, g.w * 0.36, 1.6);
        drum.position.set(g.x + side * g.w * 0.24, 0, g.z);
        group.add(drum);
        drum.children.forEach(function (mesh) { list.push(mesh); });
      });
      var rack = box(THREE, materials.metal.cabinet, 1.6, 1.2, 1.0, g.x, 0.6, g.z + g.d * 0.32);
      addPart(group, list, rack, true, true);
    }
  };

  function buildArea(THREE, materials, group, areaMeshes, area) {
    var list = areaMeshes[area.id];
    var builder = AREA_BUILDERS[area.id];
    if (!builder) throw new Error("[Map3DModel] 区域 " + area.id + " 没有对应的造型构建函数");
    builder(THREE, materials, group, list, area);
    return new THREE.Vector3(area.geom.x, area.geom.h, area.geom.z);
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
    // 高度取该区高度的一半（夹在 [0.9, 3.2] 内），代表设备腰线高度的巡检点位，
    // 不是贴地也不是探出屋顶。
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
        var y = Math.min(3.2, Math.max(0.9, g.h * 0.5));
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
