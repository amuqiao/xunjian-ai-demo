/**
 * stage.js —— 视图一 · 3D 知识图谱展台（Three.js）
 * ═══════════════════════════════════════════════════════════════════
 * 由 views/stage/_origin.html 的内联 <script> 拆出。
 * 场景的每一个数值（R_DISC / R_CARD / DRUM_H / CARD_TILT / SWEEP_SPAN /
 * 光柱 / 倒影 / 粒子 / 俯角方向键 / loading）都照搬原稿，一个参数没调。
 *
 * 相对原稿的四处结构性改动：
 *   1. 全部包进 IIFE。原稿的 scene/camera/cards/CONFIG/hex/cv/tex/rr… 都是全局的，
 *      三个视图同处一页会互相覆盖，这里一律收进闭包，对外只有一次 KG.views.define。
 *   2. 数据来自 KG.derive.*，原稿写死的 CONFIG.categories 已删除。
 *      类目数量 N 不再是 8，取 stageCards().length，圆周分布按实际数量算。
 *   3. three.js 由 index.html 全局引入（vendor/three.min.js，r128），不再挂 CDN。
 *   4. 渲染尺寸、指针坐标、HUD 定位全部相对 #view-stage 容器，不再相对视口。
 *
 * 契约方法见 core/views.js 顶部。
 * ═══════════════════════════════════════════════════════════════════
 */
