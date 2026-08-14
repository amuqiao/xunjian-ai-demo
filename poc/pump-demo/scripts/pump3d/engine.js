(function () {
  "use strict";

  // 世界坐标约定（契约 4）：1 unit = 100 mm；轴系沿 +X，泵在 -X 端、电机在 +X 端；
  // +Y 向上，y=0 为基础底面，轴中心线 y=4.6；+Z 指向观察者。

  var LIGHTING = {
    hemisphere: { sky: 0x8fd4ea, ground: 0x0b1117, intensity: 0.68 },
    // 布光方位必须跟着 PRESETS 的实际机位算，别凭直觉摆。
    // 两个 preset 的相机都落在 −Z 侧（station: x=sinφ·cosθ·r≈0.3, y≈20.5, z≈−22.8），
    // 所以打光的 z 必须为负才是迎面光；早期主光在 +Z 等于一直在给整机背面打光，
    // 迎面只剩一盏青补光在撑，整机因此偏暗发蓝、护罩被染成青白、泵端全黑。
    key: { color: 0xffffff, intensity: 3.0, position: [12, 20, -14], shadowMapSize: 2048, shadowBias: -0.0006, shadowCamSize: 16 },
    // 泵蜗壳在 −X 端，这盏暖光从泵侧迎面补，把浅灰铸铁的造型照出来，并和电机青漆形成冷暖对比。
    rimAmber: { color: 0xf0c887, intensity: 1.2, position: [-14, 7, -9] },
    // 青光退到背面当轮廓光，负责把机组边缘从深色底衬里勾出来，不再参与迎面照明。
    rimCyan: { color: 0x4bb3d3, intensity: 1.1, position: [-6, 10, 16] },
    envGradient: { top: "#2e4d5e", mid: "#16232c", bottom: "#0a1218", width: 32, height: 16 },
    toneMappingExposure: 1.28
  };

  var PRESETS = {
    dashboard: { radius: 29, min: 20, max: 46, theta: -1.5533, phi: 1.0, target: [-0.5, 4.2, 0], fov: 32, azimuthClamp: 0.9, grid: false },
    // max 从 48 收到 34：48 会让机组投影宽度缩到约 250px，6 个约 68px 宽的标签物理上放不下（实测 100% 重叠）。
    station: { radius: 28, min: 20, max: 34, theta: -1.5359, phi: 0.95, target: [-0.5, 4.2, 0], fov: 34, azimuthClamp: null, grid: true }
  };

  var HOTSPOT = {
    coreRadius: 0.28,
    coreSegments: [16, 12],
    glowRadius: 0.45,
    glowOpacity: 0.18,
    hoverGlowBoost: 0.15,
    ringInner: 0.9,
    ringOuter: 1.05,
    ringSegments: 32,
    leadOpacity: 0.45,
    // active 未被任何状态渲染逻辑读取（applyHotspotStatusColor 只吃 ok/warn/danger），选中态
    // 高亮用的是下面 selection.color，两者数值相同纯属巧合，这里不留死常量。
    colors: { ok: "#30c69d", warn: "#eeb44a", danger: "#ff625c" },
    // 脉冲环改为按状态取固定的 scale/opacity，不再逐帧动画（那是一个永久脏源，见第 14 章）。
    // CSS 侧 .part-pin.danger .pin-core 的 @keyframes pinDangerPulse 已经用合成器动画表达了
    // 同一个"危险在呼吸"的信号，3D 场景这里只需要给一个清晰、不随时间变化的强调即可：
    // danger 比 warn 更醒目、warn 比 ok 更醒目。
    pulse: {
      ok: { scale: 1, opacity: 0.25 },
      warn: { scale: 1.35, opacity: 0.4 },
      danger: { scale: 1.75, opacity: 0.55 }
    },
    // 选中态材质高亮改成一次性设定的固定强度，不再逐帧脉动（见 cacheAndApplySelection）。
    selection: { color: "#4bb3d3", intensity: 0.42 },
    // gap 是在标签实测盒尺寸（mount() 时用 offsetWidth/offsetHeight 现测，见 buildLabelMap）
    // 之外再留的一点呼吸间隙，不要在这里硬编码盒子本身的像素尺寸，避免和 CSS 出现两份真源。
    labelCollision: { gap: 8 }
  };

  // 入场巡航：mount() 首次挂载 / 切换 preset 时触发一段有限时长的缓慢旋转展示立体感，
  // 结束后彻底停住——不是"永远转下去"的自动巡航。时长与角速度见 createOrbit。
  var INTRO_CRUISE_DURATION_MS = 6500;
  var INTRO_CRUISE_SPEED = 0.00016;
  var DAMPING = 0.12;
  var PHI_MIN = 0.18;
  var PHI_MAX = 1.42;
  var MAX_DT_MS = 100;
  // 阻尼收敛判定阈值：theta/phi/radius/target*/camera.fov 逐项与各自的 *Target 比较，
  // 全部落在阈值内才算"静止"。阈值选得足够小（视觉上不可分辨），又足够大（避免浮点误差
  // 导致永远差一点点而判定不收敛）。
  var ORBIT_EPS_ANGLE = 0.0008; // theta / phi，弧度
  var ORBIT_EPS_DIST = 0.01; // radius / target，世界单位（1 unit = 100mm）
  var ORBIT_EPS_FOV = 0.02; // camera.fov，角度
  // 机械示意图不需要 60fps，交互中的渲染也节流到 30fps（时间戳跳帧实现）。
  var FRAME_INTERVAL_MS = 1000 / 30;
  // 视网膜屏 2x 超采样意味着 4 倍像素填充量，对这个用途不值，降到 1.5x。
  var MAX_PIXEL_RATIO = 1.5;

  var engine = null;
  var contextCreated = 0;

  function requireThree() {
    if (!window.THREE) throw new Error("THREE 未加载，请检查 vendor/three.min.js");
    return window.THREE;
  }

  function requireModel() {
    if (!window.Pump3DModel) throw new Error("Pump3DModel 未加载，请检查 scripts/pump3d/model.js");
    return window.Pump3DModel;
  }

  // preserveDrawingBuffer 必须为 true —— 这是按需渲染的必要条件，不是可选优化。
  // WebGL 默认（false）下，一帧渲染呈现给合成器之后绘制缓冲的内容就变成未定义。
  // 持续 60fps 渲染时无所谓（下一帧立刻覆盖），但静止时一帧都不画之后，只要合成器
  // 需要重新合成这一层——切标签页回来、窗口缩放、显示器休眠唤醒、GPU 进程恢复、
  // 滚动导致图层重新栅格化——canvas 就会变成空白，而没有任何东西触发重绘。
  // 症状是"3D 区域莫名变成空白，刷新才恢复"，且只在真实 GPU 上出现：headless
  // swiftshader 的截图会强制一次合成，掩盖掉这个问题，所以自动截图测不到。
  var GL_ATTRS = { antialias: true, alpha: true, powerPreference: "high-performance", preserveDrawingBuffer: true };

  // 自己带属性把 context 创建出来，再交给 WebGLRenderer({ context: gl })，全程只有一个 context。
  // 不能在真正要用的 canvas 上"先探测再让 three 自己建"：按 WebGL 规范，同一 canvas 第二次
  // getContext(同 contextId) 会直接返回已有 context 并忽略全部属性参数，three 请求的
  // antialias/alpha/powerPreference 会被静默丢弃。
  // 也不能"在临时 canvas 上探测完再 loseContext()"：那样等于多创建一个完整 context，
  // 在软件光栅器（headless swiftshader）下这一步会直接把页面挂死。
  function createGLContext(canvas) {
    var gl = canvas.getContext("webgl2", GL_ATTRS) || canvas.getContext("webgl", GL_ATTRS);
    if (!gl) {
      throw new Error("WebGL 不可用，无法渲染 3D 泵机组视图：请使用支持 WebGL 的浏览器打开，或检查浏览器的硬件加速设置");
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

  // 手写轨道控制器：theta/phi/radius/target/fov 各自维护一份 *Target 影子值，
  // 每帧用按 dt 归一化的指数阻尼 cur += (tgt-cur)*(1-(1-0.12)^(dtMs/16.67)) 收敛（帧率无关），
  // preset 切换只需改 *Target 即可自然变成镜头动画。
  // notifyDirty 由调用方（createEngine）传入：拖拽/滚轮改变了 *Target 时必须显式调用它——
  // 按需渲染下 RAF 循环在真正静止时会彻底停止自我排队（见 startLoop/markDirty），不再是
  // "反正每帧都在跑，改了 target 自然会被画出来"，不主动唤醒的话这次交互不会被渲染出来。
  function createOrbit(camera, canvas, preset, notifyDirty) {
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
    var targetX = preset.target[0];
    var targetY = preset.target[1];
    var targetZ = preset.target[2];
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
    // 入场巡航来回摆动的方向：+1 朝 azimuthClamp 上界走，-1 朝下界走，到边界翻转。
    var orbitDir = 1;
    // 入场巡航状态：mount() 首次挂载 / 切换 preset 时触发一段有限时长（见
    // INTRO_CRUISE_DURATION_MS）的缓慢旋转，结束后或用户开始拖拽后立即停住，
    // 不会重新开始——这是与旧版"idle 4 秒后自动巡航、永远转下去"的核心区别。
    var introCruiseActive = false;
    var introCruiseStart = 0;

    camera.fov = preset.fov;
    camera.updateProjectionMatrix();

    function startIntroCruise() {
      if (reducedMotion) return; // 前庭敏感用户：不做任何自主镜头运动
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
      // 多指同时按下时不覆写已有拖拽态：否则先抬的第二根手指和后抬的第一根手指两次
      // pointerup 的 pointerId 都对不上当前 pointerId，dragging 会永久卡在 true。
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
      // deltaMode 归一化：Chrome 给 DOM_DELTA_PIXEL(0)，一格 deltaY≈100；Firefox 常给
      // DOM_DELTA_LINE(1)，一格 deltaY≈3，不换算的话缩放手感等于失灵。
      if (event.deltaMode === 1) delta *= 16;
      else if (event.deltaMode === 2) delta *= 100;
      radiusTarget = radiusTarget * (1 + delta * 0.0012);
      notifyDirty();
    }

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    // 覆盖三种绕过 pointerup 的场景：宿主元素被拆除（stage.innerHTML=""）、系统把 capture
    // 抢走、以及鼠标在窗口外释放——这些情况下 pointerup 都不会派发到 canvas，只有
    // lostpointercapture 一定会触发，否则 dragging 会永久卡死（自动巡航和 preset 复位都跟着失效）。
    canvas.addEventListener("lostpointercapture", endDrag);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    function applyPreset(name, animated) {
      var next = PRESETS[name];
      if (!next) throw new Error("未知的 3D 视角预设：" + name);
      radiusMin = next.min;
      radiusMax = next.max;
      azimuthClamp = next.azimuthClamp;
      targetXTarget = next.target[0];
      targetYTarget = next.target[1];
      targetZTarget = next.target[2];
      fovTarget = next.fov;
      if (!dragging) {
        // next.theta 是一个绝对角度字面量（preset 常量，通常落在 -pi..pi），而当前 theta 可能
        // 因为无钳制 preset（如 station）长时间自由旋转，数值上停在与 next.theta 相差整数圈的
        // 位置（update() 里的折回只保证 |theta|<=2π，不保证和新 preset 的字面量同圈）。若直接把
        // thetaTarget 赋成 next.theta，阻尼收敛会按数值差走完整整几圈，而不是视觉上真正最短的
        // 路径——station 空闲较久后切回 dashboard 时仍可能出现明显的镜头"甩尾"。这里把
        // next.theta 和 thetaBase 一起平移到与当前 theta 同一圈内最近的等价角，保证阻尼过渡
        // 永远走最短路径（数学上界为半圈，且 thetaBase 同步平移以保持 azimuthClamp 判断自洽）。
        var thetaTurn = Math.round((theta - next.theta) / (Math.PI * 2));
        thetaTarget = next.theta + thetaTurn * Math.PI * 2;
        thetaBase = next.theta + thetaTurn * Math.PI * 2;
      } else {
        thetaBase = next.theta;
      }
      phiTarget = next.phi;
      radiusTarget = next.radius;
      // reduced-motion 下切场景不做镜头推移，直接落到目标机位：
      // 阻尼过渡本身就是一段镜头运动，对前庭敏感用户同样是风险源。
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
        // 切场景是一次新的"进入"，重新展示一段入场巡航。同 preset 内的重挂载不会走到这个
        // 分支——调用方（mount()）只在 preset 真的变化时才调 applyPreset，点部位标签触发的
        // 重挂载因此不会重新触发巡航，不会变相回到"永远转下去"。
        startIntroCruise();
      }
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
          // 有方位钳制的 preset（如 dashboard）巡航到边界就反向，而不是单向累加撞死在边界。
          if (azimuthClamp != null) {
            if (thetaTarget > thetaBase + azimuthClamp) orbitDir = -1;
            else if (thetaTarget < thetaBase - azimuthClamp) orbitDir = 1;
          }
        }
      }

      // 无方位钳制的 preset（如 station）theta 会在巡航/拖拽下持续累加，数值可能涨到
      // 几十弧度。这里把 theta 和 thetaTarget 按相同整数倍的 2π 折回，保持两者差值不变
      // （视觉完全无感），否则切回一个有钳制的 preset 时，阻尼收敛会在几帧内把这几十弧度
      // 的差值转完，画面变闪频噪声。
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

      // 阻尼做成帧率无关：cur += (tgt-cur)*DAMPING 在 120Hz 屏上每秒收敛次数是 60Hz 屏的两倍，
      // 镜头动画会整体快一倍；换成按 dtMs 归一化的指数衰减后，收敛速度只取决于经过的时间。
      var dampingFactor = 1 - Math.pow(1 - DAMPING, dtMs / 16.67);
      theta += (thetaTarget - theta) * dampingFactor;
      phi += (phiTarget - phi) * dampingFactor;
      radius += (radiusTarget - radius) * dampingFactor;
      targetX += (targetXTarget - targetX) * dampingFactor;
      targetY += (targetYTarget - targetY) * dampingFactor;
      targetZ += (targetZTarget - targetZ) * dampingFactor;
      camera.fov += (fovTarget - camera.fov) * dampingFactor;

      // 收敛判定：拖拽中或入场巡航进行中一律视为"仍在变化"；否则逐项比较当前值与目标值，
      // 全部落在各自的 epsilon 内才算收敛。收敛时把当前值一次性 snap 到 target，避免
      // "永远差一个 epsilon"导致每帧都判定为"还在变"而持续重绘（按需渲染的关键一步，
      // 见 startLoop）。
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
      update: update,
      setHost: function (nextHost) { host = nextHost; },
      setMobileDisabled: function (value) { mobileDisabled = value; },
      setReducedMotion: function (value) {
        reducedMotion = value;
        // 运行时切到 reduced-motion：正在进行的入场巡航也要立刻停，不等它自然跑完。
        if (value) introCruiseActive = false;
      },
      isIntroCruiseActive: function () { return introCruiseActive; }
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

  // 每个部位一个 Group：core(状态色实心球) + glow(叠加发光球) + billboard 脉冲环 + 引线(指回轴中心线)。
  function createHotspots(anchors, THREE) {
    var group = new THREE.Group();
    group.name = "pump3d-hotspots";
    var byId = {};
    var list = [];

    window.Pump3DContract.PART_IDS.forEach(function (id) {
      var anchor = anchors[id];
      if (!anchor) throw new Error("缺少热点锚点: " + id);

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

      // 引线从锚点指回轴中心线（y=4.6, z=0），把飘在空中的热点和机体连起来。
      var leadEnd = new THREE.Vector3(0, 4.6 - anchor.y, -anchor.z);
      var lineGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), leadEnd]);
      var line = new THREE.Line(
        lineGeometry,
        new THREE.LineBasicMaterial({ color: HOTSPOT.colors.ok, transparent: true, opacity: HOTSPOT.leadOpacity })
      );
      hotGroup.add(line);

      group.add(hotGroup);

      var descriptor = {
        id: id,
        group: hotGroup,
        core: core,
        glow: glow,
        ring: ring,
        line: line
      };
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

  // 悬停发光是唯一还需要"读当前状态直接算一次"的热点视觉——不是逐帧动画，只是每次
  // hoverId 变化（或状态变化，可能影响同一部位）时算一遍，写入 markDirty 之外的静态值。
  function applyHotspotHoverGlow(engine, id) {
    var hs = engine.hotspots.byId[id];
    var hoverBoost = engine.hoverId === id ? HOTSPOT.hoverGlowBoost : 0;
    hs.glow.material.opacity = HOTSPOT.glowOpacity + hoverBoost;
  }

  // 脉冲环改成按状态一次性设定固定的 scale/opacity（不再逐帧动画），在 setStatuses() 里
  // 状态变化时调用一次即可，不是永久脏源。
  function applyHotspotStatic(engine, id) {
    var hs = engine.hotspots.byId[id];
    var status = engine.statuses[id];
    var pulse = HOTSPOT.pulse[status];
    hs.ring.scale.setScalar(pulse.scale);
    hs.ring.material.opacity = pulse.opacity;
    applyHotspotHoverGlow(engine, id);
  }

  // 唯一仍然需要"每次实际渲染都重新算"的热点状态：脉冲环是 billboard（贴着相机朝向），
  // 相机一动它就要跟着转向。这个函数只在 startLoop 真正要渲染的那一帧才被调用，
  // 静止时不会执行，所以不是永久脏源。
  function updateHotspotBillboards(engine) {
    engine.hotspots.list.forEach(function (hs) {
      hs.ring.quaternion.copy(engine.camera.quaternion);
    });
  }

  function collectMaterials(mesh) {
    return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  }

  function cacheAndApplySelection(engine, id) {
    var meshes = engine.partMeshes[id];
    if (!meshes) throw new Error("未知的高亮部位: " + id);
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
    // 选中态高亮改成一次性设定固定值，不再逐帧脉动（emissiveIntensity 曾经每帧按 sin()
    // 振荡，是一个永久脏源）。取消选中时 restoreSelection 会精确还原下面 cache 里存的
    // 原始 emissive / emissiveIntensity。
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
    if (engine.activeId === id) return;
    if (engine.activeId) restoreSelection(engine, engine.activeId);
    engine.activeId = id;
    if (id) cacheAndApplySelection(engine, id);
    markDirty(engine);
  }

  function setStatuses(engine, statuses) {
    window.Pump3DContract.PART_IDS.forEach(function (id) {
      var status = statuses[id];
      if (!status) throw new Error("缺少部位状态: " + id);
      if (["ok", "warn", "danger"].indexOf(status) < 0) throw new Error("未知的部位状态: " + status);
      engine.statuses[id] = status;
      applyHotspotStatusColor(engine.hotspots.byId[id], status);
      applyHotspotStatic(engine, id);
    });
    markDirty(engine);
  }

  function labelsCollide(a, b, minDy, minDx) {
    return Math.abs(a.y - b.y) < minDy && Math.abs(a.x - b.x) < minDx;
  }

  // 单调单趟扫描：按 y 升序，每个标签只与已放置的标签比，命中碰撞就用 Math.max 往下推。
  // 这里绝对不能写成 "while (changed) { ... y = y_k + push; changed = true; }" 那种收敛循环：
  // push 恰好等于 minDy，而 (y_k + minDy) - y_k 在浮点下可能算出 53.99999999999999 < 54，
  // 于是同一个赋值被反复判为"仍在碰撞"，changed 永远为 true，整个页面同步卡死。
  // 改成 Math.max 后 y 只增不减、只会远离所有更小的 y，不存在需要反复收敛的情况。
  // points 必须已按 y 升序排好（调用方负责，因为本函数可能被调用不止一次）。
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

  // 单趟 sweepLabels 有个已知盲区："连锁碰撞"：把 points[i] 推到 points[k]+push 之后，不会
  // 回头检查它是否因此撞上了排在 k、i 之间、比 i 早处理的另一个点。修法是把整趟扫描固定重跑
  // 一遍（这不是"收敛循环"——次数写死为 2，不取决于任何"是否还在碰撞"的判断，因此不会重现
  // 上面那段注释描述的死循环）。
  //
  // 去碰撞只管彼此不重叠，收尾还要把落点收进宿主矩形，否则滚轮拉近后标签会越界到
  // .pump-train 的 overflow:hidden 之外——不可见的按钮仍留在 tab 序列里会把键盘焦点丢出画面。
  // 但直接 clamp 有个更隐蔽的坑：竖直空间不够摆下 6 个标签时，clamp 只会把越界的一端拉回
  // 边界，而不管这样做会不会把它推得离邻居更近——sweepLabels 刚拉开的间距被 clamp 原样撤销，
  // 于是"去碰撞算法本身没错，但收尾这一步把它推翻了"。
  //
  // 这里改成两级策略：① 先尝试整体平移——不改变任何两两间距，天然不会制造新碰撞；
  // ② 平移仍放不下时，只按每段间距各自的"富余量"（超出该段最小间距的部分）等比例收缩，
  // 绝不把已经贴到最小间距的相邻对再往回压。points 必须已按 y 升序排列。
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

  // 6 个热点标签的投影 + 全量两两去碰撞（n=6，15 次比较，成本可忽略）。
  function syncLabels(engine) {
    var width = engine.host.clientWidth;
    var height = engine.host.clientHeight;
    var points = [];

    window.Pump3DContract.PART_IDS.forEach(function (id) {
      var el = engine.labelEls[id];
      if (!el) throw new Error("缺少热点标签元素: " + id);
      var anchor = engine.anchors[id];
      engine.scratchVector.copy(anchor).project(engine.camera);
      // 这个分支防的是"锚点跑到相机背后"（透视投影下 w<0 会让 NDC z>1），不是遮挡剔除——
      // radiusMin(20) 远大于模型最大半展(约 12.8)，锚点在两个 preset 下都不可能跑到相机背后，
      // 这条分支目前恒为 false，纯属边界防护。本项目也不做"被机体挡住即隐藏"的遮挡剔除：
      // 6 个锚点都布在机组轮廓之外/之上，raycast 遮挡剔除的实现成本换不到实际观感收益。
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

    // 阈值用 mount() 时现测的标签盒尺寸 + 少量间隙，而不是拍脑袋的像素数：标签盒比阈值
    // 大，去碰撞在构造上就不可能真正消除重叠。
    var minDy = engine.labelBoxHeight + HOTSPOT.labelCollision.gap;
    var minDx = engine.labelBoxWidth + HOTSPOT.labelCollision.gap;
    var push = minDy;

    // 固定跑两遍 sweepLabels（不是收敛循环，见 sweepLabels/fitLabelsVertically 上方注释）：
    // 每遍之间、以及最后一遍之后都要重新按 y 排序——sweepLabels 只保证"点 i 与它推挤过的
    // 点 k(k<i) 不再碰撞"，不保证扫完一遍后数组仍是 y 升序（一个没被推挤过的点可能原地
    // 留在两个都被推高很多的点之间）。fitLabelsVertically 是按相邻 y 差值算间距的，输入
    // 必须严格有序，否则算出负的"间距"会让富余量估算失真。
    points.sort(function (a, b) { return a.y - b.y; });
    sweepLabels(points, minDy, minDx, push);
    points.sort(function (a, b) { return a.y - b.y; });
    sweepLabels(points, minDy, minDx, push);
    points.sort(function (a, b) { return a.y - b.y; });

    var halfWidth = engine.labelBoxWidth / 2;
    var halfHeight = engine.labelBoxHeight / 2;
    fitLabelsVertically(points, halfHeight, height - halfHeight, minDy, minDx);
    // fitLabelsVertically 已经把 y 收进 [halfHeight, height-halfHeight]；这里的 clamp 是
    // 给 x 做的（fitLabelsVertically 不碰 x），y 上的 clamp 纯属防御，不应有实际效果。
    points.forEach(function (p) {
      p.x = clamp(p.x, halfWidth, width - halfWidth);
      p.y = clamp(p.y, halfHeight, height - halfHeight);
    });

    points.forEach(function (p) {
      p.el.style.transform = "translate3d(" + p.x + "px," + p.y + "px,0) translate(-50%,-50%)";
    });
  }

  // 标签按钮由 core/dom.js 的 renderPumpTrain() 每次 render 都重新生成，是新节点，
  // 必须每次 mount 都重建映射并重绑 hover。
  function buildLabelMap(engine, host) {
    // 走契约常量，不要硬编码类名/属性名：单一真源在 scripts/pump3d/contract.js。
    var labelsRoot = host.querySelector("." + window.Pump3DContract.LABELS_CLASS);
    if (!labelsRoot) throw new Error("缺少 ." + window.Pump3DContract.LABELS_CLASS + " 容器");
    var map = {};
    var maxWidth = 0;
    var maxHeight = 0;
    labelsRoot.querySelectorAll("[" + window.Pump3DContract.PIN_ATTR + "]").forEach(function (button) {
      var id = button.dataset.part;
      map[id] = button;
      // 现测标签盒尺寸，不要把 CSS 里的 min-width/min-height 抄一份数字过来当阈值——
      // 那样 CSS 改了这里忘改，去碰撞和越界钳制会静默失准。active 状态的 .pin-core 更大，
      // 取所有按钮里的最大值，保证阈值覆盖到激活态标签实际占用的空间。
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
    // DPR 只在 createEngine() 里设一次的话，把窗口从内置屏拖到外接低 DPI 屏后不会跟着变，
    // 画面会变模糊或过采样，所以每次 resize 都要重新读一次 devicePixelRatio。
    // 但只在真的变化时才写：setPixelRatio 内部会连带 setSize 重新分配整个绘制缓冲，
    // 而 ResizeObserver 每次 mount 都会触发 resize，无条件重设会让每次切场景都白白重分配一次缓冲。
    var pixelRatio = Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO);
    if (engine.renderer.getPixelRatio() !== pixelRatio) engine.renderer.setPixelRatio(pixelRatio);
    engine.renderer.setSize(width, height, false);
    engine.camera.aspect = width / height;
    engine.camera.updateProjectionMatrix();
    markDirty(engine);
  }

  function applyPresetToEngine(engine, name, animated) {
    if (!PRESETS[name]) throw new Error("未知的 3D 视角预设：" + name);
    engine.preset = name;
    engine.orbit.applyPreset(name, animated);
    engine.gridHelper.visible = !!PRESETS[name].grid;
  }

  // 脏标记：任何离散事件（挂载、resize、选中/状态变化、悬停变化、拖拽、滚轮缩放、
  // reduced-motion 查询变化……见第 14 章脏源清单）都通过它把 engine.dirty 置真，并在
  // RAF 循环当前处于停止状态时重新排一帧。循环真正静止时不会自己继续排队（见
  // startLoop），"唤醒"必须由这里显式触发，不能指望"反正每帧都在跑，状态改了自然生效"。
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

      // 以下四条守卫命中时本帧什么都不做，也不再自我排队——分别由 mount()、
      // visibilitychange、resize()、IntersectionObserver 在各自条件恢复时显式调用
      // markDirty() 把循环唤醒，不需要在这里空转等待（那正是旧版会持续吃 CPU/GPU 的地方）。
      if (!engine.host || !engine.host.isConnected) return;
      if (document.hidden) return;
      if (!engine.visible) return;
      if (engine.host.clientWidth === 0 || engine.host.clientHeight === 0) return;

      var moving = engine.orbit.update(now);
      if (moving) engine.dirty = true;

      if (!engine.dirty) return; // 真正静止：不渲染，也不再请求下一帧，直到某个脏源唤醒

      if (now - engine.lastRenderTime < FRAME_INTERVAL_MS) {
        // 还没到 30fps 节流的下一个槽位，dirty 仍为 true，继续排队等下一次判定。
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

      // 相机已收敛（orbit.update 已把当前值 snap 到 target）：这一帧渲染完就回到静止，
      // 不再有理由继续渲染，除非之后又有新的脏源把 dirty 重新置为 true。
      if (!moving) engine.dirty = false;

      if (engine.dirty) {
        engine.frameScheduled = true;
        engine.rafId = window.requestAnimationFrame(frame);
      }
    }

    engine.frameFn = frame;
    markDirty(engine);
  }

  function createEngine(presetName) {
    if (!PRESETS[presetName]) throw new Error("未知的 3D 视角预设：" + presetName);
    var THREE = requireThree();
    var Model = requireModel();

    var canvas = document.createElement("canvas");
    canvas.className = "pump3d-canvas";
    // 3D 造型对屏幕阅读器是纯装饰，部位信息由 .part-pin 按钮承载。
    canvas.setAttribute("aria-hidden", "true");

    var gl = createGLContext(canvas);
    var renderer = new THREE.WebGLRenderer({ canvas: canvas, context: gl });
    // 语义上这一行就是"创建了几个 WebGL context"，紧跟在 WebGLRenderer 构造之后计数：
    // 若放在函数末尾，createEngine 中途抛错（PMREM/Model.build/createHotspots 等任何一处）
    // 都会在已经创建了 context 之后退出，而 ensureEngine 的 engine 仍是 null，
    // 下次 render() 会再造一个 canvas+context，泄漏的这一个却因为计数写在最后而不会被计入。
    contextCreated += 1;
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = LIGHTING.toneMappingExposure;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // 模型静止、投影光源终生不动，而平行光阴影用光源自己的正交相机渲染、与观察相机无关，
    // 所以阴影贴图只需生成一次，省掉每帧重算深度贴图的 GPU 工作。
    // 注意：这一项**不会**体现在 renderer.info.render.calls 上——three r160 的 render() 里
    // info.reset() 调用在 shadowMap.render() 之后，该指标本来就不统计阴影 pass。
    // （早先这里写"draw call 从 ~166 降到 ~83"是错的：实测关掉阴影 draw call 一点不变；
    //   真正让 draw call 翻倍的是 transmission pass，见 model.js 的 sightGlassMat 注释。）
    // 两行必须同时设：只设 autoUpdate=false 会导致阴影从头到尾都不生成。
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(PRESETS[presetName].fov, 1, 0.1, 500);

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
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 80;
    scene.add(key);

    var rimCyan = new THREE.DirectionalLight(LIGHTING.rimCyan.color, LIGHTING.rimCyan.intensity);
    rimCyan.position.set(LIGHTING.rimCyan.position[0], LIGHTING.rimCyan.position[1], LIGHTING.rimCyan.position[2]);
    scene.add(rimCyan);

    var rimAmber = new THREE.DirectionalLight(LIGHTING.rimAmber.color, LIGHTING.rimAmber.intensity);
    rimAmber.position.set(LIGHTING.rimAmber.position[0], LIGHTING.rimAmber.position[1], LIGHTING.rimAmber.position[2]);
    scene.add(rimAmber);

    // 环境贴图：金属材质在没有 environment 时会渲染成黑块，这里用 32x16 渐变 DataTexture 走 PMREM。
    var pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    var gradientTexture = createGradientTexture(THREE);
    scene.environment = pmrem.fromEquirectangular(gradientTexture).texture;
    gradientTexture.dispose();
    pmrem.dispose();

    var materials = Model.createMaterials(THREE);
    var built = Model.build(THREE, materials);
    scene.add(built.group);

    var gridHelper = built.group.getObjectByName("pump3d-grid");
    if (!gridHelper) throw new Error("模型缺少名为 pump3d-grid 的网格对象");
    // 首次 mount 不会走 applyPresetToEngine（instance.preset 已等于要挂载的 preset），
    // 这里要同步做 applyPresetToEngine 里对 gridHelper 做的事，否则网格可见性会漏设。
    gridHelper.visible = !!PRESETS[presetName].grid;

    var hotspots = createHotspots(built.anchors, THREE);
    scene.add(hotspots.group);

    // instance 提前声明（hoist）：下面 createOrbit 的 notifyDirty 回调要引用它，但此时
    // instance 对象字面量还没构造完成——var 声明提升让闭包能"晚绑定"地读到之后才赋的值，
    // 回调真正被调用时（用户第一次拖拽/滚轮）instance 早已构造完毕，不存在时序问题。
    // 用实际要挂载的 preset 初始化轨道控制器，不要写死成 dashboard：否则若持久化的
    // state.scene 是 station，首次 mount 会先落到 dashboard 机位、再动画滑向 station，
    // 多出一段不该有的入场动画。
    var instance;
    var orbit = createOrbit(camera, canvas, PRESETS[presetName], function () { markDirty(instance); });

    instance = {
      THREE: THREE,
      canvas: canvas,
      renderer: renderer,
      scene: scene,
      camera: camera,
      partMeshes: built.partMeshes,
      anchors: built.anchors,
      hotspots: hotspots,
      gridHelper: gridHelper,
      orbit: orbit,
      host: null,
      labelEls: {},
      labelBoxWidth: 0,
      labelBoxHeight: 0,
      preset: presetName,
      activeId: null,
      selectionCache: {},
      statuses: {},
      hoverId: null,
      mountCount: 0,
      frames: 0,
      rafId: 0,
      // 按需渲染状态：visible 由 IntersectionObserver 维护；dirty/frameScheduled/
      // lastRenderTime/frameFn 由 markDirty()/startLoop() 维护，见第 14 章。
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
    // 面板还在 DOM 里、标签页也可见，但被滚出了可视区时也要停：RAF 循环的静默守卫只覆盖
    // "场景不含 3D"和"标签页隐藏"，这一条补的正是"host 仍 isConnected 且 tab 可见，但
    // 被滚动出视口"的情况——同样没有理由继续渲染。重新进入视口时唤醒一次即可。
    instance.intersectionObserver = new IntersectionObserver(function (entries) {
      var wasVisible = instance.visible;
      instance.visible = entries[entries.length - 1].isIntersecting;
      if (instance.visible && !wasVisible) markDirty(instance);
    });

    // 标签页从隐藏切回可见时唤醒一次；隐藏期间循环已经彻底停止排队，不依赖
    // document.hidden 的逐帧检查来"空转等待恢复"。
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) markDirty(instance);
    });

    // 下面这几个都是"合成器可能已经丢掉这一层的内容、但我们的 dirty 标记却是干净的"
    // 的时机。配合 GL_ATTRS 的 preserveDrawingBuffer 一起用：preserveDrawingBuffer
    // 保住绝大多数情况，这几个钩子兜住剩下的（窗口失焦再回来、从 bfcache 恢复、
    // GPU 上下文丢失后恢复）。少画一帧的代价远小于用户看到一块空白。
    window.addEventListener("focus", function () { markDirty(instance); });
    window.addEventListener("pageshow", function () { markDirty(instance); });
    canvas.addEventListener("webglcontextrestored", function () { markDirty(instance); });
    // 上下文丢失必须显式报出来，不能静默：丢了之后画面不会再更新，用户看到的就是
    // 一块凝固的旧画面，若不报错根本无从排查。
    canvas.addEventListener("webglcontextlost", function () {
      throw new Error("3D 泵机组视图的 WebGL 上下文已丢失（通常是 GPU 驱动重置或显存不足），请刷新页面");
    });

    startLoop(instance);

    return instance;
  }

  var engineFailed = false;

  function ensureEngine(presetName) {
    // 快速失败闩锁，不是兜底：createEngine 中途抛错时 engine 仍是 null，若不加这道闩锁，
    // 下一次 render() 会静默地再造一个 canvas + WebGL context 重试，既掩盖了原始报错，
    // 又会在开发期反复切场景时把浏览器的 WebGL context 配额耗尽。
    if (engineFailed) {
      throw new Error("Pump3D 引擎首次初始化已失败，请修复上一次的报错后刷新页面");
    }
    if (!engine) {
      engineFailed = true;
      engine = createEngine(presetName);
      engineFailed = false;
    }
    return engine;
  }

  function mount(host, options) {
    if (!host) throw new Error("Pump3D.mount 需要有效的宿主元素");
    if (!options || (options.preset !== "dashboard" && options.preset !== "station")) {
      throw new Error("Pump3D.mount 需要合法的 preset（dashboard|station）");
    }

    var instance = ensureEngine(options.preset);

    host.insertBefore(instance.canvas, host.firstChild);
    instance.host = host;
    instance.orbit.setHost(host);

    // 契约 8 要求 insert canvas 之后立刻读 clientWidth/clientHeight，见 contract.js 里
    // assertDom 的注释：合法的 0×0 不存在，CSS 布局失误必须在第一次渲染就炸出来。
    window.Pump3DContract.assertDom(host, options);

    buildLabelMap(instance, host);

    instance.resizeObserver.disconnect();
    instance.resizeObserver.observe(host);
    instance.intersectionObserver.disconnect();
    instance.intersectionObserver.observe(host);

    // 只有切换场景（preset 变化）时才重放预设动画（并重新触发入场巡航，见 createOrbit
    // 的 applyPreset）：app.js 的 render() 每次切场景都会 detach()+mount()，点击任意
    // [data-part] 标签同样会触发一次 render()。若不加这个判断，用户拖到自己想要的角度后
    // 点一下部位标签，镜头会被无条件打回预设机位，还会变相回到"每点一次部位就转 6 秒"
    // 的永久渲染。同场景内重挂载因此保留用户当前视角，跨场景切换仍然有镜头动画+入场巡航。
    if (instance.preset !== options.preset) {
      applyPresetToEngine(instance, options.preset, true);
    }
    setActive(instance, options.activeId || null);
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
    // hoverId 靠 pointerleave 清空，但宿主被 stage.innerHTML="" 整体拆除时 pointerleave
    // 不会触发：不在这里显式清掉的话，悬停某个标签再点击它之后 hoverId 会永久指向已销毁的
    // 节点，新 mount 后同名热点的 glow 会一直带着 hoverGlowBoost。
    engine.hoverId = null;
    engine.labelEls = {};
    engine.orbit.setHost(null);
  }

  function debugInfo() {
    if (!engine) throw new Error("Pump3D 尚未挂载，无法获取调试信息");
    var width = engine.host ? engine.host.clientWidth : 0;
    var height = engine.host ? engine.host.clientHeight : 0;
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
      // 按需渲染的可观测状态（第 14 章）：idle 为 true 表示当前不会再自行请求下一帧，
      // introCruiseActive 为 true 表示有限入场巡航仍在进行。
      idle: !engine.dirty,
      introCruiseActive: engine.orbit.isIntroCruiseActive()
    };
  }

  window.Pump3D = {
    mount: mount,
    detach: detach,
    debugInfo: debugInfo
  };
})();
