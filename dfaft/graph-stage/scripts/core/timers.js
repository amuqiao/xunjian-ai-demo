// core/timers.js —— 场景级定时器：注册的定时器绑定到 sceneKey（对应 L6 三个场景
// stage/graph/docs 之一），统一由这里管理，不让场景文件各自裸调
// window.setTimeout。改写自 poc/hunan-inspection-overview/scripts/core/timers.js，
// 语义与实现未改动，只是把注释里"切场景"的例子换成本 POC 的三页场景。
//
// 必须有的理由：本 POC 是三页大屏（3D 环形展台 / 图谱搜索 / 文档搜索），切页不
// 卸载 DOM（styles/04-shell.css 的 .page 靠 opacity+visibility 切换），如果某个
// 场景注册的定时器在离开后不清，会一直在后台调 render()，把已经离开的场景反复
// 重渲染——这是生命周期守卫，不是兜底（不吞错、不静默重试，登记不完整时该在
// 哪里报错就在哪里报错）。
//
// 两种"清"的边界，对应两种不同粒度的失效场景（都在 boot.js 接，本文件只提供机制）：
//
// 1. clearAll()：每轮 render() 开头调用，只清掉未标记 persist 的定时器（"渲染级"
//    定时器）——这类定时器的默认语义是"如果在它触发之前又发生一次 render()，它就
//    已经过期，不该再触发"。
//
// 2. clearScene(sceneKey)：离开某个场景（切 .page）时调用，无差别清掉该 sceneKey
//    下**全部**定时器（不管有没有标记 persist）：persist 定时器"允许跨 render 存
//    活"，但绝不允许跨"用户已经离开这个场景"存活。
//
// "跨 render 存活"的典型用例：图谱搜索页展开一个横切维度的分步高亮动画——点击
// "定位到本领域" -> 写 state + render()（这次 render() 会触发 clearAll()）-> 之后
// 延迟一段时间自动推进到下一步 + 再 render() ……如果这类"定完时器就等它自己触发"
// 的动画用默认的渲染级定时器注册，会在触发它的那次 render() 的**下一轮**
// render()（可能是同一场景内任何其它交互）里被 clearAll() 误杀，动画卡在某一步
// 不再推进，且没有任何报错——这类"静默卡住"比抛错更难排查。
//
// 用第 4 个参数 persist（显式布尔值，不传按 false 处理）标记"这是一个场景生命周期
// 定时器，允许跨 render 存活"，而不是反过来让 clearAll() 默认放过所有定时器——
// 后者会让"切场景后残留定时器继续 render()"这个本该被防住的 bug 重新变成默认行
// 为，每个调用点都要记得手动清理，等于把生命周期守卫的责任推给了调用方。默认值
// 选 false（更容易被 clearAll() 清掉）是有意的更安全的默认：忘记传 persist 的调用
// 方会在下一轮 render() 里被清掉，表现是"动画/轮询提前停了"，比"忘记传 persist
// 导致残留定时器一直在后台跑"更容易在测试里发现、后果也更轻。
(function () {
  "use strict";

  // registry：id -> { sceneKey, handle, persist }。handle 是 window.setTimeout()
  // 返回的句柄，用于 clearScene/clearAll 对应调用 window.clearTimeout()；定时器
  // 自然触发时会在执行回调前先把自己从 registry 里摘掉，避免注册表无限增长。
  var registry = {};
  var nextId = 1;

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

  // persist 是可选字段：不传（undefined/null）按 false 处理，传了就必须是布尔
  // 值——不允许传真值/假值意义上"看起来像"布尔的其它类型（1/"true"/0 等），调用
  // 方的意图必须显式写清楚，这不是"参数缺失时的兜底"，而是可选字段的一贯写法
  // （options.xxx != null 时才校验类型）。
  function assertPersist(persist) {
    if (persist != null && typeof persist !== "boolean") {
      throw new Error("SceneTimers.setTimeout 的 persist 必须是布尔值（不传则视为 false）");
    }
  }

  function setSceneTimeout(sceneKey, fn, delayMs, persist) {
    assertSceneKey(sceneKey, "SceneTimers.setTimeout");
    assertFn(fn);
    assertDelay(delayMs);
    assertPersist(persist);

    var id = nextId;
    nextId += 1;

    var handle = window.setTimeout(function () {
      // 自然触发：先从注册表摘除，再执行调用方的回调——这样回调内部即使同步
      // 抛错，注册表也不会留下一条已经触发过的死记录。
      delete registry[id];
      fn();
    }, delayMs);

    registry[id] = {
      sceneKey: sceneKey,
      handle: handle,
      persist: persist === true
    };

    return id;
  }

  // 清掉某个场景下的**全部**定时器（不管是否 persist）。由 boot.js 在真正切换
  // 到别的场景之前、对"即将被离开的那个 sceneKey"调用。
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

  // 清掉**全部场景**下未标记 persist 的定时器（"渲染级"定时器）。由 boot.js 在
  // 每次 render() 开头调用，划清"这一轮 render"的边界。persist===true 的场景
  // 生命周期定时器不受影响，只能被 clearScene(sceneKey) 或它自己触发这两种方式
  // 清掉。
  function clearAll() {
    Object.keys(registry).forEach(function (id) {
      var record = registry[id];
      if (!record.persist) {
        window.clearTimeout(record.handle);
        delete registry[id];
      }
    });
  }

  function debugInfo() {
    return { active: Object.keys(registry).length };
  }

  window.SceneTimers = {
    setTimeout: setSceneTimeout,
    clearScene: clearScene,
    clearAll: clearAll,
    debugInfo: debugInfo
  };
})();
