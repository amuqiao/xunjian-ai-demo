/*
 * graph/graph-layout.js —— 图谱页确定性种子布局
 * 挂载到 window.KG.graphLayout。
 *
 * 设计动机：
 *   ECharts 自带的 force 布局每次结果随机、异步收敛，无法在转场时同步查询节点坐标
 *   （2-A 转场需要 KG.graphPage.nodeScreenPos 同步返回目标点）。因此这里自己实现一个
 *   「确定性种子随机 + 同步力导迭代」的布局算法：
 *     1. 用 BFS 从视角中心（hub）出发，按图的连通关系（不仅是 contains 树，横向的
 *        domainOf/bizOf/relatesTo/supports 边也会参与，但只用「首次到达」的边构建一棵
 *        用于分配角度扇区的辅助树）得到每个节点的层级深度 depth。
 *     2. 按深度分配半径环（越深越远），按辅助树做「旭日图」式的角度扇区递归分配，
 *        形成中心放射、逐层发散的骨架——对齐参考图 1/3 的整体形态。
 *     3. 用固定种子的 LCG 伪随机对角度/半径做小幅抖动，避免机械的正圆环。
 *     4. 跑固定轮数的力导迭代（斥力 + 真实图边弹簧力 + 拉回锚点半径的层级力），
 *        进一步打散重叠、让跨支线的张力边把相关节点悄悄拉近，呈现自然的团块散布。
 *   全程不使用 Math.random / Date.now，种子只由 view 名称派生，
 *   因此同一 view + 同一 width/height 的多次调用结果完全一致（浮点运算顺序也完全一致）。
 *
 * 经典脚本 IIFE，零 import/export/fetch。
 */
