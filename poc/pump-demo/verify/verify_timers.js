// SceneTimers 契约验证脚本（阶段三 G1）。纯 Node，无浏览器：只依赖 global.setTimeout/
// clearTimeout（scripts/core/timers.js 内部通过 window.setTimeout/window.clearTimeout
// 调用，这里手动把 window 搭成一个引用了真实全局定时器函数的普通对象，足够跑通）。
//
// 钉住的语义（对应 scripts/core/timers.js 顶部注释里的设计选择）：
//   1. 硬校验都真的会抛错（sceneKey/fn/delayMs/persist 的类型校验）。
//   2. clearScene(sceneKey) 只清掉该 sceneKey 下的定时器（含 persist=true 的），
//      不影响其它 sceneKey。
//   3. clearAll() 只清掉未标记 persist 的定时器（"渲染级"），persist=true 的
//      "场景生命周期定时器"能跨越 clearAll() 存活——这是 RAG 五段动画需要的
//      "跨 render 存活"语义。
//   4. clearAll() 之后（不含 persist 定时器时）debugInfo().active === 0。
//   5. 定时器自然触发后自动从注册表摘除（不会无限增长）。
//
// 用法（在仓库根或本目录执行均可）：
//   node poc/pump-demo/verify/verify_timers.js
"use strict";

var path = require("path");

global.window = {
  setTimeout: function (fn, delay) { return setTimeout(fn, delay); },
  clearTimeout: function (handle) { return clearTimeout(handle); }
};

require(path.join(__dirname, "..", "scripts", "core", "timers.js"));

var SceneTimers = window.SceneTimers;

var passCount = 0;
var failures = [];

function check(label, condition) {
  if (condition) {
    passCount += 1;
    console.log("PASS " + label);
  } else {
    failures.push(label);
    console.log("FAIL " + label);
  }
}

function checkThrows(label, fn) {
  var threw = false;
  var err = null;
  try {
    fn();
  } catch (e) {
    threw = true;
    err = e;
  }
  if (threw) {
    passCount += 1;
    console.log("PASS " + label + "（抛错：" + err.message + "）");
  } else {
    failures.push(label);
    console.log("FAIL " + label + "（未抛错）");
  }
}

function finish() {
  console.log("");
  if (failures.length === 0) {
    console.log("ALL CHECKS PASSED（" + passCount + " 项断言）");
    process.exit(0);
  } else {
    console.log("FAILED（" + failures.length + " 项失败 / 共 " + (passCount + failures.length) + " 项断言）：");
    failures.forEach(function (label) {
      console.log("  - " + label);
    });
    process.exit(1);
  }
}

// =====================================================================================
// 1. 硬校验都真的会抛错
// =====================================================================================

(function throwsSection() {
  checkThrows("setTimeout 的 sceneKey 非字符串抛错", function () {
    SceneTimers.setTimeout(123, function () {}, 1000);
  });
  checkThrows("setTimeout 的 sceneKey 为空字符串抛错", function () {
    SceneTimers.setTimeout("", function () {}, 1000);
  });
  checkThrows("setTimeout 的 fn 非函数抛错", function () {
    SceneTimers.setTimeout("knowledge", "not-a-fn", 1000);
  });
  checkThrows("setTimeout 的 delayMs 为负数抛错", function () {
    SceneTimers.setTimeout("knowledge", function () {}, -1);
  });
  checkThrows("setTimeout 的 delayMs 非数字抛错", function () {
    SceneTimers.setTimeout("knowledge", function () {}, "1000");
  });
  checkThrows("setTimeout 的 persist 非布尔值抛错", function () {
    SceneTimers.setTimeout("knowledge", function () {}, 1000, "yes");
  });
  checkThrows("clearScene 的 sceneKey 非字符串抛错", function () {
    SceneTimers.clearScene(null);
  });
})();

// =====================================================================================
// 2. clearAll()：只清"渲染级"（未标记 persist）定时器，之后 debugInfo().active === 0
// =====================================================================================

(function clearAllBaseCase() {
  SceneTimers.setTimeout("overview", function () {}, 50000);
  SceneTimers.setTimeout("station", function () {}, 50000);
  SceneTimers.setTimeout("workbench", function () {}, 50000);
  check("注册 3 个渲染级定时器后 debugInfo().active === 3", SceneTimers.debugInfo().active === 3);

  SceneTimers.clearAll();
  check("clearAll() 之后 debugInfo().active === 0（不含 persist 定时器时）", SceneTimers.debugInfo().active === 0);
})();

// =====================================================================================
// 3. clearScene(sceneKey)：只清该 sceneKey 下的定时器，不影响其它 sceneKey
// =====================================================================================

(function clearSceneIsolation() {
  SceneTimers.setTimeout("knowledge", function () {}, 50000);
  SceneTimers.setTimeout("knowledge", function () {}, 50000);
  SceneTimers.setTimeout("graph", function () {}, 50000);
  check("跨场景注册后 debugInfo().active === 3", SceneTimers.debugInfo().active === 3);

  SceneTimers.clearScene("knowledge");
  check("clearScene('knowledge') 之后只剩 graph 的 1 个定时器", SceneTimers.debugInfo().active === 1);

  SceneTimers.clearScene("graph");
  check("clearScene('graph') 之后归零", SceneTimers.debugInfo().active === 0);
})();

// =====================================================================================
// 4. persist=true：跨越 clearAll() 存活（RAG 动画需要的"跨 render 存活"语义），
//    但仍会被 clearScene(sceneKey) 清掉（离开场景这条边界仍然有效）。
// =====================================================================================

(function persistSurvivesClearAll() {
  SceneTimers.clearAll();
  SceneTimers.setTimeout("knowledge", function () {}, 50000, true);
  SceneTimers.setTimeout("knowledge", function () {}, 50000);
  check("注册 1 个 persist + 1 个非 persist 定时器后 debugInfo().active === 2", SceneTimers.debugInfo().active === 2);

  SceneTimers.clearAll();
  check("clearAll() 之后 persist 定时器仍然存活（active === 1）", SceneTimers.debugInfo().active === 1);

  SceneTimers.clearAll();
  check("对同一批 persist 定时器重复调用 clearAll() 仍然不受影响（幂等）", SceneTimers.debugInfo().active === 1);

  SceneTimers.clearScene("knowledge");
  check("离开 knowledge 场景时 clearScene() 连 persist 定时器也一并清掉", SceneTimers.debugInfo().active === 0);
})();

// =====================================================================================
// 5. 定时器自然触发后自动从注册表摘除（异步收尾，最后打印汇总并退出进程）
// =====================================================================================

(function firesAndSelfRemoves() {
  SceneTimers.clearAll();
  var fired = false;
  SceneTimers.setTimeout("fire-scene", function () { fired = true; }, 15);
  check("注册后 debugInfo().active === 1", SceneTimers.debugInfo().active === 1);

  global.setTimeout(function () {
    check("定时器触发后回调确实执行了", fired === true);
    check("定时器触发后自动从注册表摘除，debugInfo().active === 0", SceneTimers.debugInfo().active === 0);
    finish();
  }, 80);
})();
