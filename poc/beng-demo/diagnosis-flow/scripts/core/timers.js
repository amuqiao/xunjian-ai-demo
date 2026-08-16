// 场景级定时器：注册的定时器绑定到 sceneKey，统一由这里管，不让场景文件各自裸调
// window.setTimeout。必须有——切场景后残留的定时器会继续调 render()，把别的场景反复
// 重渲染。这是生命周期守卫，不是兜底（不吞错、不静默重试）。
//
// 移植自 pump-demo scripts/core/timers.js，机制一行未改。
//
// 两种"清"的边界：
//
// 1. clearAll()：由 boot.js 在每次 render() 开头调用，与 Charts.beginPass() /
//    SelectList.resetRenderPass() 并列，划清"这一轮 render"的边界。它只清掉**未标记
//    persist** 的定时器——这类定时器的语义是"如果在它触发之前又发生了一次 render()，
//    它就已经过期"。
//
// 2. clearScene(sceneKey)：由 boot.js 在真正切换 state.scene 之前对**被离开的那个**
//    sceneKey 调用。它无差别清掉该场景下全部定时器，persist 的也清——persist 允许
//    跨 render 存活，但绝不允许跨"用户已经离开这个场景"存活。
//
// persist 的存在理由：知识库入库动画是"定完时器就等它自己触发"的六段状态机，如果用
// 默认的渲染级定时器注册，会在下一轮 render()（哪怕只是用户点了别的分类）里被
// clearAll() 误杀，动画卡在某一步不再推进，而且**没有任何报错**——这类静默卡住比
// 抛错难查得多。
//
// 默认值选 false 是有意的更安全的默认：忘记传 persist 的调用方表现为"动画提前停了"，
// 比"残留定时器一直在后台跑"更容易发现、后果也更轻。
(function () {
  "use strict";

  var registry = {};
  var nextId = 1;
  var paused = false;

  function assertSceneKey(sceneKey, where) {
    if (typeof sceneKey !== "string" || sceneKey === "") {
      throw new Error(where + " 的 sceneKey 必须是非空字符串");
    }
  }

  function assertTimerArgs(sceneKey, fn, delayMs, persist) {
    assertSceneKey(sceneKey, "SceneTimers.setTimeout");
    if (typeof fn !== "function") throw new Error("SceneTimers.setTimeout 的 fn 必须是函数");
    if (typeof delayMs !== "number" || !isFinite(delayMs) || delayMs < 0) {
      throw new Error("SceneTimers.setTimeout 的 delayMs 必须是不小于 0 的有限数字");
    }
    if (persist != null && typeof persist !== "boolean") {
      throw new Error("SceneTimers.setTimeout 的 persist 必须是布尔值（不传则视为 false）");
    }
  }

  function schedule(id, delayMs) {
    var record = registry[id];
    if (!record) throw new Error("SceneTimers.schedule 收到未知 timer id：" + id);
    record.startedAt = Date.now();
    record.remainingMs = delayMs;
    record.handle = window.setTimeout(function () {
      // 自然触发：先摘除再执行回调，这样回调内部同步抛错也不会在注册表里留死记录。
      delete registry[id];
      record.fn();
    }, delayMs);
  }

  function setSceneTimeout(sceneKey, fn, delayMs, persist) {
    assertTimerArgs(sceneKey, fn, delayMs, persist);

    var id = nextId;
    nextId += 1;

    registry[id] = {
      sceneKey: sceneKey,
      fn: fn,
      delayMs: delayMs,
      remainingMs: delayMs,
      startedAt: 0,
      handle: 0,
      persist: persist === true
    };
    if (!paused) schedule(id, delayMs);
    return id;
  }

  function clearScene(sceneKey) {
    assertSceneKey(sceneKey, "SceneTimers.clearScene");
    Object.keys(registry).forEach(function (id) {
      if (registry[id].sceneKey === sceneKey) {
        window.clearTimeout(registry[id].handle);
        delete registry[id];
      }
    });
  }

  function clearAll() {
    Object.keys(registry).forEach(function (id) {
      if (!registry[id].persist) {
        window.clearTimeout(registry[id].handle);
        delete registry[id];
      }
    });
  }

  function clearEverything() {
    Object.keys(registry).forEach(function (id) {
      window.clearTimeout(registry[id].handle);
      delete registry[id];
    });
  }

  function pauseAll() {
    if (paused) return;
    paused = true;
    var now = Date.now();
    Object.keys(registry).forEach(function (id) {
      var record = registry[id];
      if (!record.handle) return;
      window.clearTimeout(record.handle);
      record.remainingMs = Math.max(0, record.remainingMs - (now - record.startedAt));
      record.handle = 0;
    });
  }

  function resumeAll() {
    if (!paused) return;
    paused = false;
    Object.keys(registry).forEach(function (id) {
      var record = registry[id];
      if (record.handle) return;
      schedule(id, record.remainingMs);
    });
  }

  function debugInfo() {
    var persistCount = 0;
    Object.keys(registry).forEach(function (id) {
      if (registry[id].persist) persistCount += 1;
    });
    return { active: Object.keys(registry).length, persist: persistCount, paused: paused };
  }

  window.SceneTimers = {
    setTimeout: setSceneTimeout,
    clearScene: clearScene,
    clearAll: clearAll,
    clearEverything: clearEverything,
    pauseAll: pauseAll,
    resumeAll: resumeAll,
    debugInfo: debugInfo
  };
})();
