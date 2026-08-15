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
          answer: "占位答案：主测点越过关注线，且视觉关键帧显示目标偏移，副测点未同步变化，符合占位判据 R-001。",
          hit: true,
          hits: [
            { kind: "standard", text: "占位制度 DOC-STD §1.1", docId: "DOC-STD", chunkIndex: 0 },
            { kind: "rule", text: "占位判据 R-001", docId: "DOC-STD", chunkIndex: 1 }
          ]
        },
        {
          id: "wb-q2",
          label: "依据哪些标准?",
          question: "判读依据哪些标准？",
          thinkingText: "正在检索知识库…",
          answer: "占位答案：依据占位制度文档中的阈值条款与判据条款。",
          hit: true,
          hits: [
            { kind: "metric", text: "占位指标口径 DOC-STD §1.2", docId: "DOC-STD", chunkIndex: 2 }
          ]
        },
        {
          id: "wb-q3",
          label: "备件库存够不够?",
          question: "相关备件库存够不够？",
          thinkingText: "正在检索知识库…",
          answer: "占位答案：知识库暂无库存类资料，以下为模型基于历史处置记录的推断，建议人工确认。",
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
          label: "三条结论有什么区别?",
          question: "三条结论分别意味着什么？",
          thinkingText: "正在检索知识库…",
          answer: "占位答案：确认异常进入处置闭环并解锁案例复用；继续观察与排除误报都只形成记录，不生成处置票卡。",
          hit: true,
          hits: [
            { kind: "workcard", text: "占位作业模板 DOC-CARD", docId: "DOC-CARD", chunkIndex: 0 }
          ]
        },
        {
          id: "rv-q2",
          label: "现在该找谁签字?",
          question: "这一步需要谁签字确认？",
          thinkingText: "正在检索知识库…",
          answer: "占位答案：知识库暂无审批权限矩阵，以下为模型推断，建议按现场制度人工确认。",
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
          label: "阈值标准是多少?",
          question: "占位阈值标准是多少？",
          thinkingText: "正在检索知识库…",
          answer: "占位答案：依据占位制度文档，主测点关注线为 4.5 mm/s。",
          hit: true,
          hits: [
            { kind: "standard", text: "占位制度 DOC-STD §1.2", docId: "DOC-STD", chunkIndex: 2 }
          ]
        },
        {
          id: "kb-q2",
          label: "有没有可参考的历史案例?",
          question: "有没有可参考的历史案例？",
          thinkingText: "正在检索知识库…",
          answer: "占位答案：本轮归档的处置报告已进入知识库，可作为同类异常的参考案例。",
          hit: true,
          hits: [
            { kind: "case", text: "占位归档案例 DOC-CASE", docId: "DOC-CASE", chunkIndex: 0 }
          ],
          unlockedBy: "archived"
        },
        {
          id: "kb-q3",
          label: "有没有厂家联系方式?",
          question: "有没有设备厂家的联系方式？",
          thinkingText: "正在检索知识库…",
          answer: "占位答案：知识库暂无厂家通讯类资料，以下为模型推断，建议人工确认。",
          hit: false,
          hits: []
        }
      ]
    }
  ]
};
