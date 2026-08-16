/**
 * kg-data.js —— 巡检知识图谱 · 唯一数据真值源
 * ═══════════════════════════════════════════════════════════════════
 * 三个视图（3D 展台 / 关系图谱 / 主题树）全部由 kg-derive.js 从这里投影出来。
 * 本文件只写业务数据，不写派生结果，不改页面渲染代码。
 */
(function (global) {
  'use strict';

  var KG = global.KG = global.KG || {};

  KG.source = {

    meta: {
      title: '巡检知识中枢',
      hub: {
        id: 'hub',
        name: '巡检知识中枢',
        en: 'INSPECTION KNOWLEDGE HUB',
        sub: 'IMS · VISION · PROCEDURE · CASE REUSE',
        desc: '聚合巡检制度、标准规程、一票一卡、技术通报与归档案例，支撑诊断复核、问题闭环和知识复用。'
      },
      metrics: [
        { key: 'categories', label: '知识分支', value: null, unit: '类' },
        { key: 'docTotal',   label: '资料总量', value: null, unit: '份' },
        { key: 'vectors',    label: '向量索引', value: '0.18', unit: 'M' },
        { key: 'recall',     label: '演示召回', value: '93.6', unit: '%' }
      ]
    },

    types: {
      hub:      { label: '巡检中枢', color: '#8FB4FF' },
      category: { label: '知识分支', color: '#FFC661' },
      topic:    { label: '主题',     color: '#FF9A66' },
      subtopic: { label: '专业',     color: '#4FD6A9' },
      doc:      { label: '资料',     color: '#5B9EFF' },
      item:     { label: '条目',     color: '#A98CFF' },
      entity:   { label: '巡检实体', color: '#22D3EE' }
    },

    treeLevels: ['category', 'topic', 'subtopic', 'doc', 'item'],

    relTypes: {
      contains: { label: '收录', major: true },
      tagged:   { label: '涉及', major: false },
      cites:    { label: '关联', major: false },
      derives:  { label: '沉淀', major: false },
      refers:   { label: '依据', major: false }
    },

    categories: [
      {
        id: 'c_inspect', name: '巡检管理', en: 'INSPECTION MANAGEMENT', code: 'XJ-MGMT',
        color: '#22D3EE', icon: 'node', note: '流程闭环', docTotal: 12,
        desc: '巡检标准、方案、点表、IMS 任务下发和问题上报闭环，是诊断台知识链路的入口。',
        featured: ['d_flow', 'd_standard', 'd_ims'],
        children: [
          { name: '巡检流程', children: [
            { name: '流程说明', children: [
              { id: 'd_flow', name: '巡检管理流程说明' },
              { name: '巡检管理流程图' }
            ]},
            { name: '标准模板', children: [
              { id: 'd_standard', name: '油气站场、阀室通用巡检标准' },
              { name: 'XX作业区站场、阀室巡检方案' }
            ]}
          ]},
          { name: '巡检点表', children: [
            { name: '点表示例', children: [
              { name: '专业巡检点表-示例' },
              { name: '常规巡检点表-示例' },
              { name: '联合巡检点表-示例' }
            ]}
          ]},
          { name: 'IMS 闭环', children: [
            { name: '系统操作', children: [
              { id: 'd_ims', name: '巡检管理及问题上报 IMS 系统使用操作指南' },
              { name: '巡检情况反馈情况说明' },
              { name: '因事暂停巡检登记表' }
            ]}
          ]}
        ]
      },

      {
        id: 'c_rules', name: '制度标准', en: 'RULES & STANDARDS', code: 'XJ-RULE',
        color: '#4C7DFF', icon: 'shield', note: '依据库', docTotal: 58,
        desc: '国家、行业、集团和湖南公司制度指引，为巡检方案、点表和异常处置提供依据。',
        featured: ['d_ops_mgmt', 'd_integrity', 'd_hunan_guide'],
        children: [
          { name: '集团制度', children: [
            { name: '生产运行', children: [
              { id: 'd_run_mgmt', name: '国家管网集团生产运行管理规定' },
              { id: 'd_ops_mgmt', name: '国家管网集团生产运维管理办法' }
            ]},
            { name: '站场完整性', children: [
              { id: 'd_integrity', name: '国家管网集团站场完整性管理规定' },
              { id: 'd_leak', name: '国家管网集团站场设备设施泄漏管理暂行细则' }
            ]}
          ]},
          { name: '企业标准', children: [
            { name: '资产完整性', children: [
              { id: 'd_asset_station', name: 'Q/GGW 03001.3-2024 油气站场设备设施完整性' },
              { id: 'd_asset_special', name: 'Q/GGW 03001.7-2022 特种设备完整性' }
            ]}
          ]},
          { name: '湖南公司指引', children: [
            { name: '巡检值守', children: [
              { id: 'd_hunan_guide', name: '湖南公司油气站场巡检及值班值守工作指引（试行）' },
              { name: '输油气生产设备计划性维检修大表' }
            ]}
          ]}
        ]
      },

      {
        id: 'c_proc', name: '操作规程', en: 'OPERATING PROCEDURES', code: 'XJ-PROC',
        color: '#5B9EFF', icon: 'doc', note: '规程精选', docTotal: 148,
        desc: '从工艺、机械、电气、仪控通信规程中抽取演示所需的关键设备和关键证据来源。',
        featured: ['d_pressure', 'd_video', 'd_gas_alarm', 'd_esd'],
        children: [
          { name: '仪控通信', children: [
            { name: '复核证据', children: [
              { id: 'd_video', name: 'HN-SC-TX-GC-001-2025 工业电视系统操作规程' },
              { id: 'd_pressure', name: 'HN-SC-YK-GC-017-2025 压力表、差压表操作及维护规程' },
              { id: 'd_gas_alarm', name: 'HN-SC-YK-GC-014-2025 可燃气体和有毒气体探测报警系统操作及维护规程' },
              { id: 'd_esd', name: 'HN-SC-YK-ZY-001-2025 ESD 系统测试作业指导书' }
            ]}
          ]},
          { name: '工艺计量', children: [
            { name: '管道作业', children: [
              { id: 'd_oil_pipe', name: '输油管道工艺操作规程' },
              { id: 'd_gas_pipe', name: '输气管道工艺操作规程' },
              { id: 'd_drain', name: '排污作业操作规程' }
            ]}
          ]},
          { name: '机械电气', children: [
            { name: '现场设备', children: [
              { id: 'd_pump_ops', name: '输油站场（阀室）机械设备操作及维护规程' },
              { id: 'd_valve_grease', name: '阀门注脂及注脂嘴、排污阀更换操作规程' },
              { id: 'd_ir_temp', name: '电气设备红外测温作业指导书' },
              { id: 'd_switchgear', name: '高低压开关柜检修作业指导书' }
            ]}
          ]}
        ]
      },

      {
        id: 'c_card', name: '一票一卡', en: 'WORK CARDS & TICKETS', code: 'XJ-CARD',
        color: '#FFC661', icon: 'cal', note: '作业票卡', docTotal: 18,
        desc: '把典型泵机组操作票和维检修作业卡放入图谱，演示从巡检异常到处置票卡的落点。',
        featured: ['d_pump_start', 'd_pump_stop', 'd_pump_seal', 'd_pump_4000'],
        children: [
          { name: '操作票', children: [
            { name: '泵机组操作', children: [
              { id: 'd_pump_start', name: 'P202 泵机组就地启机操作' },
              { id: 'd_pump_stop', name: 'P203 泵机组就地停机操作' },
              { id: 'd_pump_switch', name: 'P204 泵机组就地切换操作' },
              { id: 'd_pump_turn', name: 'P205 泵机组盘车操作' }
            ]}
          ]},
          { name: '维检修作业卡', children: [
            { name: '泵机组检修', children: [
              { id: 'd_pump_seal', name: 'K248 泵机组机械密封更换' },
              { id: 'd_pump_4000', name: 'K249 泵机组 4000 小时维护保养' },
              { id: 'd_pump_overhaul', name: 'K250 泵机组 50000 小时（10 年）大修' },
              { id: 'd_pump_lube', name: 'K252 泵机组润滑油更换' }
            ]}
          ]}
        ]
      },

      {
        id: 'c_case', name: '技术通报与案例', en: 'BULLETINS & CASES', code: 'XJ-CASE',
        color: '#A855F7', icon: 'chart', note: '可复用', docTotal: 9,
        desc: '年度技术通报、异常复核案例和 IMS 问题闭环样本，用于演示归档后的二次命中。',
        featured: ['d_tech2025', 'd_case_dp', 'd_case_video'],
        children: [
          { name: '技术通报', children: [
            { name: '年度汇编', children: [
              { id: 'd_tech2025', name: '2025 年技术通报汇编（待结构化）' }
            ]}
          ]},
          { name: '复核案例', children: [
            { name: '异常复核', children: [
              { id: 'd_case_dp', name: '差压趋势异常复核案例' },
              { id: 'd_case_video', name: '工业电视抽查问题闭环案例' },
              { id: 'd_case_false', name: '视觉误报复核样本' }
            ]}
          ]},
          { name: '问题闭环', children: [
            { name: 'IMS 样本', children: [
              { id: 'd_case_ims', name: 'IMS 问题上报与整改闭环样本' }
            ]}
          ]}
        ]
      }
    ],

    entities: [
      { id: 'e_risk_eval', label: '风险评价', desc: '巡检方案和点表编制的重要输入，用于确定高风险对象和重点点位。' },
      { id: 'e_process_safety', label: '工艺安全分析', desc: '识别工艺运行边界和异常后果，支撑巡检标准动态调整。' },
      { id: 'e_seal_points', label: '密封点台账', desc: '泄漏管理和现场巡检的重要对象清单。' },
      { id: 'e_ims', label: 'IMS 设备巡检', desc: '巡检任务下发、问题上报、整改闭环和归档留痕的系统入口。' },
      { id: 'e_daily', label: '日常巡检', desc: '按路线、点位和周期执行的常规巡检。' },
      { id: 'e_special', label: '特殊巡检', desc: '天气、工况、事件或风险变化触发的专项巡检。' },
      { id: 'e_pressure_dp', label: '压力/差压', desc: '本演示诊断台的核心异常对象，连接时序、仪表规程和归档案例。' },
      { id: 'e_video', label: '工业电视', desc: '视觉模型和关键帧复核的证据来源。' },
      { id: 'e_gas_alarm', label: '可燃/有毒气体报警', desc: '站场安全巡检中的重点仪控系统。' },
      { id: 'e_pump', label: '泵机组', desc: '典型操作票和维检修作业卡的承载设备。' },
      { id: 'e_valve', label: '阀门/执行机构', desc: '巡检、注脂、排污和阀位确认的高频对象。' },
      { id: 'e_closed_loop', label: '问题闭环', desc: '异常上报、复核、处置、复测和案例归档的闭环链路。' }
    ],

    relations: [
      ['c_inspect', 'e_risk_eval', 'tagged'], ['c_inspect', 'e_process_safety', 'tagged'],
      ['c_inspect', 'e_seal_points', 'tagged'], ['c_inspect', 'e_ims', 'tagged'],
      ['c_inspect', 'e_closed_loop', 'tagged'],
      ['c_rules', 'e_risk_eval', 'tagged'], ['c_rules', 'e_process_safety', 'tagged'],
      ['c_rules', 'e_closed_loop', 'tagged'],
      ['c_proc', 'e_pressure_dp', 'tagged'], ['c_proc', 'e_video', 'tagged'],
      ['c_proc', 'e_gas_alarm', 'tagged'], ['c_proc', 'e_pump', 'tagged'],
      ['c_proc', 'e_valve', 'tagged'],
      ['c_card', 'e_pump', 'tagged'], ['c_card', 'e_valve', 'tagged'],
      ['c_card', 'e_closed_loop', 'tagged'],
      ['c_case', 'e_pressure_dp', 'tagged'], ['c_case', 'e_video', 'tagged'],
      ['c_case', 'e_ims', 'tagged'], ['c_case', 'e_closed_loop', 'tagged'],

      ['d_flow', 'e_ims', 'cites'], ['d_flow', 'e_closed_loop', 'cites'],
      ['d_standard', 'e_risk_eval', 'cites'], ['d_standard', 'e_process_safety', 'cites'],
      ['d_standard', 'e_seal_points', 'cites'],
      ['d_ims', 'e_ims', 'cites'], ['d_ims', 'e_closed_loop', 'cites'],
      ['d_ops_mgmt', 'e_closed_loop', 'cites'],
      ['d_integrity', 'e_risk_eval', 'cites'], ['d_integrity', 'e_process_safety', 'cites'],
      ['d_hunan_guide', 'e_daily', 'cites'], ['d_hunan_guide', 'e_special', 'cites'],
      ['d_hunan_guide', 'e_closed_loop', 'cites'],
      ['d_pressure', 'e_pressure_dp', 'cites'], ['d_video', 'e_video', 'cites'],
      ['d_gas_alarm', 'e_gas_alarm', 'cites'], ['d_esd', 'e_gas_alarm', 'cites'],
      ['d_pump_start', 'e_pump', 'cites'], ['d_pump_stop', 'e_pump', 'cites'],
      ['d_pump_seal', 'e_pump', 'cites'], ['d_pump_seal', 'e_closed_loop', 'cites'],
      ['d_pump_4000', 'e_pump', 'cites'], ['d_pump_4000', 'e_closed_loop', 'cites'],
      ['d_tech2025', 'e_pressure_dp', 'cites'], ['d_tech2025', 'e_video', 'cites'],
      ['d_case_dp', 'e_pressure_dp', 'cites'], ['d_case_dp', 'e_ims', 'cites'],
      ['d_case_dp', 'e_closed_loop', 'cites'],
      ['d_case_video', 'e_video', 'cites'], ['d_case_video', 'e_closed_loop', 'cites'],

      ['d_flow', 'd_ops_mgmt', 'refers'],
      ['d_standard', 'd_hunan_guide', 'refers'],
      ['d_standard', 'd_integrity', 'refers'],
      ['d_ims', 'd_case_dp', 'derives'],
      ['d_hunan_guide', 'd_ops_mgmt', 'refers'],
      ['d_pressure', 'd_case_dp', 'refers'],
      ['d_video', 'd_case_video', 'refers'],
      ['d_gas_alarm', 'd_esd', 'refers'],
      ['d_pump_stop', 'd_pump_seal', 'refers'],
      ['d_pump_start', 'd_pump_4000', 'refers'],
      ['d_tech2025', 'd_case_dp', 'refers'],
      ['d_case_dp', 'd_video', 'refers'],
      ['d_case_dp', 'd_flow', 'refers']
    ]
  };

})(typeof window !== 'undefined' ? window : this);
