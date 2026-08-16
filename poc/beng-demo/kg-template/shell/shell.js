/**
 * shell.js —— 外壳：顶栏 / 功能卡片侧栏 / 全局检索浮层 / 说明浮层 / 降级提示条
 * ═══════════════════════════════════════════════════════════════════
 * 职责边界（写新功能前先读这一段）：
 *   · 顶栏回答「我在看哪个视图 + 当前聚焦在哪」——视图切换 + 焦点面包屑；
 *   · 左侧 rail 是与视图无关的全局能力——检索 / 说明 / 重置 / 回溯；
 *   · shell 不认识任何一个视图的内部实现，只通过 KG.router / KG.bus / KG.ctx 说话。
 *
 * 关于「全局检索」：旧版把"文档搜索"和"图谱搜索"做成两个入口，逼用户先决定
 * 要搜什么，再开始搜。这里合并成一个入口，结果按类型分组，**由节点类型决定落到
 * 哪个视图**（见 KG.derive.viewOfType），再交给 KG.derive.resolveView 做降级解析。
 *
 * 硬约束：
 *   1. 整个实现包在 IIFE 里，只往 window 写 KG.shell。
 *   2. 不写任何 fallback / silent catch / 默认值吞错。数据缺字段就让它当场炸。
 *   3. init() 由 app.js 调用，脚本加载时不自动执行——启动顺序归 app.js 管。
 * ═══════════════════════════════════════════════════════════════════
 */
