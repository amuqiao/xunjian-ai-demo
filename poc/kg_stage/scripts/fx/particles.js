/*
 * particles.js —— 通用粒子/星点生成器（子任务 1-E 独占文件）
 * 经典脚本 IIFE，挂到 window.KG.particles，零 import/export/fetch。
 *
 * 用途：给任意容器批量生成用于装饰的 <span> 节点（星点、悬浮尘埃等），
 * 每个节点写入 left/top（百分比）与 --i（序号，供 CSS 用 nth-child 或
 * calc(var(--i) * ...) 错开 animation-delay），具体动画效果完全交给
 * fx.css / 调用方自己的样式表决定，本文件不写任何动画属性。
 *
 * 必须是确定性的：用传入的 seed 驱动一个简单的线性同余生成器（LCG），
 * 不使用 Math.random()，保证同样的 seed 每次刷新产出完全一致的坐标序列，
 * 便于截图回归比对。
 */
(function(global){
  'use strict';

  /**
   * 创建一个确定性伪随机数生成器（32 位线性同余法）。
   * @param {number} seed 种子，任意整数；0 会被强制修正为 1，避免生成器卡死在 0。
   * @returns {function():number} 每次调用返回一个 [0,1) 区间的浮点数。
   */
  function createLcg(seed){
    var state = (Math.floor(seed) || 0) >>> 0;
    if (state === 0){ state = 1; }
    return function(){
      // 参数取自 Numerical Recipes 里常用的一组 32 位 LCG 常数
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  /**
   * 在 root 下挂载一批粒子/星点 span，返回新建的节点数组。
   * @param {Element} root 挂载的父容器，必须已存在于 DOM。
   * @param {Object} [opts]
   * @param {number} [opts.count=60]      粒子数量。
   * @param {string} [opts.className='fx-particle']  每个粒子 span 的 class 名。
   * @param {number} [opts.spread=100]    散布范围，百分比（0~spread% 内随机取 left/top）。
   * @param {number} [opts.seed=1]        LCG 种子，决定确定性的坐标序列。
   * @returns {HTMLSpanElement[]} 本次新建并已 append 到 root 的所有 span 节点。
   */
  function mount(root, opts){
    if (!root || typeof root.appendChild !== 'function'){
      throw new Error('KG.particles.mount: root 必须是一个已存在的 DOM 容器');
    }
    opts = opts || {};
    var count = opts.count != null ? opts.count : 60;
    var className = opts.className || 'fx-particle';
    var spread = opts.spread != null ? opts.spread : 100;
    var seed = opts.seed != null ? opts.seed : 1;

    var rand = createLcg(seed);
    var frag = document.createDocumentFragment();
    var nodes = [];

    for (var i = 0; i < count; i++){
      var span = document.createElement('span');
      span.className = className;
      var left = rand() * spread;
      var top = rand() * spread;
      span.style.left = left.toFixed(2) + '%';
      span.style.top = top.toFixed(2) + '%';
      span.style.setProperty('--i', String(i));
      frag.appendChild(span);
      nodes.push(span);
    }
    root.appendChild(frag);
    return nodes;
  }

  global.KG = global.KG || {};
  global.KG.particles = { mount: mount };
})(window);
