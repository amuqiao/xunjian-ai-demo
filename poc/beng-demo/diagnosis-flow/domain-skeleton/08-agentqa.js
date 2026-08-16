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
      entryText: "综合巡检记录、时序、视觉和知识依据回答 P-1 泵诊断问题。",
      kicker: "诊断工作台",
      summary: "围绕 P-1 疑似不对中事件解释证据、复核重点和闭环边界。",
      emptyText: "选择左侧任一预设问题开始。",
      fallbackAnswer: "这个问题需要接入实时数据，本演示环境暂不支持，可以试试左侧的预设问题。",
      questions: [
        {
          id: "wb-q1",
          label: "为什么疑似不对中?",
          question: "为什么判断 P-1 疑似不对中？",
          thinkingText: "正在检索知识库…",
          answer: "P-1 泵驱动端振动升至 5.82mm/s，联轴器相位差约 81°，并出现 2X 频谱成分突出；底座基础振动偏大作为并发证据，因此建议进入联轴器不对中复核。",
          hit: true,
          hits: [
            { kind: "rule", text: "不对中诊断专家规则", docId: "DOC-STD", chunkIndex: 1 },
            { kind: "metric", text: "振动关注线和复核口径", docId: "DOC-STD", chunkIndex: 2 },
            { kind: "current", text: "P-1 当前时序与巡检记录", docId: "DOC-CASE", chunkIndex: 0 }
          ]
        },
        {
          id: "wb-q2",
          label: "现场先复核什么?",
          question: "现场复核优先看什么？",
          thinkingText: "正在检索知识库…",
          answer: "优先复核联轴器对中状态、激光对中仪调整前后读数、泵驱动端轴承振动、底座地脚螺栓和管道约束。复核结果应与趋势、频谱和现场照片一起进入专家确认。",
          hit: true,
          hits: [
            { kind: "workcard", text: "输油泵对中作业卡", docId: "DOC-CARD", chunkIndex: 1 },
            { kind: "rule", text: "相位差和 2X 频谱口径", docId: "DOC-STD", chunkIndex: 1 }
          ]
        },
        {
          id: "wb-q3",
          label: "5.82 和 81°说明什么?",
          question: "振动 5.82mm/s、相位差 81° 说明什么？",
          thinkingText: "正在检索知识库…",
          answer: "5.82mm/s 已越过 4.5mm/s 关注线，81° 相位差也超过演示关注区间；两者同时出现时，不能只看人工“未见异常”记录，应进入联轴器不对中复核。",
          hit: true,
          hits: [
            { kind: "metric", text: "振动关注线", docId: "DOC-STD", chunkIndex: 2 },
            { kind: "case", text: "P-1 当前异常特征", docId: "DOC-CASE", chunkIndex: 0 }
          ]
        },
        {
          id: "wb-q4",
          label: "要生成处置票卡吗?",
          question: "是否需要生成对中处置票卡？",
          thinkingText: "正在检索知识库…",
          answer: "不能由 Agent 直接决定。当前知识库能说明对中作业内容和复核边界，但是否生成处置票卡还需要专家确认停机窗口、安全措施和现场作业条件。",
          hit: false,
          hits: []
        },
        {
          id: "wb-q5",
          label: "复测看哪些指标?",
          question: "处置后复测要看哪些指标？",
          thinkingText: "正在检索知识库…",
          answer: "重点复测泵驱动端振动、联轴器相位差、基础振动和现场外观状态，并把调整前后数值回填处置票卡；P-1 案例中振动由 5.82mm/s 回落至 1.80mm/s，可作为演示闭环参考。",
          hit: true,
          hits: [
            { kind: "workcard", text: "作业完成后的复测要求", docId: "DOC-CARD", chunkIndex: 2 },
            { kind: "case", text: "P-1 处置后复测结果", docId: "DOC-CASE", chunkIndex: 2 }
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
          label: "能直接维修吗?",
          question: "命中不对中规则后能否直接生成维修结论？",
          thinkingText: "正在检索知识库…",
          answer: "不能。AI 只负责组织证据和建议，确认异常、继续观察或排除误报必须由专家结合现场复测、停机窗口和安全边界决定。",
          hit: true,
          hits: [
            { kind: "standard", text: "专家复核边界", docId: "DOC-STD", chunkIndex: 0 },
            { kind: "workcard", text: "对中作业执行前置条件", docId: "DOC-CARD", chunkIndex: 0 }
          ]
        },
        {
          id: "rv-q2",
          label: "现在该找谁签字?",
          question: "这一步需要谁签字确认？",
          thinkingText: "正在检索知识库…",
          answer: "知识库暂无审批权限矩阵。演示中建议由设备管理工程师复核、站场班组长确认，真实审批仍按现场制度人工确认。",
          hit: false,
          hits: []
        },
        {
          id: "rv-q3",
          label: "归档后怎么复用?",
          question: "归档后这个案例怎么复用？",
          thinkingText: "正在检索知识库…",
          answer: "归档后，相似复检记录可以复用 P-1 的复核路径、作业清单和报告结构；是否确认不对中仍需依据当次现场复核重新判断。",
          hit: true,
          hits: [
            { kind: "case", text: "归档案例复用边界", docId: "DOC-CASE", chunkIndex: 3 }
          ],
          unlockedBy: "archived"
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
          label: "不对中依据是什么?",
          question: "输油泵不对中的判定依据是什么？",
          thinkingText: "正在检索知识库…",
          answer: "本演示按泵驱动端振动升高、联轴器相位差异常、2X 频谱突出三类证据组织不对中复核；底座基础振动和管道约束作为辅助排查项。",
          hit: true,
          hits: [
            { kind: "standard", text: "不对中复核边界", docId: "DOC-STD", chunkIndex: 1 },
            { kind: "case", text: "P-1 当前异常特征", docId: "DOC-CASE", chunkIndex: 0 }
          ]
        },
        {
          id: "kb-q2",
          label: "作业卡记录什么?",
          question: "对中作业卡需要记录哪些内容？",
          thinkingText: "正在检索知识库…",
          answer: "对中作业卡应记录停机挂牌、风险交底、激光对中仪调整前读数、联轴器相位状态、地脚垫片调整情况，以及作业完成后的振动、相位差和基础振动复测结果。",
          hit: true,
          hits: [
            { kind: "workcard", text: "作业前条件", docId: "DOC-CARD", chunkIndex: 0 },
            { kind: "workcard", text: "调整过程记录", docId: "DOC-CARD", chunkIndex: 1 },
            { kind: "workcard", text: "复测与回填", docId: "DOC-CARD", chunkIndex: 2 }
          ]
        },
        {
          id: "kb-q3",
          label: "阈值是多少?",
          question: "泵驱动端振动和相位差阈值是多少？",
          thinkingText: "正在检索知识库…",
          answer: "演示口径中泵驱动端振动关注线为 4.5mm/s；P-1 当前 5.82mm/s 已越线，联轴器相位差约 81°，需要结合 2X 频谱和现场复测综合判断。",
          hit: true,
          hits: [
            { kind: "metric", text: "泵驱动端振动关注线", docId: "DOC-STD", chunkIndex: 2 },
            { kind: "case", text: "P-1 当前时序与巡检记录", docId: "DOC-CASE", chunkIndex: 0 }
          ]
        },
        {
          id: "kb-q4",
          label: "案例能复用什么?",
          question: "P-1 归档案例后续能复用什么？",
          thinkingText: "正在检索知识库…",
          answer: "P-1 案例归档后，后续相似复检可以复用复核路径、作业清单、复测指标和报告结构；但是否确认不对中仍需依据当次现场复核重新判断。",
          hit: true,
          hits: [
            { kind: "case", text: "P-1 不对中归档案例", docId: "DOC-CASE", chunkIndex: 3 }
          ]
        },
        {
          id: "kb-q5",
          label: "有哪些作业资料?",
          question: "机械密封、轴承、联轴器相关作业资料有哪些？",
          thinkingText: "正在检索知识库…",
          answer: "当前知识库已整理对中作业卡作为主线资料，并在知识图谱中保留轴承拆装、机械密封更换、联轴器中间节拆装、润滑油更换等作业模板条目；诊断台本轮只展开对中作业卡正文。",
          hit: false,
          hits: []
        }
      ]
    }
  ]
};
