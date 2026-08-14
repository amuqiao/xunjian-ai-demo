/*
 * stage/layers-ground.js —— 构建展台 L0 背景 / L1 刻度环 / L2 领域球 / L3 全息投影
 *
 * 挂载：window.KG.layersGround = { build(root), buildBackdrop(bgRoot) }
 *   build(root)         root = .layer-ground，写入 L1/L2/L3 的 3D 世界节点
 *   buildBackdrop(bgRoot) bgRoot = .stage-bg，只需要给 .bg-star 塞星星 span、
 *                          给 .bg-city 塞世界地图 SVG；其余（渐变/光带/暗角）
 *                          是纯 CSS 静态背景，不需要 JS 参与。
 *
 * 经典脚本 IIFE，零 import/export/fetch，只依赖已加载的 KG.dom / KG.data / KG.index。
 */
(function () {
  'use strict';

  window.KG = window.KG || {};
  var dom = window.KG.dom;

  /* ============================================================
   * 一、静态标定数据
   * ========================================================== */

  // L2：七大技术领域环绕角度，0° = 正前方 +Y，顺时针增大（对齐参考图标定结果）。
  // D4 恢复参考标定的 25°（Fix-4 之前曾临时改成 35° 来避让 --y:340 的
  // 「LNG 接收站」悬浮牌，那其实是下面 DOMAIN_RADIUS_KX/KY 把球环压成
  // 704×352 椭圆、纵深被压掉一半后才会撞在一起的次生问题——见 Fix-4 对
  // --r-domain 的改法说明，根源修好后不再需要这个角度补丁）。
  // 3-B：D6 从 118 调到 138——领域球用的角度约定（x=R*sin, y=R*cos）与十张
  // 立牌用的约定（x=R*cos, y=R*sin）天差 90°，118° 换算到立牌的约定下恰好
  // 落在 T10（335°）附近的世界坐标（用 Playwright 实测两者世界坐标只差
  // ~56 个单位），导致 D6「数字化与智能化」球被 T10「战略与决策」立牌卡片
  // 挡住一大半、颜色发暗。138° 把 D6 推得更靠后（世界坐标与所有立牌的距离
  // 都拉开到大于球体+立牌屏幕投影半径之和），用 Playwright 逐一取
  // getBoundingClientRect 验证 D6 与全部 10 张立牌矩形不再相交。
  // 3-B：D2 从 315 调到 288——3-B 把三大业务全息投影组的 --y 从 340 推到
  // 460（见 stage-ground.css L3 段说明）之后，D2「设计与施工」原本的落点
  // 正好压在「储气库」悬浮牌上（用 Playwright 实测两者矩形相交约
  // 78×65px）。288° 把 D2 推得更靠后/更远离桌面前沿，用
  // getBoundingClientRect 验证与三块 .holo-plate 矩形不再相交。
  // 3-B：D3 从 350 调到 340——D3「材料与装备」原本落点与"三大业务"金色标题
  // （--y:520，屏幕投影长期在 x:857~1064,y:841~899）大面积重叠（缺陷⑤）。
  // 用 getBoundingClientRect 对 330~5 度网格扫描，340° 是"仍在 D2/D4 之间
  // 留出的角度区间内、且屏幕投影 x 完全落在标题左侧（不相交）"的安全值。
  // 3-B：D5 从 62 调到 70——三大业务组 --y 推到 460 之后，D5「安全与维护」
  // 原本落点与「LNG 接收站」悬浮牌相交（断言 30 实测 FAIL）。对 45~75 度
  // 网格扫描后，70° 是"屏幕投影 y 完全落在悬浮牌上方（不相交）"的安全值
  // （50°/55°/45° 仍相交，70°/75° 才让两者 y 区间彻底分开）。
  var DOMAIN_ANGLE_DEG = {
    D1: 205, // 决策与管理
    D2: 288, // 设计与施工
    D3: 340, // 材料与装备
    D4: 25,  // 输送与储存
    D5: 70,  // 安全与维护
    D6: 138, // 数字化与智能化
    D7: 160  // 低碳与新能源
  };

  // L3：三大业务左中右分布（左储气库 / 中管道 / 右 LNG 接收站）
  var BIZ_X = { B1: -300, B2: 0, B3: 300 };

  /* ============================================================
   * 二、工具函数
   * ========================================================== */

  /** 读取 :root 上的 CSS 自定义属性数值（tokens.css 里已存在的几何 token，
   *  避免在 JS 里重复硬编码半径/高度这类"魔数"）。 */
  function cssNum(name) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name);
    return parseFloat(v) || 0;
  }

  /** 把领域全称按「与」拆成两行短标签；找不到「与」时退化为居中对半拆分。 */
  function splitTwoLine(name) {
    var i = name.indexOf('与');
    if (i > 0 && i < name.length - 1) {
      return [name.slice(0, i + 1), name.slice(i + 1)];
    }
    var mid = Math.ceil(name.length / 2);
    return [name.slice(0, mid), name.slice(mid)];
  }

  /* ============================================================
   * 三、L1 地面刻度环——四个同心环，全是无状态的 .o.flat 叶子节点
   * ========================================================== */

  function buildRings(frag) {
    ['ring--hair', 'ring--ticks', 'ring--ticks-major', 'ring--arc'].forEach(function (cls) {
      frag.appendChild(dom.h('div', { class: 'o flat ring ' + cls }));
    });
  }

  /* ============================================================
   * 四、L2 七大技术领域球：球体 + 地面投影两个兄弟元素，外加一枚远景青雾
   * ========================================================== */

  function buildDomains(frag) {
    var byId = window.KG.index.byId;
    var R = cssNum('--r-domain');

    // Fix-4：去掉 DOMAIN_RADIUS_KX/KY 压扁系数（曾是 0.8/0.4），七颗球
    // 现在落在半径 --r-domain 的正圆上，不再是 704×352 的压扁椭圆。
    // --r-domain 本身已从 880（与 --r-tick-3 相同但全角度扫描会冲出画布）
    // 下调到 640（对 7 个球实际使用的固定角度做过 Playwright 网格扫描，
    // 详见 tokens.css 里 --r-domain 的完整推导），不需要再叠加额外系数。
    Object.keys(DOMAIN_ANGLE_DEG).forEach(function (id) {
      var node = byId[id];
      if (!node) return;

      var rad = (DOMAIN_ANGLE_DEG[id] * Math.PI) / 180;
      var x = R * Math.sin(rad);
      var y = R * Math.cos(rad);
      var lines = splitTwoLine(node.name);

      frag.appendChild(dom.h('div', {
        class: 'o billboard domain-ball',
        vars: { '--x': x, '--y': y },
        dataset: { nodeId: id },
        role: 'button',
        tabindex: '0',
        'aria-label': node.name,
        html: lines[0] + '<br>' + lines[1]
      }));

      frag.appendChild(dom.h('div', {
        class: 'o flat domain-shadow',
        vars: { '--x': x, '--y': y }
      }));
    });

    // 远景青雾：单实例，位置/高度直接写死在 CSS 里，这里只挂节点
    frag.appendChild(dom.h('div', { class: 'o flat stage-fog' }));
  }

  /* ============================================================
   * 五、L3 三大业务全息投影：每组 5 个兄弟元素（光锥×2 + 地面光环×2 + 悬浮牌）
   * ========================================================== */

  function buildBusinesses(frag) {
    var byId = window.KG.index.byId;
    var order = (window.KG.data.meta && window.KG.data.meta.businesses) || ['B1', 'B2', 'B3'];

    order.forEach(function (id) {
      var node = byId[id];
      if (!node) return;

      var vx = { '--x': BIZ_X[id] !== undefined ? BIZ_X[id] : 0 };

      frag.appendChild(dom.h('div', { class: 'o billboard holo-cone', vars: vx }));
      frag.appendChild(dom.h('div', { class: 'o billboard holo-cone holo-cone--wide', vars: vx }));
      frag.appendChild(dom.h('div', { class: 'o flat holo-base', vars: vx }));
      frag.appendChild(dom.h('div', { class: 'o flat holo-base-glow', vars: vx }));
      frag.appendChild(dom.h('div', {
        class: 'o billboard holo-plate',
        vars: vx,
        dataset: { nodeId: id },
        role: 'button',
        tabindex: '0',
        'aria-label': node.name,
        text: node.short || node.name
      }));
    });

    frag.appendChild(dom.h('div', {
      class: 'o billboard stage-title stage-title--biz',
      text: '三大业务'
    }));
  }

  function buildDomainTitle(frag) {
    frag.appendChild(dom.h('div', {
      class: 'o billboard stage-title stage-title--domain',
      text: '七大技术领域'
    }));
  }

  /* ============================================================
   * 六、L0 背景：星空 span 生成 + 世界地图 SVG 注入
   * ========================================================== */

  /*
   * Fix-4：改调 scripts/fx/particles.js 的 KG.particles.mount()，不再自己用
   * Math.random() 写坐标——此前每次刷新星点位置都会变，截图回归没有稳定
   * 基线（particles.js 本身是专门为此写的确定性 LCG 生成器，此前却零调用方）。
   * 数量直接生成 70 个（目标 60–80 区间），不再"生成 140 再用 CSS
   * :nth-child(odd) 隐藏一半"——那是用两个错误抵消出一个凑合结果，
   * stage-ground.css 里对应的隐藏规则已同步删除。
   *
   * particles.js 的 mount() 只支持一个 spread 同时套用在 left/top 上（本例
   * 传 100，即 0~100% 全宽），而星空原设计只需要分布在画布上半 60% 高度
   * （避免砸在地面刻度环区域），所以生成后再对每个 span 的 top 统一压缩到
   * [0,60%]——压缩比例是固定常数，不引入任何随机性，seed 相同时结果依旧
   * 逐像素可复现。
   */
  function buildStars(container) {
    dom.clear(container);
    var pts = window.KG.particles.mount(container, {
      count: 70,
      seed: 20240810,
      spread: 100
    });
    pts.forEach(function (span) {
      var top = parseFloat(span.style.top) || 0;
      span.style.top = (top * 0.6).toFixed(2) + '%';
    });
  }

  /* ============================================================
   * 七、对外接口
   * ========================================================== */

  function build(root) {
    if (!root) return;
    dom.clear(root);
    var frag = document.createDocumentFragment();
    buildRings(frag);
    buildDomains(frag);
    buildBusinesses(frag);
    buildDomainTitle(frag);
    root.appendChild(frag);
  }

  function buildBackdrop(bgRoot) {
    if (!bgRoot) return;

    var starEl = dom.qs('.bg-star', bgRoot);
    if (starEl) buildStars(starEl);

    var cityEl = dom.qs('.bg-city', bgRoot);
    if (cityEl) {
      // KG.assets.worldMapSvg 当前阶段可能是空串：空就是空，不做假图兜底
      cityEl.innerHTML = (window.KG.assets && window.KG.assets.worldMapSvg) || '';
    }
  }

  window.KG.layersGround = { build: build, buildBackdrop: buildBackdrop };
})();
