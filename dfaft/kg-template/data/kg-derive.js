/**
 * kg-derive.js —— 派生投影层
 * ═══════════════════════════════════════════════════════════════════
 * 把 KG.source（人写着舒服的嵌套结构）展平成 nodes/edges（机器算着舒服的图），
 * 再向三个视图投影出各自要的形状。**视图不许直接读 KG.source**。
 *
 * 这一层是模板能换数据的关键：视图只认下面这套 API，
 * 换业务数据时 API 形状不变，视图代码一行不用动。
 *
 * ── 对外 API（B 组三个视图 + shell 共用的契约） ──────────────────
 *   KG.derive.ready()                  幂等构建，重复调用无副作用
 *   KG.derive.get(id)                  取扁平节点
 *   KG.derive.childrenOf(id)           直接子节点数组
 *   KG.derive.pathOf(id)               [根类目 … 自身]，面包屑用
 *   KG.derive.categoryOf(id)           该节点所属的类目节点
 *   KG.derive.treeOf(catId)            树视图用的嵌套结构（带稳定 id）
 *   KG.derive.sampleCount(catId)       树里实际建模的叶子数
 *   KG.derive.stageCards()             展台八张立牌
 *   KG.derive.graphProjection()        图谱用的 {nodes, links}
 *   KG.derive.search(q)                全局检索，结果按类型分组
 *   KG.derive.resolveView(id, view)    跨视图焦点解析 + 降级
 *   KG.derive.metrics()                展台底部指标条（补齐派生值）
 *   KG.derive.stats()                  规模统计
 *   KG.derive.validate()               数据体检，返回 {ok, errors, warnings}
 *
 * 错误策略：构建期发现的结构性错误直接 throw，不静默跳过。
 * 接业务数据时"页面能打开但少了半棵树"比"打开就报错"难查得多。
 * ═══════════════════════════════════════════════════════════════════
 */
