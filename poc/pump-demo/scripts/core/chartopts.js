// 纯函数 ECharts option 构造器（P1-F）。本文件不碰 DOM、不 new echarts、不读
// getComputedStyle——只把"数据 + 主题色"拼成 option 对象返回，因此可以在纯 Node
// 环境里单测（见 verify/verify_chartopts.js）。
//
// 依赖顺序：本文件读取 window.DemoData（unitBars() 用它查测点的 label/unit），
// 按分层规则属于 L4 core，只能引用严格更早层（L2 数据层）暴露的全局，不引用
// scripts/core/charts.js（同层）。
//
// 配色只有一份真源：THEME 必须由外部调用 ChartOptions.setTheme() 注入，本文件不
// 在 JS 里另写一份色值。浏览器里由 scripts/boot.js 在启动时读一次
// getComputedStyle(document.documentElement) 的 CSS 变量并调用 setTheme()；
// Node 单测里直接手工构造一个 theme 对象传给 setTheme()。
// setTheme(theme) 需要的字段：{ cyan, green, amber, red, ink, muted, lineStrong }，
// 分别对应 styles/01-tokens.css 里的 --cyan/--green/--amber/--red/--ink/--muted/
// --line-strong（lineStrong 是 --line-strong 的驼峰名）。
(function () {
  "use strict";

  var ChartOptions = {};
  ChartOptions.THEME = null;

  var THEME_KEYS = ["cyan", "green", "amber", "red", "ink", "muted", "lineStrong"];

  function setTheme(theme) {
    if (!theme) throw new Error("ChartOptions.setTheme() 需要一个主题对象");
    THEME_KEYS.forEach(function (key) {
      if (theme[key] == null) throw new Error("ChartOptions.setTheme() 缺少必需字段: " + key);
    });
    ChartOptions.THEME = theme;
  }

  function requireTheme() {
    if (!ChartOptions.THEME) throw new Error("ChartOptions.THEME 尚未初始化，请先调用 ChartOptions.setTheme()");
    return ChartOptions.THEME;
  }

  // ---------- trend(seriesList, opts)：多测点折线 + 关注线 markLine + 越线 markArea ----------
  //
  // seriesList 是 DemoData.series(unitId, pointId, rangeKey) 的返回对象数组（见
  // scripts/data/series.js 的 series()，字段包含 label/unit/warn/stop/labels/values 等）。
  // 每条 series 的 labels 应当逐点一致（同一 rangeKey 下调用得到的时间刻度本就相同）；
  // 这里直接取第一条的 labels 作为 x 轴刻度，不做跨 series 的一致性兜底校验——
  // 调用方传入不一致长度的 labels 属于用法错误，应该在渲染时就地报错，而不是被这里悄悄
  // 吞掉拼出一张错位的图。
  //
  // 按 unit 分组建 y 轴：同一个 unit 共用一根轴，不同 unit 各开一根（新增轴依次左右交替），
  // 而不是像旧的 renderPumpTrendChart() 那样写死"第一根轴/第二根轴"两根——旧实现只覆盖了
  // 振动+压力共轴、温度单独一轴这一种巧合的两轴场景，换一组测点（比如 3 个都不同单位）就会
  // 出错。
  function trend(seriesList, opts) {
    if (!seriesList || !seriesList.length) throw new Error("ChartOptions.trend() 需要至少一条 series");
    var THEME = requireTheme();
    opts = opts || {};
    var smooth = opts.smooth !== false;
    var palette = [THEME.red, THEME.amber, THEME.cyan, THEME.green, THEME.muted];

    var unitOrder = [];
    var unitIndex = {};
    seriesList.forEach(function (s) {
      if (unitIndex[s.unit] === undefined) {
        unitIndex[s.unit] = unitOrder.length;
        unitOrder.push(s.unit);
      }
    });

    var yAxis = unitOrder.map(function (unit, index) {
      return {
        type: "value",
        name: unit,
        position: index % 2 === 0 ? "left" : "right",
        // 第 3、4...根轴需要在同侧再往外偏移，避免和第 1/2 根轴的刻度文字重叠。
        offset: index > 1 ? Math.floor((index - 1) / 2) * 56 : 0,
        axisLabel: { color: THEME.muted },
        splitLine: { show: index === 0, lineStyle: { color: THEME.lineStrong } }
      };
    });

    var series = seriesList.map(function (s, index) {
      return {
        name: s.label,
        type: "line",
        smooth: smooth,
        yAxisIndex: unitIndex[s.unit],
        data: s.values,
        markLine: {
          symbol: "none",
          label: { color: THEME.amber, formatter: "关注线" },
          lineStyle: { color: THEME.amber, type: "dashed" },
          data: [{ yAxis: s.warn }]
        },
        markArea: {
          itemStyle: { color: THEME.red, opacity: 0.08 },
          data: [[{ yAxis: s.warn }, { yAxis: "max" }]]
        }
      };
    });

    return {
      color: seriesList.map(function (s, index) { return palette[index % palette.length]; }),
      grid: { left: 44, right: 40, top: 32, bottom: 30 },
      tooltip: { trigger: "axis" },
      legend: { top: 0, right: 0, textStyle: { color: THEME.muted } },
      xAxis: {
        type: "category",
        data: seriesList[0].labels,
        axisLine: { lineStyle: { color: THEME.lineStrong } },
        axisLabel: { color: THEME.muted }
      },
      yAxis: yAxis,
      series: series
    };
  }

  // ---------- spark(series)：无轴迷你折线 ----------
  //
  // 输入是单条 DemoData.series() 返回对象。阶段二会用它 + Charts.slot() 替掉
  // scripts/core/charts.js 里手写的 miniChart()（内联 SVG），所以刻意保持"只画一条线 +
  // 关注线"这个和 miniChart() 等价的最小信息量，不在这里引入新的视觉元素。
  function spark(series) {
    if (!series) throw new Error("ChartOptions.spark() 需要一个 series 对象");
    var THEME = requireTheme();
    return {
      grid: { left: 4, right: 4, top: 8, bottom: 8 },
      xAxis: { type: "category", show: false, data: series.labels },
      yAxis: { type: "value", show: false },
      series: [{
        type: "line",
        smooth: true,
        symbol: "none",
        data: series.values,
        lineStyle: { color: THEME.cyan, width: 2 },
        markLine: {
          symbol: "none",
          silent: true,
          label: { show: false },
          lineStyle: { color: THEME.amber, type: "dashed" },
          data: [{ yAxis: series.warn }]
        }
      }]
    };
  }

  // ---------- mix(items, highlightType)：环形占比 + 高亮某一类（含中心文字） ----------
  //
  // items 形如 DemoData.anomalyMix(unitId, rangeKey) 的返回值：[{ name, value }, ...]，
  // value 是百分比整数、加总为 100。highlightType 传 null/undefined 时不高亮任何一项，
  // 也不渲染中心文字；传一个不存在于 items 里的 name 时直接抛错（不是静默地"什么都不高亮"）。
  function mix(items, highlightType) {
    if (!items || !items.length) throw new Error("ChartOptions.mix() 需要至少一项");
    var THEME = requireTheme();
    var palette = [THEME.red, THEME.amber, THEME.cyan, THEME.green, THEME.muted];

    var highlightIndex = -1;
    if (highlightType != null) {
      items.forEach(function (item, index) {
        if (item.name === highlightType) highlightIndex = index;
      });
      if (highlightIndex < 0) throw new Error("ChartOptions.mix() 未找到高亮类型: " + highlightType);
    }

    var option = {
      color: items.map(function (item, index) { return palette[index % palette.length]; }),
      tooltip: { trigger: "item" },
      series: [{
        name: "异常占比",
        type: "pie",
        radius: ["48%", "72%"],
        center: ["50%", "52%"],
        avoidLabelOverlap: true,
        selectedMode: highlightIndex >= 0 ? "single" : false,
        label: { color: THEME.ink, formatter: "{b}\n{d}%" },
        labelLine: { lineStyle: { color: THEME.lineStrong } },
        data: items.map(function (item, index) {
          return { name: item.name, value: item.value, selected: index === highlightIndex };
        })
      }]
    };

    if (highlightIndex >= 0) {
      option.title = {
        text: items[highlightIndex].value + "%",
        subtext: items[highlightIndex].name,
        left: "center",
        top: "44%",
        textStyle: { color: THEME.ink, fontSize: 22 },
        subtextStyle: { color: THEME.muted, fontSize: 13 }
      };
    }

    return option;
  }

  // ---------- unitBars(rows, pointId)：柱（健康分）+ 线（选中测点跨机组峰值）双轴 ----------
  //
  // rows 形如 DemoData.unitCompare(pointId, rangeKey) 的返回值：
  // [{ unitId, health, peak }, ...]（见 scripts/data/series.js 的 unitCompare()）。
  // 该返回值本身不带测点的 label/unit，所以额外传入 pointId，用 window.DemoData.point()
  // 查一次测点元数据，只用于给折线系列命名——不重新计算 rows 里已经算好的 health/peak。
  function unitBars(rows, pointId) {
    if (!rows || !rows.length) throw new Error("ChartOptions.unitBars() 需要至少一行数据");
    var THEME = requireTheme();
    var point = window.DemoData.point(pointId);

    return {
      color: [THEME.cyan, THEME.red],
      grid: { left: 44, right: 44, top: 32, bottom: 30 },
      tooltip: { trigger: "axis" },
      legend: { top: 0, right: 0, textStyle: { color: THEME.muted } },
      xAxis: {
        type: "category",
        data: rows.map(function (row) { return row.unitId; }),
        axisLine: { lineStyle: { color: THEME.lineStrong } },
        axisLabel: { color: THEME.muted }
      },
      yAxis: [
        { type: "value", name: "健康分", min: 0, max: 100, axisLabel: { color: THEME.muted }, splitLine: { lineStyle: { color: THEME.lineStrong } } },
        { type: "value", name: point.label, axisLabel: { color: THEME.muted }, splitLine: { show: false } }
      ],
      series: [
        { name: "健康评分", type: "bar", barWidth: 22, data: rows.map(function (row) { return row.health; }) },
        { name: point.label + " " + point.unit, type: "line", yAxisIndex: 1, smooth: true, data: rows.map(function (row) { return row.peak; }) }
      ]
    };
  }

  // 部位风险雷达：6 轴 = 6 个部位，值 = 主测点 latest / warn 归一化后的风险分（%），
  // 100 就是刚好压在关注线上。station 场景用它替掉原来那 4 行纯文字的"泵部位数据映射"
  // ——把"哪些部位在烧"变成一眼能看出来的形状，而不是让人逐行读数字。
  //
  // max 固定取 140 而不是按数据自适应：雷达图的价值在于"跨部位对比形状"，轴范围一变
  // 形状就没有可比性了；140 能让越线部位明显冲出 100 那圈参考线，又不至于把未越线的
  // 部位压成一团。SEAL-L 这类 base 为 0 的测点风险分恒为 0，属正常。
  function radar(parts, rangeKey) {
    if (!parts || !parts.length) throw new Error("ChartOptions.radar() 需要至少一个部位");
    var THEME = requireTheme();
    var DATA = window.DemoData;
    var indicators = [];
    var values = [];
    parts.forEach(function (part) {
      var point = DATA.primaryPoint(part.id);
      var s = DATA.series(DATA.units()[0].id, point.id, rangeKey);
      indicators.push({ name: part.label, max: 140 });
      values.push(Math.round((s.latest / s.warn) * 100));
    });
    return {
      backgroundColor: "transparent",
      tooltip: { trigger: "item" },
      radar: {
        indicator: indicators,
        radius: "62%",
        center: ["50%", "54%"],
        splitNumber: 4,
        axisName: { color: THEME.muted, fontSize: 11 },
        splitLine: { lineStyle: { color: THEME.lineStrong } },
        splitArea: { show: false },
        axisLine: { lineStyle: { color: THEME.lineStrong } }
      },
      series: [{
        type: "radar",
        symbolSize: 5,
        lineStyle: { color: THEME.red, width: 2 },
        itemStyle: { color: THEME.red },
        areaStyle: { color: THEME.red, opacity: 0.18 },
        data: [{ value: values, name: "风险分（关注线 = 100）" }]
      }]
    };
  }

  // ---------- graph(graphData, opts)：知识图谱固定坐标关系图（阶段三 G2） ----------
  //
  // graphData 形如 DemoData.graphData() 的返回值：{ nodes, edges, spine }（见
  // scripts/data/graph.js 的 build()）。nodes[].x/y 是数据层已经按 graph-spec.js
  // 声明的列带算好的 0-100 坐标（同类型节点均分列带 + spine 覆盖值），本函数只原样
  // 透传、不做任何重新布局——这是"用 layout:'none' + 固定坐标，不用力导向"这条架构
  // 决定在 option 层面的落地（理由见任务报告：确定性可截图回归、28 节点力导向会
  // 甩成一团、数据层已经算好坐标）。做法是把 graph series 绑定到一对 min:0/max:100
  // 的隐藏数值轴（coordinateSystem:'cartesian2d'），节点 value 直接是 [node.x, node.y]，
  // yAxis.inverse=true 让 y 值增大朝下（与旧版 CSS 百分比定位 top:y% 的方向一致）。
  //
  // opts.focusId（可选）：点击聚焦的节点 id。传入后，不属于该节点一跳邻居（含自身）
  // 的节点/边会被压暗（itemStyle/lineStyle.opacity=0.15/0.05），场景层借此实现
  // "点击聚焦子图"，本函数只负责按 focusId 算好每个节点/边该有的透明度，不关心
  // 点击事件本身怎么触发（那是 scripts/scenes/graph.js 绑定 ECharts 实例事件的事）。
  //
  // opts.spineEffect（默认 false）：主线流光开关。false = 第二条 "lines" 系列
  // （polyline，坐标是 graphData.spine 顺序连成的一整条路径）完全静止，只画一条低
  // 透明度的引导线，不启动 ECharts 的 effect 动画循环——这是"仅交互时播一次，默认
  // 零动画"这条 CPU 取舍在 option 层面的落地。场景层在悬停/点击时把这个字段置
  // true 重新 setOption 一次，播完一轮（ChartOptions.GRAPH_SPINE_EFFECT_MS）后自己
  // 用 SceneTimers 再设回 false、重新 setOption——本函数不管定时器，只管"这一次
  // 调用要不要打开动画"这个纯粹的映射。
  //
  // opts.groupLabels（可选）：{ group -> 中文显示名 } 字典，只影响图例/tooltip 里
  // 展示的类别名字，不传时退回原始 group 键名（英文，Node 单测和"没有中文名可用"
  // 的调用方都能正常拿到一个可用的字符串）——这是纯展示层的可选覆盖，不是"配色只有
  // 一份真源"那条规则管的东西（那条只管颜色数值本身，颜色仍然只从 THEME 取）。
  var GRAPH_PALETTE_KEYS = ["cyan", "green", "amber", "red", "muted"];
  var GRAPH_SPINE_PERIOD_SEC = 2.4;

  function graphNodeIndex(nodes) {
    var index = {};
    nodes.forEach(function (node) { index[node.id] = node; });
    return index;
  }

  // focusId 自身 + 它的一跳邻居（不分方向）。
  function graphNeighborSet(edges, focusId) {
    var set = {};
    set[focusId] = true;
    edges.forEach(function (edge) {
      if (edge[0] === focusId) set[edge[1]] = true;
      if (edge[1] === focusId) set[edge[0]] = true;
    });
    return set;
  }

  function graph(graphData, opts) {
    if (!graphData || !Array.isArray(graphData.nodes) || !graphData.nodes.length) {
      throw new Error("ChartOptions.graph() 需要至少一个节点");
    }
    if (!Array.isArray(graphData.edges)) throw new Error("ChartOptions.graph() 需要 edges 数组");
    if (!Array.isArray(graphData.spine) || graphData.spine.length < 2) {
      throw new Error("ChartOptions.graph() 需要至少 2 个节点的 spine");
    }
    var THEME = requireTheme();
    opts = opts || {};
    var focusId = opts.focusId != null ? opts.focusId : null;
    var spineEffect = opts.spineEffect === true;
    var groupLabels = opts.groupLabels || null;

    var nodeById = graphNodeIndex(graphData.nodes);
    if (focusId != null && !nodeById[focusId]) {
      throw new Error("ChartOptions.graph() 的 focusId 不存在于 nodes 中: " + focusId);
    }
    var neighborSet = focusId != null ? graphNeighborSet(graphData.edges, focusId) : null;

    var spineSet = {};
    graphData.spine.forEach(function (nodeId) { spineSet[nodeId] = true; });

    // 类别顺序按 nodes 数组第一次出现的顺序确定，不依赖 graph-spec.js 的 bands 声明
    // 顺序——本函数除了拿到的 graphData 之外不读任何其它数据层全局，保持纯函数、可
    // 在 Node 里单测（同一层纪律见文件顶部注释）。8 类循环使用 5 个 THEME 色，允许
    // 撞色（配色只有 THEME 这一份真源，不为了凑够 8 种互不相同的颜色而在这里新写
    // 色值）。
    var categoryOrder = [];
    var categoryIndexOf = {};
    graphData.nodes.forEach(function (node) {
      if (categoryIndexOf[node.group] === undefined) {
        categoryIndexOf[node.group] = categoryOrder.length;
        categoryOrder.push(node.group);
      }
    });

    function colorOf(group) {
      var key = GRAPH_PALETTE_KEYS[categoryIndexOf[group] % GRAPH_PALETTE_KEYS.length];
      return THEME[key];
    }

    function displayGroup(group) {
      return groupLabels && groupLabels[group] ? groupLabels[group] : group;
    }

    var categories = categoryOrder.map(function (group) {
      return { name: displayGroup(group), itemStyle: { color: colorOf(group) } };
    });

    var nodes = graphData.nodes.map(function (node) {
      var dimmed = neighborSet != null && !neighborSet[node.id];
      var color = colorOf(node.group);
      var isSpine = spineSet[node.id] === true;
      return {
        id: node.id,
        name: node.id,
        value: [node.x, node.y],
        category: categoryIndexOf[node.group],
        symbolSize: node.id === focusId ? 30 : (isSpine ? 22 : 16),
        label: {
          show: true,
          position: "bottom",
          formatter: node.label,
          color: THEME.ink,
          fontSize: 11,
          width: 78,
          overflow: "break",
          lineHeight: 13
        },
        itemStyle: {
          color: color,
          opacity: dimmed ? 0.15 : 1,
          shadowBlur: dimmed ? 0 : (isSpine ? 16 : 10),
          shadowColor: color,
          borderColor: isSpine ? THEME.ink : THEME.lineStrong,
          borderWidth: isSpine ? 1.5 : 1
        },
        emphasis: {
          itemStyle: { shadowBlur: 24 },
          label: { fontSize: 12 }
        }
      };
    });

    var edges = graphData.edges.map(function (edge) {
      var fromId = edge[0];
      var toId = edge[1];
      var label = edge[2];
      if (!nodeById[fromId]) throw new Error("ChartOptions.graph() 的边引用了不存在的节点: " + fromId);
      if (!nodeById[toId]) throw new Error("ChartOptions.graph() 的边引用了不存在的节点: " + toId);
      var dimmed = neighborSet != null && !(neighborSet[fromId] && neighborSet[toId]);
      return {
        source: fromId,
        target: toId,
        label: { show: false, formatter: label, color: THEME.muted, fontSize: 10 },
        lineStyle: { color: THEME.lineStrong, opacity: dimmed ? 0.05 : 0.42, curveness: 0.08, width: 1 },
        emphasis: {
          label: { show: true },
          lineStyle: { opacity: 0.9, width: 2 }
        }
      };
    });

    var spineCoords = graphData.spine.map(function (nodeId) {
      var node = nodeById[nodeId];
      if (!node) throw new Error("ChartOptions.graph() 的 spine 引用了不存在的节点: " + nodeId);
      return [node.x, node.y];
    });

    return {
      xAxis: { type: "value", min: 0, max: 100, show: false },
      yAxis: { type: "value", min: 0, max: 100, show: false, inverse: true },
      grid: { left: "6%", right: "6%", top: "10%", bottom: "8%" },
      tooltip: {
        trigger: "item",
        formatter: function (params) {
          if (params.data && params.data.label && params.data.label.formatter) {
            return String(params.data.label.formatter);
          }
          return String(params.name);
        }
      },
      legend: {
        data: categories.map(function (c) { return c.name; }),
        top: 4,
        left: 4,
        itemWidth: 10,
        itemHeight: 10,
        textStyle: { color: THEME.muted, fontSize: 11 }
      },
      series: [
        {
          type: "graph",
          layout: "none",
          coordinateSystem: "cartesian2d",
          xAxisIndex: 0,
          yAxisIndex: 0,
          roam: false,
          draggable: false,
          legendHoverLink: true,
          categories: categories,
          data: nodes,
          links: edges,
          emphasis: { focus: "adjacency", scale: true },
          blur: { itemStyle: { opacity: 0.12 }, lineStyle: { opacity: 0.04 } }
        },
        {
          type: "lines",
          coordinateSystem: "cartesian2d",
          xAxisIndex: 0,
          yAxisIndex: 0,
          polyline: true,
          silent: true,
          z: 5,
          data: [{ coords: spineCoords }],
          lineStyle: { color: THEME.cyan, width: 1.5, opacity: 0.5, curveness: 0 },
          effect: {
            show: spineEffect,
            period: GRAPH_SPINE_PERIOD_SEC,
            trailLength: 0.3,
            symbol: "arrow",
            symbolSize: 9,
            color: THEME.cyan
          }
        }
      ]
    };
  }

  ChartOptions.radar = radar;
  ChartOptions.setTheme = setTheme;
  ChartOptions.trend = trend;
  ChartOptions.spark = spark;
  ChartOptions.mix = mix;
  ChartOptions.unitBars = unitBars;
  ChartOptions.graph = graph;
  // 场景层（scripts/scenes/graph.js）用它算"一轮流光播完该等多久再关掉 effect.show"，
  // 不在两个文件里各写一份 2.4 / 2400 的魔法数字。
  ChartOptions.GRAPH_SPINE_EFFECT_MS = GRAPH_SPINE_PERIOD_SEC * 1000;

  window.ChartOptions = ChartOptions;
})();
