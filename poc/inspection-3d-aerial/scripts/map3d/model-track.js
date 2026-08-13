// 站场 3D 巡检地图（俯视/卫星质感 POC）——巡检轨迹（L3，晚于 contract.js /
// model-shared.js / data/track.js，早于 engine.js）。
//
// ==== 为什么轨迹是 TubeGeometry 而不是一条线 ====
// three.js r160 UMD 里没有 Line2/LineSegments2（在 examples/ 目录，UMD 不打包），
// LineBasicMaterial.linewidth 在几乎所有平台都被钳到 1px，画不出一条看得见的
// "巡检路线"。所以轨迹必须用 TubeGeometry + CatmullRomCurve3 撑出实际管径。
//
// ==== 流动光带为什么"只播一段就停"、以及为什么这不是永久脏源 ====
// 见 buildFlowTexture 与 window.Map3DEngine 里驱动这段动画的调用点（本文件只负责
// 建材质/建几何，不驱动逐帧动画——动画推进属于 engine.js 的按需渲染纪律，本文件
// 不能自己起 rAF）。texture.offset.x 每帧推进 N 像素、持续 TRACK_FLOW_DURATION_MS
// 毫秒后彻底停止推进——停止之后 offset 保持在最后一次的值不再变化，画面定格成一串
// 静态的"虚线管道"，本身是一种合法的静止装饰，不是"动画卡住了"的故障态。
//
// ==== 代码风格 / 错误处理约束（与 model-shared.js 相同，不重复展开）====
(function () {
  "use strict";

  var Y_LIFT = 0.6; // 与 data/track.js 的轨迹点 y 分量一致，避免与地面 z-fighting
  var MARKER_LIFT = 1.4; // 起点/终点/巡检人标记再抬高一点，浮在轨迹管道之上

  var TUBE_RADIUS = 2.0;
  var TUBE_RADIAL_SEGMENTS = 8;
  var TUBE_TUBULAR_SEGMENTS = 300; // 与曲线点数（47）相比已经足够平滑，三角面 300*8*2=4800

  var FLOW_RADIUS = 2.35; // 略大于 TUBE_RADIUS，叠在基础管道外层，避免 z-fighting
  var FLOW_REPEAT = 42; // 沿管道长度重复的"彗星"个数

  function requireGlobal(obj, name) {
    if (!obj) throw new Error("[Map3DTrack] " + name + " 未加载，请检查 index.html 的脚本顺序");
    return obj;
  }

  function trackData() {
    return requireGlobal(window.DemoTrack, "window.DemoTrack").track();
  }

  function shared() {
    return requireGlobal(window.Map3DShared, "window.Map3DShared");
  }

  // "彗星"形状的重复贴图：左侧亮、向右指数衰减到全透明，wrapS=RepeatWrapping +
  // repeat.x=FLOW_REPEAT 后就是沿管道方向排开的一串光斑，推进 offset.x 即"流动"。
  function buildFlowTexture(THREE) {
    var width = 64;
    var height = 4;
    var canvas = shared().createCanvas(width, height);
    var ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, width, height);
    var gradient = ctx.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, "rgba(255,255,255,0.95)");
    gradient.addColorStop(0.28, "rgba(200,245,255,0.55)");
    gradient.addColorStop(0.55, "rgba(200,245,255,0.12)");
    gradient.addColorStop(1, "rgba(200,245,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    window.Map3DContract.assertTextureUntainted(canvas);
    var texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.repeat.set(FLOW_REPEAT, 1);
    return texture;
  }

  function createMaterials(THREE) {
    var flowTexture = buildFlowTexture(THREE);
    return {
      pipe: new THREE.MeshStandardMaterial({
        color: "#1f6f86", emissive: "#38c6ec", emissiveIntensity: 0.22, roughness: 0.5, metalness: 0.2
      }),
      flow: new THREE.MeshBasicMaterial({
        color: "#9be8fb",
        alphaMap: flowTexture,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide
      }),
      start: new THREE.MeshStandardMaterial({
        color: "#30c69d", emissive: "#30c69d", emissiveIntensity: 0.4, roughness: 0.4, metalness: 0.1
      }),
      end: new THREE.MeshStandardMaterial({
        color: "#ff625c", emissive: "#ff625c", emissiveIntensity: 0.4, roughness: 0.4, metalness: 0.1
      }),
      walker: new THREE.MeshStandardMaterial({
        color: "#38c6ec", emissive: "#38c6ec", emissiveIntensity: 0.6, roughness: 0.3, metalness: 0.1
      }),
      flowTexture: flowTexture
    };
  }

  function toVector3(THREE, point) {
    return new THREE.Vector3(point[0], point[1], point[2]);
  }

  function build(THREE, materials) {
    var data = trackData();
    var group = new THREE.Group();

    var curvePoints = data.points.map(function (p) { return toVector3(THREE, p); });
    var curve = new THREE.CatmullRomCurve3(curvePoints, false, "catmullrom", 0.5);

    var pipeGeometry = new THREE.TubeGeometry(curve, TUBE_TUBULAR_SEGMENTS, TUBE_RADIUS, TUBE_RADIAL_SEGMENTS, false);
    var pipe = new THREE.Mesh(pipeGeometry, materials.pipe);
    pipe.castShadow = true;
    pipe.receiveShadow = true;
    group.add(pipe);

    var flowGeometry = new THREE.TubeGeometry(curve, TUBE_TUBULAR_SEGMENTS, FLOW_RADIUS, TUBE_RADIAL_SEGMENTS, false);
    var flow = new THREE.Mesh(flowGeometry, materials.flow);
    flow.castShadow = false;
    flow.receiveShadow = false;
    group.add(flow);

    var startPoint = toVector3(THREE, data.start);
    var start = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.6, 0.8, 24), materials.start);
    start.position.set(startPoint.x, MARKER_LIFT, startPoint.z);
    start.castShadow = true;
    start.receiveShadow = true;
    group.add(start);

    var endPoint = toVector3(THREE, data.end);
    var end = new THREE.Mesh(new THREE.BoxGeometry(6, 0.9, 6), materials.end);
    end.position.set(endPoint.x, MARKER_LIFT, endPoint.z);
    end.castShadow = true;
    end.receiveShadow = true;
    group.add(end);

    var walkerPoint = toVector3(THREE, data.walker.point);
    var walker = new THREE.Mesh(new THREE.SphereGeometry(3.0, 16, 12), materials.walker);
    walker.position.set(walkerPoint.x, MARKER_LIFT + 2.2, walkerPoint.z);
    walker.castShadow = true;
    walker.receiveShadow = false;
    group.add(walker);

    return { group: group, flowTexture: materials.flowTexture };
  }

  window.Map3DTrack = {
    createMaterials: createMaterials,
    build: build,
    FLOW_DURATION_MS: 2600,
    FLOW_SPEED: 0.9 // texture.offset.x 每毫秒推进量（已按 repeat 单位换算，见 engine.js 用法）
  };
})();
