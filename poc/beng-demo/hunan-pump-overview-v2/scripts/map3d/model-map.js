// 湖南省油气管网大屏总览 —— 3D model 之一：省域 14 市挤出块。window.HunanModelMap。
//
// ═══════════════════════════════════════════════════════════════════════════
// 【POC hunan-pump-overview-v2 专用副本】与 ../hunan-pump-overview/scripts/map3d/
// model-map.js 的差异**只有一处**：buildDistricts() 里挤出块的颜色。其余逐字节相同。
//
// 为什么必须改：旧版颜色取 topology.js 的 zones[].rgb，那是**源表给白底 Excel 图例
// 用的色板** —— [255,255,204] 湘娄、[192,192,192] 衡阳、[204,255,204] 湘中、
// [204,204,255] 株洲，全是明度 80% 以上的粉彩色。搬到黑底大屏上相邻色块明度差不到
// 10%，边界糊成一片；引擎又用 ACESFilmic 色调映射 + 曝光 1.2，把本来就亮的颜色继续
// 往白推，挤出块的顶面和侧壁没有明暗差，立体感被抹平。实测就是"材质看着模糊"的成因
// —— 不是渲染分辨率问题（画布缓冲 1954×1378、屏上占 1772 设备像素，本来是超采样）。
//
// 改成什么：颜色不再编码「作业区身份」（身份已经由地图标签和下边的作业区带承担，
// 同一件事编码两遍是浪费），改成编码**该作业区的在役机组台数**。于是
//   0 台的 5 个区（湘北/湘中/郴州/湘西/永郴）沉进背景色，只留轮廓；
//   有机组的 5 个区按台数在同一个青蓝色族里由深到亮。
// 一族同色相 + 明度拉开到 3 档，黑底上边界立刻分得开，而且地图本身就在回答
// 「泵在哪儿多」这个问题。
// ═══════════════════════════════════════════════════════════════════════════
//
// 【POC：hunan-pump-overview（泵站总览）】
// 本文件与 poc/hunan-inspection-overview/scripts/map3d/model-map.js 是逐字节相同的独立副本
// （除本段 POC 名称注释）——两块大屏刻意互不耦合，各持完整 model 副本，运行时零共享。
//
// 只做 engine.js 真正会用到的那部分：14 个 ExtrudeGeometry 挤出块（bevelEnabled:
// false）+ 按"该市境内站点最多的作业区"着色（众数，不是排他归属——contract.js 的
// assertZoneDistrictMap 早已论证过作业区与市是多对多，参见该文件注释）+ 10 作业区的
// 面积加权质心锚点。不做"选中态微微抬高"：engine.js 的 setActiveZoneHighlight 只会
// 修改 material.emissive/emissiveIntensity，没有任何钩子会改网格的 position，若要做
// 物理抬高需要改 engine.js（冻结、不可改），因此本文件只依赖材质层面的高亮
// （见 createMaterials 里 emissiveIntensity 基线的注释），这是刻意的简化取舍。
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


  function rgbToHex(rgb) {
    if (!Array.isArray(rgb) || rgb.length !== 3) {
      throw new Error("[HunanModelMap] rgbToHex 需要 [r,g,b] 三元数组，实际为 " + rgb);
    }
    return (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];
  }

  // 按在役机组台数分档的色板。四档明度拉开到肉眼一眼能分，色相统一在青蓝族里
  // （与 01-tokens.css 的 --accent #38c6ec 同族），所以整张图仍然是一种颜色的深浅，
  // 不会变成花地图。
  //
  // 档位不是均分台数，是照真实分布切的：0 / 4 / 8 / 16 —— 湖南公司 6 个作业区的台数
  // 恰好落在 16(岳阳) / 8(长沙) / 8(湘娄) / 4(衡阳) / 4(株洲) / 0(永郴)，
  // 再加上拓扑表里 4 个非湖南公司的区也是 0 台，所以 0 这一档占 5 个区。
  // 四档之间的明度差是刻意拉开的：引擎用 ACESFilmic 色调映射会压缩高光，
  // 档与档只差 20~30 亮度在屏上几乎看不出来，实测要差 40 以上才一眼能分。
  var PUMP_COUNT_STEPS = [
    { min: 11, rgb: [122, 216, 240] },  // > 10 台：最亮（岳阳 16）
    { min: 6, rgb: [52, 138, 180] },    // 6~10 台：中（长沙 8 / 湘娄 8）
    { min: 1, rgb: [24, 66, 92] },      // 1~5 台：暗（衡阳 4 / 株洲 4）
    { min: 0, rgb: [18, 25, 46] }       // 0 台：沉进背景，只留轮廓
  ];

  function pumpCountPalette(Contract) {
    // 台数从台账读，不从 topology 的 stationCount 读 —— 那是站场/阀室数，不是机组数。
    if (!window.PumpLedger) {
      throw new Error("[HunanModelMap] 需要 window.PumpLedger（本副本按机组台数着色），请检查 index.html 加载顺序");
    }
    var out = {};
    Contract.ZONE_IDS.forEach(function (zoneId) {
      var count = window.PumpLedger.pumpsByZone(zoneId).length;
      var step = PUMP_COUNT_STEPS.filter(function (s) { return count >= s.min; })[0];
      out[zoneId] = rgbToHex(step.rgb);
    });
    return out;
  }

  // 每个市染"该市境内站点最多的作业区"的颜色（众数）。当前数据口径下某个市可能
  // 一个站点都没有（比如泵站总览只覆盖成品油沿线 8 个市，另外 6 个市没有任何站点）
  // ——这不是错误，是数据口径本身的收窄。这种情况下退回业务地理归属：按
  // Contract.ZONE_IDS 的固定顺序取第一个在 zoneDistrictMap 里认领了该市的作业区，
  // 保证 14 市在任何数据口径下都有确定、可解释的着色，不出现无色孤岛。
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
      if (!claimant) {
        throw new Error("[HunanModelMap] 市 " + adcode + " 未被任何作业区认领（zoneDistrictMap 覆盖不全），无法着色");
      }
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

  // 按"该市染色所归属的作业区"把 14 市合并成最多 10 个 Mesh（同一作业区名下的
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
    var zoneColorHex = pumpCountPalette(Contract);

    var districtZoneId = computeDistrictZoneId(Contract, sites, zoneDistrictMap);

    var byAdcode = {};
    geo.districts.forEach(function (d) {
      byAdcode[d.adcode] = d;
    });

    var adcodesByZone = {};
    Contract.ZONE_IDS.forEach(function (zoneId) {
      adcodesByZone[zoneId] = [];
    });
    Contract.DISTRICT_ADCODES.forEach(function (adcode) {
      adcodesByZone[districtZoneId[adcode]].push(adcode);
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

      var material = materials.makeDistrict(zoneColorHex[zoneId]);
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
  // emissiveIntensity 给一个很低的基线（0.06，用市自身的颜色微微自发光），不是装饰：
  // engine.js 选中某个作业区时会把该作业区名下所有市的材质 emissive 覆盖成青色高亮
  // （HOTSPOT.selection），取消选中时再用 cacheAndApplySelection 存的旧值还原——
  // 这个基线让"选中态更亮"和"其余保持较暗的本色"形成对比，不需要额外维护一套
  // "把其它区块调暗"的状态机（那需要 engine.js 提供本项目没有的钩子）。
  function createMaterials(THREE) {
    return {
      makeDistrict: function (colorHex) {
        return new THREE.MeshStandardMaterial({
          color: colorHex,
          roughness: 0.82,
          metalness: 0.05,
          emissive: colorHex,
          emissiveIntensity: 0.06
        });
      }
    };
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
