// 湖南省油气管网大屏总览 —— 3D model 之二：站点光柱。window.HunanModelSites。
//
// 【POC：hunan-pump-overview（泵站总览，成品油 44 站点）】
// 本文件与 poc/hunan-inspection-overview/scripts/map3d/model-sites.js 是逐字节相同的独立
// 副本（除本段 POC 名称注释）——两块大屏刻意互不耦合，各持完整 model 副本，运行时
// 零共享。
//
// 250 个独立 Mesh 会产生远超 <200 护栏的 draw call（母本
// poc/inspection-3d-sandbox 实测 250 个巡检点位若不合并会打到 276 次），因此按
// status 分 3 个 InstancedMesh（ok/warn/danger 各一个），station 比 valve 粗高
// 一点——用同一个几何体（单位圆柱）配合每个实例矩阵自带的非均匀缩放（THREE.
// Matrix4#compose 的 scale 参数）实现，不需要为 station/valve 各开一份几何体。
//
// 不做脉冲环/流光一类持续动画：engine.js 自己的 zoneHotspots/siteHotspots 热点池
// 已经承担"呼吸/脉冲"的视觉语义（HOTSPOT.pulse），本文件的光柱只是静态几何体，
// 叠加动画只会增加复杂度而不增加信息量。
(function () {
  "use strict";

  var STATUS_COLOR = { ok: 0x30c69d, warn: 0xeeb44a, danger: 0xff625c };
  var STATION_RADIUS = 3.2;
  var STATION_HEIGHT = 32;
  var VALVE_RADIUS = 1.6;
  var VALVE_HEIGHT = 16;
  var RADIAL_SEGMENTS = 10;

  function requireContract() {
    if (!window.HunanContract) throw new Error("[HunanModelSites] window.HunanContract 未加载");
    return window.HunanContract;
  }

  function createMaterials(THREE) {
    var Contract = requireContract();
    var materials = {};
    Contract.STATUSES.forEach(function (status) {
      var color = STATUS_COLOR[status];
      if (color == null) throw new Error("[HunanModelSites] 未知状态颜色：" + status);
      materials[status] = new THREE.MeshStandardMaterial({
        color: color,
        emissive: color,
        emissiveIntensity: 0.22,
        roughness: 0.4,
        metalness: 0.25
      });
    });
    return materials;
  }

  // baseY：光柱底部贴合的高度（省域挤出块顶面），由 model-pipelines.js 里的装配入口
  // （window.HunanMapModel）传入，本文件不关心这个高度是怎么算出来的，也不重新
  // 定义它——真源是 model-map.js 的 DISTRICT_HEIGHT。
  function build(THREE, materials, sites, baseY) {
    var Contract = requireContract();
    if (!Array.isArray(sites)) throw new Error("[HunanModelSites] build 需要 sites 数组");
    if (typeof baseY !== "number" || !isFinite(baseY)) {
      throw new Error("[HunanModelSites] build 需要有限数字 baseY，实际为 " + baseY);
    }

    var group = new THREE.Group();
    group.name = "hunan-sites";

    var byStatus = { ok: [], warn: [], danger: [] };
    sites.forEach(function (site) {
      if (!byStatus[site.status]) {
        throw new Error("[HunanModelSites] 站点 " + site.id + " 的状态非法：" + site.status);
      }
      byStatus[site.status].push(site);
    });

    var geometry = new THREE.CylinderGeometry(1, 1, 1, RADIAL_SEGMENTS);
    var siteAnchors = {};
    var siteMeshes = {};
    var position = new THREE.Vector3();
    var quaternion = new THREE.Quaternion();
    var scale = new THREE.Vector3();
    var matrix = new THREE.Matrix4();

    Contract.STATUSES.forEach(function (status) {
      var list = byStatus[status];
      var mesh = new THREE.InstancedMesh(geometry, materials[status], Math.max(list.length, 1));
      mesh.count = list.length;
      mesh.name = "hunan-site-pillars-" + status;
      mesh.castShadow = true;

      list.forEach(function (site, index) {
        var isStation = site.kind === "station";
        var radius = isStation ? STATION_RADIUS : VALVE_RADIUS;
        var height = isStation ? STATION_HEIGHT : VALVE_HEIGHT;
        var topY = baseY + height;

        position.set(site.x, baseY + height / 2, site.z);
        scale.set(radius, height, radius);
        matrix.compose(position, quaternion, scale);
        mesh.setMatrixAt(index, matrix);

        siteAnchors[site.id] = new THREE.Vector3(site.x, topY, site.z);
        // siteMeshes 只保留空数组占位：本 demo 的钻取只做省域→作业区两级（见
        // scripts/scenes/overview.js 文件头），从不调用 HunanMap3D.setActiveSite
        // (非 null)，engine.js 的 cacheAndApplySelection 因此永远不会遍历这些数组。
        // 仍然为每个站点建一个键，是为了让"每个站点 id 都有对应键"这条形状在本文件
        // 里保持完整，即使这里没有真正的按站点独立 Mesh（250 个独立 Mesh 会击穿
        // <200 draw call 护栏，见文件头）。
        siteMeshes[site.id] = [];
      });

      mesh.instanceMatrix.needsUpdate = true;
      group.add(mesh);
    });

    return { group: group, siteAnchors: siteAnchors, siteMeshes: siteMeshes };
  }

  window.HunanModelSites = {
    createMaterials: createMaterials,
    build: build
  };
})();
