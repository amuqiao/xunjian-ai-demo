// 领域契约 08：Agent 语料。
//
// 三个上下文（工作台 / 复核 / 知识库）共用同一个 AgentPanel 组件，只换 contextId。
// 组件本身不读领域数据，由场景层把对应 context 传进去。
//
// ---- 为什么一定要留"未命中"的问题 ----
// 全命中反而假。hit:false 的问题让 Agent 明说"知识库暂无直接依据，以下为模型推断，
// 建议人工确认"——既真实，又顺势把"所以下一步要人工复核"讲出来。每个上下文至少要
// 有 1 条 hit:false，schema 强制。
//
// ---- unlockedBy ----
// "archived" 表示这条问题在归档完成前不出现。它承载二次命中包袱：归档后 Agent 多出
// 一条能引用刚归档报告的问题。
//
// ---- skillOptions ----
// 这不是实时工具调用，而是演示型"Skill 增强"：默认只显示基础答案，点击某个
// Skill 标签后切换为该技能视角下的完整增强回答。它只改变答案表达，不改变命中依据
// 和流程状态。
window.DOMAIN_AGENTQA = {
  contexts: [
    {
      id: "workbench",
      entryTitle: "Agent 助手",
      entryText: "综合报表、时序、视觉和知识依据回答本轮诊断问题。",
      kicker: "诊断工作台",
      summary: "以下问答为预设内容，不接入实时检索。",
      emptyText: "选择左侧任一预设问题开始。",
      fallbackAnswer: "这个问题需要接入实时数据，本演示环境暂不支持，可以试试左侧的预设问题。",
      questions: [
        {
          id: "wb-q1",
          label: "这条异常怎么判的?",
          question: "这条异常是怎么判出来的？",
          thinkingText: "正在检索知识库…",
          answer: "当前判断来自多源交叉复核：差压趋势接近关注线，规程要求结合历史曲线、相关测点和现场工况比对；同时工业电视关键帧可作为辅助证据，支撑进入人工复核。",
          hit: true,
          hits: [
            { kind: "rule", text: "压力表、差压表复核要求", docId: "DOC-CARD", chunkIndex: 1 },
            { kind: "metric", text: "工业电视辅助复核依据", docId: "DOC-METRIC", chunkIndex: 1 }
          ],
          skillOptions: [
            { id: "multi-evidence", label: "多源证据复核", enhancedAnswer: "当前判断来自多源交叉复核：差压趋势接近关注线，规程要求结合历史曲线、相关测点和现场工况比对；工业电视关键帧可作为辅助证据。启用多源证据复核后，系统会把差压趋势、工业电视关键帧、巡检记录和规程段落合并判断，避免只看单点异常。" },
            { id: "review-path", label: "复核路径生成", enhancedAnswer: "当前异常建议进入人工复核。启用复核路径生成后，建议先核对上下游相关测点，再补充现场复测值、关键帧截图和运行工况说明，最后由专家确认是否转处置闭环。" }
          ]
        },
        {
          id: "wb-q2",
          label: "依据哪些资料?",
          question: "判读依据哪些标准？",
          thinkingText: "正在检索知识库…",
          answer: "主要依据巡检管理流程说明和压力表、差压表操作及维护规程：巡检任务通过 IMS 留痕，现场复核需要把时序、工况、视频和复测记录放在一起判断。",
          hit: true,
          hits: [
            { kind: "standard", text: "IMS 下发与问题记录", docId: "DOC-STD", chunkIndex: 2 },
            { kind: "rule", text: "复测与处置记录", docId: "DOC-CARD", chunkIndex: 2 }
          ],
          skillOptions: [
            { id: "kb-search", label: "知识库检索", enhancedAnswer: "主要依据巡检管理流程说明和压力表、差压表操作及维护规程。启用知识库检索后，系统把 IMS 下发、问题记录、复测留痕和差压表维护规程串成同一条判读依据链，便于评委看到答案不是孤立生成。" },
            { id: "caliber-align", label: "口径对齐", enhancedAnswer: "判读依据包括系统提醒、现场复核和人工确认三层口径。启用口径对齐后，回答会明确区分：系统负责提示异常，现场负责补充工况和复测，专家负责最终确认和归档。" }
          ]
        },
        {
          id: "wb-q3",
          label: "备件库存够不够?",
          question: "相关备件库存够不够？",
          thinkingText: "正在检索知识库…",
          answer: "知识库暂无备件库存和供应商库存类资料，以下只能作为模型推断，建议人工确认库存台账。",
          hit: false,
          hits: [],
          skillOptions: [
            { id: "knowledge-boundary", label: "知识边界识别", enhancedAnswer: "知识库暂无备件库存和供应商库存类资料。启用知识边界识别后，Agent 会明确说明当前知识库只覆盖巡检规程、案例和作业提醒，不覆盖备件库存，因此不能把推断当成库存结论，必须人工核验台账。" }
          ]
        },
        {
          id: "wb-q4",
          label: "区域近期重点问题?",
          question: "湘潭站这个区域近期有哪些重点巡检问题？",
          thinkingText: "正在检索湘潭站巡检问题记录…",
          answer: "湘潭站配电间近期重点关注 P6 泵高压柜表计及测显装置无显示问题：4月24日巡检发现后，排查到二次回路控制电源空开跳闸、微机综保报控制回路断线，最终确认为操作柱接线松动并已修复。建议巡检时继续关注控制电源、综保报警、测显装置和操作柱接线状态。",
          hit: true,
          hits: [
            { kind: "case", text: "P6 泵高压柜无显示巡检记录", docId: "DOC-XT-ISSUE", chunkIndex: 0 },
            { kind: "case", text: "控制回路断线与处置结果", docId: "DOC-XT-ISSUE", chunkIndex: 1 },
            { kind: "case", text: "操作柱接线松动已修复", docId: "DOC-XT-ISSUE", chunkIndex: 2 }
          ],
          skillOptions: [
            { id: "history-match", label: "历史问题比对", enhancedAnswer: "湘潭站配电间近期重点关注 P6 泵高压柜表计及测显装置无显示问题。启用历史问题比对后，系统会按区域、设备、故障现象和处置结果聚合为同类问题提醒，突出控制电源空开跳闸、综保控制回路断线和操作柱接线松动这条风险链。" },
            { id: "inspection-checklist", label: "巡检清单生成", enhancedAnswer: "该区域巡检建议继续关注 P6 高压柜。启用巡检清单生成后，本轮重点检查控制电源空开、微机综保报警、测显装置显示、操作柱接线状态，并补充复测照片和处置记录。" }
          ]
        },
        {
          id: "wb-q5",
          label: "联锁报警值是多少?",
          question: "P-3 泵出口压力变送器 PT6903B 的安全联锁报警值是多少？",
          thinkingText: "正在检索联锁仪表台账…",
          answer: "湘潭站泵棚区 P-3 泵出口管线压力变送器 PT6903B 的高报警值为 9.0MPa，高高报警值为 9.8MPa。巡检发现压力接近阈值、波动异常或现场读数与系统读数不一致时，应升级复核。",
          hit: true,
          hits: [
            { kind: "standard", text: "PT6903B 仪表位号与区域", docId: "DOC-XT-INTERLOCK", chunkIndex: 0 },
            { kind: "standard", text: "高报 9.0MPa / 高高报 9.8MPa", docId: "DOC-XT-INTERLOCK", chunkIndex: 1 }
          ],
          skillOptions: [
            { id: "interlock-threshold", label: "联锁阈值核查", enhancedAnswer: "湘潭站泵棚区 P-3 泵出口管线压力变送器 PT6903B 属于安全联锁相关仪表。启用联锁阈值核查后，回答会直接补齐阈值：高报警值 9.0MPa，高高报警值 9.8MPa；接近阈值或读数不一致时应升级复核。" },
            { id: "inspection-advice", label: "巡检建议生成", enhancedAnswer: "PT6903B 高报 9.0MPa、高高报 9.8MPa。启用巡检建议生成后，除阈值外还会提示同步核对压力趋势、上下游工况、现场泄漏迹象、仪表引压管状态和现场表计一致性。" }
          ]
        },
        {
          id: "wb-q6",
          label: "近期有什么检修提醒?",
          question: "湘潭站泵棚区近期有没有维检修作业需要加强巡检？",
          thinkingText: "正在检索近期维检修作业提醒…",
          answer: "湘潭站泵棚区计划于 2026年7月28日开展 P-3 泵大修作业。大修前巡检应加强泄漏检查、出口管线压力和温度检查、运行情况确认、油位检查和外观检查；同时补充大修前基准照片、复测数据和运行工况说明。",
          hit: true,
          hits: [
            { kind: "workcard", text: "P-3 泵 2026年7月28日大修作业", docId: "DOC-XT-MAINT", chunkIndex: 0 },
            { kind: "workcard", text: "大修前巡检重点", docId: "DOC-XT-MAINT", chunkIndex: 1 },
            { kind: "workcard", text: "异常记录要求", docId: "DOC-XT-MAINT", chunkIndex: 2 }
          ],
          skillOptions: [
            { id: "maintenance-reminder", label: "维检修提醒", enhancedAnswer: "湘潭站泵棚区计划于 2026年7月28日开展 P-3 泵大修作业。启用维检修提醒后，系统会把作业时间、设备对象和巡检强化项合并成区域提醒，提示巡检人员在作业前增加关注频次。" },
            { id: "risk-checklist", label: "风险检查清单", enhancedAnswer: "P-3 泵大修前应加强泄漏、出口压力、温度、运行情况、油位和外观检查。启用风险检查清单后，还会提示补充大修前基准照片、复测数据和运行工况说明，便于大修后对照。" }
          ]
        }
      ]
    },
    {
      id: "review",
      entryTitle: "Agent 助手",
      entryText: "回答复核阶段的边界与依据问题。",
      kicker: "人工复核",
      summary: "以下问答为预设内容，不接入实时检索。",
      emptyText: "选择左侧任一预设问题开始。",
      fallbackAnswer: "这个问题需要接入实时数据，本演示环境暂不支持，可以试试左侧的预设问题。",
      questions: [
        {
          id: "rv-q1",
          label: "确认后怎么闭环?",
          question: "确认异常后怎么进入处置闭环？",
          thinkingText: "正在检索知识库…",
          answer: "确认异常后应记录复测前后数值、设备运行状态、处置措施和复核人意见；需要转处置时，同步生成作业票卡或问题整改记录，并在归档后支撑后续相似案例复用。",
          hit: true,
          hits: [
            { kind: "workcard", text: "处置与复测留痕要求", docId: "DOC-CARD", chunkIndex: 2 }
          ],
          skillOptions: [
            { id: "closure-advice", label: "闭环处置建议", enhancedAnswer: "确认异常后应记录复测前后数值、设备运行状态、处置措施和复核人意见。启用闭环处置建议后，回答会进一步整理为闭环清单：形成问题记录、同步作业票卡或整改任务、复测确认、归档为后续相似案例。" }
          ]
        },
        {
          id: "rv-q2",
          label: "现在该找谁签字?",
          question: "这一步需要谁签字确认？",
          thinkingText: "正在检索知识库…",
          answer: "知识库暂无审批权限矩阵，以下只能作为模型推断，建议按现场制度和当班负责人要求人工确认。",
          hit: false,
          hits: [],
          skillOptions: [
            { id: "knowledge-boundary", label: "知识边界识别", enhancedAnswer: "知识库暂无审批权限矩阵。启用知识边界识别后，Agent 会明确说明当前演示知识库未接入签字权限数据，只能给出流程提醒，不能替代现场制度和当班负责人确认。" }
          ]
        }
      ]
    },
    {
      id: "knowledge",
      entryTitle: "Agent 助手",
      entryText: "针对知识库内容提问，答案带可跳转的引用。",
      kicker: "知识库",
      summary: "以下问答为预设内容，不接入实时检索。",
      emptyText: "选择左侧任一预设问题开始。",
      fallbackAnswer: "这个问题需要接入实时数据，本演示环境暂不支持，可以试试左侧的预设问题。",
      questions: [
        {
          id: "kb-q1",
          label: "复核依据有哪些?",
          question: "差压趋势异常复核要看哪些依据？",
          thinkingText: "正在检索知识库…",
          answer: "需要同时查看历史曲线、上下游相关测点、现场工况和工业电视关键帧，确认后还要记录复测前后数值、处置措施和复核意见。",
          hit: true,
          hits: [
            { kind: "rule", text: "压力表、差压表复核要求", docId: "DOC-CARD", chunkIndex: 1 },
            { kind: "metric", text: "工业电视关键帧复核", docId: "DOC-METRIC", chunkIndex: 1 }
          ],
          skillOptions: [
            { id: "kb-search", label: "知识库检索", enhancedAnswer: "差压趋势异常复核需要同时查看历史曲线、上下游相关测点、现场工况和工业电视关键帧。启用知识库检索后，回答会明确命中规程条款和工业电视复核口径，并保留可点击段落依据。" },
            { id: "multi-evidence", label: "多源证据复核", enhancedAnswer: "复核时不能只看差压单点。启用多源证据复核后，系统会把时序曲线、现场工况、视频关键帧、复测记录和处置措施合并为一条复核路径，确认后再进入人工复核和归档。" }
          ]
        },
        {
          id: "kb-q2",
          label: "有没有可参考的历史案例?",
          question: "有没有可参考的历史案例？",
          thinkingText: "正在检索知识库…",
          answer: "本轮归档的差压趋势异常案例已进入知识库，后续相似记录可引用它来提示复核路径、证据组合和处置留痕要求。",
          hit: true,
          hits: [
            { kind: "case", text: "差压趋势异常归档案例", docId: "DOC-CASE", chunkIndex: 3 }
          ],
          skillOptions: [
            { id: "case-reuse", label: "相似案例复用", enhancedAnswer: "本轮归档的差压趋势异常案例已进入知识库。启用相似案例复用后，后续相似记录可直接引用这份案例作为模板，复用复核路径、证据组合、处置留痕和复盘口径。" }
          ],
          unlockedBy: "archived"
        },
        {
          id: "kb-q3",
          label: "有没有厂家联系方式?",
          question: "有没有设备厂家的联系方式？",
          thinkingText: "正在检索知识库…",
          answer: "知识库暂无厂家通讯录或外协单位联系方式，以下只能作为模型推断，建议人工确认通讯录。",
          hit: false,
          hits: [],
          skillOptions: [
            { id: "knowledge-boundary", label: "知识边界识别", enhancedAnswer: "知识库暂无厂家通讯录或外协单位联系方式。启用知识边界识别后，Agent 会明确提示当前知识库未包含联系方式，不能输出疑似号码或联系人，必须人工确认通讯录。" }
          ]
        },
        {
          id: "kb-q4",
          label: "P6 高压柜问题怎么处置?",
          question: "湘潭站 P6 泵高压柜表计无显示问题是怎么处置的？",
          thinkingText: "正在检索湘潭站巡检案例…",
          answer: "该问题发生在 4月24日湘潭站配电间巡检中，表现为 P6 泵高压柜开关柜上表计及测显装置无显示。排查发现高压柜二次回路控制电源空开跳闸，综保报控制回路断线，最终确认为操作柱接线松动，完成修复。",
          hit: true,
          hits: [
            { kind: "case", text: "表计及测显装置无显示", docId: "DOC-XT-ISSUE", chunkIndex: 0 },
            { kind: "case", text: "控制电源空开跳闸与综保报警", docId: "DOC-XT-ISSUE", chunkIndex: 1 },
            { kind: "case", text: "操作柱接线松动处置结果", docId: "DOC-XT-ISSUE", chunkIndex: 2 }
          ],
          skillOptions: [
            { id: "history-match", label: "历史问题比对", enhancedAnswer: "湘潭站 P6 泵高压柜表计无显示问题发生在配电间巡检中。启用历史问题比对后，系统会按区域、设备和故障现象定位到这条典型案例，并提示后续巡检继续关注高压柜控制回路。" },
            { id: "process-replay", label: "处置过程还原", enhancedAnswer: "该问题的闭环链路是：巡检发现表计及测显装置无显示，排查到控制电源空开跳闸和综保控制回路断线，最终确认为操作柱接线松动并修复。启用处置过程还原后，回答会按发现、排查、原因、处置四步展开。" }
          ]
        },
        {
          id: "kb-q5",
          label: "PT6903B 阈值是多少?",
          question: "PT6903B 的高报和高高报阈值是多少？",
          thinkingText: "正在检索联锁阈值资料…",
          answer: "PT6903B 是湘潭站泵棚区 P-3 泵出口管线压力变送器。系统提醒高报警值 9.0MPa、高高报警值 9.8MPa；巡检时应同时核对压力趋势、上下游工况、泄漏迹象和仪表引压管状态。",
          hit: true,
          hits: [
            { kind: "standard", text: "PT6903B 仪表位号", docId: "DOC-XT-INTERLOCK", chunkIndex: 0 },
            { kind: "standard", text: "报警阈值与升级复核", docId: "DOC-XT-INTERLOCK", chunkIndex: 1 },
            { kind: "rule", text: "联锁仪表巡检复核项", docId: "DOC-XT-INTERLOCK", chunkIndex: 2 }
          ],
          skillOptions: [
            { id: "interlock-threshold", label: "联锁阈值核查", enhancedAnswer: "PT6903B 是湘潭站泵棚区 P-3 泵出口管线压力变送器。启用联锁阈值核查后，回答会从位号台账中提取安全联锁阈值：高报 9.0MPa，高高报 9.8MPa，并提示接近阈值时升级复核。" },
            { id: "inspection-advice", label: "巡检建议生成", enhancedAnswer: "PT6903B 的高报和高高报阈值分别为 9.0MPa、9.8MPa。启用巡检建议生成后，回答会扩展为现场动作：核对压力趋势、上下游工况、泄漏迹象、引压管状态和现场表计一致性。" }
          ]
        },
        {
          id: "kb-q6",
          label: "P-3 大修前查什么?",
          question: "P-3 泵大修前巡检要重点检查哪些内容？",
          thinkingText: "正在检索维检修提醒…",
          answer: "P-3 泵计划于 2026年7月28日开展大修，巡检重点包括泄漏、出口管线压力、温度、运行情况、油位和外观。巡检人员应补充大修前基准照片、复测数据和运行工况说明，便于大修后对照。",
          hit: true,
          hits: [
            { kind: "workcard", text: "P-3 泵大修作业提醒", docId: "DOC-XT-MAINT", chunkIndex: 0 },
            { kind: "workcard", text: "大修前巡检重点清单", docId: "DOC-XT-MAINT", chunkIndex: 1 },
            { kind: "workcard", text: "异常留痕要求", docId: "DOC-XT-MAINT", chunkIndex: 2 }
          ],
          skillOptions: [
            { id: "maintenance-reminder", label: "维检修提醒", enhancedAnswer: "P-3 泵计划于 2026年7月28日开展大修。启用维检修提醒后，系统会把大修计划转成巡检前置提醒，要求巡检人员在作业前重点关注泵棚区运行状态。" },
            { id: "inspection-advice", label: "巡检建议生成", enhancedAnswer: "P-3 泵大修前巡检要重点检查泄漏、出口管线压力、温度、运行情况、油位和外观。启用巡检建议生成后，还会补充大修前基准照片、复测数据和工况说明，方便大修后对照。" }
          ]
        }
      ]
    }
  ]
};