(function (global) {
  'use strict';

  var KG = global.KG = global.KG || {};
  if (!KG.source) throw new Error('[kg-derive] KG.source 未加载：kg-data.js 必须在 kg-derive.js 之前引入');
  if (!KG.config) throw new Error('[kg-derive] KG.config 未加载：kg-config.js 必须在 kg-derive.js 之前引入');

  var S = KG.source;
  var LIM = KG.config.limits;

  /* ── 内部状态 ───────────────────────────────────────────── */
  var built = false;
  var nodes = {};        // id → node
  var order = [];        // 稳定顺序的 id 数组
  var edges = [];        // { s, t, rel, major }
  var adjacency = {};    // id → [{ id, rel, dir }]

  /* 类型到视图的落点是模板行为合同，不放进业务文案配置。
     shell 只通过 viewOfType() 读取，避免维护第二份规则。 */
  var VIEW_OF_TYPE = {
    category: 'tree',
    topic:    'tree',
    subtopic: 'tree',
    doc:      'tree',
    item:     'tree',
    entity:   'graph',
    hub:      'graph'
  };

  /* ── 安全阀 ───────────────────────────────────────────────
     超出演示上限**直接报错**，不截断、不降级。
     这是演示模板：数据量本来就该在上限内，超了就是数据配错了，
     悄悄砍掉一半继续画的话，你要到路演现场才发现少讲了东西。 */
  function over(what, actual, max, where, hint) {
    throw new Error(
      '[kg-derive] 超出演示上限：' + what + ' 实际 ' + actual + '，上限 ' + max +
      (where ? '（' + where + '）' : '') +
      '。上限定义在 data/kg-config.js 的 limits，' +
      (hint || '调高之前请先确认画面放得下')
    );
  }

  /* ── 工具 ───────────────────────────────────────────────── */
  function fmt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function tpl(s, data) {
    return String(s).replace(/\{([a-zA-Z0-9_]+)\}/g, function (_, key) {
      if (!Object.prototype.hasOwnProperty.call(data, key)) {
        throw new Error('[kg-derive] 文案模板缺少变量：' + key + '（' + s + '）');
      }
      return data[key];
    });
  }
  function cfg(path) {
    return path.split('.').reduce(function (o, key) {
      return o && o[key];
    }, KG.config);
  }
  function requireString(path) {
    var v = cfg(path);
    if (typeof v !== 'string' || !v) throw new Error('[kg-derive] KG.config.' + path + ' 必须是非空字符串');
  }
  function requireArray(path) {
    var v = cfg(path);
    if (!Array.isArray(v) || !v.length) throw new Error('[kg-derive] KG.config.' + path + ' 必须是非空数组');
    return v;
  }

  /* 树比 treeLevels 更深时，**钳在最后一项**，不要用取模回绕——
     回绕会让第 6 层的节点重新变成 'category'，于是几千个叶子被当成知识库类目：
     图谱聚焦逻辑、检索分组、树的图例和字号全部错乱，而 validate() 还是全绿。 */
  function typeAtDepth(d) {
    var L = S.treeLevels;
    return L[Math.min(d, L.length - 1)];
  }

  function put(node) {
    if (nodes[node.id]) {
      throw new Error('[kg-derive] id 重复：「' + node.id + '」被 “' +
        nodes[node.id].label + '” 和 “' + node.label + '” 同时使用');
    }
    nodes[node.id] = node;
    order.push(node.id);
    return node;
  }

  function link(s, t, rel) {
    if (!nodes[s]) throw new Error('[kg-derive] 关系源节点不存在：' + s);
    if (!nodes[t]) throw new Error('[kg-derive] 关系目标节点不存在：' + t);
    var def = S.relTypes[rel];
    if (!def) throw new Error('[kg-derive] 未注册的关系类型：' + rel);
    edges.push({ s: s, t: t, rel: rel, label: def.label, major: !!def.major });
    (adjacency[s] || (adjacency[s] = [])).push({ id: t, rel: rel, dir: 'out' });
    (adjacency[t] || (adjacency[t] = [])).push({ id: s, rel: rel, dir: 'in' });
  }

  /* ── 构建 ───────────────────────────────────────────────── */
  function build() {
    var hub = S.meta.hub;
    put({
      id: hub.id, type: 'hub', label: hub.name, en: hub.en, desc: hub.desc,
      depth: -1, parentId: null, catId: null, children: []
    });

    S.categories.forEach(function (cat) {
      var catNode = put({
        id: cat.id, type: 'category', label: cat.name, en: cat.en, code: cat.code,
        color: cat.color, icon: cat.icon, note: cat.note, desc: cat.desc,
        docTotal: cat.docTotal, featured: cat.featured || [],
        depth: 0, parentId: hub.id, catId: cat.id, children: []
      });
      nodes[hub.id].children.push(cat.id);
      link(hub.id, cat.id, 'contains');
      walk(cat.children || [], catNode, cat, 1);
    });

    S.entities.forEach(function (e) {
      put({
        id: e.id, type: 'entity', label: e.label, desc: e.desc,
        color: S.types.entity.color, depth: null, parentId: null, catId: null, children: []
      });
    });

    S.relations.forEach(function (r) { link(r[0], r[1], r[2]); });

    /* featured 必须指向该类目下真实存在的叶子——图谱的文档节点全靠它，
       写错一个 id，图谱上就少一个节点且毫无提示，所以在这里挡住 */
    S.categories.forEach(function (cat) {
      (cat.featured || []).forEach(function (fid) {
        var n = nodes[fid];
        if (!n) throw new Error('[kg-derive] ' + cat.name + ' 的 featured 指向不存在的节点：' + fid);
        if (n.catId !== cat.id) throw new Error('[kg-derive] ' + cat.name + ' 的 featured「' + fid + '」不属于该类目');
        if (n.children.length) throw new Error('[kg-derive] featured 必须是叶子文档，「' + fid + '」还有子节点');
      });
    });

    enforceLimits();
    built = true;
  }

  /* 演示上限体检。放在构建之后统一做，错误信息才能报出"实际多少"。 */
  function enforceLimits() {
    validateConfig();

    function leafCount(id) {
      var n = nodes[id];
      return n.children.length ? n.children.reduce(function (s, c) { return s + leafCount(c); }, 0) : 1;
    }
    function maxDepth(id) {
      var n = nodes[id];
      return n.children.length ? Math.max.apply(null, n.children.map(maxDepth)) : n.depth;
    }

    if (S.categories.length > LIM.categories) {
      over(S.types.category.label, S.categories.length, LIM.categories, null,
        '立牌绕圆桌排一圈，再多会互相遮挡');
    }
    if (S.entities.length > LIM.entities) {
      over(S.types.entity.label, S.entities.length, LIM.entities, null,
        '实体没有层级约束、纯靠斥力散开，多了会糊成一团');
    }

    var keep = {};
    keep[S.meta.hub.id] = true;
    S.categories.forEach(function (cat) {
      keep[cat.id] = true;
      (cat.featured || []).forEach(function (fid) { keep[fid] = true; });
    });
    S.entities.forEach(function (e) { keep[e.id] = true; });

    var gNodes = Object.keys(keep).length;
    if (gNodes > LIM.graphNodes) {
      over('图谱节点总数', gNodes, LIM.graphNodes, null, '力导向是 O(n²)，且标签会开始互相压');
    }
    var gLinks = S.categories.length +
      S.categories.reduce(function (s, c) { return s + (c.featured || []).length; }, 0);
    edges.forEach(function (e) {
      if (e.rel !== 'contains' && keep[e.s] && keep[e.t]) gLinks++;
    });
    if (gLinks > LIM.graphLinks) {
      over('图谱关系总数', gLinks, LIM.graphLinks, null, '连线过密会压住节点标签与详情阅读路径');
    }

    S.categories.forEach(function (cat) {
      var leaves = leafCount(cat.id);
      if (leaves > LIM.leavesPerCategory) {
        over('单个' + S.types.category.label + '的' + KG.config.text.docUnitLong, leaves, LIM.leavesPerCategory, cat.name,
          '树按叶子数纵向铺开，超了只能整体缩小、标签会糊');
      }
      var f = (cat.featured || []).length;
      if (f > LIM.featuredPerCategory) {
        over('单个' + S.types.category.label + '的图谱代表节点数', f, LIM.featuredPerCategory, cat.name,
          '图谱初始扇形会互相压，多了布局会退化成一团');
      }
      var d = maxDepth(cat.id);
      if (d + 1 > LIM.treeDepth) {
        over('树层级深度', d + 1, LIM.treeDepth, cat.name, '超出的层会全部钉在最后一级样式上');
      }
      if (KG.config.icons.indexOf(cat.icon) < 0) {
        throw new Error('[kg-derive] 类目「' + cat.name + '」的图标 "' + cat.icon +
          '" 不在可用列表里。可选：' + KG.config.icons.join(' / ') +
          '。要加新图标，在 views/stage/stage.js 的 ICONS 里写绘制函数，再登记到 kg-config.js 的 icons');
      }
    });

    requireArray('searchGroups').forEach(function (g) {
      if (!g.key || !g.label || !g.types || !g.types.length) {
        throw new Error('[kg-derive] searchGroups 配置不完整：每组必须有 key / label / types');
      }
      g.types.forEach(function (type) {
        if (!S.types[type]) throw new Error('[kg-derive] searchGroups.' + g.key + ' 引用了未注册类型：' + type);
      });
    });

    Object.keys(VIEW_OF_TYPE).forEach(function (type) {
      if (!S.types[type]) throw new Error('[kg-derive] viewOfType 引用了未注册类型：' + type);
      if (!VIEW_OF_TYPE[type]) throw new Error('[kg-derive] viewOfType.' + type + ' 没有配置目标视图');
    });
  }

  function validateConfig() {
    [
      'text.docUnit', 'text.docUnitLong', 'text.sampleLabel', 'text.truncatedHint',
      'ui.pageTitleSuffix',
      'ui.search.title', 'ui.search.scope', 'ui.search.placeholder',
      'ui.search.suggestionsCategory', 'ui.search.suggestionsEntity', 'ui.search.noMatch',
      'ui.stage.eyebrow', 'ui.stage.liveText', 'ui.stage.loadingText', 'ui.stage.focusLabel', 'ui.stage.cardFooter',
      'ui.graph.degreeLabel', 'ui.graph.totalLabel', 'ui.graph.jumpToTree',
      'ui.tree.eyebrow', 'ui.tree.title', 'ui.tree.topicUnit', 'ui.tree.hintHtml', 'ui.tree.jumpToGraph',
      'ui.intro.titleSuffix', 'ui.intro.rolesTitle', 'ui.intro.typeTitle',
      'ui.intro.statsTitle', 'ui.intro.relationTitle', 'ui.intro.guideTitle',
      'ui.intro.stageQuestion', 'ui.intro.stageDesc', 'ui.intro.graphQuestion',
      'ui.intro.graphDesc', 'ui.intro.treeQuestion', 'ui.intro.treeDesc', 'ui.intro.guideHtml',
      'messages.stageNodeToCategory', 'messages.entityToStage',
      'messages.graphNonFeaturedLeaf', 'messages.graphBranchMissing',
      'messages.graphFocusCategory', 'messages.treeEntity'
    ].forEach(requireString);

    requireArray('ui.views').forEach(function (v, i) {
      ['key', 'label', 'en', 'title'].forEach(function (k) {
        if (typeof v[k] !== 'string' || !v[k]) {
          throw new Error('[kg-derive] KG.config.ui.views[' + i + '].' + k + ' 必须是非空字符串');
        }
      });
    });

    var statFields = { nodes: true, edges: true, docTotal: true, sampleTotal: true };
    requireArray('ui.intro.stats').forEach(function (s, i) {
      if (typeof s.key !== 'string' || !s.key) {
        throw new Error('[kg-derive] KG.config.ui.intro.stats[' + i + '].key 必须是非空字符串');
      }
      if (!statFields[s.value]) {
        throw new Error('[kg-derive] KG.config.ui.intro.stats[' + i + '].value 不支持：' + s.value);
      }
    });
  }

  /* 展台立牌底部进度条的分母。config.progressBase 为 null 时
     取所有类目里最大的 docTotal，于是进度条表达"相对体量"，换任何数据都成立。 */
  function progressBase() {
    ready();
    if (KG.config.progressBase != null) return KG.config.progressBase;
    return S.categories.reduce(function (m, c) { return Math.max(m, docTotal(c.id)); }, 1);
  }

  function walk(list, parent, cat, depth) {
    list.forEach(function (raw, i) {
      var id = raw.id || (parent.id + '__' + (i + 1));
      var node = put({
        id: id, type: typeAtDepth(depth), label: raw.name, desc: raw.desc || null,
        depth: depth, parentId: parent.id, catId: cat.id, children: []
      });
      parent.children.push(id);
      link(parent.id, id, 'contains');
      if (raw.children && raw.children.length) walk(raw.children, node, cat, depth + 1);
    });
  }

  function ready() { if (!built) build(); return API; }

  /* ── 基础访问 ───────────────────────────────────────────── */
  function get(id) { ready(); return nodes[id] || null; }
  function childrenOf(id) { ready(); return (nodes[id] ? nodes[id].children : []).map(get); }
  function parentOf(id) { ready(); var n = nodes[id]; return n && n.parentId ? nodes[n.parentId] : null; }

  function pathOf(id) {
    ready();
    var chain = [], n = nodes[id];
    while (n && n.type !== 'hub') { chain.unshift(n); n = n.parentId ? nodes[n.parentId] : null; }
    return chain;
  }

  function categoryOf(id) { ready(); var n = nodes[id]; return n && n.catId ? nodes[n.catId] : null; }

  function leavesOf(id) {
    ready();
    var out = [];
    (function rec(nid) {
      var n = nodes[nid];
      if (!n.children.length) { out.push(n); return; }
      n.children.forEach(rec);
    })(id);
    return out;
  }

  function sampleCount(catId) { return leavesOf(catId).length; }

  /* docTotal 缺省时回落到样本数：接入完整业务数据的场景下两者本就该合一 */
  function docTotal(catId) {
    var n = get(catId);
    return n.docTotal == null ? sampleCount(catId) : n.docTotal;
  }

  /* ── 投影一：树视图 ─────────────────────────────────────── */
  function treeOf(catId) {
    ready();
    return (function rec(id) {
      var n = nodes[id];
      var out = { id: n.id, name: n.label, type: n.type, depth: n.depth, desc: n.desc };
      if (n.children.length) out.children = n.children.map(rec);
      return out;
    })(catId);
  }

  /* ── 投影二：展台 ───────────────────────────────────────── */
  function stageCards() {
    ready();
    return S.categories.map(function (cat) {
      var total = docTotal(cat.id);
      return {
        id: cat.id, name: cat.name, en: cat.en, code: cat.code,
        color: cat.color, icon: cat.icon, note: cat.note,
        count: fmt(total), countRaw: total,
        sample: sampleCount(cat.id),
        desc: cat.desc
      };
    });
  }

  /* ── 投影三：关系图谱 ───────────────────────────────────────
     图谱只收 hub / category / entity / featured 文档四类节点。
     被收的文档直接挂到类目上（跳过中间的分类、子类两层）——
     图谱回答的是"跨类目怎么连"，不是"目录怎么分"，中间层由树视图负责。 */
  function graphProjection() {
    ready();
    var keep = {};
    var gnodes = [];

    function push(n, extra) {
      keep[n.id] = true;
      gnodes.push(Object.assign({
        id: n.id, type: n.type, label: n.label, color: n.color, desc: n.desc
      }, extra || {}));
    }

    var hub = nodes[S.meta.hub.id];
    push(hub, { color: S.types.hub.color, docs: fmt(S.categories.reduce(function (s, c) { return s + docTotal(c.id); }, 0)) });

    S.categories.forEach(function (cat) {
      push(nodes[cat.id], { docs: fmt(docTotal(cat.id)) });
    });
    S.entities.forEach(function (e) { push(nodes[e.id]); });

    S.categories.forEach(function (cat) {
      (cat.featured || []).forEach(function (fid) {
        var n = nodes[fid];
        push(n, { color: cat.color, parent: cat.id, path: pathOf(fid).map(function (p) { return p.label; }).join(' / ') });
      });
    });

    var links = [];
    var seen = {};
    function addLink(s, t, rel) {
      var k = s + '>' + t + '>' + rel;
      if (seen[k]) return;
      seen[k] = true;
      links.push({ source: s, target: t, rel: S.relTypes[rel].label, type: rel });
    }

    S.categories.forEach(function (cat) {
      addLink(hub.id, cat.id, 'contains');
      (cat.featured || []).forEach(function (fid) { addLink(cat.id, fid, 'contains'); });
    });

    edges.forEach(function (e) {
      if (e.rel === 'contains') return;               // 层级边已在上面按投影规则重建
      if (!keep[e.s] || !keep[e.t]) return;           // 两端都得在图谱里
      addLink(e.s, e.t, e.rel);
    });

    return { nodes: gnodes, links: links };
  }

  /* ── 全局检索 ───────────────────────────────────────────── */
  function search(q, limitPerGroup) {
    ready();
    var kw = String(q || '').trim().toLowerCase();
    if (!kw) return [];
    var cap = limitPerGroup || LIM.searchHitsPerGroup;

    return KG.config.searchGroups.map(function (g) {
      var hits = [];
      for (var i = 0; i < order.length && hits.length < cap; i++) {
        var n = nodes[order[i]];
        if (g.types.indexOf(n.type) < 0) continue;
        var hay = (n.label + ' ' + (n.en || '') + ' ' + (n.code || '')).toLowerCase();
        if (hay.indexOf(kw) < 0) continue;
        hits.push({
          id: n.id, label: n.label, type: n.type,
          path: n.catId ? pathOf(n.id).slice(0, -1).map(function (p) { return p.label; }).join(' / ') : '',
          color: n.color || (categoryOf(n.id) ? categoryOf(n.id).color : S.types[n.type].color)
        });
      }
      return { key: g.key, label: g.label, hits: hits };
    }).filter(function (g) { return g.hits.length; });
  }

  function viewOfType(type) {
    ready();
    var view = VIEW_OF_TYPE[type];
    if (!view) throw new Error('[kg-derive] 类型「' + type + '」没有登记落点视图，见 kg-derive.js 的 VIEW_OF_TYPE');
    return view;
  }

  /* ── 跨视图焦点解析 ─────────────────────────────────────────
     同一个节点在三个视图里不一定都有对应物。这里给出"最接近的落点"
     和一句给用户的解释，而不是静默跳到别处或者什么都不做。 */
  function resolveView(id, view) {
    ready();
    var n = get(id);
    if (!n) throw new Error('[kg-derive] resolveView 收到未知 id：' + id);

    if (view === 'stage') {
      if (n.type === 'category') return { view: view, focusId: n.id, note: null };
      if (n.catId) return {
        view: view,
        focusId: n.catId,
        note: tpl(KG.config.messages.stageNodeToCategory, { category: nodes[n.catId].label })
      };
      if (n.type === 'entity') {
        var top = topCategoryOfEntity(n.id);
        return {
          view: view,
          focusId: top.id,
          note: tpl(KG.config.messages.entityToStage, { node: n.label, category: top.label })
        };
      }
      return { view: view, focusId: null, note: null };
    }

    if (view === 'graph') {
      if (n.type === 'hub' || n.type === 'category' || n.type === 'entity') return { view: view, focusId: n.id, note: null };
      var cat = nodes[n.catId];
      if (cat.featured.indexOf(n.id) >= 0) return { view: view, focusId: n.id, note: null };
      var why = (n.type === 'doc' || n.type === 'item')
        ? tpl(KG.config.messages.graphNonFeaturedLeaf, { node: n.label })
        : tpl(KG.config.messages.graphBranchMissing, { node: n.label });
      return {
        view: view,
        focusId: cat.id,
        note: tpl(KG.config.messages.graphFocusCategory, { reason: why, category: cat.label })
      };
    }

    if (view === 'tree') {
      if (n.catId) return { view: view, focusId: n.id, topicId: n.catId, note: null };
      if (n.type === 'entity') {
        var t = topCategoryOfEntity(n.id);
        return {
          view: view, focusId: t.id, topicId: t.id,
          highlight: docsTaggedBy(n.id).map(function (d) { return d.id; }),
          note: tpl(KG.config.messages.treeEntity, { category: t.label })
        };
      }
      var first = S.categories[0];
      return { view: view, focusId: first.id, topicId: first.id, note: null };
    }

    throw new Error('[kg-derive] 未知视图：' + view);
  }

  function docsTaggedBy(entityId) {
    ready();
    return (adjacency[entityId] || [])
      .filter(function (a) { var n = nodes[a.id]; return n.type === 'doc' || n.type === 'item'; })
      .map(function (a) { return nodes[a.id]; });
  }

  function topCategoryOfEntity(entityId) {
    ready();
    var tally = {};
    (adjacency[entityId] || []).forEach(function (a) {
      var n = nodes[a.id];
      var cid = n.type === 'category' ? n.id : n.catId;
      if (cid) tally[cid] = (tally[cid] || 0) + 1;
    });
    var best = null, bestN = -1;
    S.categories.forEach(function (c) {
      var v = tally[c.id] || 0;
      if (v > bestN) { bestN = v; best = nodes[c.id]; }
    });
    return best;
  }

  function neighborsOf(id) {
    ready();
    return (adjacency[id] || []).map(function (a) {
      return { node: nodes[a.id], rel: S.relTypes[a.rel].label, dir: a.dir };
    });
  }

  /* ── 统计与指标 ─────────────────────────────────────────── */
  function stats() {
    ready();
    var byType = {};
    order.forEach(function (id) { var t = nodes[id].type; byType[t] = (byType[t] || 0) + 1; });
    return {
      byType: byType,
      nodes: order.length,
      edges: edges.length,
      docTotal: S.categories.reduce(function (s, c) { return s + docTotal(c.id); }, 0),
      sampleTotal: S.categories.reduce(function (s, c) { return s + sampleCount(c.id); }, 0)
    };
  }

  var DERIVERS = {
    categories: function () { return String(S.categories.length); },
    docTotal:   function () { return fmt(stats().docTotal); }
  };

  function metrics() {
    ready();
    return S.meta.metrics.map(function (m) {
      var v = m.value;
      if (v === null) {
        if (!DERIVERS[m.key]) throw new Error('[kg-derive] 指标「' + m.key + '」的 value 为 null 但没有对应的派生器');
        v = DERIVERS[m.key]();
      }
      return { key: m.key, label: m.label, value: v, unit: m.unit };
    });
  }

  /* ── 体检 ───────────────────────────────────────────────── */
  function validate() {
    ready();
    var errors = [], warnings = [];

    order.forEach(function (id) {
      var n = nodes[id];
      if (!S.types[n.type]) errors.push('节点 ' + id + ' 的类型「' + n.type + '」未在 types 里注册');
      if (!n.label) errors.push('节点 ' + id + ' 没有名称');
    });

    S.categories.forEach(function (c) {
      if (!c.color) errors.push('类目 ' + c.id + ' 缺少 color');
      if (!c.icon) errors.push('类目 ' + c.id + ' 缺少 icon');
      if (!c.featured || !c.featured.length) warnings.push('类目 ' + c.name + ' 没有 featured，关系图谱里将只是一个孤立的类目节点');
      if (c.docTotal != null && c.docTotal < sampleCount(c.id)) {
        warnings.push('类目 ' + c.name + ' 的 docTotal(' + c.docTotal + ') 小于树里的样本数(' + sampleCount(c.id) + ')');
      }
    });

    S.entities.forEach(function (e) {
      if (!(adjacency[e.id] || []).length) warnings.push('实体标签「' + e.label + '」没有任何关系，图谱里会是一个飘着的孤点');
    });

    return { ok: errors.length === 0, errors: errors, warnings: warnings };
  }

  /* ── 导出 ───────────────────────────────────────────────── */
  var API = KG.derive = {
    ready: ready,
    get: get, childrenOf: childrenOf, parentOf: parentOf, pathOf: pathOf,
    categoryOf: categoryOf, leavesOf: leavesOf, neighborsOf: neighborsOf,
    sampleCount: sampleCount, docTotal: docTotal,
    treeOf: treeOf, stageCards: stageCards, graphProjection: graphProjection,
    search: search, viewOfType: viewOfType, resolveView: resolveView, docsTaggedBy: docsTaggedBy,
    metrics: metrics, stats: stats, validate: validate,
    progressBase: progressBase,
    format: fmt,
    get text() { return KG.config.text; },
    get ui() { return KG.config.ui; },
    get config() { return KG.config; },
    get limits() { return LIM; },
    get types() { ready(); return S.types; },
    get relTypes() { ready(); return S.relTypes; },
    get hub() { return get(S.meta.hub.id); },
    get categories() { ready(); return S.categories.map(function (c) { return nodes[c.id]; }); },
    get entities() { ready(); return S.entities.map(function (e) { return nodes[e.id]; }); },
    get meta() { return S.meta; }
  };

  ready();

})(typeof window !== 'undefined' ? window : this);
