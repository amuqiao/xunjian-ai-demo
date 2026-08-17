/**
 * kg-data.js —— 湖南公司输油泵机组运维知识图谱 · 唯一数据真值源
 *
 * 数据来源说明：
 *   1. 本文件不是运行时读取 Excel；Excel 只作为离线提取源。
 *   2. `.data/11_1.xlsx` 提供 39 条标准、制度、指引、规程、作业卡、操作票标题。
 *   3. Excel 中“故障库”列为空，故障现象、原因、处置、禁忌等内容为演示用假数据。
 *   4. 页面模板固定使用 10 张任务立牌、7 个分类球、3 个场景牌，因此本文件把
 *      Excel 种子扩展为 10×3×3×3 的静态图谱树，保证展台、图谱、文档页全部可用。
 */
(function (global) {
  'use strict';

  var KG = global.KG = global.KG || {};

  var LEVEL_TYPE = { 1: 'task', 2: 'direction', 3: 'technology', 4: 'content' };
  var LEVEL_WEIGHT = { 1: 5, 2: 4, 3: 3, 4: 2 };

  var GRAPH_TITLE = '湖南公司输油泵机组运维知识图谱';
  var TASK_HUB = '十项运维主题';
  var DOMAIN_HUB = '七类知识分类';
  var BIZ_HUB = '三类应用场景';

  var ROOT_NODES = [
    {
      id: 'root', type: 'root', level: 0,
      name: GRAPH_TITLE, short: '泵组图谱',
      summary: '围绕湖南公司输油泵、给油泵、主输泵等站场关键设备，汇聚标准规范、制度指引、操作规程、维检修作业卡、操作票与故障案例，形成可检索、可下钻、可复盘的运维知识网络。',
      weight: 6, parentId: null,
      domainIds: [], businessIds: [], keywords: ['湖南公司', '输油泵', '维检修', '知识图谱'],
      docId: 'DOC-ROOT'
    },
    {
      id: 'hub-task', type: 'root', level: 0,
      name: TASK_HUB, short: TASK_HUB,
      summary: '以泵机组全生命周期运维为主线，拆解为安装验收、启停切换、盘车润滑、机械密封、周期保养、大修评估、能量隔离、完整性、故障诊断等十类运维主题。',
      weight: 6, parentId: 'root',
      domainIds: [], businessIds: [], keywords: ['运维主题', '泵机组', '作业流程'],
      docId: 'DOC-hub-task'
    },
    {
      id: 'hub-domain', type: 'root', level: 0,
      name: DOMAIN_HUB, short: DOMAIN_HUB,
      summary: '按资料与能力属性对泵机组运维知识做横向分类，覆盖标准制度、安装验收、操作规程、维检修作业、安全隔离、完整性管理与故障知识库七类。',
      weight: 6, parentId: 'root',
      domainIds: [], businessIds: [], keywords: ['知识分类', '标准制度', '故障库'],
      docId: 'DOC-hub-domain'
    },
    {
      id: 'hub-biz', type: 'root', level: 0,
      name: BIZ_HUB, short: BIZ_HUB,
      summary: '将知识条目投影到长郴管道、泵机组设备、站场运维三类应用场景，便于一线班组按实际对象快速定位可执行依据。',
      weight: 6, parentId: 'root',
      domainIds: [], businessIds: [], keywords: ['长郴管道', '泵机组', '站场运维'],
      docId: 'DOC-hub-biz'
    }
  ];

  var DOMAIN_RAW = [
    ['D1', '标准制度体系', '标准制度', '国家标准、行业标准、企业标准和集团制度共同构成泵机组运维的依据底座，用于回答“该按什么标准执行”。', ['国家标准', '行业标准', '企业标准']],
    ['D2', '安装验收规范', '安装验收', '聚焦输油泵组安装、站内工艺管道施工、机械设备验收与交接资料，支撑新建、改造和大修后的质量确认。', ['安装', '验收', '交接']],
    ['D3', '操作维护规程', '操作规程', '覆盖启机、停机、切换、盘车、给油泵和主输泵操作等标准步骤，用于把制度要求转化为班组可执行动作。', ['启停', '切换', '盘车']],
    ['D4', '维检修作业卡', '维检修卡', '以 K248、K249、K250、K251、K252 等作业卡为核心，固化机械密封、保养、大修、节流孔板检查和润滑油更换要求。', ['机械密封', '4000小时', '大修']],
    ['D5', '作业安全与隔离', '安全隔离', '面向能量隔离、锁定挂牌、作业计划、变更管理和爆炸性环境风险控制，保障维检修作业受控开展。', ['能量隔离', '锁定挂牌', '变更管理']],
    ['D6', '完整性与泄漏管理', '完整性', '连接站场完整性、设备设施泄漏管理、特种设备规范与风险分级检查，支撑设备设施长期可靠运行。', ['完整性', '泄漏管理', '特种设备']],
    ['D7', '故障诊断知识库', '故障库', '基于 Excel 空白故障库列构造的演示型故障案例库，沉淀泵组振动、温升、密封泄漏、启停失败等典型处置经验。', ['振动', '温升', '密封泄漏']]
  ];

  var BIZ_RAW = [
    ['B1', '长郴管道', '长郴管道', '面向长郴管道沿线站场的输油工艺、给油泵、主输泵和管道运行要求，强调规程与现场对象的绑定。', ['长郴', '输油管道', '站场']],
    ['B2', '泵机组设备', '泵机组', '以离心泵、给油泵、主输泵、机械密封、润滑与泄漏报警系统为对象，聚焦设备本体维护与状态诊断。', ['离心泵', '主输泵', '机械密封']],
    ['B3', '站场运维班组', '运维班组', '面向站场运行、维修、电气仪表与安全管理协同，关注作业票卡、交接确认、风险提示和复盘闭环。', ['班组', '票卡', '复盘']]
  ];

  var SOURCE_TITLES = [
    ['国家标准', 'GB 3836.13-2013 爆炸性环境 第13部分：设备的修理、检修、修复和改造'],
    ['国家标准', 'GB 7231-2003 工业管道的基本识别色、识别符号和安全标识'],
    ['国家标准', 'GB 50231-2009 机械设备安装工程施工及验收通用规范'],
    ['国家标准', 'GB 50264-2013 工业设备及管道绝热工程设计规范'],
    ['国家标准', 'GB 50517-2010 石化金属管道工程施工质量验收规范'],
    ['国家标准', 'GB 50253-2014 输油管道工程设计规范'],
    ['国家标准', 'GB 50235-2010 工业金属管道工程施工规范'],
    ['国家标准', 'GB 50316-2000 工业金属管道设计规范'],
    ['国家标准', 'GB 50540-2009 石油天然气站内工艺管道工程施工规范'],
    ['国家标准', 'GB/T 3836.1-2021 爆炸性环境 第1部分：设备 通用要求'],
    ['国家标准', 'GB/T 9125.1-2020 钢制管法兰连接用紧固件 第1部分：PN系列'],
    ['国家标准', 'GB/T 35068-2018 油气管道运行规范'],
    ['国家标准', 'GB/T 41474-2022 设施管理 运作与维护指南'],
    ['行业标准', 'SY/T 0403-2025 输油泵组安装技术规范'],
    ['行业标准', 'SY/T 6695-2024 成品油管道运行规范'],
    ['企业标准', 'Q/GGW 03001.3-2024 油气储运资产完整性管理规范 第3部分：油气站场设备设施'],
    ['企业标准', 'Q/GGW 03001.7-2022 油气储运资产完整性管理规范 第7部分：特种设备'],
    ['集团制度', '国家管网集团生产运行管理规定'],
    ['集团制度', '国家管网集团生产运维管理办法'],
    ['集团制度', '国家管网集团站场完整性管理规定'],
    ['集团制度', '国家管网集团站内管道管理暂行细则'],
    ['集团制度', '国家管网集团站场设备设施泄漏管理暂行细则'],
    ['湖南指引', '湖南公司站场维检修工作指引（试行）'],
    ['湖南指引', '湖南公司作业计划管理工作指引（试行）'],
    ['湖南指引', '湖南公司能量隔离和锁定管理工作指引（试行）'],
    ['湖南指引', '湖南公司工艺和设备设施变更管理工作指引（试行）'],
    ['作业指导书', '湖南公司输油气生产设备计划性维检修大表'],
    ['操作规程', 'HN-SC-JX-GC-039-2025 国家管网集团湖南公司离心泵盘车操作规程'],
    ['操作规程', 'HN-SC-JX-GC-048-2025 国家管网集团湖南公司长郴管道给油泵操作规程'],
    ['操作规程', 'HN-SC-JX-GC-049-2025 国家管网集团湖南公司长郴管道主输泵操作规程'],
    ['维检修作业卡', 'K248 泵机组机械密封更换'],
    ['维检修作业卡', 'K249 泵机组4000小时维护保养'],
    ['维检修作业卡', 'K250 泵机组50000小时（10年）大修'],
    ['维检修作业卡', 'K251 泵机组泄漏报警系统节流孔板检查'],
    ['维检修作业卡', 'K252 泵机组润滑油更换'],
    ['操作票', 'P202 泵机组就地启机操作'],
    ['操作票', 'P203 泵机组就地停机操作'],
    ['操作票', 'P204 泵机组就地切换操作'],
    ['操作票', 'P205 泵机组盘车操作']
  ];

  var FAULT_TITLES = [
    ['故障库', 'F001 主输泵振动升高与联轴器对中偏差处置'],
    ['故障库', 'F002 机械密封轻微泄漏趋势识别与隔离确认'],
    ['故障库', 'F003 润滑油温升异常与冷却回路检查'],
    ['故障库', 'F004 就地启机失败与联锁条件核对'],
    ['故障库', 'F005 盘车阻滞与转子卡涩风险排查'],
    ['故障库', 'F006 泄漏报警误报与节流孔板堵塞复核'],
    ['故障库', 'F007 给油泵出口压力波动与入口过滤器检查'],
    ['故障库', 'F008 主输泵切换后流量波动复盘']
  ];

  var CONTENT_POOL = SOURCE_TITLES.concat(FAULT_TITLES);

  var TASK_CONFIG = [
    {
      name: '标准制度适用性识别', short: '标准适用识别',
      domains: ['D1', 'D5'], businesses: ['B1', 'B2'], keywords: ['标准', '制度', '适用性'],
      directions: ['标准清单归口', '条款适用判定', '执行证据留存'],
      technologies: ['文号识别与版本校核', '制度条款映射', '现场记录闭环']
    },
    {
      name: '泵组安装验收与交接', short: '安装验收交接',
      domains: ['D2', 'D1'], businesses: ['B1', 'B2'], keywords: ['安装', '验收', '交接'],
      directions: ['安装条件确认', '施工质量验收', '资料移交核对'],
      technologies: ['基础找平与对中', '管道法兰连接', '试运与交接清单']
    },
    {
      name: '启停切换与现场操作', short: '启停切换操作',
      domains: ['D3', 'D5'], businesses: ['B1', 'B3'], keywords: ['启机', '停机', '切换'],
      directions: ['启机条件核对', '停机步骤控制', '机组切换监护'],
      technologies: ['P202启机票执行', 'P203停机票执行', 'P204切换票执行']
    },
    {
      name: '盘车润滑与例行保养', short: '盘车润滑保养',
      domains: ['D3', 'D4'], businesses: ['B2', 'B3'], keywords: ['盘车', '润滑', '保养'],
      directions: ['盘车作业管理', '润滑油品质控制', '例行点检保养'],
      technologies: ['P205盘车票执行', 'K252润滑油更换', '4000小时保养']
    },
    {
      name: '机械密封与泄漏处置', short: '密封泄漏处置',
      domains: ['D4', 'D6'], businesses: ['B2', 'B3'], keywords: ['机械密封', '泄漏', '报警'],
      directions: ['密封更换作业', '泄漏报警复核', '密封趋势分析'],
      technologies: ['K248密封更换', 'K251节流孔板检查', '泄漏风险分级']
    },
    {
      name: '周期维护与状态复核', short: '周期维护复核',
      domains: ['D4', 'D6'], businesses: ['B2'], keywords: ['周期维护', '状态复核', '维检修大表'],
      directions: ['计划性维检修', '维护质量确认', '状态数据回写'],
      technologies: ['维检修大表编排', '4000小时作业验收', '状态记录归档']
    },
    {
      name: '十年大修与寿命评估', short: '十年大修评估',
      domains: ['D4', 'D2'], businesses: ['B2', 'B1'], keywords: ['大修', '寿命', '验收'],
      directions: ['大修范围界定', '拆检质量控制', '寿命延续评估'],
      technologies: ['K250大修包管理', '关键部件复测', '试运性能比对']
    },
    {
      name: '能量隔离与作业许可', short: '能量隔离许可',
      domains: ['D5', 'D1'], businesses: ['B3', 'B2'], keywords: ['能量隔离', '作业许可', '锁定'],
      directions: ['隔离边界识别', '锁定挂牌执行', '复役条件确认'],
      technologies: ['隔离清单生成', '双人确认闭环', '复役风险复核']
    },
    {
      name: '完整性与变更管控', short: '完整性变更',
      domains: ['D6', 'D1'], businesses: ['B1', 'B3'], keywords: ['完整性', '变更', '站场'],
      directions: ['站场完整性评价', '工艺设备变更', '泄漏管理闭环'],
      technologies: ['设备设施台账校核', '变更影响分析', '泄漏隐患整改']
    },
    {
      name: '故障诊断与应急恢复', short: '故障应急恢复',
      domains: ['D7', 'D5'], businesses: ['B2', 'B3'], keywords: ['故障库', '应急', '复盘'],
      directions: ['故障现象识别', '原因定位分析', '应急恢复复盘'],
      technologies: ['振动温升诊断', '启停失败排查', '案例复盘沉淀']
    }
  ];

  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function seedAt(index) {
    return CONTENT_POOL[index % CONTENT_POOL.length];
  }

  function sourceLabel(seed) {
    return seed[0] + '《' + seed[1] + '》';
  }

  function contentTitle(seed, directionName, techName, cIndex) {
    var context = directionName + ' / ' + techName;
    if (cIndex === 0) return seed[1] + '适用摘编：' + context;
    if (cIndex === 1) return context + '执行核查表（演示）';
    return context + '风险复盘卡（演示）';
  }

  function makeSummary(name, source, theme, levelName) {
    return name + '围绕' + theme + '展开，结合' + source + '形成可检索的' + levelName + '知识条目，支撑站场运维人员在作业前查依据、作业中控风险、作业后留证据。';
  }

  function makeParagraphs(node, source, taskName) {
    var title = source ? source[1] : node.name;
    var sourceType = source ? source[0] : '图谱资料';
    return [
      node.name + '是“' + taskName + '”主题下的知识单元，主要依据' + sourceType + '《' + title + '》进行抽取，并结合泵机组现场运维场景补充演示性说明。',
      '作业使用时，应先核对适用对象、设备状态、隔离边界、风险提示和记录要求，再进入现场步骤。涉及启停、切换、密封更换、润滑油更换、大修和泄漏报警复核的条目，需要同时关联操作票、作业卡和制度指引。',
      '本演示数据用于模板落地验证：Excel 提供了资料标题，正文、故障现象、原因分析、处置建议和复盘要点为合理假数据。正式上线前应由业务人员补充原文条款、适用范围、审批责任和版本有效性。'
    ];
  }

  function buildTaskTree() {
    return TASK_CONFIG.map(function (task, tIndex) {
      var tid = 'T' + pad2(tIndex + 1);
      var taskNode = {
        id: tid,
        name: task.name,
        short: task.short,
        summary: makeSummary(task.name, 'Excel 提取的标准制度、规程票卡与故障种子', '泵机组运维', '运维主题'),
        weight: 5,
        keywords: task.keywords,
        domainIds: task.domains,
        businessIds: task.businesses,
        docId: 'DOC-' + tid,
        children: []
      };

      task.directions.forEach(function (directionName, dIndex) {
        var fid = tid + '-F' + pad2(dIndex + 1);
        var dirNode = {
          id: fid,
          name: directionName,
          short: directionName,
          summary: makeSummary(directionName, sourceLabel(seedAt(tIndex * 9 + dIndex)), task.name, '作业方向'),
          weight: 4,
          keywords: task.keywords.concat([directionName]),
          domainIds: task.domains,
          businessIds: task.businesses,
          docId: 'DOC-' + fid,
          children: []
        };

        task.technologies.forEach(function (techName, kIndex) {
          var kid = fid + '-K' + pad2(kIndex + 1);
          var seed = seedAt(tIndex * 9 + dIndex * 3 + kIndex);
          var techNode = {
            id: kid,
            name: techName,
            short: techName,
            summary: makeSummary(techName, sourceLabel(seed), directionName, '作业能力'),
            weight: 3,
            keywords: task.keywords.concat([techName, seed[0]]),
            domainIds: task.domains,
            businessIds: task.businesses,
            docId: 'DOC-' + kid,
            children: []
          };

          for (var cIndex = 0; cIndex < 3; cIndex++) {
            var cid = kid + '-C' + pad2(cIndex + 1);
            var cSeed = seedAt(tIndex * 27 + dIndex * 9 + kIndex * 3 + cIndex);
            var contentName = contentTitle(cSeed, directionName, techName, cIndex);
            techNode.children.push({
              id: cid,
              name: contentName,
              short: contentName.length > 14 ? contentName.slice(0, 14) : contentName,
              summary: makeSummary(contentName, sourceLabel(cSeed), techName, '资料条目'),
              weight: 2,
              keywords: task.keywords.concat([techName, cSeed[0], cSeed[1]]),
              domainIds: task.domains,
              businessIds: task.businesses,
              docId: 'DOC-' + cid,
              source: cSeed
            });
          }

          dirNode.children.push(techNode);
        });

        taskNode.children.push(dirNode);
      });

      return taskNode;
    });
  }

  var TASK_TREE = buildTaskTree();

  var nodes = [];
  var edges = [];
  var docs = {};
  var sourceByNodeId = {};
  var taskNameById = {};

  function addDocForNode(node) {
    var docId = node.docId || ('DOC-' + node.id);
    var source = sourceByNodeId[node.id] || null;
    var taskName = node.taskId && taskNameById[node.taskId] ? taskNameById[node.taskId] : node.name;
    docs[docId] = {
      id: docId,
      title: node.name + '说明',
      tags: [node.type, (source && source[0]) || '图谱资料'].concat(node.keywords || []).slice(0, 5),
      paragraphs: makeParagraphs(node, source, taskName),
      body: makeParagraphs(node, source, taskName).join('\n\n'),
      sourceCount: source ? 1 : 0
    };
  }

  ROOT_NODES.forEach(function (node) {
    nodes.push(node);
    addDocForNode(node);
  });

  DOMAIN_RAW.forEach(function (row) {
    var node = {
      id: row[0], type: 'domain', level: 1,
      name: row[1], short: row[2], summary: row[3],
      weight: 4, parentId: 'hub-domain', taskId: null,
      domainIds: [], businessIds: [], keywords: row[4], docId: 'DOC-' + row[0]
    };
    nodes.push(node);
    addDocForNode(node);
  });

  BIZ_RAW.forEach(function (row) {
    var node = {
      id: row[0], type: 'business', level: 1,
      name: row[1], short: row[2], summary: row[3],
      weight: 4, parentId: 'hub-biz', taskId: null,
      domainIds: [], businessIds: [], keywords: row[4], docId: 'DOC-' + row[0]
    };
    nodes.push(node);
    addDocForNode(node);
  });

  function flatten(list, parentId, level) {
    list.forEach(function (raw) {
      var node = {
        id: raw.id,
        type: LEVEL_TYPE[level],
        level: level,
        name: raw.name,
        short: raw.short || raw.name,
        summary: raw.summary,
        weight: typeof raw.weight === 'number' ? raw.weight : LEVEL_WEIGHT[level],
        parentId: parentId,
        taskId: raw.id.slice(0, 3),
        domainIds: raw.domainIds || [],
        businessIds: raw.businessIds || [],
        keywords: raw.keywords || [],
        docId: raw.docId || ('DOC-' + raw.id)
      };
      if (raw.source) sourceByNodeId[node.id] = raw.source;
      if (node.type === 'task') taskNameById[node.id] = node.name;
      nodes.push(node);
      addDocForNode(node);
      if (raw.children && raw.children.length) flatten(raw.children, raw.id, level + 1);
    });
  }
  flatten(TASK_TREE, 'hub-task', 1);

  nodes.forEach(function (node) {
    if (node.parentId) edges.push({ s: node.parentId, t: node.id, rel: 'contains' });
  });

  nodes.forEach(function (node) {
    node.domainIds.forEach(function (did) { edges.push({ s: did, t: node.id, rel: 'domainOf' }); });
    node.businessIds.forEach(function (bid) { edges.push({ s: bid, t: node.id, rel: 'bizOf' }); });
  });

  TASK_CONFIG.forEach(function (_task, i) {
    var tid = 'T' + pad2(i + 1);
    edges.push({ s: tid + '-F01-K01', t: tid + '-F02-K01', rel: 'supports' });
    edges.push({ s: tid + '-F02-K02', t: tid + '-F03-K02', rel: 'supports' });
    if (i < TASK_CONFIG.length - 1) {
      edges.push({ s: tid, t: 'T' + pad2(i + 2), rel: 'relatesTo' });
    }
  });
  edges.push({ s: 'T03-F01-K01', t: 'T08-F02-K02', rel: 'supports' });
  edges.push({ s: 'T05-F02-K02', t: 'T10-F03-K03', rel: 'relatesTo' });

  KG.data = {
    nodes: nodes,
    edges: edges,
    docs: docs,
    meta: {
      tasks: ['T01', 'T02', 'T03', 'T04', 'T05', 'T06', 'T07', 'T08', 'T09', 'T10'],
      domains: ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7'],
      businesses: ['B1', 'B2', 'B3'],
      hubs: { task: 'hub-task', domain: 'hub-domain', business: 'hub-biz' },
      rootId: 'root',
      typeColorVar: {
        task: '--n-task',
        direction: '--n-dir',
        technology: '--n-tech',
        content: '--n-content',
        document: '--n-doc',
        business: '--n-biz',
        domain: '--n-domain',
        root: '--n-root'
      },
      typeLabel: {
        task: '运维主题',
        direction: '作业方向',
        technology: '作业能力',
        content: '资料条目',
        document: '说明卡',
        business: '应用场景',
        domain: '知识分类',
        root: '图谱中心'
      }
    }
  };

})(window);
