/**
 * kg-data.js —— 泵业务知识图谱 · 唯一数据真值源
 *
 * 当前数据为演示口径，主目录抽取自 assets/data/泵知识库/11_1.xlsx。
 * 模板保持离线运行，不 fetch 外部数据；页面只消费 KG.source。
 */
(function (global) {
  'use strict';

  var KG = global.KG = global.KG || {};

  KG.source = {
    meta: {
      title: '泵业务知识图谱',
      hub: {
        id: 'hub',
        name: '泵课题知识中枢',
        en: 'PUMP KNOWLEDGE HUB',
        sub: 'PUMP OPERATION AND MAINTENANCE KNOWLEDGE BASE',
        desc: '汇聚国家标准、行业标准、集团制度、湖南公司规程、一票一卡和故障案例，支撑输油泵巡检、诊断、复核与检维修演示。'
      },
      metrics: [
        { key: 'categories', label: '知识类目', value: null, unit: '类' },
        { key: 'docTotal', label: '资料总量', value: null, unit: '份' },
        { key: 'vectors', label: '向量索引', value: '12.8', unit: 'K' },
        { key: 'recall', label: '平均召回', value: '92.6', unit: '%' }
      ]
    },

    types: {
      hub: { label: '知识中枢', color: '#9DC9FF' },
      category: { label: '知识类目', color: '#4FB6D8' },
      topic: { label: '主题', color: '#3F7DF6' },
      subtopic: { label: '子类', color: '#67B7DA' },
      doc: { label: '资料', color: '#2F6BFF' },
      item: { label: '条目', color: '#9DC9FF' },
      entity: { label: '实体标签', color: '#4FB6D8' }
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
        id: 'c_gb', name: '国家标准', en: 'NATIONAL STANDARDS', code: 'PUMP-GB',
        color: '#2F6BFF', icon: 'shield', note: '基础规范', docTotal: 186,
        desc: '覆盖爆炸性环境、机械设备安装、输油管道设计、工业管道施工、设备标识和设施维护等国家标准。',
        featured: ['d_gb_3836_13', 'd_gb_50253', 'd_gbt_35068'],
        children: [
          { name: '防爆与修理检修', children: [
            { name: '爆炸性环境', children: [
              { id: 'd_gb_3836_13', name: 'GB 3836.13-2013 爆炸性环境 第13部分：设备的修理、检修、修复和改造' },
              { id: 'd_gbt_3836_1', name: 'GBT 3836.1-2021 爆炸性环境 第1部分：设备 通用要求' }
            ]}
          ]},
          { name: '安装与管道工程', children: [
            { name: '施工验收', children: [
              { id: 'd_gb_50231', name: 'GB 50231-2009 机械设备安装工程施工及验收通用规范' },
              { id: 'd_gb_50264', name: 'GB 50264-2013 工业设备及管道绝热工程设计规范' },
              { id: 'd_gb_50235', name: 'GB 50235-2010 工业金属管道工程施工规范' },
              { id: 'd_gb_50517', name: 'GB 50517-2010 石化金属管道工程施工质量验收规范' }
            ]},
            { name: '输油管道', children: [
              { id: 'd_gb_50253', name: 'GB 50253-2014 输油管道工程设计规范' },
              { id: 'd_gb_50316', name: 'GB 50316-2000 工业金属管道设计规范' },
              { id: 'd_gb_50540', name: 'GB 50540-2009 石油天然气站内工艺管道工程施工规范' }
            ]}
          ]},
          { name: '标识与设施维护', children: [
            { name: '运行标识', children: [
              { id: 'd_gb_7231', name: 'GB 7231-2003 工业管道的基本识别色、识别符号和安全标识' },
              { id: 'd_gbt_9125_1', name: 'GBT 9125.1-2020 钢制管法兰连接用紧固件 第1部分：PN系列' },
              { id: 'd_gbt_35068', name: 'GBT 35068-2018 油气管道运行规范' },
              { id: 'd_gbt_41474', name: 'GBT 41474-2022 设施管理 运作与维护指南' }
            ]}
          ]}
        ]
      },
      {
        id: 'c_industry', name: '行业标准', en: 'INDUSTRY STANDARDS', code: 'PUMP-SY',
        color: '#4FB6D8', icon: 'chart', note: '安装运行', docTotal: 128,
        desc: '沉淀输油泵组安装和成品油管道运行的行业标准，作为泵机组安装验收和运行复核依据。',
        featured: ['d_syt_0403', 'd_syt_6695'],
        children: [
          { name: '输油泵组', children: [
            { name: '安装验收', children: [
              { id: 'd_syt_0403', name: 'SY/T 0403-2025 输油泵组安装技术规范' }
            ]}
          ]},
          { name: '成品油管道', children: [
            { name: '运行规范', children: [
              { id: 'd_syt_6695', name: 'SY/T 6695-2024 成品油管道运行规范' }
            ]}
          ]}
        ]
      },
      {
        id: 'c_group', name: '集团制度', en: 'GROUP RULES', code: 'PUMP-GGW',
        color: '#5A72E8', icon: 'stack', note: '管理要求', docTotal: 156,
        desc: '覆盖资产完整性、生产运行、站场完整性、站内管道和泄漏管理等集团公司制度文件。',
        featured: ['d_qggw_03001_3', 'd_group_run_rule', 'd_group_leak_rule', 'd_qggw_03001_7'],
        children: [
          { name: '资产完整性', children: [
            { name: '企业标准', children: [
              { id: 'd_qggw_03001_3', name: 'Q_GGW 03001.3-2024 油气储运资产完整性管理规范 第3部分：油气站场设备设施' },
              { id: 'd_qggw_03001_7', name: 'Q-GGW 03001.7-2022 油气储运资产完整性管理规范 第7部分：特种设备' }
            ]}
          ]},
          { name: '生产运行制度', children: [
            { name: '制度文件', children: [
              { id: 'd_group_run_rule', name: '国家管网集团生产运行管理规定' },
              { id: 'd_group_ops_rule', name: '国家管网集团生产运维管理办法' },
              { id: 'd_group_station_integrity', name: '国家管网集团站场完整性管理规定' },
              { id: 'd_group_station_pipe', name: '国家管网集团站内管道管理暂行细则' },
              { id: 'd_group_leak_rule', name: '国家管网集团站场设备设施泄漏管理暂行细则' }
            ]}
          ]}
        ]
      },
      {
        id: 'c_hunan', name: '湖南规程指引', en: 'HUNAN GUIDES', code: 'PUMP-HN',
        color: '#67B7DA', icon: 'doc', note: '现场执行', docTotal: 168,
        desc: '湖南公司维检修、作业计划、能量隔离、变更管理和泵操作维护规程，是站场执行层的主要依据。',
        featured: ['d_hn_maintenance_guide', 'd_hn_pump_turning', 'd_hn_feed_pump', 'd_hn_main_pump'],
        children: [
          { name: '管理指引', children: [
            { name: '维检修与作业计划', children: [
              { id: 'd_hn_maintenance_guide', name: '湖南公司站场维检修工作指引（试行）' },
              { id: 'd_hn_plan_guide', name: '湖南公司作业计划管理工作指引（试行）' },
              { id: 'd_hn_isolation_guide', name: '湖南公司能量隔离和锁定管理工作指引（试行）' },
              { id: 'd_hn_change_guide', name: '湖南公司工艺和设备设施变更管理工作指引（试行）' }
            ]}
          ]},
          { name: '操作维护规程', children: [
            { name: '泵操作规程', children: [
              { id: 'd_hn_pump_turning', name: 'HN-SC-JX-GC-039-2025 国家管网集团湖南公司离心泵盘车操作规程' },
              { id: 'd_hn_feed_pump', name: 'HN-SC-JX-GC-048-2025 国家管网集团湖南公司长郴管道给油泵操作规程' },
              { id: 'd_hn_main_pump', name: 'HN-SC-JX-GC-049-2025 国家管网集团湖南公司长郴管道主输泵操作规程' }
            ]}
          ]},
          { name: '作业指导书', children: [
            { name: '计划性维检修', children: [
              { id: 'd_hn_plan_maintenance_table', name: '湖南公司输油气生产设备计划性维检修大表' }
            ]}
          ]}
        ]
      },
      {
        id: 'c_ticket', name: '一票一卡', en: 'WORK TICKETS', code: 'PUMP-TICKET',
        color: '#9DC9FF', icon: 'cal', note: '可执行', docTotal: 218,
        desc: '覆盖泵机组机械密封更换、4000小时维护、10年大修、泄漏报警检查、润滑油更换和就地启停切换操作票。',
        featured: ['d_k248_seal', 'd_k249_4000h', 'd_k250_overhaul', 'd_p202_start'],
        children: [
          { name: '维检修作业卡', children: [
            { name: '泵机组检修', children: [
              { id: 'd_k248_seal', name: 'K248 泵机组机械密封更换' },
              { id: 'd_k249_4000h', name: 'K249 泵机组4000小时维护保养' },
              { id: 'd_k250_overhaul', name: 'K250 泵机组50000小时（10年）大修' },
              { id: 'd_k251_leak_plate', name: 'K251 泵机组泄漏报警系统节流孔板检查' },
              { id: 'd_k252_oil_change', name: 'K252 泵机组润滑油更换' }
            ]}
          ]},
          { name: '操作票', children: [
            { name: '就地操作', children: [
              { id: 'd_p202_start', name: 'P202 泵机组就地启机操作' },
              { id: 'd_p203_stop', name: 'P203 泵机组就地停机操作' },
              { id: 'd_p204_switch', name: 'P204 泵机组就地切换操作' },
              { id: 'd_p205_turning', name: 'P205 泵机组盘车操作' }
            ]}
          ]}
        ]
      },
      {
        id: 'c_fault', name: '故障案例', en: 'FAULT CASES', code: 'PUMP-CASE',
        color: '#6F8FB5', icon: 'people', note: '诊断复用', docTotal: 24,
        desc: '收录诊断工作台输油泵故障案例目录中的停泵、泄漏、振动、水击、电压波动和变频泵异常等案例名称。',
        featured: ['d_case_20250825_wuxin_b4_leak', 'd_case_changling_b02_vibration', 'd_case_miluo_p03_leak', 'd_case_xinbao_voltage'],
        children: [
          { name: '泄漏与密封', children: [
            { name: '机械密封与泄漏停泵', children: [
              { id: 'd_case_20250825_wuxin_b4_leak', name: '20250825 “8.25”武信武汉站B-4给油泵驱动端泄漏停泵事件' },
              { id: 'd_case_liuzhou_612_seal_leak', name: '6·12柳州泵站1#泵机封泄漏报警触发联锁停泵分析报告' },
              { id: 'd_case_miluo_p03_leak', name: '湖南公司汨罗站P-03输油泵驱动端泄漏检测报警故障停泵报告' },
              { id: 'd_case_huazhong_20250825_seal_leak', name: '2025年华中增加1次---生产异常事件分析报告-输油泵机组故障和缺陷报告（华中公司2025年8月25日机械密封泄漏故障停泵）' }
            ]}
          ]},
          { name: '振动与设备保护', children: [
            { name: '振动报警与保护停泵', children: [
              { id: 'd_case_changling_p01_vibration', name: '长岭站P-01输油泵驱动端振动报警故障停泵报告V1' },
              { id: 'd_case_changling_b02_vibration', name: '3.泵机组故障停机报告：长岭站B-02给油泵非驱动端振动报警故障停泵报告' },
              { id: 'd_case_neijiang_b25401_protection', name: '一事一档（2024.10.26内江输油站B-25401保护性停泵事件报告）' },
              { id: 'd_case_kelamayi_0323_stop', name: '2_乌鲁木齐输油气分公司“03.23”克拉玛依成品油站克乌复线停泵故障报告' },
              { id: 'd_case_kelamayi_0920_stop', name: '附件：乌鲁木齐输油气分公司“9.20”北疆成品油管道克拉玛依首站1#泵停泵异常事件报告' }
            ]}
          ]},
          { name: '供电与晃电', children: [
            { name: '电压波动与晃电停泵', children: [
              { id: 'd_case_xinbao_voltage', name: '2025.4.25新堡输油站双兰线异常停泵事件报告（电压波动）' },
              { id: 'd_case_rizhao_20250401_power', name: '20250401 日仪线日照站4.1晃电停泵事件分析报告' },
              { id: 'd_case_nansha_12_vfd_power', name: '南沙作业区南沙站12#变频主输泵晃电停泵分析报告V2' },
              { id: 'd_case_malan_3_stop', name: '马兰输油站3#泵停泵事件分析报告（2024年5月12日）' }
            ]}
          ]},
          { name: '水击与流程异常', children: [
            { name: '水击、排气与阀门关断', children: [
              { id: 'd_case_dongying_20240711_waterhammer', name: '2024年07月11日东营站停泵触发水击东临复线全线停输异常事件' },
              { id: 'd_case_yangzi_20241005_air', name: '2024年10月5日扬子站因中石化油库新管线未充分排气导致异常停泵苏北北线停输事件' },
              { id: 'd_case_dongying_0212_valve', name: '“2.12”商储东营分公司阀门关断造成董东线水击联锁停泵事件 (2)' },
              { id: 'd_case_ridong_20250625_stop', name: '20250625 日东线异常停泵事件分析报告' }
            ]}
          ]},
          { name: '变频泵与站场异常', children: [
            { name: '异常停泵事件报告', children: [
              { id: 'd_case_jiangyin_1108_stop', name: '“11.08”江阴站异常停泵情况说明V07' },
              { id: 'd_case_qinnan_p0404_vfd', name: '钦南柳南宁输油站P0404变频泵异常停泵分析报告-终稿' },
              { id: 'd_case_xinzheng_p0403_stop', name: '郑州分公司新郑作业区P0403#泵停泵异常事件报告' },
              { id: 'd_case_dushanzi_b1201_stop', name: '独山子成品油站异常停输事件原因排查分析情况（B1201停泵分析报告）' },
              { id: 'd_case_qinzhou_p134_stop', name: '钦州输油站“6月4日”P134主输泵异常停泵事件报告' },
              { id: 'd_case_cuiling_0124_stop', name: '20240124 45.“1.24”翠岭输油站成品油1#泵停泵排查报告' },
              { id: 'd_case_litang_14_stop', name: '黎塘站14#给油泵非命令触发停泵分析报告pdf' }
            ]}
          ]}
        ]
      }
    ],

    entities: [
      { id: 'e_pump_unit', label: '泵机组', desc: '输油站场主输泵、给油泵及配套驱动端设备。' },
      { id: 'e_centrifugal_pump', label: '离心泵', desc: '盘车、启停、切换和运行监测的核心设备类型。' },
      { id: 'e_mechanical_seal', label: '机械密封', desc: '泵机组泄漏和检维修作业的关键部件。' },
      { id: 'e_lubrication', label: '润滑油', desc: '泵机组维护保养和状态检查的重要介质。' },
      { id: 'e_4000h', label: '4000小时维护', desc: '周期性维护保养节点。' },
      { id: 'e_overhaul', label: '10年大修', desc: '50000小时或10年大修作业。' },
      { id: 'e_leak_alarm', label: '泄漏报警', desc: '机械密封、节流孔板和泄漏检测相关风险。' },
      { id: 'e_start_stop', label: '就地启停', desc: '泵机组就地启机、停机、切换和盘车操作。' },
      { id: 'e_energy_isolation', label: '能量隔离', desc: '检维修前的锁定、挂牌和风险交底要求。' },
      { id: 'e_station_integrity', label: '站场完整性', desc: '站场设备设施完整性管理要求。' },
      { id: 'e_explosive_env', label: '爆炸性环境', desc: '泵棚、站场电气设备修理检修的防爆边界。' },
      { id: 'e_pipeline', label: '输油管道', desc: '泵组连接管道、站内管道与成品油管道运行规范。' },
      { id: 'e_identification', label: '安全标识', desc: '工业管道识别色、标识符号和安全标识。' },
      { id: 'e_alignment', label: '对中复核', desc: '不对中诊断和处置票卡的核心作业路径。' },
      { id: 'e_vibration', label: '振动联锁', desc: '非驱动端振动、2X频谱和联锁停泵案例标签。' },
      { id: 'e_case_reuse', label: '案例复用', desc: '归档案例被后续相似巡检和诊断命中。' }
    ],

    relations: [
      ['c_gb', 'e_explosive_env', 'tagged'], ['c_gb', 'e_pipeline', 'tagged'], ['c_gb', 'e_identification', 'tagged'],
      ['c_industry', 'e_pump_unit', 'tagged'], ['c_industry', 'e_pipeline', 'tagged'],
      ['c_group', 'e_station_integrity', 'tagged'], ['c_group', 'e_leak_alarm', 'tagged'],
      ['c_hunan', 'e_energy_isolation', 'tagged'], ['c_hunan', 'e_centrifugal_pump', 'tagged'],
      ['c_ticket', 'e_mechanical_seal', 'tagged'], ['c_ticket', 'e_start_stop', 'tagged'], ['c_ticket', 'e_lubrication', 'tagged'],
      ['c_fault', 'e_vibration', 'tagged'], ['c_fault', 'e_case_reuse', 'tagged'],

      ['d_gb_3836_13', 'e_explosive_env', 'cites'], ['d_gbt_3836_1', 'e_explosive_env', 'cites'],
      ['d_gb_50253', 'e_pipeline', 'cites'], ['d_gbt_35068', 'e_pipeline', 'cites'], ['d_gb_7231', 'e_identification', 'cites'],
      ['d_syt_0403', 'e_pump_unit', 'cites'], ['d_syt_6695', 'e_pipeline', 'cites'],
      ['d_qggw_03001_3', 'e_station_integrity', 'cites'], ['d_qggw_03001_7', 'e_pump_unit', 'cites'],
      ['d_group_run_rule', 'e_pump_unit', 'cites'], ['d_group_leak_rule', 'e_leak_alarm', 'cites'],
      ['d_hn_maintenance_guide', 'e_energy_isolation', 'cites'], ['d_hn_isolation_guide', 'e_energy_isolation', 'cites'],
      ['d_hn_pump_turning', 'e_centrifugal_pump', 'cites'], ['d_hn_feed_pump', 'e_centrifugal_pump', 'cites'], ['d_hn_main_pump', 'e_pump_unit', 'cites'],
      ['d_k248_seal', 'e_mechanical_seal', 'cites'], ['d_k249_4000h', 'e_4000h', 'cites'], ['d_k250_overhaul', 'e_overhaul', 'cites'],
      ['d_k251_leak_plate', 'e_leak_alarm', 'cites'], ['d_k252_oil_change', 'e_lubrication', 'cites'],
      ['d_p202_start', 'e_start_stop', 'cites'], ['d_p203_stop', 'e_start_stop', 'cites'], ['d_p204_switch', 'e_start_stop', 'cites'], ['d_p205_turning', 'e_centrifugal_pump', 'cites'],
      ['d_case_changling_p01_vibration', 'e_vibration', 'cites'], ['d_case_changling_b02_vibration', 'e_vibration', 'cites'],
      ['d_case_changling_p01_vibration', 'e_alignment', 'cites'],
      ['d_case_20250825_wuxin_b4_leak', 'e_leak_alarm', 'cites'], ['d_case_liuzhou_612_seal_leak', 'e_leak_alarm', 'cites'],
      ['d_case_miluo_p03_leak', 'e_leak_alarm', 'cites'], ['d_case_huazhong_20250825_seal_leak', 'e_leak_alarm', 'cites'],
      ['d_case_xinbao_voltage', 'e_start_stop', 'cites'], ['d_case_rizhao_20250401_power', 'e_start_stop', 'cites'],
      ['d_case_nansha_12_vfd_power', 'e_start_stop', 'cites'], ['d_case_malan_3_stop', 'e_start_stop', 'cites'],
      ['d_case_dongying_20240711_waterhammer', 'e_pipeline', 'cites'], ['d_case_yangzi_20241005_air', 'e_pipeline', 'cites'],
      ['d_case_dongying_0212_valve', 'e_pipeline', 'cites'], ['d_case_ridong_20250625_stop', 'e_pipeline', 'cites'],
      ['d_case_jiangyin_1108_stop', 'e_case_reuse', 'cites'], ['d_case_qinnan_p0404_vfd', 'e_case_reuse', 'cites'],
      ['d_case_xinzheng_p0403_stop', 'e_case_reuse', 'cites'], ['d_case_dushanzi_b1201_stop', 'e_case_reuse', 'cites'],
      ['d_case_qinzhou_p134_stop', 'e_case_reuse', 'cites'], ['d_case_cuiling_0124_stop', 'e_case_reuse', 'cites'],
      ['d_case_litang_14_stop', 'e_case_reuse', 'cites'], ['d_case_neijiang_b25401_protection', 'e_case_reuse', 'cites'],
      ['d_case_kelamayi_0323_stop', 'e_case_reuse', 'cites'], ['d_case_kelamayi_0920_stop', 'e_case_reuse', 'cites'],

      ['d_k248_seal', 'd_hn_maintenance_guide', 'refers'],
      ['d_k249_4000h', 'd_hn_plan_maintenance_table', 'refers'],
      ['d_k250_overhaul', 'd_syt_0403', 'refers'],
      ['d_k251_leak_plate', 'd_group_leak_rule', 'refers'],
      ['d_p202_start', 'd_hn_main_pump', 'refers'],
      ['d_p203_stop', 'd_hn_main_pump', 'refers'],
      ['d_p205_turning', 'd_hn_pump_turning', 'refers'],
      ['d_case_20250825_wuxin_b4_leak', 'd_k248_seal', 'refers'],
      ['d_case_miluo_p03_leak', 'd_k251_leak_plate', 'refers'],
      ['d_case_changling_b02_vibration', 'd_syt_0403', 'refers'],
      ['d_case_xinbao_voltage', 'd_p203_stop', 'refers'],
      ['d_case_dongying_0212_valve', 'd_gb_50253', 'refers'],
      ['d_case_changling_p01_vibration', 'd_case_changling_b02_vibration', 'derives']
    ]
  };
})(typeof window !== 'undefined' ? window : this);
