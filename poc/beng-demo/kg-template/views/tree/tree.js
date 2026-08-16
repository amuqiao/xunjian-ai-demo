/**
 * tree.js —— 视图三 · 文档主题树（DOM + SVG 折线树）
 * ═══════════════════════════════════════════════════════════════════
 * 由 views/tree/_origin.html 改造而来。原稿里解决的几个具体问题原样保留：
 *   · 列宽按各层最长标签实测，不截断（参考图的毛病：右列全截成 "GB 3836.13…"）
 *   · 行距列距按可用空间自适应，字号恒定（切主题时字不变，但树始终铺满画布）
 *   · 折线肘形连线带圆角
 *   · 折叠角标显示这里藏了多少叶子
 *   · 悬停高亮从根到该节点的整条路径
 *   · 新节点从父节点位置生长出来，收起时缩回父节点
 * 参数一律不动。
 *
 * 与原稿的差异只有三处：
 *   1. 数据全部来自 KG.derive.*，节点 id 直接用 treeOf 返回的稳定 id
 *      （原稿的自增 uid 已删除——外部要靠这个 id 定位到具体节点）；
 *   2. 层级配色改由类型注册表 KG.derive.types[node.type].color 决定，
 *      尺寸表仍按 depth 循环取值，层数依旧不写死；
 *   3. 整体收进 #view-tree，避让 shell 的 rail(86) 与 topbar(62)。
 * ═══════════════════════════════════════════════════════════════════
 */
