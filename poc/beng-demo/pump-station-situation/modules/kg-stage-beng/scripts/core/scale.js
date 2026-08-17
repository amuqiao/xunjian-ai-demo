/*
 * core/scale.js —— #screen 等比缩放 + 视口/设计坐标互转
 * 挂载到 window.KG.scale。
 */
(function(){
  'use strict';

  window.KG = window.KG || {};

  var DESIGN_W = 1920;
  var DESIGN_H = 1080;
  var currentK = 1;
  var screenEl = null;

  function getScreenEl(){
    if(!screenEl) screenEl = document.getElementById('screen');
    return screenEl;
  }

  function recalc(){
    var w = window.innerWidth;
    var h = window.innerHeight;
    var k = Math.min(w / DESIGN_W, h / DESIGN_H);
    currentK = k;
    document.documentElement.style.setProperty('--s', k);
    document.documentElement.classList.toggle('kg-stable-motion', shouldUseStableMotion());
    return k;
  }

  function shouldUseStableMotion(){
    var params = new URLSearchParams(location.search);
    if(params.get('stable') === '1') return true;
    if(window.parent === window && window.innerWidth <= 1500) return true;
    return false;
  }

  function get(){
    return currentK;
  }

  /**
   * 把视口坐标（clientX/clientY）换算成 1920x1080 设计坐标。
   * 先减去 #screen 的 getBoundingClientRect() 左上角，再除以 k。
   */
  function toDesign(clientX, clientY){
    var el = getScreenEl();
    var k = currentK || 1;
    if(!el){
      return { x: clientX / k, y: clientY / k };
    }
    var rect = el.getBoundingClientRect();
    return {
      x: (clientX - rect.left) / k,
      y: (clientY - rect.top) / k
    };
  }

  /**
   * 把一个 DOMRect（视口坐标系）换算成设计坐标系下的 {x,y,w,h}，
   * x/y 取矩形中心点。
   */
  function rectToDesign(domRect){
    var k = currentK || 1;
    var el = getScreenEl();
    var origin = el ? el.getBoundingClientRect() : { left: 0, top: 0 };
    var cx = domRect.left + domRect.width / 2;
    var cy = domRect.top + domRect.height / 2;
    return {
      x: (cx - origin.left) / k,
      y: (cy - origin.top) / k,
      w: domRect.width / k,
      h: domRect.height / k
    };
  }

  window.addEventListener('resize', recalc);
  recalc();

  window.KG.scale = {
    get: get,
    toDesign: toDesign,
    rectToDesign: rectToDesign,
    recalc: recalc,
    DESIGN_W: DESIGN_W,
    DESIGN_H: DESIGN_H
  };
})();
