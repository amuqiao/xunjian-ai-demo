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
          label: "为什么要复核?",
          question: "为什么这个巡检项需要进入人工复核？",
          thinkingText: "正在检索知识库…",
          answer: "当前记录虽然人工巡检写为未见异常，但告警数据已出现越线，且模型证据指向联轴器不对中风险。Agent 只能组织证据，不能替代专家结论，因此建议进入人工复核。",
          hit: true,
          hits: [
            { kind: "rule", text: "不对中诊断专家规则", docId: "DOC-STD", chunkIndex: 1 },
            { kind: "current", text: "P-1 当前时序与巡检记录", docId: "DOC-CASE", chunkIndex: 0 }
          ]
        },
        {
          id: "wb-q2",
          label: "更像哪类故障?",
          question: "当前更像哪一类输油泵故障？",
          thinkingText: "正在检索知识库…",
          answer: "当前主线更像联轴器不对中：泵驱动端振动升高、相位差异常、2X 频谱突出。新增 RAG 示例覆盖 2号轴承振动异常：时序先发现振动上升，视觉排除泄漏和明显不对中，再检索相似轴承剥落案例。",
          hit: true,
          hits: [
            { kind: "rule", text: "联轴器不对中复核口径", docId: "DOC-STD", chunkIndex: 1 },
            { kind: "workcard", text: "机械密封泄漏复核卡", docId: "DOC-SEAL-CARD", chunkIndex: 1 },
            { kind: "case", text: "2号轴承内圈剥落相似案例", docId: "DOC-BEARING-SPALL-CASE", chunkIndex: 0 },
            { kind: "rule", text: "压力波动与汽蚀复核说明", docId: "DOC-CAVITATION-RULE", chunkIndex: 1 }
          ]
        },
        {
          id: "wb-q3",
          label: "告警数据说明?",
          question: "告警数据主要说明了什么？",
          thinkingText: "正在检索知识库…",
          answer: "告警数据说明当前状态已经超过演示关注线，不能只依赖现场“未见异常”的文字记录。对于 P-1 主线，泵驱动端振动 5.82mm/s 已越过 4.5mm/s 关注线，应结合相位差和 2X 频谱复核。",
          hit: true,
          hits: [
            { kind: "metric", text: "振动关注线和复核口径", docId: "DOC-STD", chunkIndex: 2 },
            { kind: "current", text: "P-1 当前异常特征", docId: "DOC-CASE", chunkIndex: 0 }
          ]
        },
        {
          id: "wb-q4",
          label: "视觉证据怎么看?",
          question: "视觉模型证据应该怎么看？",
          thinkingText: "正在检索知识库…",
          answer: "视觉证据用于补充现场可见状态，不单独下结论。对于不对中主线，应看联轴器、底座和地脚状态；对于泄漏记录，应看机械密封区域油迹、液滴和泄漏回收口。",
          hit: true,
          hits: [
            { kind: "case", text: "现场照片与复核资料", docId: "DOC-CASE", chunkIndex: 1 },
            { kind: "workcard", text: "机械密封泄漏视觉复核", docId: "DOC-SEAL-CARD", chunkIndex: 0 }
          ]
        },
        {
          id: "wb-q5",
          label: "漏油怎么复核?",
          question: "机械密封漏油类记录应该怎么复核？",
          thinkingText: "正在检索知识库…",
          answer: "应检查密封端面、轴套磨损、冲洗管路、冷却水状态和泄漏回收口；如果视觉模型识别到密封区域油迹，且泄漏告警指数持续越线，应补拍近景并交由人工确认是否生成机械密封票卡。",
          hit: true,
          hits: [
            { kind: "workcard", text: "机械密封泄漏复核项", docId: "DOC-SEAL-CARD", chunkIndex: 0 },
            { kind: "workcard", text: "泄漏告警与近景复核", docId: "DOC-SEAL-CARD", chunkIndex: 1 }
          ]
        },
        {
          id: "wb-q6",
          label: "2号轴承怎么判?",
          question: "2号轴承振动异常为什么疑似内圈剥落？",
          thinkingText: "正在检索知识库…",
          answer: "这条演示链路不是单点判断：时序引擎先检测到 2号轴承振动值异常上升，视觉引擎确认泵体无渗漏、联轴器无明显偏移，RAG 再用“轴承 + 振动上升 + 当前工况”检索 Top-5 相似案例。当前建议为高度疑似轴承内圈剥落，置信度 87%，处置建议匹配度 65%，建议 72h 内停机检查。",
          hit: true,
          hits: [
            { kind: "case", text: "2023年XX站相似案例特征", docId: "DOC-BEARING-SPALL-CASE", chunkIndex: 0 },
            { kind: "case", text: "72h 内停机检查与内圈剥落", docId: "DOC-BEARING-SPALL-CASE", chunkIndex: 1 },
            { kind: "workcard", text: "IMS 工单与移动端作业卡", docId: "DOC-BEARING-IMS-CARD", chunkIndex: 2 }
          ]
        },
        {
          id: "wb-q7",
          label: "汽蚀怎么复核?",
          question: "出口压力波动或汽蚀风险应该怎么复核？",
          thinkingText: "正在检索知识库…",
          answer: "出口压力波动需要结合入口压力、阀位、过滤器压差、流量设定和运行工况判断；当压力波动、泵体异响和振动升高同时出现时，才重点关注入口条件不足、汽蚀风险或工况切换影响。",
          hit: true,
          hits: [
            { kind: "rule", text: "压力波动复核条件", docId: "DOC-CAVITATION-RULE", chunkIndex: 0 },
            { kind: "rule", text: "汽蚀风险组合特征", docId: "DOC-CAVITATION-RULE", chunkIndex: 1 }
          ]
        },
        {
          id: "wb-q8",
          label: "能直接开票吗?",
          question: "Agent 能否直接决定生成处置票卡？",
          thinkingText: "正在检索知识库…",
          answer: "不能。Agent 只能组织告警、视觉和知识库依据；是否采纳、修正或驳回，需要人工复核确认停机窗口、安全措施和现场作业条件。",
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
          label: "能直接维修吗?",
          question: "命中不对中规则后能否直接生成维修结论？",
          thinkingText: "正在检索知识库…",
          answer: "不能。AI 只负责组织证据和建议，是否采纳、修正票卡或排除误报必须由专家结合现场复测、停机窗口和安全边界决定。",
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
          label: "有哪些故障经验?",
          question: "知识库里有哪些输油泵故障经验？",
          thinkingText: "正在检索知识库…",
          answer: "当前知识库覆盖五类演示故障经验：联轴器不对中、机械密封泄漏、轴承温升、2号轴承振动异常/内圈剥落、出口压力波动/汽蚀风险。每类都保留复核边界、现场证据和票卡或规则依据。",
          hit: true,
          hits: [
            { kind: "standard", text: "不对中复核边界", docId: "DOC-STD", chunkIndex: 1 },
            { kind: "workcard", text: "机械密封泄漏复核", docId: "DOC-SEAL-CARD", chunkIndex: 0 },
            { kind: "workcard", text: "轴承温升复核", docId: "DOC-BEARING-CARD", chunkIndex: 0 },
            { kind: "case", text: "2号轴承内圈剥落案例", docId: "DOC-BEARING-SPALL-CASE", chunkIndex: 0 },
            { kind: "rule", text: "出口压力与汽蚀复核", docId: "DOC-CAVITATION-RULE", chunkIndex: 0 }
          ]
        },
        {
          id: "kb-q2",
          label: "漏油依据是什么?",
          question: "漏油类故障有哪些处置依据？",
          thinkingText: "正在检索知识库…",
          answer: "漏油类故障主要参考机械密封复核卡：检查密封端面、轴套磨损、冲洗管路、冷却水状态和泄漏回收口；视觉识别到密封油迹且泄漏告警越线时，再确认是否生成机械密封票卡。",
          hit: true,
          hits: [
            { kind: "workcard", text: "机械密封泄漏复核项", docId: "DOC-SEAL-CARD", chunkIndex: 0 },
            { kind: "workcard", text: "泄漏告警与近景复核", docId: "DOC-SEAL-CARD", chunkIndex: 1 },
            { kind: "workcard", text: "泄漏处置后复核", docId: "DOC-SEAL-CARD", chunkIndex: 2 }
          ]
        },
        {
          id: "kb-q3",
          label: "轴承剥落案例?",
          question: "2号轴承内圈剥落案例能给当前诊断什么参考？",
          thinkingText: "正在检索知识库…",
          answer: "2023 年 XX 站同型号泵曾出现 2号轴承振动值异常上升，外观未见渗漏且联轴器未见明显偏移，最终拆检发现轴承内圈剥落。当前记录可复用其案例特征、处置记录和设备档案上下文，但停机检查仍需人工复核确认。",
          hit: true,
          hits: [
            { kind: "case", text: "相似案例特征", docId: "DOC-BEARING-SPALL-CASE", chunkIndex: 0 },
            { kind: "case", text: "72h 停机检查结果", docId: "DOC-BEARING-SPALL-CASE", chunkIndex: 1 },
            { kind: "case", text: "案例特征与设备档案上下文", docId: "DOC-BEARING-SPALL-CASE", chunkIndex: 2 }
          ]
        },
        {
          id: "kb-q4",
          label: "汽蚀如何复核?",
          question: "汽蚀或压力波动如何复核？",
          thinkingText: "正在检索知识库…",
          answer: "压力波动不能直接等同设备故障，应结合入口压力、阀位、过滤器压差、流量设定和运行工况判断。若压力波动、泵体异响和振动升高同时出现，再重点复核入口条件和汽蚀风险。",
          hit: true,
          hits: [
            { kind: "rule", text: "压力波动复核口径", docId: "DOC-CAVITATION-RULE", chunkIndex: 0 },
            { kind: "rule", text: "汽蚀风险组合特征", docId: "DOC-CAVITATION-RULE", chunkIndex: 1 },
            { kind: "rule", text: "复核记录要求", docId: "DOC-CAVITATION-RULE", chunkIndex: 2 }
          ]
        },
        {
          id: "kb-q5",
          label: "不对中依据?",
          question: "输油泵不对中的判定依据是什么？",
          thinkingText: "正在检索知识库…",
          answer: "本演示按泵驱动端振动升高、联轴器相位差异常、2X 频谱突出三类证据组织不对中复核；底座基础振动和管道约束作为辅助排查项。",
          hit: true,
          hits: [
            { kind: "standard", text: "不对中复核边界", docId: "DOC-STD", chunkIndex: 1 },
            { kind: "metric", text: "振动关注线", docId: "DOC-STD", chunkIndex: 2 },
            { kind: "case", text: "P-1 当前异常特征", docId: "DOC-CASE", chunkIndex: 0 }
          ]
        },
        {
          id: "kb-q6",
          label: "票卡记录什么?",
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
          id: "kb-q7",
          label: "报告怎么复用?",
          question: "刚归档的复核报告能被 Agent 如何复用？",
          thinkingText: "正在检索知识库…",
          answer: "归档报告可作为后续相似记录的复核路径、作业清单、复测指标和报告结构参考；在 2号轴承示例里，还可以把案例特征、处置记录和设备档案拼成 RAG 上下文，再生成 IMS 工单建议、备件信息和移动端作业卡。",
          hit: true,
          hits: [
            { kind: "case", text: "P-1 不对中归档案例", docId: "DOC-CASE", chunkIndex: 3 },
            { kind: "case", text: "轴承剥落案例复用边界", docId: "DOC-BEARING-SPALL-CASE", chunkIndex: 3 },
            { kind: "workcard", text: "IMS 工单和移动端作业卡", docId: "DOC-BEARING-IMS-CARD", chunkIndex: 2 }
          ]
        },
        {
          id: "kb-q8",
          label: "能查全部原文吗?",
          question: "Agent 能否检索所有集团制度和审批权限原文？",
          thinkingText: "正在检索知识库…",
          answer: "当前演示知识库只接入少量报告、规则和作业卡样例，暂不包含完整集团制度原文和审批权限矩阵。真实上线后应由业务侧补齐制度库、权限口径和版本有效性。",
          hit: false,
          hits: []
        }
      ]
    }
  ]
};
