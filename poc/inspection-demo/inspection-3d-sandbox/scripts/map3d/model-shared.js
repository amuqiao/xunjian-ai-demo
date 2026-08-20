// 站场巡检地图——共享程序化贴图/材质工具（L3，早于 model-plan.js / engine.js）。
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
//
// **这条约束对本次改造尤其要命**：业务方给的是一张 JPG 平面图，最省事的做法就是把它
// 当贴图铺在地面上。这条路走不通（file:// 污染 → 静默全黑），而且即便能走通也不该走：
// 贴图没法按区域高亮、放大就糊、区域坐标与图上像素的对应关系只能靠肉眼对齐。所以本
// 项目的做法是**把平面图矢量化重绘**——用 scripts/data/plan.js 里量出来的坐标，纯 canvas
// 形状 API 重画一遍。代价是要量坐标，收益是每个色块都成了可编程对象。
//
// 每个纹理工厂在返回前都会调用 window.Map3DContract.assertTextureUntainted，对同一块
// canvas 做一次 getImageData(0,0,1,1)——如果画布已被污染，浏览器会在这一行原生抛出
// SecurityError，把 three.js 会悄悄吞掉的错误在构建期一次性翻译成一次带调用栈的快速失败。
// 不要在这个断言外面包 try/catch——这是 fail-fast，不是 fallback。
//
// ==== 已实测的性能数字（决定了下面的分层策略）====
//   尺寸       形状绘制(arc/fillRect/lineTo/渐变)   逐像素颗粒(getImageData/putImageData)
//   512²       1.1ms                                61.4ms
//   1024²      0.7ms                                65.3ms
//   2048²      1.7ms                                161ms
// 逐像素颗粒占总成本的 98%，形状绘制几乎免费。buildPlanGround 全程只用形状 + fillText，
// 没有任何逐像素操作，所以可以放心用 2048 宽的大画布换清晰度。
//
// ==== THREE 注入风格 ====
// THREE 通过函数参数传入，本文件顶层不读取 window.THREE。
//
// ==== 代码风格约束 ====
// 纯 ES5 IIFE + 挂 window.Map3DShared。不用 ESM / const / let / 箭头函数 / 模板字符串 / class。
//
// ==== 错误处理约束 ====
// 不写 fallback / silent catch / 默认值吞错 / 降级。参数类型非法或缺失必须直接 throw。
// 下面出现的 "options.xxx || 默认值" 只用于纯装饰性调参项（颜色、字号这类没有"对错"、
// 只有"好看不好看"的旋钮）；凡是关系到坐标系换算是否成立的参数（yard / anisotropy）
// 一律用 requirePositiveNumber 强制校验，非法立即抛错。
(function () {
  "use strict";

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

  function requireArray(value, name) {
    if (!Array.isArray(value)) {
      throw new Error("[Map3DShared] " + name + " 必须是数组，实际为 " + typeof value);
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
  // 铭牌纹理（罐号 FRT02xx 用）
  // ---------------------------------------------------------------------
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
    ctx.textBaseline = "alphabetic";
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
  // 平面图底图纹理
  // ---------------------------------------------------------------------

  // 世界坐标 → 纹理像素坐标。与旧版 createProjector 的区别：横纵各自独立的缩放
  // （旧版只收一个正方形 size）。平面图图幅 1258×713 的长宽比是 1.76，硬塞进正方形
  // 纹理会让横向分辨率白白浪费一半、纵向又不够——底图是本次改造里唯一一张大纹理，
  // 分辨率必须花在该花的方向上。
  function createPlanProjector(yardW, yardD, texW, texH) {
    requirePositiveNumber(yardW, "yard.w");
    requirePositiveNumber(yardD, "yard.d");
    var sx = texW / yardW;
    var sz = texH / yardD;
    return {
      // 世界 (x,z) → 纹理 (px,py)。世界原点在图幅中心，纹理原点在左上角。
      point: function (x, z) {
        return { x: (x + yardW / 2) * sx, y: (z + yardD / 2) * sz };
      },
      lenX: function (w) { return w * sx; },
      lenZ: function (d) { return d * sz; },
      // 各向同性的长度（线宽/箭头这类不该被拉伸的量），取两个方向的平均。
      len: function (v) { return v * (sx + sz) / 2; }
    };
  }

  function fillRectWorld(ctx, pj, rect, color) {
    var c = pj.point(rect.x, rect.z);
    var w = pj.lenX(rect.w);
    var d = pj.lenZ(rect.d);
    ctx.fillStyle = color;
    ctx.fillRect(c.x - w / 2, c.y - d / 2, w, d);
  }

  function strokeRectWorld(ctx, pj, rect, color, lineWidth) {
    var c = pj.point(rect.x, rect.z);
    var w = pj.lenX(rect.w);
    var d = pj.lenZ(rect.d);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.strokeRect(c.x - w / 2, c.y - d / 2, w, d);
  }

  // 消防通道：宽描边（路基）叠一道更窄更亮的描边（路面中线），比单色实线更像
  // 铺过的车道，也让"这里是能走人的路"在近俯视下一眼读得出来。
  function paintLanes(ctx, pj, lanes, palette) {
    ctx.lineCap = "butt";
    ctx.lineJoin = "round";
    lanes.forEach(function (lane, i) {
      requirePositiveNumber(lane.width, "lanes[" + i + "].width");
      var a = pj.point(lane.from.x, lane.from.z);
      var b = pj.point(lane.to.x, lane.to.z);
      var wpx = pj.len(lane.width);
      ctx.strokeStyle = palette.lane;
      ctx.lineWidth = wpx;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.strokeStyle = palette.laneEdge;
      ctx.lineWidth = Math.max(1, wpx * 0.16);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    });
  }

  // 平涂型景物（plan.js 里 flat:true 的那些，当前是 3000m³ 应急池与停车场）的色块。
  // 它们不建三维实体，只在底图上留一块颜色 —— 理由见 plan.js 的 SCENERY 注释
  // （三维盒子会把烘在底图里的名字盖住）。
  var SCENERY_FILL = { basin: "basin", pad: "pavedEdge" };

  function paintFlatScenery(ctx, pj, scenery, palette) {
    scenery.forEach(function (item) {
      if (item.flat !== true) return;
      var key = SCENERY_FILL[item.kind];
      if (!key) {
        throw new Error(
          "[Map3DShared] 景物 \"" + item.name + "\" 标了 flat:true 但 kind=" + item.kind +
          " 没有对应的底图填充色，请在 SCENERY_FILL 里补一条"
        );
      }
      fillRectWorld(ctx, pj, item, palette[key]);
      strokeRectWorld(ctx, pj, item, palette.pavedEdge, Math.max(1.5, pj.len(3)));
    });
  }

  // 非巡检景物的名字（3000m³ 应急池 / 停车场 / 长沙站大门）。
  // 这些名字**必须烘进底图**，不能像 12 个巡检区域那样交给 DOM 热点标签：热点标签
  // 是可点击的交互元素，而这些东西不可点击、没有状态、没有巡检项，给它们发一个
  // 假热点会让"标签=可下钻的巡检区域"这条读法失效。烘进底图既保住了平面图上原本
  // 就有的文字标注，又不掺进交互层。
  //
  // 只画 plan.js 里 label:true 的那几个：门卫房那三间在原图上的标注字号极小，
  // 2.5D 视角下叠出来是一团糊字。
  function paintSceneryLabels(ctx, pj, scenery, palette) {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    scenery.forEach(function (item) {
      if (item.label !== true) return;
      var c = pj.point(item.x, item.z);
      var size = Math.max(13, Math.round(pj.len(Math.min(item.w, item.d)) * 0.34));
      if (size > 30) size = 30;
      // 三维实体型景物（门）的名字往南挪出色块，免得压在斜条纹上读不清；
      // 平涂型（应急池/停车场）居中即可。
      var dy = item.flat === true ? 0 : pj.lenZ(item.d) * 0.5 + size * 0.9;
      ctx.font = "600 " + size + "px sans-serif";
      // 深色描边打底再填浅色：这些文字要压在灰/蓝/斜纹三种底色上，单靠填充色
      // 必有一种读不清。
      ctx.lineWidth = Math.max(2, size * 0.22);
      ctx.strokeStyle = "rgba(6,12,18,0.9)";
      ctx.strokeText(item.name, c.x, c.y + dy);
      ctx.fillStyle = palette.fence;
      ctx.fillText(item.name, c.x, c.y + dy);
    });
  }

  // 指北针：圆环 + 指北三角 + "N"。原图那个红色八角星罗盘的功能等价物，画在同一
  // 个位置（plan.js 的 NORTH_MARK）。用红色是照原图，不代表任何状态语义。
  function paintNorthMark(ctx, pj, mark, palette) {
    var c = pj.point(mark.x, mark.z);
    var r = pj.len(mark.r);
    ctx.strokeStyle = palette.arrow;
    ctx.lineWidth = Math.max(2, r * 0.12);
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    ctx.stroke();
    // 指北三角（屏幕/纹理坐标里"上"就是 -z，即北）
    ctx.fillStyle = palette.arrow;
    ctx.beginPath();
    ctx.moveTo(c.x, c.y - r * 0.78);
    ctx.lineTo(c.x - r * 0.3, c.y + r * 0.12);
    ctx.lineTo(c.x + r * 0.3, c.y + r * 0.12);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = palette.fence;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "700 " + Math.max(11, Math.round(r * 0.62)) + "px sans-serif";
    ctx.fillText("N", c.x, c.y + r * 0.52);
  }

  // 平面图底图：站外绿地 + 硬化地坪 + 消防通道 + 围栏白框 + 景物名 + 指北针。
  // 12 个巡检区域的色块**不在这里画**——它们是三维挤出体块（model-plan.js），
  // 底图只负责"体块底下那层地"。这条分工必须守住：如果底图也把区域色块画一遍，
  // 区域状态变色时就要重烘整张 2048 纹理，而挤出体块换个材质就够了。
  function buildPlanGround(THREE, options) {
    requireTHREE(THREE, "buildPlanGround");
    if (!options) throw new Error("[Map3DShared] buildPlanGround 缺少 options 参数");
    var yard = options.yard;
    if (!yard) throw new Error("[Map3DShared] buildPlanGround 缺少 options.yard");
    requirePositiveNumber(options.anisotropy, "options.anisotropy");
    var palette = options.palette;
    if (!palette) throw new Error("[Map3DShared] buildPlanGround 缺少 options.palette");

    var texW = options.texWidth || 2048;
    var texH = Math.round(texW * yard.d / yard.w);
    var canvas = createCanvas(texW, texH);
    var ctx = canvas.getContext("2d");
    var pj = createPlanProjector(yard.w, yard.d, texW, texH);

    // ① 站外绿地：铺满整幅
    ctx.fillStyle = palette.lawn;
    ctx.fillRect(0, 0, texW, texH);

    // ② 硬化地坪
    requireArray(options.paved, "options.paved").forEach(function (rect) {
      fillRectWorld(ctx, pj, rect, palette.paved);
    });
    // 地坪外缘描一道浅边，让"站内 / 站外"的分界在深色底上立得住
    options.paved.forEach(function (rect) {
      strokeRectWorld(ctx, pj, rect, palette.pavedEdge, Math.max(1.5, pj.len(3)));
    });

    // ③ 消防通道
    paintLanes(ctx, pj, requireArray(options.lanes, "options.lanes"), palette);

    // ④ 围栏白框（平面图上每个功能分区外圈的白线）
    requireArray(options.enclosures, "options.enclosures").forEach(function (rect) {
      strokeRectWorld(ctx, pj, rect, palette.fence, Math.max(2, pj.len(4)));
    });

    // ⑤ 平涂型景物色块
    var scenery = requireArray(options.scenery, "options.scenery");
    paintFlatScenery(ctx, pj, scenery, palette);

    // ⑥ 指北针
    if (!options.northMark) throw new Error("[Map3DShared] buildPlanGround 缺少 options.northMark");
    paintNorthMark(ctx, pj, options.northMark, palette);

    // ⑦ 景物名（最后画，压在上面所有图层之上）
    paintSceneryLabels(ctx, pj, scenery, palette);

    assertUntainted(canvas);
    var texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = options.anisotropy;
    return texture;
  }

  // 消防通道箭头纹理：透明底 + 一个实心红箭头，指向 +U（纹理向右）。
  // 只做一张，23 个实例靠 InstancedMesh 的每实例旋转矩阵转成 N/S/E/W 四个朝向
  // （见 model-plan.js 的 buildArrows），所以这张纹理只需要一个朝向。
  function buildArrowTexture(THREE, color) {
    requireTHREE(THREE, "buildArrowTexture");
    var w = 128;
    var h = 64;
    var canvas = createCanvas(w, h);
    var ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = color;
    // 杆
    ctx.fillRect(4, h * 0.34, w * 0.62, h * 0.32);
    // 头
    ctx.beginPath();
    ctx.moveTo(w * 0.62, h * 0.08);
    ctx.lineTo(w - 4, h * 0.5);
    ctx.lineTo(w * 0.62, h * 0.92);
    ctx.closePath();
    ctx.fill();

    assertUntainted(canvas);
    var texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  // 斜条纹纹理：大门 / 应急逃生门的路障标识（平面图上就是斜纹填充的小矩形）。
  function buildHatchTexture(THREE, color) {
    requireTHREE(THREE, "buildHatchTexture");
    var size = 64;
    var canvas = createCanvas(size, size);
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = "#20262c";
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = color;
    ctx.lineWidth = 7;
    var i;
    for (i = -size; i < size * 2; i += 18) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + size, size);
      ctx.stroke();
    }
    assertUntainted(canvas);
    var texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
  }

  // ---------------------------------------------------------------------
  // 共享材质工厂
  // ---------------------------------------------------------------------

  // 三色状态材质。颜色必须与以下两处字面一致，改色要三处同步：
  //   styles/01-tokens.css 的 --status-danger/--status-warn/--status-ok
  //   scripts/map3d/engine.js 的 HOTSPOT.colors
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

  // 管道/罐体/机柜/地坪等常用 PBR 材质集，参数沿用 pump-demo 已验证过的钢铁/涂层值。
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

  window.Map3DShared = {
    createCanvas: createCanvas,
    buildNameplateTexture: buildNameplateTexture,
    buildPlanGround: buildPlanGround,
    buildArrowTexture: buildArrowTexture,
    buildHatchTexture: buildHatchTexture,
    createStatusMaterials: createStatusMaterials,
    createMetalMaterials: createMetalMaterials
  };
})();
