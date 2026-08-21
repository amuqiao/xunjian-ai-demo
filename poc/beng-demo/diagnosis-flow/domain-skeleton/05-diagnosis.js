// 领域契约 05：AI 辅助判断（pump-demo 里没有对应文件，本 POC 新增）。
//
// 这份契约存在的理由：工作台那张 AI 卡如果只是"一句结论 + 三个纯文本标签"，观众
// 看不出模型凭什么下这个结论。evidenceChain 把结论拆成四类可点的依据，点击行为
// 由骨架按 kind 分发：
//   series → 打开时序详情子屏并选中 pointId
//   vision → 打开视觉详情子屏并定位 frameId
//   rule   → 就地展开规则卡（不跳页）
//   case   → 跳知识库并打开 docId 对应的文档
//
// locked:true 的那一条是"二次命中"包袱：归档前灰显不可点，归档后亮起。它是整条
// 闭环收尾落回工作台的落点。
//
// suggestion.outcomeId 必须存在于 06-review.js 的 outcomes 里——分歧态的整个判断
// （人工结论 !== AI 建议）都建立在这条引用上，悬空了就等于分歧永远算不对。
window.DOMAIN_DIAGNOSIS = {
  cases: [
    {
      id: "DIAG-001",
      objectId: "OBJ-A",
      partId: "PART-1",
      recordId: "REC-001",
      suggestion: {
        outcomeId: "fix",
        label: "建议结论：确认异常",
        text: "P-1 泵驱动端振动已越过关注线，联轴器相位差达到异常区间，2X 频谱突出，建议现场复核对中并生成处置票卡。"
      },
      confidence: 82,
      confidenceBand: "needs-review",
      evidenceChain: [
        { kind: "series", label: "泵驱动端振动", detail: "当前 5.82mm/s，越过 4.5mm/s 关注线", pointId: "PT-1", confidence: 86 },
        { kind: "vision", label: "联轴器关键帧", detail: "P-1 联轴器和泵驱动端需现场复核", frameId: "FRM-1-CUR", confidence: 79 },
        { kind: "rule", label: "不对中诊断规则", detail: "2X 频谱 + 相位差异常 + 振动升高", ruleId: "R-001", confidence: 82 },
        { kind: "case", label: "P-1 不对中归档案例", detail: "归档后解锁复用", docId: "DOC-CASE", locked: true }
      ],
      summary: "案情摘要：本轮巡检记录未见异常，但模型证据指向 P-1 联轴器疑似不对中，需要人工复核确认。"
    },
    {
      id: "DIAG-003",
      objectId: "OBJ-A",
      partId: "PART-1",
      recordId: "REC-002",
      suggestion: {
        outcomeId: "fix",
        label: "建议结论：补齐处置票卡",
        text: "同一巡检项前一日缺少联轴器对中复核读数，建议按集团既有对中处置票卡补齐复核读数和处置记录。"
      },
      confidence: 74,
      confidenceBand: "needs-review",
      evidenceChain: [
        { kind: "series", label: "相位差趋势", detail: "联轴器相位差已进入异常区间", pointId: "PT-2", confidence: 77 },
        { kind: "vision", label: "激光对中仪", detail: "调整前读数可作为复核依据", frameId: "FRM-1-CMP", confidence: 72 },
        { kind: "rule", label: "对中作业记录要求", detail: "复核应留存调整前后读数", ruleId: "R-002", confidence: 74 },
        { kind: "case", label: "对中作业模板卡", detail: "查看标准步骤", docId: "DOC-CARD", locked: false }
      ],
      summary: "案情摘要：本条用于演示巡检记录缺项和作业卡引用。"
    },
    {
      id: "DIAG-004",
      objectId: "OBJ-A",
      partId: "PART-2",
      recordId: "REC-003",
      suggestion: {
        outcomeId: "reject",
        label: "建议结论：排除误报",
        text: "底座基础振动接近关注区，但地脚状态未见异常，暂不生成处置票卡，建议作为误报样本回流规则优化。"
      },
      confidence: 68,
      confidenceBand: "insufficient",
      evidenceChain: [
        { kind: "series", label: "基础振动趋势", detail: "当前接近关注线但未形成独立异常", pointId: "PT-3", confidence: 70 },
        { kind: "vision", label: "底座基础关键帧", detail: "地脚状态需现场确认", frameId: "FRM-2-CUR", confidence: 66 },
        { kind: "rule", label: "基础并发证据口径", detail: "作为不对中复核的辅助证据", ruleId: "R-003", confidence: 68 },
        { kind: "case", label: "运行状态监测报告", detail: "查看并发证据说明", docId: "DOC-METRIC", locked: false }
      ],
      summary: "案情摘要：本条用于演示关注项如何被人工复核为误报反馈。"
    },
    {
      id: "DIAG-005",
      objectId: "OBJ-A",
      partId: "PART-3",
      recordId: "REC-005",
      suggestion: {
        outcomeId: "fix",
        label: "建议结论：确认泄漏风险",
        text: "机械密封区域视觉模型识别到油迹风险，泄漏告警指数越过关注线，建议现场复核密封端面和冲洗管路并引用机械密封作业卡。"
      },
      confidence: 81,
      confidenceBand: "needs-review",
      evidenceChain: [
        { kind: "series", label: "泄漏告警指数", detail: "当前 0.81，越过 0.70 关注线", pointId: "PT-4", confidence: 83 },
        { kind: "vision", label: "机械密封视觉识别", detail: "密封件和泄漏敏感区域识别 0.87", frameId: "FRM-3-CUR", confidence: 87 },
        { kind: "rule", label: "机械密封泄漏复核规则", detail: "油迹 + 泄漏趋势 + 密封作业卡", ruleId: "R-004", confidence: 80 },
        { kind: "case", label: "机械密封更换作业卡", detail: "查看密封复核与处置步骤", docId: "DOC-SEAL-CARD", locked: false }
      ],
      summary: "案情摘要：本条用于演示漏油/泄漏场景如何从巡检表单进入视觉识别、时序告警和知识库作业卡。"
    },
    {
      id: "DIAG-006",
      objectId: "OBJ-A",
      partId: "PART-4",
      recordId: "REC-006",
      suggestion: {
        outcomeId: "fix",
        label: "建议结论：确认温升异常",
        text: "泵驱动端轴承温度告警持续抬升，热成像关键帧显示局部热斑，建议复核润滑状态、轴承游隙和振动伴随变化。"
      },
      confidence: 79,
      confidenceBand: "needs-review",
      evidenceChain: [
        { kind: "series", label: "轴承温度告警", detail: "当前 86.4℃，越过 75℃ 关注线", pointId: "PT-5", confidence: 82 },
        { kind: "vision", label: "轴承热成像关键帧", detail: "热斑区域识别 0.84", frameId: "FRM-4-CUR", confidence: 84 },
        { kind: "rule", label: "轴承温升复核规则", detail: "温度抬升 + 热斑 + 润滑/轴承票卡", ruleId: "R-005", confidence: 78 },
        { kind: "case", label: "轴承温升复核作业卡", detail: "查看润滑与轴承复核步骤", docId: "DOC-BEARING-CARD", locked: false }
      ],
      summary: "案情摘要：本条用于演示轴承温升场景如何接入时序告警、热成像和知识库复核卡。"
    },
    {
      id: "DIAG-007",
      objectId: "OBJ-A",
      partId: "PART-5",
      recordId: "REC-007",
      suggestion: {
        outcomeId: "fix",
        label: "建议结论：确认工况异常",
        text: "出口压力波动告警越过关注线，汽蚀损伤样例与泵体异响记录形成旁证，建议复核入口条件、阀位和泵运行工况。"
      },
      confidence: 76,
      confidenceBand: "needs-review",
      evidenceChain: [
        { kind: "series", label: "出口压力波动告警", detail: "当前 0.46MPa，越过 0.35MPa 关注线", pointId: "PT-6", confidence: 78 },
        { kind: "vision", label: "汽蚀损伤视觉样例", detail: "叶轮汽蚀损伤特征识别 0.82", frameId: "FRM-5-CUR", confidence: 82 },
        { kind: "rule", label: "压力波动与汽蚀复核规则", detail: "压力波动 + 异响 + 入口条件", ruleId: "R-006", confidence: 74 },
        { kind: "case", label: "压力波动与汽蚀复核说明", detail: "查看工况复核依据", docId: "DOC-CAVITATION-RULE", locked: false }
      ],
      summary: "案情摘要：本条用于演示压力异常/汽蚀风险如何从表单项进入时序告警、视觉样例和知识库规则。"
    },
    {
      id: "DIAG-008",
      objectId: "OBJ-A",
      partId: "PART-6",
      recordId: "REC-008",
      suggestion: {
        outcomeId: "bearing-inspect",
        label: "建议结论：疑似轴承内圈剥落",
        text: "2号轴承振动值异常上升，视觉证据排除泵体渗漏和联轴器明显偏移；RAG 命中 2023 年 XX 站同类案例，诊断为高度疑似轴承内圈剥落，置信度 87%，处置建议匹配度 65%，建议 72h 内停机检查。"
      },
      confidence: 87,
      confidenceBand: "needs-review",
      evidenceChain: [
        { kind: "series", label: "2号轴承振动告警", detail: "时序引擎检测到 2号轴承振动值异常上升，已越过 4.5mm/s 关注线", pointId: "PT-7", confidence: 89 },
        { kind: "vision", label: "排除性视觉证据", detail: "泵体无渗漏，联轴器无明显偏移", frameId: "FRM-6-CUR", confidence: 88 },
        { kind: "rule", label: "RAG 相似案例核验", detail: "以 轴承 + 振动上升 + 当前工况 作为 Query，命中 Top-5 相似案例", ruleId: "R-007", confidence: 87 },
        { kind: "case", label: "2023年XX站同类案例", detail: "历史案例特征：2号轴承振动上升，拆检发现内圈剥落", docId: "DOC-BEARING-SPALL-CASE", locked: false },
        { kind: "case", label: "2号轴承复核票卡", detail: "生成 IMS 工单建议、备件信息和移动端作业卡", docId: "DOC-BEARING-IMS-CARD", locked: false }
      ],
      summary: "案情摘要：本条用于演示时序、视觉和 RAG 如何拼接上下文并把诊断建议落到集团既有复核票卡。"
    }
  ],

  rules: [
    {
      id: "R-001",
      title: "不对中诊断专家规则",
      text: "当泵驱动端振动升高、联轴器相位差异常且 2X 频谱成分突出时，应进入联轴器不对中复核；底座基础振动偏大可作为并发证据。",
      source: "长岭站 P-1 输油泵运行状态监测报告；ZLMI400 07型鲁尔输油泵对中作业卡"
    },
    {
      id: "R-002",
      title: "对中作业记录要求",
      text: "对中复核应记录停机前状态、激光对中仪调整前后读数、地脚垫片调整情况和复测结果。",
      source: "04-ZLMI400 07型鲁尔输油泵对中作业卡"
    },
    {
      id: "R-003",
      title: "基础振动并发证据口径",
      text: "底座基础振动和地脚状态不单独定性不对中，但可作为管道约束、基础松动或轴系异常的辅助判断依据。",
      source: "输油泵机组运行状态监测报告2026年6月-湖南公司"
    },
    {
      id: "R-004",
      title: "机械密封泄漏复核规则",
      text: "当机械密封区域出现油迹、液滴或油雾，且泄漏告警指数持续升高时，应复核密封端面、冲洗管路、轴套磨损和泄漏回收状态。",
      source: "K248 泵机组机械密封更换作业卡；站场设备设施泄漏管理暂行细则"
    },
    {
      id: "R-005",
      title: "轴承温升复核规则",
      text: "轴承温度持续抬升并出现热成像局部热斑时，应结合润滑油状态、轴承游隙、振动伴随变化和运行负荷判断是否进入轴承复核。",
      source: "泵机组润滑油更换作业卡；输油泵机组运行状态监测指标说明"
    },
    {
      id: "R-006",
      title: "压力波动与汽蚀复核规则",
      text: "出口压力波动、泵体异响和入口条件异常同时出现时，应复核入口阀位、过滤器压差、流量工况和汽蚀损伤风险。",
      source: "成品油管道运行规范；输油泵运行维护规程"
    },
    {
      id: "R-007",
      title: "轴承振动上升 RAG 复核规则",
      text: "当 2号轴承振动值异常上升，视觉证据排除泵体渗漏和联轴器明显偏移时，可将轴承、振动上升和当前工况作为 Query 检索相似案例，若命中轴承内圈剥落处置记录，应进入人工复核并生成票卡建议。",
      source: "2023年XX站轴承内圈剥落处置案例；2号轴承振动异常复核票卡；设备档案"
    }
  ]
};
