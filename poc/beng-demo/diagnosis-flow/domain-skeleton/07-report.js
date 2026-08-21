// 领域契约 07：报告模板。
//
// 报告必须是"模板 + 插槽"，不能是静态文本——pump-demo 现在是三套完全静态的
// reportSections，静态文本里没有任何位置能装下人工输入，于是"复核页打的字翻页出现
// 在报告里"这个机关根本无处落地。
//
// showIf 让段落随人的行为出现或消失：
//   （无）        恒显示
//   divergent    人工结论 !== AI 建议时才有
//   retestFailed 复测被退回过才有
//   treatment    结论 track === "treatment" 时才有
//   closure      结论 track === "closure" 时才有
// 因此"采纳"和"驳回"两条支线会产出段数不同的两份报告。如果两次演示的产出一模一样，
// 说明人工介入是装饰，设计就没成立。
//
// slots 是给校验器用的：模板里出现的每个 {{x}} 都必须在 slots 里声明，且 slots 必须
// 是骨架真能提供的那一批（scripts/schema.js 的 PROVIDED_SLOTS）。这防的是"改了模板
// 文案、插槽名打错、页面静默显示 {{reviewNote}} 原文"——那种错不会抛异常。
window.DOMAIN_REPORT = {
  titleTpl: "{{objectLabel}} {{partLabel}} 复核报告",

  // 单机版 demo 使用目录内 PDF 作为"已生成报告"预览。业务方替换报告时只改这里，
  // 不让页面运行时依赖仓库外部目录。
  previewPdf: {
    title: "输油泵智能诊断报告",
    src: "assets/reports/demo-diagnosis-report.pdf",
    filename: "输油泵智能诊断报告.pdf"
  },

  sections: [
    {
      id: "finding",
      title: "一、异常发现",
      status: "warn",
      text: "{{objectLabel}} {{partLabel}} 于 {{date}} 巡检中发现设备状态需复核，记录人 {{inspector}}。"
    },
    {
      id: "evidence",
      title: "二、证据链",
      status: "warn",
      text: "证据链显示告警趋势、视觉判读与知识库依据共同形成复核建议，需由人工确认是否生成票卡。"
    },
    {
      id: "ai",
      title: "三、AI 建议",
      status: "warn",
      text: "{{aiConclusion}}（置信度 {{confidence}}%）"
    },
    {
      id: "review",
      title: "四、专家复核",
      status: "ok",
      text: "复核人 {{reviewerName}}（{{reviewerRole}}）结论：{{outcomeLabel}}。{{reviewNote}}"
    },
    {
      id: "divergence",
      title: "五、复核分歧",
      status: "warn",
      text: "本次复核结论与 AI 建议不一致，依据：{{divergenceReason}} 该分歧已记录为模型反馈样本。",
      showIf: "divergent"
    },
    {
      id: "retestFail",
      title: "复测未通过记录",
      status: "danger",
      text: "本轮复测未通过，需退回复核并重新确认对中处置或观察结论。",
      showIf: "retestFailed"
    },
    {
      id: "treatment",
      title: "六、处置与复测",
      status: "ok",
      text: "由 {{crew}} 执行专项复核/处置票卡，复核窗口 {{window}}，风险等级 {{riskLevel}}，复测结果 {{retestResult}}。",
      showIf: "treatment"
    },
    {
      id: "closure",
      title: "六、闭环记录",
      status: "ok",
      text: "本轮形成观察闭环记录，观察窗口 {{window}}，不生成处置票卡，后续班次继续关注该设备趋势。",
      showIf: "closure"
    },
    {
      id: "archive",
      title: "七、归档与复用",
      status: "ok",
      text: "本报告归档为 {{caseId}}，后续相似故障复检记录可命中引用。"
    }
  ],

  slots: [
    "objectLabel", "partLabel", "date", "inspector",
    "aiConclusion", "confidence",
    "reviewerName", "reviewerRole", "outcomeLabel", "reviewNote", "divergenceReason",
    "crew", "window", "riskLevel", "retestResult",
    "caseId"
  ]
};
