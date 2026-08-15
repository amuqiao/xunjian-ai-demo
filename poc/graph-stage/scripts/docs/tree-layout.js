// docs/tree-layout.js —— 文档页严格树的确定性 tidy-tree 求解器。
//
// 纯函数、零 DOM、零 THREE、零依赖，node 侧可直接 require（见
// verify/verify_tree_layout.js）。选择自绘而不用 G6 的理由记在
// ../DESIGN.md 第 8 章末段：严格树的 tidy layout 是一个约 200 行的确定
// 性纯函数，塞进 canvas 只会把中文变糊、把高亮/键盘可达/文本选中都变难。
//
// SVG 连线层与 DOM 节点层必须消费本文件产出的同一份坐标，不许各自再解释
// 一遍——diagnosis-flow 记录过"两处各解释一遍数据"导致动画高亮和答案引用
// 对不上的坑，这里从源头只提供一份真源。
//
// 输入：nodes = [{ id, parentId, depth }]，parentId 为 null/undefined 表示根。
// 配置：{ nodeW, nodeH, gapX, gapY }，四个字段全部必须是正有限数，
//       不设默认值——这是关系到坐标换算是否成立的参数，非法直接抛错。
// 输出：{ [id]: { x, y, depth } }。
//
// 算法（分层 → 同层等距 → 父节点 x = 子节点 x 区间中点）：
//   1. 按 parentId 建父子邻接表，找恰好一个根，校验无环、无悬空、无重复 id。
//   2. 深度优先后序遍历：叶子节点（无子节点）按访问顺序依次占据下一个
//      x 槽位（槽宽 = nodeW + gapX），保证任意两个叶子之间的水平距离
//      恰好是槽宽的整数倍，天然满足"同层间距 ≥ gapX、无重叠"。
//   3. 非叶子节点的 x = 其全部子节点 x 的 (min + max) / 2 —— 子节点的
//      叶子区间彼此不重叠且首尾相接，所以这个中点公式对任意树形都成立，
//      不仅仅是这里示例用的规则树。
//   4. y = depth * (nodeH + gapY)，与 x 的分配完全独立，只要 depth 本身
//      单调，y 就严格随 depth 递增。
//
// 纪律：零 Math.random、零 Date.now、非法输入直接 throw，不写 fallback。
(function () {
  "use strict";

  var CONFIG_KEYS = ["nodeW", "nodeH", "gapX", "gapY"];

  /**
   * 校验并规整化布局配置。四个字段全部必须是正有限数。
   * @param {*} config
   * @returns {{nodeW:number, nodeH:number, gapX:number, gapY:number}}
   */
  function validateConfig(config) {
    if (!config || typeof config !== "object") {
      throw new Error("TreeLayout: config 必须是对象，实际收到 " + typeof config);
    }
    var normalized = {};
    CONFIG_KEYS.forEach(function (key) {
      var value = config[key];
      if (typeof value !== "number" || !isFinite(value) || value <= 0) {
        throw new Error(
          "TreeLayout: config." + key + " 必须是正有限数，实际收到 " + JSON.stringify(value)
        );
      }
      normalized[key] = value;
    });
    return normalized;
  }

  /**
   * 校验节点数组是否构成一棵合法严格树，并建出父子邻接表。
   * 反例（必须抛错）：空数组、非数组、id 重复、parentId 悬空、
   * 根节点数量不为 1（含"零根"与"多根"两种）、存在环（含孤岛环）。
   * @param {*} nodes
   * @returns {{byId:Object, childrenOf:Object, rootId:string}}
   */
  function validateNodes(nodes) {
    if (!Array.isArray(nodes)) {
      throw new Error("TreeLayout: nodes 必须是数组，实际收到 " + typeof nodes);
    }
    if (nodes.length === 0) {
      throw new Error("TreeLayout: nodes 不能为空数组");
    }

    var byId = {};
    nodes.forEach(function (node) {
      if (!node || typeof node.id !== "string" || node.id === "") {
        throw new Error("TreeLayout: 存在缺少合法 id 的节点");
      }
      if (typeof node.depth !== "number" || !isFinite(node.depth) || node.depth < 0) {
        throw new Error("TreeLayout: 节点 " + node.id + " 的 depth 非法");
      }
      if (Object.prototype.hasOwnProperty.call(byId, node.id)) {
        throw new Error("TreeLayout: 节点 id 重复：" + node.id);
      }
      byId[node.id] = node;
    });

    var rootId = null;
    var rootCount = 0;
    nodes.forEach(function (node) {
      if (node.parentId === null || node.parentId === undefined) {
        rootCount += 1;
        rootId = node.id;
      }
    });
    if (rootCount !== 1) {
      throw new Error("TreeLayout: 根节点数量必须恰好为 1，实际为 " + rootCount);
    }

    var childrenOf = {};
    nodes.forEach(function (node) {
      if (node.parentId === null || node.parentId === undefined) {
        return;
      }
      if (!Object.prototype.hasOwnProperty.call(byId, node.parentId)) {
        throw new Error(
          "TreeLayout: 节点 " + node.id + " 的 parentId 悬空：" + node.parentId
        );
      }
      if (!childrenOf[node.parentId]) {
        childrenOf[node.parentId] = [];
      }
      childrenOf[node.parentId].push(node.id);
    });

    // 环检测：从唯一的根出发做 BFS，可达节点数若小于总节点数，
    // 说明剩下的节点组成了一个（或多个）与根不连通的环——因为每个
    // 节点的 parentId 都是单值，真正的环成员不可能同时挂在根的树上。
    var visited = {};
    visited[rootId] = true;
    var queue = [rootId];
    var head = 0;
    while (head < queue.length) {
      var current = queue[head];
      head += 1;
      var kids = childrenOf[current] || [];
      for (var i = 0; i < kids.length; i += 1) {
        visited[kids[i]] = true;
        queue.push(kids[i]);
      }
    }
    var visitedCount = Object.keys(visited).length;
    if (visitedCount !== nodes.length) {
      throw new Error(
        "TreeLayout: 检测到环或不可达节点，可达 " + visitedCount + "/" + nodes.length
      );
    }

    return { byId: byId, childrenOf: childrenOf, rootId: rootId };
  }

  /**
   * 对一棵严格树求解 tidy-tree 布局。
   * @param {{id:string, parentId:(string|null|undefined), depth:number}[]} nodes
   * @param {{nodeW:number, nodeH:number, gapX:number, gapY:number}} config
   * @returns {Object<string, {x:number, y:number, depth:number}>}
   */
  function solve(nodes, config) {
    var normalizedConfig = validateConfig(config);
    var built = validateNodes(nodes);

    var stepX = normalizedConfig.nodeW + normalizedConfig.gapX;
    var stepY = normalizedConfig.nodeH + normalizedConfig.gapY;

    var result = {};
    var leafIndex = 0;

    // 后序遍历：先算完子节点的 x，再用子节点 x 区间中点算自己的 x。
    function visit(id) {
      var kids = built.childrenOf[id] || [];
      var x;
      if (kids.length === 0) {
        x = leafIndex * stepX;
        leafIndex += 1;
      } else {
        var childXs = kids.map(visit);
        x = (Math.min.apply(null, childXs) + Math.max.apply(null, childXs)) / 2;
      }
      var node = built.byId[id];
      result[id] = { x: x, y: node.depth * stepY, depth: node.depth };
      return x;
    }

    visit(built.rootId);

    return result;
  }

  window.TreeLayout = {
    solve: solve
  };
})();
