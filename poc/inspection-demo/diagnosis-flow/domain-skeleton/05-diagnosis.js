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
        text: "PT6903B 出口压力已越过高报警值 9.0MPa、未达到高高报警值 9.8MPa，需核对现场表计、趋势曲线和上下游工况。"
      },
      confidence: 82,
      confidenceBand: "needs-review",
      evidenceChain: [
        { kind: "series", label: "出口压力趋势", detail: "当前趋势已越过 9.0MPa 高报警值", pointId: "PT-1" },
        { kind: "vision", label: "泵棚区关键帧", detail: "P-3 泵和出口管线点位可复核", frameId: "FRM-1-CUR" },
        { kind: "rule", label: "安全联锁值提醒", detail: "高报 9.0MPa，高高报 9.8MPa", ruleId: "R-001" },
        { kind: "case", label: "PT6903B 联锁台账", detail: "查看报警阈值口径", docId: "DOC-XT-INTERLOCK", locked: true }
      ],
      summary: "案情摘要：本条用于演示安全联锁仪表在巡检表单中的阈值提醒。"
    },
    {
      id: "DIAG-003",
      objectId: "OBJ-A",
      partId: "PART-2",
      recordId: "REC-002",
      suggestion: {
        outcomeId: "observe",
        label: "建议结论：纳入复查",
        text: "P6 泵高压柜表计及测显装置无显示问题已完成处置，本轮巡检建议复查控制电源、综保报警和操作柱接线状态。"
      },
      confidence: 88,
      confidenceBand: "needs-review",
      evidenceChain: [
        { kind: "series", label: "控制回路状态", detail: "处置后状态恢复，作为复查对照", pointId: "PT-3" },
        { kind: "vision", label: "高压柜关键帧", detail: "柜面表计与测显装置可复核", frameId: "FRM-2-CUR" },
        { kind: "rule", label: "配电间复查要求", detail: "已处置问题需关注控制电源和综保报警", ruleId: "R-002" },
        { kind: "case", label: "P6 高压柜巡检问题", detail: "查看处置经过", docId: "DOC-XT-ISSUE", locked: false }
      ],
      summary: "案情摘要：本条用于演示已处置巡检问题如何在表单中继续提示复查。"
    },
    {
      id: "DIAG-004",
      objectId: "OBJ-A",
      partId: "PART-1",
      recordId: "REC-003",
      suggestion: {
        outcomeId: "observe",
        label: "建议结论：大修前关注",
        text: "P-3 泵计划开展大修，本轮巡检需提前确认泄漏、出口压力、温度、运行情况、油位和外观，并补充基准照片。"
      },
      confidence: 76,
      confidenceBand: "needs-review",
      evidenceChain: [
        { kind: "series", label: "出口压力趋势", detail: "作为大修前运行状态对照", pointId: "PT-1" },
        { kind: "vision", label: "大修前外观关键帧", detail: "泵体与出口管线状态可复核", frameId: "FRM-1-CUR" },
        { kind: "rule", label: "大修前巡检清单", detail: "泄漏、压力、温度、运行、油位、外观逐项确认", ruleId: "R-003" },
        { kind: "case", label: "P-3 泵大修提醒", detail: "查看维检修作业提醒", docId: "DOC-XT-MAINT", locked: false }
      ],
      summary: "案情摘要：本条用于演示近期维检修作业如何进入巡检表单提醒。"
    },
    {
      id: "DIAG-005",
      objectId: "OBJ-A",
      partId: "PART-1",
      recordId: "REC-005",
      suggestion: {
        outcomeId: "observe",
        label: "建议结论：补充留痕",
        text: "油位与外观当前正常，但因 P-3 泵即将大修，建议补充大修前基准照片，便于后续对照。"
      },
      confidence: 73,
      confidenceBand: "needs-review",
      evidenceChain: [
        { kind: "series", label: "泵体温度趋势", detail: "辅助判断大修前运行状态", pointId: "PT-2" },
        { kind: "vision", label: "泵体外观关键帧", detail: "外观基准可作为后续对照", frameId: "FRM-1-CUR" },
        { kind: "rule", label: "大修前留痕要求", detail: "正常项也需保留基准照片", ruleId: "R-003" },
        { kind: "case", label: "P-3 泵大修提醒", detail: "查看维检修作业提醒", docId: "DOC-XT-MAINT", locked: false }
      ],
      summary: "案情摘要：本条用于演示正常巡检项和近期检修提醒的轻量关联。"
    },
    {
      id: "DIAG-002",
      objectId: "OBJ-B",
      partId: "PART-1",
      recordId: "REC-004",
      suggestion: {
        outcomeId: "fix",
        label: "建议结论：确认异常",
        text: "AI 结论：当前出口压力趋势与已归档的相似异常案例一致，可引用历史复核路径快速确认。"
      },
      confidence: 91,
      confidenceBand: "high",
      evidenceChain: [
        { kind: "series", label: "出口压力趋势", detail: "主测点持续抬升", pointId: "PT-1" },
        { kind: "vision", label: "泵棚区关键帧", detail: "目标区域需人工复核", frameId: "FRM-1-CUR" },
        { kind: "rule", label: "安全联锁值提醒", detail: "命中趋势与联锁阈值组合条件", ruleId: "R-001" },
        { kind: "case", label: "相似压力异常案例已命中", detail: "引用本轮归档报告", docId: "DOC-CASE", locked: true }
      ],
      summary: "案情摘要：二次命中演示用。归档后本条的置信度与依据链会体现历史案例复用。"
    }
  ],

  rules: [
    {
      id: "R-001",
      title: "安全联锁仪表巡检提醒",
      text: "安全联锁相关仪表应展示报警阈值，巡检时同步核对现场表计、系统趋势、上下游工况和泄漏迹象；接近报警值时升级复核。",
      source: "湘潭站 P-3 泵 PT6903B 安全联锁提醒；压力表、差压表操作及维护规程"
    },
    {
      id: "R-002",
      title: "配电间已处置问题复查要求",
      text: "配电间开关柜表计、测显装置或综保报警出现异常并完成处置后，应在后续巡检中复查控制电源、报警状态、接线紧固和柜面显示。",
      source: "湘潭站配电间 P6 泵高压柜巡检问题；巡检管理流程说明"
    },
    {
      id: "R-003",
      title: "维检修前重点巡检提醒",
      text: "近期计划开展大修作业的设备，应在巡检表单中提示泄漏、压力、温度、运行情况、油位和外观检查，并要求补充大修前基准照片和运行工况说明。",
      source: "湘潭站 P-3 泵大修前巡检提醒；巡检管理流程说明"
    }
  ]
};
