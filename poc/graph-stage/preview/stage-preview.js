/**
 * stage-preview.js —— 阶段性预览：只为「看形」而存在。G4 会用正式的
 * stage3d/model.js + engine.js + stage/stage.js 取代它，届时整个 preview/ 目录删除。
 *
 * ---- 这一版要证明的两件事 ----
 *
 * 1. **3D 立不立得住**。前四版桌面是一个扁的深色椭圆：没有厚度、没有光影、没有材质
 *    对比，卡片浮在空中和桌面毫无视觉连接——那种状态下没人能判断构图好坏，我却拿
 *    "先结构后质感"当理由推进了四轮。这一版补上：三级明度差的桌体、每张卡片的 3D
 *    基座与接触光斑、手工接触阴影、顶点色渐变地坪。
 *
 * 2. **N 自适应**。展台是模板，桌上放几张牌由数据决定。同一份代码 N=6 / 10 / 14 都要
 *    排得开、不用回头改任何数字——**这才是模板性**，把桌面摆满 21 个元素不是。
 *    URL 加 ?n=6 当场验证。
 *
 * ---- 两条自我约束 ----
 *
 * · 零纹理。不开 WebGL shadowMap（它会创建深度纹理，`renderer.info.memory.textures`
 *   立刻非 0，撞上 StageContract 的断言），接触阴影改用顶点色暗盘手工做——固定视角下
 *   光源方向不变，假阴影和真阴影看不出区别。渐变同理走顶点色，不用 CanvasTexture。
 * · 尺寸不靠猜。前四版我手填桌面半径，连续四次撑出取景框，第四版反解公式还算错了。
 *   这一版改成**实测反解**：按名义半径建桌 → 桌沿采样点投影到屏幕 → 量外接框 →
 *   按目标留白反推缩放，迭代收敛。
 */
