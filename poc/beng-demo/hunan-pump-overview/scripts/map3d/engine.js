// 湖南省大屏地图 3D 引擎：window.HunanMap3D。
//
// 【POC：hunan-pump-overview（泵站总览，成品油管道）】
// 本文件与 poc/hunan-inspection-overview/scripts/map3d/engine.js 是逐字节相同的独立
// 副本（除本段 POC 名称注释）——两块大屏刻意互不耦合，各持完整引擎副本，运行时零共享。
//
// 本文件不是重新设计，而是从 /Users/admin/Code/xunjian-ai-demo/poc/inspection-3d-sandbox/scripts/map3d/engine.js
// （1238 行，已通过 41/41 验收）抄写改造而来；那份引擎自己又是从
// /Users/admin/Code/beng-ai-demo/poc/pump-demo/scripts/pump3d/engine.js 抄写来的。以下
// 7 段与"渲染的是泵、站场还是省域大屏"完全无关的免费资产逐字保留（只把中文提示文案里
// 提到的产品名换成"湖南省大屏地图"，逻辑/常量/结构一个字不改，sandbox 相对 pump3d
// 也是同样只换了文案）：
//   1) createGLContext + GL_ATTRS（166 行区间，源引擎第 164-173 行）——自建 context 再
//      交给 three：同一 canvas 第二次 getContext 会静默忽略全部属性参数；
//      preserveDrawingBuffer:true 是真机空白故障的唯一防线。
//   2) createOrbit（源引擎第 228-467 行，约 240 行）——r160 UMD 没有 OrbitControls，
//      这是手写的轨道控制器：最短路径 theta、deltaMode 归一化、收敛 snap、
//      lostpointercapture 兜底、retarget()、zoomBy()、入场巡航。screenScale() 是它
//      唯一的外部依赖（onPointerMove 用它把屏幕像素差归一化到当前 --screen-scale），
//      一并逐字保留。
//   3) markDirty / startLoop（源引擎第 852-899 行）——按需渲染脏标记纪律 + 30fps 节流
//      + 四条静默守卫（host 未挂载 / document.hidden / !visible / 尺寸为 0）。
//   4) sweepLabels / fitLabelsVertically（源引擎第 632-698 行）——标签去碰撞，连同
//      "绝不能写成 while(changed) 收敛循环"那条红线注释一起抄：push 恰好等于 minDy
//      时浮点误差会让同一次推移被反复判定为仍在碰撞，写成收敛循环会死锁整个页面。
//   5) 阴影 renderer.shadowMap.autoUpdate=false 紧跟 renderer.shadowMap.needsUpdate=true
//      （两行必须配对，漏掉后者阴影从头到尾不生成、且不报任何错）。
//   6) contextCreated += 1 紧跟 renderer 构造之后的位置（中途抛错也不能漏计）+
//      engineFailed 闩锁（ensureEngine 里"首次创建失败后再调用直接抛错，不重试"）。
//   7) webglcontextlost -> throw（写在 canvas 的事件监听器里，会以 pageerror 冒出来，
//      验收断言的正是这个）。
//
// 明确改写/扩展的地方（都是"渲染对象从固定 12/6 元素变成三级钻取"这个本质差异带来的）：
//   - 契约命名空间：window.Map3DContract -> window.HunanContract，AREA_IDS 的一维遍历
//     -> ZONE_IDS（10 作业区）+ 站点 id（数量随数据变化，不是硬编码常量）的两套遍历，
//     具体在哪个层级遍历哪一套见下文"三级 LOD"。
//   - PRESETS：源引擎的 overview/area 两档 -> province/zone/site 三档省域机位，键名
//     与 HunanContract.LOD_LEVELS 的取值完全一致（这不是巧合，是刻意让 applyPreset()
//     的参数直接就是 level 字符串，不需要额外的 level->preset 名称映射表）。未知
//     level/preset 键仍然抛错，不做任何容错兼容。
//   - 三级 LOD 与热点/标签的遍历对象：
//       province 级：3D 热点仅显示 10 个作业区热点（Contract.ZONE_IDS 全集），站点热点
//         整体隐藏；DOM 标签同样只有 10 个作业区标签（HunanContract.assertLabelKeys 在
//         这一级要求键集合等于 ZONE_IDS 全集）。
//       zone/site 级：3D 热点隐藏全部作业区热点，只显示 engine.siteZoneMap[siteId] ===
//         activeZoneId 的站点热点；DOM 标签由 core/ui 层按同一 level 预先渲染好（引擎
//         只负责投影已存在的标签，不自己决定"这一级该显示哪些标签"这件事——那是
//         core/ui 的职责边界），引擎侧只对 HunanContract.assertLabelKeys 的分级校验
//         负责（zone/site 级不要求键集合等于任何全集，只要求键合法且不重复）。
//     3D 热点的"创建"仍然只做一次（构造时把 Contract.ZONE_IDS ∪ data.sites 的全部
//     id 一次性建成一个常驻对象池），不是每次切换 level 都重新 new 一批 Object3D
//     再销毁旧的——这是刻意的：本项目和源引擎一样没有 dispose 路径（详见文件尾
//     "明确不要做的事"），level 切换只翻转对象池里各条目的 .visible，不涉及任何
//     几何/材质的创建或销毁。"遍历对象随 level 变化"体现在：①对象池本身要遍历的
//     id 集合不是像源引擎 AREA_IDS 那样的硬编码定长数组，而是 ZONE_IDS 并上
//     data.sites 动态给出的可变长度集合；②状态施加（applyZoneStatuses）与可见性
//     刷新（refreshHotspotVisibility）这两个"每次 mount/setLevel 都会重新跑一遍"的
//     操作，其遍历目标集合随当前 level 变化而不同。
//   - PRESETS.zone / PRESETS.site 没有固定 target——由 mount()/setLevel() 现场从
//     built.zoneAnchors[activeZoneId] 或 built.siteAnchors[activeSiteId] 算出，通过
//     createOrbit().retarget() 或 applyPreset() 的 targetOverride 参数注入，PRESETS
//     表里的字面量只在"引擎刚创建、还没 mount 过"这个瞬间当占位（与源引擎 area 预设
//     的处理方式完全一致）。
//   - computeTarget() 的调用时机比源引擎晚一步：源引擎的 computeTarget 依赖一个独立
//     的全局数据源（window.DemoStation），mount() 在 ensureEngine() 之前就能算出
//     initialTarget；本引擎的 zoneAnchors/siteAnchors 只能来自 model.build() 的返回值，
//     而 model.build() 只在 createEngine() 内部才会被调用——所以 computeTarget() 在
//     createEngine() 内部、model.build() 之后才第一次被调用，首次挂载的相机初始朝向
//     由 createEngine() 自己算好后传给 createOrbit() 的 initialTarget 参数；后续每次
//     mount()/setLevel() 则直接用已经建好的 engine.zoneAnchors/siteAnchors 现场算。
//   - 高亮选中态拆成两条独立状态机：setActiveZoneHighlight（作业区级）与
//     setActiveSiteHighlight（站点级），分别对 built.zoneMeshes / built.siteMeshes 生效，
//     互不影响——源引擎只有一级（区域），这里因为要能同时记住"当前在哪个作业区"和
//     "当前选中哪个站点"（site 级下钻时两者都非空），必须拆成两套缓存/恢复逻辑，
//     而不能像源引擎那样共用一个 selectionCache。
//   - hotspot 引线的目标：源引擎的"泵轴中心线"硬编码已经在 sandbox 阶段就改成了
//     "指回 model 给的 anchors"，本引擎原样沿用这条设计（引线从悬浮位置垂直落回
//     built.zoneAnchors[id] / built.siteAnchors[id]，不写死任何具体坐标）。
//   - ACTIVE_LABEL_ATTR（data-active-zone-label）：源引擎和 sandbox 都没有这个概念，
//     是 HunanContract 新增的 DOM 常量。引擎在每次标签重建（buildLabelMap）和每次
//     作业区选中态变化（setActiveZoneHighlight）之后，把这个属性写到/摘掉
//     engine.labelEls[activeZoneId] 对应的按钮元素上，供 core/ui 层的 CSS 选择器
//     识别"当前激活的作业区标签"并单独描边/加粗，引擎本身不关心具体样式。
//
// 明确没有做的事（任务要求）：
//   - 没有 setMode 或任何"换模型"能力——两块大屏各自单模型、终生单例，
//     contextCreated === 1 这条不变量必须成立。
//   - 没有 dispose 路径——与源引擎一致，是刻意的设计；引入换模型才需要它。
//   - 没有引入 TextureLoader——file:// 下会被 CORS 拒绝且 three r160 会静默吞掉
//     SecurityError、渲染成纯黑还不报错，所有材质都用纯色 MeshStandardMaterial /
//     MeshBasicMaterial，颜色来自 HOTSPOT.colors / STATUS 映射，不采样任何图片。
(function () {
  "use strict";

  // 打光方位跟着三档机位的实际取景角度算：三档相机都落在南侧偏西（phi 由小到大，
  // 从接近俯视到接近水平），主光从东北高处打下，暖辅光西侧补，青色轮廓光留在北侧
  // 勾边——与源引擎"布光方位必须跟着 PRESETS 的实际机位算"是同一条纪律。省域尺度
  // 比 sandbox 的 680x460 站场沙盘更大（约 -560~560 x -270~270），阴影相机的
  // shadowCamSize 相应从源引擎/sandbox 的 384/420 放大到 650，否则边缘作业区的
  // 阴影会被裁在阴影相机视锥之外。
  var LIGHTING = {
    hemisphere: { sky: 0x8fd4ea, ground: 0x0b1117, intensity: 0.42 },
    key: { color: 0xffffff, intensity: 3.0, position: [260, 380, -160], shadowMapSize: 2048, shadowBias: -0.0006, shadowCamSize: 650 },
    rimAmber: { color: 0xf0c887, intensity: 1.1, position: [-300, 140, -90] },
    rimCyan: { color: 0x4bb3d3, intensity: 1.0, position: [0, 180, 300] },
    envGradient: { top: "#2e4d5e", mid: "#16232c", bottom: "#0a1218", width: 32, height: 16 },
    toneMappingExposure: 1.2
  };

  // 三档省域机位：province（全省入画，接近正俯视但留角度让挤出块看得出高度）/
  // zone（推近某作业区，带出相邻市）/ site（贴近某站点）。键名与
  // HunanContract.LOD_LEVELS 的取值一一对应，未知键仍然抛错。
  //
  // zone/site 没有固定 target——由 mount()/setLevel() 现场从 built.zoneAnchors /
  // built.siteAnchors 算出并通过 retarget()/targetOverride 注入，这里的 target
  // 字面量只在"引擎刚创建、还没有 mount 过"这个瞬间当占位。
  var PRESETS = {
  // theta 取 +π/2（≈1.5708）而不是任意角度，是为了让**正北朝上**：
  // 相机位置是 x = target.x + r·sinφ·cosθ、z = target.z + r·sinφ·sinθ，
  // 要让屏幕上方对应 −Z（北），相机必须落在 +Z 侧朝 −Z 看，即 cosθ≈0、sinθ≈+1。
  // 第一版取 −1.1，相机落在东北侧朝西南看，画面上的湖南被转了约 60°——岳阳（东北）
  // 跑到屏幕右下、湘西（西）跑到上方。省域总览大屏，人默认期待正北朝上，改这个值前
  // 请先想清楚这一点。
    province: { radius: 900, min: 650, max: 1500, theta: 1.5708, phi: 0.5, target: [0, 20, 0], fov: 42, azimuthClamp: null },
    zone: { radius: 400, min: 240, max: 620, theta: 1.5708, phi: 0.9, target: [0, 20, 0], fov: 40, azimuthClamp: 0.3 },
    site: { radius: 90, min: 55, max: 160, theta: 1.5708, phi: 1.15, target: [0, 10, 0], fov: 36, azimuthClamp: 0.3 }
  };

  // 站点热点相对作业区热点的缩放比，理由见 refreshHotspotVisibility 里的注释。
  var SITE_HOTSPOT_SCALE = 0.28;

  var HOTSPOT = {
    coreRadius: 4.2,
    coreSegments: [16, 12],
    glowRadius: 6.6,
    glowOpacity: 0.18,
    hoverGlowBoost: 0.15,
    ringInner: 12.5,
    ringOuter: 15,
    ringSegments: 32,
    leadOpacity: 0.5,
    // 热点悬浮在锚点（作业区色块顶面中心 / 站点光柱底部中心）正上方 hoverHeight 处，
    // 引线从悬浮位置垂直落回锚点。
    hoverHeight: 26,
    colors: { ok: "#30c69d", warn: "#eeb44a", danger: "#ff625c" },
    pulse: {
      ok: { scale: 1, opacity: 0.25 },
      warn: { scale: 1.35, opacity: 0.4 },
      danger: { scale: 1.75, opacity: 0.55 }
    },
    selection: { color: "#4bb3d3", intensity: 0.4 },
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
    if (!window.HunanMapModel) throw new Error("HunanMapModel 未加载，请检查 scripts/map3d/model-*.js");
    return window.HunanMapModel;
  }

  function requireContract() {
    if (!window.HunanContract) throw new Error("HunanContract 未加载，请检查 scripts/map3d/contract.js");
    return window.HunanContract;
  }

  // ==== 段 1：createGLContext + GL_ATTRS —— 逐字抄自
  // /Users/admin/Code/xunjian-ai-demo/poc/inspection-3d-sandbox/scripts/map3d/engine.js（该文件第 164-173 行），
  // 只把提示文案里的产品名换成"湖南省大屏地图" ====
  var GL_ATTRS = { antialias: true, alpha: true, powerPreference: "high-performance", preserveDrawingBuffer: true };

  function createGLContext(canvas) {
    var gl = canvas.getContext("webgl2", GL_ATTRS) || canvas.getContext("webgl", GL_ATTRS);
    if (!gl) {
      throw new Error("WebGL 不可用，无法渲染湖南省大屏地图：请使用支持 WebGL 的浏览器打开，或检查浏览器的硬件加速设置");
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

  // ==== 段 2：createOrbit —— 逐字抄自
  // /Users/admin/Code/xunjian-ai-demo/poc/inspection-3d-sandbox/scripts/map3d/engine.js（该文件第 228-467 行），
  // 一字不改（含 retarget()/initialTarget 两处 sandbox 阶段已经加过的扩展）。
  // r160 UMD 没有 OrbitControls，这是手写的轨道控制器。====
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
    // fov，也绝不触发入场巡航）。用于同一 level 内切换选中区域/站点——只重新对准，
    // 不重放"进入巡航"那个只该在 level 切换那一刻出现的强调动作。
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

  // createOrbit 的 onPointerMove 依赖它把屏幕像素差归一化到当前 --screen-scale，
  // 一并逐字保留（源引擎/sandbox 同名同实现）。
  function screenScale() {
    var value = getComputedStyle(document.documentElement).getPropertyValue("--screen-scale").trim();
    var scale = Number(value);
    if (!Number.isFinite(scale) || scale <= 0) {
      throw new Error("无效的屏幕缩放比例 --screen-scale：" + value);
    }
    return scale;
  }

  // 通用热点对象池：core(状态色实心球) + glow(叠加发光球) + billboard 脉冲环 +
  // 引线（从悬浮位置垂直落回 anchor）。同一份实现被作业区池和站点池共用，
  // 靠调用方传入的 ids/anchors/namePrefix 区分——池本身不知道"我是作业区还是站点"，
  // 这也是"遍历对象不是固定集合"在 3D 层面的落地：ids 由调用方（createEngine）
  // 现场从 Contract.ZONE_IDS 或 data.sites 算出，不是硬编码在本函数里的常量。
  function createHotspotPool(ids, anchors, THREE, namePrefix) {
    var group = new THREE.Group();
    group.name = namePrefix;
    var byId = {};
    var list = [];

    ids.forEach(function (id) {
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
    if (!color) throw new Error("未知的状态颜色映射：" + status);
    hotspot.core.material.color.set(color);
    hotspot.glow.material.color.set(color);
    hotspot.ring.material.color.set(color);
    hotspot.line.material.color.set(color);
  }

  function applyHotspotHoverGlow(engine, pool, id) {
    var hs = pool.byId[id];
    var hoverBoost = engine.hoverId === id ? HOTSPOT.hoverGlowBoost : 0;
    hs.glow.material.opacity = HOTSPOT.glowOpacity + hoverBoost;
  }

  function applyHotspotStatic(engine, pool, id, status) {
    var hs = pool.byId[id];
    var pulse = HOTSPOT.pulse[status];
    if (!pulse) throw new Error("未知的状态脉冲映射：" + status);
    hs.ring.scale.setScalar(pulse.scale);
    hs.ring.material.opacity = pulse.opacity;
    applyHotspotHoverGlow(engine, pool, id);
  }

  function hotspotPoolForId(engine, id) {
    if (engine.zoneHotspots.byId[id]) return engine.zoneHotspots;
    if (engine.siteHotspots.byId[id]) return engine.siteHotspots;
    throw new Error("[HunanMap3D] 找不到 id 对应的热点: " + id);
  }

  // 每个 level 只让"当前相关"的热点池条目可见，其余条目留在场景里但 .visible=false
  // ——不销毁、不重建（本引擎和源引擎一样没有 dispose 路径）。
  //   province：作业区热点全显，站点热点全隐。
  //   zone/site：作业区热点全隐，站点热点只显示所属作业区 === activeZoneId 的那些。
  function refreshHotspotVisibility(engine) {
    var showZones = engine.level === "province";
    engine.zoneHotspots.list.forEach(function (hs) {
      hs.group.visible = showZones;
    });
    engine.siteHotspots.list.forEach(function (hs) {
      hs.group.visible = !showZones && engine.siteZoneMap[hs.id] === engine.activeZoneId;
      // 站点热点整体缩小：HOTSPOT 那套尺寸（coreRadius 4.2 / glowRadius 6.6 /
      // ringOuter 15）是按**省域机位**给 10 个作业区热点定的。下钻后相机拉到 radius
      // 几百，而一个作业区里可能有几十个站点（岳阳 36 个）——照省域尺寸画就是几十个
      // 大光球糊成一片白，画面完全不可读（已实测）。这里按比例缩到 0.28，让站点热点
      // 在近距离读起来是"一串点位"而不是"一团光"。
      hs.group.scale.setScalar(SITE_HOTSPOT_SCALE);
    });
    markDirty(engine);
  }

  function collectMaterials(mesh) {
    return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  }

  function cacheAndApplySelection(meshesMap, cacheMap, id) {
    var meshes = meshesMap[id];
    if (!meshes) throw new Error("未知的高亮对象: " + id);
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
    cacheMap[id] = cache;
    cache.forEach(function (entry) {
      entry.material.emissive.set(HOTSPOT.selection.color);
      entry.material.emissiveIntensity = HOTSPOT.selection.intensity;
    });
  }

  function restoreSelection(cacheMap, id) {
    var cache = cacheMap[id];
    cache.forEach(function (entry) {
      entry.material.emissive.copy(entry.emissive);
      entry.material.emissiveIntensity = entry.emissiveIntensity;
    });
    delete cacheMap[id];
  }

  // 作业区级高亮与站点级高亮是两条独立状态机（源引擎只有一级，这里因为 site 级
  // 下钻时 activeZoneId 与 activeSiteId 同时非空，必须分开缓存/恢复，不能共用一个
  // selectionCache）。
  function setActiveZoneHighlight(engine, zoneId) {
    if (engine.activeZoneId === zoneId) return;
    if (engine.activeZoneId) restoreSelection(engine.zoneSelectionCache, engine.activeZoneId);
    engine.activeZoneId = zoneId;
    if (zoneId) cacheAndApplySelection(engine.zoneMeshes, engine.zoneSelectionCache, zoneId);
    syncActiveLabelAttr(engine);
    markDirty(engine);
  }

  function setActiveSiteHighlight(engine, siteId) {
    if (engine.activeSiteId === siteId) return;
    if (engine.activeSiteId) restoreSelection(engine.siteSelectionCache, engine.activeSiteId);
    engine.activeSiteId = siteId;
    if (siteId) cacheAndApplySelection(engine.siteMeshes, engine.siteSelectionCache, siteId);
    markDirty(engine);
  }

  // 把 HunanContract.ACTIVE_LABEL_ATTR 写到/摘掉当前激活作业区对应的标签按钮上，
  // 供 core/ui 层的 CSS 识别"当前激活的作业区标签"。只负责写属性，不关心具体样式。
  function syncActiveLabelAttr(engine) {
    var Contract = requireContract();
    Object.keys(engine.labelEls).forEach(function (id) {
      var el = engine.labelEls[id];
      if (id === engine.activeZoneId) el.setAttribute(Contract.ACTIVE_LABEL_ATTR, "true");
      else el.removeAttribute(Contract.ACTIVE_LABEL_ATTR);
    });
  }

  function applyZoneStatuses(engine, statuses) {
    var Contract = requireContract();
    Contract.assertZoneSet("zoneStatuses", statuses);
    Contract.ZONE_IDS.forEach(function (zoneId) {
      var status = statuses[zoneId];
      if (Contract.STATUSES.indexOf(status) < 0) {
        throw new Error("[HunanMap3D] 作业区 " + zoneId + " 的状态非法：" + status);
      }
      engine.zoneStatuses[zoneId] = status;
      applyHotspotStatusColor(engine.zoneHotspots.byId[zoneId], status);
      applyHotspotStatic(engine, engine.zoneHotspots, zoneId, status);
    });
    markDirty(engine);
  }

  // ==== 段 4：sweepLabels / fitLabelsVertically —— 逐字抄自
  // /Users/admin/Code/xunjian-ai-demo/poc/inspection-3d-sandbox/scripts/map3d/engine.js（该文件第 632-698 行）====
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

  function updateHotspotBillboards(engine) {
    engine.zoneHotspots.list.forEach(function (hs) { hs.ring.quaternion.copy(engine.camera.quaternion); });
    engine.siteHotspots.list.forEach(function (hs) { hs.ring.quaternion.copy(engine.camera.quaternion); });
  }

  // 标签投影 + 全量两两去碰撞。与源引擎的关键差异：源引擎遍历的是硬编码的
  // Contract.AREA_IDS 全集（12 个），本引擎遍历 Object.keys(engine.labelEls)——
  // DOM 里到底有哪些标签由 core/ui 层按当前 level 预先渲染好（province 级 10 个
  // 作业区标签，zone/site 级若干站点标签），引擎不重新决定"这一级该显示哪些标签"，
  // 只负责把已经存在的标签投影到屏幕、彼此去碰撞。
  //
  // scratchVector.z > 1（锚点跑到相机背后则隐藏该标签）这条分支在 pump3d 上是
  // 死代码，在 sandbox 站场沙盘上是活代码，本项目省域跨度更大、machine province
  // 机位更接近正俯视，这条分支同样是活路径——见 debugInfo().hiddenBehindCamera 与
  // 任务报告里的实测数据。
  function syncLabels(engine) {
    var width = engine.host.clientWidth;
    var height = engine.host.clientHeight;
    var points = [];
    var ids = Object.keys(engine.labelEls);

    ids.forEach(function (id) {
      var el = engine.labelEls[id];
      var anchor = engine.zoneAnchors[id] || engine.siteAnchors[id];
      if (!anchor) throw new Error("[HunanMap3D] 标签 " + id + " 找不到对应锚点（既不是作业区也不是站点）");
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
    var selector = "[" + Contract.ZONE_PIN_ATTR + "], [" + Contract.SITE_PIN_ATTR + "]";
    labelsRoot.querySelectorAll(selector).forEach(function (button) {
      var zoneAttr = button.getAttribute(Contract.ZONE_PIN_ATTR);
      var id = zoneAttr != null ? zoneAttr : button.getAttribute(Contract.SITE_PIN_ATTR);
      map[id] = button;
      if (button.offsetWidth > maxWidth) maxWidth = button.offsetWidth;
      if (button.offsetHeight > maxHeight) maxHeight = button.offsetHeight;
      button.addEventListener("pointerenter", function () {
        engine.hoverId = id;
        applyHotspotHoverGlow(engine, hotspotPoolForId(engine, id), id);
        markDirty(engine);
      });
      button.addEventListener("pointerleave", function () {
        if (engine.hoverId === id) engine.hoverId = null;
        applyHotspotHoverGlow(engine, hotspotPoolForId(engine, id), id);
        markDirty(engine);
      });
    });
    engine.labelEls = map;
    engine.labelBoxWidth = maxWidth;
    engine.labelBoxHeight = maxHeight;
    syncActiveLabelAttr(engine);
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

  function applyLevelToEngine(engine, level, animated, targetOverride) {
    if (!PRESETS[level]) throw new Error("未知的 3D 视角层级：" + level);
    engine.level = level;
    engine.orbit.applyPreset(level, animated, targetOverride);
  }

  // ==== 段 3：markDirty / startLoop —— 逐字抄自
  // /Users/admin/Code/xunjian-ai-demo/poc/inspection-3d-sandbox/scripts/map3d/engine.js（该文件第 852-899 行）====
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

  // 供 mount()/setLevel()/resetView() 计算某个 level 应该对准的 target。
  // province 用 PRESETS.province 的静态字面量（返回 null 让调用方使用字面量）；
  // zone 对准 zoneAnchors[activeZoneId]；site 对准 siteAnchors[activeSiteId]。
  //
  // y 只加一个小偏移（不像 sandbox 那样用 Math.min 封顶）：sandbox 母本的建筑普遍只有
  // 4~7 个世界单位高，target.y 封顶在 10 左右合理；本项目 zoneAnchors/siteAnchors 的
  // y 本身就是几十个单位（挤出块顶面/光柱底座），如果照抄 sandbox 的封顶值，target
  // 会被硬夹到远低于锚点实际高度，导致近距离 zone/site 机位的相机看向锚点脚下的
  // 地坪而不是锚点本身（已实测：site 档 radius=90 时这个封顶会让画面几乎只剩地坪，
  // 看不到光柱），故按锚点自身高度顺加偏移，不做绝对上限封顶。
  function computeTarget(level, activeZoneId, activeSiteId, zoneAnchors, siteAnchors) {
    if (level === "province") return null;
    if (level === "zone") {
      var zoneAnchor = zoneAnchors[activeZoneId];
      if (!zoneAnchor) throw new Error("computeTarget: 未知的作业区 " + activeZoneId);
      return { x: zoneAnchor.x, y: zoneAnchor.y + 6, z: zoneAnchor.z };
    }
    var siteAnchor = siteAnchors[activeSiteId];
    if (!siteAnchor) throw new Error("computeTarget: 未知的站点 " + activeSiteId);
    return { x: siteAnchor.x, y: siteAnchor.y + 6, z: siteAnchor.z };
  }

  function createEngine(level, activeZoneId, activeSiteId, data) {
    if (!PRESETS[level]) throw new Error("未知的 3D 视角层级：" + level);
    var THREE = requireThree();
    var Model = requireModel();
    var Contract = requireContract();

    var canvas = document.createElement("canvas");
    canvas.className = Contract.CANVAS_CLASS;
    canvas.setAttribute("aria-hidden", "true");

    var gl = createGLContext(canvas);
    var renderer = new THREE.WebGLRenderer({ canvas: canvas, context: gl });
    // ==== 段 6：contextCreated 紧跟 renderer 构造之后（逐字抄自源引擎的位置纪律，
    // 中途抛错也不能漏计）====
    contextCreated += 1;
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = LIGHTING.toneMappingExposure;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // ==== 段 5：autoUpdate=false + needsUpdate=true 必须配对（逐字抄自源引擎；
    // 只设第一行会导致阴影从头到尾都不生成）====
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(PRESETS[level].fov, 1, 0.1, 6000);

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
    key.shadow.camera.far = 1600;
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
    var built = Model.build(THREE, materials, data);
    scene.add(built.group);

    var zoneHotspots = createHotspotPool(Contract.ZONE_IDS, built.zoneAnchors, THREE, "hunan-zone-hotspots");
    scene.add(zoneHotspots.group);
    var siteIds = data.sites.map(function (site) { return site.id; });
    var siteHotspots = createHotspotPool(siteIds, built.siteAnchors, THREE, "hunan-site-hotspots");
    scene.add(siteHotspots.group);

    var initialTarget = computeTarget(level, activeZoneId, activeSiteId, built.zoneAnchors, built.siteAnchors);
    var instance;
    var orbit = createOrbit(camera, canvas, PRESETS[level], function () { markDirty(instance); }, initialTarget);

    var siteZoneMap = {};
    data.sites.forEach(function (site) { siteZoneMap[site.id] = site.zoneId; });

    instance = {
      THREE: THREE,
      canvas: canvas,
      renderer: renderer,
      scene: scene,
      camera: camera,
      model: built,
      zoneMeshes: built.zoneMeshes,
      siteMeshes: built.siteMeshes,
      districtMeshes: built.districtMeshes,
      zoneAnchors: built.zoneAnchors,
      siteAnchors: built.siteAnchors,
      pipelineGroup: built.pipelineGroup,
      zoneHotspots: zoneHotspots,
      siteHotspots: siteHotspots,
      siteZoneMap: siteZoneMap,
      orbit: orbit,
      host: null,
      labelEls: {},
      labelBoxWidth: 0,
      labelBoxHeight: 0,
      level: level,
      // activeZoneId/activeSiteId 在这里始终初始化为 null（不是构造参数里传入的
      // activeZoneId/activeSiteId 实参）——真正的高亮应用要等 mount() 调用
      // setActiveZoneHighlight/setActiveSiteHighlight 时才第一次发生，那两个函数
      // 靠"新值 !== 旧值"来判断要不要动手；如果这里直接把旧值填成目标值，第一次
      // mount 时旧值===新值会被误判成"已经选中过，不用做事"，选中态的高亮就永远
      // 不会被应用到 built.zoneMeshes/siteMeshes 上。相机初始朝向不依赖这两个
      // 字段——上面的 initialTarget 已经在 createOrbit() 里用实参算好并生效了。
      activeZoneId: null,
      activeSiteId: null,
      zoneSelectionCache: {},
      siteSelectionCache: {},
      zoneStatuses: {},
      siteStatuses: {},
      hoverId: null,
      mountCount: 0,
      resetViewCount: 0,
      frames: 0,
      rafId: 0,
      visible: true,
      dirty: false,
      frameScheduled: false,
      lastRenderTime: 0,
      frameFn: null,
      scratchVector: new THREE.Vector3()
    };

    data.sites.forEach(function (site) {
      if (Contract.STATUSES.indexOf(site.status) < 0) {
        throw new Error("[HunanMap3D] 站点 " + site.id + " 的状态非法：" + site.status);
      }
      instance.siteStatuses[site.id] = site.status;
      applyHotspotStatusColor(siteHotspots.byId[site.id], site.status);
      applyHotspotStatic(instance, siteHotspots, site.id, site.status);
    });

    instance.pipelineGroup.visible = false;

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
    // ==== 段 7：webglcontextlost -> throw（逐字抄自源引擎）====
    canvas.addEventListener("webglcontextlost", function () {
      throw new Error("湖南省大屏地图的 WebGL 上下文已丢失（通常是 GPU 驱动重置或显存不足），请刷新页面");
    });

    startLoop(instance);

    return instance;
  }

  var engineFailed = false;

  function ensureEngine(level, activeZoneId, activeSiteId, data) {
    if (engineFailed) {
      throw new Error("HunanMap3D 引擎首次初始化已失败，请修复上一次的报错后刷新页面");
    }
    if (!engine) {
      engineFailed = true;
      engine = createEngine(level, activeZoneId, activeSiteId, data);
      engineFailed = false;
    }
    return engine;
  }

  function mount(host, options) {
    if (!host) throw new Error("HunanMap3D.mount 需要有效的宿主元素");
    if (!options) throw new Error("HunanMap3D.mount 需要 options 参数");
    var Contract = requireContract();
    if (Contract.LOD_LEVELS.indexOf(options.level) < 0) {
      throw new Error("HunanMap3D.mount 收到非法 options.level：" + options.level);
    }
    if (!options.zoneStatuses) throw new Error("HunanMap3D.mount 需要 options.zoneStatuses");
    if (!Array.isArray(options.sites)) throw new Error("HunanMap3D.mount 需要 options.sites 数组");
    if (!Array.isArray(options.pipelines)) throw new Error("HunanMap3D.mount 需要 options.pipelines 数组");
    if (!options.geo) throw new Error("HunanMap3D.mount 需要 options.geo");
    if (typeof options.showPipelines !== "boolean") {
      throw new Error("HunanMap3D.mount 需要布尔值 options.showPipelines");
    }
    var activeZoneId = options.activeZoneId != null ? options.activeZoneId : null;
    var activeSiteId = options.activeSiteId != null ? options.activeSiteId : null;
    if (activeZoneId != null && Contract.ZONE_IDS.indexOf(activeZoneId) < 0) {
      throw new Error("HunanMap3D.mount 收到非法 options.activeZoneId：" + activeZoneId);
    }
    if (options.level !== "province" && activeZoneId == null) {
      throw new Error("HunanMap3D.mount：options.level=\"" + options.level + "\" 需要 options.activeZoneId");
    }
    if (options.level === "site" && activeSiteId == null) {
      throw new Error("HunanMap3D.mount：options.level=\"site\" 需要 options.activeSiteId");
    }

    var data = { geo: options.geo, sites: options.sites, pipelines: options.pipelines };
    var instance = ensureEngine(options.level, activeZoneId, activeSiteId, data);

    host.insertBefore(instance.canvas, host.firstChild);
    instance.host = host;
    instance.orbit.setHost(host);

    Contract.assertDom(host, options);

    buildLabelMap(instance, host);
    Contract.assertLabelKeys(instance.labelEls, options.level);

    instance.resizeObserver.disconnect();
    instance.resizeObserver.observe(host);
    instance.intersectionObserver.disconnect();
    instance.intersectionObserver.observe(host);

    var target = computeTarget(options.level, activeZoneId, activeSiteId, instance.zoneAnchors, instance.siteAnchors);
    var levelChanged = instance.level !== options.level;
    var focusChanged = instance.activeZoneId !== activeZoneId || instance.activeSiteId !== activeSiteId;

    if (levelChanged) {
      // level 真的变了（province<->zone<->site）：完整过渡 + 重放入场巡航。
      applyLevelToEngine(instance, options.level, true, target);
    } else if (focusChanged && target) {
      // 仍在同一 level，只是换了选中的作业区/站点：只平滑重新对准，不重放巡航。
      instance.orbit.retarget(target);
    }

    setActiveZoneHighlight(instance, activeZoneId);
    setActiveSiteHighlight(instance, activeSiteId);
    applyZoneStatuses(instance, options.zoneStatuses);
    refreshHotspotVisibility(instance);
    instance.pipelineGroup.visible = options.showPipelines === true;

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

  // 三级钻取的相机与标签 LOD 切换（不重挂 DOM——DOM 标签的增删由 core/ui 层负责，
  // 调用方必须先更新好 host 内的 [data-hunan-zone]/[data-hunan-site] 标签，再调用
  // 本方法，约定与 mount() 一致：mount() 同样假定 host 内 DOM 已经放好标签）。
  function setLevel(level, options) {
    if (!engine) throw new Error("HunanMap3D 尚未挂载，无法 setLevel");
    var Contract = requireContract();
    if (Contract.LOD_LEVELS.indexOf(level) < 0) {
      throw new Error("HunanMap3D.setLevel 收到非法 level：" + level);
    }
    var opts = options || {};
    var activeZoneId = opts.activeZoneId != null ? opts.activeZoneId : null;
    var activeSiteId = opts.activeSiteId != null ? opts.activeSiteId : null;
    if (activeZoneId != null && Contract.ZONE_IDS.indexOf(activeZoneId) < 0) {
      throw new Error("HunanMap3D.setLevel 收到非法 activeZoneId：" + activeZoneId);
    }
    if (level !== "province" && activeZoneId == null) {
      throw new Error("HunanMap3D.setLevel(\"" + level + "\") 需要 options.activeZoneId");
    }
    if (level === "site" && activeSiteId == null) {
      throw new Error("HunanMap3D.setLevel(\"site\") 需要 options.activeSiteId");
    }

    var target = computeTarget(level, activeZoneId, activeSiteId, engine.zoneAnchors, engine.siteAnchors);
    var levelChanged = engine.level !== level;
    var focusChanged = engine.activeZoneId !== activeZoneId || engine.activeSiteId !== activeSiteId;

    if (levelChanged) {
      applyLevelToEngine(engine, level, true, target);
    } else if (focusChanged && target) {
      engine.orbit.retarget(target);
    }

    setActiveZoneHighlight(engine, activeZoneId);
    setActiveSiteHighlight(engine, activeSiteId);
    refreshHotspotVisibility(engine);

    if (engine.host) {
      buildLabelMap(engine, engine.host);
      Contract.assertLabelKeys(engine.labelEls, level);
    }
  }

  function setActiveZone(zoneId) {
    if (!engine) throw new Error("HunanMap3D 尚未挂载，无法 setActiveZone");
    var Contract = requireContract();
    if (zoneId != null && Contract.ZONE_IDS.indexOf(zoneId) < 0) {
      throw new Error("HunanMap3D.setActiveZone 收到非法 zoneId：" + zoneId);
    }
    setActiveZoneHighlight(engine, zoneId);
  }

  function setActiveSite(siteId) {
    if (!engine) throw new Error("HunanMap3D 尚未挂载，无法 setActiveSite");
    if (siteId != null && !engine.siteAnchors[siteId]) {
      throw new Error("HunanMap3D.setActiveSite 收到非法 siteId：" + siteId);
    }
    setActiveSiteHighlight(engine, siteId);
  }

  function setZoneStatuses(byZoneId) {
    if (!engine) throw new Error("HunanMap3D 尚未挂载，无法 setZoneStatuses");
    applyZoneStatuses(engine, byZoneId);
  }

  function setPipelineVisible(visible) {
    if (!engine) throw new Error("HunanMap3D 尚未挂载，无法 setPipelineVisible");
    if (typeof visible !== "boolean") throw new Error("HunanMap3D.setPipelineVisible 需要布尔值");
    engine.pipelineGroup.visible = visible;
    markDirty(engine);
  }

  function zoom(step) {
    if (!engine) throw new Error("HunanMap3D 尚未挂载，无法 zoom");
    if (typeof step !== "number" || !isFinite(step)) throw new Error("HunanMap3D.zoom 需要有限数字 step");
    engine.orbit.zoomBy(step);
  }

  // 把当前 level 的初始 theta/phi/radius/target 带动画地重新施加一次，等价于
  // "回到这个机位刚进来时的姿态"。不管当前是否仍处于同一个 level、不管用户之前把
  // 镜头拖拽/缩放成什么姿态，都直接走一次完整的、带动画的过渡（animated=true）。
  function resetView() {
    if (!engine) throw new Error("HunanMap3D 尚未挂载，无法 resetView");
    var target = computeTarget(engine.level, engine.activeZoneId, engine.activeSiteId, engine.zoneAnchors, engine.siteAnchors);
    applyLevelToEngine(engine, engine.level, true, target);
    engine.resetViewCount += 1;
    markDirty(engine);
  }

  function debugInfo() {
    if (!engine) throw new Error("HunanMap3D 尚未挂载，无法获取调试信息");
    var width = engine.host ? engine.host.clientWidth : 0;
    var height = engine.host ? engine.host.clientHeight : 0;
    var hiddenBehindCamera = 0;
    Object.keys(engine.labelEls).forEach(function (id) {
      if (engine.labelEls[id].style.opacity === "0") hiddenBehindCamera += 1;
    });
    var zonePins = engine.zoneHotspots.list.filter(function (hs) { return hs.group.visible; }).length;
    var sitePins = engine.siteHotspots.list.filter(function (hs) { return hs.group.visible; }).length;
    return {
      contextCreated: contextCreated,
      mountCount: engine.mountCount,
      resetViewCount: engine.resetViewCount,
      renderCalls: engine.renderer.info.render.calls,
      triangles: engine.renderer.info.render.triangles,
      frames: engine.frames,
      level: engine.level,
      aspect: height ? width / height : 0,
      width: width,
      height: height,
      idle: !engine.dirty,
      introCruiseActive: engine.orbit.isIntroCruiseActive(),
      activeZoneId: engine.activeZoneId,
      activeSiteId: engine.activeSiteId,
      zonePins: zonePins,
      sitePins: sitePins,
      hiddenBehindCamera: hiddenBehindCamera,
      cameraPosition: { x: engine.camera.position.x, y: engine.camera.position.y, z: engine.camera.position.z },
      orbit: engine.orbit.debugState(),
      memory: {
        geometries: engine.renderer.info.memory.geometries,
        textures: engine.renderer.info.memory.textures
      }
    };
  }

  window.HunanMap3D = {
    mount: mount,
    detach: detach,
    setLevel: setLevel,
    setActiveZone: setActiveZone,
    setActiveSite: setActiveSite,
    setZoneStatuses: setZoneStatuses,
    setPipelineVisible: setPipelineVisible,
    zoom: zoom,
    resetView: resetView,
    debugInfo: debugInfo
  };
})();
