// 站场 3D 巡检地图（俯视/卫星质感 POC）——共享程序化贴图/材质工具
// （L2，早于 model-aerial.js / model-track.js / engine.js）。
//
// 本 POC 与 poc/inspection-3d-sandbox（低斜角三维工程沙盘）是两个刻意互不耦合的独立
// POC，各自持有本文件的完整独立副本。sandbox 那份保留了 buildSandboxGround（深色网格
// 工程沙盘地面）；本 POC 只做俯视地图，不需要沙盘地面，已删除 buildSandboxGround/
// SANDBOX_PALETTE/paintSandboxGrid，只保留并强化了 buildSatelliteGround。
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

  function clamp(value, min, max) {
    return value < min ? min : value > max ? max : value;
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

  // buildPerforatedTexture（联轴器护罩穿孔钢网）/ buildGrilleTexture（电机风罩通风
  // 格栅）/ buildGroundFadeTexture（泵地面圆盘径向渐变）/ buildNameplateTexture
  // （电机铭牌）四个函数已于 2026-08-13 删除：本 POC 只做俯视地图，全量 grep 排除
  // 本文件自身内部调用后确认过是 0 引用的死代码。原文仍在权威原件
  // /Users/admin/Code/beng-ai-demo/poc/pump-demo/scripts/pump3d/model.js 里，如果未来
  // 真的需要这几类纹理，应从那份原件重新摘取，不要凭这条注释臆测参数细节。

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
  // rev2（本 POC 专属打磨）：alpha 与描边整体调深，让站场硬化地坪在斑驳地表上的
  // 边界更清晰可辨——上一轮实测发现原版 0.35 的 areaFill 在放大截图里几乎融进
  // 背景，读不出"这是一块人工地坪"。
  var SATELLITE_PALETTE = {
    areaFill: "rgba(168,160,132,0.52)",
    areaStroke: "rgba(48,44,32,0.75)",
    areaStrokeWidth: 2.5,
    roadOuter: "rgba(72,66,50,0.85)",
    roadInner: "rgba(172,164,136,0.88)",
    perimeter: "rgba(40,38,28,0.9)",
    perimeterWidth: 3,
    tankRing: "rgba(60,58,44,0.85)",
    tankRingWidth: 3
  };

  // ---------------------------------------------------------------------
  // 卫星地面专用：宏观软斑块（不规则 blob）+ 512² 逐像素颗粒 + 田块/林冠/水塘
  // ---------------------------------------------------------------------

  // rev2：四个色族，色相/明度跨度比 rev1 明显拉开（裸土偏红棕、旱地偏黄绿、
  // 林冠分深浅两档），alpha 上限也整体调高——rev1 自评"色调偏均匀单一、
  // 斑块之间过渡太柔和，更接近低对比度水彩底色"，这里直接把对比跨度当成
  // 第一优先级参数来调，而不是继续在同一色相里加密度。
  var SATELLITE_PATCH_FAMILIES = [
    { rgb: "112,78,46", alphaMin: 0.32, alphaMax: 0.5, radiusMin: 46, radiusMax: 150 },   // 裸土/红棕
    { rgb: "158,146,78", alphaMin: 0.24, alphaMax: 0.36, radiusMin: 38, radiusMax: 120 }, // 旱地/枯黄
    { rgb: "36,58,28", alphaMin: 0.38, alphaMax: 0.58, radiusMin: 55, radiusMax: 165 },   // 林冠/深绿
    { rgb: "76,102,48", alphaMin: 0.26, alphaMax: 0.42, radiusMin: 36, radiusMax: 110 }   // 林冠/浅绿高光
  ];

  // rev2：单个斑块不再是一个规整的 radialGradient 圆，而是 4~6 个偏心叠放的小圆
  // （lobe）外加一个居中核心圆，叠出不规则的多边形轮廓——这是"斑块读作真实地物
  // 边界还是读作一团匀速渐变的水彩"的关键区别，成本仍然是纯 arc+gradient，
  // 相对单圆版本只是多了几次 arc 调用，不引入逐像素操作。
  function paintBlob(ctx, cx, cy, baseRadius, rgb, alpha) {
    var lobeCount = 4 + Math.floor(Math.random() * 3);
    var i;
    for (i = 0; i < lobeCount; i += 1) {
      var angle = (i / lobeCount) * Math.PI * 2 + Math.random() * 0.6;
      var lobeRadius = baseRadius * (0.5 + Math.random() * 0.55);
      var offset = baseRadius * (0.25 + Math.random() * 0.4);
      var lx = cx + Math.cos(angle) * offset;
      var ly = cy + Math.sin(angle) * offset;
      var lobeGradient = ctx.createRadialGradient(lx, ly, 0, lx, ly, lobeRadius);
      lobeGradient.addColorStop(0, "rgba(" + rgb + "," + alpha + ")");
      lobeGradient.addColorStop(1, "rgba(" + rgb + ",0)");
      ctx.fillStyle = lobeGradient;
      ctx.beginPath();
      ctx.arc(lx, ly, lobeRadius, 0, Math.PI * 2);
      ctx.fill();
    }
    var coreRadius = baseRadius * 0.7;
    var coreGradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreRadius);
    coreGradient.addColorStop(0, "rgba(" + rgb + "," + Math.min(1, alpha * 1.2) + ")");
    coreGradient.addColorStop(1, "rgba(" + rgb + ",0)");
    ctx.fillStyle = coreGradient;
    ctx.beginPath();
    ctx.arc(cx, cy, coreRadius, 0, Math.PI * 2);
    ctx.fill();
  }

  function paintSoftPatches(ctx, size, families, count) {
    var i;
    for (i = 0; i < count; i += 1) {
      var family = families[i % families.length];
      var radius = family.radiusMin + Math.random() * (family.radiusMax - family.radiusMin);
      var alpha = family.alphaMin + Math.random() * (family.alphaMax - family.alphaMin);
      var x = Math.random() * size;
      var y = Math.random() * size;
      paintBlob(ctx, x, y, radius, family.rgb, alpha);
    }
  }

  // rev2 新增：田块——俯视图里最显眼的人造地物特征之一，规则矩形 + 等宽条纹交替，
  // 模拟犁沟/垄。fields: [{x,z,w,d,rotation,stripeWidth,colorA,colorB}]，均为世界坐标/
  // 世界单位（stripeWidth 除外，stripeWidth 是像素）。rotation 是弧度，允许田块与
  // 站场轴线略微错开角度（真实农田很少与任何人工设施完全对齐）。
  function paintFarmlandFields(ctx, projector, fields) {
    fields.forEach(function (field, i) {
      if (
        typeof field.x !== "number" || typeof field.z !== "number" ||
        typeof field.w !== "number" || typeof field.d !== "number"
      ) {
        throw new Error("[Map3DShared] options.farmlandFields[" + i + "] 缺少 x/z/w/d 数值字段");
      }
      var center = projector.point(field.x, field.z);
      var halfW = projector.lengthX(field.w) / 2;
      var halfD = projector.lengthZ(field.d) / 2;
      var rotation = field.rotation || 0;
      var stripeWidth = field.stripeWidth || 14;
      var colorA = field.colorA || "rgba(150,138,72,0.4)";
      var colorB = field.colorB || "rgba(118,104,52,0.4)";

      ctx.save();
      ctx.translate(center.x, center.y);
      ctx.rotate(rotation);
      ctx.beginPath();
      ctx.rect(-halfW, -halfD, halfW * 2, halfD * 2);
      ctx.clip();

      var x = -halfW;
      var stripeIndex = 0;
      while (x < halfW) {
        ctx.fillStyle = stripeIndex % 2 === 0 ? colorA : colorB;
        ctx.fillRect(x, -halfD, stripeWidth, halfD * 2);
        x += stripeWidth;
        stripeIndex += 1;
      }
      ctx.restore();
    });
  }

  // rev2 新增：林冠——密集小色块簇，是俯视图里"高频细节"的主要来源（对比大号软
  // 斑块的低频过渡）。clusters: [{x,z,r,count,rgb}]，在半径 r（世界单位）范围内
  // 随机撒 count 个小圆，制造树冠的颗粒感。
  function paintTreeClusters(ctx, projector, clusters) {
    clusters.forEach(function (cluster, i) {
      if (typeof cluster.x !== "number" || typeof cluster.z !== "number" || typeof cluster.r !== "number") {
        throw new Error("[Map3DShared] options.treeClusters[" + i + "] 缺少 x/z/r 数值字段");
      }
      var center = projector.point(cluster.x, cluster.z);
      var radiusPx = projector.lengthAvg(cluster.r);
      var count = cluster.count || Math.round(radiusPx * 1.4);
      var rgb = cluster.rgb || "34,54,26";
      var j;
      for (j = 0; j < count; j += 1) {
        var angle = Math.random() * Math.PI * 2;
        var dist = Math.random() * radiusPx;
        var cx = center.x + Math.cos(angle) * dist;
        var cy = center.y + Math.sin(angle) * dist;
        var dotRadius = 3 + Math.random() * 6;
        var shade = Math.random() > 0.5 ? rgb : "58,86,40";
        var alpha = 0.35 + Math.random() * 0.35;
        ctx.fillStyle = "rgba(" + shade + "," + alpha + ")";
        ctx.beginPath();
        ctx.arc(cx, cy, dotRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }

  // rev2 新增：水塘——暗色不规则闭合多边形 + 边缘高光描边，模拟水面反光。
  // ponds: [{x,z,r}]，多边形顶点数固定 12，每个顶点半径在 [0.72r, 1.08r] 内抖动。
  function paintWaterPonds(ctx, projector, ponds) {
    ponds.forEach(function (pond, i) {
      if (typeof pond.x !== "number" || typeof pond.z !== "number" || typeof pond.r !== "number") {
        throw new Error("[Map3DShared] options.waterPonds[" + i + "] 缺少 x/z/r 数值字段");
      }
      var center = projector.point(pond.x, pond.z);
      var radiusPx = projector.lengthAvg(pond.r);
      var vertexCount = 12;
      var points = [];
      var v;
      for (v = 0; v < vertexCount; v += 1) {
        var angle = (v / vertexCount) * Math.PI * 2;
        var r = radiusPx * (0.72 + Math.random() * 0.36);
        points.push({ x: center.x + Math.cos(angle) * r, y: center.y + Math.sin(angle) * r });
      }
      ctx.fillStyle = "rgba(28,42,50,0.88)";
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      var p;
      for (p = 1; p < points.length; p += 1) ctx.lineTo(points[p].x, points[p].y);
      ctx.closePath();
      ctx.fill();

      // 边缘高光：沿多边形描一圈更亮的青灰色细线，模拟水面反光的边界。
      ctx.strokeStyle = "rgba(150,182,196,0.5)";
      ctx.lineWidth = 2;
      ctx.stroke();

      // 一小片偏移的椭圆亮斑，模拟天光在水面上的镜面反射。
      ctx.fillStyle = "rgba(184,210,220,0.28)";
      ctx.beginPath();
      ctx.ellipse(
        center.x - radiusPx * 0.2, center.y - radiusPx * 0.25,
        radiusPx * 0.32, radiusPx * 0.16, -0.4, 0, Math.PI * 2
      );
      ctx.fill();
    });
  }

  // rev2 新增：暗角——整张纹理最后叠一层"中心亮、四周暗"的径向渐变，模拟航拍
  // 镜头/大气透视的自然亮度衰减，同时也让站场核心区域在视觉上更突出。
  function paintVignette(ctx, size, strength) {
    var gradient = ctx.createRadialGradient(size / 2, size / 2, size * 0.32, size / 2, size / 2, size * 0.72);
    gradient.addColorStop(0, "rgba(0,0,0,0)");
    gradient.addColorStop(1, "rgba(0,0,0," + strength + ")");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }

  // 逐像素颗粒：这是全文件唯一一处 getImageData/putImageData 级别的操作，成本对应文件头
  // 性能表里 512² 的 61.4ms。只在这一处产生一次，随后靠 drawImage 平铺复用（见 stampNoiseTile），
  // 不在 1024² 甚至更大的宏观画布上直接跑逐像素操作。
  function buildNoiseTile(size, base, variance) {
    var canvas = createCanvas(size, size);
    var ctx = canvas.getContext("2d");
    var imageData = ctx.createImageData(size, size);
    var data = imageData.data;
    var i;
    for (i = 0; i < data.length; i += 4) {
      var n = (Math.random() - 0.5) * 2 * variance;
      data[i] = clamp(base[0] + n, 0, 255);
      data[i + 1] = clamp(base[1] + n, 0, 255);
      data[i + 2] = clamp(base[2] + n, 0, 255);
      data[i + 3] = 255;
    }
    ctx.putImageData(imageData, 0, 0);
    return canvas;
  }

  // 把 512² 噪声瓦片按 tileCount×tileCount 网格 drawImage 进宏观画布（实测 16×16=256 次
  // drawImage 只要 1-2ms），用低 alpha 叠加，只贡献细颗粒质感、不破坏第 1 层的斑块结构。
  function stampNoiseTile(ctx, tileCanvas, size, tileCount, alpha) {
    var cell = size / tileCount;
    var priorAlpha = ctx.globalAlpha;
    ctx.globalAlpha = alpha;
    var x;
    var y;
    for (y = 0; y < tileCount; y += 1) {
      for (x = 0; x < tileCount; x += 1) {
        ctx.drawImage(tileCanvas, x * cell, y * cell, cell, cell);
      }
    }
    ctx.globalAlpha = priorAlpha;
  }

  // rev2：卫星/航拍质感地面纹理，分层生成（比 rev1 多三层，专门针对"读起来像同一张
  // 总图铺在橄榄绿泥地上"这条实测差评而加）：
  //   1) 1024² 宏观层：土色底 + 几百个不规则软斑块（paintBlob，形状 API，几乎免费）
  //   2) 512² 逐像素颗粒噪声，16×16 平铺烘进宏观层（成本大头，见文件头性能表）
  //   3) 田块条纹（farmlandFields，可选）——规则矩形 + 交替条纹，俯视图里最显眼的
  //      人造地物特征之一
  //   4) 林冠簇（treeClusters，可选）——密集小圆点簇，补高频细节，与 1) 的低频大
  //      斑块形成对比
  //   5) 水塘（waterPonds，可选）——暗色不规则闭合区 + 边缘高光
  //   6) 人工构筑物层：道路/围墙/硬化地坪/罐体基础环（形状 API，几乎免费，"航拍感"里
  //      真正读作人造环境的部分）
  //   7) 暗角（vignette，可选）——径向渐变压暗四周，模拟镜头/大气衰减
  // options:
  //   size          纹理边长，默认 1024（装饰性调参，非法不会破坏坐标系换算，允许有默认值）
  //   stationWidth  站场世界坐标 X 跨度（必填，正数，应与实际地面 PlaneGeometry 宽度一致）
  //   stationDepth  站场世界坐标 Z 跨度（必填，正数，应与实际地面 PlaneGeometry 深度一致）
  //   anisotropy    各向异性过滤级别（必填，正数；调用方应传 renderer.capabilities
  //                 .getMaxAnisotropy()，本机实测上限 16；地面斜视时这一项比分辨率更重要）
  //   baseColor     宏观底色，默认 "#6b6a5c"
  //   patchFamilies / patchCount  软斑块色族与数量，默认见 SATELLITE_PATCH_FAMILIES / 260
  //   grainSize / grainBase / grainVariance / grainAlpha  颗粒层参数
  //   farmlandFields / treeClusters / waterPonds  三层新增装饰图层数据（均可选）
  //   vignetteStrength  暗角强度 0~1，默认 0.22；传 0 等效关闭
  //   areas / roads / perimeter / tankRings  人工构筑物图层数据（均可选，不传则跳过对应图层）
  function buildSatelliteGround(THREE, options) {
    requireTHREE(THREE, "buildSatelliteGround");
    if (!options) {
      throw new Error("[Map3DShared] buildSatelliteGround 缺少 options 参数");
    }
    var size = options.size || 1024;
    requirePositiveNumber(options.anisotropy, "options.anisotropy");

    var canvas = createCanvas(size, size);
    var ctx = canvas.getContext("2d");
    var projector = createProjector(options.stationWidth, options.stationDepth, size);

    // 第 1 层：宏观底色 + 不规则软斑块
    ctx.fillStyle = options.baseColor || "#6b6a5c";
    ctx.fillRect(0, 0, size, size);
    var families = options.patchFamilies || SATELLITE_PATCH_FAMILIES;
    var patchCount = options.patchCount != null ? options.patchCount : 260;
    paintSoftPatches(ctx, size, families, patchCount);

    // 第 2 层：512² 逐像素颗粒，平铺烘进宏观层
    var grainSize = options.grainSize || 512;
    var grainBase = options.grainBase || [107, 104, 90];
    var grainVariance = options.grainVariance != null ? options.grainVariance : 22;
    var grainAlpha = options.grainAlpha != null ? options.grainAlpha : 0.12;
    var grainTile = buildNoiseTile(grainSize, grainBase, grainVariance);
    stampNoiseTile(ctx, grainTile, size, 16, grainAlpha);

    // 第 3~5 层：田块 / 林冠 / 水塘（均可选，不传则跳过）
    paintFarmlandFields(ctx, projector, requireArrayIfPresent(options.farmlandFields, "options.farmlandFields"));
    paintTreeClusters(ctx, projector, requireArrayIfPresent(options.treeClusters, "options.treeClusters"));
    paintWaterPonds(ctx, projector, requireArrayIfPresent(options.waterPonds, "options.waterPonds"));

    // 第 6 层：人工构筑物（硬化地坪/道路/围墙/罐体基础环）
    paintConstructedLayer(ctx, projector, options, SATELLITE_PALETTE);

    // 第 7 层：暗角
    var vignetteStrength = options.vignetteStrength != null ? options.vignetteStrength : 0.22;
    if (vignetteStrength > 0) paintVignette(ctx, size, vignetteStrength);

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

  // createMetalMaterials（管道/罐体/机柜/地坪等 PBR 材质集）已于 2026-08-13 删除：
  // 本 POC 只做俯视地图的 2.5D 挤出区块，不需要泵/管道类真实设备材质，全量 grep
  // 排除本文件自身内部调用后确认是 0 引用的死代码。原文仍在权威原件
  // /Users/admin/Code/beng-ai-demo/poc/pump-demo/scripts/pump3d/model.js 里。

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
  // 现在为什么可以删：双模式已经拆成了两个互不耦合的独立 POC（本 POC 只做卫星俯视，
  // poc/inspection-3d-sandbox 只做沙盘），两边引擎都回到"终生单例、单模型、无
  // setMode"的形态，全量 grep 确认本文件之外 0 处引用。实测过 5 次 detach/mount 之后
  // debugInfo().memory.geometries 恒为 173 不增长、contextCreated 恒为 1，确实不存在
  // 需要它来防的泄漏。**如果将来有人要重新引入换模型能力，必须先把它加回来**——原文
  // 仍在权威原件 /Users/admin/Code/beng-ai-demo/poc/pump-demo/scripts/pump3d/engine.js
  // 里可以对照（那份文件全文件只有 2 处 dispose，都是环境贴图的临时产物，因为它是终生
  // 单例、模型从建好到页面关闭都不换——disposeGroup 这套"遍历释放"的完整实现，是本
  // 项目为了双模式切换才新增的，不是从那份原件抄来的）。

  window.Map3DShared = {
    createCanvas: createCanvas,
    buildSatelliteGround: buildSatelliteGround,
    createStatusMaterials: createStatusMaterials
  };
})();
