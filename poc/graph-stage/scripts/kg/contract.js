/**
 * contract.js —— 分类法派生规则 + 数据契约（graph-stage 冻结表 A · 2.1/2.2 节）
 *
 * 零依赖：只读 window.KGTaxonomy（scripts/kg/taxonomy.js 必须先加载），不读任何
 * 具体数据文件。经典脚本 IIFE，零 import / export / fetch / XHR。
 *
 * 本文件唯一的职责是把"层数是数据"这件事坐实：id 正则、类型枚举、层级映射全部在
 * 调用时从 window.KGTaxonomy **现读**，不在模块加载时缓存成闭包常量。这不是洁癖——
 * 是可测试性要求：verify_taxonomy.js 里那条元断言会在运行期把 levels 砍到 3 层，
 * 如果这里在加载时就把 5 层的正则缓存死，那条断言测的就是缓存值而不是真实行为。
 *
 * 派生规则（对应 DESIGN.md 2.1 节"派生规则"表）：
 *   levels[1].id  = "T01"                    prefix + digits
 *   levels[2].id  = "T01-F01"                父 id + idSep + prefix + digits
 *   去掉最后一段 = 父 id                       （parentIdOf，校验 parentId 一致性用）
 *   类型枚举      = levels[].type ∪ facets[].type
 * facets 成员 id（如 "D1"）不参与主干层级链，是独立的一段格式，挂在根节点之下
 * （facets 是横切维度，不是主干层级树的一支，没有"层"这个概念，parentIdOf 对它们
 * 恒返回 rootId）。
 */
