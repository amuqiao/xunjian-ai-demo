/*
 * graph/graph-option.js —— ECharts graph 系列 option 深度定制
 * 挂载到 window.KG.graphOption。
 *
 * 重要约束：
 *   - itemStyle / lineStyle / label 等最终由 <canvas> 绘制的属性，一律不能写
 *     `var(--xxx)`（canvas 2D 上下文不认识 CSS 自定义属性），必须先用
 *     getComputedStyle 把 tokens.css 里的变量解析成真实的十六进制颜色再传给 ECharts。
 *     只有 tooltip（ECharts 用真实 DOM 渲染）可以在 formatter 返回的 HTML /
 *     extraCssText 里直接写 var(--xxx)。
 *   - 颜色只从 tokens.css 变量取，不允许任何硬编码色值魔数。
 *
 * 经典脚本 IIFE，零 import/export/fetch。
 */
(function (global) {
  'use strict';

  var KG = global.KG = global.KG || {};

  /* ============================================================
   * 一、CSS 变量 → 真实颜色值（只解析一次，运行期不变）
   * ========================================================== */

  var resolvedVarCache = {};
  function cssVar(name) {
    if (resolvedVarCache[name] !== undefined) return resolvedVarCache[name];
    var v = getComputedStyle(document.documentElement).getPropertyValue(name);
    v = (v || '').trim();
    resolvedVarCache[name] = v;
    return v;
  }

  function hexToRgb(hex) {
    var h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
    var num = parseInt(h, 16);
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
  }

  /** 把 hex 颜色转成指定透明度的 rgba() 字符串；已经是 rgba()/rgb() 的直接透传 alpha 替换较复杂，这里图谱四色分层与主色均为 hex，够用 */
  function rgba(hex, a) {
    if (hex.indexOf('#') !== 0) return hex;
    var c = hexToRgb(hex);
    return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + a + ')';
  }

  /** 节点类型 → 解析后的 hex 主色 */
  function colorHexOf(node) {
    var varName = KG.index.colorOf(node); // '--n-task' 之类
    var v = cssVar(varName);
    return v || cssVar('--n-root');
  }

  /* ============================================================
   * 二、节点尺寸 / 辉光分级（对照参考图 1）
   * ========================================================== */

  // 每种类型的 symbolSize 区间与辉光半径，weight(1-6) 在区间内线性插值
  var TYPE_STYLE = {
    root: { sizeMin: 48, sizeMax: 56, glow: 40, borderW: 3.2, labelShow: true, fontSize: 20, fontWeight: 700 },
    task: { sizeMin: 24, sizeMax: 40, glow: 24, borderW: 2.4, labelShow: true, fontSize: 14, fontWeight: 600 },
    domain: { sizeMin: 24, sizeMax: 38, glow: 22, borderW: 2.3, labelShow: true, fontSize: 14, fontWeight: 600 },
    business: { sizeMin: 24, sizeMax: 38, glow: 22, borderW: 2.3, labelShow: true, fontSize: 14, fontWeight: 600 },
    direction: { sizeMin: 14, sizeMax: 24, glow: 16, borderW: 1.8, labelShow: true, fontSize: 11, fontWeight: 500 },
    technology: { sizeMin: 8, sizeMax: 15, glow: 10, borderW: 1.3, labelShow: false, fontSize: 10, fontWeight: 400 },
    content: { sizeMin: 5, sizeMax: 9, glow: 6, borderW: 1, labelShow: false, fontSize: 9, fontWeight: 400 }
  };

  function styleOf(type) {
    return TYPE_STYLE[type] || TYPE_STYLE.technology;
  }

  function symbolSizeOf(node) {
    var st = styleOf(node.type);
    var w = Math.max(1, Math.min(6, node.weight || 1));
    var t = (w - 1) / 5;
    return Math.round(st.sizeMin + t * (st.sizeMax - st.sizeMin));
  }

  /* ============================================================
   * 三、边分层（对照参考图 1「关系张力」——主干粗亮、跨支线细淡带弧）
   * ========================================================== */

  // 一级类型：视角中心直接下挂的第一层（task 视角=task，domain 视角=domain，business 视角=business）
  var TIER1_TYPES = { task: true, domain: true, business: true };

  var EDGE_TIER = {
    trunk0: { width: 2.6, opacity: 0.85, curveness: 0.18, dashed: false },   // 中心 → 一级
    trunk1: { width: 1.9, opacity: 0.6, curveness: 0.18, dashed: false },    // 一级 → 二级（task→direction 等）
    attach: { width: 1.3, opacity: 0.48, curveness: 0.22, dashed: false },   // domainOf/bizOf 横向挂载边
    leaf: { width: 1.05, opacity: 0.36, curveness: 0.18, dashed: false },    // 其余 contains（direction→technology）
    tension: { width: 0.9, opacity: 0.22, curveness: 0.32, dashed: true }    // relatesTo/supports 跨支线张力边
  };

  function tierKeyOf(edge, byId, hubId) {
    if (edge.s === hubId) return 'trunk0';
    if (edge.rel === 'supports' || edge.rel === 'relatesTo') return 'tension';
    var srcNode = byId[edge.s];
    if (srcNode && TIER1_TYPES[srcNode.type] && edge.rel !== 'domainOf' && edge.rel !== 'bizOf') return 'trunk1';
    if (edge.rel === 'domainOf' || edge.rel === 'bizOf') return 'attach';
    return 'leaf';
  }

  /* ============================================================
   * 四、hub 查找（与 graph-layout 保持一致的口径）
   * ========================================================== */

  function findHub(nodes) {
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].type === 'root') return nodes[i].id;
    }
    return nodes[0] && nodes[0].id;
  }

  /**
   * 主干边列表（供 graph.js 做「流光边」像素坐标同步），限制在 30 条以内：
   * 优先取「中心 → 一级」的全部边，剩余配额从「一级 → 二级」里按 id 稳定顺序取。
   */
  function trunkEdgesOf(view) {
    var nodes = KG.index.nodesFor(view);
    var edges = KG.index.edgesFor(view);
    var byId = {};
    nodes.forEach(function (n) { byId[n.id] = n; });
    var hubId = findHub(nodes);

    var t0 = [], t1 = [];
    edges.forEach(function (e) {
      var tier = tierKeyOf(e, byId, hubId);
      if (tier === 'trunk0') t0.push(e);
      else if (tier === 'trunk1') t1.push(e);
    });
    t1.sort(function (a, b) { return (a.s + a.t) < (b.s + b.t) ? -1 : 1; });

    var budget = 30;
    var picked = t0.slice(0, budget);
    var remain = budget - picked.length;
    if (remain > 0) picked = picked.concat(t1.slice(0, remain));
    return picked;
  }

  /* ============================================================
   * 五、tooltip：玻璃卡 formatter
   * ========================================================== */

  function truncate(str, n) {
    str = String(str || '');
    return str.length > n ? (str.slice(0, n) + '…') : str;
  }

  function tooltipFormatter(params) {
    if (params.dataType !== 'node') return '';
    var node = KG.index.byId[params.data.id];
    if (!node) return '';
    var kicker = KG.index.labelOf(node);
    var summary = truncate(node.summary, 80);
    return (
      '<div class="graph-tip">' +
        '<div class="graph-tip-kicker">' + kicker + '</div>' +
        '<div class="graph-tip-title">' + node.name + '</div>' +
        '<div class="graph-tip-body">' + summary + '</div>' +
      '</div>'
    );
  }

  /* ============================================================
   * 六、主构建函数
   * ========================================================== */

  /**
   * build(view, layout, focusId)
   * layout 来自 KG.graphLayout.compute(view, w, h)。
   * 返回 { option, nodeIndexById, trunkEdges }：
   *   option        —— 可直接 chart.setOption 的完整 ECharts 配置
   *   nodeIndexById —— 节点 id → series.data 下标，供 graph.js 做 dispatchAction 定位
   *   trunkEdges    —— 主干边列表（{s,t}），供 graph.js 同步「流光边」像素坐标
   */
  function build(view, layout, focusId) {
    var nodes = KG.index.nodesFor(view);
    var edges = KG.index.edgesFor(view);
    var byId = {};
    nodes.forEach(function (n) { byId[n.id] = n; });
    var hubId = findHub(nodes);
    var positions = layout.positions;

    // 不给硬编码 hex 兜底：这些 tokens.css 变量若被改名/删除，cssVar() 会拿到空串，
    // 直接把空串喂给 ECharts 颜色字段应当当场出可见异常（canvas 画不出东西 / 报错），
    // 而不是悄悄换成一个游离于 tokens.css 之外的硬编码色值把 token 改名问题掩盖掉。
    var deepNavy = cssVar('--bg-deep');
    var inkColor = cssVar('--ink');
    var goldColor = cssVar('--gold');

    var nodeIndexById = {};
    var data = nodes.map(function (node, idx) {
      nodeIndexById[node.id] = idx;
      var pos = positions[node.id] || { x: 0, y: 0 };
      var st = styleOf(node.type);
      var color = colorHexOf(node);
      var isFocus = focusId && node.id === focusId;
      var size = symbolSizeOf(node);

      var item = {
        id: node.id,
        name: node.short || node.name,
        x: pos.x,
        y: pos.y,
        value: node.weight,
        symbolSize: size,
        itemStyle: {
          color: color,
          shadowBlur: st.glow,
          shadowColor: rgba(color, 0.75),
          borderColor: isFocus ? goldColor : rgba(color, 0.5),
          borderWidth: isFocus ? st.borderW + 1.6 : st.borderW
        },
        label: {
          show: st.labelShow,
          position: node.type === 'root' ? 'bottom' : 'right',
          distance: node.type === 'root' ? 10 : 6,
          color: inkColor,
          fontSize: st.fontSize,
          fontWeight: st.fontWeight,
          textBorderColor: deepNavy,
          textBorderWidth: 3
        },
        emphasis: {
          label: { show: true },
          itemStyle: { shadowBlur: st.glow * 1.6 }
        }
      };
      return item;
    });

    var edgeData = edges.map(function (edge) {
      var tierKey = tierKeyOf(edge, byId, hubId);
      var tier = EDGE_TIER[tierKey];
      var srcColor = colorHexOf(byId[edge.s]);
      var tgtColor = colorHexOf(byId[edge.t]);
      return {
        source: edge.s,
        target: edge.t,
        lineStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
            { offset: 0, color: srcColor },
            { offset: 1, color: tgtColor }
          ]),
          width: tier.width,
          opacity: tier.opacity,
          curveness: tier.curveness,
          type: tier.dashed ? 'dashed' : 'solid'
        },
        emphasis: {
          lineStyle: { width: tier.width + 1.8, opacity: Math.min(1, tier.opacity + 0.4) }
        }
      };
    });

    var bounds = layout.bounds || { width: 1200, height: 800 };

    var option = {
      backgroundColor: 'transparent',
      animationDuration: 800,
      animationEasing: 'cubicOut',
      tooltip: {
        show: true,
        trigger: 'item',
        confine: true,
        backgroundColor: 'var(--glass)',
        borderColor: 'var(--cyan-a55)',
        borderWidth: 1,
        padding: 0,
        extraCssText: 'border-radius:10px;backdrop-filter:blur(var(--glass-blur));box-shadow:0 12px 32px rgba(2,10,26,.55);',
        formatter: tooltipFormatter
      },
      // 隐藏的直角坐标系：范围与 #graphChart 容器像素完全重合（0,0 起，宽高等于容器），
      // 专门给下面的「流光边」lines 系列用——lines 系列必须挂在某个具名坐标系上才会渲染，
      // 而 graph 系列的 layout:'none' 坐标系是内部私有的，两者不通用，只能靠这层桥接。
      xAxis: { show: false, type: 'value', min: 0, max: bounds.width, axisLine: { show: false } },
      yAxis: { show: false, type: 'value', min: 0, max: bounds.height, inverse: true, axisLine: { show: false } },
      grid: { left: 0, right: 0, top: 0, bottom: 0 },
      series: [
        {
          id: 'kg-graph',
          type: 'graph',
          layout: 'none',
          roam: true,
          draggable: true,
          cursor: 'pointer',
          legendHoverLink: false,
          data: data,
          edges: edgeData,
          labelLayout: { hideOverlap: true },
          emphasis: { focus: 'adjacency', scale: 1.18 },
          blur: {
            itemStyle: { opacity: 0.12 },
            lineStyle: { opacity: 0.04 },
            label: { show: false }
          }
        },
        {
          id: 'kg-flow',
          type: 'lines',
          coordinateSystem: 'cartesian2d',
          xAxisIndex: 0,
          yAxisIndex: 0,
          silent: true,
          z: 5,
          polyline: false,
          data: [],
          lineStyle: {
            color: cssVar('--cyan-hi'),
            width: 1.4,
            opacity: 0.55,
            curveness: 0.18
          },
          effect: {
            show: true,
            trailLength: 0.55,
            period: 3.2,
            symbol: 'circle',
            symbolSize: 3.4,
            color: cssVar('--cyan-hi')
          }
        }
      ]
    };

    return {
      option: option,
      nodeIndexById: nodeIndexById,
      trunkEdges: trunkEdgesOf(view)
    };
  }

  KG.graphOption = {
    build: build,
    colorHexOf: colorHexOf,
    rgba: rgba,
    cssVar: cssVar,
    trunkEdgesOf: trunkEdgesOf
  };

})(window);
