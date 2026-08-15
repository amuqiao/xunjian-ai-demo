/**
 * transition.js —— 跨视图转场
 * ═══════════════════════════════════════════════════════════════════
 * 单页三视图最值钱的东西：换视图时，被点的那个节点不是消失再出现，
 * 而是**飞过去**。用户的视线不用重新找目标，认知是连续的。
 *
 * 一次转场的时间线：
 *   0ms    在源节点位置造一枚幻影（颜色/尺寸/标签都取自源节点）
 *   0ms    白闪遮罩淡入，同时源视图轻微推近
 *   180ms  commit()：切换视图。此刻旧视图已被白闪盖住，切换过程看不见
 *   ~200ms 目标视图就绪，向它问 locate(focusId) 要落点
 *          —— 树要展开动画、图谱要平移动画，位置不会立刻稳定，
 *             所以这里轮询到拿得到为止，最多等 600ms
 *   +      幻影从源矩形飞到目标矩形并放大到 1:1，白闪同步退去
 *   末     幻影淡出，目标节点弹三圈涟漪
 *
 * 拿不到落点时（节点被折叠、被图例隐藏、目标视图没有对应物），
 * 幻影在原地淡出，白闪照常退去——不报错，也不硬飞到一个错误的位置。
 * ═══════════════════════════════════════════════════════════════════
 */
(function (global) {
  'use strict';

  var KG = global.KG = global.KG || {};

  var LOCATE_TIMEOUT = 600;   // 等目标视图稳定的上限
  var FLY_MS = 620;
  var FLASH_MS = 460;
  var COMMIT_DELAY = 180;     // 白闪盖住画面之后才切视图

  var layer = null;
  var busy = false;

  function ready() {
    if (!layer) layer = document.getElementById('trLayer');
    return layer;
  }

  function makeGhost(rect) {
    var g = document.createElement('div');
    g.className = 'tr-ghost';
    g.style.left = rect.x + 'px';
    g.style.top = rect.y + 'px';
    g.style.width = rect.w + 'px';
    g.style.height = rect.h + 'px';
    g.style.setProperty('--tr-color', rect.color || '#7FA8FF');
    if (rect.label) {
      var t = document.createElement('span');
      t.className = 'tr-ghost-label';
      t.textContent = rect.label;
      g.appendChild(t);
    }
    return g;
  }

  function flash() {
    var f = document.createElement('div');
    f.className = 'tr-flash';
    ready().appendChild(f);
    requestAnimationFrame(function () { f.classList.add('on'); });
    setTimeout(function () {
      f.classList.remove('on');
      setTimeout(function () { f.remove(); }, FLASH_MS);
    }, COMMIT_DELAY + 80);
  }

  function ripple(rect) {
    for (var i = 0; i < 3; i++) {
      (function (i) {
        setTimeout(function () {
          var r = document.createElement('div');
          r.className = 'tr-ripple';
          var cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
          var size = Math.max(rect.w, rect.h);
          r.style.left = (cx - size / 2) + 'px';
          r.style.top = (cy - size / 2) + 'px';
          r.style.width = size + 'px';
          r.style.height = size + 'px';
          r.style.borderColor = rect.color || '#7FA8FF';
          ready().appendChild(r);
          requestAnimationFrame(function () { r.classList.add('on'); });
          setTimeout(function () { r.remove(); }, 900);
        }, i * 140);
      })(i);
    }
  }

  /* 目标视图刚激活时布局还在动，轮询到 locate 拿得到为止 */
  function waitLocate(view, id, done) {
    var t0 = Date.now();
    (function poll() {
      var rect = KG.views.locate(view, id);
      if (rect) { done(rect); return; }
      if (Date.now() - t0 > LOCATE_TIMEOUT) { done(null); return; }
      requestAnimationFrame(poll);
    })();
  }

  KG.transition = {
    play: function (from, targetView, focusId, commit) {
      if (busy || !from) { commit(); return; }
      busy = true;

      var ghost = makeGhost(from);
      ready().appendChild(ghost);
      ready().classList.add('is-playing');
      flash();

      setTimeout(function () {
        /* commit() 会一路调到视图的 focus()，而视图对不认识的 id 是**故意** throw 的。
           异常必须照原样抛出去（这是 fail-fast 的信号，不能吞），
           但转场层自己的状态机得先复位：busy 和 is-playing 一旦卡住，
           那层 z-index:60 的全屏遮罩就永远吃掉鼠标事件，整块大屏再也点不动，
           现场只能刷新页面。所以这里是 catch → 复位 → 继续抛。 */
        try {
          commit();
        } catch (e) {
          finish(null);
          throw e;
        }

        if (!focusId) { finish(null); return; }
        waitLocate(targetView, focusId, finish);
      }, COMMIT_DELAY);

      var finished = false;
      function finish(to) {
        if (finished) return;   // waitLocate 超时与异常复位可能都走到这里，只认第一次
        finished = true;

        if (to) {
          var sx = from.x + from.w / 2, sy = from.y + from.h / 2;
          var tx = to.x + to.w / 2, ty = to.y + to.h / 2;
          ghost.style.transition = 'transform ' + FLY_MS + 'ms cubic-bezier(.22,.85,.28,1), opacity ' + FLY_MS + 'ms ease';
          ghost.style.transform = 'translate(' + (tx - sx) + 'px,' + (ty - sy) + 'px) scale(' +
            (to.w / Math.max(from.w, 1)) + ',' + (to.h / Math.max(from.h, 1)) + ')';
          ghost.style.opacity = '0';
          setTimeout(function () { ripple(to); }, FLY_MS * 0.72);
        } else {
          ghost.style.transition = 'opacity 260ms ease';
          ghost.style.opacity = '0';
        }

        setTimeout(function () {
          ghost.remove();
          ready().classList.remove('is-playing');
          busy = false;
        }, FLY_MS + 60);
      }
    }
  };

})(typeof window !== 'undefined' ? window : this);
