/*
 * scripts/transition.js —— 镜头感转场状态机（子任务 2-A 独占文件）
 * 挂载到 window.KG.transition = { capture, run }。经典脚本 IIFE，零 import/export/fetch。
 *
 * 状态机（严格对齐 plan 第 6.3 节）：
 *
 *   IDLE ─click─▶ CAPTURE ─▶ COLLAPSE ─▶ FLASH ─▶ NAVIGATE ─▶ EXPAND ─▶ SETTLE ─▶ IDLE
 *                    │                                            │
 *                    └── 异常 / reduced-motion ───────────────────┴─▶ 直接 NAVIGATE（纯淡入）
 *
 * 六阶段职责：
 *   CAPTURE  (0ms)              采集源元素设计坐标 + 视觉信息，生成 payload，不做任何 DOM 变更。
 *   COLLAPSE (--tr-collapse)    源位置光晕/光环向内收缩淡出；若正离开首页展台，叠加相机推进感。
 *   FLASH    (--tr-flash)       全屏白闪 + 横向光带扫过，遮住页面切换的瞬间。
 *   NAVIGATE (0ms)              真正调用 KG.router.go 切换 hash（携带 from/t，转场结束后再抹掉）。
 *   EXPAND   (--tr-expand)      等目标页面就绪，ghost 从源点 FLIP 飞向目标节点，目标画布同步显影。
 *   SETTLE   (--tr-settle)      ghost 淡出 + 目标节点聚焦 + 涟漪脉冲 + router.replace 抹掉 from/t。
 *
 * 关键约定：
 *   1. run(payload) 返回 Promise<boolean>：true = 本模块已接管并完成跳转，调用方不得再自行 router.go。
 *   2. 可重入保护（覆盖式排队，Fix-6 bug3）：转场进行中收到的新 run() 请求不会被静默丢弃——
 *      而是把 payload 记进 pendingPayload（只保留最新一次，旧的排队请求被直接顶替，不叠加/
 *      不无限堆积），返回 Promise.resolve(true) 让调用方放心地不再自行导航；当前转场一结束
 *      （无论正常完成还是异常降级）立刻取出 pendingPayload 自动执行。选它而不是「busy 时改成
 *      同步 router.go 抢跳」，是因为同步抢跳需要能安全腰斩一个正在跑到一半的 Promise 链
 *      （COLLAPSE 的光晕/相机 class、FLASH 的全屏白闪、EXPAND 的 ghost DOM 都可能停在半路），
 *      腰斩逻辑一旦漏掉某个阶段的清理就会留下更隐蔽的视觉残留；排队只需要保证 run() 全程只有
 *      一份 busy，改动集中在 run() 一处入口，复杂度和回归面都更小，代价只是「连点」时最新一次
 *      点击会有最多约一个转场时长（约 1.2s）的响应延迟，对演示节奏可接受，且严格好于「点了
 *      没反应」。
 *   3. reduced-motion：跳过 COLLAPSE/FLASH/EXPAND 的一切视觉效果，只做「导航 + 原生聚焦」。
 *   4. 任何阶段抛出异常，一律在 run() 顶层兜底降级为「直接导航 + 原生聚焦」（无 ghost）——
 *      这是 plan 状态机图里明确画出的分支，不是本文件自作主张加的兜底；且这份兜底现在覆盖
 *      run() 里从 payload 校验到 runGraphTransition/runDocsTransition 调用的全过程，包括这两个
 *      函数体内「CAPTURE 采集 + DOM 挂载光晕」那段同步执行的前半段（Fix-6 bug5：过去只有
 *      `full.catch(...)` 包住了返回的 Promise，若同步段本身抛异常，`full` 根本不会被赋值，
 *      异常会穿透 run() 上抛且 busy 永远停在 true，之后所有转场被永久禁用）。
 *   5. from/t 走 hash（供 F5 场景下 router.js 原生解析，且是 plan 6.1 定义的协议字段），
 *      供 EXPAND 阶段消费的「源点坐标/颜色/文案」等视觉载荷完全靠 Promise 闭包在本文件内部
 *      向下传递，不经过 KG.bus.stash（Fix-6 bug6：曾经额外写过一次 stash，但 KG.bus.take/peek
 *      全项目 0 调用，那份 stash 是只写不读的死代码，容易让后来者误以为要去 stash 里找视觉
 *      载荷）。真正让「F5 直达 `#/graph?...&from=..&t=..`」天然降级为「无 ghost 纯聚焦」的
 *      原因是：F5 场景下本文件的 run()/capture() 根本不会被调用（没有点击发生），router.init()
 *      走的是 mount() 正常挂载 graph 页；graph.js 的 renderFromCtx() 本来就只认 view/focus
 *      两个字段，对 hash 里多余的 from/t 视而不见，会用自己的 focusNode() 完成一次「无 ghost
 *      的纯聚焦」——这一步完全不需要本文件写任何特殊判断代码，也不需要任何暂存区配合。
 *   6. NAVIGATE/SETTLE 前会校验 KG.router.current().name 是否仍是预期页面（Fix-6 bug4）：
 *      若 COLLAPSE+FLASH 播放期间（约 420ms）用户已经手动导航离开了起点页，或者 EXPAND/SETTLE
 *      期间用户已经导航离开了刚跳转到的 graph 页，本模块会当场 cleanupAll() 中止后续阶段，
 *      不会再执行 KG.router.go/replace 把用户拽回来、也不会用 replace 悄悄改写 currentState
 *      与地址栏（history.replaceState 不触发 hashchange，一旦写坏会让后续 go() 因「目标 hash
 *      与 currentState 算出来的字符串相同」而无声失效）。
 *      【bug new1，本轮修复】上面这条校验依赖 KG.router.current().name（= currentState.name），
 *      而 currentState 只在 window 的 hashchange 监听器里刷新——hashchange 是宏任务，
 *      go() 之后不会立刻生效。正常情况下 NAVIGATE 到这条校验之间会经过 waitForNode() 的
 *      真实异步等待（graph 页首次 mount + 布局），足够让 hashchange 宏任务被处理；但若
 *      此前已经渲染过同一个 view（nodeScreenPos 命中缓存），waitForNode() 会在 Promise
 *      构造函数里同步 resolve，NAVIGATE→校验全靠微任务链推进，读到的仍是 NAVIGATE 之前
 *      的旧页面名，把「转场自己刚触发的导航」误判成「用户已手动导航离开」而提前中止——
 *      触发路径正是「同视角下二次进入图谱」（如展台点 T01→Esc 回展台→点同视角的 T03）。
 *      修法是新增 waitForOwnHashChange()，与 waitForNode() 并发等待，强制让这条校验必须
 *      等到 go() 自己触发的 hashchange 真正落地之后才执行，见该函数顶部注释。
 *
 * nodeScreenPos() 坐标稳定性契约（与 scripts/graph/graph.js 对齐，Fix-6 bug1 收敛结论）：
 *   graph.js 的 applyOptionStable() 已经保证：整图刷新的那一帧强制 animation:false 把节点/边
 *   直接落到最终位置，setOption 返回后 nodeScreenPos() 立刻是同步、准确的最终坐标，不需要
 *   调用方轮询等待或逐帧追踪。本文件曾经有一版 flyGhostChase() 假设「ECharts roam 入场动画
 *   会让目标坐标持续漂移 800-900ms，必须逐帧重读 nodeScreenPos 并用 stableFrames>=3 收敛判定
 *   兜底」——这与 graph.js 的契约直接矛盾，而且实测 nodeScreenPos 的漂移是 0.0px（mount 后
 *   立刻取 vs 1200ms 后取完全一致）。真正观察到的「飞行轨迹弯折」另有其因：EXPAND 期间
 *   transition.css 曾给 #graphChart 加 `transform:scale(1.12)` 的进场动效，而 graph.js 的
 *   nodeScreenPos() 用 `elChart.getBoundingClientRect()` 的左上角做坐标系原点——这个 rect 在
 *   scale 过渡的 520ms 内本身就是变化的，逐帧重读自然读出一串「伪漂移」。这不是坐标本身在
 *   漂移，是承载坐标系原点的容器自己被转场动效顺手挪动了。Fix-6 已经把这个 scale 从
 *   #graphChart.is-entering 里去掉（styles/transition.css），根源消失后 flyGhostChase 降级为
 *   单次 FLIP（flyGhostTo()）：EXPAND 开始时读一次 nodeScreenPos 作为落点，交给 CSS
 *   transition 一次性过渡过去，足够对齐（对齐误差 < 5px）。
 *   waitForNode() 保留：它解决的是另一件事——「graph 页此刻是否已经 mount + 完成首次布局，
 *   nodeScreenPos() 是否已经有值可读」，与坐标漂移无关，仍然需要（尤其是 F5 之外、正常点击
 *   触发 NAVIGATE 后 graph 页第一次 mount 存在真实的异步 DOM 就绪时间）。
 *
 * 反向转场（graph -> docs）：
 *   1-G 已经在 docs.js 的 openDocCard()/growCardFrom() 里自己实现了「从触发源生长出玻璃卡」
 *   的动画，且 graph.js 当前是直接 KG.router.go('docs', ...) 跳转，并未调用本模块。为避免和
 *   1-G 的卡片生长动画抢一个目标矩形，本文件对 target:'docs' 只做「光晕收缩 + 白闪」的过场，
 *   NAVIGATE 之后完全不插入任何 ghost/脉冲，把 EXPAND 阶段的视觉全部让给 1-G 的实现。
 */
