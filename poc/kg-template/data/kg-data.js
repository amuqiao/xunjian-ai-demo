/**
 * kg-data.js —— 知识图谱模板 · 唯一数据真值源
 * ═══════════════════════════════════════════════════════════════════
 * 接入自己的业务数据时，**只需要改这一个文件**。
 * 三个视图（3D 展台 / 关系图谱 / 主题树）全部由 kg-derive.js 从这里投影出来。
 *
 * 约定（破坏任意一条，kg-derive 的 validate() 会报错）：
 *   1. 经典脚本 IIFE，零 import / export / fetch。双击 index.html 要能直接跑。
 *   2. 只写 window.KG.source，不写任何派生结果——派生是 kg-derive.js 的事。
 *   3. id 全局唯一。需要被 featured / relations 引用的节点必须显式写 id；
 *      其余节点的 id 由派生层按路径自动生成（<父id>__<序号>），不用手写。
 *   4. children 想套几层就套几层，treeLevels 会循环取值，层数不写死。
 *
 * 关于"文档量"的口径（这是三份原始设计稿彼此对不上的根因，在此统一）：
 *   · docTotal —— 业务侧知识库的**真实库存量**。展台大数字用它。可缺省。
 *   · 样本数   —— children 里实际建模的叶子数，由派生层数出来。树视图用它。
 *   两者语义不同，不是同一个数字的两个版本。缺省 docTotal 时，派生层令
 *   docTotal = 样本数，此时两者合一，接入完整业务数据的场景天然自洽。
 * ═══════════════════════════════════════════════════════════════════
 */
