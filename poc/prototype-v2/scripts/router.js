/*
 * router.js — 场景路由 + 转场编排(共享契约,T0 地基定义)
 *
 * 场景注册:
 *   Router.register('analysis', {
 *     onEnter: function(ctx) {...},   // ctx = { from, direction, area, ... }
 *     onLeave: function(ctx) {...},   // 可选
 *   });
 *
 * 场景切换:
 *   Router.go('analysis', { area: 'metering' });          // 方向自动推断
 *   Router.go('overview', { direction: 'back' });         // 强制方向
 *   Router.go('recheck', { direction: 'jump' });          // 遥控器跳转
 *
 * 方向(direction)决定转场动画:
 *   drill  下钻(镜头前推)  —— 场景索引变大时默认
 *   back   退回(镜头后拉)  —— 场景索引变小时默认
 *   jump   平级跳转(淡入淡出)—— 遥控器/进度轴点击
 *
 * 其它:
 *   Router.current()                 当前场景名
 *   Router.start()                   读 hash 初始化(默认 overview)
 *   Router.onChange(fn)              订阅场景变化 (name, ctx)
 */
(function () {
  "use strict";

  var DATA = window.DEMO_DATA;
  var ORDER = DATA.sceneOrder;
  var SCENE_DUR = 460; // 与 --dur-scene 对齐,留余量清理 is-leaving

  var handlers = {};       // name -> {onEnter, onLeave}
  var changeSubs = [];
  var current = null;

  function stageEl() { return document.getElementById("stage"); }
  function sceneEl(name) { return document.querySelector('.scene[data-scene="' + name + '"]'); }

  function register(name, h) {
    if (ORDER.indexOf(name) === -1) {
      throw new Error("[Router] 未知场景: " + name);
    }
    handlers[name] = h || {};
  }

  function inferDirection(from, to) {
    if (!from) return "drill";
    var a = ORDER.indexOf(from), b = ORDER.indexOf(to);
    if (b > a) return "drill";
    if (b < a) return "back";
    return "jump";
  }

  function go(name, opts) {
    opts = opts || {};
    if (ORDER.indexOf(name) === -1) throw new Error("[Router] 未知场景: " + name);
    if (name === current && !opts.force) {
      // 同场景:仍允许 onEnter 刷新(如从遥控器重复点击),但不做转场
      if (handlers[name] && handlers[name].onEnter) {
        handlers[name].onEnter({ from: current, direction: "none", area: opts.area, opts: opts });
      }
      return;
    }

    var from = current;
    var direction = opts.direction || inferDirection(from, name);
    var ctx = { from: from, direction: direction, area: opts.area, opts: opts };

    stageEl().dataset.dir = direction;

    if (from && handlers[from] && handlers[from].onLeave) {
      handlers[from].onLeave(ctx);
    }

    // 幂等设置场景显隐:目标场景 active,其余原本 active 的转为 leaving。
    // 不做互斥锁——允许快速连续切换打断上一次转场,最终状态始终一致。
    var leaving = [];
    ORDER.forEach(function (n) {
      var s = sceneEl(n);
      if (!s) return;
      if (n === name) {
        s.classList.remove("is-leaving");
        s.classList.add("is-active");
      } else if (s.classList.contains("is-active")) {
        s.classList.remove("is-active");
        s.classList.add("is-leaving");
        leaving.push(s);
      }
    });

    current = name;
    if (opts.updateHash !== false && ("#" + name) !== window.location.hash) {
      window.location.hash = name;
    }

    if (handlers[name] && handlers[name].onEnter) {
      handlers[name].onEnter(ctx);
    }

    changeSubs.forEach(function (fn) { fn(name, ctx); });

    // 转场动画结束后清掉 leaving(若未在此期间被重新激活)
    window.setTimeout(function () {
      leaving.forEach(function (s) {
        if (!s.classList.contains("is-active")) s.classList.remove("is-leaving");
      });
    }, SCENE_DUR);
  }

  function onChange(fn) {
    changeSubs.push(fn);
    return function () { changeSubs = changeSubs.filter(function (f) { return f !== fn; }); };
  }

  function start() {
    var initial = (window.location.hash || "").replace("#", "");
    if (ORDER.indexOf(initial) === -1) initial = ORDER[0];
    go(initial, { direction: "jump", updateHash: true });
  }

  // hash 变化(浏览器前进/后退或手动改 hash)驱动路由。
  // go() 内改 hash 时 current 已等于目标,name !== current 天然幂等,不会重复触发。
  window.addEventListener("hashchange", function () {
    var name = (window.location.hash || "").replace("#", "");
    if (ORDER.indexOf(name) !== -1 && name !== current) {
      go(name, { updateHash: false });
    }
  });

  window.Router = {
    register: register,
    go: go,
    current: function () { return current; },
    onChange: onChange,
    start: start,
  };
})();
