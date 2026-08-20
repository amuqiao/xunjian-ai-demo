// 站场 3D 巡检地图——巡检轨迹模型：window.Map3DTrackModel。
//
// 数据源：window.DemoTrack.track()（47 点折线 + 12 个区域 waypoint + 起点/终点/
// 巡检人当前位置），坐标系与 scripts/data/station.js 完全同一套，本文件不做任何
// 坐标换算，原样把 [x,y,z] 三元组交给 CatmullRomCurve3。
//
// 不能用 THREE.Line 表现"流动光带"：r160 UMD 没有 Line2（只有 examples/jsm 里才有，
// 本项目零构建、只拿 vendor/three.min.js 这一个 UMD 文件），而 LineBasicMaterial.
// linewidth 在几乎所有平台（Windows ANGLE 尤其）被浏览器 WebGL 实现钳到 1px、
// 不管代码里写多大都没有视觉效果。改用 CatmullRomCurve3 + TubeGeometry 画一根
// 有真实截面半径的管状网格，贴一张沿长度方向重复的条纹 CanvasTexture，靠
// texture.offset.x 推进制造"流动"观感——这是 three r160 UMD 下能做到"看起来在流动
// 的粗线条"的唯一低成本路径。
//
// 播放纪律（与引擎"有限入场巡航"同构，参见 /Users/admin/Code/beng-ai-demo/poc/pump-demo/scripts/pump3d/engine.js 的
// INTRO_CRUISE_DURATION_MS 注释）：光带流动只在明确的"播放路线"动作期间播放
// FLOW_DURATION_MS 毫秒，播完自行停止，不是持续滚动的永久动画。持续滚动会让
// texture.offset 永远在变，从而让引擎的按需渲染判定（markDirty/startLoop）永远
// 拿不到"真正静止"这个状态——这与 /Users/admin/Code/beng-ai-demo/poc/pump-demo/scripts/pump3d/engine.js 把选中态高亮/脉冲环从"逐帧
// 动画"改成"一次性设定固定值"是同一条纪律，静止是本项目的核心不变量，不允许
// 为了视觉效果破例。
//
// 起点 / 终点 / 巡检人三个标记改用 THREE.Sprite（而不是像区域热点那样手动在
// 每帧把 quaternion 对齐到相机）：Sprite 是 three.js 内置的"永远面向相机"图元，
// 用在这里比再实现一遍 billboard 逻辑更简单、且不需要引擎的 RAF 循环参与更新。
(function () {
  "use strict";

  function requireTHREE(THREE, fnName) {
    if (!THREE) throw new Error("[Map3DTrackModel] " + fnName + " 缺少 THREE 参数");
  }

  function requireContract() {
    if (!window.Map3DContract) throw new Error("[Map3DTrackModel] window.Map3DContract 未加载");
    return window.Map3DContract;
  }

  function assertUntainted(canvas) {
    requireContract().assertTextureUntainted(canvas);
  }

  // 有限播放时长与流速：2.4 秒内让条纹跑完约 6 个周期的观感，足够看出"正在流动"，
  // 又不会长到让人觉得是常驻动画。
  var FLOW_DURATION_MS = 2400;
  var FLOW_CYCLES = 6;

  // ---- 尺度常量（2026-08-20 随底图从沙盘换成站点平面图一起放大）----
  // 旧值是 TUBE_RADIUS=0.42 / STRIPE_PERIOD=24 / 标记 scale 7~8，那是给 680×460 的
  // 沙盘地块定的。平面图地块 1258×713、相机也相应拉远，沿用旧值实测的结果是：
  // 轨迹变成一根几乎看不见的发丝，起点/终点/巡检人三个标记缩成三个像素点——而
  // 本次改造的需求恰恰是"只需要关注巡检员、轨迹"，这条最该被看见的东西反而最不
  // 显眼。这里按地块跨度等比放大约 9 倍（不是 1.85 倍：旧值本身就偏细，沙盘那版
  // 靠深色底衬着才勉强读得出来）。
  // 半径 3.2 而不是 4：4 实测把沿途几处消防通道箭头压住了一半。轨迹要显眼，但它
  // 走的就是那几条通道，不该把通道本身的方向标识盖掉。
  var TUBE_RADIUS = 3.2;
  var STRIPE_PERIOD = 64;
  var MARKER_SCALE_ENDPOINT = 44;
  var MARKER_SCALE_WALKER = 52;
  // 标记贴图悬在轨迹上方的高度，避免半个圆片埋进管体。
  var MARKER_LIFT = 9;

  function toVector3(THREE, p) {
    return new THREE.Vector3(p[0], p[1], p[2]);
  }

  // 沿长度方向重复的条纹纹理：底色透明、每个周期内画一段渐亮的青色色带
  // （模拟"流光"从暗到亮再到暗的一节），RepeatWrapping + repeat.x 按管长/条纹
  // 周期换算，让条纹间距与管道实际长度成比例、不随轨迹总长变化而拉伸变形。
  function buildFlowTexture(THREE, repeatX) {
    var width = 128;
    var height = 32;
    var canvas = window.Map3DShared.createCanvas(width, height);
    var ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, width, height);
    var gradient = ctx.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0.0, "rgba(56,198,236,0)");
    gradient.addColorStop(0.5, "rgba(210,250,255,0.95)");
    gradient.addColorStop(1.0, "rgba(56,198,236,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    assertUntainted(canvas);
    var texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.repeat.set(repeatX, 1);
    return texture;
  }

  // 标记徽标纹理：一个圆底 + 居中符号，供 THREE.Sprite 使用。
  function buildBadgeTexture(THREE, options) {
    var size = 128;
    var canvas = window.Map3DShared.createCanvas(size, size);
    var ctx = canvas.getContext("2d");
    var cx = size / 2;
    var cy = size / 2;
    ctx.clearRect(0, 0, size, size);
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.36, 0, Math.PI * 2);
    ctx.fillStyle = options.fill;
    ctx.fill();
    ctx.lineWidth = size * 0.06;
    ctx.strokeStyle = options.stroke;
    ctx.stroke();
    ctx.fillStyle = options.glyphColor || "#06222c";
    ctx.font = "bold " + Math.round(size * 0.32) + "px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(options.glyph, cx, cy + 1);

    assertUntainted(canvas);
    return new THREE.CanvasTexture(canvas);
  }

  function buildMarker(THREE, point, options, scale) {
    var texture = buildBadgeTexture(THREE, options);
    var material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: true });
    var sprite = new THREE.Sprite(material);
    sprite.position.set(point[0], point[1] + MARKER_LIFT, point[2]);
    sprite.scale.set(scale, scale, 1);
    return sprite;
  }

  // build(THREE, track, notifyDirty) -> { group, setVisible(bool) }
  //   track        window.DemoTrack.track() 的返回值
  //   notifyDirty  引擎的 markDirty 回调（闭包引用，供播放期间每帧唤醒渲染循环）
  function build(THREE, track, notifyDirty) {
    requireTHREE(THREE, "build");
    if (!track || !Array.isArray(track.points) || track.points.length < 2) {
      throw new Error("[Map3DTrackModel] build() 需要 track.points（至少 2 个点）");
    }
    if (typeof notifyDirty !== "function") {
      throw new Error("[Map3DTrackModel] build() 需要 notifyDirty 回调函数");
    }

    var group = new THREE.Group();
    group.name = "map3d-track";
    group.visible = false;

    var points = track.points.map(function (p) { return toVector3(THREE, p); });
    var curve = new THREE.CatmullRomCurve3(points);
    var tubeSegments = Math.max(64, points.length * 4);
    var tubeGeometry = new THREE.TubeGeometry(curve, tubeSegments, TUBE_RADIUS, 8, false);
    var curveLength = curve.getLength();
    var repeatX = Math.max(1, Math.round(curveLength / STRIPE_PERIOD));
    var flowTexture = buildFlowTexture(THREE, repeatX);
    var tubeMaterial = new THREE.MeshBasicMaterial({
      map: flowTexture,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    var tube = new THREE.Mesh(tubeGeometry, tubeMaterial);
    tube.castShadow = false;
    tube.receiveShadow = false;
    group.add(tube);

    group.add(buildMarker(THREE, track.start, { fill: "#30c69d", stroke: "rgba(234,246,251,0.9)", glyph: "▶" }, MARKER_SCALE_ENDPOINT));
    group.add(buildMarker(THREE, track.end, { fill: "#ff625c", stroke: "rgba(234,246,251,0.9)", glyph: "■" }, MARKER_SCALE_ENDPOINT));
    group.add(buildMarker(THREE, track.walker.point, { fill: "#38c6ec", stroke: "rgba(234,246,251,0.95)", glyph: "●" }, MARKER_SCALE_WALKER));

    var playing = false;
    var playStartTime = 0;
    var lastTickTime = 0;
    var rafHandle = 0;

    function tick(now) {
      if (!playing) return;
      var dtMs = lastTickTime ? now - lastTickTime : 16;
      lastTickTime = now;
      var elapsed = now - playStartTime;
      if (elapsed >= FLOW_DURATION_MS) {
        playing = false;
        return;
      }
      // 整段播放时长内让 offset 前进 FLOW_CYCLES 个周期，速度是常量、与帧率无关
      // （按 dtMs 归一化）。
      flowTexture.offset.x -= (FLOW_CYCLES / FLOW_DURATION_MS) * dtMs;
      notifyDirty();
      rafHandle = window.requestAnimationFrame(tick);
    }

    function startFlow() {
      playing = true;
      playStartTime = window.performance.now();
      lastTickTime = 0;
      rafHandle = window.requestAnimationFrame(tick);
    }

    function stopFlow() {
      playing = false;
      if (rafHandle) {
        window.cancelAnimationFrame(rafHandle);
        rafHandle = 0;
      }
    }

    // 只在"从隐藏变为可见"这个跳变上触发一次有限时长播放；已经可见时重复调用
    // setVisible(true)（比如引擎每次 mount() 都会用当前 state.showTrack 调一次）
    // 是幂等的，不会反复重播——播放只应该由用户"点击轨迹按钮打开"这个动作触发，
    // 不是每次渲染都重放。
    function setVisible(visible) {
      if (visible === true) {
        if (!group.visible) {
          group.visible = true;
          startFlow();
        }
        return;
      }
      group.visible = false;
      stopFlow();
    }

    return { group: group, setVisible: setVisible };
  }

  window.Map3DTrackModel = {
    build: build
  };
})();
