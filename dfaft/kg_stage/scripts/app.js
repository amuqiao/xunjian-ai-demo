/*
 * app.js —— 应用启动入口
 * 依赖顺序里的最后一个脚本，负责把各模块串起来并跑起来。
 */
(function(){
  'use strict';

  window.KG = window.KG || {};

  function bootstrap(){
    // 启动等比缩放（scale.js 自身在加载时已 recalc 一次，这里再保险触发一次）
    if(window.KG.scale && window.KG.scale.recalc) window.KG.scale.recalc();

    // 启动顶栏时钟。KG.clock 由 scripts/fx/clock.js 在本文件之前加载并挂载，
    // 三页模块也都已就位（见 index.html 的 <script> 加载顺序），不再需要
    // 并行开发期遗留的可选链兜底——依赖缺失应该直接抛 TypeError 暴露问题，
    // 而不是静默跳过导致页面空白却控制台毫无异常。
    window.KG.clock.start();

    // 注册三个页面
    window.KG.stagePage.register();
    window.KG.graphPage.register();
    window.KG.docsPage.register();

    // 启动路由：init() 内部会处理默认路由 #/stage，并同步完成首页 mount（handleHashChange
    // 在 init() 里是同步调用的）。所以走到下面的 rAF 时，「三页注册完成 + 首个页面 mount
    // 完成」这两个前置条件已经满足，__KG_READY__ 的置位时机 = 这两者 + 再等两帧 rAF
    // （确保首帧布局 / 样式已经真正应用到屏幕上，而不是刚刚才把 DOM 挂进文档）。
    window.KG.router.init();

    requestAnimationFrame(function(){
      requestAnimationFrame(function(){
        window.__KG_READY__ = true;
      });
    });

    // 调试模式：?debug 时打印数据校验结果与统计信息
    if(location.search.indexOf('debug') !== -1){
      console.log('[KG] index.validate() =>', window.KG.index?.validate?.());
      console.log('[KG] index.stats =>', window.KG.index?.stats);
    }
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
