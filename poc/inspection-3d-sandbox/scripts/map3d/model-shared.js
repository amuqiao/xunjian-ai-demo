// 站场 3D 巡检地图——共享程序化贴图/材质工具（L2，早于 model-sandbox.js / model-satellite.js / engine.js）。
//
// ==== 为什么本文件不允许出现 TextureLoader / drawImage(外部图片) ====
// 页面跑在 file:// 下，origin 是 null。已实测三条路：
//   1) THREE.TextureLoader 默认 crossOrigin="anonymous"，file:// 加载本地图片必被 CORS 拒绝
//      （onError 触发）。
//   2) 绕过 loader、用 <img> 直接加载能成功，但只要 drawImage 进 canvas，这块 canvas 立刻被
//      标记为「已污染」（tainted）。把它上传成 WebGL 纹理时，Three.js r160 在
//      WebGLState.texSubImage2D 内部包了一层 try/catch，把污染纹理抛出的 SecurityError 吞掉、
//      只 console.error 一行、然后继续执行——结果纹理渲染成纯黑，three 内部 threw=false，
//      WebGL getError() 也不报错码。这是本项目最痛恨的一类静默失效：画面是错的，但没有任何
//      机制会告诉你哪里错了。
//   3) data: URI 不受此限（实测全通），但只适合小体量素材，不适合大面积地面纹理。
// 结论：本文件所有纹理必须是程序化生成的 CanvasTexture，不许出现 TextureLoader，不许对任何
// 外部图片调用 drawImage。每个纹理工厂在返回前都会调用 window.Map3DContract.assertTextureUntainted，
// 对同一块 canvas 做一次 getImageData(0,0,1,1)——如果画布已被污染，浏览器会在这一行原生抛出
// SecurityError，把 three.js 会悄悄吞掉的错误在构建期一次性翻译成一次带调用栈的快速失败。
// 不要在这个断言外面包 try/catch——这是 fail-fast，不是 fallback。
//
// ==== 已实测的性能数字（决定了下面的分层策略）====
//   尺寸       形状绘制(arc/fillRect/lineTo/渐变)   逐像素颗粒(getImageData/putImageData)   上传    显存(含mip)
//   512²       1.1ms                                61.4ms                                    1.0ms   ~1.3MB
//   1024²      0.7ms                                65.3ms                                    0.4ms   ~5.3MB
//   2048²      1.7ms                                161ms                                     0.4ms   ~21.3MB
// 逐像素颗粒（对整块画布做一次 getImageData/putImageData）占了总成本的 98%，形状绘制几乎免费。
// 因此本文件的分层规则：
//   - 宏观层固定 1024²，只用 canvas 2D 形状 API（arc/fillRect/lineTo/渐变），不逐像素操作；
//   - 逐像素噪声只在 512² 生成一次，然后用 drawImage 把这块 512 瓦片按 16×16 网格「烘」进宏观层
//     （实测 256 次 drawImage 只要 1-2ms，比在 1024²/2048² 上直接跑一次 getImageData/putImageData
//     便宜一到两个数量级）。
//
// ==== THREE 注入风格 ====
// 与 /Users/admin/Code/beng-ai-demo/poc/pump-demo/scripts/pump3d/model.js 保持一致：
// THREE 通过函数参数传入，本文件顶层不读取 window.THREE。
//
// ==== 代码风格约束 ====
// 纯 ES5 IIFE + 挂 window.Map3DShared。不用 ESM / const / let / 箭头函数 / 模板字符串 / class。
//
// ==== 错误处理约束 ====
// 不写 fallback / silent catch / 默认值吞错 / 降级。参数类型非法或缺失必须直接 throw，
// 不允许静默跳过或补一个凑合的默认值把错误盖住。下面出现的 "options.xxx || 默认值" 只用于
// 纯装饰性的调参项（颜色、数量、尺寸这类没有"对错"、只有"好看不好看"的旋钮），
// 凡是关系到坐标系换算是否成立的参数（stationWidth / stationDepth / anisotropy 等）
// 一律用 requirePositiveNumber 强制校验，非法立即抛错。
(function () {
  "use strict";

  // ---------------------------------------------------------------------
  // 通用小工具
  // ---------------------------------------------------------------------

  // 摘自 /Users/admin/Code/beng-ai-demo/poc/pump-demo/scripts/pump3d/model.js 的
  // createCanvas，原样保留（本来就是通用工具，无需泛化）。
  function createCanvas(width, height) {
    var canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  function requireTHREE(THREE, fnName) {
    if (!THREE) {
      throw new Error(
        "[Map3DShared] " + fnName + " 缺少 THREE 参数：请显式传入 three.js 模块，" +
        "本文件顶层不读取 window.THREE"
      );
    }
  }

  function requirePositiveNumber(value, name) {
    if (typeof value !== "number" || !isFinite(value) || value <= 0) {
      throw new Error("[Map3DShared] " + name + " 必须是正数，实际为 " + value);
    }
    return value;
  }

  // 可选的装饰性图层（道路/围墙/罐体基础）允许调用方不传；但一旦传了，类型必须合法——
  // 这不是"允许出错"，而是"允许没有这层数据"，两者不同：没传是合法状态，传了却传错类型要报错。
  function requireArrayIfPresent(value, name) {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) {
      throw new Error("[Map3DShared] " + name + " 若提供必须是数组，实际为 " + typeof value);
    }
    return value;
  }

  function assertUntainted(canvas) {
    if (!window.Map3DContract || typeof window.Map3DContract.assertTextureUntainted !== "function") {
      throw new Error(
        "[Map3DShared] window.Map3DContract.assertTextureUntainted 不存在，" +
        "请确认 scripts/map3d/contract.js 已在本文件之前加载"
      );
    }
    window.Map3DContract.assertTextureUntainted(canvas);
  }

  // ---------------------------------------------------------------------
  // 摘自 /Users/admin/Code/beng-ai-demo/poc/pump-demo/scripts/pump3d/model.js 的纹理
  // 工具（泛化：把泵专用的硬编码尺寸/颜色/密度提成参数，核心算法与绘制顺序原样
  // 保留，不做"顺手改进"）
  // ---------------------------------------------------------------------
  //
  // buildPerforatedTexture（联轴器护罩穿孔钢网）/ buildGrilleTexture（电机风罩通风
  // 格栅）/ buildGroundFadeTexture（泵地面圆盘径向渐变）三个函数已于 2026-08-13
  // 删除：本 POC（沙盘）与 poc/inspection-3d-aerial 里都是 0 引用的死代码，全量 grep
  // 排除本文件自身内部调用后确认过。三者原文仍在权威原件
  // /Users/admin/Code/beng-ai-demo/poc/pump-demo/scripts/pump3d/model.js 里，如果未来
  // 真的需要"穿孔钢网"/"通风格栅"/"地面径向渐变淡出"这类纹理，应从那份原件重新摘取，
  // 不要凭这条注释臆测参数细节。

  // 摘自 /Users/admin/Code/beng-ai-demo/poc/pump-demo/scripts/pump3d/model.js 的 buildNameplateTexture，原用途是电机铭牌（写死 "P-1" /
  // "250kW" / "2980 r/min" 三行文字）。
  // 泛化：文字内容改成 text 参数（{ title, lines }），背景/字色/字号/画布尺寸改成 options 参数。
  function buildNameplateTexture(THREE, text, options) {
    requireTHREE(THREE, "buildNameplateTexture");
    if (!text || typeof text.title !== "string") {
      throw new Error("[Map3DShared] buildNameplateTexture 需要 text.title（字符串）");
    }
    var lines = text.lines || [];
    if (!Array.isArray(lines)) {
      throw new Error("[Map3DShared] buildNameplateTexture 的 text.lines 若提供必须是数组");
    }
    var opts = options || {};
    var width = opts.width || 256;
    var height = opts.height || 144;
    var bg = opts.bg || "#c7d3d8";
    var ink = opts.ink || "#0d1620";
    var titleFont = opts.titleFont || "bold 30px sans-serif";
    var lineFont = opts.lineFont || "20px sans-serif";
    var titleY = opts.titleY != null ? opts.titleY : 50;
    var lineStartY = opts.lineStartY != null ? opts.lineStartY : 86;
    var lineGap = opts.lineGap != null ? opts.lineGap : 30;

    var canvas = createCanvas(width, height);
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = ink;
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, width - 8, height - 8);
    ctx.fillStyle = ink;
    ctx.textAlign = "center";
    ctx.font = titleFont;
    ctx.fillText(text.title, width / 2, titleY);
    ctx.font = lineFont;
    var i;
    for (i = 0; i < lines.length; i += 1) {
      ctx.fillText(lines[i], width / 2, lineStartY + i * lineGap);
    }

    assertUntainted(canvas);
    return new THREE.CanvasTexture(canvas);
  }

  // ---------------------------------------------------------------------
  // 世界坐标 -> 纹理像素坐标的换算器（卫星/沙盘地面共用）
  // ---------------------------------------------------------------------

  // 约定：世界坐标原点在站场中心，X ∈ [-stationWidth/2, stationWidth/2]，
  // Z ∈ [-stationDepth/2, stationDepth/2]；纹理像素坐标原点在左上角，X 向右、Y 向下。
  function createProjector(stationWidth, stationDepth, size) {
    requirePositiveNumber(stationWidth, "options.stationWidth");
    requirePositiveNumber(stationDepth, "options.stationDepth");
    requirePositiveNumber(size, "size");
    var scaleX = size / stationWidth;
    var scaleZ = size / stationDepth;
    var scaleAvg = (scaleX + scaleZ) / 2;
    return {
      point: function (x, z) {
        return {
          x: (x + stationWidth / 2) * scaleX,
          y: (z + stationDepth / 2) * scaleZ
        };
      },
      lengthX: function (w) { return w * scaleX; },
      lengthZ: function (d) { return d * scaleZ; },
      lengthAvg: function (r) { return r * scaleAvg; }
    };
  }

  // ---------------------------------------------------------------------
  // 人工构筑物图层：道路 / 围墙 / 硬化地坪 / 罐体基础环
  // 卫星与沙盘两种地面共用这一套绘制逻辑，只是调色板（palette）不同——
  // "直线 + 圆"才读作人造环境，这一层是俯视图里性价比最高的一层。
  // ---------------------------------------------------------------------

  function strokePath(ctx, points) {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    var i;
    for (i = 1; i < points.length; i += 1) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();
  }

  // areas: [{x,z,w,d}]，世界坐标下的矩形中心 + 宽/深，画成硬化地坪块。
  function paintAreaPads(ctx, projector, areas, palette) {
    areas.forEach(function (area, i) {
      if (
        typeof area.x !== "number" || typeof area.z !== "number" ||
        typeof area.w !== "number" || typeof area.d !== "number"
      ) {
        throw new Error("[Map3DShared] options.areas[" + i + "] 缺少 x/z/w/d 数值字段");
      }
      var center = projector.point(area.x, area.z);
      var halfW = projector.lengthX(area.w) / 2;
      var halfD = projector.lengthZ(area.d) / 2;
      ctx.fillStyle = palette.areaFill;
      ctx.fillRect(center.x - halfW, center.y - halfD, halfW * 2, halfD * 2);
      ctx.strokeStyle = palette.areaStroke;
      ctx.lineWidth = palette.areaStrokeWidth;
      ctx.strokeRect(center.x - halfW, center.y - halfD, halfW * 2, halfD * 2);
    });
  }

  // roads: [{points:[{x,z},...], width}]，宽 lineTo 描边（roadOuter）叠加一道更窄更浅的
  // 描边（roadInner），模拟"路基 + 路面"两层，比单一实色线更像人工铺筑的道路。
  function paintRoads(ctx, projector, roads, palette) {
    roads.forEach(function (road, i) {
      if (!Array.isArray(road.points) || road.points.length < 2) {
        throw new Error("[Map3DShared] options.roads[" + i + "] 需要至少 2 个 points");
      }
      requirePositiveNumber(road.width, "options.roads[" + i + "].width");
      var pixelPoints = road.points.map(function (p) { return projector.point(p.x, p.z); });
      var widthPx = projector.lengthAvg(road.width);

      ctx.lineJoin = "round";
      ctx.lineCap = "round";

      ctx.strokeStyle = palette.roadOuter;
      ctx.lineWidth = widthPx;
      strokePath(ctx, pixelPoints);

      ctx.strokeStyle = palette.roadInner;
      ctx.lineWidth = widthPx * 0.55;
      strokePath(ctx, pixelPoints);
    });
  }

  // perimeter: [{x,z}, ...] 闭合多边形点列，画站场周界围墙线。未提供或点数不足 3 时跳过——
  // 这是"没有围墙数据"的合法状态，不是吞错。
  function paintPerimeter(ctx, projector, perimeter, palette) {
    if (!perimeter || perimeter.length < 3) return;
    var pixelPoints = perimeter.map(function (p) { return projector.point(p.x, p.z); });
    ctx.strokeStyle = palette.perimeter;
    ctx.lineWidth = palette.perimeterWidth;
    ctx.beginPath();
    ctx.moveTo(pixelPoints[0].x, pixelPoints[0].y);
    var i;
    for (i = 1; i < pixelPoints.length; i += 1) {
      ctx.lineTo(pixelPoints[i].x, pixelPoints[i].y);
    }
    ctx.closePath();
    ctx.stroke();
  }

  // tankRings: [{x,z,r}]，储罐环形基础，画成描边圆。
  function paintTankRings(ctx, projector, tankRings, palette) {
    tankRings.forEach(function (ring, i) {
      if (typeof ring.x !== "number" || typeof ring.z !== "number" || typeof ring.r !== "number") {
        throw new Error("[Map3DShared] options.tankRings[" + i + "] 缺少 x/z/r 数值字段");
      }
      var center = projector.point(ring.x, ring.z);
      var radiusPx = projector.lengthAvg(ring.r);
      ctx.strokeStyle = palette.tankRing;
      ctx.lineWidth = palette.tankRingWidth;
      ctx.beginPath();
      ctx.arc(center.x, center.y, radiusPx, 0, Math.PI * 2);
      ctx.stroke();
    });
  }

  function paintConstructedLayer(ctx, projector, options, palette) {
    var areas = requireArrayIfPresent(options.areas, "options.areas");
    var roads = requireArrayIfPresent(options.roads, "options.roads");
    var tankRings = requireArrayIfPresent(options.tankRings, "options.tankRings");
    paintAreaPads(ctx, projector, areas, palette);
    paintRoads(ctx, projector, roads, palette);
    paintPerimeter(ctx, projector, options.perimeter, palette);
    paintTankRings(ctx, projector, tankRings, palette);
  }

  // 卫星地面：暖灰色土色调 + 半透明叠加，读作"航拍地面上的人工设施"。
  var SATELLITE_PALETTE = {
    areaFill: "rgba(150,145,120,0.35)",
    areaStroke: "rgba(70,66,50,0.6)",
    areaStrokeWidth: 2,
    roadOuter: "rgba(90,86,68,0.75)",
    roadInner: "rgba(158,152,128,0.8)",
    perimeter: "rgba(60,58,44,0.85)",
    perimeterWidth: 3,
    tankRing: "rgba(80,78,62,0.8)",
    tankRingWidth: 3
  };

  // 沙盘地面：延续旧 pump3d 的深蓝网格配色（#1c3a49/#14262f，见 buildSandboxGrid 注释），
  // 读作"工程沙盘上的高亮标识"。
  var SANDBOX_PALETTE = {
    areaFill: "rgba(42,66,79,0.55)",
    areaStroke: "rgba(48,110,138,0.7)",
    areaStrokeWidth: 2,
    roadOuter: "rgba(24,45,56,0.9)",
    roadInner: "rgba(58,102,122,0.8)",
    perimeter: "rgba(48,110,138,0.6)",
    perimeterWidth: 2,
    tankRing: "rgba(48,110,138,0.6)",
    tankRingWidth: 2
  };

  // ---------------------------------------------------------------------
  // 卫星地面纹理（buildSatelliteGround + 软斑块/颗粒三个私有辅助）已于 2026-08-13
  // 移出本文件：原「沙盘 / 卫星」双模式拆成了两个互不耦合的独立 POC，卫星那一版在
  // poc/inspection-3d-aerial，本文件只保留沙盘 POC 真正用到的东西。
  // 共用的 paintConstructedLayer（硬化地坪/道路/围墙/罐体基础环）仍在下方保留，
  // 两个 POC 各自持有一份副本，运行时零耦合。
  // ---------------------------------------------------------------------

  // ---------------------------------------------------------------------
  // 沙盘地面专用：规则坐标网格
  // ---------------------------------------------------------------------

  // 网格线配色沿用旧 /Users/admin/Code/beng-ai-demo/poc/pump-demo/scripts/pump3d/model.js
  // buildGround 里 THREE.GridHelper(64, 32,
  // 0x1c3a49, 0x14262f) 的两色，延续"工程沙盘"视觉语言——这里改成画进纹理而不是叠加
  // 一个 GridHelper 对象，因为沙盘地面还要同时承载硬化地坪/道路等构筑物图层，统一烘进
  // 一张纹理比"一个 GridHelper + 一个贴图地面"两个对象叠放更好控制层次关系。
  function paintSandboxGrid(ctx, projector, options) {
    var spacing = options.gridSpacing || 2;
    var majorEvery = options.gridMajorEvery || 5;
    var majorColor = options.gridMajorColor || "#1c3a49";
    var minorColor = options.gridMinorColor || "#14262f";
    var stationWidth = options.stationWidth;
    var stationDepth = options.stationDepth;
    var halfW = stationWidth / 2;
    var halfD = stationDepth / 2;
    var epsilon = 1e-6;

    var i = 0;
    var x;
    for (x = -halfW; x <= halfW + epsilon; x += spacing) {
      var p1 = projector.point(x, -halfD);
      var p2 = projector.point(x, halfD);
      var isMajor = i % majorEvery === 0;
      ctx.strokeStyle = isMajor ? majorColor : minorColor;
      ctx.lineWidth = isMajor ? 1.6 : 0.8;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
      i += 1;
    }

    var j = 0;
    var z;
    for (z = -halfD; z <= halfD + epsilon; z += spacing) {
      var q1 = projector.point(-halfW, z);
      var q2 = projector.point(halfW, z);
      var isMajorZ = j % majorEvery === 0;
      ctx.strokeStyle = isMajorZ ? majorColor : minorColor;
      ctx.lineWidth = isMajorZ ? 1.6 : 0.8;
      ctx.beginPath();
      ctx.moveTo(q1.x, q1.y);
      ctx.lineTo(q2.x, q2.y);
      ctx.stroke();
      j += 1;
    }
  }

  // 新增：沙盘（程序化工程沙盘）质感地面纹理：深色地坪 + 规则坐标网格线 + 硬化地坪块 + 道路。
  // 全程只用形状 API，不含任何逐像素噪声层——对应文件头性能表 1024² 形状绘制那一档
  // （约 0.7-1.7ms），是本文件里最便宜的一张纹理。
  // options 必填字段：size（纹理边长，默认 1024）、stationWidth / stationDepth（站场世界
  // 坐标跨度，用于把世界坐标换算到纹理 UV）、anisotropy（各向异性过滤级别，调用方应传
  // renderer.capabilities.getMaxAnisotropy()，本机实测上限 16——地面斜视时这一项比分辨率
  // 更重要）。可选：areas / roads / perimeter / tankRings（人工构筑物图层数据，不传则跳过
  // 对应图层）。额外的网格参数：
  //   gridSpacing     网格线间距，世界单位，默认 2
  //   gridMajorEvery  每隔几条画一条主网格线，默认 5
  //   gridMajorColor / gridMinorColor  主/次网格线颜色，默认沿用旧 GridHelper 配色
  function buildSandboxGround(THREE, options) {
    requireTHREE(THREE, "buildSandboxGround");
    if (!options) {
      throw new Error("[Map3DShared] buildSandboxGround 缺少 options 参数");
    }
    var size = options.size || 1024;
    requirePositiveNumber(options.anisotropy, "options.anisotropy");

    var canvas = createCanvas(size, size);
    var ctx = canvas.getContext("2d");

    ctx.fillStyle = options.baseColor || "#0d1620";
    ctx.fillRect(0, 0, size, size);

    var projector = createProjector(options.stationWidth, options.stationDepth, size);
    paintSandboxGrid(ctx, projector, options);
    paintConstructedLayer(ctx, projector, options, SANDBOX_PALETTE);

    assertUntainted(canvas);
    var texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = options.anisotropy;
    return texture;
  }

  // ---------------------------------------------------------------------
  // 共享材质工厂
  // ---------------------------------------------------------------------

  // 三色状态材质。颜色必须与以下两处字面一致，改色要三处同步：
  //   styles/01-tokens.css 的 --status-danger/--status-warn/--status-ok
  //   /Users/admin/Code/beng-ai-demo/poc/pump-demo/scripts/pump3d/engine.js 的 HOTSPOT.colors
  function createStatusMaterials(THREE) {
    requireTHREE(THREE, "createStatusMaterials");
    return {
      ok: new THREE.MeshStandardMaterial({
        color: "#30c69d", emissive: "#30c69d", emissiveIntensity: 0.15, roughness: 0.4, metalness: 0.25
      }),
      warn: new THREE.MeshStandardMaterial({
        color: "#eeb44a", emissive: "#eeb44a", emissiveIntensity: 0.15, roughness: 0.4, metalness: 0.25
      }),
      danger: new THREE.MeshStandardMaterial({
        color: "#ff625c", emissive: "#ff625c", emissiveIntensity: 0.15, roughness: 0.4, metalness: 0.25
      })
    };
  }

  // 管道/罐体/机柜/地坪等常用 PBR 材质集。数值取自
  // /Users/admin/Code/beng-ai-demo/poc/pump-demo/scripts/pump3d/model.js 里已在泵项目上
  // 验证过视觉效果的钢铁/涂层参数（casing/bareSteel/paintedSteel/stainless/concrete），
  // 只是按用途换了更通用的键名，参数本身原样复用、不重新调参。
  function createMetalMaterials(THREE) {
    requireTHREE(THREE, "createMetalMaterials");
    return {
      pipe: new THREE.MeshStandardMaterial({ color: "#b6c2c8", roughness: 0.38, metalness: 0.88 }),
      tank: new THREE.MeshStandardMaterial({ color: "#9aa7ae", roughness: 0.52, metalness: 0.72 }),
      cabinet: new THREE.MeshStandardMaterial({ color: "#5c6b74", roughness: 0.6, metalness: 0.45 }),
      stainless: new THREE.MeshStandardMaterial({ color: "#c4d0d6", roughness: 0.25, metalness: 0.95 }),
      pad: new THREE.MeshStandardMaterial({ color: "#55636e", roughness: 0.92, metalness: 0.04 })
    };
  }

  // ---------------------------------------------------------------------
  // 资源释放（disposeGroup 已删除，见下方决策记录）
  // ---------------------------------------------------------------------

  // disposeGroup 已于 2026-08-13 删除，决策记录如下：
  //
  // 它当初是为"沙盘/卫星双模式可切换"准备的防线——旧引擎设想的 setMode 会反复换模型，
  // 而区域热点是每个 4 几何 + 4 材质、完全不共享，12 区每模式 96 个 GPU 对象，不释放
  // 每切一次就漏 96 个。原始注释里覆盖纹理属性的逻辑是遍历材质对象每个键、凡是值带
  // isTexture===true 就 dispose()，不写死属性名清单，这样不管未来 three.js 新增哪个
  // 贴图槏位都能自动覆盖到——如果将来要重新引入这个函数，这条"不写死属性名清单"的
  // 设计仍然值得保留。
  //
  // 现在为什么可以删：双模式已经拆成了两个互不耦合的独立 POC（本 POC 只做沙盘，
  // poc/inspection-3d-aerial 只做卫星俯视），两边引擎都回到"终生单例、单模型、无
  // setMode"的形态，全量 grep 确认本文件之外 0 处引用。实测过 5 次 detach/mount 之后
  // debugInfo().memory.geometries 恒为 173 不增长、contextCreated 恒为 1，确实不存在
  // 需要它来防的泄漏。**如果将来有人要重新引入换模型能力，必须先把它加回来**——原文
  // 仍在权威原件 /Users/admin/Code/beng-ai-demo/poc/pump-demo/scripts/pump3d/engine.js
  // 里可以对照（那份文件全文件只有 2 处 dispose，都是环境贴图的临时产物，因为它是终生
  // 单例、模型从建好到页面关闭都不换——disposeGroup 这套"遍历释放"的完整实现，是本
  // 项目为了双模式切换才新增的，不是从那份原件抄来的）。

  window.Map3DShared = {
    createCanvas: createCanvas,
    buildNameplateTexture: buildNameplateTexture,
    buildSandboxGround: buildSandboxGround,
    createStatusMaterials: createStatusMaterials,
    createMetalMaterials: createMetalMaterials
  };
})();
