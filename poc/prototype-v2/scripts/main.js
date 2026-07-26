/*
 * main.js — 启动器。
 * 场景与遥控器在各自 script 顶层已完成 Router.register / 订阅,
 * 这里在 DOM 就绪后填充顶栏信息并启动路由。
 *
 * 注:开场引入串接、闭环端到端联动、重置流程等集成逻辑在“集成收尾(T7)”阶段增强。
 */
(function () {
  "use strict";

  var DATA = window.DEMO_DATA;

  function boot() {
    // 直接赋值:缺字段即抛错暴露,不做静默兜底
    document.getElementById("clock").innerHTML =
      "<strong>" + DATA.site.clock + "</strong> · 任务批次 " + DATA.site.batch;
    document.getElementById("brandSub").textContent =
      DATA.site.name + " · " + DATA.site.subtitle;

    window.Router.start();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
