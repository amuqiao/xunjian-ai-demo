// 领域契约 08：Agent 语料。
//
// 三个上下文（诊断工作台 / 人工复核 / 知识库）共用同一个 AgentPanel 组件，只换
// contextId。每个页面首屏展示 5 条输油泵故障问句；schema 要求的未命中态使用
// unlockedBy:"archived" 隐藏，避免污染首屏列表。
window.DOMAIN_AGENTQA = {
  contexts: [
    {
      id: "workbench",
      entryTitle: "Agent 助手",
      entryText: "综合巡检记录、时序、视觉和知识依据回答输油泵故障诊断问题。",
      kicker: "诊断工作台",
      summary: "围绕当前工单的故障现象和运行数据做快速原因研判。",
      emptyText: "选择左侧任一预设问题开始。",
      fallbackAnswer: "这个问题需要接入实时数据，本演示环境暂不支持，可以试试左侧的预设问题。",
      questions: [
        {
          id: "wb-q1",
          label: "机械密封为什么会泄漏？",
          question: "输油泵机械密封为什么会出现密封不严、泄漏？",
          thinkingText: "正在检索知识库…",
          answer: "原因：泵壳密封安装面与轴线的垂直度严重超差，导致动环组件承受异常应力，引发驱动槽磨损与弹簧卡滞；或介质含杂质、泥砂堆积在密封动环内部，使动环失去补偿能力；或冲洗冷却管路存在气阻，导致密封腔温度升高、动静环热变形。",
          hit: true,
          hits: [
            { kind: "workcard", text: "机械密封泄漏与冲洗冷却复核", docId: "DOC-SEAL-CARD", chunkIndex: 0 },
            { kind: "case", text: "输油泵运行状态监测归档报告", docId: "DOC-CASE", chunkIndex: 0 }
          ]
        },
        {
          id: "wb-q2",
          label: "机组为什么会异常振动？",
          question: "输油泵机组为什么会出现异常振动？",
          thinkingText: "正在检索知识库…",
          answer: "原因：泵运行工况偏离额定工况（尤其是小流量工况），产生较大的流体脉动激振力，激励管道及泵体振动；或泵机组对中不良、转子动平衡不合格等机械因素引发振动。",
          hit: true,
          hits: [
            { kind: "rule", text: "机组异常振动诊断规则", docId: "DOC-STD", chunkIndex: 0 },
            { kind: "rule", text: "泵进出口管道振动复核", docId: "DOC-CAVITATION-RULE", chunkIndex: 0 }
          ]
        },
        {
          id: "wb-q8",
          label: "汽蚀现象是怎么形成的？",
          question: "输油泵出现汽蚀现象是怎么形成的？",
          thinkingText: "正在检索知识库…",
          answer: "原因：泵入口压力低于介质在该温度下的饱和蒸汽压，或入口管路阻力过大、过滤器堵塞导致有效汽蚀余量不足。",
          hit: true,
          hits: [
            { kind: "rule", text: "汽蚀风险组合特征", docId: "DOC-CAVITATION-RULE", chunkIndex: 1 },
            { kind: "standard", text: "入口压力与有效汽蚀余量复核", docId: "DOC-STD", chunkIndex: 2 }
          ]
        },
        {
          id: "wb-q9",
          label: "电机为什么会持续过载？",
          question: "输油泵电机为什么会过载、运行电流持续偏高？",
          thinkingText: "正在检索知识库…",
          answer: "原因：介质密度或粘度超出设计值；或泵内叶轮与泵壳间隙过小产生摩擦；或出口压力异常升高导致轴功率增大。",
          hit: true,
          hits: [
            { kind: "workcard", text: "电机过载与轴功率复核", docId: "DOC-BEARING-IMS-CARD", chunkIndex: 0 },
            { kind: "workcard", text: "电流、出口压力与介质参数复核", docId: "DOC-BEARING-IMS-CARD", chunkIndex: 2 }
          ]
        },
        {
          id: "wb-q11",
          label: "出口压力为什么频繁波动？",
          question: "输油泵出口压力为什么会频繁波动？",
          thinkingText: "正在检索知识库…",
          answer: "原因：上游来料不稳定或储罐液位波动；泵入口滤网部分堵塞导致供液不均；调节阀动作迟缓或PID参数设置不当。",
          hit: true,
          hits: [
            { kind: "rule", text: "出口压力波动复核口径", docId: "DOC-CAVITATION-RULE", chunkIndex: 2 },
            { kind: "case", text: "运行状态监测报告压力波动条目", docId: "DOC-CASE", chunkIndex: 1 }
          ]
        },
        {
          id: "wb-miss-archived",
          label: "能直接生成处置结论吗?",
          question: "Agent 能否直接决定生成处置结论？",
          thinkingText: "正在检索知识库…",
          answer: "不能。当前演示只组织故障现象、原因和命中依据，是否采纳、修正或驳回，需要人工复核确认停机窗口、安全措施和现场作业条件。",
          hit: false,
          hits: [],
          unlockedBy: "archived"
        }
      ]
    },
    {
      id: "review",
      entryTitle: "Agent 助手",
      entryText: "回答复核阶段的现场确认、拆检和处置边界问题。",
      kicker: "人工复核",
      summary: "围绕需要专家确认的机械部件、现场复核项和处置依据组织问答。",
      emptyText: "选择左侧任一预设问题开始。",
      fallbackAnswer: "这个问题需要接入实时数据，本演示环境暂不支持，可以试试左侧的预设问题。",
      questions: [
        {
          id: "rv-q3",
          label: "轴承为什么会损坏？",
          question: "输油泵轴承为什么会损坏？",
          thinkingText: "正在检索知识库…",
          answer: "原因：轴承长期承受轴向力不平衡（如叶轮设计或安装问题导致）、润滑不良（润滑油变质或泄漏）、轴颈材质或加工工艺缺陷。",
          hit: true,
          hits: [
            { kind: "workcard", text: "轴承损坏与润滑复核", docId: "DOC-BEARING-CARD", chunkIndex: 0 },
            { kind: "case", text: "叶轮与轴承关联损伤样本", docId: "DOC-BEARING-SPALL-CASE", chunkIndex: 1 }
          ]
        },
        {
          id: "rv-q4",
          label: "叶轮为什么会损伤？",
          question: "叶轮为什么会出现磨损、腐蚀或破损？",
          thinkingText: "正在检索知识库…",
          answer: "原因：输送介质中含有硬质颗粒杂质，对叶轮表面造成冲刷磨损；或介质腐蚀性导致叶轮材质损伤；严重时叶片破损断裂。",
          hit: true,
          hits: [
            { kind: "case", text: "叶轮磨损、腐蚀或破损案例", docId: "DOC-BEARING-SPALL-CASE", chunkIndex: 0 }
          ]
        },
        {
          id: "rv-q5",
          label: "联轴器问题从哪来？",
          question: "联轴器为什么会对中不良或选型不当？",
          thinkingText: "正在检索知识库…",
          answer: "原因：泵与电机安装对中精度不足，运行时产生附加振动和轴向窜动；或联轴器选型无法有效补偿热膨胀等因素引起的对中偏差。",
          hit: true,
          hits: [
            { kind: "workcard", text: "联轴器对中与选型复核", docId: "DOC-CARD", chunkIndex: 0 }
          ]
        },
        {
          id: "rv-q6",
          label: "冲洗冷却为什么会堵塞？",
          question: "冲洗冷却管路或节流孔板为什么会堵塞？",
          thinkingText: "正在检索知识库…",
          answer: "原因：油品中的杂质在冲洗管路或节流孔板处沉积，导致冷却润滑油流量减少，密封腔温度升高。",
          hit: true,
          hits: [
            { kind: "workcard", text: "冲洗冷却管路堵塞复核", docId: "DOC-SEAL-CARD", chunkIndex: 1 }
          ]
        },
        {
          id: "rv-q7",
          label: "进出口管道为什么会振动？",
          question: "泵进出口管道为什么会振动？",
          thinkingText: "正在检索知识库…",
          answer: "原因：泵产生的流体脉动压力通过管道传递，当脉动频率与管道固有频率接近时引发共振；或管道弯头、变径等阻流元件导致流体冲击振动。",
          hit: true,
          hits: [
            { kind: "rule", text: "泵进出口管道振动知识条目", docId: "DOC-CAVITATION-RULE", chunkIndex: 0 }
          ]
        },
        {
          id: "rv-miss-archived",
          label: "现在该找谁签字?",
          question: "这一步需要谁签字确认？",
          thinkingText: "正在检索知识库…",
          answer: "知识库暂无审批权限矩阵。演示中建议由设备管理工程师复核、站场班组长确认，真实审批仍按现场制度人工确认。",
          hit: false,
          hits: [],
          unlockedBy: "archived"
        }
      ]
    },
    {
      id: "knowledge",
      entryTitle: "Agent 助手",
      entryText: "针对知识库内容提问，答案带可跳转的引用。",
      kicker: "知识库",
      summary: "围绕可沉淀复用的故障知识、指标口径和归档案例组织问答。",
      emptyText: "选择左侧任一预设问题开始。",
      fallbackAnswer: "这个问题需要接入实时数据，本演示环境暂不支持，可以试试左侧的预设问题。",
      questions: [
        {
          id: "kb-q10",
          label: "填料函渗漏为什么增大？",
          question: "输油泵轴封处填料函渗漏为什么会增大？",
          thinkingText: "正在检索知识库…",
          answer: "原因：填料压盖螺栓松动或压紧力不均匀；填料老化磨损失去弹性；轴套磨损导致径向间隙增大。",
          hit: true,
          hits: [
            { kind: "workcard", text: "填料函渗漏增大复核", docId: "DOC-SEAL-CARD", chunkIndex: 2 }
          ]
        },
        {
          id: "kb-q12",
          label: "润滑油温为什么过高？",
          question: "输油泵润滑油系统油温为什么会过高？",
          thinkingText: "正在检索知识库…",
          answer: "原因：润滑油冷却器冷却水流量不足或冷却水温度偏高；润滑油油位过低导致循环量减少；轴承摩擦发热加剧。",
          hit: true,
          hits: [
            { kind: "workcard", text: "润滑油系统油温过高口径", docId: "DOC-BEARING-CARD", chunkIndex: 1 }
          ]
        },
        {
          id: "kb-q13",
          label: "润滑油压为什么过低？",
          question: "输油泵润滑油系统油压为什么会过低？",
          thinkingText: "正在检索知识库…",
          answer: "原因：润滑油过滤器堵塞；油泵磨损内泄增大；润滑油管路接头松动造成泄漏；油品粘度下降（如混入轻组分）。",
          hit: true,
          hits: [
            { kind: "workcard", text: "润滑油系统油压过低口径", docId: "DOC-BEARING-CARD", chunkIndex: 2 }
          ]
        },
        {
          id: "kb-q14",
          label: "连接螺栓为什么会松断？",
          question: "输油泵泵体与底座连接螺栓为什么会松动或断裂？",
          thinkingText: "正在检索知识库…",
          answer: "原因：长期振动导致螺纹连接自松；基础灌浆不实或地脚螺栓预紧力不均匀；运行温度变化引起热胀冷缩交替作用。",
          hit: true,
          hits: [
            { kind: "workcard", text: "泵体与底座连接螺栓复核", docId: "DOC-CARD", chunkIndex: 1 }
          ]
        },
        {
          id: "kb-q15",
          label: "流量为什么低于设计值？",
          question: "输油泵流量为什么会低于设计值、出力不足？",
          thinkingText: "正在检索知识库…",
          answer: "原因：叶轮入口被杂物部分堵塞；叶轮与泵壳间隙因磨损增大，内泄漏量增加；泵转速因变频器或原动机故障未达到额定值；出口管线阀门未全开或管径偏小。",
          hit: true,
          hits: [
            { kind: "workcard", text: "流量不足与出力复核", docId: "DOC-BEARING-IMS-CARD", chunkIndex: 1 },
            { kind: "case", text: "叶轮磨损与入口堵塞案例", docId: "DOC-BEARING-SPALL-CASE", chunkIndex: 2 }
          ]
        },
        {
          id: "kb-miss-archived",
          label: "制度原文是否已接入?",
          question: "Agent 能否检索所有集团制度和审批权限原文？",
          thinkingText: "正在检索知识库…",
          answer: "当前演示知识库只接入少量运行状态监测报告、故障知识条目和复核票卡样例，暂不包含完整集团制度原文和审批权限矩阵。真实上线后应由业务侧补齐制度库、权限口径和版本有效性。",
          hit: false,
          hits: [],
          unlockedBy: "archived"
        }
      ]
    }
  ]
};
