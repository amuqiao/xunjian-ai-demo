// 领域契约 06：人工复核。这是本 POC 的核心契约。
//
// ---- 为什么用 track 而不是 isMaintenance 布尔量 ----
// pump-demo 的 schema 强制 verdicts 里"恰好有 1 条 isMaintenance:true"（0 条会让
// 归档永远不解锁、2 条会让判断产生歧义）。那条约束在只有一个课题时是对的，但换课题
// 或增加"转专项检修""移交厂家"这类第 4、5 条结论时会直接抛错。track 是路径标签，
// 新增结论只改数据，骨架不动。
//
// ---- 为什么结论存 id 不存 label ----
// pump-demo 的 state.expertVerdict 存的是中文 label，于是数据层到处要 verdictByLabel()
// 反查、schema 还得额外强制 label 不许重复。这里 state.review.outcomeId 存 id。
//
// ---- 四层人工介入 ----
// L0 votes      对 AI 结论表决（采纳 / 修正 / 驳回）
// L1 outcomes   结论 chips，排他单选，驱动整个分支状态机
// L2 fields     结构化补充，随结论动态换（outcomes[].fields 声明用哪几个）
// L3 note       自由文本框 + phrases 常用语快捷追加
//
// 关键不在形态而在后果：divergence.requireNote 让"人工结论 !== AI 建议"时 note 变成
// 必填，这句理由会进报告的分歧段、并回流知识库。不填则执行按钮不可用。
window.DOMAIN_REVIEW = {
  // 恰好 3 条，id 必须是 accept/revise/reject（骨架按 id 决定 L1 是否自动预选）。
  votes: [
    { id: "accept", label: "采纳", hint: "认可 AI 建议，结论自动预选" },
    { id: "revise", label: "修正", hint: "部分认可，需重新选择结论" },
    { id: "reject", label: "驳回", hint: "不认可 AI 建议，需重新选择结论" }
  ],

  outcomes: [
    {
      id: "fix",
      label: "确认异常，转处置",
      hint: "生成处置票卡并进入复测",
      impact: "选定后不再生成观察记录，直接进入处置闭环。",
      track: "treatment",
      fields: ["crew", "window", "riskLevel", "flags"],
      steps: [
        "处置步骤一：确认巡检对象和风险等级",
        "处置步骤二：落实停机挂牌和现场监护",
        "处置步骤三：执行仪表复核或现场处置作业",
        "处置步骤四：恢复运行条件并试运行观察",
        "处置步骤五：完成压力、差压复测",
        "处置步骤六：回填 IMS 闭环记录"
      ],
      executeText: "生成处置票卡",
      executedText: "处置票卡已生成",
      retest: { enable: true, passLabel: "复测通过", failLabel: "不通过，退回复核" },
      unlocksReuse: true,
      archive: {
        categoryId: "cat-case",
        titleTpl: "{{objectLabel}} {{partLabel}} 处置报告",
        caseIdTpl: "CASE-SK-{{date}}-01",
        statusText: "已归档为处置案例，可被后续相似记录命中。"
      }
    },
    {
      id: "observe",
      label: "继续观察",
      hint: "设置观察窗口，不生成处置票卡",
      impact: "选定后仅形成观察记录，不进入处置闭环、不解锁案例复用。",
      track: "closure",
      fields: ["window", "flags"],
      steps: [
        "闭环步骤一：设置观察窗口",
        "闭环步骤二：登记复评条件",
        "闭环步骤三：通知下一班次重点关注",
        "闭环步骤四：形成观察记录"
      ],
      executeText: "确认观察记录",
      executedText: "观察记录已确认",
      retest: { enable: false, passLabel: "", failLabel: "" },
      unlocksReuse: false,
      archive: {
        categoryId: "cat-case",
        titleTpl: "{{objectLabel}} {{partLabel}} 观察记录",
        caseIdTpl: "OBS-SK-{{date}}-01",
        statusText: "已归档为观察记录，不触发案例复用。"
      }
    },
    {
      id: "reject",
      label: "排除误报",
      hint: "记录排除依据并回流模型样本",
      impact: "选定后记录为误报样本，不进入处置闭环、不解锁案例复用。",
      track: "closure",
      fields: ["riskLevel", "flags"],
      steps: [
        "闭环步骤一：登记排除依据",
        "闭环步骤二：标记模型样本",
        "闭环步骤三：形成误报记录"
      ],
      executeText: "确认误报记录",
      executedText: "误报记录已确认",
      retest: { enable: false, passLabel: "", failLabel: "" },
      unlocksReuse: false,
      archive: {
        categoryId: "cat-case",
        titleTpl: "{{objectLabel}} {{partLabel}} 误报反馈",
        caseIdTpl: "FP-SK-{{date}}-01",
        statusText: "已归档为误报样本，用于后续阈值与规则优化。"
      }
    }
  ],

  fields: {
    crew: {
      label: "处置班组",
      type: "select",
      required: true,
      options: [
        { id: "crew-1", label: "站场巡检班组" },
        { id: "crew-2", label: "仪控维护班组" }
      ]
    },
    window: {
      label: "复测窗口",
      type: "select",
      required: true,
      options: [
        { id: "w-24", label: "24 小时" },
        { id: "w-48", label: "48 小时" },
        { id: "w-72", label: "72 小时" }
      ]
    },
    riskLevel: {
      label: "风险等级",
      type: "select",
      required: false,
      options: [
        { id: "risk-high", label: "高" },
        { id: "risk-mid", label: "中" },
        { id: "risk-low", label: "低" }
      ]
    },
    flags: {
      label: "附加动作",
      type: "checkbox",
      required: false,
      options: [
        { id: "flag-handover", label: "通知交接班", default: true },
        { id: "flag-nextround", label: "纳入下轮重点", default: true },
        { id: "flag-report", label: "上报站长", default: false }
      ]
    }
  },

  // L3 文本框上方的常用语。演示现场没人愿意当众打字，点两下 chip 就能凑出一句话，
  // 而输入框本身仍然是真的、愿意打就打。
  phrases: [
    "现场已复核确认。",
    "需申请备件后处理。",
    "建议下一轮巡检重点关注。",
    "已与班组当面交接。"
  ],

  divergence: {
    requireNote: true,
    badgeText: "复核结论与 AI 建议不一致",
    noteHint: "请说明依据，该说明将进入报告并回流模型样本",
    reportSectionId: "divergence"
  },

  notePlaceholder: "填写复核意见（可点上方常用语快速插入）"
};
