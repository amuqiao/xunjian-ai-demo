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
        { kind: "series", label: "泵驱动端振动", detail: "当前 5.82mm/s，越过 4.5mm/s 关注线", pointId: "PT-1" },
        { kind: "vision", label: "联轴器关键帧", detail: "P-1 联轴器和泵驱动端需现场复核", frameId: "FRM-1-CUR" },
        { kind: "rule", label: "不对中诊断规则", detail: "2X 频谱 + 相位差异常 + 振动升高", ruleId: "R-001" },
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
        outcomeId: "observe",
        label: "建议结论：补充复核读数",
        text: "同一巡检项前一日缺少联轴器对中复核读数，建议补充读数或说明未复测原因。"
      },
      confidence: 74,
      confidenceBand: "needs-review",
      evidenceChain: [
        { kind: "series", label: "相位差趋势", detail: "联轴器相位差已进入异常区间", pointId: "PT-2" },
        { kind: "vision", label: "激光对中仪", detail: "调整前读数可作为复核依据", frameId: "FRM-1-CMP" },
        { kind: "rule", label: "对中作业记录要求", detail: "复核应留存调整前后读数", ruleId: "R-002" },
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
        outcomeId: "observe",
        label: "建议结论：继续观察",
        text: "底座基础振动接近关注区，地脚状态未见异常，建议纳入 48 小时趋势复评并与联轴器复核同步观察。"
      },
      confidence: 68,
      confidenceBand: "insufficient",
      evidenceChain: [
        { kind: "series", label: "基础振动趋势", detail: "当前接近关注线但未形成独立异常", pointId: "PT-3" },
        { kind: "vision", label: "底座基础关键帧", detail: "地脚状态需现场确认", frameId: "FRM-2-CUR" },
        { kind: "rule", label: "基础并发证据口径", detail: "作为不对中复核的辅助证据", ruleId: "R-003" },
        { kind: "case", label: "运行状态监测报告", detail: "查看并发证据说明", docId: "DOC-METRIC", locked: false }
      ],
      summary: "案情摘要：本条用于演示正常/关注项如何作为主线异常的辅助证据。"
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
    }
  ]
};
