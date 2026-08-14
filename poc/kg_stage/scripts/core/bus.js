/*
 * core/bus.js —— 极简事件总线 + 内存暂存区
 * 挂载到 window.KG.bus。
 * stash/take/peek 用于转场时传递"视觉载荷"（源色、源矩形、标签等），
 * 这些数据不进 hash，避免 URL 携带展示态数据。
 */
(function(){
  'use strict';

  window.KG = window.KG || {};

  var listeners = {};
  var stashMap = {};

  function on(evt, fn){
    if(!listeners[evt]) listeners[evt] = [];
    listeners[evt].push(fn);
  }

  function off(evt, fn){
    if(!listeners[evt]) return;
    if(fn === undefined){
      delete listeners[evt];
      return;
    }
    listeners[evt] = listeners[evt].filter(function(f){ return f !== fn; });
  }

  function emit(evt, payload){
    var arr = listeners[evt];
    if(!arr) return;
    // 复制一份，防止回调中 off 自身导致遍历错乱
    arr.slice().forEach(function(fn){
      fn(payload);
    });
  }

  /**
   * 现状说明（不是删除建议，另有 agent 在处理 transition.js，这三个 API 保留）：
   * stash 目前全项目只被 scripts/transition.js 写过 1 次，take/peek 全项目 0 调用——
   * transition.js 实际的转场 payload 走的是 Promise 闭包传递，并未真正依赖这套
   * 暂存区。是否要把 transition.js 收敛到用 stash/take 传值、还是反过来精简掉这里，
   * 由 transition.js 侧决定，本文件不擅自删除对外 API。
   */
  function stash(key, val){
    stashMap[key] = val;
  }

  /** 取出并清空 */
  function take(key){
    var v = stashMap[key];
    delete stashMap[key];
    return v;
  }

  /** 只读取不清空 */
  function peek(key){
    return stashMap[key];
  }

  window.KG.bus = {
    on: on,
    off: off,
    emit: emit,
    stash: stash,
    take: take,
    peek: peek
  };
})();
