// 湖南省油气管网大屏总览 —— 3D model 之三：管道 Tube，同时是三份 model 的装配入口
// window.HunanMapModel（engine.js 唯一认识的两函数契约）。
//
// 【POC：hunan-inspection-overview（巡检站总览）】
// 本文件与 poc/hunan-pump-overview/scripts/map3d/model-pipelines.js 是逐字节相同的
// 独立副本（除本段 POC 名称注释）——两块大屏刻意互不耦合，各持完整 model 副本，
// 运行时零共享。
//
// 用 TubeGeometry + CatmullRomCurve3 沿管道 nodeIds 对应的站点世界坐标穿过：r160
// UMD 没有 Line2，原生 THREE.Line 的 linewidth 会被钳到 1px，粗管道必须用真实几何
// 体而不是线段。不做流光动画——那是永久脏源，会破坏 engine.js 按需渲染（markDirty
// 只在真的有相机运动/状态变化时才置脁，一个常驻动画会让 engine 永远认为场景是
// "脏"的，每帧都渲染，demo 不需要为此付出这个代价）。
//
// 装配入口选在本文件（三个 model 里最后加载的一个）：只是"最后一个加载的文件负责
// 把前两个拼起来"这一实现选择，管道模型本身在架构上并不比另外两个更重要——
// index.html 里的加载顺序必须是 model-map.js -> model-sites.js -> model-pipelines.js
// -> engine.js，否则 window.HunanMapModel 在 engine.js 需要它之前还不存在。
(function () {
  "use strict";

  var PIPE_RADIUS = { oil: 1.6, gas: 1.0 };
  var PIPE_COLOR = { oil: 0xc9812f, gas: 0x3aa0c4 }; // oil 偏暖（琥珀橙），gas 偏青
  var TUBE_RADIAL_SEGMENTS = 8;

  function createMaterials(THREE) {
    return {
      oil: new THREE.MeshStandardMaterial({ color: PIPE_COLOR.oil, roughness: 0.4, metalness: 0.55 }),
      gas: new THREE.MeshStandardMaterial({ color: PIPE_COLOR.gas, roughness: 0.4, metalness: 0.55 })
    };
  }

  // pipelines: [{id,name,kind,nodeIds}]；siteById 是装配入口传入的站点查表
  // {id:{x,z,...}}——调用方（scripts/scenes/overview.js）已经按"该管道全部
  // nodeIds 都落在当前 POC 的站点范围内"筛过一轮，这里找不到站点直接抛错，
  // 不是本文件该吞掉的错误（吞掉等于让一条管道悄悄断在半路，画面上会看不出来）。
  function build(THREE, materials, pipelines, siteById, elevationY) {
    if (!Array.isArray(pipelines)) throw new Error("[HunanModelPipelines] build 需要 pipelines 数组");
    if (!siteById) throw new Error("[HunanModelPipelines] build 需要 siteById 查表");
    if (typeof elevationY !== "number" || !isFinite(elevationY)) {
      throw new Error("[HunanModelPipelines] build 需要有限数字 elevationY");
    }

    var group = new THREE.Group();
    group.name = "hunan-pipelines";

    pipelines.forEach(function (pipeline) {
      var material = materials[pipeline.kind];
      if (!material) throw new Error("[HunanModelPipelines] 管道 " + pipeline.id + " 的 kind 非法：" + pipeline.kind);
      if (!Array.isArray(pipeline.nodeIds) || pipeline.nodeIds.length < 2) {
        throw new Error("[HunanModelPipelines] 管道 " + pipeline.id + " 需要至少 2 个 nodeIds");
      }

      var points = pipeline.nodeIds.map(function (nodeId) {
        var site = siteById[nodeId];
        if (!site) {
          throw new Error(
            "[HunanModelPipelines] 管道 " + pipeline.id + " 引用的站点 " + nodeId +
            " 不在当前站点范围内（调用方传入 pipelines 前应已按 nodeIds 全覆盖过滤）"
          );
        }
        return new THREE.Vector3(site.x, elevationY, site.z);
      });

      var curve = new THREE.CatmullRomCurve3(points);
      var tubularSegments = Math.max(points.length * 3, 6);
      var radius = PIPE_RADIUS[pipeline.kind];
      var geometry = new THREE.TubeGeometry(curve, tubularSegments, radius, TUBE_RADIAL_SEGMENTS, false);
      var mesh = new THREE.Mesh(geometry, material);
      mesh.name = "hunan-pipeline-" + pipeline.id;
      mesh.receiveShadow = true;
      group.add(mesh);
    });

    return { group: group };
  }

  window.HunanModelPipelines = {
    createMaterials: createMaterials,
    build: build
  };

  // ---------------------------------------------------------------------
  // 装配入口：window.HunanMapModel —— engine.js 唯一认识的两函数契约。
  // ---------------------------------------------------------------------

  function requireModel(scriptPath, namespace) {
    if (!window[namespace]) {
      throw new Error("[HunanMapModel] 缺少 window." + namespace + "，请检查 " + scriptPath + " 是否已在本文件之前加载");
    }
    return window[namespace];
  }

  function assembledCreateMaterials(THREE) {
    return {
      map: requireModel("scripts/map3d/model-map.js", "HunanModelMap").createMaterials(THREE),
      sites: requireModel("scripts/map3d/model-sites.js", "HunanModelSites").createMaterials(THREE),
      pipelines: requireModel("scripts/map3d/model-pipelines.js", "HunanModelPipelines").createMaterials(THREE)
    };
  }

  function assembledBuild(THREE, materials, data) {
    if (!data || !data.geo || !Array.isArray(data.sites) || !Array.isArray(data.pipelines)) {
      throw new Error("[HunanMapModel] build 需要 data.geo / data.sites[] / data.pipelines[]");
    }

    var Map = requireModel("scripts/map3d/model-map.js", "HunanModelMap");
    var Sites = requireModel("scripts/map3d/model-sites.js", "HunanModelSites");

    var mapBuilt = Map.build(THREE, materials.map, data.geo, data.sites);
    var group = mapBuilt.group;

    var siteById = {};
    data.sites.forEach(function (site) {
      siteById[site.id] = site;
    });

    var sitesBuilt = Sites.build(THREE, materials.sites, data.sites, mapBuilt.topY);
    // 首页总览只保留区域名称和数量，站点位置由右侧清单承载；光柱继续用于计算
    // siteAnchors/siteMeshes 形状，但不挂到场景里，避免 3D 地图出现树状点位。

    var pipelinesBuilt = build(THREE, materials.pipelines, data.pipelines, siteById, mapBuilt.topY + 1.2);
    group.add(pipelinesBuilt.group);

    return {
      group: group,
      zoneAnchors: mapBuilt.zoneAnchors,
      siteAnchors: sitesBuilt.siteAnchors,
      districtMeshes: mapBuilt.districtMeshes,
      zoneMeshes: mapBuilt.zoneMeshes,
      siteMeshes: sitesBuilt.siteMeshes,
      pipelineGroup: pipelinesBuilt.group
    };
  }

  window.HunanMapModel = {
    createMaterials: assembledCreateMaterials,
    build: assembledBuild
  };
})();