(function (global) {
  'use strict';

  var KG = global.KG;
  if (!KG || !KG.derive) throw new Error('[tree] KG.derive 未就绪：data/kg-derive.js 必须先于 views/tree/tree.js 引入');
  if (!KG.dom) throw new Error('[tree] KG.dom 未就绪：core/dom.js 必须先于 views/tree/tree.js 引入');

  const D = KG.derive;
  const dom = KG.dom;
  const UI = D.ui;
  const SVGNS = 'http://www.w3.org/2000/svg';

  /* ══════════════════════════════════════════════════════════════
     层级尺寸配置 —— 尺寸表现按这个数组循环取值，
     所以哪天变成六层七层也不会崩。
     颜色不在这里：节点的 type 已由数据层按 treeLevels 循环算好，
     直接用 KG.derive.types[type].color，与图例同源。
     ══════════════════════════════════════════════════════════════ */
  const SIZES = [
    { r: 11,  font: 15,   weight: 600 },
    { r: 8.5, font: 13.5, weight: 600 },
    { r: 7,   font: 12.5, weight: 500 },
    { r: 5.5, font: 12,   weight: 400 },
    { r: 5,   font: 11.5, weight: 400 }
  ];
  const LV = d => SIZES[d % SIZES.length];
  const colorOf = n => D.types[n.type].color;

  const LAYOUT = {
    rowGap   : 34,   // 行距下限（实际值按可用高度自适应，见 computeGaps）
    rowGapMax: 88,
    colGap   : 54,   // 列距下限（实际值按可用宽度自适应）
    colGapMax: 300,
    labelGap : 9,    // 圆点到文字的距离
    elbowR   : 9,    // 折线圆角半径
    padX     : 60,
    padY     : 40,
    headH    : 150,  // 顶部标题区遮住的高度，avail() 要扣掉
    headPad  : 125   // fit() 时树顶留出的位置
  };

  /* ── 伪 3D 小球的三个色阶 ─────────────────────────── */
  const LIT = [238, 245, 255], AMB = [6, 17, 31], RIM = [194, 216, 255];
  function sphereStyle(color, r) {
    const b = dom.rgbOf(color);
    const lit = dom.mix(b, LIT, .44), dark = dom.mix(b, AMB, .62), rim = dom.mix(b, RIM, .55);
    return `width:${r * 2}px;height:${r * 2}px;` +
      /* 受光点固定在左上，全场共用一个光源方向 */
      `background:radial-gradient(circle at 33% 28%, ${dom.css(lit)} 0%, ${dom.css(b)} 46%, ${dom.css(dark)} 100%);` +
      /* 外发光 + 暗侧边缘光（inset 偏右下）——深底上让球从背景里脱出来的关键 */
      `box-shadow:0 0 ${r * 1.5}px ${dom.css(b, .55)}, inset -${r * .28}px -${r * .28}px ${r * .4}px ${dom.css(rim, .5)};`;
  }

  /* ══ 树的准备：父指针、深度、折叠位 ═══════════════════
     id 直接用 treeOf 给的稳定 id，不再自增 —— 外部靠它定位节点 */
  const trees = {};   // catId → 根节点（带 _p/_d/_collapsed）
  const index = {};   // catId → Map(id → 节点)

  function treeFor(catId) {
    if (!trees[catId]) {
      const root = D.treeOf(catId);
      const map = new Map();
      (function prep(n, parent) {
        n._p = parent;
        n._d = n.depth;
        n._collapsed = false;
        map.set(n.id, n);
        if (n.children) n.children.forEach(c => prep(c, n));
      })(root, null);
      trees[catId] = root;
      index[catId] = map;
    }
    return trees[catId];
  }

  const countLeaves = n => (!n.children || !n.children.length) ? 1 : n.children.reduce((s, c) => s + countLeaves(c), 0);

  /* ── 文本测量：用离屏 canvas，不触发重排 ──────────── */
  const meas = document.createElement('canvas').getContext('2d');
  function textW(str, d) {
    const L = LV(d);
    meas.font = `${L.weight} ${L.font}px "PingFang SC","Microsoft YaHei",sans-serif`;
    return meas.measureText(str).width;
  }

  /* ══ 布局：列宽按各层最长标签实测，不截断 ═══════════
     参考图的毛病就出在这——右列标签全截成 "GB 3836.13..."，
     而左边一大片空白。列宽必须由内容决定。 */
  let visNodes = [], visLinks = [], colX = [], bbox = { w: 0, h: 0 };
  /* 行距列距不写死：按可用空间自适应，字号保持恒定。
     这样切换主题时文字大小不变，但树始终铺满画布——
     参考图的毛病之一就是树缩在中间、两侧大片空白 */
  const gap = { row: LAYOUT.rowGap, col: LAYOUT.colGap };

  function measureTree(root) {
    const byDepth = [];
    (function walk(n) {
      (byDepth[n._d] ||= []).push(n);
      if (n.children && !n._collapsed) n.children.forEach(walk);
    })(root);
    let contentW = 0;
    for (let d = 0; d < byDepth.length; d++) {
      let maxW = 0;
      for (const n of byDepth[d]) maxW = Math.max(maxW, textW(n.name, d));
      contentW += LV(d).r * 2 + LAYOUT.labelGap + maxW;
    }
    return { cols: byDepth.length, contentW, leaves: countLeaves(root) };
  }

  function computeGaps(root, availW, availH) {
    const m = measureTree(root);
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    gap.row = clamp(availH / Math.max(1, m.leaves - 1), LAYOUT.rowGap, LAYOUT.rowGapMax);
    gap.col = clamp((availW - m.contentW) / Math.max(1, m.cols - 1), LAYOUT.colGap, LAYOUT.colGapMax);
  }

  function layout(root) {
    // 1. 收集可见节点，按深度分组
    const byDepth = [];
    (function walk(n) {
      (byDepth[n._d] ||= []).push(n);
      if (n.children && !n._collapsed) n.children.forEach(walk);
    })(root);

    // 2. 每层最长标签 → 该层占用宽度
    colX = []; let x = 0;
    for (let d = 0; d < byDepth.length; d++) {
      colX[d] = x;
      const L = LV(d);
      let maxW = 0;
      for (const n of byDepth[d]) maxW = Math.max(maxW, textW(n.name, d));
      x += L.r * 2 + LAYOUT.labelGap + maxW + gap.col;
    }

    // 3. 叶子依次排开，父节点取子节点纵向中点
    let y = 0;
    (function place(n) {
      n._x = colX[n._d] + LV(n._d).r;
      if (!n.children || !n.children.length || n._collapsed) {
        n._y = y; y += gap.row;
      } else {
        n.children.forEach(place);
        n._y = (n.children[0]._y + n.children[n.children.length - 1]._y) / 2;
      }
    })(root);

    visNodes = []; visLinks = [];
    (function collect(n) {
      visNodes.push(n);
      if (n.children && !n._collapsed) n.children.forEach(c => { visLinks.push({ p: n, c }); collect(c); });
    })(root);

    // 4. 包围盒（含标签宽度）
    let maxX = 0, maxY = 0;
    for (const n of visNodes) {
      maxX = Math.max(maxX, n._x + LV(n._d).r + LAYOUT.labelGap + textW(n.name, n._d));
      maxY = Math.max(maxY, n._y);
    }
    bbox = { w: maxX, h: maxY };
  }

  /* ══ 运行时状态（全部收在闭包里，不上 window） ══════ */
  let root = null;                     // #view-tree
  let topicList, mTitle, mDesc, stage, world, svg, edgeG, nodeLayer, tip, legendBox;
  let card, cardTitle, cardPath, cardDesc, cardGo;

  let current = null;                  // 当前主题的树根节点
  let currentCatId = null;
  let focusedId = null;                // focus() 留下的持续高亮
  let relIds = new Set();              // highlight() 留下的"相关"标记
  let cardId = null;                   // 文档卡当前展示的节点 id
  const els = new Map();               // id → {el, dot, lab, node}
  const exiting = new Map();           // timerId → el（收起动画结束后要移除的节点）
  let glideTimer = 0;
  const view = { k: 1, x: 0, y: 0 };

  /* ══ 连线 ═══════════════════════════════════════════ */
  function elbow(p, c) {
    const px = p._x, py = p._y, cx = c._x, cy = c._y;
    if (Math.abs(cy - py) < 0.6) return `M${px},${py} L${cx},${cy}`;
    const midX = cx - (gap.col * 0.55);
    const dir = cy > py ? 1 : -1;
    const r = Math.min(LAYOUT.elbowR, Math.abs(cy - py) / 2, Math.abs(midX - px), Math.abs(cx - midX));
    return `M${px},${py} L${midX - r},${py} Q${midX},${py} ${midX},${py + r * dir}` +
           ` L${midX},${cy - r * dir} Q${midX},${cy} ${midX + r},${cy} L${cx},${cy}`;
  }

  /* ══ 渲染 ═══════════════════════════════════════════ */
  function render(animate = true) {
    layout(current);
    svg.setAttribute('width', bbox.w + LAYOUT.padX * 2);
    svg.setAttribute('height', bbox.h + LAYOUT.padY * 2);

    // ── 连线 ──
    edgeG.innerHTML = '';
    for (const l of visLinks) {
      const path = document.createElementNS(SVGNS, 'path');
      path.setAttribute('d', elbow(l.p, l.c));
      path.setAttribute('class', 'edge');
      path.dataset.to = l.c.id;
      edgeG.appendChild(path);
    }

    // ── 节点 ──
    const seen = new Set();
    for (const n of visNodes) {
      seen.add(n.id);
      let rec = els.get(n.id);
      const L = LV(n._d);
      if (!rec) {
        const el = document.createElement('div');
        el.className = 'node';
        el.dataset.id = n.id;
        const dot = document.createElement('span');
        dot.className = 'dot';
        const lab = document.createElement('span');
        lab.className = 'lab';
        el.append(dot, lab);
        // 新节点从父节点位置长出来
        const src = n._p && els.get(n._p.id) ? n._p : n;
        el.style.left = (src._x || n._x) + 'px';
        el.style.top = (src._y || n._y) + 'px';
        el.style.opacity = '0';
        nodeLayer.appendChild(el);
        rec = { el, dot, lab, node: n };
        els.set(n.id, rec);
        requestAnimationFrame(() => { el.style.transition = 'left .42s cubic-bezier(.22,.85,.3,1),top .42s cubic-bezier(.22,.85,.3,1),opacity .3s'; });
      }
      rec.node = n;
      rec.dot.style.cssText = sphereStyle(colorOf(n), L.r);
      rec.lab.textContent = n.name;
      rec.lab.style.cssText =
        `font-size:${L.font}px;font-weight:${L.weight};color:${n._d < 2 ? 'rgba(220,232,255,.95)' : 'rgba(178,202,238,.82)'};`;

      // 折叠角标：告诉用户这里还藏着多少
      let badge = rec.el.querySelector('.badge');
      if (n._collapsed && n.children) {
        if (!badge) { badge = document.createElement('span'); badge.className = 'badge'; rec.dot.appendChild(badge); }
        badge.textContent = countLeaves(n);
        rec.dot.style.boxShadow += `, 0 0 0 2px ${colorOf(n)}`;
      } else if (badge) badge.remove();

      // 跨视图带过来的两种标记，重渲染后要跟着节点走
      rec.el.classList.toggle('focused', n.id === focusedId);
      rec.el.classList.toggle('rel', relIds.has(n.id));

      if (!animate) { rec.el.style.transition = 'none'; }
      rec.el.style.left = n._x + 'px';
      rec.el.style.top = n._y + 'px';
      rec.el.style.opacity = '1';
      if (!animate) requestAnimationFrame(() => { rec.el.style.transition = ''; });
    }

    // ── 收起时消失的节点：缩回父节点再移除 ──
    for (const [id, rec] of els) {
      if (seen.has(id)) continue;
      const p = rec.node._p;
      if (p) { rec.el.style.left = p._x + 'px'; rec.el.style.top = p._y + 'px'; }
      rec.el.style.opacity = '0';
      els.delete(id);
      const el = rec.el;
      const t = setTimeout(() => { exiting.delete(t); el.remove(); }, 420);
      exiting.set(t, el);
    }
  }

  /* ══ 路径高亮：树里最有用的动作 ══════════════════════
     树的核心问题是"这个叶子是怎么来的"，
     高亮从根到它的整条路径正好回答这个 */
  function litPath(node) {
    const chain = new Set();
    for (let n = node; n; n = n._p) chain.add(n.id);
    const on = !!node;
    for (const [id, rec] of els) {
      rec.el.classList.toggle('lit', on && chain.has(id));
      rec.el.classList.toggle('dimmed', on && !chain.has(id));
    }
    edgeG.querySelectorAll('.edge').forEach(p => {
      const inChain = on && chain.has(p.dataset.to);
      p.classList.toggle('lit', inChain);
      p.classList.toggle('dimmed', on && !inChain);
      if (inChain) {
        const n = visNodes.find(v => v.id === p.dataset.to);
        p.setAttribute('stroke', n ? colorOf(n) : '');
      } else p.removeAttribute('stroke');
    });
  }

  /* ══ 视图：缩放 / 平移 / 自适应 ═════════════════════
     stage 已经是"扣掉 rail / topbar / 左栏之后"的那块矩形，
     所以 avail() 直接量它就是对的可用空间 */
  function applyView() { world.style.transform = `translate(${view.x}px,${view.y}px) scale(${view.k})`; }
  /* 底部的层级图例与操作提示是常驻的，可用高度必须先把它们让出来。
     不让的话树会一直铺到画布最底，最下面几个叶子正好压在提示文字上。 */
  const FOOT_H = 78;
  function avail() {
    const r = stage.getBoundingClientRect();
    return {
      w: r.width - LAYOUT.padX * 2,
      h: r.height - LAYOUT.headH - LAYOUT.padY - FOOT_H
    };
  }
  function fit() {
    const a = avail();
    view.k = Math.min(1.25, a.w / Math.max(bbox.w, 1), a.h / Math.max(bbox.h, 1));
    view.x = LAYOUT.padX;
    view.y = LAYOUT.headPad + Math.max(0, (a.h - bbox.h * view.k) / 2);
    applyView();
  }

  /* 平移到某个节点居中——focus() 的最后一步 */
  function glide() {
    world.classList.add('glide');
    if (glideTimer) clearTimeout(glideTimer);
    glideTimer = setTimeout(() => { glideTimer = 0; world.classList.remove('glide'); }, 560);
  }
  function centerOn(n) {
    const r = stage.getBoundingClientRect();
    view.x = r.width / 2 - n._x * view.k;
    view.y = (LAYOUT.headH + r.height) / 2 - n._y * view.k;
    glide();
    applyView();
  }

  /* ══ 文档详情卡 ═════════════════════════════════════
     叶子没有子节点，点击不该是"折叠"这种空动作，改成开卡片 */
  function openCard(n) {
    cardId = n.id;
    cardTitle.textContent = n.name;
    cardPath.textContent = D.pathOf(n.id).map(p => p.label).join('  /  ');
    if (n.desc) { cardDesc.textContent = n.desc; cardDesc.hidden = false; }
    else { cardDesc.textContent = ''; cardDesc.hidden = true; }
    cardGo.style.setProperty('--tv-card-accent', colorOf(n));

    focusedId = n.id;
    for (const [id, rec] of els) rec.el.classList.toggle('focused', id === focusedId);

    card.hidden = false;
    const box = els.get(n.id).el.getBoundingClientRect();
    const w = card.offsetWidth, h = card.offsetHeight;
    let x = box.right + 18;
    if (x + w > innerWidth - 16) x = box.left - w - 18;
    if (x < 16) x = 16;
    let y = box.top + box.height / 2 - h / 2;
    y = Math.max(16, Math.min(innerHeight - h - 16, y));
    card.style.left = x + 'px';
    card.style.top = y + 'px';
    card.classList.add('on');
  }
  function closeCard() {
    if (!cardId) return;
    cardId = null;
    card.classList.remove('on');
    card.hidden = true;
  }

  /* ══ 左栏主题切换 ═══════════════════════════════════ */
  function selectTopic(catId) {
    const cat = D.get(catId);
    if (!cat) throw new Error('[tree] selectTopic 收到未知类目 id：' + catId);
    currentCatId = catId;
    current = treeFor(catId);

    Array.prototype.forEach.call(topicList.children, el => el.classList.toggle('on', el.dataset.cat === catId));
    mTitle.textContent = cat.label;
    mDesc.textContent = cat.desc || '';

    // 切主题时全部展开，回到默认态
    (function reset(n) { n._collapsed = false; (n.children || []).forEach(reset); })(current);

    const a = avail(); computeGaps(current, a.w, a.h);
    // 旧树整批移除
    for (const [id, rec] of els) { rec.el.remove(); els.delete(id); }
    render(false);
    fit();
  }

  /* ══ 挂载 ═══════════════════════════════════════════ */
  function mount(el) {
    root = el;
    root.innerHTML =
      '<aside class="tv-side">' +
        '<div class="side-head">' +
          '<div class="eyebrow">' + UI.tree.eyebrow + '</div>' +
          '<h1>' + UI.tree.title + '</h1>' +
          '<div class="cnt"></div>' +
        '</div>' +
        '<div class="topics"></div>' +
      '</aside>' +
      '<div class="tv-main">' +
        '<div class="main-head"><h2></h2><p></p></div>' +
        '<div class="stage">' +
          '<div class="world"><svg class="edges"><g></g></svg><div class="node-layer"></div></div>' +
        '</div>' +
        '<div class="legend"><div class="lbl">层级</div><div class="legend-items"></div></div>' +
        '<div class="hint">' + UI.tree.hintHtml + '</div>' +
      '</div>' +
      '<div class="tip"></div>' +
      '<div class="doccard" hidden>' +
        '<button class="dc-x" type="button" aria-label="关闭">&times;</button>' +
        '<div class="dc-path"></div>' +
        '<h3 class="dc-title"></h3>' +
        '<p class="dc-desc"></p>' +
        '<button class="dc-go" type="button">' + UI.tree.jumpToGraph + '</button>' +
      '</div>';

    topicList  = dom.$('.topics', root);
    mTitle     = dom.$('.main-head h2', root);
    mDesc      = dom.$('.main-head p', root);
    stage      = dom.$('.stage', root);
    world      = dom.$('.world', root);
    svg        = dom.$('.edges', root);
    edgeG      = dom.$('.edges g', root);
    nodeLayer  = dom.$('.node-layer', root);
    tip        = dom.$('.tip', root);
    legendBox  = dom.$('.legend-items', root);
    card       = dom.$('.doccard', root);
    cardTitle  = dom.$('.dc-title', card);
    cardPath   = dom.$('.dc-path', card);
    cardDesc   = dom.$('.dc-desc', card);
    cardGo     = dom.$('.dc-go', card);

    /* ── 左栏列表 ── */
    const cats = D.categories;
    cats.forEach((cat, i) => {
      const item = dom.el('div', 'topic',
        `<span class="no">${String(i + 1).padStart(2, '0')}</span>` +
        `<span class="nm">${cat.label}</span>` +
        `<span class="qty">${D.sampleCount(cat.id)}</span>`);
      /* 左栏用 data-cat：树里的类目根节点已经占了 data-id="<catId>"，
         同一个 id 出现在两处会让外部按 [data-id] 找节点时选中左栏条目 */
      item.dataset.cat = cat.id;
      item.addEventListener('click', () => {
        closeCard();
        focusedId = null;
        relIds = new Set();
        selectTopic(cat.id);
      });
      topicList.appendChild(item);
    });
    dom.$('.side-head .cnt', root).textContent =
      `${cats.length} ${UI.tree.topicUnit} · ${cats.reduce((s, c) => s + D.sampleCount(c.id), 0)} ${D.text.docUnitLong}`;

    /* ── 图例：层数不写死，按数据里实际出现的深度生成，
           名称与颜色都取自类型注册表 ── */
    const typeAtDepth = [];
    cats.forEach(c => {
      (function walk(n) {
        if (typeAtDepth[n._d] === undefined) typeAtDepth[n._d] = n.type;
        (n.children || []).forEach(walk);
      })(treeFor(c.id));
    });
    typeAtDepth.forEach((type, d) => {
      const t = D.types[type];
      legendBox.appendChild(dom.el('div', 'lg',
        `<i style="${sphereStyle(t.color, 5.5)}"></i><span>${t.label}</span>`));
    });

    bindStage();
    bindNodes();
    bindCard();
    global.addEventListener('resize', onResize);
  }

  function onResize() {
    if (!current) return;
    const a = avail();
    computeGaps(current, a.w, a.h);
    render(false);
    fit();
    closeCard();
  }

  /* ══ 缩放 / 平移 ════════════════════════════════════ */
  function bindStage() {
    let panning = false, sx = 0, sy = 0;
    stage.addEventListener('pointerdown', e => {
      if (e.target.closest('.node')) return;
      closeCard();
      panning = true; sx = e.clientX - view.x; sy = e.clientY - view.y;
      stage.classList.add('drag'); stage.setPointerCapture(e.pointerId);
    });
    stage.addEventListener('pointermove', e => {
      if (!panning) return;
      view.x = e.clientX - sx; view.y = e.clientY - sy; applyView();
    });
    stage.addEventListener('pointerup', () => { panning = false; stage.classList.remove('drag'); });
    stage.addEventListener('dblclick', e => { if (!e.target.closest('.node')) fit(); });
    stage.addEventListener('wheel', e => {
      e.preventDefault();
      const r = stage.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      const gx = (mx - view.x) / view.k, gy = (my - view.y) / view.k;
      view.k = Math.max(.28, Math.min(2.4, view.k * Math.pow(0.999, e.deltaY)));
      view.x = mx - gx * view.k; view.y = my - gy * view.k;
      applyView();
    }, { passive: false });
  }

  /* ══ 节点交互 ═══════════════════════════════════════ */
  function bindNodes() {
    nodeLayer.addEventListener('pointerover', e => {
      const el = e.target.closest('.node'); if (!el) return;
      const rec = els.get(el.dataset.id); if (!rec) return;
      litPath(rec.node);
      // 浮层：完整名称 + 所属路径
      const chain = []; for (let n = rec.node._p; n; n = n._p) chain.unshift(n.name);
      tip.innerHTML = (chain.length ? `<span class="path">${chain.join(' / ')}</span>` : '') + rec.node.name;
      tip.classList.add('on');
    });
    nodeLayer.addEventListener('pointermove', e => {
      if (!tip.classList.contains('on')) return;
      const w = tip.offsetWidth, h = tip.offsetHeight;
      tip.style.left = Math.min(innerWidth - w - 14, e.clientX + 16) + 'px';
      tip.style.top = Math.max(8, e.clientY - h - 14) + 'px';
    });
    nodeLayer.addEventListener('pointerout', e => {
      if (e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('.node')) return;
      litPath(null); tip.classList.remove('on');
    });
    nodeLayer.addEventListener('click', e => {
      const el = e.target.closest('.node'); if (!el) return;
      const rec = els.get(el.dataset.id); if (!rec) return;
      const n = rec.node;
      // 有子节点 → 折叠/展开（原稿行为）；叶子 → 开文档详情卡
      if (!n.children || !n.children.length) { openCard(n); return; }
      closeCard();
      n._collapsed = !n._collapsed;
      litPath(null);
      render(true);
    });
  }

  function bindCard() {
    dom.$('.dc-x', card).addEventListener('click', closeCard);
    cardGo.addEventListener('click', () => {
      const id = cardId;
      closeCard();
      KG.bus.emit('node:open', { id: id, view: 'tree', from: locate(id) });
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeCard(); });
  }

  /* ══════════════════════════════════════════════════════════════
     契约实现
     ══════════════════════════════════════════════════════════════ */
  function activate(opts) {
    const focusId = opts && opts.focusId;
    if (focusId) { focus(focusId); return; }
    if (!currentCatId) selectTopic(D.categories[0].id);
  }

  function deactivate() {
    closeCard();
    litPath(null);
    tip.classList.remove('on');
  }

  /* focus：id 可能落在任意层级。
     切主题 → 展开整条路径 → 平移居中 → 留下持续高亮。 */
  function focus(id) {
    const cat = D.categoryOf(id);
    if (!cat) throw new Error('[tree] 树视图只能聚焦类目树内的节点，「' + id + '」不属于任何类目');

    closeCard();
    relIds = new Set();                       // 上一次的"相关"标记不跨焦点保留
    focusedId = id;

    if (currentCatId !== cat.id) selectTopic(cat.id);

    const map = index[cat.id];
    const chain = D.pathOf(id);
    let changed = false;
    chain.forEach(p => {
      const tn = map.get(p.id);
      if (!tn) throw new Error('[tree] 路径节点不在树里：' + p.id);
      if (tn._collapsed) { tn._collapsed = false; changed = true; }
    });
    render(changed);

    const target = map.get(id);
    if (!target) throw new Error('[tree] 未知节点：' + id);

    /* 类目根节点长在树的最左端，把它"居中"等于把整棵树推出屏幕右侧——
       从展台点立牌进来正好命中这种情况，一进来就看不全。
       聚焦到整棵树本身时应该是全景，只有聚焦到具体的深层节点才需要居中。 */
    if (id === cat.id) fit();
    else centerOn(target);
  }

  /* locate：直接量真实 DOM，转场要的就是"它现在在屏幕的哪里"。
     节点被折叠隐藏（或不属于当前主题）时 els 里没有它 → null。 */
  function locate(id) {
    const rec = els.get(id);
    if (!rec) return null;
    const r = rec.el.getBoundingClientRect();
    return {
      x: r.left, y: r.top, w: r.width, h: r.height,
      color: colorOf(rec.node), label: rec.node.name
    };
  }

  /* reset：回到**当前主题**的全景态。
     不是切回第一个主题——用户在看运维知识时点重置，应该还留在运维知识。 */
  function reset() {
    if (!current) throw new Error('[tree] reset() 在选中主题之前被调用');
    closeCard();
    litPath(null);
    tip.classList.remove('on');
    focusedId = null;
    relIds = new Set();
    (function expand(n) { n._collapsed = false; (n.children || []).forEach(expand); })(current);
    const a = avail();
    computeGaps(current, a.w, a.h);
    render(true);
    glide();
    fit();
  }

  /* 树没有 rAF 循环，挂起 CSS 过渡 + 结清所有定时器即可 */
  function pause() {
    root.classList.add('is-paused');
    for (const [t, el] of exiting) { clearTimeout(t); el.remove(); }
    exiting.clear();
    if (glideTimer) { clearTimeout(glideTimer); glideTimer = 0; world.classList.remove('glide'); }
  }
  function resume() { root.classList.remove('is-paused'); }

  /* 契约外的附加能力：给一组节点加"相关"脉冲光圈。
     上层从实体标签切过来时，用它标出该标签关联的文档。 */
  function highlight(ids) {
    relIds = new Set(ids || []);
    for (const [id, rec] of els) rec.el.classList.toggle('rel', relIds.has(id));
  }

  KG.views.define('tree', {
    el: '#view-tree',
    mount: mount,
    activate: activate,
    deactivate: deactivate,
    focus: focus,
    locate: locate,
    reset: reset,
    pause: pause,
    resume: resume,
    highlight: highlight
  });

})(typeof window !== 'undefined' ? window : this);