(function (global) {
  'use strict';

  var KG = global.KG = global.KG || {};

  /* ============================================================
   * 一、常量与模块状态
   * ========================================================== */

  var GHOST_SIZE = 72; // ghost 的设计坐标系直径（px），飞行过程中尺寸不变，只变 scale

  var busy = false;           // 可重入保护：true 表示转场正在进行
  var pendingPayload = null;  // busy 期间收到的最新一次请求（覆盖式排队，见文件头约定 2）
  var flashEl = null;         // 全屏白闪层，懒创建后常驻复用
  var sweepEl = null;         // 横向光带，懒创建后常驻复用

  // 哨兵值：代表本次转场因「用户在动画播放期间已手动导航离开预期页面」而中止（bug4）。
  // 沿 Promise 链原样透传，最终统一解析为 true（本模块已处理这次点击，调用方不必再导航），
  // 绝不会落到顶层 catch 走 runReduced 的强制导航——那样反而会把用户手动导航的结果又拽回来。
  var ABORTED = {};

  /* ============================================================
   * 二、小工具
   * ========================================================== */

  function trLayer() {
    return document.getElementById('trLayer');
  }

  function delay(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function rafDelay() {
    return new Promise(function (resolve) { requestAnimationFrame(resolve); });
  }

  /** 连续两帧 rAF：第一帧确保初始（起始）样式已经真正上屏，第二帧再切到终止样式触发 transition。 */
  function doubleRaf() {
    return rafDelay().then(rafDelay);
  }

  /** 读取 tokens.css 里的时长变量并转成毫秒数，供 setTimeout 使用。 */
  function cssMs(varName, fallback) {
    var raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    if (!raw) return fallback;
    var num = parseFloat(raw);
    if (isNaN(num)) return fallback;
    return raw.indexOf('ms') !== -1 ? num : num * 1000;
  }

  function prefersReducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function removeEls() {
    for (var i = 0; i < arguments.length; i++) {
      var el = arguments[i];
      if (el && el.parentNode) el.parentNode.removeChild(el);
    }
  }

  function warn(msg, err) {
    if (window.console && console.warn) console.warn(msg, err);
  }

  /** 当前 router 的页面名，router.js 保证 current() 恒返回可用对象，这里不再额外兜底判空。 */
  function currentPageName() {
    return KG.router.current().name;
  }

  /**
   * 轮询等待图谱页目标节点就绪（mount + 首次布局完成后 nodeScreenPos 才有值）。
   * 最多等 maxMs，超时返回 null（EXPAND 阶段据此降级：跳过 ghost 飞行，直接显影）。
   * 注意：这里等的是「graph 页是否已经 mount 完成」这个一次性的时序问题，
   * 与 nodeScreenPos 坐标本身是否稳定无关（后者见文件头「坐标稳定性契约」一节）。
   */
  function waitForNode(id, maxMs) {
    return new Promise(function (resolve) {
      var start = (window.performance && performance.now) ? performance.now() : Date.now();
      (function tick() {
        var pos = (KG.graphPage && KG.graphPage.nodeScreenPos) ? KG.graphPage.nodeScreenPos(id) : null;
        if (pos) { resolve(pos); return; }
        var now = (window.performance && performance.now) ? performance.now() : Date.now();
        if (now - start >= maxMs) { resolve(null); return; }
        requestAnimationFrame(tick);
      })();
    });
  }

  /**
   * 等待 KG.router.go() 自己触发的下一次 hashchange 被浏览器真正处理完（bug new1 的核心修复点）。
   *
   * 根因：NAVIGATE 调用 location.hash = ... 后，location.hash 这个字符串是同步立刻改变的，
   * 但 router.js 的 currentState（currentPageName() 读的就是它）只在 window 的 hashchange
   * 监听器里才刷新——而 hashchange 是浏览器排队的宏任务，必须等当前宏任务的同步代码
   * 和它挂起的全部微任务都跑完才会被处理。若 NAVIGATE 之后紧跟的 waitForNode() 恰好在
   * Promise 构造函数里同步拿到坐标（graph 页此前已经渲染过该 view，nodeScreenPos 有缓存），
   * 那么它是在当前宏任务内部就地 resolve 的，NAVIGATE 到「读 currentPageName() 校验」之间
   * 全靠微任务链推进，根本不会让出主线程给 hashchange 宏任务——于是那次校验读到的仍是
   * NAVIGATE 之前的旧页面名，把「转场自己刚触发的这次导航」误判成「用户在动画播放期间
   * 已经手动导航离开」（Fix-6 bug4 的防御逻辑），提前 cleanupAll() 整体中止，SETTLE 阶段
   * 本该 router.replace() 抹掉的 from/t 永远没机会执行，hash 永久残留、转场卡死不自愈。
   *
   * 修法：NAVIGATE 之后不直接进入下一步校验，而是显式等一次真实的 hashchange 事件——
   * 无论 waitForNode() 是同步还是异步 resolve，都必须先让 hashchange 这个宏任务被处理完，
   * 后续读到的 currentPageName() 才反映的是 go() 自己刚导航到的最新页面，不会误判。
   * 由于每次 NAVIGATE 都会带上 payload.t（Date.now()%1e6）这个单调 token，写进 hash 的
   * 字符串必然与当前 hash 不同，浏览器保证一定会派发一次真实的 hashchange，这里的等待
   * 不是"可能等不到事件"的赌博。
   *
   * 兜底：极端环境下若 hashchange 因故未按预期触发，最多再等 50ms 就放行——呼应本文件
   * flyGhostTo() 里 transitionend 兜底 timer 的同一惯例，避免把"等事件"这一步变成新的
   * 永久卡死点（那正是本次要修的 new1 bug 本身的表现，修复代码里不能重新引入同类风险）。
   */
  function waitForOwnHashChange() {
    return new Promise(function (resolve) {
      var settled = false;
      function finish() {
        if (settled) return;
        settled = true;
        window.removeEventListener('hashchange', onChange);
        clearTimeout(fallbackTimer);
        resolve();
      }
      function onChange() { finish(); }
      window.addEventListener('hashchange', onChange);
      var fallbackTimer = setTimeout(finish, 50);
    });
  }

  /**
   * 转场进行中意外中断（重入保护触发前的极端场景 / 上一次异常未走完清理）时的兜底清场，
   * 保证下一次转场从干净状态开始，不会有残留的光晕/ghost/涟漪叠加在画面上。
   */
  function cleanupAll() {
    var layer = trLayer();
    if (layer) {
      KG.dom.qsa('.tr-halo, .tr-ring, .tr-ghost, .tr-pulse', layer).forEach(function (el) {
        el.parentNode.removeChild(el);
      });
    }
    if (flashEl) flashEl.classList.remove('is-active');
    if (sweepEl) sweepEl.classList.remove('is-active');
    var stageScene = document.querySelector('.stage-scene');
    if (stageScene) stageScene.classList.remove('is-leaving');
    var elChart = document.getElementById('graphChart');
    if (elChart) elChart.classList.remove('is-entering');
  }

  /* ============================================================
   * 三、CAPTURE —— 采集源元素设计坐标与视觉信息
   * ========================================================== */

  /**
   * capture(el, nodeId) -> payload
   * 只读采集，不做任何 DOM 变更。颜色取自 KG.index.colorOf（对齐图谱页四色分层的 CSS 变量名，
   * 而不是展台立牌本身的渐变色），这样源光晕与飞入终点的节点配色天然一致。
   */
  function capture(el, nodeId) {
    var node = KG.index.byId[nodeId];
    var rect = el && el.getBoundingClientRect ? el.getBoundingClientRect() : null;
    var design = rect ? KG.scale.rectToDesign(rect) : {
      x: KG.scale.DESIGN_W / 2, y: KG.scale.DESIGN_H / 2, w: 40, h: 40
    };

    return {
      nodeId: nodeId,
      x: design.x,
      y: design.y,
      w: Math.max(design.w || 0, 4),
      h: Math.max(design.h || 0, 4),
      colorVar: node ? KG.index.colorOf(node) : '--cyan',
      label: node ? (node.short || node.name) : nodeId,
      type: node ? node.type : null,
      t: Date.now() % 1e6 // 转场单调 token，写进 hash，保证连点同一节点也能重新触发
    };
  }

  /* ============================================================
   * 四、COLLAPSE —— 源位置光晕收缩 + 相机推进
   * ========================================================== */

  /** 只在「当前正处于首页展台」时才需要相机推进感；反向转场（graph -> docs）不涉及展台。 */
  function markLeavingScene() {
    var stageEl = document.getElementById('page-stage');
    if (!stageEl || !stageEl.classList.contains('is-active')) return null;
    return document.querySelector('.stage-scene');
  }

  function spawnCollapse(payload) {
    var layer = trLayer();
    var base = Math.max(payload.w, payload.h, 24);
    var haloSize = base * 1.8;
    var ringSize = base * 1.2;

    var halo = KG.dom.h('div', {
      class: 'tr-halo',
      style: {
        left: (payload.x - haloSize / 2) + 'px',
        top: (payload.y - haloSize / 2) + 'px',
        width: haloSize + 'px',
        height: haloSize + 'px',
        background: 'radial-gradient(circle, var(' + payload.colorVar + '), transparent 70%)'
      }
    });
    var ring = KG.dom.h('div', {
      class: 'tr-ring',
      style: {
        left: (payload.x - ringSize / 2) + 'px',
        top: (payload.y - ringSize / 2) + 'px',
        width: ringSize + 'px',
        height: ringSize + 'px'
      }
    });

    layer.appendChild(halo);
    layer.appendChild(ring);
    void halo.offsetWidth; // 强制回流：确保起始样式先真正上屏，下一帧加 class 才能触发 transition

    return { halo: halo, ring: ring };
  }

  /* ============================================================
   * 五、FLASH —— 全屏白闪 + 横向光带
   * ========================================================== */

  function ensureFlashEls() {
    if (flashEl) return;
    var layer = trLayer();
    flashEl = KG.dom.h('div', { class: 'tr-flash' });
    sweepEl = KG.dom.h('div', { class: 'tr-sweep' });
    layer.appendChild(flashEl);
    layer.appendChild(sweepEl);
  }

  function triggerFlash(payload) {
    ensureFlashEls();
    var xPct = (Math.min(Math.max(payload.x, 0), KG.scale.DESIGN_W) / KG.scale.DESIGN_W * 100).toFixed(2);
    var yPct = (Math.min(Math.max(payload.y, 0), KG.scale.DESIGN_H) / KG.scale.DESIGN_H * 100).toFixed(2);
    flashEl.style.background = 'radial-gradient(circle at ' + xPct + '% ' + yPct + '%, #fff, var(--cyan-hi))';

    // 重新触发 CSS animation：先移除 class + 强制回流，再加回去
    flashEl.classList.remove('is-active');
    sweepEl.classList.remove('is-active');
    void flashEl.offsetWidth;
    flashEl.classList.add('is-active');
    sweepEl.classList.add('is-active');
  }

  /* ============================================================
   * 六、EXPAND —— ghost FLIP 飞入 + 目标画布显影
   * ========================================================== */

  function ghostTransformAt(x, y, scale) {
    return 'translate(' + (x - GHOST_SIZE / 2) + 'px,' + (y - GHOST_SIZE / 2) + 'px) scale(' + scale + ')';
  }

  function spawnGhost(payload) {
    var layer = trLayer();
    var ghost = KG.dom.h('div', {
      class: 'tr-ghost',
      style: { width: GHOST_SIZE + 'px', height: GHOST_SIZE + 'px' }
    }, [
      KG.dom.h('span', {
        class: 'tr-ghost-core',
        style: {
          background: 'radial-gradient(circle at 36% 30%, #fff, var(' + payload.colorVar + ') 55%, transparent 78%)',
          boxShadow: '0 0 30px var(' + payload.colorVar + ')'
        }
      }),
      KG.dom.h('span', { class: 'tr-ghost-label', text: payload.label || '' })
    ]);
    // 起始帧写死成「源点、scale .2」，此时 .tr-ghost 基础样式没有声明 transform 的
    // transition（见 transition.css），下面 flyGhostTo() 加 .is-flying 才会补上这条
    // transition 规则，两者配合形成一次标准 FLIP：先定住起点，再一次性过渡到终点。
    ghost.style.transform = ghostTransformAt(payload.x, payload.y, .2);
    layer.appendChild(ghost);
    void ghost.offsetWidth;
    return ghost;
  }

  /**
   * ghost 从源点单次 FLIP 飞向目标坐标 targetPos（一次性 CSS transition，而非逐帧追踪）。
   * 之所以能简化成单次 FLIP：graph.js 的 nodeScreenPos() 坐标稳定性契约保证 EXPAND 开始时
   * 读到的 targetPos 就是最终定位（见文件头「坐标稳定性契约」一节），不存在需要追逐的漂移。
   * 时长/缓动引用 --tr-expand / --e-out（见 transition.css 的 .tr-ghost.is-flying 规则），
   * 不在 JS 里另起一套缓动函数。
   */
  function flyGhostTo(ghost, targetPos, expandMs) {
    return new Promise(function (resolve) {
      var settled = false;
      function finish() {
        if (settled) return;
        settled = true;
        ghost.removeEventListener('transitionend', onEnd);
        clearTimeout(fallbackTimer);
        resolve(targetPos);
      }
      function onEnd(e) {
        // transitionend 会从 .tr-ghost-label 的 opacity transition 冒泡上来，
        // 必须同时校验 target 与 propertyName，只认 ghost 自身的 transform 过渡结束。
        if (e.target === ghost && e.propertyName === 'transform') finish();
      }
      ghost.addEventListener('transitionend', onEnd);
      // 兜底：个别环境 transitionend 可能不触发（例如过渡中途元素被提前移除），
      // expandMs 之外留出的余量刚好覆盖一次事件循环调度延迟。
      var fallbackTimer = setTimeout(finish, expandMs + 60);

      doubleRaf().then(function () {
        ghost.classList.add('is-flying'); // 触发 CSS 的 transform 过渡 + label 淡入
        ghost.style.transform = ghostTransformAt(targetPos.x, targetPos.y, 1);
      });
    });
  }

  function fadeOutGhost(ghost) {
    ghost.classList.add('is-settled');
  }

  function revealChart(elChart) {
    if (!elChart) return;
    elChart.classList.remove('is-entering');
  }

  /* ============================================================
   * 七、SETTLE —— 涟漪脉冲
   * ========================================================== */

  function spawnPulseRing(x, y) {
    var layer = trLayer();
    var ring = KG.dom.h('div', { class: 'tr-pulse', style: { left: x + 'px', top: y + 'px' } });
    layer.appendChild(ring);
    void ring.offsetWidth;
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { ring.classList.add('is-expand'); });
    });
    var removed = false;
    function cleanup() {
      if (removed) return;
      removed = true;
      if (ring.parentNode) ring.parentNode.removeChild(ring);
    }
    ring.addEventListener('transitionend', cleanup);
    setTimeout(cleanup, 900); // 兜底移除，避免 transitionend 在个别环境不触发
  }

  function spawnSettlePulses(focusId) {
    if (!KG.graphPage || !KG.graphPage.nodeScreenPos) return;
    var pos = KG.graphPage.nodeScreenPos(focusId);
    if (!pos) return;
    [0, 140, 280].forEach(function (delayMs) {
      setTimeout(function () { spawnPulseRing(pos.x, pos.y); }, delayMs);
    });
  }

  /* ============================================================
   * 八、正向转场主流程（stage -> graph）
   * ========================================================== */

  /**
   * runGraphTransition(payload, originName) —— COLLAPSE/FLASH/NAVIGATE/EXPAND/SETTLE 完整跑一遍。
   * 用 Promise 链顺序表达状态机，任何一步抛异常都会让整个 Promise reject，由 run() 顶层统一
   * 捕获并降级为「直接 NAVIGATE + 原生聚焦」。originName 是 CAPTURE 时刻（点击发生那一刻）
   * KG.router.current().name，用于 NAVIGATE/SETTLE 前的「用户是否已手动导航离开」校验（bug4）。
   */
  function runGraphTransition(payload, originName) {
    var view = payload.view;
    var focusId = payload.focus || payload.nodeId;

    // 抢在 graph 页 mount 之前把画布压成隐藏态，避免 mount 时先闪一帧终态再被拉回起始态
    var elChart = document.getElementById('graphChart');
    if (elChart) elChart.classList.add('is-entering');

    var leavingScene = markLeavingScene();

    // ---- COLLAPSE ----
    var haloEls = spawnCollapse(payload);
    return doubleRaf().then(function () {
      haloEls.halo.classList.add('is-collapsing');
      haloEls.ring.classList.add('is-collapsing');
      if (leavingScene) leavingScene.classList.add('is-leaving');
      return delay(cssMs('--tr-collapse', 280));
    }).then(function () {
      removeEls(haloEls.halo, haloEls.ring);

      // ---- FLASH ----
      triggerFlash(payload);
      return delay(cssMs('--tr-flash', 140));
    }).then(function () {

      // ---- NAVIGATE 前置校验（bug4）：COLLAPSE+FLASH 播放的 420ms 内，用户可能已经
      // 手动点了别处导航离开了起点页——此时不再抢跳，原样中止并清场。
      if (currentPageName() !== originName) {
        cleanupAll();
        return ABORTED;
      }

      // from/t 写进 hash：这是 plan 6.1 定义的转场协议字段，也是 F5 场景下 router.js
      // 原生可解析、graph.js 原生可忽略的字段；SETTLE 阶段会用 replace 把它们抹掉。
      KG.router.go('graph', { view: view, focus: focusId, from: [payload.x, payload.y], t: payload.t });

      // ---- EXPAND ----
      // bug new1 修复：与 waitForNode() 并发等待 go() 自己触发的 hashchange 真正落地
      // （见 waitForOwnHashChange() 顶部注释）。若省掉这一步，等 graph 页此前已渲染过
      // 该 view、nodeScreenPos 命中缓存同步 resolve 时，下面的 currentPageName() 校验
      // 会读到 NAVIGATE 之前的旧页面名而误判成「用户已手动导航离开」，转场永久中止。
      return Promise.all([waitForOwnHashChange(), waitForNode(focusId, 600)]);
    }).then(function (navigateResult) {
      if (navigateResult === ABORTED) return ABORTED;
      var pos = navigateResult[1];

      // NAVIGATE 已经把地址栏切到 graph，且上面已经等到了这次 NAVIGATE 自己的
      // hashchange 落地；EXPAND 期间（含 waitForNode 的等待窗口）用户仍可能再次
      // 手动导航离开，这里的校验现在读到的才是可信的最新页面名。
      if (currentPageName() !== 'graph') {
        cleanupAll();
        return ABORTED;
      }

      var ghost = null;
      if (pos) {
        ghost = spawnGhost(payload);
        revealChart(elChart);
        var expandMs = cssMs('--tr-expand', 520);
        return flyGhostTo(ghost, pos, expandMs).then(function () {
          fadeOutGhost(ghost);
          return ghost;
        });
      }
      // 600ms 内目标节点仍未就绪：降级为「无 ghost，直接显影」，不影响 SETTLE 继续推进
      revealChart(elChart);
      return null;
    }).then(function (ghostOrAborted) {
      if (ghostOrAborted === ABORTED) return true;
      var ghost = ghostOrAborted;

      // ---- SETTLE 前置校验（bug4）----
      if (currentPageName() !== 'graph') {
        cleanupAll();
        if (ghost) removeEls(ghost);
        return true;
      }

      if (leavingScene) leavingScene.classList.remove('is-leaving');
      KG.graphPage.focusNode(focusId);
      spawnSettlePulses(focusId);
      return delay(cssMs('--tr-settle', 260)).then(function () {
        if (ghost) removeEls(ghost);
        // 抹掉 from/t，防止 F5 重播整套转场；SETTLE 播放期间用户也可能已经离开 graph 页，
        // 再校验一次，避免用 replace 悄悄把 currentState/地址栏写回 graph（bug4 的第二处）。
        if (currentPageName() === 'graph') {
          KG.router.replace('graph', { view: view, focus: focusId });
        }
        return true;
      });
    });
  }

  /* ============================================================
   * 九、反向转场（graph -> docs）—— 只做光晕 + 白闪，卡片生长交给 1-G 的 docs.js
   * ========================================================== */

  function runDocsTransition(payload, originName) {
    var haloEls = spawnCollapse(payload);
    return doubleRaf().then(function () {
      haloEls.halo.classList.add('is-collapsing');
      haloEls.ring.classList.add('is-collapsing');
      return delay(cssMs('--tr-collapse', 280));
    }).then(function () {
      removeEls(haloEls.halo, haloEls.ring);
      triggerFlash(payload);
      return delay(cssMs('--tr-flash', 140));
    }).then(function () {
      // ---- NAVIGATE 前置校验（bug4）----
      if (currentPageName() !== originName) {
        cleanupAll();
        return true;
      }
      // NAVIGATE：不插入 ghost/脉冲，EXPAND 视觉完全交给 1-G 的 openDocCard()/growCardFrom()
      KG.router.go('docs', payload.docsQuery || { task: payload.taskId, node: payload.nodeId, doc: payload.docId });
      return true;
    });
  }

  /* ============================================================
   * 十、reduced-motion / 异常降级 —— 直接 NAVIGATE（纯淡入）
   * ========================================================== */

  function runReduced(payload, originName) {
    if (payload.target === 'docs') {
      if (originName !== null && currentPageName() !== originName) return Promise.resolve(true);
      KG.router.go('docs', payload.docsQuery || { task: payload.taskId, node: payload.nodeId, doc: payload.docId });
      return Promise.resolve(true);
    }
    if (originName !== null && currentPageName() !== originName) return Promise.resolve(true);
    var view = payload.view;
    var focusId = payload.focus || payload.nodeId;
    KG.router.go('graph', { view: view, focus: focusId });
    return waitForNode(focusId, 600).then(function () {
      if (KG.graphPage && KG.graphPage.focusNode) KG.graphPage.focusNode(focusId);
      return true;
    });
  }

  /* ============================================================
   * 十一、对外入口
   * ========================================================== */

  /** busy 复位后，若有排队的最新请求，立刻取出执行（覆盖式排队，见文件头约定 2）。 */
  function flushPending() {
    if (!pendingPayload) return;
    var next = pendingPayload;
    pendingPayload = null;
    runOnce(next);
  }

  /**
   * runOnce(payload) —— 真正执行一次转场（run() 已经确认 !busy 时才会调用）。
   * 把「同步阶段（CAPTURE 采集 + DOM 挂载光晕）可能抛出的异常」也纳入兜底覆盖范围（bug5）：
   * try 包住 full 的构造过程，构造阶段本身抛异常时同样落到 runReduced 降级，busy 保证在
   * exec 的 then/catch 里被复位，不会因为同步段异常导致 busy 卡死在 true。
   */
  function runOnce(payload) {
    busy = true;
    cleanupAll(); // 防御性清场：正常情况下不会有残留，仅防止上一次异常退出遗留 DOM

    var originName = currentPageName(); // CAPTURE 时刻的页面名，供 bug4 的导航校验使用

    var exec;
    try {
      if (prefersReducedMotion()) {
        exec = runReduced(payload, originName);
      } else {
        var full = payload.target === 'docs'
          ? runDocsTransition(payload, originName)
          : runGraphTransition(payload, originName);
        exec = full.catch(function (err) {
          warn('[transition] 转场执行异常，按状态机约定降级为直接跳转', err);
          cleanupAll();
          return runReduced(payload, originName);
        });
      }
    } catch (err) {
      warn('[transition] 转场同步阶段异常，按状态机约定降级为直接跳转', err);
      cleanupAll();
      exec = runReduced(payload, originName);
    }

    return exec.then(function (taken) {
      busy = false;
      flushPending();
      return taken;
    }, function (err) {
      busy = false;
      flushPending();
      throw err;
    });
  }

  /**
   * run(payload) -> Promise<boolean>
   *   true  = 本模块已接管并完成跳转，调用方（stage.js/graph.js）不得再自行 router.go。
   *   false = 未接管（target 非法），调用方自行降级导航。
   */
  function run(payload) {
    if (!payload || (payload.target !== 'graph' && payload.target !== 'docs')) {
      return Promise.resolve(false);
    }
    if (busy) {
      // 覆盖式排队（bug3）：不再静默丢弃，记下最新请求，当前转场结束后自动执行；
      // 对调用方而言仍然是「已接管」，不需要自行 router.go。
      pendingPayload = payload;
      return Promise.resolve(true);
    }
    return runOnce(payload);
  }

  window.KG.transition = {
    capture: capture,
    run: run
  };

})(window);