(function (global) {
  'use strict';

  var KG = global.KG = global.KG || {};

  /* ============================================================
   * 一、确定性伪随机数（LCG，种子来自字符串哈希）
   * ========================================================== */

  function makeRng(seedStr) {
    // FNV-1a 风格字符串哈希得到 32 位种子
    var h = 2166136261;
    for (var i = 0; i < seedStr.length; i++) {
      h ^= seedStr.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    var state = (h >>> 0) || 1;
    return function () {
      // Numerical Recipes 参数的线性同余生成器
      state = (1664525 * state + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  /* ============================================================
   * 二、BFS 分层 + 旭日图角度分配
   * ========================================================== */

  /** 找到某个视角节点集合里的 hub（type === 'root'，每个视角唯一） */
  function findHub(nodes) {
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].type === 'root') return nodes[i].id;
    }
    return nodes[0] && nodes[0].id;
  }

  /**
   * 以 hubId 为根，对全部边（不区分 rel）做无向 BFS，得到：
   *   depth[id]    —— 到 hub 的最短跳数
   *   children[id] —— BFS 树上的孩子（只用于角度扇区分配，不代表真实语义父子）
   * 邻接遍历前按 id 排序，保证遍历顺序稳定 → 结果确定性。
   */
  function buildBfsTree(nodes, edges, hubId) {
    var adj = {};
    nodes.forEach(function (n) { adj[n.id] = []; });
    edges.forEach(function (e) {
      if (!adj[e.s] || !adj[e.t]) return;
      adj[e.s].push(e.t);
      adj[e.t].push(e.s);
    });
    Object.keys(adj).forEach(function (id) { adj[id].sort(); });

    var depth = {};
    var children = {};
    nodes.forEach(function (n) { children[n.id] = []; });

    depth[hubId] = 0;
    var visited = {};
    visited[hubId] = true;
    var queue = [hubId];
    var qi = 0;
    while (qi < queue.length) {
      var id = queue[qi++];
      var neigh = adj[id] || [];
      for (var i = 0; i < neigh.length; i++) {
        var nb = neigh[i];
        if (visited[nb]) continue;
        visited[nb] = true;
        depth[nb] = depth[id] + 1;
        children[id].push(nb);
        queue.push(nb);
      }
    }
    // 不做「未访问节点静默挂到 hub 下 depth=1」的兜底：kg-index.js::validate() 的
    // 6.12 项已经保证 contains 树从 root 全可达，edgesFor(view) 的视角投影理论上
    // 也应当保持连通；如果这里仍出现未访问节点，说明某个视角的边集合出了真实的
    // 数据/投影 bug，应该直接报错定位，而不是悄悄把断开的节点焊到 hub 上、在
    // 布局图上呈现一份看起来正常、实则来源不明的假连通性。
    nodes.forEach(function (n) {
      if (depth[n.id] === undefined) {
        throw new Error('[graph-layout] 节点 ' + n.id + ' 未被 BFS 访问到，view 的边集合与 hub 不连通');
      }
    });

    var maxDepth = 0;
    Object.keys(depth).forEach(function (id) { if (depth[id] > maxDepth) maxDepth = depth[id]; });

    return { depth: depth, children: children, maxDepth: maxDepth };
  }

  /** 递归统计 BFS 树每个节点的叶子数量，用作角度扇区分配权重 */
  function countLeaves(hubId, children) {
    var leafCount = {};
    function visit(id) {
      var kids = children[id];
      if (!kids.length) { leafCount[id] = 1; return 1; }
      var sum = 0;
      for (var i = 0; i < kids.length; i++) sum += visit(kids[i]);
      leafCount[id] = sum;
      return sum;
    }
    visit(hubId);
    return leafCount;
  }

  /**
   * 旭日图式角度分配：hub 占满 [0, 2π)，每个节点按孩子的叶子权重把自己的扇区
   * 继续切给孩子，孩子的角度取切到的子扇区中点，并叠加与子扇区宽度成比例的
   * 抖动，避免同层节点分布过于机械。
   */
  function assignAngles(hubId, children, leafCount, rng) {
    var angle = {};
    angle[hubId] = 0;
    function recurse(id, a0, a1) {
      var kids = children[id];
      if (!kids.length) return;
      var total = leafCount[id];
      var cursor = a0;
      var span = a1 - a0;
      for (var i = 0; i < kids.length; i++) {
        var kid = kids[i];
        var w = (leafCount[kid] / total) * span;
        var childA0 = cursor;
        var childA1 = cursor + w;
        var mid = (childA0 + childA1) / 2;
        var jitter = (rng() - 0.5) * w * 0.5;
        angle[kid] = mid + jitter;
        recurse(kid, childA0, childA1);
        cursor = childA1;
      }
    }
    recurse(hubId, 0, Math.PI * 2);
    return angle;
  }

  /* ============================================================
   * 三、力导迭代（斥力 + 真实图边弹簧力 + 层级锚定力）
   * ========================================================== */

  function relax(nodes, edges, depth, angle, ringGap, hubId, rng) {
    var ids = nodes.map(function (n) { return n.id; });
    var n = ids.length;

    var pos = {};
    var anchor = {};
    var radiusOf = {};
    nodes.forEach(function (node) {
      var d = depth[node.id];
      var r = d * ringGap;
      var a = angle[node.id] || 0;
      var jr = (rng() - 0.5) * ringGap * 0.3;
      pos[node.id] = { x: (r + jr) * Math.cos(a), y: (r + jr) * Math.sin(a) };
      anchor[node.id] = { x: r * Math.cos(a), y: r * Math.sin(a) };
      radiusOf[node.id] = 5 + (node.weight || 1) * 2.6;
    });
    pos[hubId] = { x: 0, y: 0 };
    anchor[hubId] = { x: 0, y: 0 };

    var ITER = 320;
    var repK = ringGap * ringGap * 0.85;
    var springK = 0.02;
    var anchorK = 0.024;
    var maxStep = ringGap * 0.25;

    for (var it = 0; it < ITER; it++) {
      var disp = {};
      for (var k = 0; k < n; k++) disp[ids[k]] = { x: 0, y: 0 };

      // 1) 全局两两斥力（节点数 <= ~250，O(n^2) 单轮开销可控）
      for (var i = 0; i < n; i++) {
        var a = ids[i], pa = pos[a];
        for (var j = i + 1; j < n; j++) {
          var b = ids[j], pb = pos[b];
          var dx = pa.x - pb.x, dy = pa.y - pb.y;
          var distSq = dx * dx + dy * dy || 0.01;
          var dist = Math.sqrt(distSq);
          var minDist = radiusOf[a] + radiusOf[b] + 8;
          var force = repK / distSq;
          if (dist < minDist) force *= 2.4;
          var fx = (dx / dist) * force, fy = (dy / dist) * force;
          disp[a].x += fx; disp[a].y += fy;
          disp[b].x -= fx; disp[b].y -= fy;
        }
      }

      // 2) 真实图边弹簧力（含跨支线的张力边 relatesTo/supports，
      //    这些边会把不同分支悄悄拉近，形成「关系张力」的视觉效果）
      for (var e = 0; e < edges.length; e++) {
        var edge = edges[e];
        var ps = pos[edge.s], pt = pos[edge.t];
        if (!ps || !pt) continue;
        var edx = pt.x - ps.x, edy = pt.y - ps.y;
        var edist = Math.sqrt(edx * edx + edy * edy) || 0.01;
        var ideal = edge.rel === 'contains' ? ringGap : ringGap * 1.3;
        var f = springK * (edist - ideal);
        var efx = (edx / edist) * f, efy = (edy / edist) * f;
        disp[edge.s].x += efx; disp[edge.s].y += efy;
        disp[edge.t].x -= efx; disp[edge.t].y -= efy;
      }

      // 3) 层级锚定力：轻轻拉回各自理想半径/角度，维持放射状骨架不被拉散
      for (var m = 0; m < n; m++) {
        var id = ids[m];
        var an = anchor[id], p = pos[id];
        disp[id].x += (an.x - p.x) * anchorK;
        disp[id].y += (an.y - p.y) * anchorK;
      }

      // 4) 限幅应用位移，hub 固定在原点
      for (var s = 0; s < n; s++) {
        var sid = ids[s];
        if (sid === hubId) continue;
        var d = disp[sid];
        var mag = Math.sqrt(d.x * d.x + d.y * d.y) || 0.0001;
        var capped = Math.min(mag, maxStep);
        pos[sid].x += (d.x / mag) * capped;
        pos[sid].y += (d.y / mag) * capped;
      }
    }

    return pos;
  }

  /* ============================================================
   * 四、对外主函数
   * ========================================================== */

  /**
   * 布局结果缓存：key 为 view + 容器宽高。算法全程用固定种子的确定性伪随机
   * （见文件头注释），同一 view + 同一 width/height 的计算结果必然逐位一致，
   * 缓存零风险；命中缓存可以跳过 ITER=320 轮 O(n²) 力导迭代（task 视角 131
   * 节点约 85ms 的同步主线程阻塞），代价只是一份小小的按 key 存活的 Map。
   * 调用方（graph.js）只读 positions/bounds，不会回写，因此可以放心共享同一份
   * 返回对象引用，不需要每次克隆。
   */
  var layoutCache = {};

  /**
   * compute(view, width, height)
   * 同步计算并返回 { positions: {id:{x,y}}, bounds }。
   * positions 的坐标已经居中并缩放到贴合 width×height（留出边距），
   * 可直接作为 ECharts graph 系列 layout:'none' 的 x/y 使用。
   */
  function compute(view, width, height) {
    // 不做 width>0?width:1200 这类兜底：调用方 graph.js 已经不再给 clientWidth/
    // clientHeight 兜底默认值，这里如果还收到 <=0 的尺寸，说明容器结构/CSS 出了
    // 真实问题，应该当场报错，而不是悄悄换算成一份 1200×800 的假布局。
    if (!(width > 0) || !(height > 0)) {
      throw new Error('[graph-layout] compute(' + view + ') 收到非法容器尺寸 width=' + width + ' height=' + height);
    }
    var w = width;
    var h = height;

    var cacheKey = view + '::' + w + 'x' + h;
    if (layoutCache[cacheKey]) return layoutCache[cacheKey];

    var nodes = KG.index.nodesFor(view);
    var edges = KG.index.edgesFor(view);
    var hubId = findHub(nodes);

    var rng = makeRng('kg-graph-layout::' + view);

    var tree = buildBfsTree(nodes, edges, hubId);
    var leafCount = countLeaves(hubId, tree.children);
    var angle = assignAngles(hubId, tree.children, leafCount, rng);

    var maxDepth = Math.max(tree.maxDepth, 1);
    var baseR = Math.min(w, h) * 0.46;
    var ringGap = baseR / maxDepth;

    var raw = relax(nodes, edges, tree.depth, angle, ringGap, hubId, rng);

    // 归一化：把力导结果整体平移缩放，贴合到 width×height（留 12% 边距），
    // 保持长宽比不被拉伸变形。
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    nodes.forEach(function (node) {
      var p = raw[node.id];
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    });
    var spanX = Math.max(maxX - minX, 1);
    var spanY = Math.max(maxY - minY, 1);
    var targetW = w * 0.86, targetH = h * 0.86;
    var scale = Math.min(targetW / spanX, targetH / spanY);
    var cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;

    var positions = {};
    var pMinX = Infinity, pMaxX = -Infinity, pMinY = Infinity, pMaxY = -Infinity;
    nodes.forEach(function (node) {
      var p = raw[node.id];
      var x = w / 2 + (p.x - cx) * scale;
      var y = h / 2 + (p.y - cy) * scale;
      positions[node.id] = { x: x, y: y };
      if (x < pMinX) pMinX = x;
      if (x > pMaxX) pMaxX = x;
      if (y < pMinY) pMinY = y;
      if (y > pMaxY) pMaxY = y;
    });

    var result = {
      positions: positions,
      bounds: { minX: pMinX, maxX: pMaxX, minY: pMinY, maxY: pMaxY, width: w, height: h }
    };
    layoutCache[cacheKey] = result;
    return result;
  }

  KG.graphLayout = {
    compute: compute
  };

})(window);
