/*
 * state.js — 贯穿全场景的演示状态与订阅(共享契约,由 T0 地基定义)
 *
 * 用法:
 *   DemoState.get('decision')
 *   DemoState.set('decision', 'confirmed')        // 触发对应订阅与 '*' 订阅
 *   DemoState.subscribe('decision', (val, key) => {...})
 *   DemoState.subscribe('*', (val, key) => {...})  // 任意字段变化
 *   DemoState.reset()                              // 回到初始态(用于"重置流程")
 *
 * 约定字段:
 *   currentArea    当前聚焦区域 key(见 DEMO_DATA.areas),默认 'metering'
 *   selectedItem   当前选中的巡检项 key(见 DEMO_DATA.itemDetails),默认 'dp'
 *   currentTrend   当前趋势曲线 key(见 DEMO_DATA.trendSeries),默认 'filterDp'
 *   frameKey       当前关键帧 key: current | compare | plc,默认 'current'
 *   decision       人工复检结论: '' | confirmed | false-positive | observe
 *   archived       是否已归档为案例
 */
(function () {
  "use strict";

  var INITIAL = {
    currentArea: "metering",
    selectedItem: "dp",
    currentTrend: "filterDp",
    frameKey: "current",
    decision: "",
    archived: false,
  };

  var state = Object.assign({}, INITIAL);
  var listeners = { "*": [] };

  function get(key) {
    return state[key];
  }

  function set(key, value) {
    if (!(key in state)) {
      throw new Error("[DemoState] 未知状态字段: " + key);
    }
    var prev = state[key];
    if (prev === value) return value;
    state[key] = value;
    notify(key, value);
    return value;
  }

  // 批量设置(一次性更新多个字段,逐字段派发通知)
  function patch(partial) {
    Object.keys(partial).forEach(function (key) {
      set(key, partial[key]);
    });
  }

  function notify(key, value) {
    (listeners[key] || []).forEach(function (fn) {
      fn(value, key);
    });
    listeners["*"].forEach(function (fn) {
      fn(value, key);
    });
  }

  // 订阅返回取消函数
  function subscribe(key, fn) {
    if (!listeners[key]) listeners[key] = [];
    listeners[key].push(fn);
    return function unsubscribe() {
      listeners[key] = listeners[key].filter(function (f) {
        return f !== fn;
      });
    };
  }

  function reset() {
    Object.keys(INITIAL).forEach(function (key) {
      set(key, INITIAL[key]);
    });
  }

  function snapshot() {
    return Object.assign({}, state);
  }

  window.DemoState = {
    get: get,
    set: set,
    patch: patch,
    subscribe: subscribe,
    reset: reset,
    snapshot: snapshot,
  };
})();
