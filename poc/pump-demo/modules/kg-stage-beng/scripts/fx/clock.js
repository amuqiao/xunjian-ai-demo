// scripts/fx/clock.js —— 顶栏时钟：时:分:秒 + 日期 + 星期，逐秒刷新
// 经典脚本写法（IIFE），禁止 import/export/fetch，只暴露 window.KG.clock.start()
(function(){
  'use strict';

  window.KG = window.KG || {};

  // 星期文案，下标对应 Date.prototype.getDay() 的返回值（0 = 星期日）
  var WEEK_TEXT = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

  // 两位数补零，例如 8 -> '08'
  function pad2(n){
    return n < 10 ? ('0' + n) : ('' + n);
  }

  // 读取当前时间并写入三个挂载点：#clockTime / #clockDate / #clockWeek
  function render(){
    var now = new Date();

    var timeEl = document.getElementById('clockTime');
    var dateEl = document.getElementById('clockDate');
    var weekEl = document.getElementById('clockWeek');

    if(timeEl){
      timeEl.textContent = pad2(now.getHours()) + ':' + pad2(now.getMinutes()) + ':' + pad2(now.getSeconds());
    }
    if(dateEl){
      dateEl.textContent = pad2(now.getMonth() + 1) + '月' + pad2(now.getDate()) + '日';
    }
    if(weekEl){
      weekEl.textContent = WEEK_TEXT[now.getDay()];
    }
  }

  var timerId = null;

  // 启动时钟：先立即渲染一次避免首屏空白，再以 1000ms 间隔刷新
  function start(){
    render();
    if(timerId !== null){
      return; // 防止重复调用 start() 叠加出多个定时器
    }
    timerId = setInterval(render, 1000);
  }

  window.KG.clock = { start: start };
})();
