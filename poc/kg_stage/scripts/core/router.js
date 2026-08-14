/*
 * core/router.js —— hash 路由 + 页面生命周期管理
 * 挂载到 window.KG.router。
 *
 * hash 格式：#/name?k=v&k2=v2，支持的 query key（完整协议，见 plan 第 6.1 节）：
 *   view  —— 'task' | 'domain' | 'business'（graph 页视角）
 *   focus —— 聚焦节点 id（graph 页）
 *   from  —— 转场起点的 1920x1080 设计坐标，序列化成 "x,y" 字符串放进 hash，
 *            本文件在 parseHash 时统一还原成 [x,y] 数字数组，供 transition.js /
 *            页面模块直接使用；格式不对就安全丢弃，不抛错（对应「刷新时 stash 为空
 *            -> 有 from 无 stash -> 降级为无 ghost 的纯聚焦」的约定）。
 *   t     —— 转场单调 token（Date.now()%1e6），保证连点同一节点也能重新触发转场
 *   task/node/doc —— docs 页的任务/节点/文档定位
 * 例：
 *   #/stage
 *   #/graph?view=task&focus=T03&from=820,430&t=123456
 *   #/docs?task=T01&node=T01-F01&doc=DOC-T01
 *
 * 生命周期：
 *   首次进入某页 -> mount(ctx)，并标记为已挂载（此后同一页面不会再次 mount，
 *                  避免 ECharts 等重实例被反复销毁重建）。
 *   已挂载页面再次进入 / 同页 query 变化 -> update(ctx)。
 *   离开某页 -> unmount()（用于停止计时器等轻量清理，不销毁底层实例）。
 * ctx = { name, query, el }，el 是对应的 .page 元素。
 */
