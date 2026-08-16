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
        text: "AI 结论：差压趋势异常与工业电视关键帧形成交叉证据，副测点未同步变化，需要人工确认后转入处置闭环。"
      },
      confidence: 82,
      confidenceBand: "needs-review",
      evidenceChain: [
        { kind: "series", label: "差压趋势异常", detail: "主测点持续抬升", pointId: "PT-1" },
        { kind: "vision", label: "工业电视关键帧", detail: "目标区域需人工复核", frameId: "FRM-1-CUR" },
        { kind: "rule", label: "交叉复核判据", detail: "命中时序与视觉组合条件", ruleId: "R-001" },
        { kind: "case", label: "差压异常归档案例", detail: "归档后解锁", docId: "DOC-CASE", locked: true }
      ],
      summary: "案情摘要：本轮巡检发现差压趋势异常，模型给出确认异常建议，但置信度不足，需人工复核。"
    },
    {
      id: "DIAG-002",
      objectId: "OBJ-B",
      partId: "PART-1",
      recordId: "REC-004",
      suggestion: {
        outcomeId: "fix",
        label: "建议结论：确认异常",
        text: "AI 结论：当前特征与已归档的差压趋势异常案例一致，可引用历史复核路径快速确认。"
      },
      confidence: 91,
      confidenceBand: "high",
      evidenceChain: [
        { kind: "series", label: "差压趋势异常", detail: "主测点持续抬升", pointId: "PT-1" },
        { kind: "vision", label: "工业电视关键帧", detail: "目标区域需人工复核", frameId: "FRM-1-CUR" },
        { kind: "rule", label: "交叉复核判据", detail: "命中时序与视觉组合条件", ruleId: "R-001" },
        { kind: "case", label: "差压异常案例已命中", detail: "引用本轮归档报告", docId: "DOC-CASE", locked: true }
      ],
      summary: "案情摘要：二次命中演示用。归档后本条的置信度与依据链会体现历史案例复用。"
    }
  ],

  rules: [
    {
      id: "R-001",
      title: "差压异常交叉复核判据",
      text: "当差压主测点持续抬升，副测点未同步变化，且工业电视关键帧未发现外部作业干扰时，应进入人工复核并补充复测记录。",
      source: "巡检管理流程说明；压力表、差压表操作及维护规程；工业电视系统操作规程"
    }
  ]
};
