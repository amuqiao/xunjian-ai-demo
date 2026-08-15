/**
 * kg-index.js —— KG.data 的派生索引（纯读，绝不修改 KG.data）
 *
 * 约定（不可破坏）：
 *   1. 经典脚本 IIFE，零 import / export / fetch / XHR / 动态 import()。
 *   2. 依赖 scripts/data/kg-data.js 先加载。
 *   3. 所有索引在 IIFE 内一次性 O(n) 构建，查询函数不再全量遍历。
 *   4. 任何返回的数组都是新数组（内部缓存数组会被复制后返出），
 *      调用方可以随意 sort / push，不会污染索引。
 */
(function (global) {
  'use strict';

  var KG = global.KG = global.KG || {};
  var data = KG.data;
  if (!data) throw new Error('[kg-index] KG.data 未加载：请检查 index.html 中 kg-data.js 是否排在 kg-index.js 之前');

  var META = data.meta;
  var ROOT_ID = META.rootId;
  var HUB_IDS = [META.hubs.task, META.hubs.domain, META.hubs.business];

  // 视角 → hub id
  var VIEW_HUB = { task: META.hubs.task, domain: META.hubs.domain, business: META.hubs.business };
  // 视角 → 横向边关系名
  var VIEW_REL = { domain: 'domainOf', business: 'bizOf' };

  // id 合法性正则
  var RE_HIER = /^T\d{2}(-F\d{2}(-K\d{2}(-C\d{2})?)?)?$/;
  var RE_DOMAIN = /^D[1-7]$/;
  var RE_BIZ = /^B[1-3]$/;
  var RE_DOC_NODE = /^DOC-[A-Za-z0-9]+(-[A-Za-z0-9]+)*$/;

  var REQUIRED_FIELDS = ['id', 'type', 'level', 'name', 'short', 'summary'];

  /* ============================================================
   * 一、基础索引
   * ========================================================== */

  var byId = {};
  data.nodes.forEach(function (node) { byId[node.id] = node; });

  // contains 树
  var childIds = {};   // parentId -> [childId]
  var parentId = {};   // childId  -> parentId
  // 横向投影
  var domainMembers = {};   // domainId -> [nodeId]
  var bizMembers = {};      // bizId    -> [nodeId]
  // 全部横向关联边
  var lateralEdges = [];

  data.nodes.forEach(function (node) { childIds[node.id] = []; });

  data.edges.forEach(function (edge) {
    if (edge.rel === 'contains') {
      if (childIds[edge.s]) childIds[edge.s].push(edge.t);
      parentId[edge.t] = edge.s;
    } else if (edge.rel === 'domainOf') {
      (domainMembers[edge.s] = domainMembers[edge.s] || []).push(edge.t);
    } else if (edge.rel === 'bizOf') {
      (bizMembers[edge.s] = bizMembers[edge.s] || []).push(edge.t);
    } else {
      lateralEdges.push(edge);
    }
  });

  /* ============================================================
   * 二、后代 / 路径 预计算
   * ========================================================== */

  var descendantIds = {};   // id -> [后代 id]（深度优先顺序）
  var pathIds = {};         // id -> [root … id]
  var depthOf = {};         // id -> contains 树深度（root = 0）
  var maxDepth = 0;

  (function buildTreeIndex() {
    // 从 root 出发做迭代式 DFS，避免深递归；同时记录路径与深度
    var stack = [ROOT_ID];
    pathIds[ROOT_ID] = [ROOT_ID];
    depthOf[ROOT_ID] = 0;
    var order = [];
    while (stack.length) {
      var id = stack.pop();
      order.push(id);
      var kids = childIds[id] || [];
      for (var i = kids.length - 1; i >= 0; i--) {
        var kid = kids[i];
        pathIds[kid] = pathIds[id].concat([kid]);
        depthOf[kid] = depthOf[id] + 1;
        if (depthOf[kid] > maxDepth) maxDepth = depthOf[kid];
        stack.push(kid);
      }
    }
    // 逆序累加后代（保证子节点先于父节点完成）
    for (var j = order.length - 1; j >= 0; j--) {
      var nid = order[j];
      var acc = [];
      (childIds[nid] || []).forEach(function (kid) {
        acc.push(kid);
        Array.prototype.push.apply(acc, descendantIds[kid] || []);
      });
      descendantIds[nid] = acc;
    }
  })();

  /* ============================================================
   * 三、搜索索引
   * ========================================================== */

  var searchIndex = data.nodes.map(function (node) {
    return {
      node: node,
      name: String(node.name || '').toLowerCase(),
      short: String(node.short || '').toLowerCase(),
      keywords: (node.keywords || []).join(' ').toLowerCase(),
      summary: String(node.summary || '').toLowerCase()
    };
  });

  // 类型权重：层级越高越靠前
  var TYPE_RANK = { root: 0, task: 1, direction: 2, technology: 3, business: 2, domain: 2, content: 4, document: 5 };

  /* ============================================================
   * 四、视角投影（带缓存）
   * ========================================================== */

  var viewCache = {};

  function buildTaskView() {
    var ids = {};
    ids[VIEW_HUB.task] = true;
    data.nodes.forEach(function (node) {
      if (node.type === 'task' || node.type === 'direction' || node.type === 'technology') ids[node.id] = true;
    });
    var nodeList = data.nodes.filter(function (node) { return ids[node.id]; });
    var edgeList = [];
    data.edges.forEach(function (edge) {
      if (edge.rel !== 'contains') return;
      if (ids[edge.s] && ids[edge.t]) edgeList.push(edge);
    });
    lateralEdges.forEach(function (edge) {
      if (ids[edge.s] && ids[edge.t]) edgeList.push(edge);
    });
    return { nodes: nodeList, edges: edgeList };
  }

  function buildSideView(view) {
    var hub = VIEW_HUB[view];
    var rel = VIEW_REL[view];
    var groupIds = view === 'domain' ? META.domains : META.businesses;
    var ids = {};
    ids[hub] = true;
    groupIds.forEach(function (gid) { ids[gid] = true; });

    var edgeList = [];
    // hub → 领域/业务
    groupIds.forEach(function (gid) { edgeList.push({ s: hub, t: gid, rel: 'contains' }); });
    // 领域/业务 → 挂载节点（只收 task 与 technology 两级，避免过密）
    data.edges.forEach(function (edge) {
      if (edge.rel !== rel) return;
      var target = byId[edge.t];
      if (!target) return;
      if (target.type !== 'task' && target.type !== 'technology') return;
      ids[edge.t] = true;
      edgeList.push(edge);
    });
    // 横向边（两端都在集合内才保留）
    lateralEdges.forEach(function (edge) {
      if (ids[edge.s] && ids[edge.t]) edgeList.push(edge);
    });

    var nodeList = data.nodes.filter(function (node) { return ids[node.id]; });
    return { nodes: nodeList, edges: edgeList };
  }

  function viewOf(view) {
    var key = VIEW_HUB[view] ? view : 'task';
    if (!viewCache[key]) viewCache[key] = key === 'task' ? buildTaskView() : buildSideView(key);
    return viewCache[key];
  }

  /* ============================================================
   * 五、统计
   * ========================================================== */

  var typeCount = {};
  data.nodes.forEach(function (node) { typeCount[node.type] = (typeCount[node.type] || 0) + 1; });

  var relCount = {};
  data.edges.forEach(function (edge) { relCount[edge.rel] = (relCount[edge.rel] || 0) + 1; });

  var stats = {
    nodes: data.nodes.length,
    edges: data.edges.length,
    docs: Object.keys(data.docs).length,
    tasks: META.tasks.length,
    domains: META.domains.length,
    businesses: META.businesses.length,
    directions: typeCount.direction || 0,
    technologies: typeCount.technology || 0,
    contents: typeCount.content || 0,
    maxDepth: maxDepth,
    byType: typeCount,
    byRel: relCount
  };

  /* ============================================================
   * 六、校验
   * ========================================================== */

  function validate() {
    var errors = [];
    var isSpecial = {};
    isSpecial[ROOT_ID] = true;
    HUB_IDS.forEach(function (id) { isSpecial[id] = true; });

    // 6.1 id 唯一
    var seen = {};
    data.nodes.forEach(function (node) {
      if (seen[node.id]) errors.push('[id 重复] ' + node.id);
      seen[node.id] = true;
    });

    data.nodes.forEach(function (node) {
      // 6.2 必填字段
      REQUIRED_FIELDS.forEach(function (field) {
        var val = node[field];
        if (val === undefined || val === null || val === '') {
          errors.push('[必填字段缺失] ' + node.id + ' 缺少 ' + field);
        }
      });

      // 6.3 id 格式
      if (!isSpecial[node.id]) {
        var ok = RE_HIER.test(node.id) || RE_DOMAIN.test(node.id) || RE_BIZ.test(node.id) || RE_DOC_NODE.test(node.id);
        if (!ok) errors.push('[id 格式非法] ' + node.id);
      }

      // 6.4 parentId 与 id 前缀推断一致
      if (node.id === ROOT_ID) {
        if (node.parentId) errors.push('[根节点不应有父节点] ' + node.id);
      } else {
        if (!node.parentId) {
          errors.push('[缺少 parentId] ' + node.id);
        } else if (!byId[node.parentId]) {
          errors.push('[parentId 不存在] ' + node.id + ' → ' + node.parentId);
        } else {
          var expect = null;
          if (HUB_IDS.indexOf(node.id) >= 0) expect = ROOT_ID;
          else if (RE_DOMAIN.test(node.id)) expect = META.hubs.domain;
          else if (RE_BIZ.test(node.id)) expect = META.hubs.business;
          else if (RE_HIER.test(node.id)) {
            expect = node.id.indexOf('-') < 0
              ? META.hubs.task
              : node.id.slice(0, node.id.lastIndexOf('-'));
          }
          if (expect && node.parentId !== expect) {
            errors.push('[parentId 与 id 前缀不一致] ' + node.id + ' 实际 ' + node.parentId + '，应为 ' + expect);
          }
        }
      }

      // 6.5 weight 范围
      if (typeof node.weight !== 'number' || node.weight < 1 || node.weight > 6) {
        errors.push('[weight 越界] ' + node.id + ' = ' + node.weight);
      }

      // 6.6 docId 存在
      if (node.docId && !data.docs[node.docId]) {
        errors.push('[docId 不存在] ' + node.id + ' → ' + node.docId);
      }

      // 6.7 domainIds / businessIds 引用
      (node.domainIds || []).forEach(function (did) {
        if (!byId[did]) errors.push('[domainId 不存在] ' + node.id + ' → ' + did);
        else if (byId[did].type !== 'domain') errors.push('[domainId 类型错误] ' + node.id + ' → ' + did);
      });
      (node.businessIds || []).forEach(function (bid) {
        if (!byId[bid]) errors.push('[businessId 不存在] ' + node.id + ' → ' + bid);
        else if (byId[bid].type !== 'business') errors.push('[businessId 类型错误] ' + node.id + ' → ' + bid);
      });

      // 6.8 taskId 一致性
      if (RE_HIER.test(node.id)) {
        var expectTask = node.id.slice(0, 3);
        if (node.taskId !== expectTask) errors.push('[taskId 不一致] ' + node.id + ' → ' + node.taskId);
        if (!byId[expectTask]) errors.push('[taskId 指向不存在的任务] ' + node.id + ' → ' + expectTask);
      }
    });

    // 6.9 边端点存在
    data.edges.forEach(function (edge) {
      if (!byId[edge.s]) errors.push('[边源端不存在] ' + edge.rel + ' ' + edge.s + ' → ' + edge.t);
      if (!byId[edge.t]) errors.push('[边目标端不存在] ' + edge.rel + ' ' + edge.s + ' → ' + edge.t);
    });

    // 6.10 contains 单父
    var inDegree = {};
    data.edges.forEach(function (edge) {
      if (edge.rel !== 'contains') return;
      inDegree[edge.t] = (inDegree[edge.t] || 0) + 1;
    });
    Object.keys(inDegree).forEach(function (id) {
      if (inDegree[id] > 1) errors.push('[contains 多父] ' + id + ' 入度 ' + inDegree[id]);
    });

    // 6.11 无孤儿（root/hub 除外：hub 有父，root 无父）
    data.nodes.forEach(function (node) {
      if (node.id === ROOT_ID) return;
      if (!inDegree[node.id]) errors.push('[孤儿节点] ' + node.id + ' 没有入向 contains 边');
    });

    // 6.12 contains 无环 + 全部可达
    var visited = {};
    var stack = [ROOT_ID];
    var guard = 0;
    while (stack.length) {
      if (++guard > data.nodes.length * 4) { errors.push('[contains 疑似成环] 遍历次数超限'); break; }
      var id = stack.pop();
      if (visited[id]) { errors.push('[contains 成环或重复到达] ' + id); continue; }
      visited[id] = true;
      (childIds[id] || []).forEach(function (kid) { stack.push(kid); });
    }
    data.nodes.forEach(function (node) {
      if (!visited[node.id]) errors.push('[不可从 root 到达] ' + node.id);
    });

    // 6.13 docs 完整性
    Object.keys(data.docs).forEach(function (key) {
      var doc = data.docs[key];
      if (!doc.title) errors.push('[文档缺少标题] ' + key);
      if (!doc.body) errors.push('[文档缺少正文] ' + key);
    });

    return errors;
  }

  /* ============================================================
   * 七、公开 API
   * ========================================================== */

  function nodeOf(idOrNode) {
    if (!idOrNode) return null;
    return typeof idOrNode === 'string' ? (byId[idOrNode] || null) : idOrNode;
  }

  function childrenOf(id) {
    return (childIds[id] || []).map(function (cid) { return byId[cid]; });
  }

  function parentOf(id) {
    var pid = parentId[id];
    return pid ? (byId[pid] || null) : null;
  }

  function pathOf(id) {
    return (pathIds[id] || []).map(function (nid) { return byId[nid]; });
  }

  function descendantsOf(id) {
    return (descendantIds[id] || []).map(function (nid) { return byId[nid]; });
  }

  function subtree(id, maxLevel) {
    var node = byId[id];
    if (!node) return null;
    var limit = typeof maxLevel === 'number' ? maxLevel : Infinity;
    function build(nid) {
      var n = byId[nid];
      var item = {
        id: n.id,
        name: n.name,
        short: n.short,
        type: n.type,
        level: n.level,
        value: n.weight,
        docId: n.docId
      };
      if (n.level < limit) {
        var kids = (childIds[nid] || []).map(build);
        if (kids.length) item.children = kids;
      }
      return item;
    }
    return build(id);
  }

  function nodesFor(view) { return viewOf(view).nodes.slice(); }
  function edgesFor(view) { return viewOf(view).edges.slice(); }

  function search(q, limit) {
    var query = String(q || '').trim().toLowerCase();
    if (!query) return [];
    var cap = typeof limit === 'number' ? limit : 20;
    var hits = [];
    searchIndex.forEach(function (entry) {
      var score = 0;
      if (entry.name === query) score = 100;
      else if (entry.short === query) score = 92;
      else if (entry.name.indexOf(query) === 0) score = 84;
      else if (entry.name.indexOf(query) > 0) score = 70;
      else if (entry.short.indexOf(query) >= 0) score = 62;
      else if (entry.keywords.indexOf(query) >= 0) score = 50;
      else if (entry.summary.indexOf(query) >= 0) score = 30;
      if (!score) return;
      hits.push({ node: entry.node, score: score });
    });
    hits.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      var ra = TYPE_RANK[a.node.type] === undefined ? 9 : TYPE_RANK[a.node.type];
      var rb = TYPE_RANK[b.node.type] === undefined ? 9 : TYPE_RANK[b.node.type];
      if (ra !== rb) return ra - rb;
      return a.node.id < b.node.id ? -1 : 1;
    });
    return hits.slice(0, cap).map(function (hit) { return hit.node; });
  }

  function docOf(id) {
    var cursor = id;
    while (cursor) {
      var node = byId[cursor];
      if (!node) return null;
      if (node.docId && data.docs[node.docId]) return data.docs[node.docId];
      cursor = parentId[cursor];
    }
    return null;
  }

  function colorOf(idOrNode) {
    var node = nodeOf(idOrNode);
    if (!node) return META.typeColorVar.root;
    return META.typeColorVar[node.type] || META.typeColorVar.root;
  }

  function labelOf(idOrNode) {
    var node = nodeOf(idOrNode);
    if (!node) return '';
    return META.typeLabel[node.type] || node.type;
  }

  KG.index = {
    byId: byId,
    nodeOf: nodeOf,
    childrenOf: childrenOf,
    parentOf: parentOf,
    pathOf: pathOf,
    descendantsOf: descendantsOf,
    depthOf: function (id) { return depthOf[id]; },
    subtree: subtree,
    nodesFor: nodesFor,
    edgesFor: edgesFor,
    search: search,
    stats: stats,
    docOf: docOf,
    colorOf: colorOf,
    labelOf: labelOf,
    validate: validate
  };

})(window);
