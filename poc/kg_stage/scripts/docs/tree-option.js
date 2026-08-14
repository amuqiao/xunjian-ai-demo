/*
 * docs/tree-option.js —— 生成"文档驾驶舱"中间纵向密集树的 ECharts option
 * 挂载到 window.KG.treeOption.build(taskId, selectedId)。
 *
 * 数据来源：KG.index.subtree(taskId) —— 以某个重点任务为根的 contains 子树，
 * 层级固定为 task(1) -> direction(2) -> technology(3) -> content(4)，
 * 严格四色分层，颜色变量名来自 KG.index.colorOf()，实际色值在这里用
 * getComputedStyle 从 :root 解析（canvas 渲染的图形属性不认识 var(--x)，
 * 只有 DOM 节点上的内联样式才认识，所以 tooltip 用字符串 var()，
 * itemStyle/lineStyle 必须用解析后的真实色值）。
 *
 * 经典脚本 IIFE，零 import/export/fetch。
 */
(function () {
  'use strict';

  window.KG = window.KG || {};

  // 每种节点类型对应的圆点半径（symbolSize），层级越深越小
  var SIZE_BY_TYPE = { task: 12, direction: 10, technology: 8, content: 6 };
  // 选中态额外放大的像素数
  var SELECTED_EXTRA = 6;
  // 标签超长截断长度
  var LABEL_MAX = 12;

  /** 从 :root 解析 CSS 自定义属性的真实色值，供 canvas 渲染使用 */
  function resolveVar(varName) {
    var root = document.documentElement;
    var val = getComputedStyle(root).getPropertyValue(varName);
    return (val || '').trim() || '#5fd8ff';
  }

  function truncate(text, max) {
    var s = String(text || '');
    return s.length > max ? s.slice(0, max - 1) + '…' : s;
  }

  /**
   * build(taskId, selectedId)
   * taskId     —— 十大重点任务之一，如 'T05'
   * selectedId —— 当前高亮选中的节点 id（可为空）
   * 返回可直接喂给 chart.setOption 的完整 option；taskId 非法时返回 null。
   */
  function build(taskId, selectedId) {
    var raw = KG.index.subtree(taskId);
    if (!raw) return null;

    // 运行期一次性解析好本次渲染需要的所有真实色值
    var palette = {
      task: resolveVar(KG.index.colorOf({ type: 'task' })),
      direction: resolveVar(KG.index.colorOf({ type: 'direction' })),
      technology: resolveVar(KG.index.colorOf({ type: 'technology' })),
      content: resolveVar(KG.index.colorOf({ type: 'content' }))
    };
    var gold = resolveVar('--gold');
    var ink = resolveVar('--ink');
    var ink2 = resolveVar('--ink-2');
    var bgDeep = resolveVar('--bg-deep');
    var edgeColor = resolveVar('--cyan-a55');
    var edgeColorDim = resolveVar('--cyan-a28');

    /** 递归把 subtree() 的纯数据节点转换成携带样式的 ECharts tree 数据节点 */
    function walk(node, isRoot) {
      var color = palette[node.type] || palette.content;
      var baseSize = SIZE_BY_TYPE[node.type] || 6;
      var isSelected = !!selectedId && node.id === selectedId;
      var size = isSelected ? baseSize + SELECTED_EXTRA : baseSize;
      var fullName = node.short || node.name || '';

      var item = {
        // name 与 fullName 保持一致，供 tooltip/formatter 使用；显示层面用 formatter 截断
        name: fullName,
        fullName: fullName,
        id: node.id,
        docId: node.docId || null,
        type: node.type,
        level: node.level,
        value: node.value,
        symbol: 'circle',
        symbolSize: size,
        itemStyle: {
          color: color,
          borderColor: isSelected ? gold : color,
          borderWidth: isSelected ? 3 : 1,
          shadowColor: isSelected ? gold : color,
          shadowBlur: isSelected ? 20 : 8
        },
        label: {
          position: isRoot ? 'left' : 'right',
          distance: isRoot ? 10 : 7
        },
        lineStyle: {
          color: edgeColor,
          width: 1.2,
          curveness: 0,
          shadowColor: edgeColorDim,
          shadowBlur: 4
        }
      };
      if (node.children && node.children.length) {
        item.children = node.children.map(function (child) { return walk(child, false); });
      }
      return item;
    }

    var treeData = walk(raw, true);

    return {
      backgroundColor: 'transparent',
      animationDuration: 420,
      animationDurationUpdate: 420,
      animationEasingUpdate: 'cubicOut',
      tooltip: {
        trigger: 'item',
        triggerOn: 'mousemove',
        backgroundColor: 'rgba(6,20,46,.92)',
        borderColor: 'var(--cyan-a55)',
        borderWidth: 1,
        padding: [8, 12],
        extraCssText: 'backdrop-filter:blur(6px);',
        formatter: function (params) {
          var d = params.data || {};
          var typeLabel = KG.index.labelOf({ type: d.type });
          return '<div style="font-size:13px;font-weight:600;color:' + ink + ';margin-bottom:4px;">' + (d.fullName || d.name) + '</div>' +
            '<div style="font-size:11px;color:' + ink2 + ';">' + typeLabel + '</div>';
        }
      },
      series: [{
        type: 'tree',
        data: [treeData],
        orient: 'LR',
        layout: 'orthogonal',
        edgeShape: 'polyline',
        edgeForkPosition: '50%',
        roam: true,
        nodeGap: 14,
        initialTreeDepth: -1,
        expandAndCollapse: false,
        symbol: 'circle',
        top: '6%',
        bottom: '6%',
        left: '9%',
        right: '18%',
        lineStyle: {
          color: edgeColor,
          width: 1.2,
          curveness: 0
        },
        label: {
          show: true,
          color: ink,
          fontSize: 11,
          textBorderColor: bgDeep,
          textBorderWidth: 2,
          formatter: function (params) {
            return truncate((params.data && params.data.fullName) || params.name, LABEL_MAX);
          }
        },
        leaves: {
          label: { position: 'right' }
        },
        emphasis: {
          focus: 'descendant',
          lineStyle: { width: 2.2, color: edgeColor },
          itemStyle: { shadowBlur: 22 }
        },
        blur: {
          itemStyle: { opacity: .25 },
          lineStyle: { opacity: .15 },
          label: { opacity: .3 }
        }
      }]
    };
  }

  window.KG.treeOption = { build: build };
})();
