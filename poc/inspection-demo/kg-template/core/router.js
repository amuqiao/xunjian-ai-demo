/**
 * router.js —— hash 路由
 *
 * 协议（三个视图统一，不再有第二种形状）：
 *   #/stage                 展台全景
 *   #/graph?focus=c_doc     图谱并聚焦某节点
 *   #/tree?focus=d_case_bank 树并定位到某文档（所属类目由 KG.derive.categoryOf 推出，不进 hash）
 *
 * 无 hash 时替换成 #/stage。非法视图名归一为 stage，非法 focus 静默丢弃
 * （F5 刷新后 id 仍然有效，因为 id 是数据源里的稳定 id，不是运行期生成的）。
 */
(function (global) {
  'use strict';

  var KG = global.KG = global.KG || {};
  var DEFAULT = 'stage';

  function parse() {
    var h = location.hash.replace(/^#/, '');
    var m = /^\/([a-z]+)(?:\?(.*))?$/.exec(h);
    if (!m) return { view: DEFAULT, focus: null };

    var view = KG.views.has(m[1]) ? m[1] : DEFAULT;
    var focus = null;
    if (m[2]) {
      m[2].split('&').forEach(function (kv) {
        var p = kv.split('=');
        if (p[0] === 'focus' && p[1]) focus = decodeURIComponent(p[1]);
      });
    }
    if (focus && !KG.derive.get(focus)) focus = null;
    return { view: view, focus: focus };
  }

  function build(view, focus) {
    return '#/' + view + (focus ? '?focus=' + encodeURIComponent(focus) : '');
  }

  KG.router = {
    parse: parse,

    /* replace=true 用于"视图内部改了焦点"的场景，不往浏览器历史里塞记录。
       注意：go() 只负责改 hash，绝不直接调用 onRoute——
       视图激活的唯一驱动路径就是下面那个 hashchange 监听。
       曾经在这里加过一个 suppress 标志想"避免重复响应"，
       结果把唯一的激活路径堵死了：点立牌只改了 hash，视图纹丝不动。 */
    go: function (view, focus, replace) {
      var next = build(view, focus);
      if (location.hash === next) return;
      if (replace) location.replace(location.pathname + location.search + next);
      else location.hash = next;
    },

    start: function (onRoute) {
      window.addEventListener('hashchange', function () {
        onRoute(parse());
      });
      if (!/^#\/[a-z]+/.test(location.hash)) {
        location.replace(location.pathname + location.search + build(DEFAULT, null));
      }
      onRoute(parse());
    }
  };

})(typeof window !== 'undefined' ? window : this);
