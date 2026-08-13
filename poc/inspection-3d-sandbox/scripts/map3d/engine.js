// 站场 3D 巡检地图引擎：window.Map3D。
//
// 本文件是从 scripts/pump3d/engine.js 抄写改造而来，不是重新设计——那份 1109 行的
// 文件里，与"渲染的是泵还是站场"完全无关的免费资产（约 700 行）逐字保留：
//   1) createGLContext + GL_ATTRS（自建 context 再交给 three；preserveDrawingBuffer +
//      focus/pageshow/visibilitychange 唤醒钩子）
//   2) createOrbit 的核心阻尼/拖拽/滚轮/入场巡航逻辑（手写轨道控制器，r160 UMD 没有
//      OrbitControls）
//   3) markDirty / startLoop（按需渲染的脏标记纪律 + 30fps 节流 + 四条静默守卫）
//   4) sweepLabels / fitLabelsVertically（标签去碰撞，含"绝不能写成 while(changed)
//      收敛循环"那条红线注释）
//   5) 阴影 autoUpdate=false + needsUpdate=true 配对
//   6) contextCreated += 1 紧跟 renderer 构造之后 + engineFailed 闩锁
//   7) webglcontextlost -> throw
//
// 明确丢弃/改写的 4 处泵专属硬编码：
//   - 一维 PART_IDS 遍历 -> Map3DContract.AREA_IDS（12 个区域）
//   - 闭合两键 PRESETS（dashboard/station）-> 站场两档机位（overview/area），
//     未知键仍然抛错
//   - 热点引线硬编码的泵轴中心线 y=4.6 -> 指回 model 给的 anchors（区块顶面中心）
//   - getObjectByName("pump3d-grid") 的强制要求 -> 整段删除（沙盘网格已烘进
//     model-sandbox.js 的地面纹理，不再需要一个独立的 GridHelper 对象）
//
// 额外的、pump3d 没有的必要扩展（因为"泵的 6 个部位坐标固定不变" vs "12 个区域
// 分布在 680x460 的站场各处，选中哪个区域相机就要飞到哪里"这个本质差异）：
//   - PRESETS.area 没有固定 target——它必须随当前选中的区域变化。createOrbit()
//     新增 retarget(target)（只改 target*Target，不碰 theta/phi/radius/fov，也不
//     触发入场巡航）：在同一个 preset 内切换选中区域时只做平滑的镜头平移，不重放
//     "进入巡航"这个只该在 overview<->area 切换那一刻出现的强调动作。
//   - createOrbit() 的初始 target 支持从调用方传入的 initialTarget 覆盖（而不是
//     只能取 PRESETS 表里的静态字面量）：首次挂载如果 activeAreaId 已经非空（比如
//     持久化状态记得用户上次停在某个区域），相机要直接落在那个区域上，而不是先
//     出现在 PRESETS.area 的占位默认位置再纠正。
(function () {
  "use strict";

  var LIGHTING = {
    // intensity 比早先版本低（0.72 -> 0.4）：环境光太强会让建筑物朝向 key 光源的
    // 屋顶面、和背光的墙面亮度差被压得很小，实测在 area 预设近距离取景下，
    // 矮层建筑（墙高只有 4~7 个世界单位）会因此看起来像一块没有体积感的
    // 发光平板——降低环境光占比，让方向光造成的明暗对比重新显出屋顶/墙面的
    // 体块转折。
    hemisphere: { sky: 0x8fd4ea, ground: 0x0b1117, intensity: 0.4 },
    // 两个 preset 的相机都落在南侧（phi<PI/2、theta 取向南），打光方位跟着来：
    // 主光从东北高处打下（迎着大多数建筑的北墙/入口面），暖辅光从西侧补，
    // 青色轮廓光留在北侧勾边——与 pump3d 的"布光方位必须跟着 PRESETS 的实际机位算"
    // 是同一条纪律，只是这里的机位换成了站场俯视角。
    key: { color: 0xffffff, intensity: 3.1, position: [220, 340, -140], shadowMapSize: 2048, shadowBias: -0.0006, shadowCamSize: 420 },
    rimAmber: { color: 0xf0c887, intensity: 1.1, position: [-260, 120, -80] },
    rimCyan: { color: 0x4bb3d3, intensity: 1.0, position: [0, 160, 260] },
    envGradient: { top: "#2e4d5e", mid: "#16232c", bottom: "#0a1218", width: 32, height: 16 },
    toneMappingExposure: 1.22
  };

  // 站场两档机位：overview（12 区全景）/ area（单区下钻）。overview 的 phi 取
  // 较小值（更接近俯视）——沙盘横跨 680(X)x460(Z)，斜视角越大，Z 方向在屏幕上
  // 被压缩得越厉害（12 个标签要在屏幕上散成 4 列 x 3~4 行，见 model-sandbox.js
  // AREA_DEFS 的 grid 字段），必须压低 phi 换取更多纵向像素跨度，这条在
  // verify 的标签重叠扫描里实测过。area 的 phi 更大、更贴近水平视角，因为下钻后
  // 只关心一个区域内部的设备造型，不需要保留全站的俯视纵深。
  // area 没有固定 target——由 mount()/setActiveArea() 现场算出当前选中区域的
  // 几何中心并通过 createOrbit().retarget() 或 applyPreset() 的 targetOverride
  // 参数注入，这里的 target 字面量只在"引擎刚创建、还没有 mount 过"这个瞬间当占位。
  var PRESETS = {
    overview: { radius: 640, min: 460, max: 900, theta: -1.15, phi: 0.52, target: [0, 6, 15], fov: 40, azimuthClamp: null },
    // area 的 azimuthClamp 必须是一个较小的有限值（而不是像 overview 那样 null）：
    // 入场巡航会让 thetaTarget 持续累加 INTRO_CRUISE_DURATION_MS(6.5s) * 0.00016 rad/ms
    // ≈ 1.04 rad（约 60°）——overview 允许这样"转半圈看全局"，但 area 是"对准一个
    // 具体区域看细节"，放任它转 60° 会让下钻动作结束时相机停在一个完全没设计过、
    // 经常很难看的角度（这正是本地实测撞见的问题：cabinet 建筑的北墙玻璃窗带被
    // 转到接近贴着镜头的角度，几乎糊满整个画面）。夹到 ±0.3 rad（≈17°）的小幅
    // 摇摆，观感上仍有"入场时轻轻转一下"的巡航感，但转完落点始终贴近设计好的
    // theta，不会转出一个意外的难看构图。
    // phi 比 overview 大得多（更接近水平视角）：区域内的建筑/设备普遍只有
    // 4~7 个世界单位高（很矮的单层建筑/棚），在 overview 那种接近俯视的角度下
    // 高度差会被压缩到几乎看不出来，下钻后必须换成更贴近水平的视角，才能让
    // 墙面/罐体的竖直造型读出来，而不是看起来像一块贴地的发光色块。
    // phi 取一个介于"能看清楚区域内设备体块转折"和"能保留足够俯视纵深"之间的
    // 折中值——12 个区域里大多数是只有 4~7 个世界单位高的单层建筑/敞棚（真实
    // 巡检标准原文对应的就是矮小的阀室/机柜间/发电机棚，不是高层建筑），在
    // 680x460 的站场尺度下，任何视角都不可能把这类矮建筑拍出"landmark 大楼"
    // 那种体量感——这是被摄对象本身的真实比例，不是渲染缺陷。这里选的角度
    // 已经能看到墙面/屋顶的明暗转折与设备阴影，同时仍保留判断"我在看哪个区域、
    // 周围还有哪些区域"所需的俯视纵深。
    area: { radius: 200, min: 130, max: 320, theta: -1.15, phi: 1.15, target: [0, 5, 0], fov: 38, azimuthClamp: 0.3 }
  };

  var HOTSPOT = {
    coreRadius: 3.4,
    coreSegments: [16, 12],
    glowRadius: 5.4,
    glowOpacity: 0.18,
    hoverGlowBoost: 0.15,
    ringInner: 10.5,
    ringOuter: 12.5,
    ringSegments: 32,
    leadOpacity: 0.5,
    // 热点悬浮在区块顶面中心正上方 hoverHeight 处，引线从悬浮位置垂直落回
    // model 给的 anchors（区块顶面中心）——这就是文件头"4 处改写"里提到的
    // "热点引线硬编码的泵轴中心线 -> 指回 anchors"具体落地的地方。
    hoverHeight: 30,
    colors: { ok: "#30c69d", warn: "#eeb44a", danger: "#ff625c" },
    pulse: {
      ok: { scale: 1, opacity: 0.25 },
      warn: { scale: 1.35, opacity: 0.4 },
      danger: { scale: 1.75, opacity: 0.55 }
    },
    // intensity 比 pump3d 的 0.42 低得多：那边高亮的是泵体上一小片金属部件，
    // 这里"选中一个区域"意味着给一整栋建筑/一整组设备的全部材质都套上同一个
    // emissive 值——实测在 area 预设的近距离取景下，intensity 稍高就会把大面积
    // 平坦墙面/屋顶亮到糊成一片纯色色块，完全看不出造型转折。0.05 只留一层
    // 很淡的强调色，不盖过材质本身在方向光下的明暗层次。
    selection: { color: "#4bb3d3", intensity: 0.05 },
    labelCollision: { gap: 8 }
  };

  var INTRO_CRUISE_DURATION_MS = 6500;
  var INTRO_CRUISE_SPEED = 0.00016;
  var DAMPING = 0.12;
  var PHI_MIN = 0.18;
  var PHI_MAX = 1.42;
  var MAX_DT_MS = 100;
  var ORBIT_EPS_ANGLE = 0.0008;
  var ORBIT_EPS_DIST = 0.01;
  var ORBIT_EPS_FOV = 0.02;
  var FRAME_INTERVAL_MS = 1000 / 30;
  var MAX_PIXEL_RATIO = 1.5;

  var engine = null;
  var contextCreated = 0;

  function requireThree() {
    if (!window.THREE) throw new Error("THREE 未加载，请检查 vendor/three.min.js");
    return window.THREE;
  }

  function requireModel() {
    if (!window.Map3DModel) throw new Error("Map3DModel 未加载，请检查 scripts/map3d/model-sandbox.js");
    return window.Map3DModel;
  }

  function requireTrackModel() {
    if (!window.Map3DTrackModel) throw new Error("Map3DTrackModel 未加载，请检查 scripts/map3d/model-track.js");
    return window.Map3DTrackModel;
  }

  function requireContract() {
    if (!window.Map3DContract) throw new Error("Map3DContract 未加载，请检查 scripts/map3d/contract.js");
    return window.Map3DContract;
  }

  // ==== 段 1：createGLContext + GL_ATTRS —— 逐字抄自 pump3d/engine.js ====
  var GL_ATTRS = { antialias: true, alpha: true, powerPreference: "high-performance", preserveDrawingBuffer: true };

  function createGLContext(canvas) {
    var gl = canvas.getContext("webgl2", GL_ATTRS) || canvas.getContext("webgl", GL_ATTRS);
    if (!gl) {
      throw new Error("WebGL 不可用，无法渲染 3D 站场巡检地图：请使用支持 WebGL 的浏览器打开，或检查浏览器的硬件加速设置");
    }
    return gl;
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

  // ==== 段 2：createOrbit —— 主体逐字抄自 pump3d/engine.js，见文件头关于
  // retarget()/initialTarget 两处必要扩展的说明 ====
  function createOrbit(camera, canvas, preset, notifyDirty, initialTarget) {
    var theta = preset.theta;
    var thetaTarget = preset.theta;
    var thetaBase = preset.theta;
    var phi = preset.phi;
    var phiTarget = preset.phi;
    var radius = preset.radius;
    var radiusTarget = preset.radius;
    var radiusMin = preset.min;
    var radiusMax = preset.max;
    var azimuthClamp = preset.azimuthClamp;
    var startTarget = initialTarget || { x: preset.target[0], y: preset.target[1], z: preset.target[2] };
    var targetX = startTarget.x;
    var targetY = startTarget.y;
    var targetZ = startTarget.z;
    var targetXTarget = targetX;
    var targetYTarget = targetY;
    var targetZTarget = targetZ;
    var fovTarget = preset.fov;

    var dragging = false;
    var pointerId = null;
    var lastX = 0;
    var lastY = 0;
    var lastFrameTime = 0;
    var mobileDisabled = false;
    var reducedMotion = false;
    var host = null;
    var orbitDir = 1;
    var introCruiseActive = false;
    var introCruiseStart = 0;

    camera.fov = preset.fov;
    camera.updateProjectionMatrix();

    function startIntroCruise() {
      if (reducedMotion) return;
      introCruiseActive = true;
      introCruiseStart = window.performance.now();
      orbitDir = 1;
    }
    startIntroCruise();

    function endDrag() {
      dragging = false;
      pointerId = null;
      if (host) host.classList.remove("dragging");
    }

    function onPointerDown(event) {
      if (mobileDisabled) return;
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
      var scale = screenScale();
      var dx = (event.clientX - lastX) / scale;
      var dy = (event.clientY - lastY) / scale;
      lastX = event.clientX;
      lastY = event.clientY;
      thetaTarget -= dx * 0.005;
      phiTarget -= dy * 0.005;
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
      if (event.deltaMode === 1) delta *= 16;
      else if (event.deltaMode === 2) delta *= 100;
      radiusTarget = radiusTarget * (1 + delta * 0.0012);
      notifyDirty();
    }

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("lostpointercapture", endDrag);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    function applyPreset(name, animated, targetOverride) {
      var next = PRESETS[name];
      if (!next) throw new Error("未知的 3D 视角预设：" + name);
      radiusMin = next.min;
      radiusMax = next.max;
      azimuthClamp = next.azimuthClamp;
      var t = targetOverride || { x: next.target[0], y: next.target[1], z: next.target[2] };
      targetXTarget = t.x;
      targetYTarget = t.y;
      targetZTarget = t.z;
      fovTarget = next.fov;
      if (!dragging) {
        var thetaTurn = Math.round((theta - next.theta) / (Math.PI * 2));
        thetaTarget = next.theta + thetaTurn * Math.PI * 2;
        thetaBase = next.theta + thetaTurn * Math.PI * 2;
      } else {
        thetaBase = next.theta;
      }
      phiTarget = next.phi;
      radiusTarget = next.radius;
      if (!animated || reducedMotion) {
        theta = thetaTarget;
        phi = phiTarget;
        radius = radiusTarget;
        targetX = targetXTarget;
        targetY = targetYTarget;
        targetZ = targetZTarget;
        camera.fov = fovTarget;
        camera.updateProjectionMatrix();
      } else {
        startIntroCruise();
      }
    }

    // 新增：在同一个 preset 内平滑地把镜头 target 移到别处（不改 theta/phi/radius/
    // fov，也绝不触发入场巡航）。用于"area"预设内切换选中区域——只重新对准，
    // 不重放"进入巡航"那个只该在 overview<->area 切换那一刻出现的强调动作。
    function retarget(target) {
      targetXTarget = target.x;
      targetYTarget = target.y;
      targetZTarget = target.z;
      notifyDirty();
    }

    // 新增：供地图缩放按钮调用，复用与 onWheel 完全相同的换算公式，只是把
    // deltaY 换成调用方给的等效步长，语义与滚轮缩放保持一致（正数放大 delta 越大
    // 缩得越远，这里约定 step 正数=缩小、负数=放大，与 onWheel 的 deltaY 语义相同）。
    function zoomBy(step) {
      radiusTarget = radiusTarget * (1 + step * 0.0012);
      notifyDirty();
    }

    function update(now) {
      var dtMs = lastFrameTime ? now - lastFrameTime : 16;
      if (dtMs > MAX_DT_MS) dtMs = MAX_DT_MS;
      lastFrameTime = now;

      if (introCruiseActive) {
        if (dragging || (now - introCruiseStart) >= INTRO_CRUISE_DURATION_MS) {
          introCruiseActive = false;
        } else {
          thetaTarget += INTRO_CRUISE_SPEED * dtMs * orbitDir;
          if (azimuthClamp != null) {
            if (thetaTarget > thetaBase + azimuthClamp) orbitDir = -1;
            else if (thetaTarget < thetaBase - azimuthClamp) orbitDir = 1;
          }
        }
      }

      if (thetaTarget > Math.PI * 2) {
        thetaTarget -= Math.PI * 2;
        theta -= Math.PI * 2;
      } else if (thetaTarget < -Math.PI * 2) {
        thetaTarget += Math.PI * 2;
        theta += Math.PI * 2;
      }

      if (azimuthClamp != null) {
        thetaTarget = clamp(thetaTarget, thetaBase - azimuthClamp, thetaBase + azimuthClamp);
      }
      phiTarget = clamp(phiTarget, PHI_MIN, PHI_MAX);
      radiusTarget = clamp(radiusTarget, radiusMin, radiusMax);

      var dampingFactor = 1 - Math.pow(1 - DAMPING, dtMs / 16.67);
      theta += (thetaTarget - theta) * dampingFactor;
      phi += (phiTarget - phi) * dampingFactor;
      radius += (radiusTarget - radius) * dampingFactor;
      targetX += (targetXTarget - targetX) * dampingFactor;
      targetY += (targetYTarget - targetY) * dampingFactor;
      targetZ += (targetZTarget - targetZ) * dampingFactor;
      camera.fov += (fovTarget - camera.fov) * dampingFactor;

      var settled = !dragging && !introCruiseActive &&
        Math.abs(thetaTarget - theta) < ORBIT_EPS_ANGLE &&
        Math.abs(phiTarget - phi) < ORBIT_EPS_ANGLE &&
        Math.abs(radiusTarget - radius) < ORBIT_EPS_DIST &&
        Math.abs(targetXTarget - targetX) < ORBIT_EPS_DIST &&
        Math.abs(targetYTarget - targetY) < ORBIT_EPS_DIST &&
        Math.abs(targetZTarget - targetZ) < ORBIT_EPS_DIST &&
        Math.abs(fovTarget - camera.fov) < ORBIT_EPS_FOV;

      if (settled) {
        theta = thetaTarget;
        phi = phiTarget;
        radius = radiusTarget;
        targetX = targetXTarget;
        targetY = targetYTarget;
        targetZ = targetZTarget;
        camera.fov = fovTarget;
      }

      camera.updateProjectionMatrix();

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
      applyPreset: applyPreset,
      retarget: retarget,
      zoomBy: zoomBy,
      update: update,
      setHost: function (nextHost) { host = nextHost; },
      setMobileDisabled: function (value) { mobileDisabled = value; },
      setReducedMotion: function (value) {
        reducedMotion = value;
        if (value) introCruiseActive = false;
      },
      isIntroCruiseActive: function () { return introCruiseActive; },
      debugState: function () {
        return {
          theta: theta, phi: phi, radius: radius,
          target: { x: targetX, y: targetY, z: targetZ },
          thetaTarget: thetaTarget, phiTarget: phiTarget, radiusTarget: radiusTarget
        };
      }
    };
  }

  function screenScale() {
    var value = getComputedStyle(document.documentElement).getPropertyValue("--screen-scale").trim();
    var scale = Number(value);
    if (!Number.isFinite(scale) || scale <= 0) {
      throw new Error("无效的屏幕缩放比例 --screen-scale：" + value);
    }
    return scale;
  }

  // 每个区域一个 Group：core(状态色实心球) + glow(叠加发光球) + billboard 脉冲环 +
  // 引线（从悬浮位置垂直指回 model 给的 anchors，见 HOTSPOT.hoverHeight 注释）。
  function createHotspots(anchors, THREE) {
    var Contract = requireContract();
    var group = new THREE.Group();
    group.name = "map3d-hotspots";
    var byId = {};
    var list = [];

    Contract.AREA_IDS.forEach(function (id) {
      var anchor = anchors[id];
      if (!anchor) throw new Error("缺少热点锚点: " + id);

      var hotGroup = new THREE.Group();
      hotGroup.position.set(anchor.x, anchor.y + HOTSPOT.hoverHeight, anchor.z);

      var core = new THREE.Mesh(
        new THREE.SphereGeometry(HOTSPOT.coreRadius, HOTSPOT.coreSegments[0], HOTSPOT.coreSegments[1]),
        new THREE.MeshBasicMaterial({ color: HOTSPOT.colors.ok })
      );
      hotGroup.add(core);

      var glow = new THREE.Mesh(
        new THREE.SphereGeometry(HOTSPOT.glowRadius, HOTSPOT.coreSegments[0], HOTSPOT.coreSegments[1]),
        new THREE.MeshBasicMaterial({
          color: HOTSPOT.colors.ok,
          transparent: true,
          opacity: HOTSPOT.glowOpacity,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        })
      );
      hotGroup.add(glow);

      var ring = new THREE.Mesh(
        new THREE.RingGeometry(HOTSPOT.ringInner, HOTSPOT.ringOuter, HOTSPOT.ringSegments),
        new THREE.MeshBasicMaterial({
          color: HOTSPOT.colors.ok,
          transparent: true,
          opacity: HOTSPOT.pulse.ok.opacity,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        })
      );
      hotGroup.add(ring);

      // 引线：从悬浮位置（局部原点）垂直落回 anchor（区块顶面中心），局部坐标里
      // 就是正下方 hoverHeight 处——这是文件头"4 处改写"第 3 条的具体落地。
      var leadEnd = new THREE.Vector3(0, -HOTSPOT.hoverHeight, 0);
      var lineGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), leadEnd]);
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

  function applyHotspotStatic(engine, id) {
    var hs = engine.hotspots.byId[id];
    var status = engine.statuses[id];
    var pulse = HOTSPOT.pulse[status];
    hs.ring.scale.setScalar(pulse.scale);
    hs.ring.material.opacity = pulse.opacity;
    applyHotspotHoverGlow(engine, id);
  }

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
        cache.push({
          material: material,
          emissive: material.emissive.clone(),
          emissiveIntensity: material.emissiveIntensity
        });
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

  function setActiveAreaHighlight(engine, id) {
    if (engine.activeAreaId === id) return;
    if (engine.activeAreaId) restoreSelection(engine, engine.activeAreaId);
    engine.activeAreaId = id;
    if (id) cacheAndApplySelection(engine, id);
    markDirty(engine);
  }

  function setStatuses(engine, statuses) {
    var Contract = requireContract();
    Contract.AREA_IDS.forEach(function (id) {
      var status = statuses[id];
      if (!status) throw new Error("缺少区域状态: " + id);
      if (Contract.STATUSES.indexOf(status) < 0) throw new Error("未知的区域状态: " + status);
      engine.statuses[id] = status;
      applyHotspotStatusColor(engine.hotspots.byId[id], status);
      applyHotspotStatic(engine, id);
    });
    // 每次区域状态刷新时同步重建 250 个巡检点位的 3 组 InstancedMesh——见
    // model-sandbox.js 文件头"状态变更退化成换组"的说明：这是把"item 级状态可能
    // 已经被别处（ItemList 的 +/- 交互）改动"这件事同步进 3D 场景的唯一入口。
    engine.model.refreshItemPins();
    markDirty(engine);
  }

  // ==== 段 4：sweepLabels / fitLabelsVertically —— 逐字抄自 pump3d/engine.js ====
  function labelsCollide(a, b, minDy, minDx) {
    return Math.abs(a.y - b.y) < minDy && Math.abs(a.x - b.x) < minDx;
  }

  // 单调单趟扫描：按 y 升序，每个标签只与已放置的标签比，命中碰撞就用 Math.max
  // 往下推。这里绝对不能写成 "while (changed) { ... y = y_k + push; changed = true; }"
  // 那种收敛循环：push 恰好等于 minDy，而 (y_k + minDy) - y_k 在浮点下可能算出
  // 53.99999999999999 < 54，于是同一个赋值被反复判为"仍在碰撞"，changed 永远为
  // true，整个页面同步卡死。改成 Math.max 后 y 只增不减、只会远离所有更小的 y，
  // 不存在需要反复收敛的情况。points 必须已按 y 升序排好。
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

  // 区域相邻关系：从 window.DemoStation.areas() 的 grid.col/grid.row 现场算出
  // 4 方向相邻（上下左右，不含对角线），不额外维护一份写死的邻接表——12 区的
  // 网格位置本来就定义在 station.js 里，这里只是复用它做一次派生，station.js
  // 若调整某个区域的 grid 坐标，邻接关系自动跟着变。只计算一次并缓存：12 区的
  // grid 坐标在运行期不会变化。
  var adjacencyCache = null;
  function computeAdjacency() {
    if (adjacencyCache) return adjacencyCache;
    var areas = window.DemoStation.areas();
    var byColRow = {};
    areas.forEach(function (a) { byColRow[a.grid.col + ":" + a.grid.row] = a.id; });
    var adjacency = {};
    areas.forEach(function (a) {
      var col = a.grid.col;
      var row = a.grid.row;
      var neighborKeys = [[col - 1, row], [col + 1, row], [col, row - 1], [col, row + 1]];
      adjacency[a.id] = neighborKeys
        .map(function (cr) { return byColRow[cr[0] + ":" + cr[1]]; })
        .filter(function (id) { return id != null; });
    });
    adjacencyCache = adjacency;
    return adjacency;
  }

  // 下钻到某个区域（area 预设）时，只显示当前区 + 相邻区的标签，其余区域收敛为
  // 纯 3D 点位（热点球体/光环仍然渲染，只是不再叠加 DOM 标签）——这是应对"12 个
  // 标签在近距离取景下必然大量拥挤"的根本手段，比单纯依赖 sweepLabels/
  // fitLabelsVertically 的去碰撞算法更有效：那套算法只保证"在给定的可用空间里
  // 尽量不重叠"，当同屏需要安放的标签数量本来就超出可用竖直空间时（近距离
  // 取景下 8-10 个区域的标签会挤进屏幕上很小一块区域），它会退化成"压缩间距、
  // 允许残留重叠"而不是凭空生出更多空间。返回 null 表示"全部显示"（overview
  // 预设，或尚未聚焦任何区域）。
  function visibleLabelIds(engine) {
    if (engine.preset !== "area" || !engine.activeAreaId) return null;
    var adjacency = computeAdjacency();
    var set = {};
    set[engine.activeAreaId] = true;
    (adjacency[engine.activeAreaId] || []).forEach(function (id) { set[id] = true; });
    return set;
  }

  // 12 个区域标签的投影 + 全量两两去碰撞。
  //
  // scratchVector.z > 1 这条分支在 pump3d 上是死代码（radiusMin=20 远大于半展
  // 12.8，锚点在任何 preset 下都不可能跑到相机背后）；在这份 680x460 的地图上是
  // 活代码路径——接近正俯视（overview 的 phi=0.52，比较陡）+ 位于地图边缘的区域
  // （比如 vent/launcher 这类贴边界的区域）叠加入场巡航的大幅度旋转时，锚点确实
  // 可能短暂转到相机背后；area 预设下更是常态（下钻到 control/genset 时实测有
  // 5 个非相邻区域的锚点会转到相机背后）。这里按活路径保留处理（隐藏该标签），
  // 已用 Playwright 实测验证（见任务报告）。
  function syncLabels(engine) {
    var Contract = requireContract();
    var width = engine.host.clientWidth;
    var height = engine.host.clientHeight;
    var points = [];
    var visible = visibleLabelIds(engine);

    Contract.AREA_IDS.forEach(function (id) {
      var el = engine.labelEls[id];
      if (!el) throw new Error("缺少热点标签元素: " + id);
      if (visible && !visible[id]) {
        el.style.opacity = "0";
        el.style.pointerEvents = "none";
        return;
      }
      var anchor = engine.anchors[id];
      engine.scratchVector.set(anchor.x, anchor.y + HOTSPOT.hoverHeight, anchor.z).project(engine.camera);
      if (engine.scratchVector.z > 1) {
        el.style.opacity = "0";
        el.style.pointerEvents = "none";
        return;
      }
      el.style.opacity = "";
      el.style.pointerEvents = "";
      points.push({
        id: id,
        el: el,
        x: (engine.scratchVector.x * 0.5 + 0.5) * width,
        y: (-engine.scratchVector.y * 0.5 + 0.5) * height
      });
    });

    var minDy = engine.labelBoxHeight + HOTSPOT.labelCollision.gap;
    var minDx = engine.labelBoxWidth + HOTSPOT.labelCollision.gap;
    var push = minDy;

    points.sort(function (a, b) { return a.y - b.y; });
    sweepLabels(points, minDy, minDx, push);
    points.sort(function (a, b) { return a.y - b.y; });
    sweepLabels(points, minDy, minDx, push);
    points.sort(function (a, b) { return a.y - b.y; });

    var halfWidth = engine.labelBoxWidth / 2;
    var halfHeight = engine.labelBoxHeight / 2;
    fitLabelsVertically(points, halfHeight, height - halfHeight, minDy, minDx);
    points.forEach(function (p) {
      p.x = clamp(p.x, halfWidth, width - halfWidth);
      p.y = clamp(p.y, halfHeight, height - halfHeight);
    });

    points.forEach(function (p) {
      p.el.style.transform = "translate3d(" + p.x + "px," + p.y + "px,0) translate(-50%,-50%)";
    });
  }

  function buildLabelMap(engine, host) {
    var Contract = requireContract();
    var labelsRoot = host.querySelector("." + Contract.LABELS_CLASS);
    if (!labelsRoot) throw new Error("缺少 ." + Contract.LABELS_CLASS + " 容器");
    var map = {};
    var maxWidth = 0;
    var maxHeight = 0;
    labelsRoot.querySelectorAll("[" + Contract.PIN_ATTR + "]").forEach(function (button) {
      var id = button.getAttribute(Contract.PIN_ATTR);
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

  function applyPresetToEngine(engine, name, animated, targetOverride) {
    if (!PRESETS[name]) throw new Error("未知的 3D 视角预设：" + name);
    engine.preset = name;
    engine.orbit.applyPreset(name, animated, targetOverride);
  }

  // ==== 段 3：markDirty / startLoop —— 逐字抄自 pump3d/engine.js ====
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
      if (moving) engine.dirty = true;

      if (!engine.dirty) return;

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

      if (!moving) engine.dirty = false;

      if (engine.dirty) {
        engine.frameScheduled = true;
        engine.rafId = window.requestAnimationFrame(frame);
      }
    }

    engine.frameFn = frame;
    markDirty(engine);
  }

  // 供 mount() 计算某个 preset 应该对准的 target。overview 用 PRESETS.overview 的
  // 静态字面量（null 覆盖即可），area 现场从 window.DemoStation.area(areaId).geom
  // 算出该区域的几何中心（不是悬浮的热点锚点——相机应该对准区域本身，不是对准
  // 飘在半空的状态指示球）。
  function computeTarget(presetName, areaId) {
    if (presetName === "overview") return null;
    var area = window.DemoStation.area(areaId);
    var g = area.geom;
    return { x: g.x, y: Math.min(10, g.h * 0.6 + 2), z: g.z };
  }

  function createEngine(presetName, initialTarget, track) {
    if (!PRESETS[presetName]) throw new Error("未知的 3D 视角预设：" + presetName);
    if (!track) throw new Error("createEngine 缺少 track 参数（应来自 Map3D.mount 的 options.track）");
    var THREE = requireThree();
    var Model = requireModel();
    var TrackModel = requireTrackModel();
    var Contract = requireContract();

    var canvas = document.createElement("canvas");
    canvas.className = Contract.CANVAS_CLASS;
    canvas.setAttribute("aria-hidden", "true");

    var gl = createGLContext(canvas);
    var renderer = new THREE.WebGLRenderer({ canvas: canvas, context: gl });
    // ==== 段 6：contextCreated 紧跟 renderer 构造之后（逐字抄自 pump3d/engine.js 的
    // 位置纪律，理由见该文件对应注释：中途抛错也不能漏计） ====
    contextCreated += 1;
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = LIGHTING.toneMappingExposure;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // ==== 段 5：autoUpdate=false + needsUpdate=true 必须配对（逐字抄自
    // pump3d/engine.js；只设第一行会导致阴影从头到尾都不生成） ====
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(PRESETS[presetName].fov, 1, 0.1, 4000);

    var hemi = new THREE.HemisphereLight(LIGHTING.hemisphere.sky, LIGHTING.hemisphere.ground, LIGHTING.hemisphere.intensity);
    scene.add(hemi);

    var key = new THREE.DirectionalLight(LIGHTING.key.color, LIGHTING.key.intensity);
    key.position.set(LIGHTING.key.position[0], LIGHTING.key.position[1], LIGHTING.key.position[2]);
    key.castShadow = true;
    key.shadow.mapSize.set(LIGHTING.key.shadowMapSize, LIGHTING.key.shadowMapSize);
    key.shadow.bias = LIGHTING.key.shadowBias;
    key.shadow.camera.left = -LIGHTING.key.shadowCamSize;
    key.shadow.camera.right = LIGHTING.key.shadowCamSize;
    key.shadow.camera.top = LIGHTING.key.shadowCamSize;
    key.shadow.camera.bottom = -LIGHTING.key.shadowCamSize;
    key.shadow.camera.near = 10;
    key.shadow.camera.far = 1400;
    scene.add(key);

    var rimCyan = new THREE.DirectionalLight(LIGHTING.rimCyan.color, LIGHTING.rimCyan.intensity);
    rimCyan.position.set(LIGHTING.rimCyan.position[0], LIGHTING.rimCyan.position[1], LIGHTING.rimCyan.position[2]);
    scene.add(rimCyan);

    var rimAmber = new THREE.DirectionalLight(LIGHTING.rimAmber.color, LIGHTING.rimAmber.intensity);
    rimAmber.position.set(LIGHTING.rimAmber.position[0], LIGHTING.rimAmber.position[1], LIGHTING.rimAmber.position[2]);
    scene.add(rimAmber);

    var pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    var gradientTexture = createGradientTexture(THREE);
    scene.environment = pmrem.fromEquirectangular(gradientTexture).texture;
    gradientTexture.dispose();
    pmrem.dispose();

    var materials = Model.createMaterials(THREE);
    var built = Model.build(THREE, materials);
    scene.add(built.group);
    // ==== 已删除：pump3d 的 getObjectByName("pump3d-grid") 强制要求。沙盘网格已经
    // 烘进 model-sandbox.js 的地面纹理（buildSandboxGround），不再需要一个独立的
    // GridHelper 对象，也就不需要这条断言。 ====

    var hotspots = createHotspots(built.anchors, THREE);
    scene.add(hotspots.group);

    var instance;
    var trackModel = TrackModel.build(THREE, track, function () { markDirty(instance); });
    scene.add(trackModel.group);

    var orbit = createOrbit(camera, canvas, PRESETS[presetName], function () { markDirty(instance); }, initialTarget);

    instance = {
      THREE: THREE,
      canvas: canvas,
      renderer: renderer,
      scene: scene,
      camera: camera,
      model: built,
      areaMeshes: built.areaMeshes,
      anchors: built.anchors,
      trackModel: trackModel,
      hotspots: hotspots,
      orbit: orbit,
      host: null,
      labelEls: {},
      labelBoxWidth: 0,
      labelBoxHeight: 0,
      preset: presetName,
      activeAreaId: null,
      activeItemId: null,
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
    // ==== 段 7：webglcontextlost -> throw（逐字抄自 pump3d/engine.js） ====
    canvas.addEventListener("webglcontextlost", function () {
      throw new Error("3D 站场巡检地图的 WebGL 上下文已丢失（通常是 GPU 驱动重置或显存不足），请刷新页面");
    });

    startLoop(instance);

    return instance;
  }

  var engineFailed = false;

  function ensureEngine(presetName, initialTarget, track) {
    if (engineFailed) {
      throw new Error("Map3D 引擎首次初始化已失败，请修复上一次的报错后刷新页面");
    }
    if (!engine) {
      engineFailed = true;
      engine = createEngine(presetName, initialTarget, track);
      engineFailed = false;
    }
    return engine;
  }

  function mount(host, options) {
    if (!host) throw new Error("Map3D.mount 需要有效的宿主元素");
    if (!options || !options.statuses) {
      throw new Error("Map3D.mount 需要 options.statuses");
    }
    if (!options.track) {
      throw new Error("Map3D.mount 需要 options.track（来自 window.DemoTrack.track()）");
    }
    // options.progress（各区域巡检项完成度）当前引擎不消费——12 区完成度已经
    // 完全由 options.statuses 之外的 DOM 层（renderStationMap 的 area-pin 计数）
    // 承载，这里接收它只是为了让 mount() 的调用签名与任务契约描述的
    // { activeAreaId, activeItemId, statuses, progress, track, showTrack } 一致，
    // 留给未来可能的"3D 场景内进度条覆盖层"使用，当前不做任何校验或使用。
    var Contract = requireContract();
    if (options.activeAreaId != null && Contract.AREA_IDS.indexOf(options.activeAreaId) < 0) {
      throw new Error("Map3D.mount 收到非法 options.activeAreaId：" + options.activeAreaId);
    }

    var presetName = options.activeAreaId == null ? "overview" : "area";
    var target = computeTarget(presetName, options.activeAreaId);
    var instance = ensureEngine(presetName, target, options.track);

    host.insertBefore(instance.canvas, host.firstChild);
    instance.host = host;
    instance.orbit.setHost(host);

    Contract.assertDom(host, options);

    buildLabelMap(instance, host);

    instance.resizeObserver.disconnect();
    instance.resizeObserver.observe(host);
    instance.intersectionObserver.disconnect();
    instance.intersectionObserver.observe(host);

    if (instance.preset !== presetName) {
      // preset 名称真的变了（overview<->area）：完整过渡 + 重放入场巡航。
      applyPresetToEngine(instance, presetName, true, target);
    } else if (presetName === "area" && instance.activeAreaId !== options.activeAreaId) {
      // 仍在 area 档，只是换了一个区域：只平滑重新对准，不重放巡航。
      instance.orbit.retarget(target);
    }

    setActiveAreaHighlight(instance, options.activeAreaId || null);
    instance.activeItemId = options.activeItemId || null;
    setStatuses(instance, options.statuses);
    instance.trackModel.setVisible(options.showTrack === true);

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
    if (!engine) throw new Error("Map3D 尚未挂载，无法 setActiveArea");
    var Contract = requireContract();
    if (areaId != null && Contract.AREA_IDS.indexOf(areaId) < 0) {
      throw new Error("Map3D.setActiveArea 收到非法 areaId：" + areaId);
    }
    setActiveAreaHighlight(engine, areaId);
  }

  function setActiveItem(itemId) {
    if (!engine) throw new Error("Map3D 尚未挂载，无法 setActiveItem");
    // 本 POC 的 256 个巡检点位是 InstancedMesh（不是独立可拾取对象，见
    // model-sandbox.js 文件头"250 个巡检点位必须用 InstancedMesh"的性能论证），
    // 因此没有为"选中某一条具体巡检项"设计单独的 3D 高亮——这里只记录状态供
    // debugInfo() 读取，3D 层面的强调始终停留在"区域"这一级颗粒度
    // （setActiveArea 的选中高亮）。这是一个刻意的范围收窄，不是遗漏。
    engine.activeItemId = itemId || null;
    markDirty(engine);
  }

  function setStatusesPublic(byAreaId) {
    if (!engine) throw new Error("Map3D 尚未挂载，无法 setStatuses");
    setStatuses(engine, byAreaId);
  }

  function setTrackVisible(visible) {
    if (!engine) throw new Error("Map3D 尚未挂载，无法 setTrackVisible");
    if (typeof visible !== "boolean") throw new Error("Map3D.setTrackVisible 需要布尔值");
    engine.trackModel.setVisible(visible);
  }

  function zoom(step) {
    if (!engine) throw new Error("Map3D 尚未挂载，无法 zoom");
    if (typeof step !== "number" || !isFinite(step)) throw new Error("Map3D.zoom 需要有限数字 step");
    engine.orbit.zoomBy(step);
  }

  function debugInfo() {
    if (!engine) throw new Error("Map3D 尚未挂载，无法获取调试信息");
    var width = engine.host ? engine.host.clientWidth : 0;
    var height = engine.host ? engine.host.clientHeight : 0;
    var hiddenBehindCamera = 0;
    Object.keys(engine.labelEls).forEach(function (id) {
      if (engine.labelEls[id].style.opacity === "0") hiddenBehindCamera += 1;
    });
    return {
      contextCreated: contextCreated,
      mountCount: engine.mountCount,
      renderCalls: engine.renderer.info.render.calls,
      triangles: engine.renderer.info.render.triangles,
      frames: engine.frames,
      preset: engine.preset,
      aspect: height ? width / height : 0,
      width: width,
      height: height,
      idle: !engine.dirty,
      introCruiseActive: engine.orbit.isIntroCruiseActive(),
      activeAreaId: engine.activeAreaId,
      activeItemId: engine.activeItemId,
      areaHotspots: engine.hotspots.list.length,
      hiddenBehindCamera: hiddenBehindCamera,
      cameraPosition: { x: engine.camera.position.x, y: engine.camera.position.y, z: engine.camera.position.z },
      orbit: engine.orbit.debugState(),
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
    setActiveItem: setActiveItem,
    setStatuses: setStatusesPublic,
    setTrackVisible: setTrackVisible,
    zoom: zoom,
    debugInfo: debugInfo
  };
})();