(function (global) {
  'use strict';

  var KG = global.KG;
  var THREE = global.THREE;
  if (!THREE) throw new Error('[stage] three.js 未加载：vendor/three.min.js 必须在 stage.js 之前引入');

  var D = KG.dom;

  /* ══════════════════════════════════════════════════════════════
     展台自身的呈现参数 —— 数据在 data/kg-data.js，这里只放视觉调参
     ══════════════════════════════════════════════════════════════ */
  var SPIN_SECONDS = 42;             // 转盘转一整圈的秒数（越大越慢越稳重）
  var FOCUS_SECONDS = 0.9;           // focus() 把转盘转到指定立牌的动画时长

  var REDUCED = global.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var R_CARD = 5.40;                 // 卡片所在圆周半径（4.35→5.40，遮挡的最便宜解法）
  var R_DISC = 6.70;                 // 圆台半径
  var DRUM_H = 2.00;                 // 圆台高度（0.85→2.00，侧壁面积翻倍，转动更可读）
  var CAM_DIST = 16;                 // 相机距离
  var CARD_LIFT = 0.62;              // 卡片离台面的悬浮高度
  var CARD_TILT = -24 * Math.PI / 180;  // 卡片后仰角
  var CARD_W = 1.72, CARD_H = 2.35;
  var CARD_T = 0.115;                // 板材厚度
  var FACE_BLEND = 0;                /* 朝向混合：0=全部正对相机。
                                        曾设为 0.19 想露出侧边厚度，但卡片后仰 24° 后
                                        顶面投影本就只剩 10%，歪斜换不来厚度，
                                        只换来"8 张牌没对齐"。厚度改由倒角高光和悬停坐直承担。*/
  var SWEEP_SPAN = Math.PI * 0.42;   // 扫描光带拖尾张角
  var ELEV_DEFAULT = 30;             // 默认俯角，方向键可调，reset() 回到这里
  var SPIN = (Math.PI * 2) / (SPIN_SECONDS * 60);   // 每帧弧度
  var TAU = Math.PI * 2;

  function hex(h) { return new THREE.Color(h); }
  function cssColor(name, fallback) {
    var value = root ? getComputedStyle(root).getPropertyValue(name).trim() : '';
    value = value || getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
    if (global.CSS && global.CSS.supports && !global.CSS.supports('color', value)) value = fallback;
    var color = new THREE.Color();
    color.setStyle(value);
    return color;
  }

  /* ── 闭包状态 ─────────────────────────────────── */
  var root, host, elFName, elFCode, elReadout, elLoading;
  var scene, camera, renderer, turntable, statics, particles, pVel, sweepMesh;
  var coreGroup, coreCage, coreInner, coreHalo, coreLabel;
  var cards = [], pickables = [];
  var hub, TEX_GLOW, TEX_DOT, SLAB_GEO;
  var ELEV = ELEV_DEFAULT;
  var LOOK = null;
  var clock, tNow = 0, lastFocus = -1;
  var raycaster, pointer, hovered = -1, pointerMoved = false;
  var rafId = null, running = false;
  var spinAnim = null;               // { from, to, t0, idx } —— focus() 的转盘定位动画
  var readoutTimer = null;

  /* ══════════════════════════════════════════════
     画布纹理工具
     ══════════════════════════════════════════════ */
  function cv(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function tex(c) { var t = new THREE.CanvasTexture(c); t.anisotropy = 8; t.needsUpdate = true; return t; }
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  /* 径向渐变贴图：用于光池、粒子、底部泛光 */
  function radialTex(stops) {
    var c = cv(256, 256), g = c.getContext('2d');
    var grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    (stops || [[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,.42)'], [1, 'rgba(255,255,255,0)']])
      .forEach(function (s) { grd.addColorStop(s[0], s[1]); });
    g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
    return tex(c);
  }

  /* ══════════════════════════════════════════════
     HUD
     ══════════════════════════════════════════════ */
  function buildDom(metricList) {
    host = D.el('div', 'stg-canvas');
    root.appendChild(host);
    root.appendChild(D.el('div', 'stg-vignette'));
    root.appendChild(D.el('div', 'stg-scanlines'));

    var hud = D.el('div', 'stg-hud');

    var brand = D.el('div', 'stg-brand');
    brand.appendChild(D.el('div', 'stg-eyebrow', KG.derive.ui.stage.eyebrow));
    var h1 = D.el('h1'); h1.textContent = hub.name; brand.appendChild(h1);
    var sub = D.el('div', 'stg-sub'); sub.textContent = hub.sub; brand.appendChild(sub);
    hud.appendChild(brand);

    var live = D.el('div', 'stg-live');
    live.appendChild(D.el('span', 'stg-dot'));
    var liveTxt = D.el('span'); liveTxt.textContent = KG.derive.ui.stage.liveText;
    live.appendChild(liveTxt);
    hud.appendChild(live);

    var metrics = D.el('div', 'stg-metrics');
    var mgroup = D.el('div', 'stg-mgroup');
    /* 指标按 KG.derive.metrics() 返回的数组渲染，条数不写死 */
    metricList.forEach(function (m) {
      var box = D.el('div', 'stg-metric');
      var k = D.el('div', 'k'); k.textContent = m.label;
      var v = D.el('div', 'v'); v.textContent = m.value;
      var em = document.createElement('em'); em.textContent = m.unit;
      v.appendChild(em);
      box.appendChild(k); box.appendChild(v);
      mgroup.appendChild(box);
    });
    metrics.appendChild(mgroup);

    var focusBox = D.el('div', 'stg-focus');
    focusBox.appendChild(D.el('div', 'k', KG.derive.ui.stage.focusLabel));
    elFName = D.el('div', 'v');
    elFCode = D.el('div', 'c');
    focusBox.appendChild(elFName);
    focusBox.appendChild(elFCode);
    metrics.appendChild(focusBox);

    hud.appendChild(metrics);
    root.appendChild(hud);

    /* 俯角读数：不在画面上留常驻控件，数字只在调节时浮出 */
    elReadout = D.el('div', 'stg-readout');
    root.appendChild(elReadout);

    elLoading = D.el('div', 'stg-loading');
    elLoading.appendChild(D.el('div', 'stg-ring'));
    elLoading.appendChild(D.el('p', null, KG.derive.ui.stage.loadingText));
    root.appendChild(elLoading);
  }

  /* ══════════════════════════════════════════════
     场景骨架
     ══════════════════════════════════════════════ */
  function placeCamera() {
    var e = ELEV * Math.PI / 180;
    camera.position.set(0, CAM_DIST * Math.sin(e), CAM_DIST * Math.cos(e));
    camera.lookAt(LOOK);
  }

  function initThree() {
    scene = new THREE.Scene();
    var stageClear = cssColor('--kg-stage-clear', '#06111F');
    scene.fog = new THREE.FogExp2(stageClear, 0.036);

    var w = root.clientWidth, h = root.clientHeight;
    camera = new THREE.PerspectiveCamera(38, w / h, 0.1, 120);
    LOOK = new THREE.Vector3(0, 1.05, 0);
    placeCamera();

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(global.devicePixelRatio, 2));
    renderer.setClearColor(stageClear, 1);
    host.appendChild(renderer.domElement);

    TEX_GLOW = radialTex();
    TEX_DOT = radialTex([[0, 'rgba(255,255,255,1)'], [0.5, 'rgba(255,255,255,.35)'], [1, 'rgba(255,255,255,0)']]);
  }

  /* ══════════════════════════════════════════════
     转盘 —— 唯一在动的东西
     ══════════════════════════════════════════════ */
  function buildTurntable() {
    turntable = new THREE.Group();
    scene.add(turntable);

    /* 桌面：深色玻璃盘，中心略亮，边缘收暗 */
    (function () {
      var c = cv(1024, 1024), g = c.getContext('2d');
      var grd = g.createRadialGradient(512, 512, 40, 512, 512, 512);
      grd.addColorStop(0, 'rgba(22,50,82,1)');
      grd.addColorStop(.42, 'rgba(12,30,50,1)');
      grd.addColorStop(.86, 'rgba(7,20,36,1)');
      grd.addColorStop(1, 'rgba(5,13,24,1)');
      g.fillStyle = grd; g.fillRect(0, 0, 1024, 1024);

      // 同心刻度环
      g.strokeStyle = 'rgba(118,169,213,.10)';
      for (var i = 1; i <= 9; i++) { g.lineWidth = i % 3 === 0 ? 1.6 : 0.8; g.beginPath(); g.arc(512, 512, i * 51, 0, Math.PI * 2); g.stroke(); }
      // 径向分度线
      for (var j = 0; j < 96; j++) {
        var a = j / 96 * Math.PI * 2, long = j % 8 === 0;
        g.strokeStyle = 'rgba(56,198,236,' + (long ? .30 : .10) + ')'; g.lineWidth = long ? 1.8 : 1;
        g.beginPath();
        g.moveTo(512 + Math.cos(a) * (long ? 405 : 452), 512 + Math.sin(a) * (long ? 405 : 452));
        g.lineTo(512 + Math.cos(a) * 500, 512 + Math.sin(a) * 500);
        g.stroke();
      }
      // 非对称弧段：同心圆本身是旋转对称的，转与不转看不出差别，靠这几段弧点破
      [[190, 'rgba(56,198,236,.75)', 0.2, 1.5], [268, 'rgba(47,140,255,.62)', 2.6, 1.1], [372, 'rgba(110,168,255,.5)', 4.4, 2.0]]
        .forEach(function (s) {
          var rad = s[0], col = s[1], a0 = s[2], span = s[3];
          g.strokeStyle = col; g.lineWidth = 3.2; g.lineCap = 'round';
          g.shadowColor = col; g.shadowBlur = 14;
          g.beginPath(); g.arc(512, 512, rad, a0, a0 + span); g.stroke();
          g.shadowBlur = 0;
        });
      // 两颗环绕光点
      [[308, 1.15, 'rgba(56,198,236,1)'], [228, 3.7, 'rgba(47,140,255,1)']].forEach(function (s) {
        var rad = s[0], a = s[1], col = s[2];
        g.fillStyle = col; g.shadowColor = col; g.shadowBlur = 20;
        g.beginPath(); g.arc(512 + Math.cos(a) * rad, 512 + Math.sin(a) * rad, 6, 0, 7); g.fill();
        g.shadowBlur = 0;
      });

      var disc = new THREE.Mesh(
        new THREE.CircleGeometry(R_DISC, 128),
        new THREE.MeshBasicMaterial({ map: tex(c) })
      );
      disc.rotation.x = -Math.PI / 2;
      turntable.add(disc);
    })();

    /* 桌沿：加厚的侧壁 + 竖向凹槽 + 一圈亮边
       立体感几乎全靠这段：有厚度、有明暗过渡、纹路随转动横向流走 */
    (function () {
      var W = 1024, H = 256, c = cv(W, H), g = c.getContext('2d');
      // 上亮下暗，模拟侧壁受光
      var grd = g.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, '#173A56');
      grd.addColorStop(.18, '#102B42');
      grd.addColorStop(.72, '#0B1C2D');
      grd.addColorStop(1, '#06111F');
      g.fillStyle = grd; g.fillRect(0, 0, W, H);
      // 竖向凹槽
      var FLUTES = 96;
      for (var i = 0; i < FLUTES; i++) {
        var x = i * (W / FLUTES);
        g.fillStyle = 'rgba(118,169,213,.16)'; g.fillRect(x, 0, 2.4, H);
        g.fillStyle = 'rgba(0,0,0,.30)'; g.fillRect(x + 2.4, 0, 3.2, H);
      }
      // 顶部一道亮线，把桌面和侧壁分开
      g.fillStyle = 'rgba(56,198,236,.55)'; g.fillRect(0, 0, W, 4);
      var sideTex = tex(c);
      sideTex.wrapS = THREE.RepeatWrapping;

      var side = new THREE.Mesh(
        new THREE.CylinderGeometry(R_DISC, R_DISC * 0.93, DRUM_H, 160, 1, true),
        new THREE.MeshBasicMaterial({ map: sideTex, side: THREE.DoubleSide })
      );
      side.position.y = -DRUM_H / 2;
      turntable.add(side);

      // 底盖，避免从低角度看穿
      var cap = new THREE.Mesh(
        new THREE.CircleGeometry(R_DISC * 0.93, 96),
        new THREE.MeshBasicMaterial({ color: 0x06111F, side: THREE.DoubleSide })
      );
      cap.rotation.x = Math.PI / 2; cap.position.y = -DRUM_H;
      turntable.add(cap);

      // 底沿暗边
      var btm = new THREE.Mesh(
        new THREE.RingGeometry(R_DISC * 0.93 - 0.04, R_DISC * 0.93 + 0.01, 128),
        new THREE.MeshBasicMaterial({ color: 0x2F8CFF, transparent: true, opacity: .35, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
      );
      btm.rotation.x = -Math.PI / 2; btm.position.y = -DRUM_H + 0.005;
      turntable.add(btm);

      /* 静止基座：压在转动鼓身之下。两者之间那道不动的接缝，
         是"它在转"最硬的证据——比任何光效都可靠 */
      var plinth = new THREE.Mesh(
        new THREE.CylinderGeometry(R_DISC * 0.99, R_DISC * 1.06, 0.40, 96),
        new THREE.MeshLambertMaterial({ color: 0x0D2235, emissive: 0x06111F })
      );
      plinth.position.y = -DRUM_H - 0.20;
      scene.add(plinth);                       // 加进 scene 而非 turntable：它不转

      var seam = new THREE.Mesh(
        new THREE.RingGeometry(R_DISC * 0.99, R_DISC * 1.07, 128),
        new THREE.MeshBasicMaterial({ color: 0x56A4FF, transparent: true, opacity: .5, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
      );
      seam.rotation.x = -Math.PI / 2; seam.position.y = -DRUM_H + 0.002;
      scene.add(seam);

      var rim = new THREE.Mesh(
        new THREE.RingGeometry(R_DISC - 0.035, R_DISC + 0.02, 160),
        new THREE.MeshBasicMaterial({ color: 0x38C6EC, transparent: true, opacity: .85, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
      );
      rim.rotation.x = -Math.PI / 2; rim.position.y = 0.005;
      turntable.add(rim);
    })();

    /* 扫描光带：从圆心扫出的一道扇形拖尾 —— 展台的签名动作 */
    (function () {
      var S = 1024, c = cv(S, S), g = c.getContext('2d');
      g.clearRect(0, 0, S, S);
      var steps = 200;
      for (var i = 0; i < steps; i++) {
        var t = i / steps;                       // 0 = 头部（最亮）
        var a0 = -SWEEP_SPAN * t, a1 = -SWEEP_SPAN * (t + 1.4 / steps);
        var alpha = Math.pow(1 - t, 2.1) * 0.85;
        g.beginPath();
        g.moveTo(S / 2, S / 2);
        g.arc(S / 2, S / 2, S / 2, a1, a0, false);
        g.closePath();
        var grd = g.createRadialGradient(S / 2, S / 2, 30, S / 2, S / 2, S / 2);
        grd.addColorStop(0, 'rgba(56,198,236,' + (alpha * 0.15) + ')');
        grd.addColorStop(.55, 'rgba(143,191,255,' + (alpha * 0.62) + ')');
        grd.addColorStop(.93, 'rgba(47,140,255,' + alpha + ')');
        grd.addColorStop(1, 'rgba(47,140,255,0)');
        g.fillStyle = grd; g.fill();
      }
      sweepMesh = new THREE.Mesh(
        new THREE.CircleGeometry(R_DISC * 0.985, 128),
        new THREE.MeshBasicMaterial({ map: tex(c), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: .95 })
      );
      sweepMesh.rotation.x = -Math.PI / 2;
      sweepMesh.position.y = 0.012;
      turntable.add(sweepMesh);
    })();

    /* 转盘上的浮动刻度块，给旋转一点可读的质感 */
    (function () {
      var grp = new THREE.Group();
      for (var i = 0; i < 44; i++) {
        var a = i / 44 * Math.PI * 2, r = R_DISC - 0.55;
        var m = new THREE.Mesh(
          new THREE.PlaneGeometry(i % 4 === 0 ? 0.30 : 0.13, 0.05),
          new THREE.MeshBasicMaterial({ color: i % 4 === 0 ? 0x8FBFFF : 0x56A4FF, transparent: true, opacity: i % 4 === 0 ? .75 : .4, blending: THREE.AdditiveBlending, depthWrite: false })
        );
        m.position.set(Math.cos(a) * r, 0.03, Math.sin(a) * r);
        m.rotation.set(-Math.PI / 2, 0, -a);
        grp.add(m);
      }
      turntable.add(grp);
    })();

    /* 地面泛光：让圆桌像浮在光上 */
    (function () {
      var floor = new THREE.Mesh(
        new THREE.CircleGeometry(15, 64),
        new THREE.MeshBasicMaterial({ map: TEX_GLOW, color: 0x38C6EC, transparent: true, opacity: .30, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      floor.rotation.x = -Math.PI / 2; floor.position.y = -DRUM_H - 0.62;
      scene.add(floor);
    })();
  }

  /* ══════════════════════════════════════════════
     静态层 —— 立牌永远不转，永远正面朝人
     ══════════════════════════════════════════════ */
  var ICONS = {
    doc: function (g) { g.strokeRect(-16, -21, 32, 42); [-10, -2, 6].forEach(function (y) { g.beginPath(); g.moveTo(-9, y); g.lineTo(9, y); g.stroke(); }); },
    chart: function (g) { [[-12, 8, 20], [-2, -4, 32], [8, 2, 26]].forEach(function (b) { g.strokeRect(b[0] - 4, 20 - b[2], 9, b[2]); }); g.beginPath(); g.moveTo(-20, 22); g.lineTo(20, 22); g.stroke(); },
    people: function (g) {
      g.beginPath(); g.arc(-8, -8, 7, 0, 7); g.stroke(); g.beginPath(); g.arc(9, -4, 5.5, 0, 7); g.stroke();
      g.beginPath(); g.arc(-8, 16, 14, Math.PI, 0); g.stroke(); g.beginPath(); g.arc(9, 17, 10, Math.PI, 0); g.stroke();
    },
    shield: function (g) {
      g.beginPath(); g.moveTo(0, -22); g.lineTo(17, -14); g.lineTo(17, 4); g.quadraticCurveTo(17, 18, 0, 23); g.quadraticCurveTo(-17, 18, -17, 4); g.lineTo(-17, -14); g.closePath(); g.stroke();
      g.beginPath(); g.moveTo(-7, 0); g.lineTo(-1, 7); g.lineTo(9, -6); g.stroke();
    },
    stack: function (g) { [-14, 0, 14].forEach(function (y) { g.beginPath(); g.moveTo(0, y - 9); g.lineTo(18, y); g.lineTo(0, y + 9); g.lineTo(-18, y); g.closePath(); g.stroke(); }); },
    chat: function (g) {
      g.beginPath(); g.moveTo(-18, -16); g.lineTo(18, -16); g.lineTo(18, 8); g.lineTo(-4, 8); g.lineTo(-12, 18); g.lineTo(-12, 8); g.lineTo(-18, 8); g.closePath(); g.stroke();
      [-8, 0, 8].forEach(function (x) { g.beginPath(); g.arc(x, -4, 1.9, 0, 7); g.fill(); });
    },
    node: function (g) {
      g.beginPath(); g.arc(0, 0, 6, 0, 7); g.stroke();
      [[0, -18], [16, 9], [-16, 9]].forEach(function (p) {
        g.beginPath(); g.arc(p[0], p[1], 4.5, 0, 7); g.stroke();
        g.beginPath(); g.moveTo(p[0] * .32, p[1] * .32); g.lineTo(p[0] * .72, p[1] * .72); g.stroke();
      });
    },
    cal: function (g) {
      g.strokeRect(-18, -15, 36, 34); g.beginPath(); g.moveTo(-18, -5); g.lineTo(18, -5); g.stroke();
      g.beginPath(); g.moveTo(-10, -21); g.lineTo(-10, -11); g.moveTo(10, -21); g.lineTo(10, -11); g.stroke();
      [[-8, 4], [2, 4], [12, 4], [-8, 13], [2, 13]].forEach(function (p) { g.fillRect(p[0] - 2.5, p[1] - 2.5, 5, 5); });
    }
  };

  /* 立牌贴图：512×700，含边框、图标、中文名、英文名、指标 */
  function cardTexture(cat, hot) {
    var W = 512, H = 700, c = cv(W, H), g = c.getContext('2d');
    g.clearRect(0, 0, W, H);
    var pad = 16, x = pad, y = pad, w = W - pad * 2, h = H - pad * 2, r = 22;
    var col = cat.color;

    // 外发光
    g.save();
    g.shadowColor = col; g.shadowBlur = hot ? 58 : 26;
    g.fillStyle = 'rgba(8,24,40,.001)'; rr(g, x, y, w, h, r); g.fill();
    g.restore();

    // 卡面
    var bg = g.createLinearGradient(0, y, 0, y + h);
    bg.addColorStop(0, hot ? 'rgba(22,50,82,.97)' : 'rgba(13,34,53,.94)');
    bg.addColorStop(.55, hot ? 'rgba(10,31,52,.96)' : 'rgba(8,24,40,.93)');
    bg.addColorStop(1, hot ? 'rgba(8,24,40,.97)' : 'rgba(6,17,31,.95)');
    rr(g, x, y, w, h, r); g.fillStyle = bg; g.fill();

    // 描边
    g.lineWidth = hot ? 3 : 1.6;
    g.strokeStyle = hot ? col : 'rgba(118,169,213,.30)';
    rr(g, x, y, w, h, r); g.stroke();

    // 顶部色条
    g.save(); rr(g, x, y, w, h, r); g.clip();
    var bar = g.createLinearGradient(x, 0, x + w, 0);
    bar.addColorStop(0, 'rgba(255,255,255,0)'); bar.addColorStop(.5, col); bar.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = bar; g.fillRect(x, y, w, hot ? 6 : 4);
    // 卡面细网格
    g.strokeStyle = 'rgba(118,169,213,.055)'; g.lineWidth = 1;
    for (var i = 1; i < 9; i++) { g.beginPath(); g.moveTo(x, y + i * h / 9); g.lineTo(x + w, y + i * h / 9); g.stroke(); }
    g.restore();

    // 代号
    g.font = '500 20px "SF Mono",Menlo,monospace';
    g.fillStyle = hot ? col : 'rgba(118,169,213,.62)';
    g.textAlign = 'left'; g.fillText(cat.code, x + 30, y + 52);

    // 状态点
    g.beginPath(); g.arc(x + w - 34, y + 45, 5, 0, 7);
    g.fillStyle = hot ? col : 'rgba(56,198,236,.42)'; g.fill();

    // 图标
    var drawIcon = ICONS[cat.icon];
    /* 原稿写的是 ICONS[icon] || ICONS.doc：图标名打错时会静默画成"文档"，
       八张牌里混进一张错图标，路演现场根本看不出来。模板里改成直接报错。 */
    if (!drawIcon) throw new Error('[stage] 类目「' + cat.name + '」的 icon「' + cat.icon + '」没有对应画法');
    g.save();
    g.translate(W / 2, y + 168);
    g.scale(1.65, 1.65);
    g.strokeStyle = hot ? '#fff' : col;
    g.fillStyle = hot ? '#fff' : col;
    g.lineWidth = 2.1; g.lineJoin = 'round'; g.lineCap = 'round';
    g.shadowColor = col; g.shadowBlur = hot ? 22 : 10;
    drawIcon(g);
    g.restore();

    // 中文名
    g.textAlign = 'center';
    g.font = '600 52px "PingFang SC","Microsoft YaHei",sans-serif';
    g.fillStyle = hot ? '#FFFFFF' : '#E8F4FF';
    if (hot) { g.shadowColor = col; g.shadowBlur = 26; }
    g.fillText(cat.name, W / 2, y + 322);
    g.shadowBlur = 0;

    // 英文名
    g.font = '400 19px "SF Mono",Menlo,monospace';
    g.fillStyle = 'rgba(118,169,213,.68)';
    g.letterSpacing = '3px';
    g.fillText(cat.en, W / 2, y + 360);

    // 分隔线
    var ln = g.createLinearGradient(x + 60, 0, x + w - 60, 0);
    ln.addColorStop(0, 'rgba(255,255,255,0)');
    ln.addColorStop(.5, hot ? col : 'rgba(56,198,236,.4)');
    ln.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = ln; g.fillRect(x + 60, y + 394, w - 120, 1.4);

    // 指标
    g.font = '500 62px "SF Mono",Menlo,monospace';
    g.fillStyle = hot ? '#FFFFFF' : '#BFE4FF';
    g.fillText(cat.count, W / 2, y + 486);
    g.font = '400 21px "PingFang SC",sans-serif';
    g.fillStyle = 'rgba(118,169,213,.62)';
    g.fillText(KG.derive.text.docUnit + ' · ' + cat.note, W / 2, y + 522);

    // 底部进度条：占总量的比例（countRaw 是派生层给的原始数值，不用再解析千分位）
    /* 分母不再写死：由派生层给出（默认取最大类目的文档量），
       于是进度条表达的是"该类目在全部类目中的相对体量"，换任何数据都成立 */
    var ratio = Math.min(1, cat.countRaw / KG.derive.progressBase());
    g.fillStyle = 'rgba(56,198,236,.14)'; rr(g, x + 62, y + 560, w - 124, 5, 3); g.fill();
    g.fillStyle = col; rr(g, x + 62, y + 560, (w - 124) * ratio, 5, 3); g.fill();

    // 底座
    g.fillStyle = hot ? 'rgba(255,255,255,.12)' : 'rgba(56,198,236,.07)';
    rr(g, W / 2 - 96, y + h - 52, 192, 34, 8); g.fill();
    g.font = '400 16px "SF Mono",Menlo,monospace';
    g.fillStyle = 'rgba(118,169,213,.58)';
    g.fillText(KG.derive.ui.stage.cardFooter, W / 2, y + h - 30);

    return tex(c);
  }

  /* 圆角矩形板：用 ExtrudeGeometry 挤出真实厚度和倒角。
     倒角面会单独吃光，于是卡片四周出现一圈受光的边——
     这是"看得出是块料"和"贴了张纸"的分界线。 */
  function slabGeometry(w, h, t, r) {
    var s = new THREE.Shape();
    var x = -w / 2, y = -h / 2;
    s.moveTo(x + r, y);
    s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    var g = new THREE.ExtrudeGeometry(s, {
      depth: t, bevelEnabled: true, bevelThickness: 0.032, bevelSize: 0.032, bevelSegments: 3, curveSegments: 8
    });
    g.translate(0, 0, -t / 2);
    return g;
  }

  /* ExtrudeGeometry 的 UV 直接用顶点坐标，需要换算到 0~1 才能正确贴图 */
  function fitTex(tx, w, h) {
    tx.repeat.set(1 / w, 1 / h);
    tx.offset.set(0.5, 0.5);
    tx.needsUpdate = true;
    return tx;
  }

  function buildCards(catList) {
    statics = new THREE.Group();
    scene.add(statics);

    SLAB_GEO = slabGeometry(CARD_W, CARD_H, CARD_T, 0.09);
    var N = catList.length;

    catList.forEach(function (cat, i) {
      var a = (i / N) * Math.PI * 2 - Math.PI / 2;       // 起始角
      var px = Math.cos(a) * R_CARD, pz = Math.sin(a) * R_CARD;
      var col = hex(cat.color);

      var grp = new THREE.Group();
      grp.position.set(px, 0, pz);

      var texCold = fitTex(cardTexture(cat, false), CARD_W, CARD_H);
      var texHot = cardTexture(cat, true);

      /* 卡片正面不受光：它是一块自发光的亚克力灯牌，
         文字亮度必须恒定，不能让灯光把它压暗 */
      var matFace = new THREE.MeshBasicMaterial({ map: texCold, transparent: true, opacity: 1 });
      // 侧边与倒角受光：明暗过渡全靠它
      var matEdge = new THREE.MeshLambertMaterial({ color: 0x174A70, emissive: 0x0A2440 });

      var card = new THREE.Mesh(SLAB_GEO, [matFace, matEdge]);
      card.position.y = CARD_LIFT + CARD_H / 2 * Math.cos(CARD_TILT);
      card.rotation.x = CARD_TILT;                  // 后仰，正对抬高后的机位
      card.userData.idx = i;                        // 供射线拾取识别
      grp.add(card);

      // 点亮层：贴在正面之上，用透明度做过渡
      var matHot = new THREE.MeshBasicMaterial({ map: texHot, transparent: true, opacity: 0, depthWrite: false });
      var cardHot = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W, CARD_H), matHot);
      cardHot.position.set(0, card.position.y, CARD_T / 2 + 0.03);
      cardHot.rotation.x = CARD_TILT;
      grp.add(cardHot);

      /* ── 光柱：卡片与圆台之间唯一的"接触" ──
         实体底座压在转动的台面上，眼睛会读成打滑；
         而一束光静止地落在旋转的面上是物理正确的，
         所以这里只用光，不用任何实体。 */
      var colTex = (function () {
        var c = cv(8, 256), g = c.getContext('2d');
        var grd = g.createLinearGradient(0, 0, 0, 256);
        grd.addColorStop(0, 'rgba(255,255,255,0)');    // 顶端（贴卡片）淡出
        grd.addColorStop(.35, 'rgba(255,255,255,.30)');
        grd.addColorStop(1, 'rgba(255,255,255,.85)');  // 落到台面处最亮
        g.fillStyle = grd; g.fillRect(0, 0, 8, 256);
        return tex(c);
      })();
      var column = new THREE.Mesh(
        new THREE.CylinderGeometry(0.30, 0.46, CARD_LIFT, 24, 1, true),
        new THREE.MeshBasicMaterial({
          map: colTex, color: col, transparent: true, opacity: .24,
          blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
        })
      );
      column.position.y = CARD_LIFT / 2;
      grp.add(column);

      // 桌面倒影：平躺、镜像、压扁
      var matRef = new THREE.MeshBasicMaterial({ map: cardTexture(cat, false), transparent: true, opacity: .11, depthWrite: false });
      var ref = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W, CARD_H), matRef);
      ref.rotation.x = -Math.PI / 2;
      ref.scale.y = -0.52;
      ref.position.set(0, 0.016, -CARD_H * 0.40);
      grp.add(ref);

      // 桌面光池
      var pool = new THREE.Mesh(
        new THREE.CircleGeometry(1.05, 40),
        new THREE.MeshBasicMaterial({ map: TEX_GLOW, color: col, transparent: true, opacity: .28, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      pool.rotation.x = -Math.PI / 2; pool.position.set(px, 0.03, pz);
      statics.add(pool);

      statics.add(grp);
      cards.push({
        cat: cat, grp: grp, card: card, cardHot: cardHot, ref: ref, pool: pool, column: column, matEdge: matEdge,
        angle: a, px: px, pz: pz, base: card.position.y, baseYaw: 0, camYaw: 0,
        phase: i * 0.8, heat: 0, hover: 0
      });
    });

    /* 核心 → 立牌的连接光束（静态，随立牌一起不动） */
    (function () {
      var c = cv(256, 8), g = c.getContext('2d');
      var grd = g.createLinearGradient(0, 0, 256, 0);
      grd.addColorStop(0, 'rgba(255,255,255,0)');
      grd.addColorStop(.25, 'rgba(255,255,255,.18)');
      grd.addColorStop(1, 'rgba(255,255,255,.95)');
      g.fillStyle = grd; g.fillRect(0, 0, 256, 8);
      var beamTex = tex(c);

      cards.forEach(function (cd) {
        var len = R_CARD - 0.85;
        var beam = new THREE.Mesh(
          new THREE.PlaneGeometry(len, 0.075),
          new THREE.MeshBasicMaterial({ map: beamTex, color: hex(cd.cat.color), transparent: true, opacity: .42, blending: THREE.AdditiveBlending, depthWrite: false })
        );
        var mid = 0.85 + len / 2;
        beam.position.set(Math.cos(cd.angle) * mid, 0.045, Math.sin(cd.angle) * mid);
        beam.rotation.set(-Math.PI / 2, 0, -cd.angle);
        statics.add(beam);
        cd.beam = beam;
      });
    })();
  }

  /* 朝向：完全正对相机的话，所有牌全是正脸，厚度一丝都露不出来。
     按方位角混合一点"朝外"，两侧的牌微微侧过去露出侧边，
     正前方的牌几乎不受影响，文字依然正对观众。
     俯角可调之后，这套朝向必须跟着相机重算，否则调到一半卡片会侧成纸片。 */
  function orientCards() {
    cards.forEach(function (cd) {
      var camYaw = Math.atan2(camera.position.x - cd.px, camera.position.z - cd.pz);
      var outYaw = Math.PI / 2 - cd.angle;
      var diff = (outYaw - camYaw) % (Math.PI * 2);
      if (diff > Math.PI) diff -= Math.PI * 2;
      if (diff < -Math.PI) diff += Math.PI * 2;
      cd.camYaw = camYaw;
      cd.baseYaw = camYaw + diff * FACE_BLEND;
      cd.grp.rotation.y = cd.baseYaw + (cd.camYaw - cd.baseYaw) * cd.hover;
    });
    if (coreLabel) coreLabel.lookAt(camera.position.x, coreLabel.position.y, camera.position.z);
  }

  /* ── 灯光：只影响侧边、倒角和底座，正面自发光不受影响 ── */
  function buildLights() {
    scene.add(new THREE.HemisphereLight(0x56A4FF, 0x06111F, 0.85));
    var keyLight = new THREE.DirectionalLight(0xE8F4FF, 1.05);
    keyLight.position.set(5, 10, 9);
    scene.add(keyLight);
    var rimLight = new THREE.DirectionalLight(0x2F8CFF, 0.55);
    rimLight.position.set(-7, 3, -8);
    scene.add(rimLight);
  }

  /* ── 中心核心节点 ─────────────────────────────── */
  function buildCore() {
    coreGroup = new THREE.Group();
    coreGroup.position.y = 0.98;
    statics.add(coreGroup);

    coreCage = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.50, 1),
      new THREE.MeshBasicMaterial({ color: 0x8FBFFF, wireframe: true, transparent: true, opacity: .5 })
    );
    coreGroup.add(coreCage);

    coreInner = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.27, 1),
      new THREE.MeshBasicMaterial({ color: 0xE8F4FF, transparent: true, opacity: .9 })
    );
    coreGroup.add(coreInner);

    coreHalo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: TEX_GLOW, color: 0x38C6EC, transparent: true, opacity: .75, blending: THREE.AdditiveBlending, depthWrite: false
    }));
    coreHalo.scale.set(3.2, 3.2, 1);
    coreGroup.add(coreHalo);

    // 核心投在桌面的光池
    var p = new THREE.Mesh(
      new THREE.CircleGeometry(2.0, 48),
      new THREE.MeshBasicMaterial({ map: TEX_GLOW, color: 0x2F8CFF, transparent: true, opacity: .5, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    p.rotation.x = -Math.PI / 2; p.position.y = 0.02;
    statics.add(p);

    // 核心标签
    var c = cv(512, 150), g = c.getContext('2d');
    g.textAlign = 'center';
    g.font = '600 46px "PingFang SC","Microsoft YaHei",sans-serif';
    g.fillStyle = '#FFFFFF'; g.shadowColor = '#38C6EC'; g.shadowBlur = 24;
    g.fillText(hub.name, 256, 56);
    g.shadowBlur = 0;
    g.font = '400 17px "SF Mono",Menlo,monospace';
    g.fillStyle = 'rgba(160,185,240,.65)'; g.letterSpacing = '4px';
    g.fillText(hub.en, 256, 92);
    var lbl = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 0.76),
      new THREE.MeshBasicMaterial({ map: tex(c), transparent: true, depthWrite: false })
    );
    lbl.position.set(0, 2.02, 0);
    lbl.lookAt(camera.position.x, 2.02, camera.position.z);
    coreLabel = lbl;
    statics.add(lbl);
  }

  /* ── 环境粒子 ─────────────────────────────────── */
  function buildParticles() {
    var COUNT = 1100;
    var pos = new Float32Array(COUNT * 3), colArr = new Float32Array(COUNT * 3);
    pVel = new Float32Array(COUNT);
    var cA = hex('#38C6EC'), cB = hex('#2F8CFF'), cC = hex('#8FBFFF'), tmp = new THREE.Color();
    for (var i = 0; i < COUNT; i++) {
      var a = Math.random() * Math.PI * 2;
      var rad = 2 + Math.pow(Math.random(), .6) * 13;
      pos[i * 3] = Math.cos(a) * rad;
      pos[i * 3 + 1] = -1 + Math.random() * 11;
      pos[i * 3 + 2] = Math.sin(a) * rad;
      pVel[i] = 0.004 + Math.random() * 0.015;
      var t = Math.random();
      tmp.copy(t < .45 ? cA : (t < .8 ? cB : cC));
      colArr[i * 3] = tmp.r; colArr[i * 3 + 1] = tmp.g; colArr[i * 3 + 2] = tmp.b;
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
    particles = new THREE.Points(geo, new THREE.PointsMaterial({
      size: .085, map: TEX_DOT, vertexColors: true, transparent: true, opacity: .72,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
    }));
    scene.add(particles);
  }

  /* ══════════════════════════════════════════════
     交互：悬停拾取 + 点击打开
     ══════════════════════════════════════════════ */
  function setPointerFrom(e) {
    var r = renderer.domElement.getBoundingClientRect();
    pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  }

  function bindEvents() {
    root.addEventListener('pointermove', function (e) {
      setPointerFrom(e);
      pointerMoved = true;
    });
    root.addEventListener('pointerleave', function () {
      pointer.set(-2, -2);
      pointerMoved = true;
    });

    /* 点击立牌 / 中心核心 → 只发事件，跳到哪个视图由 app.js 决定 */
    root.addEventListener('click', function (e) {
      setPointerFrom(e);
      pointerMoved = true;
      raycaster.setFromCamera(pointer, camera);
      var hit = raycaster.intersectObjects(pickables, false)[0];
      if (!hit) return;
      var id = hit.object.userData.isCore ? hub.id : cards[hit.object.userData.idx].cat.id;
      KG.bus.emit('node:open', { id: id, view: 'stage', from: locate(id) });
    });

    /* ── 俯角调节：上下方向键，不在画面上留常驻控件 ── */
    global.addEventListener('keydown', function (e) {
      if (!running) return;                       // 视图没激活就不抢方向键
      if (e.key === 'ArrowUp') { setElevation(ELEV + 1.5); e.preventDefault(); }
      else if (e.key === 'ArrowDown') { setElevation(ELEV - 1.5); e.preventDefault(); }
    });

    global.addEventListener('resize', syncSize);
  }

  function applyElevation(v) {
    ELEV = Math.max(20, Math.min(50, v));
    placeCamera();
    orientCards();                       // 关键：朝向必须跟着重算
  }

  /* 数字只在调节时浮出，1.5 秒后自己消失，不占路演画面 */
  function setElevation(v) {
    applyElevation(v);
    elReadout.textContent = '俯角 ' + ELEV.toFixed(0) + '°';
    elReadout.style.opacity = '1';
    clearTimeout(readoutTimer);
    readoutTimer = setTimeout(function () { elReadout.style.opacity = '0'; }, 1500);
  }

  function syncSize() {
    var w = root.clientWidth, h = root.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  /* ══════════════════════════════════════════════
     动画：只有转盘在转，立牌被光带轮流唤醒
     ══════════════════════════════════════════════ */
  function shortestAngle(a, b) {
    var d = (a - b) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  function easeInOut(k) { return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; }

  function setFocusHud(i) {
    lastFocus = i;
    var c = cards[i].cat;
    elFName.textContent = c.name;
    elFName.style.color = c.color;
    elFCode.textContent = c.code + ' · ' + c.count + ' ' + KG.derive.text.docUnit;
  }

  function animate() {
    if (!running) return;                // pause() 之后真的不再排下一帧
    rafId = requestAnimationFrame(animate);
    tNow += clock.getDelta();
    var t = tNow;

    /* 转盘：唯一的持续运动。focus() 期间由定位动画接管，
       动画一结束就交还给匀速自转 */
    if (spinAnim) {
      var k = (t - spinAnim.t0) / FOCUS_SECONDS;
      if (k >= 1) { turntable.rotation.y = spinAnim.to; spinAnim = null; }
      else turntable.rotation.y = spinAnim.from + (spinAnim.to - spinAnim.from) * easeInOut(k);
    } else if (!REDUCED) {
      turntable.rotation.y -= SPIN;
    }

    /* 扫描光带前缘所指的世界方位角。
       贴图绘制时前缘落在纹理 0°，CircleGeometry 绕 X 转 -90° 后世界方位角取反，
       转盘再绕 Y 转 rotation.y，于是前缘方位角 = -rotation.y。
       立牌是静止的，方位角恒为 cd.angle，两者之差就是"落后前缘多少"。*/
    var lead = -turntable.rotation.y;

    // 射线拾取：鼠标移动过才重算，静止时不做无谓计算
    if (pointerMoved) {
      pointerMoved = false;
      raycaster.setFromCamera(pointer, camera);
      var hit = raycaster.intersectObjects(pickables, false)[0];
      var onCore = !!(hit && hit.object.userData.isCore);
      // 核心也能点，但它不参与立牌的 heat 逻辑，只给光标反馈
      hovered = (hit && !onCore) ? hit.object.userData.idx : -1;
      renderer.domElement.style.cursor = hit ? 'pointer' : 'default';
    }

    // focus() 定位期间把目标立牌的 heat 拉满，转到位时前缘正好压在它身上，无缝交接
    var locked = spinAnim ? spinAnim.idx : -1;

    var best = -1, bestHeat = 0;
    cards.forEach(function (cd, i) {
      var d = (lead - cd.angle) % TAU;
      if (d < 0) d += TAU;
      // 前缘刚扫到时最亮，拖尾扫过逐渐熄灭
      var scan = d < SWEEP_SPAN ? Math.pow(1 - d / SWEEP_SPAN, 1.4) : 0;
      cd.hover += ((i === hovered ? 1 : 0) - cd.hover) * 0.18;
      /* 悬停接管高亮：手动选中优先于自动扫描，
         否则两套高亮会在同一张牌上打架、闪烁 */
      var heat = Math.max(scan * (1 - cd.hover), cd.hover, i === locked ? 1 : 0);
      cd.heat += (heat - cd.heat) * 0.16;

      cd.cardHot.material.opacity = cd.heat;
      cd.pool.material.opacity = .22 + cd.heat * .72;
      cd.pool.scale.setScalar(1 + cd.heat * 0.42);
      cd.beam.material.opacity = .30 + cd.heat * .62;
      cd.ref.material.opacity = (.09 + cd.heat * .15) * (1 - cd.hover * .6);
      cd.column.material.opacity = .20 + cd.heat * .46;

      // 侧边提亮：受光材质，改自发光比改颜色更干净
      cd.matEdge.emissive.setRGB(.04 + cd.heat * .16, .07 + cd.heat * .22, .19 + cd.heat * .36);

      /* 悬停效果只发生在被悬停的这一张身上，不牵动任何其他卡片。
         抬升 + 放大 + 略微坐直：坐直让后仰从 24° 收到 12°，
         顶面投影从厚度的 10% 涨到 30%，顺带把板材厚度亮出来。*/
      var float = REDUCED ? 0 : Math.sin(t * 0.7 + cd.phase) * 0.022;
      cd.card.position.y = cd.base + float + cd.heat * 0.05 + cd.hover * 0.13;
      cd.card.rotation.x = CARD_TILT * (1 - cd.hover * 0.5);
      var sc = 1 + cd.hover * 0.06;
      cd.card.scale.set(sc, sc, 1);
      cd.cardHot.position.y = cd.card.position.y;
      cd.cardHot.rotation.x = cd.card.rotation.x;
      cd.cardHot.scale.set(sc, sc, 1);

      if (cd.heat > bestHeat) { bestHeat = cd.heat; best = i; }
    });

    // HUD 焦点：悬停优先，鼠标移开后交还给扫描光带
    var focusIdx = hovered >= 0 ? hovered : (bestHeat > .35 ? best : -1);
    if (focusIdx >= 0 && focusIdx !== lastFocus) setFocusHud(focusIdx);

    // 核心呼吸
    coreCage.rotation.y += 0.0035;
    coreCage.rotation.x += 0.0016;
    coreInner.rotation.y -= 0.006;
    var pulse = 1 + Math.sin(t * 1.5) * 0.06;
    coreHalo.scale.set(3.2 * pulse, 3.2 * pulse, 1);
    coreHalo.material.opacity = .62 + Math.sin(t * 1.5) * 0.13;

    // 粒子缓慢上浮
    if (!REDUCED) {
      var p = particles.geometry.attributes.position;
      for (var i = 0; i < p.count; i++) {
        var y = p.getY(i) + pVel[i];
        if (y > 10.5) y = -1;
        p.setY(i, y);
      }
      p.needsUpdate = true;
      particles.rotation.y += 0.00035;
    }

    renderer.render(scene, camera);
  }

  /* ══════════════════════════════════════════════
     屏幕坐标投影 —— 转场要知道"这个节点现在在屏幕哪儿"
     ══════════════════════════════════════════════ */
  var _p = new THREE.Vector3(), _q = new THREE.Vector3();
  var _right = new THREE.Vector3(), _up = new THREE.Vector3();

  function toScreen(v, rect) {
    _q.copy(v).project(camera);
    return {
      x: (_q.x * 0.5 + 0.5) * rect.width + rect.left,
      y: (-_q.y * 0.5 + 0.5) * rect.height + rect.top
    };
  }

  /* 返回的是 DOMRect 口径的矩形：x/y 是左上角，单位 CSS 像素，相对视口。
     w/h 由"中心点 ± 相机右向/上向的半尺寸"两次投影估出来，
     这样卡片后仰、透视近大远小都能吃进去。 */
  function projectRect(center, halfW, halfH, color, label) {
    scene.updateMatrixWorld();
    camera.updateMatrixWorld();
    var rect = renderer.domElement.getBoundingClientRect();
    _right.setFromMatrixColumn(camera.matrixWorld, 0);
    _up.setFromMatrixColumn(camera.matrixWorld, 1);

    var c = toScreen(center, rect);
    var sx = toScreen(_p.copy(center).addScaledVector(_right, halfW), rect);
    var sy = toScreen(_p.copy(center).addScaledVector(_up, halfH), rect);
    var w = Math.abs(sx.x - c.x) * 2;
    var h = Math.abs(sy.y - c.y) * 2;

    return { x: c.x - w / 2, y: c.y - h / 2, w: w, h: h, color: color, label: label };
  }

  function indexOfCat(id) {
    for (var i = 0; i < cards.length; i++) if (cards[i].cat.id === id) return i;
    return -1;
  }

  function locate(id) {
    if (id === hub.id) {
      coreGroup.getWorldPosition(_p);
      // 核心的可见范围按外层二十面体笼子（半径 0.50）稍放一点
      return projectRect(_p.clone(), 0.62, 0.62, KG.derive.types.hub.color, hub.name);
    }
    var i = indexOfCat(id);
    if (i < 0) return null;
    var cd = cards[i];
    cd.card.getWorldPosition(_p);
    // 卡片后仰 CARD_TILT，屏幕上的高度按投影后的半高算
    return projectRect(
      _p.clone(),
      CARD_W / 2 * cd.card.scale.x,
      CARD_H / 2 * Math.cos(CARD_TILT) * cd.card.scale.y,
      cd.cat.color, cd.cat.name
    );
  }

  /* ══════════════════════════════════════════════
     视图契约
     ══════════════════════════════════════════════ */
  KG.views.define('stage', {
    el: '#view-stage',

    mount: function (el) {
      root = el;
      hub = KG.derive.meta.hub;
      var catList = KG.derive.stageCards();

      buildDom(KG.derive.metrics());
      initThree();
      buildTurntable();
      buildCards(catList);
      buildLights();
      buildCore();
      buildParticles();
      orientCards();

      // HUD 焦点区的初始文案：第一张牌，颜色留给扫描光带扫到时再上
      elFName.textContent = cards[0].cat.name;
      elFCode.textContent = cards[0].cat.code + ' · ' + cards[0].cat.count + ' ' + KG.derive.text.docUnit;

      clock = new THREE.Clock();
      raycaster = new THREE.Raycaster();
      pointer = new THREE.Vector2(-2, -2);
      pickables = cards.map(function (cd) { return cd.card; });
      // 中心核心也可点：它代表整个知识中枢
      coreCage.userData.isCore = true;
      coreInner.userData.isCore = true;
      pickables.push(coreCage, coreInner);

      bindEvents();
      setTimeout(function () { elLoading.classList.add('gone'); }, 500);
    },

    activate: function (opts) {
      syncSize();                        // 挂起期间窗口可能改过尺寸
      if (opts.focusId) this.focus(opts.focusId);
    },

    deactivate: function () {
      // 鼠标是从别处离开的，指针状态留着会让立牌带着高亮"冻"在那儿
      pointer.set(-2, -2);
      pointerMoved = true;
      renderer.domElement.style.cursor = 'default';
    },

    /* 转盘转到该立牌：目标角度 = 让扫描光带前缘正好落在它的方位角上。
       前缘方位角 lead = -turntable.rotation.y，所以 rotation.y 要走到 -angle，
       取与当前角度差值最小的那个等价角，避免为了转 5° 绕一整圈。 */
    focus: function (catId) {
      var i = indexOfCat(catId);
      if (i < 0) throw new Error('[stage] focus 收到的 id 不是展台上的类目：' + catId);
      var cd = cards[i];
      var target = turntable.rotation.y + shortestAngle(-cd.angle, turntable.rotation.y);

      if (REDUCED) {
        turntable.rotation.y = target;   // 不做动画时直接到位，前缘即刻压在它身上
        spinAnim = null;
      } else {
        spinAnim = { from: turntable.rotation.y, to: target, t0: tNow, idx: i };
      }
      setFocusHud(i);
    },

    /* 回到全景态：解除锁定高亮、俯角归位、转盘交还给匀速自转、
       HUD 的 Scanning 交还给扫描光带自动轮询 */
    reset: function () {
      spinAnim = null;
      hovered = -1;
      pointer.set(-2, -2);
      pointerMoved = true;
      lastFocus = -1;                    // 下一张被扫到的牌会立刻接管 HUD
      elFName.style.color = '';
      applyElevation(ELEV_DEFAULT);
      clearTimeout(readoutTimer);
      elReadout.style.opacity = '0';
      if (renderer) renderer.domElement.style.cursor = 'default';
    },

    locate: locate,

    pause: function () {
      running = false;
      if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
    },

    resume: function () {
      if (running) return;
      running = true;
      clock.getDelta();                  // 丢掉挂起期间的时间差，粒子和呼吸不会跳一格
      animate();
    }
  });

})(typeof window !== 'undefined' ? window : this);