(function () {
  'use strict';

  /* ============================================================
   * 一、基础工具：读分类法、转义正则
   * ========================================================== */

  // 每次调用都现读 window.KGTaxonomy，不缓存——见文件头注释。
  function getTaxonomy() {
    var taxonomy = window.KGTaxonomy;
    if (!taxonomy || typeof taxonomy !== 'object') {
      throw new Error('[KGContract] window.KGTaxonomy 未加载：请检查 scripts/kg/taxonomy.js 是否已排在本文件之前');
    }
    return taxonomy;
  }

  function escapeRegExp(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function facetByKey(key) {
    var taxonomy = getTaxonomy();
    var hit = taxonomy.facets.filter(function (facet) { return facet.key === key; })[0];
    if (!hit) {
      throw new Error('[KGContract] facetByKey: 未知的 facet key "' + key + '"，合法值：' +
        taxonomy.facets.map(function (f) { return f.key; }).join('|'));
    }
    return hit;
  }

  function facetByType(type) {
    var taxonomy = getTaxonomy();
    var hit = taxonomy.facets.filter(function (facet) { return facet.type === type; })[0];
    if (!hit) {
      throw new Error('[KGContract] facetByType: 未知的 facet type "' + type + '"');
    }
    return hit;
  }

  function levelByType(type) {
    var taxonomy = getTaxonomy();
    var hit = taxonomy.levels.filter(function (lvl) { return lvl.type === type; })[0];
    if (!hit) {
      throw new Error('[KGContract] levelByType: 未知的层级 type "' + type + '"');
    }
    return hit;
  }

  function levelTypes() {
    return getTaxonomy().levels.map(function (lvl) { return lvl.type; });
  }

  function facetTypes() {
    return getTaxonomy().facets.map(function (facet) { return facet.type; });
  }

  function allTypes() {
    return levelTypes().concat(facetTypes());
  }

  /* ============================================================
   * 二、id 正则：唯一从 levels[]/facets[] 逐层拼出正则的地方
   * ========================================================== */

  // 拼出"从 level 1 一路拼到 levelIndex"的完整 id 正则。levelIndex=0 时返回只匹配
  // rootId 字面量的正则（根层没有 seg，不能走拼接逻辑）。
  //
  // 这是本文件对"深度真的是数据"这条设计立场的直接实现：levelIndex 的上界由
  // taxonomy.levels.length 现读决定，砍掉 levels 的最后几项，buildIdPattern 能拼出
  // 的最大深度就跟着变短——不需要改这个函数一个字符。
  function buildIdPattern(levelIndex) {
    var taxonomy = getTaxonomy();
    var levels = taxonomy.levels;
    if (typeof levelIndex !== 'number' || levelIndex < 0 || levelIndex >= levels.length) {
      throw new Error('[KGContract] buildIdPattern(levelIndex) 越界：levelIndex=' + levelIndex +
        '，当前 levels 长度=' + levels.length + '，合法范围 [0, ' + (levels.length - 1) + ']');
    }
    var rootLevel = levels[0];
    if (rootLevel.seg !== null) {
      throw new Error('[KGContract] levels[0]（根层）的 seg 必须为 null，实际=' + JSON.stringify(rootLevel.seg));
    }
    if (levelIndex === 0) {
      return new RegExp('^' + escapeRegExp(taxonomy.rootId) + '$');
    }
    var segs = [];
    for (var i = 1; i <= levelIndex; i += 1) {
      var seg = levels[i] && levels[i].seg;
      if (!seg || typeof seg.prefix !== 'string' || !seg.prefix || typeof seg.digits !== 'number' || seg.digits < 1) {
        throw new Error('[KGContract] levels[' + i + '].seg 缺失或形状非法，实际=' + JSON.stringify(seg));
      }
      segs.push(escapeRegExp(seg.prefix) + '\\d{' + seg.digits + '}');
    }
    return new RegExp('^' + segs.join(escapeRegExp(taxonomy.idSep)) + '$');
  }

  // 单个 facet 的成员 id 正则（如 domain → /^D\d{1}$/），facet 成员不走 idSep 拼接，
  // 因为 facet 不是主干层级链上的一环。
  function buildFacetIdPattern(facetKeyOrFacet) {
    var facet = typeof facetKeyOrFacet === 'string' ? facetByKey(facetKeyOrFacet) : facetKeyOrFacet;
    if (!facet || !facet.seg || typeof facet.seg.prefix !== 'string' || !facet.seg.prefix ||
        typeof facet.seg.digits !== 'number' || facet.seg.digits < 1) {
      throw new Error('[KGContract] buildFacetIdPattern: facet.seg 形状非法，实际=' + JSON.stringify(facet && facet.seg));
    }
    return new RegExp('^' + escapeRegExp(facet.seg.prefix) + '\\d{' + facet.seg.digits + '}$');
  }

  /* ============================================================
   * 三、id ↔ 类型 / 层级 / 父 id 的互相推导
   * ========================================================== */

  function typeOf(id) {
    if (typeof id !== 'string' || !id) {
      throw new Error('[KGContract] typeOf 需要非空字符串 id，实际=' + JSON.stringify(id));
    }
    var taxonomy = getTaxonomy();
    if (id === taxonomy.rootId) {
      return taxonomy.levels[0].type;
    }
    for (var lv = 1; lv < taxonomy.levels.length; lv += 1) {
      if (buildIdPattern(lv).test(id)) {
        return taxonomy.levels[lv].type;
      }
    }
    for (var i = 0; i < taxonomy.facets.length; i += 1) {
      if (buildFacetIdPattern(taxonomy.facets[i]).test(id)) {
        return taxonomy.facets[i].type;
      }
    }
    throw new Error('[KGContract] typeOf: id="' + id + '" 不匹配任何主干层级或横切维度的 id 格式');
  }

  // 只对主干层级链上的 id 有意义；facet 成员没有"层"这个概念，调用会显式抛错，
  // 不悄悄返回一个凑数的值。
  function levelOf(id) {
    if (typeof id !== 'string' || !id) {
      throw new Error('[KGContract] levelOf 需要非空字符串 id，实际=' + JSON.stringify(id));
    }
    var taxonomy = getTaxonomy();
    if (id === taxonomy.rootId) {
      return 0;
    }
    for (var lv = 1; lv < taxonomy.levels.length; lv += 1) {
      if (buildIdPattern(lv).test(id)) {
        return lv;
      }
    }
    throw new Error('[KGContract] levelOf: id="' + id + '" 不属于主干层级链（横切维度成员没有 level，不应调用 levelOf）');
  }

  // 派生父 id：主干层级链上"去掉最后一段"；facet 成员恒挂在根节点下；根节点没有
  // 父节点，调用会显式抛错（调用方应先判断 id === taxonomy.rootId）。
  function parentIdOf(id) {
    var taxonomy = getTaxonomy();
    if (id === taxonomy.rootId) {
      throw new Error('[KGContract] parentIdOf: 根节点 "' + taxonomy.rootId + '" 没有父节点，不应调用 parentIdOf');
    }
    for (var i = 0; i < taxonomy.facets.length; i += 1) {
      if (buildFacetIdPattern(taxonomy.facets[i]).test(id)) {
        return taxonomy.rootId;
      }
    }
    var level = levelOf(id); // 非法 id 在此抛错
    if (level === 1) {
      return taxonomy.rootId;
    }
    var cut = id.lastIndexOf(taxonomy.idSep);
    if (cut < 0) {
      throw new Error('[KGContract] parentIdOf: id="' + id + '" level=' + level + ' 但找不到分隔符 "' + taxonomy.idSep + '"');
    }
    return id.slice(0, cut);
  }

  /* ============================================================
   * 四、关系名枚举
   * ========================================================== */

  function validRelNames() {
    var taxonomy = getTaxonomy();
    return ['contains']
      .concat(taxonomy.facets.map(function (facet) { return facet.rel; }))
      .concat(taxonomy.crossRels);
  }

  /* ============================================================
   * 五、assertTaxonomy —— 校验 window.KGTaxonomy 自身的形状
   * ========================================================== */

  function assertTaxonomy() {
    var taxonomy = window.KGTaxonomy;
    if (!taxonomy || typeof taxonomy !== 'object') {
      throw new Error('[KGContract] window.KGTaxonomy 未加载或不是对象');
    }
    if (!Array.isArray(taxonomy.levels) || taxonomy.levels.length < 1) {
      throw new Error('[KGContract] KGTaxonomy.levels 必须是非空数组');
    }
    if (!Array.isArray(taxonomy.facets)) {
      throw new Error('[KGContract] KGTaxonomy.facets 必须是数组');
    }
    if (typeof taxonomy.idSep !== 'string' || !taxonomy.idSep) {
      throw new Error('[KGContract] KGTaxonomy.idSep 必须是非空字符串');
    }
    if (typeof taxonomy.rootId !== 'string' || !taxonomy.rootId) {
      throw new Error('[KGContract] KGTaxonomy.rootId 必须是非空字符串');
    }
    if (!Array.isArray(taxonomy.crossRels)) {
      throw new Error('[KGContract] KGTaxonomy.crossRels 必须是数组');
    }

    // levels[]：level 从 0 严格连续递增，且与数组下标相等；根层 seg 恒为 null，
    // 非根层 seg 必须是 {prefix,digits}。
    taxonomy.levels.forEach(function (lvl, idx) {
      if (!lvl || typeof lvl !== 'object') {
        throw new Error('[KGContract] levels[' + idx + '] 不是对象');
      }
      if (lvl.level !== idx) {
        throw new Error('[KGContract] levels[' + idx + '].level=' + lvl.level +
          '，应严格等于数组下标 ' + idx + '（level 必须从 0 连续递增，不许跳号或错位）');
      }
      if (typeof lvl.type !== 'string' || !lvl.type) {
        throw new Error('[KGContract] levels[' + idx + '].type 必须是非空字符串');
      }
      if (typeof lvl.label !== 'string' || !lvl.label) {
        throw new Error('[KGContract] levels[' + idx + '].label 必须是非空字符串');
      }
      if (idx === 0) {
        if (lvl.seg !== null) {
          throw new Error('[KGContract] levels[0]（根层）的 seg 必须为 null，实际=' + JSON.stringify(lvl.seg));
        }
      } else {
        if (!lvl.seg || typeof lvl.seg !== 'object') {
          throw new Error('[KGContract] levels[' + idx + '].seg 必须是 {prefix,digits} 对象（非根层不许为 null）');
        }
        if (typeof lvl.seg.prefix !== 'string' || !lvl.seg.prefix) {
          throw new Error('[KGContract] levels[' + idx + '].seg.prefix 必须是非空字符串');
        }
        if (typeof lvl.seg.digits !== 'number' || lvl.seg.digits < 1) {
          throw new Error('[KGContract] levels[' + idx + '].seg.digits 必须是 >=1 的数字');
        }
      }
    });

    // facets[]：key 唯一、形状齐全、rel 与 memberField 必须成对出现（不许一个有
    // 一个没有——那样"横切维度能否派生边关系"这件事就变得不可判定）。
    var facetKeys = {};
    taxonomy.facets.forEach(function (facet, idx) {
      if (!facet || typeof facet !== 'object') {
        throw new Error('[KGContract] facets[' + idx + '] 不是对象');
      }
      if (typeof facet.key !== 'string' || !facet.key) {
        throw new Error('[KGContract] facets[' + idx + '].key 必须是非空字符串');
      }
      if (facetKeys[facet.key]) {
        throw new Error('[KGContract] facets[].key 重复: "' + facet.key + '"');
      }
      facetKeys[facet.key] = true;
      if (typeof facet.type !== 'string' || !facet.type) {
        throw new Error('[KGContract] facets[' + idx + '].type 必须是非空字符串');
      }
      if (typeof facet.label !== 'string' || !facet.label) {
        throw new Error('[KGContract] facets[' + idx + '].label 必须是非空字符串');
      }
      if (!facet.seg || typeof facet.seg !== 'object' ||
          typeof facet.seg.prefix !== 'string' || !facet.seg.prefix ||
          typeof facet.seg.digits !== 'number' || facet.seg.digits < 1) {
        throw new Error('[KGContract] facets[' + idx + '].seg 必须是 {prefix,digits} 对象');
      }
      var hasRel = typeof facet.rel === 'string' && !!facet.rel;
      var hasMemberField = typeof facet.memberField === 'string' && !!facet.memberField;
      if (hasRel !== hasMemberField) {
        throw new Error('[KGContract] facets[' + idx + ']("' + facet.key + '") 的 rel 与 memberField 必须成对出现，实际 rel=' +
          JSON.stringify(facet.rel) + ' memberField=' + JSON.stringify(facet.memberField));
      }
      if (!hasRel) {
        throw new Error('[KGContract] facets[' + idx + ']("' + facet.key + '") 缺少 rel/memberField（横切维度必须能派生出边关系）');
      }
    });

    // 类型枚举全局唯一：levels[].type ∪ facets[].type 不许有任何重名——重名会让
    // typeOf(id) 反查出来的类型产生歧义。
    var typeOwner = {};
    taxonomy.levels.forEach(function (lvl) {
      if (typeOwner[lvl.type]) {
        throw new Error('[KGContract] 类型名 "' + lvl.type + '" 重复：' + typeOwner[lvl.type] + ' 与 levels[' + lvl.level + ']');
      }
      typeOwner[lvl.type] = 'levels[' + lvl.level + ']';
    });
    taxonomy.facets.forEach(function (facet, idx) {
      if (typeOwner[facet.type]) {
        throw new Error('[KGContract] 类型名 "' + facet.type + '" 撞名：已被 ' + typeOwner[facet.type] +
          ' 占用，facets[' + idx + ']("' + facet.key + '") 不能重复使用');
      }
      typeOwner[facet.type] = 'facets[' + idx + ']("' + facet.key + '")';
    });

    // id 段前缀全局唯一：levels[].seg.prefix ∪ facets[].seg.prefix 共享同一命名
    // 空间——重复会让 typeOf(id) 对同一个 id 匹配出两种可能的类型。
    var prefixOwner = {};
    taxonomy.levels.forEach(function (lvl) {
      if (!lvl.seg) return;
      var p = lvl.seg.prefix;
      if (prefixOwner[p]) {
        throw new Error('[KGContract] id 段前缀 "' + p + '" 重复：' + prefixOwner[p] + ' 与 levels[' + lvl.level + ']');
      }
      prefixOwner[p] = 'levels[' + lvl.level + ']';
    });
    taxonomy.facets.forEach(function (facet, idx) {
      var p = facet.seg.prefix;
      if (prefixOwner[p]) {
        throw new Error('[KGContract] id 段前缀 "' + p + '" 重复：' + prefixOwner[p] + ' 与 facets[' + idx + ']("' + facet.key + '")');
      }
      prefixOwner[p] = 'facets[' + idx + ']("' + facet.key + '")';
    });

    // rel 名全局唯一：'contains' 保留字 + facets[].rel + crossRels 三者不许互相重复，
    // 否则 assertEdgeShape 无法判定一条边到底走哪条校验分支。
    var relOwner = { contains: 'contains（保留字，contains 树专用）' };
    taxonomy.facets.forEach(function (facet, idx) {
      if (relOwner[facet.rel]) {
        throw new Error('[KGContract] rel 名 "' + facet.rel + '" 重复：' + relOwner[facet.rel] + ' 与 facets[' + idx + ']("' + facet.key + '")');
      }
      relOwner[facet.rel] = 'facets[' + idx + ']("' + facet.key + '")';
    });
    taxonomy.crossRels.forEach(function (rel, idx) {
      if (typeof rel !== 'string' || !rel) {
        throw new Error('[KGContract] crossRels[' + idx + '] 必须是非空字符串');
      }
      if (relOwner[rel]) {
        throw new Error('[KGContract] rel 名 "' + rel + '" 重复：' + relOwner[rel] + ' 与 crossRels[' + idx + ']');
      }
      relOwner[rel] = 'crossRels[' + idx + ']';
    });

    return true;
  }

  /* ============================================================
   * 六、节点 / 边 / 文档形状校验
   * ========================================================== */

  var NODE_REQUIRED_FIELDS = ['id', 'type', 'name', 'short', 'summary', 'weight'];

  function assertNodeShape(node) {
    if (!node || typeof node !== 'object') {
      throw new Error('[KGContract] assertNodeShape 需要一个节点对象，实际=' + typeof node);
    }
    NODE_REQUIRED_FIELDS.forEach(function (field) {
      var val = node[field];
      if (val === undefined || val === null || val === '') {
        throw new Error('[KGContract] 节点 ' + (node.id || '?') + ' 缺少必填字段 "' + field + '"');
      }
    });

    var taxonomy = getTaxonomy();
    var isLevelType = levelTypes().indexOf(node.type) >= 0;
    var isFacetType = facetTypes().indexOf(node.type) >= 0;
    if (!isLevelType && !isFacetType) {
      throw new Error('[KGContract] 节点 ' + node.id + ' 的 type="' + node.type + '" 不在类型枚举内：' + allTypes().join('|'));
    }

    var actualType = typeOf(node.id); // id 格式非法会在此直接抛错
    if (actualType !== node.type) {
      throw new Error('[KGContract] 节点 ' + node.id + ' 声明 type="' + node.type +
        '"，但 id 格式对应的类型是 "' + actualType + '"');
    }

    if (isLevelType) {
      var expectLevel = levelOf(node.id);
      if (node.level !== expectLevel) {
        throw new Error('[KGContract] 节点 ' + node.id + ' 的 level=' + node.level +
          '，与 id 推导出的层级 ' + expectLevel + ' 不一致');
      }
    } else if (node.level !== null && node.level !== undefined) {
      throw new Error('[KGContract] 横切维度节点 ' + node.id + ' 不应有 level 字段（横切维度没有层级），实际 level=' + node.level);
    }

    if (typeof node.weight !== 'number' || node.weight < 1 || node.weight > 6) {
      throw new Error('[KGContract] 节点 ' + node.id + ' 的 weight=' + node.weight + ' 越界，应 ∈ [1,6]');
    }

    if (node.id === taxonomy.rootId) {
      if (node.parentId) {
        throw new Error('[KGContract] 根节点 ' + node.id + ' 不应有 parentId，实际=' + node.parentId);
      }
    } else {
      var expectParent = parentIdOf(node.id);
      if (node.parentId !== expectParent) {
        throw new Error('[KGContract] 节点 ' + node.id + ' 的 parentId="' + node.parentId + '"，应为 "' + expectParent + '"');
      }
    }

    taxonomy.facets.forEach(function (facet) {
      var arr = node[facet.memberField];
      if (!Array.isArray(arr)) {
        throw new Error('[KGContract] 节点 ' + node.id + ' 缺少数组字段 "' + facet.memberField +
          '"（facet "' + facet.key + '" 要求每个节点都显式声明，哪怕是空数组）');
      }
      var pattern = buildFacetIdPattern(facet);
      arr.forEach(function (memberId) {
        if (!pattern.test(memberId)) {
          throw new Error('[KGContract] 节点 ' + node.id + ' 的 ' + facet.memberField + ' 含非法 id "' + memberId +
            '"，应匹配 ' + pattern);
        }
      });
    });

    if (node.docId !== undefined && node.docId !== null) {
      if (typeof node.docId !== 'string' || !node.docId) {
        throw new Error('[KGContract] 节点 ' + node.id + ' 的 docId 必须是非空字符串，或者干脆不出现该字段');
      }
    }
  }

  function assertEdgeShape(edge) {
    if (!edge || typeof edge !== 'object') {
      throw new Error('[KGContract] assertEdgeShape 需要一个边对象，实际=' + typeof edge);
    }
    if (typeof edge.s !== 'string' || !edge.s) {
      throw new Error('[KGContract] 边缺少非空字符串 s（源端），实际=' + JSON.stringify(edge));
    }
    if (typeof edge.t !== 'string' || !edge.t) {
      throw new Error('[KGContract] 边缺少非空字符串 t（目标端），实际=' + JSON.stringify(edge));
    }
    if (edge.s === edge.t) {
      throw new Error('[KGContract] 边 ' + edge.rel + ' 的 s 与 t 相同（自环）: ' + edge.s);
    }
    var relEnum = validRelNames();
    if (relEnum.indexOf(edge.rel) < 0) {
      throw new Error('[KGContract] 边 rel="' + edge.rel + '" 不在合法关系枚举内：' + relEnum.join('|'));
    }

    if (edge.rel === 'contains') {
      var expectParent = parentIdOf(edge.t);
      if (edge.s !== expectParent) {
        throw new Error('[KGContract] contains 边 ' + edge.s + ' → ' + edge.t +
          ' 与 id 推导出的父子关系不一致，应为 ' + expectParent + ' → ' + edge.t);
      }
      return;
    }

    var taxonomy = getTaxonomy();
    var facetHit = taxonomy.facets.filter(function (f) { return f.rel === edge.rel; })[0];
    if (facetHit) {
      if (!buildFacetIdPattern(facetHit).test(edge.s)) {
        throw new Error('[KGContract] ' + edge.rel + ' 边的 s="' + edge.s + '" 应是 facet "' + facetHit.key + '" 的成员 id');
      }
      var targetType = typeOf(edge.t);
      if (levelTypes().indexOf(targetType) < 0) {
        throw new Error('[KGContract] ' + edge.rel + ' 边的 t="' + edge.t + '"（type=' + targetType +
          '）应挂在主干层级节点上，不能挂在横切维度或根节点上');
      }
      return;
    }

    // crossRels：两端只要求都是能被 typeOf 解析的合法 id，不预设方向与端点类型。
    typeOf(edge.s);
    typeOf(edge.t);
  }

  function assertDocShape(doc) {
    if (!doc || typeof doc !== 'object') {
      throw new Error('[KGContract] assertDocShape 需要一个文档对象，实际=' + typeof doc);
    }
    if (typeof doc.title !== 'string' || !doc.title) {
      throw new Error('[KGContract] 文档缺少非空 title，实际=' + JSON.stringify(doc));
    }
    if (typeof doc.body !== 'string' || !doc.body) {
      throw new Error('[KGContract] 文档 "' + doc.title + '" 缺少非空 body');
    }
  }

  /* ============================================================
   * 七、assertData —— 整份数据集的图级一致性
   * ========================================================== */

  function assertData(data) {
    assertTaxonomy();
    if (!data || typeof data !== 'object') {
      throw new Error('[KGContract] assertData 需要一个数据对象，实际=' + typeof data);
    }
    if (!Array.isArray(data.nodes)) {
      throw new Error('[KGContract] data.nodes 必须是数组');
    }
    if (!Array.isArray(data.edges)) {
      throw new Error('[KGContract] data.edges 必须是数组');
    }
    if (!data.docs || typeof data.docs !== 'object') {
      throw new Error('[KGContract] data.docs 必须是对象');
    }

    var taxonomy = getTaxonomy();

    var byId = {};
    data.nodes.forEach(function (node) {
      if (node && byId[node.id]) {
        throw new Error('[KGContract] 节点 id 重复: ' + node.id);
      }
      if (node) byId[node.id] = node;
    });
    data.nodes.forEach(assertNodeShape);
    data.edges.forEach(assertEdgeShape);

    data.edges.forEach(function (edge) {
      if (!byId[edge.s]) {
        throw new Error('[KGContract] 边 ' + edge.rel + ' 的源端 "' + edge.s + '" 不存在于 data.nodes');
      }
      if (!byId[edge.t]) {
        throw new Error('[KGContract] 边 ' + edge.rel + ' 的目标端 "' + edge.t + '" 不存在于 data.nodes');
      }
    });

    // contains 单父
    var containsIndeg = {};
    var childrenOf = {};
    data.edges.forEach(function (edge) {
      if (edge.rel !== 'contains') return;
      containsIndeg[edge.t] = (containsIndeg[edge.t] || 0) + 1;
      (childrenOf[edge.s] = childrenOf[edge.s] || []).push(edge.t);
    });
    Object.keys(containsIndeg).forEach(function (id) {
      if (containsIndeg[id] > 1) {
        throw new Error('[KGContract] contains 边多父：' + id + ' 入度=' + containsIndeg[id]);
      }
    });

    // 主干层级节点必须全部从根节点经 contains 无环可达（facet 成员没有这条义务：
    // 它们是横切维度，不强制要求真的存在一条 contains 边落地，parentId 字段已经
    // 记录了它们挂在根节点下这件事）。
    var visited = {};
    var stack = [taxonomy.rootId];
    var guard = 0;
    while (stack.length) {
      guard += 1;
      if (guard > data.nodes.length * 4 + 10) {
        throw new Error('[KGContract] contains 疑似成环：遍历次数超限');
      }
      var id = stack.pop();
      if (visited[id]) {
        throw new Error('[KGContract] contains 成环或被多条路径重复到达: ' + id);
      }
      visited[id] = true;
      (childrenOf[id] || []).forEach(function (kid) { stack.push(kid); });
    }
    data.nodes.forEach(function (node) {
      if (levelTypes().indexOf(node.type) < 0) return;
      if (!visited[node.id]) {
        throw new Error('[KGContract] 主干层级节点 ' + node.id + ' 无法从根节点 "' + taxonomy.rootId + '" 经 contains 到达');
      }
    });

    // facet 成员膨胀一致性：节点上的 memberField 与图里实际存在的 facet.rel 边必须
    // 一一对应——既不许"声明了成员关系但边没落地"，也不许"边凭空多出来"。这是对
    // kg-index.js 草稿里 domainId/businessId 两段孪生代码的泛化：不再各写一次，
    // 而是对 taxonomy.facets 循环一次，换几个 facet 都不用加代码。
    taxonomy.facets.forEach(function (facet) {
      var derivedPairs = {};
      data.nodes.forEach(function (node) {
        (node[facet.memberField] || []).forEach(function (memberId) {
          if (!byId[memberId]) {
            throw new Error('[KGContract] 节点 ' + node.id + ' 的 ' + facet.memberField + ' 引用了不存在的 id "' + memberId + '"');
          }
          if (byId[memberId].type !== facet.type) {
            throw new Error('[KGContract] 节点 ' + node.id + ' 的 ' + facet.memberField + ' 引用的 "' + memberId +
              '" 类型是 "' + byId[memberId].type + '"，应为 "' + facet.type + '"');
          }
          derivedPairs[memberId + '\u0000' + node.id] = true;
        });
      });
      var actualPairs = {};
      data.edges.forEach(function (edge) {
        if (edge.rel !== facet.rel) return;
        actualPairs[edge.s + '\u0000' + edge.t] = true;
      });
      Object.keys(derivedPairs).forEach(function (key) {
        if (!actualPairs[key]) {
          throw new Error('[KGContract] facet "' + facet.key + '" 的派生边缺失: ' +
            key.replace('\u0000', ' → ') + '（节点声明了成员关系但边没有落地）');
        }
      });
      Object.keys(actualPairs).forEach(function (key) {
        if (!derivedPairs[key]) {
          throw new Error('[KGContract] facet "' + facet.key + '" 存在多余的 ' + facet.rel + ' 边: ' +
            key.replace('\u0000', ' → ') + '（没有任何节点声明该成员关系）');
        }
      });
    });

    // docId 引用存在性 + docs 自身完整性
    data.nodes.forEach(function (node) {
      if (node.docId && !data.docs[node.docId]) {
        throw new Error('[KGContract] 节点 ' + node.id + ' 的 docId="' + node.docId + '" 在 data.docs 中不存在');
      }
    });
    Object.keys(data.docs).forEach(function (key) {
      assertDocShape(data.docs[key]);
    });

    return true;
  }

  /* ============================================================
   * 八、公开 API
   * ========================================================== */

  window.KGContract = {
    CONTAINS_REL: 'contains',
    buildIdPattern: buildIdPattern,
    buildFacetIdPattern: buildFacetIdPattern,
    typeOf: typeOf,
    levelOf: levelOf,
    parentIdOf: parentIdOf,
    levelTypes: levelTypes,
    facetTypes: facetTypes,
    allTypes: allTypes,
    levelByType: levelByType,
    facetByType: facetByType,
    facetByKey: facetByKey,
    validRelNames: validRelNames,
    assertTaxonomy: assertTaxonomy,
    assertNodeShape: assertNodeShape,
    assertEdgeShape: assertEdgeShape,
    assertDocShape: assertDocShape,
    assertData: assertData
  };

})();