(function (global) {
  'use strict';

  var KG = global.KG = global.KG || {};

  KG.source = {

    /* ══ 一、全局元信息 ══════════════════════════════════════════ */
    meta: {
      title: '知识中枢',
      hub: {
        id: 'hub',
        name: '知识中枢',
        en: 'KNOWLEDGE HUB',
        sub: 'RETRIEVAL-AUGMENTED KNOWLEDGE BASE',
        desc: '统一检索入口，聚合全部知识库类目与实体标签，对外提供语义检索与问答能力。'
      },
      /* 展台底部指标条。value 为 null 表示"由派生层算"，见 kg-derive.js。
         写死的值是业务侧口径，派生层不会覆盖。 */
      metrics: [
        { key: 'categories', label: '知识库类目', value: null,   unit: '类' },
        { key: 'docTotal',   label: '文档总量',   value: null,   unit: '篇' },
        { key: 'vectors',    label: '向量索引',   value: '1.24', unit: 'M'  },
        { key: 'recall',     label: '平均召回',   value: '94.2', unit: '%'  }
      ]
    },

    /* ══ 二、节点类型注册表 ══════════════════════════════════════
       color 是该类型在**树视图**里的层级色（树按深度着色，与类目无关）。
       展台与图谱按 category.color 着色，不走这里。 */
    types: {
      hub:      { label: '知识中枢',   color: '#8FB4FF' },
      category: { label: '知识库类目', color: '#FFC661' },
      topic:    { label: '分类',       color: '#FF9A66' },
      subtopic: { label: '子类',       color: '#4FD6A9' },
      doc:      { label: '文档',       color: '#5B9EFF' },
      item:     { label: '条目',       color: '#A98CFF' },
      entity:   { label: '实体标签',   color: '#22D3EE' }
    },

    /* 树的深度 → 类型。数据比这更深时，从最后一项开始循环取值。 */
    treeLevels: ['category', 'topic', 'subtopic', 'doc', 'item'],

    /* 关系类型注册表：横向关系的语义与图谱里的视觉权重 */
    relTypes: {
      contains: { label: '收录', major: true  },   // 由 children 自动派生，不用手写
      tagged:   { label: '涉及', major: false },
      cites:    { label: '引用', major: false },
      derives:  { label: '衍生', major: false },
      refers:   { label: '参考', major: false }
    },

    /* ══ 三、知识库类目（含完整层级树） ══════════════════════════
       featured：进入关系图谱的代表文档。图谱不收全部叶子——
       78 个叶子全丢进力导向会糊成一团，代表文档才是可读的密度。 */
    categories: [
      {
        id: 'c_doc', name: '产品文档', en: 'PRODUCT DOCS', code: 'KB-DOC',
        color: '#4C7DFF', icon: 'doc', note: '今日更新', docTotal: 1248,
        desc: '产品功能说明、接口契约、部署配置与权限模型，面向实施与集成场景的一手资料。',
        featured: ['d_api_auth', 'd_deploy_pre', 'd_perm_role'],
        children: [
          { name: '接口与集成', children: [
            { name: 'REST 接口规范', children: [
              { id: 'd_api_auth', name: '资源与鉴权约定' },
              { name: '错误码对照表' },
              { name: '分页与限流说明' }
            ]},
            { name: '事件与回调', children: [
              { name: 'Webhook 事件目录' },
              { name: '重试与幂等策略' }
            ]},
            { name: 'SDK 接入', children: [
              { name: 'Java 快速开始' },
              { name: 'Python 快速开始' }
            ]}
          ]},
          { name: '部署与配置', children: [
            { name: '环境准备', children: [
              { id: 'd_deploy_pre', name: '前置条件清单' },
              { name: '资源规格建议' }
            ]},
            { name: '安装流程', children: [
              { name: '单机部署手册' },
              { name: '高可用部署手册' },
              { name: '离线包安装说明' }
            ]}
          ]},
          { name: '权限与账号', children: [
            { name: '权限模型', children: [
              { id: 'd_perm_role', name: '角色与策略定义' },
              { name: '组织架构映射' }
            ]},
            { name: '单点登录', children: [
              { name: 'OIDC 对接指引' },
              { name: 'LDAP 同步配置' }
            ]}
          ]}
        ]
      },

      {
        id: 'c_rsh', name: '行业研报', en: 'INDUSTRY RESEARCH', code: 'KB-RSH',
        color: '#6B6BFF', icon: 'chart', note: '3 小时前', docTotal: 862,
        desc: '第三方机构研究成果、市场规模测算与竞争格局分析，用于立项论证与对外材料引用。',
        featured: ['d_mkt_model', 'd_mkt_mfg', 'd_vendor'],
        children: [
          { name: '市场规模', children: [
            { name: '总量测算', children: [
              { id: 'd_mkt_model', name: '2026 规模测算模型' },
              { name: '口径与假设说明' }
            ]},
            { name: '分行业拆解', children: [
              { name: '金融行业细分' },
              { id: 'd_mkt_mfg', name: '制造行业细分' },
              { name: '能源行业细分' }
            ]}
          ]},
          { name: '竞争格局', children: [
            { name: '厂商图谱', children: [
              { id: 'd_vendor', name: '年度厂商综述' },
              { name: '能力矩阵评分' }
            ]},
            { name: '价格带分析', children: [
              { name: '公开中标价汇总' }
            ]}
          ]},
          { name: '技术趋势', children: [
            { name: '演进路线', children: [
              { name: '检索技术演进综述' },
              { name: '多模态落地观察' }
            ]}
          ]}
        ]
      },

      {
        id: 'c_cas', name: '客户案例', en: 'CUSTOMER CASES', code: 'KB-CAS',
        color: '#8B5CFF', icon: 'people', note: '昨日更新', docTotal: 534,
        desc: '已交付项目的实施背景、方案设计与量化收益，售前引用与复盘复用的核心素材。',
        featured: ['d_case_bank', 'd_case_auto', 'd_case_ins'],
        children: [
          { name: '金融行业', children: [
            { name: '银行', children: [
              { id: 'd_case_bank', name: '某股份行知识中台' },
              { name: '某城商行智能客服' }
            ]},
            { name: '保险', children: [
              { id: 'd_case_ins', name: '某险企理赔问答' },
              { name: '某险企代理人助手' }
            ]}
          ]},
          { name: '制造行业', children: [
            { name: '整车', children: [
              { id: 'd_case_auto', name: '某车企售后知识库' },
              { name: '某车企工艺检索' }
            ]},
            { name: '装备', children: [
              { name: '某装备厂图纸检索' }
            ]}
          ]},
          { name: '能源行业', children: [
            { name: '油气', children: [
              { name: '某管网运维知识库' },
              { name: '某炼化标准检索' }
            ]}
          ]}
        ]
      },

      {
        id: 'c_reg', name: '法规合规', en: 'COMPLIANCE', code: 'KB-REG',
        color: '#A855F7', icon: 'shield', note: '今日更新', docTotal: 1076,
        desc: '数据安全、隐私保护与行业监管的法规条文及内部解读，交付前必查的合规依据。',
        featured: ['d_dsl', 'd_pipl', 'd_fin_grade'],
        children: [
          { name: '数据安全', children: [
            { name: '法律条文', children: [
              { id: 'd_dsl', name: '数据安全法要点' },
              { id: 'd_pipl', name: '个人信息保护法要点' }
            ]},
            { name: '实施细则', children: [
              { name: '数据分类分级指引' },
              { name: '出境评估办法摘要' }
            ]}
          ]},
          { name: '等级保护', children: [
            { name: '等保三级', children: [
              { name: '技术要求条款' },
              { name: '管理要求条款' },
              { name: '测评常见问题' }
            ]}
          ]},
          { name: '行业监管', children: [
            { name: '金融监管', children: [
              { id: 'd_fin_grade', name: '金融数据分级指引' },
              { name: '外包风险管理要求' }
            ]}
          ]}
        ]
      },

      {
        id: 'c_wpr', name: '技术白皮书', en: 'WHITEPAPERS', code: 'KB-WPR',
        color: '#B44FE8', icon: 'stack', note: '本周更新', docTotal: 318,
        desc: '架构设计、算法原理与技术选型论证，对外可发布的深度技术材料。',
        featured: ['d_rag', 'd_vec_sel', 'd_multimodal'],
        children: [
          { name: '系统架构', children: [
            { name: '整体架构', children: [
              { id: 'd_rag', name: '检索增强架构白皮书' },
              { name: '多租户隔离设计' }
            ]},
            { name: '存储层', children: [
              { id: 'd_vec_sel', name: '向量索引选型论证' },
              { name: '冷热分层方案' }
            ]}
          ]},
          { name: '算法能力', children: [
            { name: '检索召回', children: [
              { name: '混合检索策略' },
              { name: '重排序模型说明' }
            ]},
            { name: '文档解析', children: [
              { id: 'd_multimodal', name: '多模态解析技术报告' },
              { name: '表格还原方案' }
            ]}
          ]}
        ]
      },

      {
        id: 'c_sls', name: '售前话术', en: 'SALES PLAYBOOK', code: 'KB-SLS',
        color: '#3AA0FF', icon: 'chat', note: '今日更新', docTotal: 645,
        desc: '标准应答、异议处理与竞品对比要点，面向售前与渠道的对客表达口径。',
        featured: ['d_privatize', 'd_roi', 'd_cap_matrix'],
        children: [
          { name: '标准应答', children: [
            { name: '能力边界', children: [
              { name: '可做与不可做清单' },
              { name: '效果承诺口径' }
            ]},
            { name: '交付方式', children: [
              { id: 'd_privatize', name: '私有化部署说明' },
              { name: '实施周期口径' }
            ]}
          ]},
          { name: '异议处理', children: [
            { name: '常见质疑', children: [
              { name: '幻觉问题应答' },
              { name: '数据安全应答' },
              { id: 'd_roi', name: '投入产出应答' }
            ]}
          ]},
          { name: '竞品对比', children: [
            { name: '对比要点', children: [
              { id: 'd_cap_matrix', name: '能力维度对照表' },
              { name: '差异化话术' }
            ]}
          ]}
        ]
      },

      {
        id: 'c_ops', name: '运维知识', en: 'OPS KNOWLEDGE', code: 'KB-OPS',
        color: '#22D3EE', icon: 'node', note: '12 分钟前', docTotal: 927,
        desc: '部署运行、故障处置与巡检规范，保障系统持续可用的操作性资料。',
        featured: ['d_inspect', 'd_fault', 'd_change'],
        children: [
          { name: '日常运行', children: [
            { name: '巡检', children: [
              { id: 'd_inspect', name: '日常巡检规范' },
              { name: '巡检记录模板' }
            ]},
            { name: '监控告警', children: [
              { name: '指标阈值基线' },
              { name: '告警分级定义' }
            ]}
          ]},
          { name: '故障处置', children: [
            { name: '应急预案', children: [
              { id: 'd_fault', name: '故障分级处置预案' },
              { name: '服务降级策略' }
            ]},
            { name: '典型案例', children: [
              { name: '检索超时排查记录' },
              { name: '索引损坏恢复记录' }
            ]}
          ]},
          { name: '变更管理', children: [
            { name: '发布流程', children: [
              { id: 'd_change', name: '生产变更审批流' },
              { name: '回滚操作手册' }
            ]}
          ]}
        ]
      },

      {
        id: 'c_mtg', name: '会议纪要', en: 'MEETING NOTES', code: 'KB-MTG',
        color: '#5AC8FA', icon: 'cal', note: '实时接入', docTotal: 2130,
        desc: '内外部会议记录、决议事项与待办跟踪，决策过程的可追溯留痕。',
        featured: ['d_review', 'd_adr', 'd_align'],
        children: [
          { name: '内部会议', children: [
            { name: '产品评审', children: [
              { id: 'd_review', name: '季度产品评审纪要' },
              { name: '需求优先级排期' }
            ]},
            { name: '技术决策', children: [
              { id: 'd_adr', name: '架构决策记录' },
              { name: '技术债处理共识' }
            ]}
          ]},
          { name: '客户会议', children: [
            { name: '需求对齐', children: [
              { id: 'd_align', name: '客户需求对齐会' },
              { name: '验收标准确认' }
            ]},
            { name: '项目例会', children: [
              { name: '周例会问题跟踪' }
            ]}
          ]}
        ]
      }
    ],

    /* ══ 四、实体标签 ══════════════════════════════════════════
       图谱独有的横向维度：它们不属于任何一棵树，而是把不同类目
       的文档串起来的那条线。树视图没有这一层，切视图时按
       "被该标签标记文档最多的类目"降级，见 kg-derive.resolveView()。 */
    entities: [
      { id: 'e_priv',  label: '私有化部署', desc: '客户在自有机房内完成全栈部署，数据不出域。' },
      { id: 'e_mask',  label: '数据脱敏',   desc: '对敏感字段做不可逆变换，兼顾可用性与合规要求。' },
      { id: 'e_vec',   label: '向量检索',   desc: '基于嵌入表示的相似度召回，支撑语义搜索与 RAG。' },
      { id: 'e_fin',   label: '金融行业',   desc: '银行、保险、证券三类客户的共性需求与监管约束。' },
      { id: 'e_lvl3',  label: '等保三级',   desc: '网络安全等级保护第三级，涉及审计、加密与容灾要求。' },
      { id: 'e_sla',   label: 'SLA 承诺',   desc: '可用性、响应时长与故障恢复时间的合同化指标。' },
      { id: 'e_rag',   label: 'RAG 架构',   desc: '检索增强生成，将知识库召回结果注入模型上下文。' },
      { id: 'e_perm',  label: '权限隔离',   desc: '按组织架构与角色控制知识可见范围。' },
      { id: 'e_cost',  label: '降本增效',   desc: '客户最常提出的立项动因，需要可量化的测算口径。' },
      { id: 'e_mfg',   label: '制造行业',   desc: '离散与流程制造两类场景的知识沉淀特点。' },
      { id: 'e_multi', label: '多模态',     desc: '图纸、表格、音视频等非纯文本资料的解析与索引。' },
      { id: 'e_audit', label: '审计留痕',   desc: '全链路操作日志，满足事后追溯与合规审查。' }
    ],

    /* ══ 五、横向关系 ══════════════════════════════════════════
       [源id, 目标id, 关系类型]。关系类型取自 relTypes。
       树的父子关系（contains）由 children 自动派生，**不要写在这里**。 */
    relations: [
      /* 类目 → 实体：这个知识库涉及哪些主题 */
      ['c_doc', 'e_priv',  'tagged'], ['c_doc', 'e_perm',  'tagged'], ['c_doc', 'e_vec',   'tagged'],
      ['c_rsh', 'e_fin',   'tagged'], ['c_rsh', 'e_mfg',   'tagged'], ['c_rsh', 'e_cost',  'tagged'],
      ['c_cas', 'e_fin',   'tagged'], ['c_cas', 'e_priv',  'tagged'], ['c_cas', 'e_cost',  'tagged'], ['c_cas', 'e_mfg', 'tagged'],
      ['c_reg', 'e_mask',  'tagged'], ['c_reg', 'e_lvl3',  'tagged'], ['c_reg', 'e_audit', 'tagged'], ['c_reg', 'e_fin', 'tagged'],
      ['c_wpr', 'e_rag',   'tagged'], ['c_wpr', 'e_vec',   'tagged'], ['c_wpr', 'e_multi', 'tagged'],
      ['c_sls', 'e_cost',  'tagged'], ['c_sls', 'e_sla',   'tagged'], ['c_sls', 'e_priv',  'tagged'],
      ['c_ops', 'e_sla',   'tagged'], ['c_ops', 'e_lvl3',  'tagged'], ['c_ops', 'e_audit', 'tagged'],
      ['c_mtg', 'e_rag',   'tagged'], ['c_mtg', 'e_perm',  'tagged'],

      /* 文档 → 实体：这份文档讲到了什么 */
      ['d_deploy_pre', 'e_priv',  'cites'],
      ['d_perm_role',  'e_perm',  'cites'], ['d_perm_role', 'e_mask', 'cites'],
      ['d_api_auth',   'e_perm',  'cites'],
      ['d_mkt_model',  'e_cost',  'cites'],
      ['d_mkt_mfg',    'e_mfg',   'cites'],
      ['d_case_bank',  'e_fin',   'cites'], ['d_case_bank', 'e_priv', 'cites'],
      ['d_case_auto',  'e_mfg',   'cites'],
      ['d_case_ins',   'e_fin',   'cites'],
      ['d_dsl',        'e_mask',  'cites'],
      ['d_pipl',       'e_audit', 'cites'],
      ['d_fin_grade',  'e_fin',   'cites'], ['d_fin_grade', 'e_lvl3', 'cites'],
      ['d_rag',        'e_rag',   'cites'],
      ['d_vec_sel',    'e_vec',   'cites'],
      ['d_multimodal', 'e_multi', 'cites'],
      ['d_roi',        'e_cost',  'cites'],
      ['d_cap_matrix', 'e_sla',   'cites'],
      ['d_privatize',  'e_priv',  'cites'],
      ['d_inspect',    'e_audit', 'cites'],
      ['d_fault',      'e_sla',   'cites'],
      ['d_change',     'e_lvl3',  'cites'],
      ['d_adr',        'e_rag',   'cites'],
      ['d_align',      'e_cost',  'cites'],
      ['d_review',     'e_multi', 'cites'],
      ['d_vendor',     'e_cost',  'cites'],

      /* 文档 → 文档：跨类目的引用关系，图谱里最有信息量的那几条边 */
      ['d_rag',       'd_vec_sel',   'derives'],
      ['d_case_bank', 'd_perm_role', 'refers'],
      ['d_roi',       'd_mkt_model', 'refers'],
      ['d_fault',     'd_change',    'refers'],
      ['d_fin_grade', 'd_dsl',       'refers'],
      ['d_privatize', 'd_deploy_pre','refers'],
      ['d_cap_matrix','d_vendor',    'refers']
    ]
  };

})(typeof window !== 'undefined' ? window : this);
