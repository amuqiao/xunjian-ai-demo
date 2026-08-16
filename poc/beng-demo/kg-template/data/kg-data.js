/**
 * kg-data.js —— 输油泵智能运维知识图谱 · 唯一数据真值源
 *
 * 当前数据为演示口径，抽取自 pump-demo 与 beng-ai-demo/assets 中的标准规范、
 * 运维报告、作业卡、历史故障报告和申报材料。模板保持离线运行，不 fetch 外部数据。
 */
(function (global) {
  'use strict';

  var KG = global.KG = global.KG || {};

  KG.source = {
    meta: {
      title: '输油泵智能运维知识图谱',
      hub: {
        id: 'hub',
        name: '泵智护知识中枢',
        en: 'PUMP KNOWLEDGE HUB',
        sub: 'OIL PUMP DIAGNOSIS KNOWLEDGE BASE',
        desc: '聚合输油泵标准规范、状态监测、作业卡、视觉证据、历史案例与专家规则，支撑诊断台问答、复核和归档案例复用。'
      },
      metrics: [
        { key: 'categories', label: '知识类目', value: null, unit: '类' },
        { key: 'docTotal', label: '资料总量', value: 86, unit: '份' },
        { key: 'vectors', label: '向量索引', value: '18.6', unit: 'K' },
        { key: 'recall', label: '平均召回', value: '93.8', unit: '%' }
      ]
    },

    types: {
      hub: { label: '知识中枢', color: '#8FB4FF' },
      category: { label: '知识类目', color: '#FFC661' },
      topic: { label: '主题', color: '#FF9A66' },
      subtopic: { label: '子类', color: '#4FD6A9' },
      doc: { label: '资料', color: '#5B9EFF' },
      item: { label: '条目', color: '#A98CFF' },
      entity: { label: '实体标签', color: '#22D3EE' }
    },

    treeLevels: ['category', 'topic', 'subtopic', 'doc', 'item'],

    relTypes: {
      contains: { label: '收录', major: true },
      tagged: { label: '涉及', major: false },
      cites: { label: '引用', major: false },
      derives: { label: '衍生', major: false },
      refers: { label: '参考', major: false }
    },

    categories: [
      {
        id: 'c_std', name: '标准规范', en: 'STANDARDS', code: 'PUMP-STD',
        color: '#4C7DFF', icon: 'shield', note: '基础依据', docTotal: 18,
        desc: 'API 610、API 682、输油管道设计规范和站场设备设施完整性规范，是泵课题诊断和复核的依据底座。',
        featured: ['d_api610', 'd_api682', 'd_asset_integrity'],
        children: [
          { name: '国际与国家标准', children: [
            { name: '离心泵标准', children: [
              { id: 'd_api610', name: 'API 610 石油石化天然气工业用离心泵' },
              { id: 'd_api682', name: 'API 682 离心泵和转子泵用轴封系统' }
            ]},
            { name: '管道工程规范', children: [
              { name: 'GB 50253 输油管道工程设计规范' }
            ]}
          ]},
          { name: '企业规范', children: [
            { name: '资产完整性', children: [
              { id: 'd_asset_integrity', name: '油气储运资产完整性管理规范 第3部分' }
            ]}
          ]}
        ]
      },
      {
        id: 'c_metric', name: '监测指标', en: 'MONITORING', code: 'PUMP-MET',
        color: '#22D3EE', icon: 'chart', note: '本轮主线', docTotal: 12,
        desc: '沉淀泵驱动端振动、联轴器相位差、2X 频谱、基础振动和复测验收指标。',
        featured: ['d_p1_report', 'd_june_report', 'd_metric_threshold'],
        children: [
          { name: '运行状态报告', children: [
            { name: '长岭站 P-1', children: [
              { id: 'd_p1_report', name: '长岭站 P-1 输油泵机组状态检测与评估报告' }
            ]},
            { name: '月度监测', children: [
              { id: 'd_june_report', name: '输油泵机组运行状态监测报告 2026年6月' }
            ]}
          ]},
          { name: '阈值口径', children: [
            { name: '振动与相位', children: [
              { id: 'd_metric_threshold', name: '泵驱动端振动与联轴器相位差分级口径' }
            ]}
          ]}
        ]
      },
      {
        id: 'c_card', name: '作业模板', en: 'WORKCARDS', code: 'PUMP-CARD',
        color: '#4FD6A9', icon: 'doc', note: '可执行', docTotal: 16,
        desc: '对中、机械密封、轴承拆装、联轴器中间节拆装、润滑油更换等标准作业卡。',
        featured: ['d_align_card', 'd_bearing_card', 'd_seal_card'],
        children: [
          { name: '对中与联轴器', children: [
            { name: '标准作业卡', children: [
              { id: 'd_align_card', name: 'ZLMI400 07型鲁尔输油泵对中作业卡' },
              { name: '联轴器中间节拆装作业卡' }
            ]}
          ]},
          { name: '关键部件', children: [
            { name: '检修作业卡', children: [
              { id: 'd_bearing_card', name: 'ZLMI400 07型鲁尔输油泵轴承拆装作业卡' },
              { id: 'd_seal_card', name: 'ZLMI400 07型鲁尔输油泵机械密封更换作业卡' },
              { name: '润滑油更换作业卡' }
            ]}
          ]}
        ]
      },
      {
        id: 'c_case', name: '历史案例', en: 'CASES', code: 'PUMP-CASE',
        color: '#FF9A66', icon: 'people', note: '复用闭环', docTotal: 10,
        desc: '历史停泵、泄漏报警、启泵失败和不对中处置案例，用于后续复检命中和复核路径复用。',
        featured: ['d_p1_case', 'd_p2_vibration', 'd_p3_leak'],
        children: [
          { name: '不对中与振动', children: [
            { name: '归档案例', children: [
              { id: 'd_p1_case', name: 'P-1 不对中诊断与处置报告' },
              { id: 'd_p2_vibration', name: '汨罗站 P-02 非驱动端振动联锁停泵报告' }
            ]}
          ]},
          { name: '泄漏与启停', children: [
            { name: '历史报告', children: [
              { id: 'd_p3_leak', name: '汨罗站 P-03 驱动端泄漏检测报警故障停泵报告' },
              { name: '154站004P0202主输泵启泵失败情况说明' }
            ]}
          ]}
        ]
      },
      {
        id: 'c_visual', name: '视觉证据', en: 'VISION', code: 'PUMP-VIS',
        color: '#8B5CFF', icon: 'node', note: '现场素材', docTotal: 8,
        desc: '泵棚现场图、设备图、仪表点位图和激光对中图片，用于解释模型证据和现场复核路径。',
        featured: ['d_field_photo', 'd_point_map', 'd_laser_align'],
        children: [
          { name: '现场图', children: [
            { name: '泵棚照片', children: [
              { id: 'd_field_photo', name: 'P-1 泵棚现场复核图' },
              { id: 'd_point_map', name: '输油泵机组仪表点位图' }
            ]}
          ]},
          { name: '对中图', children: [
            { name: '激光对中', children: [
              { id: 'd_laser_align', name: '激光对中仪调整前后对比图' }
            ]}
          ]}
        ]
      },
      {
        id: 'c_agent', name: 'Agent 问答', en: 'AGENT QA', code: 'PUMP-QA',
        color: '#A855F7', icon: 'chat', note: '诊断台引用', docTotal: 22,
        desc: '面向诊断台、人工复核和知识库的预设问答，包括为什么疑似不对中、现场复核看什么和案例如何复用。',
        featured: ['d_qa_why', 'd_qa_recheck', 'd_qa_reuse'],
        children: [
          { name: '诊断台问答', children: [
            { name: '主线解释', children: [
              { id: 'd_qa_why', name: '为什么判断 P-1 疑似不对中' },
              { id: 'd_qa_recheck', name: '现场复核优先看什么' }
            ]}
          ]},
          { name: '案例复用问答', children: [
            { name: '二次命中', children: [
              { id: 'd_qa_reuse', name: 'P-1 后续复检命中归档案例后能复用什么' }
            ]}
          ]}
        ]
      }
    ],

    entities: [
      { id: 'e_p1', label: 'P-1 输油泵', desc: '本轮诊断主线对象，出现振动升高和相位差异常。' },
      { id: 'e_p2', label: 'P-02 历史泵组', desc: '历史振动联锁停泵案例对象，用于补充案例库语境。' },
      { id: 'e_coupling', label: '联轴器', desc: '不对中复核的核心部件。' },
      { id: 'e_vibration', label: '泵驱动端振动', desc: '进入复核的主触发指标。' },
      { id: 'e_phase', label: '相位差', desc: '联轴器两侧对中状态的重要特征。' },
      { id: 'e_2x', label: '2X 频谱', desc: '不对中规则中的关键频谱标签。' },
      { id: 'e_base', label: '基础振动', desc: '底座与地脚状态的并发证据。' },
      { id: 'e_align', label: '对中作业', desc: '现场复核和处置票卡的主要作业路径。' },
      { id: 'e_case_reuse', label: '案例复用', desc: '归档后用于 P-1 后续复检相似异常的复核路径参考。' },
      { id: 'e_visual', label: '现场图片', desc: '泵棚图、仪表点位图和激光对中图。' }
    ],

    relations: [
      ['c_std', 'e_align', 'tagged'], ['c_metric', 'e_vibration', 'tagged'], ['c_card', 'e_align', 'tagged'],
      ['c_case', 'e_case_reuse', 'tagged'], ['c_visual', 'e_visual', 'tagged'], ['c_agent', 'e_case_reuse', 'tagged'],

      ['d_p1_report', 'e_p1', 'cites'], ['d_p1_report', 'e_vibration', 'cites'], ['d_p1_report', 'e_phase', 'cites'], ['d_p1_report', 'e_2x', 'cites'],
      ['d_metric_threshold', 'e_vibration', 'cites'], ['d_metric_threshold', 'e_phase', 'cites'], ['d_metric_threshold', 'e_base', 'cites'],
      ['d_align_card', 'e_align', 'cites'], ['d_align_card', 'e_coupling', 'cites'],
      ['d_field_photo', 'e_visual', 'cites'], ['d_point_map', 'e_vibration', 'cites'], ['d_laser_align', 'e_align', 'cites'],
      ['d_p1_case', 'e_p1', 'cites'], ['d_p1_case', 'e_case_reuse', 'cites'], ['d_p2_vibration', 'e_p2', 'cites'], ['d_p2_vibration', 'e_case_reuse', 'cites'],
      ['d_qa_why', 'e_p1', 'cites'], ['d_qa_recheck', 'e_align', 'cites'], ['d_qa_reuse', 'e_case_reuse', 'cites'],

      ['d_p1_case', 'd_align_card', 'refers'],
      ['d_p1_case', 'd_p1_report', 'refers'],
      ['d_p2_vibration', 'd_p1_case', 'refers'],
      ['d_qa_reuse', 'd_p1_case', 'derives'],
      ['d_laser_align', 'd_align_card', 'refers']
    ]
  };
})(typeof window !== 'undefined' ? window : this);
