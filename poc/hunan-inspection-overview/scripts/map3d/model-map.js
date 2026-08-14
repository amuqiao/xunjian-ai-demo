// 湖南省油气管网大屏总览 —— 3D model 之一：省域 14 市挤出块。window.HunanModelMap。
//
// 【POC：hunan-inspection-overview（巡检站总览）】
// 本文件与 poc/hunan-pump-overview/scripts/map3d/model-map.js 是逐字节相同的独立副本
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

  function requireTopology() {
    if (!window.HunanTopology || !Array.isArray(window.HunanTopology.zones)) {
      throw new Error("[HunanModelMap] window.HunanTopology.zones 未加载");
    }
    return window.HunanTopology;
  }

  function rgbToHex(rgb) {
    if (!Array.isArray(rgb) || rgb.length !== 3) {
      throw new Error("[HunanModelMap] rgbToHex 需要 [r,g,b] 三元数组，实际为 " + rgb);
    }
    return (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];
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
    var Topology = requireTopology();
    var zoneColorHex = {};
    Topology.zones.forEach(function (zone) {
      zoneColorHex[zone.id] = rgbToHex(zone.rgb);
    });

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
