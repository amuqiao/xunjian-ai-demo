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
        label: "占位建议结论：确认异常",
        text: "占位 AI 结论正文：主测点越线且视觉帧显示目标偏移，副测点未同步变化。"
      },
      confidence: 82,
      confidenceBand: "needs-review",
      evidenceChain: [
        { kind: "series", label: "占位主测点越线", detail: "越过关注线", pointId: "PT-1" },
        { kind: "vision", label: "占位视觉偏移", detail: "标注框命中目标", frameId: "FRM-1-CUR" },
        { kind: "rule", label: "占位判据 R-001", detail: "命中规则条件", ruleId: "R-001" },
        { kind: "case", label: "占位历史案例", detail: "归档后解锁", docId: "DOC-CASE", locked: true }
      ],
      summary: "占位案情摘要：本轮主线异常，模型给出建议但置信度不足，需人工确认。"
    },
    {
      id: "DIAG-002",
      objectId: "OBJ-B",
      partId: "PART-1",
      recordId: "REC-004",
      suggestion: {
        outcomeId: "fix",
        label: "占位建议结论：确认异常",
        text: "占位 AI 结论正文：特征与本轮已归档案例一致。"
      },
      confidence: 91,
      confidenceBand: "high",
      evidenceChain: [
        { kind: "series", label: "占位主测点越线", detail: "越过关注线", pointId: "PT-1" },
        { kind: "vision", label: "占位视觉偏移", detail: "标注框命中目标", frameId: "FRM-1-CUR" },
        { kind: "rule", label: "占位判据 R-001", detail: "命中规则条件", ruleId: "R-001" },
        { kind: "case", label: "占位历史案例已命中", detail: "引用本轮归档报告", docId: "DOC-CASE", locked: true }
      ],
      summary: "占位案情摘要：二次命中演示用。归档后本条的置信度与依据链会体现历史案例。"
    }
  ],

  rules: [
    {
      id: "R-001",
      title: "占位判据一",
      text: "占位规则正文：当主测点越过关注线且副测点未同步变化时，判为该类异常。",
      source: "占位来源：企业标准 X-000"
    }
  ]
};