(function(){
  'use strict';

  window.KG = window.KG || {};

  var DEFAULT_ROUTE = 'stage';
  var routes = {};
  var currentState = { name: null, query: {} };

  function noop(){}

  function register(name, handlers){
    handlers = handlers || {};
    routes[name] = {
      mount: handlers.mount || noop,
      unmount: handlers.unmount || noop,
      update: handlers.update || noop,
      mounted: false
    };
  }

  function pageEl(name){
    return document.getElementById('page-' + name);
  }

  function setActivePage(name){
    var pages = document.querySelectorAll('.page');
    for(var i = 0; i < pages.length; i++){
      var isActive = pages[i].id === ('page-' + name);
      pages[i].classList.toggle('is-active', isActive);
    }
  }

  /** 解析 '#/name?k=v&k2=v2' -> {name, query} */
  function parseHash(hashStr){
    var raw = (hashStr || '').replace(/^#/, '');
    if(raw.indexOf('/') === 0) raw = raw.slice(1);

    var qIndex = raw.indexOf('?');
    var name = qIndex === -1 ? raw : raw.slice(0, qIndex);
    var queryStr = qIndex === -1 ? '' : raw.slice(qIndex + 1);

    name = name || DEFAULT_ROUTE;

    var query = {};
    if(queryStr){
      queryStr.split('&').forEach(function(part){
        if(!part) return;
        var eq = part.indexOf('=');
        var k = eq === -1 ? part : part.slice(0, eq);
        var v = eq === -1 ? '' : part.slice(eq + 1);
        query[decodeURIComponent(k)] = decodeURIComponent(v || '');
      });
    }

    // from：'x,y' 字符串 -> [x,y] 数字数组，格式不对就整体丢弃（安全降级，不抛错）
    if(typeof query.from === 'string' && query.from){
      var fromParts = query.from.split(',').map(Number);
      var fromValid = fromParts.length === 2 && fromParts.every(function(n){ return !isNaN(n); });
      if(fromValid){
        query.from = fromParts;
      } else {
        delete query.from;
      }
    }

    return { name: name, query: query };
  }

  /** 序列化 {name, query} -> '#/name?k=v&k2=v2'，过滤 undefined/null；数组值（如 from）用逗号拼接 */
  function buildHash(name, query){
    var pairs = [];
    if(query){
      for(var k in query){
        if(!Object.prototype.hasOwnProperty.call(query, k)) continue;
        var v = query[k];
        if(v === undefined || v === null) continue;
        if(Array.isArray(v)) v = v.join(',');
        pairs.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
      }
    }
    var hash = '#/' + name;
    if(pairs.length) hash += '?' + pairs.join('&');
    return hash;
  }

  function handleHashChange(){
    var parsed = parseHash(location.hash);
    var prevName = currentState.name;
    var route = routes[parsed.name];
    var el = pageEl(parsed.name);
    var ctx = { name: parsed.name, query: parsed.query, el: el };

    if(prevName && prevName !== parsed.name){
      var prevRoute = routes[prevName];
      if(prevRoute) prevRoute.unmount();
    }

    currentState = parsed;
    setActivePage(parsed.name);
    updateNavActive(parsed);

    if(route){
      if(!route.mounted){
        route.mount(ctx);
        route.mounted = true;
      } else {
        route.update(ctx);
      }
    }
  }

  function updateNavActive(parsed){
    var btns = document.querySelectorAll('.nav-btn[data-go]');
    for(var i = 0; i < btns.length; i++){
      var btn = btns[i];
      var isMatch = btn.dataset.go === parsed.name;
      // 同一目标页可能有多个带不同 data-view 的导航按钮（如"三大业务"/"十大重点任务"
      // 都指向 graph 页），须再比对 data-view 与当前 query.view，避免同时高亮多个按钮。
      // 没有 data-view 的按钮（如"图谱看板"）不是"通配任意 view"，而是显式表示
      // "只在 query.view 也为空时才匹配"——否则修复前的写法会导致它只要 data-go
      // 命中就恒亮，#/graph?view=task 时「十大重点任务」和「图谱看板」会同时点亮。
      if(isMatch){
        if(btn.dataset.view !== undefined){
          isMatch = btn.dataset.view === parsed.query.view;
        } else {
          isMatch = !parsed.query.view;
        }
      }
      btn.classList.toggle('is-active', isMatch);
    }
  }

  function go(name, query){
    location.hash = buildHash(name, query);
  }

  /** 只更新地址栏，不触发 mount/unmount/update，用于转场结束后抹掉 from/t */
  function replace(name, query){
    var hash = buildHash(name, query);
    history.replaceState(null, '', hash);
    var parsed = parseHash(hash);
    currentState = parsed;
  }

  function current(){
    return { name: currentState.name, query: currentState.query };
  }

  /**
   * hashchange 是浏览器异步派发的宏任务，go() 之后不能立刻拿到目标页面 mount 完成后
   * 才存在的 DOM（例如文档页的任务搜索框是运行期动态插入的）。这里统一用一个短延迟
   * 兜底，等 hashchange 处理完（包括同步的 mount/update）后再执行收尾动作。
   */
  function focusSoon(fn){
    setTimeout(fn, 30);
  }

  /**
   * 左侧六边形晶体侧栏的三个入口，落点与通用的 data-go/data-view/data-focus 推导规则
   * 不同，需要在路由层单独修正。index.html 已冻结不能改，但 0-A 早就给了三个按钮
   * 足够互相区分的 data-* 组合，不需要再按 aria-label 中文文案匹配（文案一改就会
   * 悄悄断链，是脆弱设计）：
   *   文档搜索 —— data-go="docs"（没有 data-focus）
   *   图谱搜索 —— data-go="graph"
   *   图谱介绍 —— data-go="docs" data-focus="intro"（intro 是专门留出来的判别标记）
   * 因此判别顺序必须是「先认 data-focus==="intro"，再按 data-go 分流」：图谱介绍
   * 的 data-go 也是 "docs"，如果颠倒顺序会被误判成文档搜索。
   */
  function hexDocsSearch(){
    go('docs', { task: 'T01' });
    focusSoon(function(){
      var input = document.querySelector('#taskFilter .task-filter-input');
      if(input) input.focus();
    });
  }

  function hexGraphSearch(){
    go('graph', { view: 'task' });
    focusSoon(function(){
      var input = document.getElementById('graphSearch');
      if(input) input.focus();
    });
  }

  function hexIntro(){
    // 落点刻意与「图谱搜索」（#/graph?view=task）区分开：如果两者落到同一个 hash，
    // 先点过「图谱搜索」再点「图谱介绍」时 hash 不变，hashchange 都不会触发，
    // 「图谱介绍」就会表现成点了没反应。这里额外带上 focus=hub-task 定位到图谱的
    // 中心装置节点，语义上也贴合「总览介绍」。'graph:intro' 由 graph.js 订阅后
    // 自行决定要不要切到图谱总述面板，本文件只负责导航与广播。
    go('graph', { view: 'task', focus: 'hub-task' });
    if(window.KG.bus && window.KG.bus.emit) window.KG.bus.emit('graph:intro');
  }

  function resolveHexAction(el){
    if(el.dataset.focus === 'intro') return hexIntro;
    if(el.dataset.go === 'docs') return hexDocsSearch;
    if(el.dataset.go === 'graph') return hexGraphSearch;
    return null;
  }

  function bindGlobalClicks(){
    document.addEventListener('click', function(e){
      var el = e.target.closest ? e.target.closest('[data-go]') : null;
      if(!el) return;
      e.preventDefault();

      if(el.classList.contains('hex')){
        var action = resolveHexAction(el);
        if(action){ action(); return; }
      }

      var query = {};
      if(el.dataset.view !== undefined) query.view = el.dataset.view;
      if(el.dataset.focus !== undefined) query.focus = el.dataset.focus;
      go(el.dataset.go, query);
    });

    document.addEventListener('keydown', function(e){
      if(e.key === 'Escape'){
        // 输入框内的 Esc 是「清空/取消编辑」的常规交互习惯（graph 页 #graphSearch、
        // docs 页 .task-filter-input 都是原生 <input>），不应该被全局路由劫持成跳回首页。
        if(e.target && e.target.tagName === 'INPUT') return;
        // graph 页「先关 tooltip/取消聚焦，第二次才回首页」、docs 页玻璃卡「先关卡片，
        // 第二次才回首页」的两段式 Escape 均未实现：graph.js / docs.js 都没有暴露可供
        // 本文件调用的「取消聚焦/关卡片」公开 API，本文件又不允许直接改这两个文件或碰
        // 它们的内部状态。docs 侧后续需要配合：要么暴露一个
        // window.KG.docsPage.closeCard() 之类的方法供这里在 go(DEFAULT_ROUTE) 之前
        // 先尝试调用（返回真值表示"已经消费掉这次 Escape，不用再跳转"），要么反过来
        // 由 docs.js 自己在卡片打开时于捕获阶段监听 Escape 并 stopPropagation，
        // 使这里的全局监听收不到事件。在配合到位之前，非输入框场景统一直接回首页。
        go(DEFAULT_ROUTE, {});
      }
    });
  }

  function init(){
    bindGlobalClicks();
    if(!location.hash || location.hash === '#'){
      history.replaceState(null, '', buildHash(DEFAULT_ROUTE, {}));
    }
    window.addEventListener('hashchange', handleHashChange);
    handleHashChange();
  }

  window.KG.router = {
    register: register,
    go: go,
    replace: replace,
    current: current,
    init: init
  };
})();