(function (global) {
  'use strict';

  var KG = global.KG = global.KG || {};
  var D = KG.dom;
  var UI = KG.derive.ui;

  /* ── 三个视图在顶栏上的呈现。key 必须和 KG.views.define 的名字一致 ── */
  var VIEW_TABS = UI.views;
  var VIEW_LABEL = {};
  VIEW_TABS.forEach(function (v) { VIEW_LABEL[v.key] = v.label; });

  var ICONS = {
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">' +
            '<circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>',
    intro:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true">' +
            '<path d="M6 2h9l5 5v15H6z"></path><path d="M15 2v5h5"></path>' +
            '<line x1="9" y1="13" x2="15" y2="13"></line><line x1="9" y1="17" x2="15" y2="17"></line></svg>',
    reset:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">' +
            '<circle cx="12" cy="12" r="7"></circle><circle cx="12" cy="12" r="1.6"></circle>' +
            '<line x1="12" y1="1.5" x2="12" y2="5"></line><line x1="12" y1="19" x2="12" y2="22.5"></line>' +
            '<line x1="1.5" y1="12" x2="5" y2="12"></line><line x1="19" y1="12" x2="22.5" y2="12"></line></svg>',
    back:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
            '<path d="M3 8h11a6 6 0 0 1 0 12H8"></path><polyline points="7 4 3 8 7 12"></polyline></svg>'
  };

  /* ── 运行期状态（全部收在闭包里） ── */
  var booted = false;
  var currentView = null;
  var currentFocus = null;

  var elTopbar, elOverlays;
  var elViewBtns = {};          // view key → button
  var elCrumb;
  var elSearchWrap, elSearchInput, elSearchBody;
  var elIntroWrap;
  var elTip, tipTimer = null;

  var hitIds = [];              // 当前检索结果的扁平 id 列表，供 ↑↓ 用
  var activeIdx = -1;

  /* ═══ 工具 ═══════════════════════════════════════════════════ */

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function fill(s, data) {
    return String(s).replace(/\{([a-zA-Z0-9_]+)\}/g, function (_, key) {
      if (!Object.prototype.hasOwnProperty.call(data, key)) {
        throw new Error('[shell] 文案模板缺少变量：' + key + '（' + s + '）');
      }
      return data[key];
    });
  }

  /* 命中关键词高亮。关键词只在 label 上标——search() 也匹配 en / code，
     那两种命中不在 label 里，不标即可，不需要额外兜底。 */
  function mark(label, kw) {
    if (!kw) return esc(label);
    var lower = label.toLowerCase();
    var i = lower.indexOf(kw.toLowerCase());
    if (i < 0) return esc(label);
    return esc(label.slice(0, i)) +
      '<em>' + esc(label.slice(i, i + kw.length)) + '</em>' +
      esc(label.slice(i + kw.length));
  }

  /* ═══ 导航 ═══════════════════════════════════════════════════ */

  /* 顶栏、面包屑、检索结果统一走这里：只改路由，视图激活归 app.js。 */
  function go(view, focusId) {
    KG.router.go(view, focusId);
  }

  /* 检索结果 / 推荐项被打开时的落点解析 */
  function openNode(id) {
    var node = KG.derive.get(id);
    if (!node) throw new Error('[shell] 检索结果指向不存在的节点：' + id);

    var target = KG.derive.viewOfType(node.type);

    var r = KG.derive.resolveView(id, target);
    closeSearch();
    go(r.view, r.focusId);
    if (r.note) showTip(r.note);
  }

  /* ═══ 一、顶栏 ═══════════════════════════════════════════════ */

  function buildTopbar() {
    var meta = KG.derive.meta;

    var brand = D.el('div', 'kg-brand',
      '<h1 class="kg-brand-name">' + esc(meta.title) + '</h1>' +
      '<span class="kg-brand-en">' + esc(meta.hub.en) + '</span>');

    var nav = D.el('nav', 'kg-viewnav');
    nav.setAttribute('aria-label', '视图切换');
    VIEW_TABS.forEach(function (t) {
      var b = D.el('button', 'kg-viewbtn',
        esc(t.label) + '<span class="kg-viewbtn-en">' + t.en + '</span>');
      b.type = 'button';
      b.dataset.view = t.key;
      /* 带上当前焦点跳转：跨视图切换时保住上下文，而不是回到总览 */
      b.addEventListener('click', function () { go(t.key, currentFocus); });
      elViewBtns[t.key] = b;
      nav.appendChild(b);
    });

    elCrumb = D.el('div', 'kg-crumb');
    elCrumb.setAttribute('aria-label', '当前焦点路径');

    /* 搜索入口和面包屑同属"导航"语义，编在顶栏右区成一组：
       面包屑回答"我现在在哪"，搜索回答"我要去哪"。
       中间那组是视图切换，搜索放进去会被读成第四个视图，所以不放那儿。
       这里只做入口不做输入框——真正的输入在浮层里，
       顺带把快捷键印在按钮上，第一次用的人不用去猜。 */
    var mac = /Mac|iPhone|iPad|iPod/.test(navigator.platform);
    var searchBtn = D.el('button', 'kg-searchbtn',
      ICONS.search +
      '<span class="kg-searchbtn-t">搜索</span>' +
      '<span class="kg-searchbtn-k">' + (mac ? '⌘K' : 'Ctrl K') + '</span>');
    searchBtn.type = 'button';
    searchBtn.title = UI.search.title + '（' + (mac ? '⌘K' : 'Ctrl+K') + '）：' + UI.search.scope;
    searchBtn.addEventListener('click', function () { openSearch(); });

    var right = D.el('div', 'kg-topright');
    right.appendChild(searchBtn);
    right.appendChild(elCrumb);

    elTopbar.appendChild(brand);
    elTopbar.appendChild(nav);
    elTopbar.appendChild(right);
  }

  function renderViewTabs() {
    VIEW_TABS.forEach(function (t) {
      elViewBtns[t.key].classList.toggle('is-on', t.key === currentView);
    });
  }

  /* 面包屑：知识中枢 / 客户案例 / 金融行业 / 银行 / 某股份行知识中台
     每一段都能点，点了就在**当前视图**里换焦点。 */
  function renderCrumb() {
    elCrumb.innerHTML = '';
    elCrumb.appendChild(D.el('span', 'kg-crumb-k', 'FOCUS'));

    if (!currentFocus) {
      elCrumb.appendChild(D.el('span', 'kg-crumb-empty', '全景总览'));
      return;
    }

    var hub = KG.derive.hub;
    var segs = [hub].concat(KG.derive.pathOf(currentFocus));

    segs.forEach(function (n, i) {
      if (i > 0) elCrumb.appendChild(D.el('span', 'kg-crumb-sep', '/'));
      var last = i === segs.length - 1;
      var b = D.el('button', 'kg-crumb-seg' + (last ? ' is-last' : ''), esc(n.label));
      b.type = 'button';
      b.title = n.label;
      if (!last) b.addEventListener('click', function () { go(currentView, n.id); });
      elCrumb.appendChild(b);
    });
  }

  /* ═══ 二、全局检索浮层 ═══════════════════════════════════════
     没有常驻按钮：视图切换由顶栏承担，检索走 ⌘K / Ctrl+K。
     说明浮层与重置视野保留为可编程入口（KG.shell.openIntro() /
     KG.bus.emit('view:reset')），不占画面。 */

  function buildSearch() {
    elSearchWrap = D.el('div', 'kg-overlay kg-overlay--search');

    var mask = D.el('div', 'kg-mask');
    mask.addEventListener('click', closeSearch);

    var modal = D.el('div', 'kg-modal');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', UI.search.title);

    var head = D.el('div', 'kg-searchhead', ICONS.search);
    elSearchInput = D.el('input', 'kg-searchinput');
    elSearchInput.type = 'text';
    elSearchInput.placeholder = UI.search.placeholder;
    elSearchInput.setAttribute('autocomplete', 'off');
    elSearchInput.setAttribute('spellcheck', 'false');
    elSearchInput.addEventListener('input', renderResults);
    head.appendChild(elSearchInput);
    head.appendChild(D.el('span', 'kg-kbd', 'ESC'));

    elSearchBody = D.el('div', 'kg-searchbody kg-scroll');
    D.on(elSearchBody, 'click', '.kg-hit', function (e, hit) { openNode(hit.dataset.id); });

    var foot = D.el('div', 'kg-searchfoot',
      '<span>↑↓ 选择</span><span>ENTER 打开</span><span>ESC 关闭</span>');

    modal.appendChild(head);
    modal.appendChild(elSearchBody);
    modal.appendChild(foot);
    elSearchWrap.appendChild(mask);
    elSearchWrap.appendChild(modal);
    elOverlays.appendChild(elSearchWrap);
  }

  function hitRow(h, kw) {
    var to = KG.derive.viewOfType(h.type);
    var row = D.el('div', 'kg-hit',
      '<span class="kg-hit-dot" style="background:' + h.color + ';box-shadow:0 0 9px ' + h.color + '"></span>' +
      '<span class="kg-hit-label">' + mark(h.label, kw) + '</span>' +
      '<span class="kg-hit-path">' + esc(h.path) + '</span>' +
      '<span class="kg-hit-to">' + VIEW_LABEL[to] + '</span>');
    row.dataset.id = h.id;
    row.setAttribute('role', 'option');
    return row;
  }

  function renderGroups(groups, kw) {
    elSearchBody.innerHTML = '';
    hitIds = [];

    groups.forEach(function (g) {
      var box = D.el('div', 'kg-group');
      box.appendChild(D.el('div', 'kg-group-title',
        '<span>' + esc(g.label) + '</span><span class="kg-group-n">' + g.hits.length + '</span>'));
      g.hits.forEach(function (h) {
        box.appendChild(hitRow(h, kw));
        hitIds.push(h.id);
      });
      elSearchBody.appendChild(box);
    });

    setActive(hitIds.length ? 0 : -1);
  }

  /* 空查询的「试试这些」：各类目名 + 三个实体标签。
     推荐项本身就是节点，点开走的是和检索结果完全一样的落点规则。 */
  function suggestions() {
    var cats = KG.derive.categories.map(function (n) {
      return { id: n.id, label: n.label, type: n.type, path: '', color: n.color };
    });
    var ents = KG.derive.entities.slice(0, 3).map(function (n) {
      return { id: n.id, label: n.label, type: n.type, path: '', color: n.color };
    });
    return [
      { key: 'sug-cat', label: UI.search.suggestionsCategory, hits: cats },
      { key: 'sug-ent', label: UI.search.suggestionsEntity,   hits: ents }
    ];
  }

  function renderResults() {
    var q = elSearchInput.value.trim();
    if (!q) { renderGroups(suggestions(), ''); return; }

    /* 分组顺序由 KG.derive.search 决定，shell 不重排、不写死分组 */
    var groups = KG.derive.search(q);
    if (!groups.length) {
      elSearchBody.innerHTML = '';
      hitIds = [];
      activeIdx = -1;
      elSearchBody.appendChild(D.el('div', 'kg-empty', esc(fill(UI.search.noMatch, { query: q }))));
      return;
    }
    renderGroups(groups, q);
  }

  function setActive(i) {
    activeIdx = i;
    D.$$('.kg-hit', elSearchBody).forEach(function (el, idx) {
      var on = idx === i;
      el.classList.toggle('is-active', on);
      if (on) el.scrollIntoView({ block: 'nearest' });
    });
  }

  function move(step) {
    if (!hitIds.length) return;
    setActive((activeIdx + step + hitIds.length) % hitIds.length);
  }

  function searchOpen() { return elSearchWrap.classList.contains('is-open'); }

  function openSearch() {
    closeIntro();
    elSearchWrap.classList.add('is-open');
    elSearchInput.value = '';
    renderResults();
    elSearchInput.focus();
  }

  function closeSearch() {
    elSearchWrap.classList.remove('is-open');
  }

  /* ═══ 四、图谱说明浮层 ═══════════════════════════════════════ */

  function buildIntro() {
    elIntroWrap = D.el('div', 'kg-overlay kg-overlay--intro');

    var mask = D.el('div', 'kg-mask');
    mask.addEventListener('click', closeIntro);

    var modal = D.el('div', 'kg-modal');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', UI.intro.titleSuffix);

    var close = D.el('button', 'kg-close', '✕');
    close.type = 'button';
    close.setAttribute('aria-label', '关闭');
    close.addEventListener('click', closeIntro);

    modal.appendChild(close);
    modal.appendChild(introHead());
    modal.appendChild(introBody());

    elIntroWrap.appendChild(mask);
    elIntroWrap.appendChild(modal);
    elOverlays.appendChild(elIntroWrap);
  }

  function introHead() {
    var meta = KG.derive.meta;
    return D.el('div', 'kg-introhead',
      '<div class="kg-eyebrow">' + esc(meta.hub.en) + '</div>' +
      '<h2>' + esc(meta.title) + ' · ' + esc(UI.intro.titleSuffix) + '</h2>' +
      '<p>' + esc(meta.hub.desc) + '</p>');
  }

  function introBody() {
    var s = KG.derive.stats();
    var body = D.el('div', 'kg-introbody kg-scroll');

    /* 1. 三个视图各自回答什么问题（数值全部派生，不写死） */
    var roles = [
      { k: VIEW_LABEL.stage, q: UI.intro.stageQuestion,
        d: fill(UI.intro.stageDesc, { categories: KG.derive.categories.length }) },
      { k: VIEW_LABEL.graph, q: UI.intro.graphQuestion,
        d: fill(UI.intro.graphDesc, { entities: KG.derive.entities.length, edges: KG.derive.format(s.edges) }) },
      { k: VIEW_LABEL.tree, q: UI.intro.treeQuestion,
        d: fill(UI.intro.treeDesc, { samples: KG.derive.format(s.sampleTotal) }) }
    ];
    var secRole = section(UI.intro.rolesTitle);
    roles.forEach(function (r) {
      secRole.appendChild(D.el('div', 'kg-role',
        '<span class="kg-role-k">' + esc(r.k) + '</span>' +
        '<span class="kg-role-q">' + esc(r.q) + '</span>' +
        '<span class="kg-role-d">' + esc(r.d) + '</span>'));
    });
    body.appendChild(secRole);

    /* 2. 层级定义：遍历类型注册表 */
    var secType = section(UI.intro.typeTitle);
    var grid = D.el('div', 'kg-typegrid');
    var types = KG.derive.types;
    Object.keys(types).forEach(function (key) {
      var t = types[key];
      var n = s.byType[key] === undefined ? 0 : s.byType[key];
      grid.appendChild(D.el('div', 'kg-typerow',
        '<span class="kg-swatch" style="background:' + t.color + ';box-shadow:0 0 10px ' + t.color + '"></span>' +
        '<span class="kg-typelabel">' + esc(t.label) + '</span>' +
        '<span class="kg-typekey">' + esc(key) + '</span>' +
        '<span class="kg-typen">' + KG.derive.format(n) + '</span>'));
    });
    secType.appendChild(grid);
    body.appendChild(secType);

    /* 3. 数据规模 */
    var secStat = section(UI.intro.statsTitle);
    var sg = D.el('div', 'kg-statgrid');
    UI.intro.stats.forEach(function (c) {
      if (!Object.prototype.hasOwnProperty.call(s, c.value)) {
        throw new Error('[shell] intro.stats 引用了不存在的统计字段：' + c.value);
      }
      sg.appendChild(D.el('div', 'kg-statcell',
        '<div class="kg-sk">' + c.key + '</div>' +
        '<div class="kg-sv">' + KG.derive.format(s[c.value]) + '</div>'));
    });
    secStat.appendChild(sg);
    body.appendChild(secStat);

    /* 4. 关系类型：遍历关系注册表，major 的用高亮色条 */
    var secRel = section(UI.intro.relationTitle);
    var rels = D.el('div', 'kg-rels');
    var relTypes = KG.derive.relTypes;
    Object.keys(relTypes).forEach(function (key) {
      var r = relTypes[key];
      rels.appendChild(D.el('div', 'kg-rel' + (r.major ? ' is-major' : ''),
        '<span class="kg-relbar"></span>' +
        '<span>' + esc(r.label) + '</span>' +
        '<span class="kg-relkey">' + esc(key) + '</span>'));
    });
    secRel.appendChild(rels);
    body.appendChild(secRel);

    /* 5. 接入指南 */
    var secGuide = section(UI.intro.guideTitle);
    secGuide.appendChild(D.el('div', 'kg-guide', UI.intro.guideHtml));
    var btn = D.el('button', 'kg-guide-btn', '在控制台打印体检结果');
    btn.type = 'button';
    btn.addEventListener('click', function () {
      var v = KG.derive.validate();
      console.log('%c[KG] validate()', 'color:#38C6EC;font-weight:600', v);
      v.errors.forEach(function (m) { console.error('[KG][error] ' + m); });
      v.warnings.forEach(function (m) { console.warn('[KG][warn] ' + m); });
    });
    secGuide.appendChild(btn);
    body.appendChild(secGuide);

    return body;
  }

  function section(title) {
    var sec = D.el('section', 'kg-sec');
    sec.appendChild(D.el('div', 'kg-sec-title', '<span>' + esc(title) + '</span>'));
    return sec;
  }

  function introOpen() { return elIntroWrap.classList.contains('is-open'); }
  function openIntro() { closeSearch(); elIntroWrap.classList.add('is-open'); }
  function closeIntro() { elIntroWrap.classList.remove('is-open'); }

  /* ═══ 五、降级提示条 ═══════════════════════════════════════════
     跨视图跳转时告诉用户"为什么落到了这里"。两个来源：
       · 检索落点解析出的 resolveView().note（openNode 里直接调）
       · KG.bus 的 view:changed 带回来的 note（app.js 触发的跳转） */

  function buildTip() {
    elTip = D.el('div', 'kg-tip',
      '<span class="kg-tip-mark" aria-hidden="true"></span>' +
      '<span class="kg-tip-text"></span>');
    elTip.setAttribute('role', 'status');
    var close = D.el('button', 'kg-tip-close', '✕');
    close.type = 'button';
    close.setAttribute('aria-label', '关闭提示');
    close.addEventListener('click', hideTip);
    elTip.appendChild(close);
    elOverlays.appendChild(elTip);
  }

  function showTip(text) {
    D.$('.kg-tip-text', elTip).textContent = text;
    elTip.classList.add('is-on');
    if (tipTimer) clearTimeout(tipTimer);
    tipTimer = setTimeout(hideTip, 3500);
  }

  function hideTip() {
    if (tipTimer) { clearTimeout(tipTimer); tipTimer = null; }
    elTip.classList.remove('is-on');
  }

  /* ═══ 六、事件与快捷键 ═══════════════════════════════════════ */

  function bindBus() {
    /* 跨视图切换：视图高亮、面包屑、回溯可用态、降级提示一起更新 */
    KG.bus.on('view:changed', function (p) {
      currentView = p.view;
      currentFocus = p.focusId;
      renderViewTabs();
      renderCrumb();
      if (p.note) showTip(p.note);
    });

    /* 同一视图内换焦点：只有面包屑需要跟着走 */
    KG.bus.on('focus:changed', function (p) {
      currentView = p.view;
      currentFocus = p.focusId;
      renderCrumb();
    });

    /* 视图内部也能拉起这两个浮层（见 core/bus.js 的约定事件） */
    KG.bus.on('search:open', function () { openSearch(); });
    KG.bus.on('intro:open', function () { openIntro(); });
  }

  function bindKeys() {
    document.addEventListener('keydown', function (e) {
      /* ⌘K / Ctrl+K 开检索 */
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        openSearch();
        return;
      }

      if (e.key === 'Escape') {
        if (searchOpen()) {
          /* 输入框里有内容时，Esc 先清空；再按一次才关浮层 */
          if (elSearchInput.value) {
            elSearchInput.value = '';
            renderResults();
            elSearchInput.focus();
          } else {
            closeSearch();
          }
          e.preventDefault();
          return;
        }
        if (introOpen()) { closeIntro(); e.preventDefault(); }
        return;
      }

      if (!searchOpen()) return;

      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Enter') {
        if (activeIdx < 0) return;
        e.preventDefault();
        openNode(hitIds[activeIdx]);
      }
    });
  }

  /* ═══ 七、启动 ═══════════════════════════════════════════════ */

  function init() {
    if (booted) throw new Error('[shell] init() 被重复调用，启动顺序由 app.js 唯一控制');

    elTopbar = D.$('#topbar');
    elOverlays = D.$('#overlays');
    if (!elTopbar || !elOverlays) {
      throw new Error('[shell] 缺少挂载点：#topbar / #overlays 必须都在 index.html 里');
    }

    buildTopbar();
    buildSearch();
    buildIntro();
    buildTip();

    renderViewTabs();
    renderCrumb();
    bindBus();
    bindKeys();

    booted = true;
    return KG.shell;
  }

  KG.shell = {
    init: init,
    openSearch: openSearch,
    openIntro: openIntro,
    showTip: showTip
  };

})(typeof window !== 'undefined' ? window : this);
