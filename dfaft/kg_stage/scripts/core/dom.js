/*
 * core/dom.js —— DOM 构造与查询工具
 * 挂载到 window.KG.dom。经典脚本方式，禁止 import/export。
 * KG 命名空间在这里第一次建立（本文件是脚本加载顺序里的第一个业务脚本）。
 */
(function(){
  'use strict';

  window.KG = window.KG || {};

  /**
   * 判断是否是"普通属性"以外的特殊 key。
   * class / text / html / style / dataset / vars / on* 均为特殊处理，其余落到 setAttribute。
   */
  function applyStyle(el, style){
    if(!style) return;
    for(var k in style){
      if(!Object.prototype.hasOwnProperty.call(style, k)) continue;
      var v = style[k];
      if(v === undefined || v === null) continue;
      if(k.indexOf('--') === 0){
        el.style.setProperty(k, v);
      } else {
        el.style[k] = v;
      }
    }
  }

  function applyDataset(el, dataset){
    if(!dataset) return;
    for(var k in dataset){
      if(!Object.prototype.hasOwnProperty.call(dataset, k)) continue;
      var v = dataset[k];
      if(v === undefined || v === null) continue;
      el.dataset[k] = v;
    }
  }

  function appendChild(el, child){
    if(child === null || child === undefined || child === false) return;
    if(Array.isArray(child)){
      for(var i = 0; i < child.length; i++) appendChild(el, child[i]);
      return;
    }
    if(typeof child === 'string' || typeof child === 'number'){
      el.appendChild(document.createTextNode(String(child)));
      return;
    }
    if(child instanceof Node){
      el.appendChild(child);
      return;
    }
  }

  /**
   * h(tag, props, children)
   * props 支持：
   *   class    -> className
   *   text     -> textContent（与 html/children 互斥，text 优先级最高）
   *   html     -> innerHTML（用于内联 SVG 图标占位等场景）
   *   style    -> 对象，支持 --自定义 css 变量（等价于 el.style.setProperty）
   *   vars     -> style 的语法糖，专门写 CSS 自定义属性，如 {'--x':100,'--y':-40,'--z':120}
   *   dataset  -> 对象，写 el.dataset
   *   on{Event}-> 如 onClick / onclick，绑定事件监听
   *   其余 key -> 走 setAttribute（如 id / href / for / role / aria-* / data-go 等）
   */
  function h(tag, props, children){
    var el = document.createElement(tag);
    props = props || {};

    for(var key in props){
      if(!Object.prototype.hasOwnProperty.call(props, key)) continue;
      var val = props[key];
      if(val === undefined || val === null) continue;

      if(key === 'class'){
        el.className = val;
      } else if(key === 'text'){
        el.textContent = val;
      } else if(key === 'html'){
        el.innerHTML = val;
      } else if(key === 'style'){
        applyStyle(el, val);
      } else if(key === 'vars'){
        applyStyle(el, val);
      } else if(key === 'dataset'){
        applyDataset(el, val);
      } else if(key.indexOf('on') === 0 && typeof val === 'function'){
        var evt = key.slice(2);
        evt = evt.charAt(0).toLowerCase() + evt.slice(1);
        el.addEventListener(evt, val);
      } else {
        el.setAttribute(key, val);
      }
    }

    if(children !== undefined && props.text === undefined && props.html === undefined){
      appendChild(el, children);
    }

    return el;
  }

  function qs(sel, root){
    return (root || document).querySelector(sel);
  }

  function qsa(sel, root){
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  /** 目前全项目 0 调用（h() 的 vars/style 已经覆盖了创建时写变量的场景），
   *  作为通用工具函数保留，供后续需要"运行期动态改写已存在元素的 CSS 变量"时使用。 */
  function setVars(el, obj){
    if(!el || !obj) return;
    for(var k in obj){
      if(!Object.prototype.hasOwnProperty.call(obj, k)) continue;
      var name = k.indexOf('--') === 0 ? k : ('--' + k);
      el.style.setProperty(name, obj[k]);
    }
  }

  function clear(el){
    if(!el) return;
    while(el.firstChild) el.removeChild(el.firstChild);
  }

  window.KG.dom = {
    h: h,
    qs: qs,
    qsa: qsa,
    setVars: setVars,
    clear: clear
  };
})();
