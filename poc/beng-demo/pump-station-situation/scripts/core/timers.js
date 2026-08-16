// 场景级定时器（阶段三 G1）：注册的定时器绑定到 sceneKey，统一由这里管，不让场景文件
// 各自裸调 window.setTimeout。必须有：切场景后残留的定时器会继续调 render()，
// 把别的场景反复重渲染——这是生命周期守卫，不是兜底（不吞错、不静默重试）。
//
// 两种"清"的边界，对应两种不同粒度的失效场景（都在 boot.js 接，本文件只提供机制）：
//
// 1. clearAll()：对应 core/charts.js 的 beginPass() /
//    scripts/ui/selectlist.js 的 resetRenderPass() 那同一种"每轮 render 划清边界"
//    模式——由 boot.js 在每次 render() 开头调用。它只清掉**未标记 persist** 的定时器
//    （下面叫"渲染级定时器"）：这类定时器的默认语义是"如果在它触发之前又发生了一次
//    render()，它就已经过期，不应该再触发"，与 Charts.beginPass() 丢弃上一轮未 flush
//    的 option 队列是同一个道理——上一轮的渲染结果已经被 stage.innerHTML="" 整体重建，
//    对应的定时器逻辑基本也跟着过期。
//
// 2. clearScene(sceneKey)：对应"离开某个场景"这个更粗的边界——由 boot.js 在
//    setScene() 里、真正把 state.scene 切换到别的场景之前调用（对被离开的那个
//    sceneKey）。它无差别清掉该 sceneKey 下**全部**定时器，不管有没有标记 persist：
//    persist 定时器"允许跨 render 存活"，但绝不允许跨"用户已经离开这个场景"存活，
//    这正是本文件顶部要防的那类 bug（残留定时器在别的场景里继续调 render()）。
//
// "跨 render 存活"的语义选择：知识库上传的 RAG 五段处理动画需要这样一串状态机——
// 点击"开始处理" → 写 state + render()（这次 render() 会触发 clearAll()，因为
// clearAll() 每轮都跑）→ 之后一段时间后自动推进到下一阶段 + 再 render() ……
// 如果这类"定完时器就等它自己触发"的动画用默认的渲染级定时器注册，会在触发动画的
// 那次 render() 的**下一轮** render()（可能是同一个知识库场景内任何其它交互，比如
// 用户点了别的分类）里被 clearAll() 误杀，动画卡在某一步不再推进，而且没有任何报错
// ——这类"静默卡住"比抛错更难排查。
//
// 用第 4 个参数 persist（显式布尔值，不传按 false 处理）标记"这是一个场景生命周期
// 定时器，允许跨 render 存活"，而不是反过来让 clearAll() 默认放过所有定时器——
// 后者会让"切场景后残留定时器继续 render()"这个本该被防住的 bug 重新变成默认行为，
// 每个调用点都要记得手动清理，等于把生命周期守卫的责任推给了调用方。默认值选
// false（更容易被 clearAll() 清掉）是有意的更安全的默认：忘记传 persist 的调用方会
// 在下一轮 render() 里被清掉，表现是"动画/轮询提前停了"，比"忘记传 persist 导致
// 残留定时器一直在后台跑"更容易在测试里发现、后果也更轻。
(function () {
  "use strict";

  // registry：id -> { sceneKey, handle, persist }。handle 是 window.setTimeout()
  // 返回的句柄，用于 clearScene/clearAll 对应调用 window.clearTimeout()；定时器
  // 自然触发时会在执行回调前先把自己从 registry 里摘掉，避免注册表无限增长。
  var registry = {};
  var nextId = 1;
  var paused = false;

  function assertSceneKey(sceneKey, where) {
    if (typeof sceneKey !== "string" || sceneKey === "") {
      throw new Error(where + " 的 sceneKey 必须是非空字符串");
    }
  }

  function assertFn(fn) {
    if (typeof fn !== "function") {
      throw new Error("SceneTimers.setTimeout 的 fn 必须是函数");
    }
  }

  function assertDelay(delayMs) {
    if (typeof delayMs !== "number" || !isFinite(delayMs) || delayMs < 0) {
      throw new Error("SceneTimers.setTimeout 的 delayMs 必须是不小于 0 的有限数字");
    }
  }

  // persist 是可选字段：不传（undefined/null）按 false 处理，传了就必须是布尔值——
  // 不允许传真值/假值意义上"看起来像"布尔的其它类型（1/"true"/0 等），调用方的
  // 意图必须显式写清楚，这不是"参数缺失时的兜底"，而是像 DetailCard/SelectList 里
  // 一贯的可选字段写法（options.xxx != null 时才校验类型）。
  function assertPersist(persist) {
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
      // 自然触发：先从注册表摘除，再执行调用方的回调——这样回调内部即使同步抛错，
      // 注册表也不会留下一条已经触发过的死记录。
      delete registry[id];
      record.fn();
    }, delayMs);
  }

  function setSceneTimeout(sceneKey, fn, delayMs, persist) {
    assertSceneKey(sceneKey, "SceneTimers.setTimeout");
    assertFn(fn);
    assertDelay(delayMs);
    assertPersist(persist);

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

  // 清掉某个场景下的**全部**定时器（不管是否 persist）。由 boot.js 在真正切换
  // state.scene 之前、对"即将被离开的那个 sceneKey"调用。
  function clearScene(sceneKey) {
    assertSceneKey(sceneKey, "SceneTimers.clearScene");
    Object.keys(registry).forEach(function (id) {
      var record = registry[id];
      if (record.sceneKey === sceneKey) {
        window.clearTimeout(record.handle);
        delete registry[id];
      }
    });
  }

  // 清掉**全部场景**下未标记 persist 的定时器（"渲染级"定时器）。由 boot.js 在每次
  // render() 开头调用，与 Charts.beginPass()/SelectList.resetRenderPass() 并列，
  // 划清"这一轮 render"的边界。persist===true 的场景生命周期定时器不受影响，
  // 只能被 clearScene(sceneKey) 或它自己触发这两种方式清掉。
  function clearAll() {
    Object.keys(registry).forEach(function (id) {
      var record = registry[id];
      if (!record.persist) {
        window.clearTimeout(record.handle);
        delete registry[id];
      }
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
    pauseAll: pauseAll,
    resumeAll: resumeAll,
    debugInfo: debugInfo
  };
})();
