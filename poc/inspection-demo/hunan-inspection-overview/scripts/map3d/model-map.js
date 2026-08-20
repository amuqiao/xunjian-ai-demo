// 湖南省油气管网大屏总览 —— 3D model 之一：省域 14 市挤出块。window.HunanModelMap。
//
// 【POC：hunan-inspection-overview（巡检站总览）】
// ⚠️ 本文件曾与 poc/hunan-pump-overview/scripts/map3d/model-map.js 逐字节相同，
// 现已**主动分叉**：本 POC 的地图改成了"统一深蓝 + 青色顶面描边 + 侧面渐变"的
// 指挥大屏配色（见下方【地图配色】一节），泵站总览那份仍是原来的作业区图例色。
// 两份文件从此不再互为副本，同步改动时不能再直接对拷，需要逐段判断。
//
// 【地图配色（本轮改动）】色值来自甲方给的参考大屏工程导出
// assets/.data/历届参赛作品/NB-Map2026814124352.json：
//   顶面 mapColor      #0d50b5
//   侧面 mapSideColor  #1d2d3d（底） → mapSideEndColor #006793（顶）
//   顶面描边 outerLine.lineColor #6becf5
// 原先 14 市是按"该市境内站点最多的作业区"的源表图例色（topology.js 的
// zones[].rgb，黄/淡蓝/银灰等粉彩色）分别染色的，本轮按需求改成全省统一深蓝——
// **作业区之间不再有颜色差异**，作业区归属改由两处表达：地图上的作业区标签，以及
// 点击后 engine.js 打上的青色选中高亮。这是一次刻意的信息编码取舍，不是遗漏：
// 静态画面上确实看不出作业区边界了。zoneMeshes 的分组逻辑（按作业区合并网格）
// 保持不变，选中高亮照常工作。
//
// 只做 engine.js 真正会用到的那部分：14 个 ExtrudeGeometry 挤出块（bevelEnabled:
// false）+ 统一配色 + 10 作业区的面积加权质心锚点。不做"选中态微微抬高"：
// engine.js 的 setActiveZoneHighlight 只会修改 material.emissive/emissiveIntensity，
// 没有任何钩子会改网格的 position，若要做物理抬高需要改 engine.js（冻结、不可改），
// 因此本文件只依赖材质层面的高亮（见 createMaterials 里 emissiveIntensity 基线的
// 注释），这是刻意的简化取舍。
//
// 坐标换算陷阱：THREE.ExtrudeGeometry 默认在形状的局部 XY 平面里画 2D 轮廓，沿 +Z
// 挤出，而本项目的世界坐标是 Y 朝上、地图铺在 XZ 平面（X 向东，Z 向南，见
// scripts/data/geo.js 文件头）。做法是：形状的局部 (x,y) 取 (世界X, -世界Z)，挤出后
// 整体 geometry.rotateX(-Math.PI/2)——旋转矩阵在 θ=-90° 时把 (x,y,z) 变成
// (x,z,-y)，代入局部 y=-世界Z 得最终 z=世界Z，X 分量不受影响。这样才能不产生南北
// 镜像翻转（长沙应在东、湘西在西、岳阳在北、郴州在南）。如果直接用局部 y=世界Z、
// 不做这次预翻转，会得到 z=-世界Z，整张省图会呈南北镰像。
(function () {
  "use strict";

  var DISTRICT_HEIGHT = 22;

  // 见文件头【地图配色】。挤出高度仍是 22（参考工程用的是 depth 36，但高度不是
  // 纯视觉参数：zoneAnchors 的 y、站点光柱与管道 Tube 的 elevationY、相机 target
  // 全都挂在 topY 上，改高度会连带动几何布局，超出本轮"只改配色"的范围）。
  var MAP_COLOR = 0x0d50b5;
  var SIDE_COLOR_BOTTOM = 0x1d2d3d;
  var SIDE_COLOR_TOP = 0x006793;
  var OUTLINE_COLOR = 0x6becf5;
  // 描边浮在顶面之上一点点，避免与顶盖共面导致的 z-fighting（顶面在 y=22，
  // 这里取 +0.35：小到看不出悬空，大到足够跳出深度缓冲的精度抖动）。
  var OUTLINE_LIFT = 0.35;

  function requireContract() {
    if (!window.HunanContract) throw new Error("[HunanModelMap] window.HunanContract 未加载");
    return window.HunanContract;
  }

  function requireSites() {
    if (!window.HunanSites || typeof window.HunanSites.zoneDistricts !== "function") {
      throw new Error("[HunanModelMap] window.HunanSites.zoneDistricts() 未加载");
    }
    return window.HunanSites;
  }

  // 注：本文件原有的 requireTopology()/rgbToHex() 已随"统一深蓝"一并删除——它们
  // 唯一的用途是把 topology.js 的 zones[].rgb 图例色转成各作业区的挤出块颜色，
  // 现在 14 市统一用 MAP_COLOR，不再读 window.HunanTopology。

  // 每个市归入"该市境内站点最多的作业区"（众数）。新版站点台账只覆盖 6 个作业区，
  // 其余市只作为底图存在，不进入作业区统计口径；这种情况下返回 null，后续统一放进
  // neutral 底图网格，不参与高亮与标签。
  function computeDistrictZoneId(Contract, sites, zoneDistrictMap) {
    var counts = {};
    sites.forEach(function (site) {
      counts[site.adcode] = counts[site.adcode] || {};
      counts[site.adcode][site.zoneId] = (counts[site.adcode][site.zoneId] || 0) + 1;
    });

    var result = {};
    Contract.DISTRICT_ADCODES.forEach(function (adcode) {
      var byZone = counts[adcode];
      if (byZone) {
        var bestZone = null;
        var bestCount = -1;
        Contract.ZONE_IDS.forEach(function (zoneId) {
          var c = byZone[zoneId] || 0;
          if (c > bestCount) {
            bestCount = c;
            bestZone = zoneId;
          }
        });
        result[adcode] = bestZone;
        return;
      }
      var claimant = null;
      Contract.ZONE_IDS.some(function (zoneId) {
        if (zoneDistrictMap[zoneId].indexOf(adcode) >= 0) {
          claimant = zoneId;
          return true;
        }
        return false;
      });
      result[adcode] = claimant;
    });
    return result;
  }

  function buildDistrictShapes(THREE, district) {
    return district.rings.map(function (ring) {
      var shape = new THREE.Shape();
      ring.forEach(function (point, index) {
        var x = point[0];
        var y = -point[1]; // 预翻转，配合下面的 rotateX(-90°) 还原世界 Z，见文件头说明
        if (index === 0) shape.moveTo(x, y);
        else shape.lineTo(x, y);
      });
      return shape;
    });
  }

  // 按"该市染色所归属的作业区"把 14 市合并成业务作业区 Mesh（同一作业区名下的
  // 多个市合到一次 ExtrudeGeometry 调用里，一次 draw call）——不是按市各开一个
  // Mesh。这不只是省 draw call 的顺手优化：引擎的 setActiveZoneHighlight 靠
  // zoneMeshes[zoneId] 这个网格列表做选中态提亮，如果 14 市各自独立成网格、
  // 再靠"哪个市的众数是这个作业区"松散地归进对应数组，14 次 draw call 在实测中
  // （见任务报告 renderCalls 实测数据）会让"下钻到站点最多的作业区（岳阳，
  // 36 个站点）"这个最坏路径逼近甚至可能击穿 engine.js 的 <200 draw call 护栏——
  // engine.js 的热点池是每个可见热点固定的开销，没有余量可以从那里省，只能从
  // 本文件自己的几何体上省。按作业区合并成 1 个 Mesh 之后每个作业区仍然是独立的
  // 材质实例（cacheAndApplySelection 的选中态互不影响），只是把同一作业区名下
  // 原本分散的市域几何体在同一次 ExtrudeGeometry 调用里一起挤出。
  function buildDistricts(THREE, materials, Contract, geo, sites, zoneDistrictMap, group) {
    var districtZoneId = computeDistrictZoneId(Contract, sites, zoneDistrictMap);

    var byAdcode = {};
    geo.districts.forEach(function (d) {
      byAdcode[d.adcode] = d;
    });

    var adcodesByZone = {};
    Contract.ZONE_IDS.forEach(function (zoneId) {
      adcodesByZone[zoneId] = [];
    });
    var neutralAdcodes = [];
    Contract.DISTRICT_ADCODES.forEach(function (adcode) {
      var zoneId = districtZoneId[adcode];
      if (zoneId == null) neutralAdcodes.push(adcode);
      else adcodesByZone[zoneId].push(adcode);
    });

    var districtMeshes = {};
    var zoneMeshes = {};

    Contract.ZONE_IDS.forEach(function (zoneId) {
      var adcodes = adcodesByZone[zoneId];
      if (adcodes.length === 0) {
        zoneMeshes[zoneId] = [];
        return;
      }
      var shapes = [];
      adcodes.forEach(function (adcode) {
        var district = byAdcode[adcode];
        if (!district) throw new Error("[HunanModelMap] geo.districts 缺少 " + adcode);
        shapes = shapes.concat(buildDistrictShapes(THREE, district));
      });
      var geometry = new THREE.ExtrudeGeometry(shapes, { depth: DISTRICT_HEIGHT, bevelEnabled: false });
      geometry.rotateX(-Math.PI / 2);
      // 顺序要紧：必须在 rotateX 之后再写顶点色，渐变是按世界 Y 分档的，
      // 旋转前挤出方向还在局部 Z 上，那时候读 position.getY() 拿到的是轮廓坐标。
      applyFaceColors(THREE, geometry);

      var material = materials.makeDistrict();
      var mesh = new THREE.Mesh(geometry, material);
      mesh.name = "hunan-zone-districts-" + zoneId;
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      group.add(mesh);

      zoneMeshes[zoneId] = [mesh];
      adcodes.forEach(function (adcode) {
        districtMeshes[adcode] = [mesh];
      });
    });

    if (neutralAdcodes.length > 0) {
      var neutralShapes = [];
      neutralAdcodes.forEach(function (adcode) {
        var district = byAdcode[adcode];
        if (!district) throw new Error("[HunanModelMap] geo.districts 缺少 " + adcode);
        neutralShapes = neutralShapes.concat(buildDistrictShapes(THREE, district));
      });
      var neutralGeometry = new THREE.ExtrudeGeometry(neutralShapes, { depth: DISTRICT_HEIGHT, bevelEnabled: false });
      neutralGeometry.rotateX(-Math.PI / 2);
      applyFaceColors(THREE, neutralGeometry);

      var neutralMaterial = materials.makeDistrict();
      neutralMaterial.emissiveIntensity = 0.02;
      var neutralMesh = new THREE.Mesh(neutralGeometry, neutralMaterial);
      neutralMesh.name = "hunan-neutral-districts";
      neutralMesh.receiveShadow = true;
      neutralMesh.castShadow = false;
      group.add(neutralMesh);

      neutralAdcodes.forEach(function (adcode) {
        districtMeshes[adcode] = [neutralMesh];
      });
    }

    return { districtMeshes: districtMeshes, zoneMeshes: zoneMeshes };
  }

  // zoneAnchors：该作业区所辖各市（zoneDistrictMap[zoneId]，业务地理归属，与上面
  // "按站点众数着色"是两件不同的事，此处不看站点、只看市域面积）的面积加权质心，
  // y 取挤出高度（挤出块顶面），供 engine.js 悬浮热点与相机 target 使用。用面积加权
  // 质心而不是包围盒中心：跨市作业区（如"永郴"=永州+郴州）若用包围盒中心，锚点会
  // 跑到两市之间的省界外，看起来悬在空地上。
  function computeZoneAnchors(THREE, Contract, geo, zoneDistrictMap, topY) {
    var byAdcode = {};
    geo.districts.forEach(function (d) {
      byAdcode[d.adcode] = d;
    });

    var anchors = {};
    Contract.ZONE_IDS.forEach(function (zoneId) {
      var adcodes = zoneDistrictMap[zoneId];
      if (!adcodes || adcodes.length === 0) {
        throw new Error("[HunanModelMap] 作业区 " + zoneId + " 在 zoneDistrictMap 里没有任何市，无法计算锚点");
      }
      var sumX = 0;
      var sumZ = 0;
      var sumArea = 0;
      adcodes.forEach(function (adcode) {
        var d = byAdcode[adcode];
        if (!d) throw new Error("[HunanModelMap] geo.districts 缺少 " + adcode);
        sumX += d.centroid[0] * d.areaWorld;
        sumZ += d.centroid[1] * d.areaWorld;
        sumArea += d.areaWorld;
      });
      anchors[zoneId] = new THREE.Vector3(sumX / sumArea, topY, sumZ / sumArea);
    });
    return anchors;
  }

  // makeDistrict 是工厂函数而不是单个材质：14 个市各自需要独立的材质实例（哪怕颜色
  // 相同）——engine.js 的 cacheAndApplySelection 直接修改 material.emissive，若多个
  // 网格共享同一个材质实例，选中一个市所在的作业区会连带点亮所有共享同色材质的市。
  // emissiveIntensity 给一个很低的基线（0.06，用顶面色 MAP_COLOR 微微自发光），
  // 不是装饰：engine.js 选中某个作业区时会把该作业区名下所有市的材质 emissive
  // 覆盖成青色高亮（HOTSPOT.selection），取消选中时再用 cacheAndApplySelection 存的
  // 旧值还原——这个基线让"选中态更亮"和"其余保持较暗的本色"形成对比，不需要额外
  // 维护一套"把其它区块调暗"的状态机（那需要 engine.js 提供本项目没有的钩子）。
  // 现在 14 市统一深蓝，这条高亮已经是作业区归属在画面上仅剩的两种表达之一
  // （另一种是地图标签），比改配色之前更吃重。
  //
  // 顶面色与侧面渐变**全部走顶点色，共用一个材质**，不用 [顶盖, 侧面] 材质数组。
  //
  // ⚠️ 这一条是踩过坑才定下来的，改之前先读完：ExtrudeGeometry 确实自带
  // materialIndex 0(顶/底盖)/1(侧面壁) 的分组，看起来天生适合材质数组，但它是
  // **每个 shape 各 addGroup 一次**，14 市抽稀后共 17 个 shape（有飞地的市不止一个
  // 环）——一旦 mesh.material 变成数组，three 就会按 group 逐个发 draw call，
  // 9 个挤出块网格从 9 次暴涨到 34 次。实测下钻到岳阳（最坏路径）的 renderCalls
  // 会从 191 升到 216，直接击穿 engine.js 的 <200 护栏（verify_overview.js 会断言）。
  // 单材质时 three 忽略 groups、整个 geometry 一次画完，代价只有"顶盖和侧面不能有
  // 不同的 roughness/metalness"，对这块大屏完全够用。
  //
  // 走顶点色而不是 onBeforeCompile 注入 shader：ExtrudeGeometry 在 bevelEnabled:false
  // 且无 steps 时，侧面顶点只存在 y=0 与 y=DISTRICT_HEIGHT 两层，两层各写一个端色、
  // 中间交给 GPU 插值，正好就是要的上下渐变，不必碰 shader（shader 注入在 three 小
  // 版本升级时是常见的破裂点，这里没必要冒这个险）。
  function createMaterials(THREE) {
    return {
      makeDistrict: function () {
        return new THREE.MeshStandardMaterial({
          // 顶点色是**乘性**的，material.color 必须留白，否则配色会被再乘一次底色。
          color: 0xffffff,
          vertexColors: true,
          roughness: 0.82,
          metalness: 0.05,
          // emissive 不受顶点色影响，是整块网格统一的一份自发光。基线取顶面色的
          // 低强度，作用见下方 makeDistrict 工厂函数那段注释（给选中态留对比度）。
          emissive: MAP_COLOR,
          emissiveIntensity: 0.06
        });
      },
      makeOutline: function () {
        return new THREE.LineBasicMaterial({
          color: OUTLINE_COLOR,
          transparent: true,
          opacity: 0.85
        });
      }
    };
  }

  // 写 color attribute：顶/底盖（materialIndex 0 的 group）统一 MAP_COLOR，侧面壁
  // （materialIndex 1）按顶点的世界 Y（rotateX 之后 y∈[0, DISTRICT_HEIGHT]）在
  // SIDE_COLOR_BOTTOM → SIDE_COLOR_TOP 之间插值。底盖朝下、任何机位都看不到，跟着
  // 顶盖走即可，不额外分档。
  //
  // 这里必须靠 groups 而不是"按 y 判断是不是顶面"来区分顶盖和侧面：顶盖顶点和侧面
  // 上沿顶点的 y 都等于 DISTRICT_HEIGHT，光看 y 分不开这两类面。ExtrudeGeometry 是
  // 非索引几何体，group 的 start/count 直接就是顶点区间。
  //
  // THREE.Color 构造时会按 ColorManagement 把 sRGB 字面值转到线性工作空间，所以
  // 下面的 lerp 是在线性空间里做的，与渲染管线一致。
  function applyFaceColors(THREE, geometry) {
    var lid = new THREE.Color(MAP_COLOR);
    var bottom = new THREE.Color(SIDE_COLOR_BOTTOM);
    var top = new THREE.Color(SIDE_COLOR_TOP);
    var position = geometry.attributes.position;
    var colors = new Float32Array(position.count * 3);
    var scratch = new THREE.Color();

    if (!geometry.groups || geometry.groups.length === 0) {
      throw new Error("[HunanModelMap] ExtrudeGeometry 未产出 groups，无法区分顶盖与侧面");
    }

    geometry.groups.forEach(function (group) {
      var end = group.start + group.count;
      for (var i = group.start; i < end; i += 1) {
        if (group.materialIndex === 0) {
          scratch.copy(lid);
        } else {
          var t = position.getY(i) / DISTRICT_HEIGHT;
          if (t < 0) t = 0;
          if (t > 1) t = 1;
          scratch.copy(bottom).lerp(top, t);
        }
        colors[i * 3] = scratch.r;
        colors[i * 3 + 1] = scratch.g;
        colors[i * 3 + 2] = scratch.b;
      }
    });

    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  }

  // 顶面描边：把 14 市所有环的相邻点对摊平进**一个** LineSegments，全省边界只花
  // 一次 draw call——engine.js 有 renderCalls < 200 的护栏（verify/verify_overview.js
  // 会断言），下钻到岳阳那种最坏路径本来就贴着上限，描边不能按市各开一个网格。
  //
  // ⚠️ 已知与参考图的差距：参考工程 outerLine.lineWidth 是 3，而这里画出来只有 1px。
  // WebGL 下 LineBasicMaterial.linewidth 被浏览器钳死在 1，要画粗线只能上 Line2/
  // LineMaterial，而本项目用的 three r160 UMD 构建里没有 Line2（model-pipelines.js
  // 文件头记的也是同一条限制）。用 TubeGeometry 描边能做粗，但 14 市抽稀后仍有
  // 4549 个顶点，铺成管子会额外吃掉数万三角形，触碰 triangles < 260000 的护栏，
  // 因此本轮选择 1px 细描边。
  function buildOutlines(THREE, materials, geo, group) {
    var positions = [];
    var y = DISTRICT_HEIGHT + OUTLINE_LIFT;
    geo.districts.forEach(function (district) {
      district.rings.forEach(function (ring) {
        for (var i = 0; i < ring.length - 1; i += 1) {
          positions.push(ring[i][0], y, ring[i][1]);
          positions.push(ring[i + 1][0], y, ring[i + 1][1]);
        }
      });
    });
    if (positions.length === 0) {
      throw new Error("[HunanModelMap] geo.districts 没有任何可用于描边的环");
    }
    var geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    var lines = new THREE.LineSegments(geometry, materials.makeOutline());
    lines.name = "hunan-district-outlines";
    // 描边不参与拾取：engine.js 的 raycaster 打到它会得到一条没有 zoneId 的线，
    // 白白多一层判断。frustumCulled 保持默认即可（整省一个包围盒，本来就总在视锥内）。
    lines.raycast = function () {};
    group.add(lines);
    return lines;
  }

  function build(THREE, materials, geo, sites) {
    var Contract = requireContract();
    var Sites = requireSites();
    if (!geo || !Array.isArray(geo.districts)) {
      throw new Error("[HunanModelMap] build 需要 geo.districts 数组");
    }
    if (!Array.isArray(sites)) {
      throw new Error("[HunanModelMap] build 需要 sites 数组");
    }

    var zoneDistrictMap = Sites.zoneDistricts();
    Contract.assertZoneDistrictMap(zoneDistrictMap);

    var group = new THREE.Group();
    group.name = "hunan-map";

    var built = buildDistricts(THREE, materials, Contract, geo, sites, zoneDistrictMap, group);
    buildOutlines(THREE, materials, geo, group);
    var zoneAnchors = computeZoneAnchors(THREE, Contract, geo, zoneDistrictMap, DISTRICT_HEIGHT);

    return {
      group: group,
      districtMeshes: built.districtMeshes,
      zoneMeshes: built.zoneMeshes,
      zoneAnchors: zoneAnchors,
      // topY 供 model-pipelines.js 里的装配入口（window.HunanMapModel）把站点光柱
      // 与管道 Tube 摆在挤出块顶面之上，不是 engine.js 契约的一部分。
      topY: DISTRICT_HEIGHT
    };
  }

  window.HunanModelMap = {
    createMaterials: createMaterials,
    build: build
  };
})();
