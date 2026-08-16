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
          ]
        },
        {
          id: "wb-q3",
          label: "备件库存够不够?",
          question: "相关备件库存够不够？",
          thinkingText: "正在检索知识库…",
          answer: "知识库暂无备件库存和供应商库存类资料，以下只能作为模型推断，建议人工确认库存台账。",
          hit: false,
          hits: []
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
          ]
        },
        {
          id: "rv-q2",
          label: "现在该找谁签字?",
          question: "这一步需要谁签字确认？",
          thinkingText: "正在检索知识库…",
          answer: "知识库暂无审批权限矩阵，以下只能作为模型推断，建议按现场制度和当班负责人要求人工确认。",
          hit: false,
          hits: []
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
          unlockedBy: "archived"
        },
        {
          id: "kb-q3",
          label: "有没有厂家联系方式?",
          question: "有没有设备厂家的联系方式？",
          thinkingText: "正在检索知识库…",
          answer: "知识库暂无厂家通讯录或外协单位联系方式，以下只能作为模型推断，建议人工确认通讯录。",
          hit: false,
          hits: []
        }
      ]
    }
  ]
};