(function () {
  "use strict";

  var PROJ = window.StageProjectionMath;
  var C = window.StageContract;
  var THREE = window.THREE;
  if (!PROJ || !C || !THREE) throw new Error("[preview] 依赖未加载，检查 index.html 的 script 顺序");

  // ---------------------------------------------------------------- 示例数据
  //
  // 模板的基础示例数据。换课题只换这个数组，长度随意。

  var ALL_TRUNKS = [
    "管道失效与灾害控制", "关键设备自主可控", "新型管材与高效建设",
    "管网可靠性与仿真优化", "流动保障与融合输送", "地下空间高效利用",
    "氢能·二氧化碳输送", "低碳发展与环境保护", "智能管网与能源互联",
    "发展战略与决策支持", "管网数字孪生", "应急抢修与恢复",
    "碳捕集与封存", "海洋管道工程"
  ];
  var STATS = { nodes: 414, edges: 1619, docs: 70 };

  function trunkCount() {
    var m = /[?&]n=(\d+)/.exec(window.location.search);
    var n = m ? parseInt(m[1], 10) : 10;
    return Math.max(3, Math.min(ALL_TRUNKS.length, n));
  }
  var TRUNKS = ALL_TRUNKS.slice(0, trunkCount());

  // ---------------------------------------------------------------- 形状声明
  //
  // 只声明比例关系，绝对尺寸由 fitToViewport() 实测反解。

  var SHAPE = {
    fov: 30,
    tiltDeg: 40,        // 俯角
    margin: 0.13,       // 桌面外接框到视口边的留白（占视口宽/高）
    ringRatio: 0.70,    // 立牌环半径 / 桌面半径
    tableH: 0.075,      // 桌体厚度 / 桌面半径
    postH: 0.14,        // 立牌基座柱高 / 桌面半径
    centerLift: 0.36,   // 中心装置悬浮高度 / 桌面半径
    cardMinW: 92, cardMaxW: 150
  };

  var scene, camera, renderer, host, layer;
  var anchors = [];
  var radius = 3;

  function cssColor(name) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    if (!v) throw new Error("[preview] 读不到 CSS 变量 " + name);
    return new THREE.Color(v);
  }

  // 零纹理造渐变：按顶点到中心的距离插值颜色。地坪纵深与接触阴影的柔边都靠它。
  function radialDisc(rOuter, segments, cInner, cOuter, opacity) {
    var geo = new THREE.CircleGeometry(rOuter, segments);
    var pos = geo.attributes.position;
    var colors = new Float32Array(pos.count * 3);
    var c = new THREE.Color();
    for (var i = 0; i < pos.count; i += 1) {
      var d = Math.sqrt(pos.getX(i) * pos.getX(i) + pos.getY(i) * pos.getY(i)) / rOuter;
      c.copy(cInner).lerp(cOuter, Math.min(1, d));
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: opacity < 1, opacity: opacity, depthWrite: false
    }));
  }

  // ---------------------------------------------------------------- 桌体

  function buildTable() {
    var g = new THREE.Group();
    var bg = cssColor("--c-bg-900");
    var deep = cssColor("--c-bg-800");
    var surf = cssColor("--c-bg-700");
    var accent = cssColor("--c-accent");
    var tableH = radius * SHAPE.tableH;

    // 地坪：中心略亮向外压暗
    var ground = radialDisc(radius * 4.2, 96, deep, bg, 1);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.002;
    g.add(ground);

    // 桌子落在地坪上的接触阴影（顺光源方向偏移）
    var shadow = radialDisc(radius * 1.30, 96, new THREE.Color(0x000000), bg, 0.6);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(radius * 0.06, 0.001, radius * 0.05);
    g.add(shadow);

    // 桌面 / 侧壁：三级明度差把「面」「壁」「地」分开，这是它读起来是不是一张桌子的关键
    var top = new THREE.Mesh(
      new THREE.CircleGeometry(radius, 128),
      new THREE.MeshStandardMaterial({ color: surf, roughness: 0.8, metalness: 0.08 })
    );
    top.rotation.x = -Math.PI / 2;
    top.position.y = tableH;
    g.add(top);

    var wall = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius * 0.96, tableH, 128, 1, true),
      new THREE.MeshStandardMaterial({ color: deep, roughness: 0.95, side: THREE.DoubleSide })
    );
    wall.position.y = tableH / 2;
    g.add(wall);

    // 桌沿描边 + 内圈刻度环：整个画面仅有的两处强调色几何
    [[0.994, 1.0, 0.5], [0.30, 0.303, 0.16]].forEach(function (s) {
      var ring = new THREE.Mesh(
        new THREE.RingGeometry(radius * s[0], radius * s[1], 128),
        new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: s[2] })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = tableH + 0.003;
      g.add(ring);
    });

    return g;
  }

  // 每张卡片的 3D 基座：短柱 + 桌面接触光斑。
  // 没有它，DOM 卡片就是浮在空中的方块，和桌子毫无关系——这是前几版最散的根因。
  function buildPedestals() {
    var g = new THREE.Group();
    var tableH = radius * SHAPE.tableH;
    var postH = radius * SHAPE.postH;
    var accent = cssColor("--c-accent");
    var deep = cssColor("--c-bg-800");
    var surf = cssColor("--c-bg-700");

    anchors.filter(function (a) { return a.role === "trunk"; }).forEach(function (a) {
      var spot = radialDisc(radius * 0.08, 32, accent, surf, 0.34);
      spot.rotation.x = -Math.PI / 2;
      spot.position.set(a.base[0], tableH + 0.005, a.base[2]);
      g.add(spot);

      var post = new THREE.Mesh(
        new THREE.CylinderGeometry(radius * 0.011, radius * 0.017, postH, 12),
        new THREE.MeshStandardMaterial({ color: deep, roughness: 0.65, metalness: 0.25 })
      );
      post.position.set(a.base[0], tableH + postH / 2, a.base[2]);
      g.add(post);
    });

    // 中心装置：真实的三层几何体，DOM 统计卡浮在它上方
    [[0.30, 0.028, 0.30], [0.21, 0.042, 0.5], [0.12, 0.058, 0.85]].forEach(function (s, i) {
      var ring = new THREE.Mesh(
        new THREE.CylinderGeometry(radius * s[0], radius * s[0] * 1.05, radius * s[1], 64),
        new THREE.MeshStandardMaterial({
          color: i === 2 ? accent : surf, roughness: 0.55, metalness: 0.3,
          transparent: true, opacity: s[2]
        })
      );
      ring.position.y = tableH + radius * (0.02 + i * 0.05);
      g.add(ring);
    });

    return g;
  }

  // ---------------------------------------------------------------- 锚点

  function buildAnchors() {
    anchors = [];
    var n = TRUNKS.length;
    var rr = radius * SHAPE.ringRatio;
    var tableH = radius * SHAPE.tableH;
    var postH = radius * SHAPE.postH;
    for (var i = 0; i < n; i += 1) {
      var t = (i / n) * Math.PI * 2 + Math.PI;
      var x = Math.sin(t) * rr, z = Math.cos(t) * rr;
      anchors.push({
        id: "T" + (i + 1), role: "trunk", label: TRUNKS[i],
        base: [x, tableH, z],
        vec3: new THREE.Vector3(x, tableH + postH, z)
      });
    }
    anchors.push({
      id: "center", role: "center",
      vec3: new THREE.Vector3(0, radius * SHAPE.centerLift, 0)
    });
  }

  // ---------------------------------------------------------------- DOM 卡片

  function h(tag, cls, text) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  }

  var HINT = {
    trunk: ["重点任务", "点击进入该任务的技术图谱，可继续下钻到攻关方向 / 技术 / 内容四级层次。"],
    center: ["图谱总览", "点击进入全景图谱。"]
  };
  function showHint(a) {
    var box = document.getElementById("stageHint");
    if (!box) return;
    box.querySelector(".sh-type").textContent = HINT[a.role][0];
    box.querySelector(".sh-text").textContent =
      (a.role === "center" ? "国家管网技术图谱" : a.label) + "　—　" + HINT[a.role][1];
  }

  function buildCards() {
    layer.innerHTML = "";
    anchors.forEach(function (a) {
      var el;
      if (a.role === "trunk") {
        el = h("button", "sc sc-trunk");
        el.appendChild(h("span", "sc-name", a.label));
      } else {
        el = h("button", "sc sc-center");
        el.appendChild(h("p", "sc-kicker", "技术图谱总览"));
        var g = h("div", "sc-stats");
        [[STATS.nodes, "节点"], [STATS.edges, "关系"], [STATS.docs, "文档"]].forEach(function (p) {
          var box = h("div", "sc-stat");
          box.appendChild(h("strong", null, String(p[0])));
          box.appendChild(h("span", null, p[1]));
          g.appendChild(box);
        });
        el.appendChild(g);
      }
      el.addEventListener("mouseenter", function () { showHint(a); });
      el.setAttribute(C.SLOT_ATTR, a.id);
      el.setAttribute(C.ROLE_ATTR, a.role);
      layer.appendChild(el);
      a.el = el;
    });
  }

  // 立牌宽度按 N 自适应：相邻锚点在屏幕上的最小水平间距决定卡片能多宽。
  // 这就是「留好位置」的机械实现——加一张牌，所有牌自动变窄，不用改任何数字。
  function fitCardWidth() {
    var v = new THREE.Vector3();
    var w = host.clientWidth, hgt = host.clientHeight;
    var pts = anchors.filter(function (a) { return a.role === "trunk"; }).map(function (a) {
      v.copy(a.vec3).project(camera);
      return PROJ.ndcToScreen({ x: v.x, y: v.y }, w, hgt);
    });
    var minGap = Infinity;
    for (var i = 0; i < pts.length; i += 1) {
      for (var j = i + 1; j < pts.length; j += 1) {
        // 只有垂直方向足够接近时，水平间距才构成约束
        if (Math.abs(pts[i].y - pts[j].y) < 52) {
          minGap = Math.min(minGap, Math.abs(pts[i].x - pts[j].x));
        }
      }
    }
    var cw = isFinite(minGap) ? minGap - 14 : SHAPE.cardMaxW;
    cw = Math.max(SHAPE.cardMinW, Math.min(SHAPE.cardMaxW, cw));
    document.documentElement.style.setProperty("--sc-trunk-w", cw.toFixed(0) + "px");
    return cw;
  }

  // ---------------------------------------------------------------- 投影

  var pv = null;
  function syncProjection() {
    if (!pv) pv = new THREE.Vector3();
    var w = host.clientWidth, hgt = host.clientHeight;
    var camDist = camera.position.length();
    var scaleCfg = { k: camDist, min: 0.74, max: 1.0 };
    var dimCfg = { near: camDist - radius, far: camDist + radius * 1.7 };
    var list = anchors.map(function (a) {
      return { a: a, dist: camera.position.distanceTo(a.vec3) };
    });
    PROJ.sortByDepth(list).forEach(function (item, idx) {
      var a = item.a;
      pv.copy(a.vec3).project(camera);
      var p = PROJ.ndcToScreen({ x: pv.x, y: pv.y }, w, hgt);
      var sc = PROJ.depthToScale(item.dist, scaleCfg);
      var dim = PROJ.depthToDim(item.dist, dimCfg);
      // 锚点在柱顶，卡片底边贴着它 → translate(-50%,-100%)，卡片才"站"在柱子上
      a.el.style.transform = "translate3d(" + p.x.toFixed(1) + "px," + p.y.toFixed(1) + "px,0)"
        + " translate(-50%," + (a.role === "center" ? "-50%" : "-100%") + ") scale(" + sc.toFixed(3) + ")";
      a.el.style.setProperty("--card-dim", dim.toFixed(3));
      a.el.style.zIndex = String(10 + idx);
    });
  }

  // ---------------------------------------------------------------- 实测反解

  function measureTableBox() {
    var v = new THREE.Vector3();
    var w = host.clientWidth, hgt = host.clientHeight;
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (var i = 0; i < 72; i += 1) {
      var t = (i / 72) * Math.PI * 2;
      v.set(Math.cos(t) * radius, radius * SHAPE.tableH, Math.sin(t) * radius).project(camera);
      var p = PROJ.ndcToScreen({ x: v.x, y: v.y }, w, hgt);
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
    return { w: maxX - minX, h: maxY - minY, minX: minX, maxX: maxX, minY: minY, maxY: maxY };
  }

  // 桌沿采样点投影 → 量外接框 → 按目标留白反推缩放。迭代到收敛，不猜数字。
  function fitToViewport() {
    var vw = host.clientWidth, vh = host.clientHeight;
    var targetW = vw * (1 - SHAPE.margin * 2);
    var targetH = vh * (1 - SHAPE.margin * 2);
    for (var pass = 0; pass < 6; pass += 1) {
      var box = measureTableBox();
      var k = Math.min(targetW / box.w, targetH / box.h);
      if (Math.abs(k - 1) < 0.005) break;
      radius *= k;
    }
    return measureTableBox();
  }

  // ---------------------------------------------------------------- 时钟

  function tickClock() {
    var d = new Date();
    function p(n) { return n < 10 ? "0" + n : String(n); }
    var t = document.getElementById("clockTime"), dt = document.getElementById("clockDate");
    if (t) t.textContent = p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
    if (dt) dt.textContent = d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }

  // ---------------------------------------------------------------- 启动

  function start() {
    tickClock();
    window.setInterval(tickClock, 1000);

    host = document.querySelector("[" + C.HOST_ATTR + "]");
    layer = host.querySelector("." + C.LAYER_CLASS);
    var w = host.clientWidth, hgt = host.clientHeight;

    scene = new THREE.Scene();
    scene.background = cssColor("--c-bg-900");

    var tilt = SHAPE.tiltDeg * Math.PI / 180;
    var camDist = 10;
    camera = new THREE.PerspectiveCamera(SHAPE.fov, w / hgt, 0.1, 200);
    camera.position.set(0, camDist * Math.sin(tilt), camDist * Math.cos(tilt));
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();

    // 统一光源：左上。所有明暗朝同一边——"有品味"最便宜的一条
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    var key = new THREE.DirectionalLight(0xffffff, 1.0);
    key.position.set(-6, 9, 4);
    scene.add(key);
    var fill = new THREE.DirectionalLight(0xffffff, 0.2);
    fill.position.set(5, 3, 6);
    scene.add(fill);

    var box = fitToViewport();

    buildAnchors();
    scene.add(buildTable());
    scene.add(buildPedestals());

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(w, hgt, false);
    renderer.domElement.className = C.CANVAS_CLASS;
    host.insertBefore(renderer.domElement, layer);
    renderer.render(scene, camera);

    buildCards();
    var cardW = fitCardWidth();
    syncProjection();

    C.assertDom(host);
    C.assertPinNamespace();
    C.assertTextureUntainted(renderer);

    window.__STAGE_PREVIEW__ = {
      ready: true, n: TRUNKS.length, radius: radius, cardW: cardW, tableBox: box,
      textures: renderer.info.memory.textures,
      triangles: renderer.info.render.triangles,
      hostBox: host.getBoundingClientRect().toJSON(),
      projected: anchors.reduce(function (acc, a) {
        var r = a.el.getBoundingClientRect();
        acc[a.id] = {
          role: a.role, cx: r.left + r.width / 2, cy: r.top + r.height / 2,
          left: r.left, top: r.top, right: r.right, bottom: r.bottom, w: r.width, h: r.height
        };
        return acc;
      }, {})
    };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
