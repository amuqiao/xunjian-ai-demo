// 静态 Agent 问答数据：页面只引用这份确定性数据，不接真实检索、不反查知识库文档。
window.DemoAgentQa = {
  dialogs: [
    {
      id: "workbench-agent",
      title: "诊断工作台 Agent 辅助问答",
      kicker: "输油泵故障诊断",
      summary: "围绕工单、巡检记录和在线监测结果，演示 7 类输油泵故障的原因研判。",
      entryTitle: "AI 辅助问答",
      entryText: "通过弹窗问答查看当前工单可关联的故障现象、原因分析和命中依据。",
      emptyText: "请选择一个预设问题查看回答。",
      questions: [
        {
          id: "qa-wb-mechanical-seal",
          label: "机械密封为什么会泄漏？",
          answer: "原因：泵壳密封安装面与轴线的垂直度严重超差，导致动环组件承受异常应力，引发驱动槽磨损与弹簧卡滞；或介质含杂质、泥砂堆积在密封动环内部，使动环失去补偿能力；或冲洗冷却管路存在气阻，导致密封腔温度升高、动静环热变形。",
          hits: [
            { kind: "current", text: "工单 WO-CL-P1-SEAL-202608" },
            { kind: "rule", text: "机械密封泄漏原因研判" },
            { kind: "report", text: "输油泵机组运行状态监测报告" }
          ]
        },
        {
          id: "qa-wb-vibration",
          label: "机组为什么会异常振动？",
          answer: "原因：泵运行工况偏离额定工况（尤其是小流量工况），产生较大的流体脉动激振力，激励管道及泵体振动；或泵机组对中不良、转子动平衡不合格等机械因素引发振动。",
          hits: [
            { kind: "current", text: "振动趋势与工况偏离记录" },
            { kind: "rule", text: "机组异常振动诊断规则" },
            { kind: "workcard", text: "对中与动平衡复核票卡" }
          ]
        },
        {
          id: "qa-wb-bearing-damage",
          label: "轴承为什么会损坏？",
          answer: "原因：轴承长期承受轴向力不平衡（如叶轮设计或安装问题导致）、润滑不良（润滑油变质或泄漏）、轴颈材质或加工工艺缺陷。",
          hits: [
            { kind: "current", text: "泵驱动端轴承振动与温度记录" },
            { kind: "workcard", text: "轴承检查与润滑复核票卡" },
            { kind: "case", text: "轴承损伤类故障样本" }
          ]
        },
        {
          id: "qa-wb-cavitation",
          label: "汽蚀现象是怎么形成的？",
          answer: "原因：泵入口压力低于介质在该温度下的饱和蒸汽压，或入口管路阻力过大、过滤器堵塞导致有效汽蚀余量不足。",
          hits: [
            { kind: "metric", text: "入口压力与有效汽蚀余量" },
            { kind: "rule", text: "汽蚀风险组合特征" },
            { kind: "current", text: "异响、振动和扬程变化记录" }
          ]
        },
        {
          id: "qa-wb-motor-overload",
          label: "电机为什么会持续过载？",
          answer: "原因：介质密度或粘度超出设计值；或泵内叶轮与泵壳间隙过小产生摩擦；或出口压力异常升高导致轴功率增大。",
          hits: [
            { kind: "current", text: "电流持续偏高告警" },
            { kind: "metric", text: "介质密度、粘度与出口压力" },
            { kind: "workcard", text: "泵内摩擦与叶轮间隙复核" }
          ]
        },
        {
          id: "qa-wb-outlet-pressure",
          label: "出口压力为什么频繁波动？",
          answer: "原因：上游来料不稳定或储罐液位波动；泵入口滤网部分堵塞导致供液不均；调节阀动作迟缓或PID参数设置不当。",
          hits: [
            { kind: "current", text: "出口压力波动趋势" },
            { kind: "rule", text: "上游来料与滤网堵塞复核" },
            { kind: "metric", text: "调节阀动作与 PID 参数" }
          ]
        },
        {
          id: "qa-wb-low-flow",
          label: "流量为什么低于设计值？",
          answer: "原因：叶轮入口被杂物部分堵塞；叶轮与泵壳间隙因磨损增大，内泄漏量增加；泵转速因变频器或原动机故障未达到额定值；出口管线阀门未全开或管径偏小。",
          hits: [
            { kind: "current", text: "流量低于设计值工单" },
            { kind: "workcard", text: "叶轮入口与出口阀门复核" },
            { kind: "metric", text: "转速、内泄漏和管线阻力" }
          ]
        }
      ]
    },
    {
      id: "knowledge-agent",
      title: "知识库 Agent 辅助问答",
      kicker: "知识命中说明",
      summary: "围绕知识库中的 8 类输油泵故障材料，展示静态问答与命中标签。",
      entryTitle: "Agent 问答模拟",
      entryText: "点击打开弹窗，查看预设问题如何命中知识库里的故障知识条目。",
      emptyText: "请选择一个知识库预设问题查看回答。",
      questions: [
        {
          id: "qa-kb-impeller-damage",
          label: "叶轮为什么会损伤？",
          answer: "原因：输送介质中含有硬质颗粒杂质，对叶轮表面造成冲刷磨损；或介质腐蚀性导致叶轮材质损伤；严重时叶片破损断裂。",
          hits: [
            { kind: "case", text: "叶轮磨损、腐蚀或破损知识条目" },
            { kind: "metric", text: "介质杂质与腐蚀性" }
          ]
        },
        {
          id: "qa-kb-coupling-alignment",
          label: "联轴器问题从哪来？",
          answer: "原因：泵与电机安装对中精度不足，运行时产生附加振动和轴向窜动；或联轴器选型无法有效补偿热膨胀等因素引起的对中偏差。",
          hits: [
            { kind: "workcard", text: "联轴器对中不良或选型不当知识条目" },
            { kind: "rule", text: "热膨胀补偿与轴向窜动" }
          ]
        },
        {
          id: "qa-kb-flush-cooling",
          label: "冲洗冷却为什么会堵塞？",
          answer: "原因：油品中的杂质在冲洗管路或节流孔板处沉积，导致冷却润滑油流量减少，密封腔温度升高。",
          hits: [
            { kind: "workcard", text: "冲洗冷却管路堵塞知识条目" },
            { kind: "metric", text: "密封腔温度与冷却流量" }
          ]
        },
        {
          id: "qa-kb-pipeline-vibration",
          label: "进出口管道为什么会振动？",
          answer: "原因：泵产生的流体脉动压力通过管道传递，当脉动频率与管道固有频率接近时引发共振；或管道弯头、变径等阻流元件导致流体冲击振动。",
          hits: [
            { kind: "rule", text: "泵进出口管道振动知识条目" },
            { kind: "metric", text: "脉动频率与管道固有频率" }
          ]
        },
        {
          id: "qa-kb-packing-leakage",
          label: "填料函渗漏为什么增大？",
          answer: "原因：填料压盖螺栓松动或压紧力不均匀；填料老化磨损失去弹性；轴套磨损导致径向间隙增大。",
          hits: [
            { kind: "workcard", text: "填料函渗漏增大知识条目" },
            { kind: "metric", text: "压紧力、弹性和轴套间隙" }
          ]
        },
        {
          id: "qa-kb-lube-temp",
          label: "润滑油温为什么过高？",
          answer: "原因：润滑油冷却器冷却水流量不足或冷却水温度偏高；润滑油油位过低导致循环量减少；轴承摩擦发热加剧。",
          hits: [
            { kind: "metric", text: "润滑油系统油温过高知识条目" },
            { kind: "workcard", text: "冷却器、水流量和轴承摩擦复核" }
          ]
        },
        {
          id: "qa-kb-lube-pressure",
          label: "润滑油压为什么过低？",
          answer: "原因：润滑油过滤器堵塞；油泵磨损内泄增大；润滑油管路接头松动造成泄漏；油品粘度下降（如混入轻组分）。",
          hits: [
            { kind: "metric", text: "润滑油系统油压过低知识条目" },
            { kind: "workcard", text: "过滤器、油泵和管路泄漏复核" }
          ]
        },
        {
          id: "qa-kb-bolt-loose",
          label: "连接螺栓为什么会松断？",
          answer: "原因：长期振动导致螺纹连接自松；基础灌浆不实或地脚螺栓预紧力不均匀；运行温度变化引起热胀冷缩交替作用。",
          hits: [
            { kind: "workcard", text: "泵体与底座连接螺栓知识条目" },
            { kind: "rule", text: "基础灌浆、预紧力和热胀冷缩" }
          ]
        }
      ]
    },
    {
      id: "archive-case-agent",
      title: "历史案例 Agent 辅助问答",
      kicker: "案例复用说明",
      summary: "围绕已归档故障案例，解释相似异常可以复用什么、不能复用什么。",
      entryTitle: "二次 Agent 命中预览",
      entryText: "查看相似工单命中归档案例后的复用建议。",
      emptyText: "请选择一个案例复用问题查看回答。",
      questions: [
        {
          id: "why-similar",
          label: "为什么能命中历史案例？",
          answer: "相似命中只代表故障现象、部位、监测指标和原因标签接近，可以复用排查路径、检查清单和报告结构，不能直接继承上一单的最终结论。",
          hits: [
            { kind: "case", text: "输油泵故障诊断归档案例" },
            { kind: "rule", text: "相似案例复用边界" }
          ]
        },
        {
          id: "what-reuse",
          label: "哪些经验可以复用？",
          answer: "可以复用现场复核项、趋势指标、工单处置步骤、报告章节和风险标签；是否停机、是否拆检、是否更换部件，仍需依据本轮现场复核确认。",
          hits: [
            { kind: "workcard", text: "输油泵故障复核票卡" },
            { kind: "report", text: "运行状态监测报告" }
          ]
        }
      ]
    },
    {
      id: "archive-record-agent",
      title: "归档记录 Agent 辅助问答",
      kicker: "非维修闭环说明",
      summary: "解释非维修闭环为什么不触发相似维修案例命中。",
      entryTitle: "归档记录问答",
      entryText: "查看非维修闭环记录的后续使用边界。",
      emptyText: "请选择一个归档记录问题查看回答。",
      questions: [
        {
          id: "why-no-case",
          label: "为什么不触发相似维修案例？",
          answer: "本轮如果选择继续观察或排除误报，只会记录复评依据、阈值反馈和专家边界说明，不沉淀为维修处置案例。后续可参考趋势复核口径，但不能作为故障处置知识直接命中。",
          hits: [
            { kind: "report", text: "输油泵机组运行状态监测报告" },
            { kind: "rule", text: "相似案例复用边界" }
          ]
        },
        {
          id: "how-use",
          label: "后续如何使用非维修记录？",
          answer: "非维修记录用于复评趋势窗口、异常边界和规则触发阈值说明。它可以辅助解释为什么本轮未生成处置票卡，但不能替代机械密封、轴承、叶轮、联轴器等故障知识条目。",
          hits: [
            { kind: "standard", text: "机组与管道振动诊断规则" },
            { kind: "report", text: "输油泵故障诊断与运行状态监测归档报告" }
          ]
        }
      ]
    }
  ]
};
