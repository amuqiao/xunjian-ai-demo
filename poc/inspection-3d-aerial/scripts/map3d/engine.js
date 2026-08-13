// 站场 3D 巡检地图（俯视/卫星质感 POC）——WebGL 引擎（L3，最后加载，晚于 contract.js /
// model-shared.js / model-aerial.js / model-track.js / data/*.js）。
//
// ==== 本文件与 beng-ai-demo/poc/pump-demo/scripts/pump3d/engine.js 的关系 ====
// 下面几段代码是从 pump3d/engine.js 逐字/近似逐字抄过来的，因为它们与"渲染的是泵还是
// 站场"完全无关，是纯粹的 WebGL/DOM 工程问题（详见任务书与该文件 README 第 4/5/6/8 章）：
//   1) createGLContext + GL_ATTRS —— 自己建 context 再交给 three，同一 canvas 第二次
//      getContext 会静默忽略参数；preserveDrawingBuffer:true 是按需渲染成立的前提。
//   2) createOrbit 的核心机制——deltaMode 归一化、dtMs 归一化阻尼、收敛 snap、
//      lostpointercapture 兜底——原样保留。**改掉的部分**：pump3d 有 dashboard/station
//      两个可切换的相机 preset（含"最短路径 theta"换算），本 POC 全程只有一台相机、
//      不做视角切换（见 contract.js 关于"终生单例、无 setMode"的论证同样适用于相机），
//      所以 applyPreset()/最短路径 theta 换算/入场巡航（intro cruise）全部删除——没有
///     "切换到另一台相机"这件事，也就不存在"防止镜头甩尾"的需要；入场巡航被删除还有
//      一个直接原因：验收要求"静止 1.5s 后 idle===true"，而 pump3d 的入场巡航长达
//      6.5s，会让这条断言在页面刚打开时必然失败——本 POC 用"轨迹流动光带"的有限时长
//      动画（见 updateTrackFlow）替代入场巡航的"开场有点视觉动感"这一诉求，时长收窄到
//      2.6s，验收脚本等待 3.2s 以上再判定 idle。
//   3) markDirty / startLoop —— 按需渲染的脏标记纪律 + 30fps 节流 + 四条静默守卫，
//      原样保留，新增了一路"轨迹流动动画是否仍在播放"的脏源判定（updateTrackFlow）。
//   4) sweepLabels / fitLabelsVertically —— 标签去碰撞算法，原样保留（含"绝不能写成
//      while(changed) 收敛循环"那条红线注释）。
//   5) 阴影 autoUpdate=false + needsUpdate=true 配对 —— 原样保留。
//   6) contextCreated += 1 紧跟 renderer 构造之后 + engineFailed 闩锁 —— 原样保留。
//   7) webglcontextlost -> throw —— 原样保留。
//
// ==== 俯视机位 ====
// 只有一台相机（CAMERA 常量），phi（俯仰角）被钳制在一个较小区间内，让视角始终"接近
// 正俯视但不完全垂直"（见 model-aerial.js 头部注释关于建筑投影的说明）；方位角 theta
// 只允许在初始值附近很小的范围内拖拽（AZIMUTH_CLAMP，约 ±7°），是刻意的简化：指北针
// （styles/03-map3d.css 的 .map-compass）按初始 theta 静态绘制，不随镜头旋转实时重算，
// ±7° 的误差在视觉上可忽略；如果开放到 pump3d 那种大角度自由环绕，指北针要么得跟着
// 每帧重新计算角度，要么会在旋转到一定角度后明显指错方向——本 POC 选择前者的简化版，
// 用小角度约束换掉后者的实现复杂度，见 README「北向指示的简化」一节。
(function () {
  "use strict";

  var LIGHTING = {
    hemisphere: { sky: 0x9fd0e6, ground: 0x2a2416, intensity: 0.72 },
    key: { color: 0xfff3df, intensity: 2.6, position: [340, 560, -300], shadowMapSize: 2048, shadowBias: -0.0007 },
    fill: { color: 0x6fb8d6, intensity: 0.5, position: [-260, 240, 320] },
    envGradient: { top: "#bfe3f2", mid: "#7c8f78", bottom: "#2a2c22", width: 32, height: 16 },
    toneMappingExposure: 1.08
  };

  // 单台相机配置：radius/min/max 世界单位（与 station.js 的坐标系同一套，680×460
  // 站场 + 周边装饰地物共 1200×900 地面，见 model-aerial.js 的 GROUND_WIDTH/DEPTH）。
  // theta = +PI/2（不是 -PI/2）是刻意选的：结合 createOrbit 的相机位置公式与
  // camera.lookAt() 的默认 up=(0,1,0)，+PI/2 让相机的"右手"方向与世界 +X（东）
  // 对齐、"前方水平分量"偏向世界 -Z（北）——也就是屏幕右=东、屏幕上=北，符合
  // 常规地图的读图习惯。实测 -PI/2 会让东西镜像（西反而显示在右边），已改过来。
  // radius=720 是实测校准过的默认值：站场地块 680×460，phi=0.34、fov=42 时，
  // 半可视高度 ≈ radius*cos(phi)*tan(fov/2) ≈ 720*0.943*0.384 ≈ 261，半可视宽度
  // 再乘宿主宽高比（约 1.46）≈ 382——都略大于站场半宽/半深，默认视角能完整装下
  // 12 个区域而不裁边。radius=560（旧值）实测会让南北两端的边界行（genset/vent）
  // 贴边甚至局部裁切，这不是"故意留白"，是当时没有反推可视范围导致的裁切 bug。
  var CAMERA = {
    radius: 720, min: 420, max: 950,
    theta: Math.PI / 2, phi: 0.34,
    target: [0, 0, 0], fov: 42,
    azimuthClamp: 0.12 // ≈ ±6.9°，见文件头「俯视机位」的说明
  };
  var PHI_MIN = 0.17; // ≈ 9.7°，避免过于接近垂直导致 lookAt 的 up 基向量退化
  var PHI_MAX = 0.56; // ≈ 32.1°，避免倾斜过大偏离"近正俯视"

  // 3D 区域热点：核心/发光/脉冲环/引线，尺寸相对 pump3d 的 HOTSPOT 常量按站场与泵机组
  // 的尺度比（680 世界单位 vs 约 24 单位，约 28 倍）重新估算，而不是照抄泵机组的数字。
  var HOTSPOT = {
    coreRadius: 6.2, coreSegments: [16, 12],
    glowRadius: 10, glowOpacity: 0.22, hoverGlowBoost: 0.14,
    ringInner: 17, ringOuter: 21, ringSegments: 32,
    leadOpacity: 0.5, leadDrop: 2, // 引线从锚点垂直向下 2 个世界单位，落到挤出块顶面
    colors: { ok: "#30c69d", warn: "#eeb44a", danger: "#ff625c" },
    pulse: {
      ok: { scale: 1, opacity: 0.22 },
      warn: { scale: 1.3, opacity: 0.36 },
      danger: { scale: 1.65, opacity: 0.5 }
    },
    selection: { color: "#38c6ec", intensity: 0.55 },
    labelCollision: { gap: 8 }
  };

  // 标签越界钳制的上下安全带（像素）：顶部要让开居中的提交状态横幅，底部要让开
  // 横跨全宽的比例尺(左)/轨迹开关+缩放按钮(右)控制带，见 syncLabels 里的用法。
  var LABEL_MARGIN_TOP = 56;
  var LABEL_MARGIN_BOTTOM = 132;

  var DAMPING = 0.14;
  var MAX_DT_MS = 100;
  var ORBIT_EPS_ANGLE = 0.0008;
  var ORBIT_EPS_DIST = 0.02;
  var FRAME_INTERVAL_MS = 1000 / 30;
  var MAX_PIXEL_RATIO = 1.5;
  var ZOOM_STEP_FACTOR = 0.18;

  var engine = null;
  var contextCreated = 0;

  function requireThree() {
    if (!window.THREE) throw new Error("THREE 未加载，请检查 vendor/three.min.js");
    return window.THREE;
  }

  function requireAerialModel() {
    if (!window.Map3DAerial) throw new Error("Map3DAerial 未加载，请检查 scripts/map3d/model-aerial.js");
    return window.Map3DAerial;
  }

  function requireTrackModel() {
    if (!window.Map3DTrack) throw new Error("Map3DTrack 未加载，请检查 scripts/map3d/model-track.js");
    return window.Map3DTrack;
  }

  function requireContract() {
    if (!window.Map3DContract) throw new Error("Map3DContract 未加载，请检查 scripts/map3d/contract.js");
    return window.Map3DContract;
  }

  function clamp(value, lo, hi) {
    return Math.min(hi, Math.max(lo, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function hexToRgb(hex) {
    var value = hex.replace("#", "");
    return [
      parseInt(value.substring(0, 2), 16),
      parseInt(value.substring(2, 4), 16),
      parseInt(value.substring(4, 6), 16)
    ];
  }

  function lerpRgb(a, b, t) {
    return [
      Math.round(lerp(a[0], b[0], t)),
      Math.round(lerp(a[1], b[1], t)),
      Math.round(lerp(a[2], b[2], t))
    ];
  }

  function createGradientTexture(THREE) {
    var width = LIGHTING.envGradient.width;
    var height = LIGHTING.envGradient.height;
    var top = hexToRgb(LIGHTING.envGradient.top);
    var mid = hexToRgb(LIGHTING.envGradient.mid);
    var bottom = hexToRgb(LIGHTING.envGradient.bottom);
    var data = new Uint8Array(width * height * 4);
    var y, x, t, color, idx;
    for (y = 0; y < height; y++) {
      t = y / (height - 1);
      color = t < 0.5 ? lerpRgb(top, mid, t / 0.5) : lerpRgb(mid, bottom, (t - 0.5) / 0.5);
      for (x = 0; x < width; x++) {
        idx = (y * width + x) * 4;
        data[idx] = color[0];
        data[idx + 1] = color[1];
        data[idx + 2] = color[2];
        data[idx + 3] = 255;
      }
    }
    var texture = new THREE.DataTexture(data, width, height);
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  }

  // ---- 摘自 pump3d/engine.js：自己建 context 再交给 three（第 6 章），逐字保留 ----
  var GL_ATTRS = { antialias: true, alpha: true, powerPreference: "high-performance", preserveDrawingBuffer: true };

  function createGLContext(canvas) {
    var gl = canvas.getContext("webgl2", GL_ATTRS) || canvas.getContext("webgl", GL_ATTRS);
    if (!gl) {
      throw new Error("WebGL 不可用，无法渲染 3D 巡检地图：请使用支持 WebGL 的浏览器打开，或检查浏览器的硬件加速设置");
    }
    return gl;
  }

  // ---- 手写轨道控制器：单一相机配置，无 preset 切换（见文件头说明）----
  function createOrbit(camera, canvas, config, notifyDirty) {
    var theta = config.theta;
    var thetaTarget = config.theta;
    var thetaBase = config.theta;
    var phi = config.phi;
    var phiTarget = config.phi;
    var radius = config.radius;
    var radiusTarget = config.radius;
    var radiusMin = config.min;
    var radiusMax = config.max;
    var azimuthClamp = config.azimuthClamp;
    var targetX = config.target[0];
    var targetY = config.target[1];
    var targetZ = config.target[2];

    var dragging = false;
    var pointerId = null;
    var lastX = 0;
    var lastY = 0;
    var lastFrameTime = 0;
    var mobileDisabled = false;
    var reducedMotion = false;
    var host = null;

    camera.fov = config.fov;
    camera.updateProjectionMatrix();

    function endDrag() {
      dragging = false;
      pointerId = null;
      if (host) host.classList.remove("dragging");
    }

    function onPointerDown(event) {
      if (mobileDisabled) return;
      // 多指同时按下时不覆写已有拖拽态：见 pump3d/engine.js 同名函数的注释，
      // 防的是两次 pointerup 都对不上当前 pointerId、dragging 永久卡在 true。
      if (dragging) return;
      dragging = true;
      pointerId = event.pointerId;
      lastX = event.clientX;
      lastY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
      if (host) host.classList.add("dragging");
      notifyDirty();
    }

    function onPointerMove(event) {
      if (!dragging || event.pointerId !== pointerId) return;
      var dx = event.clientX - lastX;
      var dy = event.clientY - lastY;
      lastX = event.clientX;
      lastY = event.clientY;
      thetaTarget -= dx * 0.004;
      phiTarget -= dy * 0.004;
      notifyDirty();
    }

    function onPointerUp(event) {
      if (event.pointerId !== pointerId) return;
      endDrag();
    }

    function onWheel(event) {
      if (mobileDisabled) return;
      event.preventDefault();
      var delta = event.deltaY;
      // deltaMode 归一化：Chrome 给 DOM_DELTA_PIXEL(0)，Firefox 常给 DOM_DELTA_LINE(1)。
      if (event.deltaMode === 1) delta *= 16;
      else if (event.deltaMode === 2) delta *= 100;
      radiusTarget = clamp(radiusTarget * (1 + delta * 0.001), radiusMin, radiusMax);
      notifyDirty();
    }

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    // 覆盖三种绕过 pointerup 的场景：宿主被拆除、系统抢走 capture、鼠标在窗口外释放——
    // 只有 lostpointercapture 一定会触发，否则 dragging 会永久卡死。
    canvas.addEventListener("lostpointercapture", endDrag);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    function zoomBy(step) {
      radiusTarget = clamp(radiusTarget * (1 - step * ZOOM_STEP_FACTOR), radiusMin, radiusMax);
    }

    function update(now) {
      var dtMs = lastFrameTime ? now - lastFrameTime : 16;
      if (dtMs > MAX_DT_MS) dtMs = MAX_DT_MS;
      lastFrameTime = now;

      if (azimuthClamp != null) {
        thetaTarget = clamp(thetaTarget, thetaBase - azimuthClamp, thetaBase + azimuthClamp);
      }
      phiTarget = clamp(phiTarget, PHI_MIN, PHI_MAX);
      radiusTarget = clamp(radiusTarget, radiusMin, radiusMax);

      // 阻尼做成帧率无关：cur += (tgt-cur)*(1-(1-DAMPING)^(dtMs/16.67))。
      var dampingFactor = 1 - Math.pow(1 - DAMPING, dtMs / 16.67);
      theta += (thetaTarget - theta) * dampingFactor;
      phi += (phiTarget - phi) * dampingFactor;
      radius += (radiusTarget - radius) * dampingFactor;

      // 收敛判定：拖拽中一律视为"仍在变化"；否则逐项比较当前值与目标值，全部落在各自
      // 的 epsilon 内才算收敛，收敛时一次性 snap 到 target，避免"永远差一个 epsilon"
      // 导致每帧都判定为"还在变"而持续重绘。
      var settled = !dragging &&
        Math.abs(thetaTarget - theta) < ORBIT_EPS_ANGLE &&
        Math.abs(phiTarget - phi) < ORBIT_EPS_ANGLE &&
        Math.abs(radiusTarget - radius) < ORBIT_EPS_DIST;

      if (settled) {
        theta = thetaTarget;
        phi = phiTarget;
        radius = radiusTarget;
      }

      var sinPhi = Math.sin(phi);
      camera.position.set(
        targetX + radius * sinPhi * Math.cos(theta),
        targetY + radius * Math.cos(phi),
        targetZ + radius * sinPhi * Math.sin(theta)
      );
      camera.lookAt(targetX, targetY, targetZ);

      return !settled;
    }

    return {
      update: update,
      zoomBy: zoomBy,
      setHost: function (nextHost) { host = nextHost; },
      setMobileDisabled: function (value) { mobileDisabled = value; },
      setReducedMotion: function (value) { reducedMotion = value; }
    };
  }

  // 每个区域一个 Group：core(状态色实心球) + glow(叠加发光球) + billboard 脉冲环 +
  // 引线(垂直指回挤出块顶面)。
  function createHotspots(anchors, THREE) {
    var C = requireContract();
    var group = new THREE.Group();
    group.name = "map3d-hotspots";
    var byId = {};
    var list = [];

    C.AREA_IDS.forEach(function (id) {
      var anchor = anchors[id];
      if (!anchor) throw new Error("缺少区域热点锚点: " + id);

      var hotGroup = new THREE.Group();
      hotGroup.position.copy(anchor);

      var core = new THREE.Mesh(
        new THREE.SphereGeometry(HOTSPOT.coreRadius, HOTSPOT.coreSegments[0], HOTSPOT.coreSegments[1]),
        new THREE.MeshBasicMaterial({ color: HOTSPOT.colors.ok })
      );
      hotGroup.add(core);

      var glow = new THREE.Mesh(
        new THREE.SphereGeometry(HOTSPOT.glowRadius, HOTSPOT.coreSegments[0], HOTSPOT.coreSegments[1]),
        new THREE.MeshBasicMaterial({
          color: HOTSPOT.colors.ok, transparent: true, opacity: HOTSPOT.glowOpacity,
          blending: THREE.AdditiveBlending, depthWrite: false
        })
      );
      hotGroup.add(glow);

      var ring = new THREE.Mesh(
        new THREE.RingGeometry(HOTSPOT.ringInner, HOTSPOT.ringOuter, HOTSPOT.ringSegments),
        new THREE.MeshBasicMaterial({
          color: HOTSPOT.colors.ok, transparent: true, opacity: HOTSPOT.pulse.ok.opacity,
          side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false
        })
      );
      hotGroup.add(ring);

      // 引线：从锚点垂直向下 leadDrop 个世界单位，落到挤出块顶面，把飘在空中的热点
      // 和区域块连起来（对应 pump3d 引线指回轴中心线的做法，这里更简单：直接垂直向下）。
      var lineGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -HOTSPOT.leadDrop, 0)
      ]);
      var line = new THREE.Line(
        lineGeometry,
        new THREE.LineBasicMaterial({ color: HOTSPOT.colors.ok, transparent: true, opacity: HOTSPOT.leadOpacity })
      );
      hotGroup.add(line);

      group.add(hotGroup);

      var descriptor = { id: id, group: hotGroup, core: core, glow: glow, ring: ring, line: line };
      byId[id] = descriptor;
      list.push(descriptor);
    });

    return { group: group, byId: byId, list: list };
  }

  function applyHotspotStatusColor(hotspot, status) {
    var color = HOTSPOT.colors[status];
    hotspot.core.material.color.set(color);
    hotspot.glow.material.color.set(color);
    hotspot.ring.material.color.set(color);
    hotspot.line.material.color.set(color);
  }

  function applyHotspotHoverGlow(engine, id) {
    var hs = engine.hotspots.byId[id];
    var hoverBoost = engine.hoverId === id ? HOTSPOT.hoverGlowBoost : 0;
    hs.glow.material.opacity = HOTSPOT.glowOpacity + hoverBoost;
  }

  // 脉冲环按状态一次性设定固定的 scale/opacity（不逐帧动画），状态变化时调用一次即可。
  function applyHotspotStatic(engine, id) {
    var hs = engine.hotspots.byId[id];
    var status = engine.statuses[id];
    var pulse = HOTSPOT.pulse[status];
    hs.ring.scale.setScalar(pulse.scale);
    hs.ring.material.opacity = pulse.opacity;
    applyHotspotHoverGlow(engine, id);
  }

  // 唯一仍需要"每次实际渲染都重新算"的热点状态：脉冲环是 billboard，相机一动就要
  // 跟着转向。只在 startLoop 真正要渲染的那一帧才被调用，静止时不执行，不是永久脏源。
  function updateHotspotBillboards(engine) {
    engine.hotspots.list.forEach(function (hs) {
      hs.ring.quaternion.copy(engine.camera.quaternion);
    });
  }

  function collectMaterials(mesh) {
    return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  }

  function cacheAndApplySelection(engine, id) {
    var meshes = engine.areaMeshes[id];
    if (!meshes) throw new Error("未知的高亮区域: " + id);
    var cache = [];
    meshes.forEach(function (mesh) {
      collectMaterials(mesh).forEach(function (material) {
        cache.push({ material: material, emissive: material.emissive.clone(), emissiveIntensity: material.emissiveIntensity });
      });
    });
    engine.selectionCache[id] = cache;
    cache.forEach(function (entry) {
      entry.material.emissive.set(HOTSPOT.selection.color);
      entry.material.emissiveIntensity = HOTSPOT.selection.intensity;
    });
  }

  function restoreSelection(engine, id) {
    var cache = engine.selectionCache[id];
    cache.forEach(function (entry) {
      entry.material.emissive.copy(entry.emissive);
      entry.material.emissiveIntensity = entry.emissiveIntensity;
    });
    delete engine.selectionCache[id];
  }

  function setActive(engine, id) {
    if (engine.activeAreaId === id) return;
    if (engine.activeAreaId) {
      restoreSelection(engine, engine.activeAreaId);
      setLabelActiveClass(engine, engine.activeAreaId, false);
    }
    engine.activeAreaId = id;
    if (id) {
      cacheAndApplySelection(engine, id);
      setLabelActiveClass(engine, id, true);
    }
    markDirty(engine);
  }

  function setLabelActiveClass(engine, id, isActive) {
    var el = engine.labelEls[id];
    if (!el) return; // mount() 尚未 buildLabelMap 之前允许没有标签元素
    el.classList.toggle("active", isActive);
    el.setAttribute("aria-pressed", isActive ? "true" : "false");
  }

  function setLabelStatusClass(engine, id, status) {
    var el = engine.labelEls[id];
    if (!el) return;
    el.classList.remove("ok", "warn", "danger");
    el.classList.add(status);
  }

  function setStatuses(engine, statuses) {
    var C = requireContract();
    C.assertIdSet("Map3D.setStatuses(statuses)", statuses);
    C.AREA_IDS.forEach(function (id) {
      var status = statuses[id];
      if (C.STATUSES.indexOf(status) < 0) {
        throw new Error("[Map3D] 区域 " + id + " 的 status 非法：" + status + "，应 ∈ [" + C.STATUSES.join(", ") + "]");
      }
      engine.statuses[id] = status;
      var hex = HOTSPOT.colors[status];
      var topMaterial = engine.areaTopMaterials[id];
      topMaterial.color.set(hex);
      topMaterial.emissive.set(hex);
      applyHotspotStatusColor(engine.hotspots.byId[id], status);
      applyHotspotStatic(engine, id);
      setLabelStatusClass(engine, id, status);
    });
    markDirty(engine);
  }

  // ---- 摘自 pump3d/engine.js：标签去碰撞（第 4/14 章），逐字保留 ----
  function labelsCollide(a, b, minDy, minDx) {
    return Math.abs(a.y - b.y) < minDy && Math.abs(a.x - b.x) < minDx;
  }

  function sweepLabels(points, minDy, minDx, push) {
    var i;
    var k;
    for (i = 1; i < points.length; i++) {
      for (k = 0; k < i; k++) {
        if (labelsCollide(points[i], points[k], minDy, minDx)) {
          points[i].y = Math.max(points[i].y, points[k].y + push);
        }
      }
    }
  }

  function fitLabelsVertically(points, top, bottom, minDy, minDx) {
    var n = points.length;
    var avail = bottom - top;
    var gaps = [];
    var needed = 0;
    var i;
    var dx;
    var minGap;
    var gap;
    var shift;
    for (i = 0; i < n - 1; i++) {
      dx = Math.abs(points[i + 1].x - points[i].x);
      minGap = dx < minDx ? minDy : 0;
      gap = points[i + 1].y - points[i].y;
      gaps.push({ gap: gap, min: minGap });
      needed += gap;
    }

    if (needed <= avail) {
      shift = 0;
      if (points[n - 1].y > bottom) shift = bottom - points[n - 1].y;
      else if (points[0].y < top) shift = top - points[0].y;
      for (i = 0; i < n; i++) points[i].y += shift;
      return;
    }

    var deficit = needed - avail;
    var totalSlack = 0;
    for (i = 0; i < gaps.length; i++) totalSlack += Math.max(0, gaps[i].gap - gaps[i].min);
    var factor = totalSlack > 0 ? Math.min(1, deficit / totalSlack) : 0;

    var y = points[0].y;
    var slack;
    for (i = 0; i < gaps.length; i++) {
      slack = Math.max(0, gaps[i].gap - gaps[i].min);
      y += gaps[i].gap - slack * factor;
      points[i + 1].y = y;
    }

    shift = 0;
    if (points[n - 1].y > bottom) shift = bottom - points[n - 1].y;
    if (points[0].y + shift < top) shift = top - points[0].y;
    for (i = 0; i < n; i++) points[i].y += shift;
  }

  // 12 个区域标签的投影 + 全量两两去碰撞。
  function syncLabels(engine) {
    var C = requireContract();
    var width = engine.host.clientWidth;
    var height = engine.host.clientHeight;
    var points = [];

    C.AREA_IDS.forEach(function (id) {
      var el = engine.labelEls[id];
      if (!el) throw new Error("缺少区域标签元素: " + id);
      var anchor = engine.anchors[id];
      engine.scratchVector.copy(anchor).project(engine.camera);
      if (engine.scratchVector.z > 1) {
        el.style.opacity = "0";
        el.style.pointerEvents = "none";
        return;
      }
      el.style.opacity = "";
      el.style.pointerEvents = "";
      points.push({
        id: id, el: el,
        x: (engine.scratchVector.x * 0.5 + 0.5) * width,
        y: (-engine.scratchVector.y * 0.5 + 0.5) * height
      });
    });

    var minDy = engine.labelBoxHeight + HOTSPOT.labelCollision.gap;
    var minDx = engine.labelBoxWidth + HOTSPOT.labelCollision.gap;
    var push = minDy;

    // 固定跑两遍 sweepLabels（不是收敛循环，见 pump3d/engine.js 同名函数注释）：
    // 每遍之间、以及最后一遍之后都要重新按 y 排序。
    points.sort(function (a, b) { return a.y - b.y; });
    sweepLabels(points, minDy, minDx, push);
    points.sort(function (a, b) { return a.y - b.y; });
    sweepLabels(points, minDy, minDx, push);
    points.sort(function (a, b) { return a.y - b.y; });

    var halfWidth = engine.labelBoxWidth / 2;
    var halfHeight = engine.labelBoxHeight / 2;
    // 越界钳制不能只贴宿主四边——底部横跨比例尺(左)/轨迹开关+缩放按钮(右)一整条
    // 控制带，顶部中央还有提交状态横幅，标签一旦被推到这些区域会挡住可点击控件
    // （实测：缩小到最外层缩放档位时"收发球"标签会飘到右下角，盖住缩放按钮，
    // 点击被它截获）。所以上下各留一条安全边距，比 labelBoxHeight/2 更宽，
    // 左右不需要额外留边——指北针/比例尺都紧贴在顶部与底部安全带内，不单独占用
    // 左右空间。
    var safeTop = Math.max(halfHeight, LABEL_MARGIN_TOP);
    var safeBottom = height - Math.max(halfHeight, LABEL_MARGIN_BOTTOM);
    fitLabelsVertically(points, safeTop, safeBottom, minDy, minDx);
    points.forEach(function (p) {
      p.x = clamp(p.x, halfWidth, width - halfWidth);
      p.y = clamp(p.y, safeTop, safeBottom);
    });

    points.forEach(function (p) {
      p.el.style.transform = "translate3d(" + p.x + "px," + p.y + "px,0) translate(-50%,-50%)";
    });

    updateScaleBar(engine, width, height);
  }

  // 比例尺：把两个相距 SCALE_REF_DISTANCE 世界单位的地面参考点投影到屏幕，量它们的
  // 像素距离写进 .map-scale-bar 的宽度——随镜头缩放/俯仰联动，不是写死的像素数。
  // 参考点选在站场西南角外侧（地面纹理的农田装饰区），三种缩放档位下都留在视野内。
  var SCALE_REF_DISTANCE = 100;
  var SCALE_REF_Z = 250;
  var SCALE_REF_X1 = -260;
  var SCALE_REF_X2 = SCALE_REF_X1 + SCALE_REF_DISTANCE;

  function updateScaleBar(engine, width, height) {
    if (!engine.scaleBarEl) throw new Error("缺少 .map-scale-bar 元素，请确认 renderMapHost() 已渲染比例尺");
    engine.scratchVector.set(SCALE_REF_X1, 0, SCALE_REF_Z).project(engine.camera);
    var ax = (engine.scratchVector.x * 0.5 + 0.5) * width;
    var ay = (-engine.scratchVector.y * 0.5 + 0.5) * height;
    engine.scratchVector.set(SCALE_REF_X2, 0, SCALE_REF_Z).project(engine.camera);
    var bx = (engine.scratchVector.x * 0.5 + 0.5) * width;
    var by = (-engine.scratchVector.y * 0.5 + 0.5) * height;
    var barPx = Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay));
    engine.scaleBarEl.style.width = Math.max(4, barPx) + "px";
  }

  function bindScaleBar(engine, host) {
    var bar = host.querySelector(".map-scale-bar");
    if (!bar) throw new Error("缺少 .map-scale-bar 元素，请确认 renderMapHost() 已渲染比例尺");
    engine.scaleBarEl = bar;
  }

  function buildLabelMap(engine, host) {
    var C = requireContract();
    var labelsRoot = host.querySelector("." + C.LABELS_CLASS);
    if (!labelsRoot) throw new Error("缺少 ." + C.LABELS_CLASS + " 容器");
    var map = {};
    var maxWidth = 0;
    var maxHeight = 0;
    labelsRoot.querySelectorAll("[" + C.PIN_ATTR + "]").forEach(function (button) {
      var id = button.getAttribute(C.PIN_ATTR);
      map[id] = button;
      if (button.offsetWidth > maxWidth) maxWidth = button.offsetWidth;
      if (button.offsetHeight > maxHeight) maxHeight = button.offsetHeight;
      button.addEventListener("pointerenter", function () {
        engine.hoverId = id;
        applyHotspotHoverGlow(engine, id);
        markDirty(engine);
      });
      button.addEventListener("pointerleave", function () {
        if (engine.hoverId === id) engine.hoverId = null;
        applyHotspotHoverGlow(engine, id);
        markDirty(engine);
      });
    });
    engine.labelEls = map;
    engine.labelBoxWidth = maxWidth;
    engine.labelBoxHeight = maxHeight;
  }

  function resize(engine) {
    if (!engine.host) return;
    var width = engine.host.clientWidth;
    var height = engine.host.clientHeight;
    if (width === 0 || height === 0) return;
    var pixelRatio = Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO);
    if (engine.renderer.getPixelRatio() !== pixelRatio) engine.renderer.setPixelRatio(pixelRatio);
    engine.renderer.setSize(width, height, false);
    engine.camera.aspect = width / height;
    engine.camera.updateProjectionMatrix();
    markDirty(engine);
  }

  // 轨迹流动光带：有限时长播放，播完停（不是永久脏源）。返回 true 表示本帧仍需要
  // 因为这段动画而继续渲染；返回 false 表示动画已结束（或从未启用）。
  function updateTrackFlow(engine, now) {
    var flow = engine.trackFlow;
    if (!flow.active) return false;
    if (flow.startTime === null) flow.startTime = now;
    if (flow.lastTime === null) flow.lastTime = now;
    var dt = now - flow.lastTime;
    flow.lastTime = now;
    engine.flowTexture.offset.x -= (window.Map3DTrack.FLOW_SPEED * dt) / 1000;
    if (now - flow.startTime >= window.Map3DTrack.FLOW_DURATION_MS) {
      flow.active = false;
      return false;
    }
    return true;
  }

  // ---- 摘自 pump3d/engine.js：脏标记 + 按需渲染循环（第 14 章），逐字保留，
  // 新增 updateTrackFlow 这一路脏源 ----
  function markDirty(engine) {
    engine.dirty = true;
    if (!engine.frameScheduled) {
      engine.frameScheduled = true;
      engine.rafId = window.requestAnimationFrame(engine.frameFn);
    }
  }

  function startLoop(engine) {
    function frame(now) {
      engine.frameScheduled = false;

      if (!engine.host || !engine.host.isConnected) return;
      if (document.hidden) return;
      if (!engine.visible) return;
      if (engine.host.clientWidth === 0 || engine.host.clientHeight === 0) return;

      var moving = engine.orbit.update(now);
      var flowing = updateTrackFlow(engine, now);
      if (moving || flowing) engine.dirty = true;

      if (!engine.dirty) return; // 真正静止：不渲染，也不再请求下一帧

      if (now - engine.lastRenderTime < FRAME_INTERVAL_MS) {
        engine.frameScheduled = true;
        engine.rafId = window.requestAnimationFrame(frame);
        return;
      }
      engine.lastRenderTime = now;

      engine.camera.updateMatrixWorld();
      updateHotspotBillboards(engine);
      syncLabels(engine);

      engine.renderer.render(engine.scene, engine.camera);
      engine.frames += 1;

      if (!moving && !flowing) engine.dirty = false;

      if (engine.dirty) {
        engine.frameScheduled = true;
        engine.rafId = window.requestAnimationFrame(frame);
      }
    }

    engine.frameFn = frame;
    markDirty(engine);
  }

  function createEngine() {
    var THREE = requireThree();
    var Aerial = requireAerialModel();
    var Track = requireTrackModel();
    var C = requireContract();

    var canvas = document.createElement("canvas");
    canvas.className = C.CANVAS_CLASS;
    canvas.setAttribute("aria-hidden", "true"); // 3D 造型对屏幕阅读器是纯装饰，信息由标签按钮承载

    var gl = createGLContext(canvas);
    var renderer = new THREE.WebGLRenderer({ canvas: canvas, context: gl });
    // 紧跟 renderer 构造之后计数：createEngine 中途抛错时也不会漏计，见 pump3d/engine.js
    // 同名注释（第 6 章）。
    contextCreated += 1;
    renderer.setClearColor(0x1c2b36, 1);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = LIGHTING.toneMappingExposure;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // 场景静止、光源终生不动：阴影贴图只需生成一次。两行必须同时设——只设
    // autoUpdate=false 会导致阴影从头到尾都不生成（见 pump3d/engine.js 第 6 章原话）。
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, 0.1, 3000);

    var hemi = new THREE.HemisphereLight(LIGHTING.hemisphere.sky, LIGHTING.hemisphere.ground, LIGHTING.hemisphere.intensity);
    scene.add(hemi);

    var key = new THREE.DirectionalLight(LIGHTING.key.color, LIGHTING.key.intensity);
    key.position.set(LIGHTING.key.position[0], LIGHTING.key.position[1], LIGHTING.key.position[2]);
    key.castShadow = true;
    key.shadow.mapSize.set(LIGHTING.key.shadowMapSize, LIGHTING.key.shadowMapSize);
    key.shadow.bias = LIGHTING.key.shadowBias;
    key.shadow.camera.left = -400;
    key.shadow.camera.right = 400;
    key.shadow.camera.top = 280;
    key.shadow.camera.bottom = -280;
    key.shadow.camera.near = 50;
    key.shadow.camera.far = 1400;
    scene.add(key);

    var fill = new THREE.DirectionalLight(LIGHTING.fill.color, LIGHTING.fill.intensity);
    fill.position.set(LIGHTING.fill.position[0], LIGHTING.fill.position[1], LIGHTING.fill.position[2]);
    scene.add(fill);

    var pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    var gradientTexture = createGradientTexture(THREE);
    scene.environment = pmrem.fromEquirectangular(gradientTexture).texture;
    gradientTexture.dispose();
    pmrem.dispose();

    var aerialMaterials = Aerial.createMaterials(THREE, renderer);
    var builtAerial = Aerial.build(THREE, aerialMaterials);
    scene.add(builtAerial.group);

    var trackMaterials = Track.createMaterials(THREE);
    var builtTrack = Track.build(THREE, trackMaterials);
    scene.add(builtTrack.group);

    var hotspots = createHotspots(builtAerial.anchors, THREE);
    scene.add(hotspots.group);

    var instance;
    var orbit = createOrbit(camera, canvas, CAMERA, function () { markDirty(instance); });

    instance = {
      THREE: THREE,
      canvas: canvas,
      renderer: renderer,
      scene: scene,
      camera: camera,
      areaMeshes: builtAerial.areaMeshes,
      areaTopMaterials: builtAerial.areaTopMaterials,
      anchors: builtAerial.anchors,
      trackGroup: builtTrack.group,
      flowTexture: builtTrack.flowTexture,
      trackFlow: { active: true, startTime: null, lastTime: null },
      hotspots: hotspots,
      orbit: orbit,
      host: null,
      labelEls: {},
      scaleBarEl: null,
      labelBoxWidth: 0,
      labelBoxHeight: 0,
      activeAreaId: null,
      selectionCache: {},
      statuses: {},
      hoverId: null,
      mountCount: 0,
      frames: 0,
      rafId: 0,
      visible: true,
      dirty: false,
      frameScheduled: false,
      lastRenderTime: 0,
      frameFn: null,
      scratchVector: new THREE.Vector3()
    };

    var pointerQuery = window.matchMedia("(pointer: coarse)");
    var reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    orbit.setMobileDisabled(pointerQuery.matches);
    orbit.setReducedMotion(reducedMotionQuery.matches);
    pointerQuery.addEventListener("change", function (event) { orbit.setMobileDisabled(event.matches); });
    reducedMotionQuery.addEventListener("change", function (event) {
      orbit.setReducedMotion(event.matches);
      markDirty(instance);
    });

    instance.resizeObserver = new ResizeObserver(function () { resize(instance); });
    instance.intersectionObserver = new IntersectionObserver(function (entries) {
      var wasVisible = instance.visible;
      instance.visible = entries[entries.length - 1].isIntersecting;
      if (instance.visible && !wasVisible) markDirty(instance);
    });

    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) markDirty(instance);
    });

    window.addEventListener("focus", function () { markDirty(instance); });
    window.addEventListener("pageshow", function () { markDirty(instance); });
    canvas.addEventListener("webglcontextrestored", function () { markDirty(instance); });
    canvas.addEventListener("webglcontextlost", function () {
      throw new Error("3D 巡检地图的 WebGL 上下文已丢失（通常是 GPU 驱动重置或显存不足），请刷新页面");
    });

    startLoop(instance);

    return instance;
  }

  var engineFailed = false;

  function ensureEngine() {
    // 快速失败闩锁，不是兜底：见 pump3d/engine.js 第 6 章「快速失败闩锁」的原话。
    if (engineFailed) {
      throw new Error("Map3D 引擎首次初始化已失败，请修复上一次的报错后刷新页面");
    }
    if (!engine) {
      engineFailed = true;
      engine = createEngine();
      engineFailed = false;
    }
    return engine;
  }

  function mount(host, options) {
    if (!host) throw new Error("Map3D.mount 需要有效的宿主元素");
    if (!options || !options.statuses) throw new Error("Map3D.mount 需要 options.statuses");

    var instance = ensureEngine();

    host.insertBefore(instance.canvas, host.firstChild);
    instance.host = host;
    instance.orbit.setHost(host);

    // 契约要求 insert canvas 之后立刻读 clientWidth/clientHeight：合法的 0×0 不存在，
    // CSS 布局失误必须在第一次渲染就炸出来（见 contract.js 的 assertDom 注释）。
    requireContract().assertDom(host, options);

    buildLabelMap(instance, host);
    bindScaleBar(instance, host);

    instance.resizeObserver.disconnect();
    instance.resizeObserver.observe(host);
    instance.intersectionObserver.disconnect();
    instance.intersectionObserver.observe(host);

    setActive(instance, options.activeAreaId || null);
    setStatuses(instance, options.statuses);

    instance.mountCount += 1;

    resize(instance);
  }

  function detach() {
    if (!engine) return;
    engine.resizeObserver.disconnect();
    engine.intersectionObserver.disconnect();
    if (engine.canvas.parentNode) engine.canvas.parentNode.removeChild(engine.canvas);
    engine.host = null;
    engine.hoverId = null;
    engine.labelEls = {};
    engine.orbit.setHost(null);
  }

  function setActiveArea(areaId) {
    if (!engine) throw new Error("Map3D 尚未挂载，无法设置高亮区域");
    if (areaId != null && requireContract().AREA_IDS.indexOf(areaId) < 0) {
      throw new Error("[Map3D] setActiveArea 收到非法 areaId：" + areaId);
    }
    setActive(engine, areaId);
  }

  function setStatusesApi(statuses) {
    if (!engine) throw new Error("Map3D 尚未挂载，无法设置区域状态");
    setStatuses(engine, statuses);
  }

  function setTrackVisible(visible) {
    if (!engine) throw new Error("Map3D 尚未挂载，无法设置轨迹可见性");
    engine.trackGroup.visible = !!visible;
    markDirty(engine);
  }

  function zoom(step) {
    if (!engine) throw new Error("Map3D 尚未挂载，无法缩放");
    if (typeof step !== "number" || !isFinite(step)) {
      throw new Error("[Map3D] zoom(step) 的 step 必须是有限数字，实际为 " + step);
    }
    engine.orbit.zoomBy(step);
    markDirty(engine);
  }

  function debugInfo() {
    if (!engine) throw new Error("Map3D 尚未挂载，无法获取调试信息");
    var width = engine.host ? engine.host.clientWidth : 0;
    var height = engine.host ? engine.host.clientHeight : 0;
    return {
      contextCreated: contextCreated,
      mountCount: engine.mountCount,
      renderCalls: engine.renderer.info.render.calls,
      triangles: engine.renderer.info.render.triangles,
      frames: engine.frames,
      idle: !engine.dirty,
      activeAreaId: engine.activeAreaId,
      width: width,
      height: height,
      aspect: height ? width / height : 0,
      memory: {
        geometries: engine.renderer.info.memory.geometries,
        textures: engine.renderer.info.memory.textures
      }
    };
  }

  window.Map3D = {
    mount: mount,
    detach: detach,
    setActiveArea: setActiveArea,
    setStatuses: setStatusesApi,
    setTrackVisible: setTrackVisible,
    zoom: zoom,
    debugInfo: debugInfo
  };
})();
