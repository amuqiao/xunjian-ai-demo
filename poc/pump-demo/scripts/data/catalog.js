// 数据目录：机组/部位/巡检/工单等结构化演示数据（机械拆分自原 scripts/data.js，
// 数值与结构未做任何改动）。知识库/图谱/案例问答见 scripts/data/knowledge.js。
window.DemoDataCatalog = {
  meta: {
    title: "输油泵智能运维助手",
    subtitle: "长岭站 P-1 疑似不对中诊断处置闭环",
    batch: "PUMP-DEMO-202607",
    clock: "2026-07-22 16:31",
    boundary: "结构化演示数据驱动；不接真实系统、不训练真实模型、不替代专家。",
  },
  scenes: [
    { key: "overview", label: "泵机组大屏", node: "风险总览" },
    { key: "station", label: "部位态势", node: "空间定位" },
    { key: "workbench", label: "诊断工作台", node: "证据质检" },
    { key: "confirm", label: "复核确认", node: "专家边界" },
    { key: "archive", label: "报告归档", node: "案例复用" },
    { key: "graph", label: "知识图谱", node: "图谱模块" },
  ],
  flowSteps: [
    { key: "task", label: "任务总览", desc: "大屏 / 风险" },
    { key: "station", label: "部位态势", desc: "泵体 / 联轴器" },
    { key: "inspection", label: "巡检质检", desc: "人工记录 / AI 冲突" },
    { key: "trend", label: "时序模型", desc: "振动 / 相位" },
    { key: "vision", label: "视觉数据", desc: "点位 / 对中图" },
    { key: "agent", label: "Agent 问答", desc: "证据 / 规则 / 案例" },
    { key: "confirm", label: "复核确认", desc: "专家 / 票卡" },
    { key: "archive", label: "报告归档", desc: "案例 / 复用" },
  ],
  media: {
    pointMap: "media/point-map.jpg",
    sourcePointMap: "media/source/pump-point-map.jpg",
    laserBefore: "media/laser-before.jpg",
    laserAfter: "media/laser-after.jpg",
    fieldWork: "media/field-work.jpg",
    fieldClose: "media/field-close.jpg",
  },
  task: {
    batch: "PUMP-DEMO-202607",
    title: "长岭站 P-1 输油泵机组关注级诊断任务",
    note: "沿用 v3 的演示骨架：总览大屏锁定泵机组对象，部位诊断并联查看时序模型、视觉/数据模型、知识规范和 Agent 建议，专家确认后归档并支持二次命中。",
    rows: [
      ["站点", "长岭站"],
      ["对象", "P-1 输油泵机组"],
      ["事件", "疑似不对中"],
      ["等级", "关注级"],
    ],
    metrics: [
      { label: "异常部位", value: "3", unit: "个" },
      { label: "关注部位", value: "1", unit: "个" },
      { label: "知识命中", value: "4", unit: "项" },
      { label: "复用样例", value: "P-2", unit: "" },
    ],
  },
  dashboard: {
    kpis: [
      { label: "机组健康", value: "72", unit: "分", status: "warn", note: "P-1 关注级" },
      { label: "振动峰值", value: "5.82", unit: "mm/s", status: "danger", note: "P-DE-V" },
      { label: "相位偏差", value: "81", unit: "°", status: "danger", note: "联轴器两侧" },
      { label: "轴承温度", value: "68.4", unit: "°C", status: "warn", note: "驱动端" },
      { label: "出口压力", value: "6.42", unit: "MPa", status: "ok", note: "工况稳定" },
      { label: "知识命中", value: "4", unit: "项", status: "ok", note: "规则/作业卡/案例" },
    ],
    charts: [
      { title: "振动风险趋势", value: "5.82", unit: "mm/s", note: "P-DE-V 连续 5 日抬升" },
      { title: "异常类型占比", value: "41%", unit: "", note: "不对中特征占本轮风险最高" },
      { title: "处置闭环进度", value: "0/4", unit: "", note: "待专家确认后生成票卡" },
    ],
    trend: {
      title: "P-1 关键指标趋势",
      dates: ["07-18", "07-19", "07-20", "07-21", "07-22"],
      vibration: [2.62, 3.18, 4.12, 5.08, 5.82],
      temperature: [59.6, 61.1, 63.8, 66.2, 68.4],
      pressure: [6.35, 6.41, 6.38, 6.45, 6.42],
      threshold: 5.68,
    },
    anomalyTypes: [
      { name: "不对中特征", value: 41 },
      { name: "轴承振动", value: 26 },
      { name: "基础振动", value: 18 },
      { name: "温升关注", value: 9 },
      { name: "其他", value: 6 },
    ],
    unitCompare: [
      { unit: "P-1", health: 72, vibration: 5.82 },
      { unit: "P-2", health: 81, vibration: 4.96 },
      { unit: "P-3", health: 96, vibration: 0.42 },
      { unit: "P-4", health: 89, vibration: 2.18 },
    ],
    alerts: [
      ["P1", "联轴器相位差异常", "81° / 2X 频谱突出"],
      ["P1", "泵驱动端轴承振动", "5.82 mm/s，进入关注区"],
      ["P2", "底座基础振动偏大", "建议与对中状态联判"],
    ],
  },
  inspection: {
    title: "P-1 输油泵运行巡检记录",
    item: "第 18 项 · 联轴器与泵驱动端轴承状态",
    result: "人工记录：未确认异常",
    conflictTitle: "人工记录未异常 vs 模型证据会聚",
    conflictText: "现场记录只写“运行声音正常、未见泄漏”，但时序模型提示振动和相位持续抬升，视觉/数据证据要求补充联轴器对中复核。",
    facts: [
      ["巡检对象", "P-1 主输泵机组"],
      ["人工记录", "运行声音正常，未见泄漏"],
      ["核心部位", "联轴器 / 泵驱动端轴承 / 底座"],
      ["AI 质检", "记录未覆盖相位差、2X 频谱和基础振动"],
    ],
    qualityFacts: [
      ["表单完整性", "基础项完整，但缺少对中复核读数"],
      ["时序冲突", "P-DE-V 与相位差连续抬升"],
      ["视觉补证", "需补拍联轴器和底座地脚近景"],
      ["业务边界", "AI 只升级为待复核，不直接改写人工结论"],
    ],
  },
  pumpUnits: [
    { id: "P-1", name: "P-1 主输泵", status: "异常", load: "84%", vibration: "5.82 mm/s", temp: "68.4°C" },
    { id: "P-2", name: "P-2 主输泵", status: "待复核", load: "76%", vibration: "4.96 mm/s", temp: "63.1°C" },
    { id: "P-3", name: "P-3 备用泵", status: "正常", load: "0%", vibration: "0.42 mm/s", temp: "32.8°C" },
    { id: "P-4", name: "P-4 主输泵", status: "正常", load: "71%", vibration: "2.18 mm/s", temp: "58.6°C" },
  ],
  parts: [
    {
      id: "pump-body",
      label: "泵体",
      short: "泵体",
      status: "ok",
      badge: "工况稳定",
      component: "泵壳 / 蜗壳",
      position: { x: 250, y: 275 },
      summary: "出口压力和工况波动稳定，当前不作为主要异常源。",
      checkItem: "泵体出口压力与运行工况",
      trend: {
        title: "泵体出口压力趋势",
        unit: "MPa",
        threshold: 6.8,
        points: [["07-18", 6.35], ["07-19", 6.41], ["07-20", 6.38], ["07-21", 6.45], ["07-22", 6.42]],
        alert: "压力波动约 1.8%，未见工况突变。",
      },
      vision: {
        title: "泵体点位与管线状态",
        src: "pointMap",
        caption: "点位图用于定位泵体、进出口压力和周边测点。",
        finding: "视觉证据未指向泵体工况异常。",
        frames: [
          {
            id: "pumpbody-pointmap-tcas",
            label: "测温点标注",
            src: "pointMap",
            bbox: { x: 0.17, y: 0.29, w: 0.17, h: 0.22 },
            boxLabel: "TCAS 测温点标注",
            findings: ["点位图标注泵体测温探头(TCAS)位置", "该测点未见异常温升"],
          },
          {
            id: "pumpbody-pointmap-pg",
            label: "压力点标注",
            src: "pointMap",
            bbox: { x: 0.25, y: 0.55, w: 0.20, h: 0.20 },
            boxLabel: "PG-IN / PG-OUT 压力点标注",
            findings: ["点位图标注出口压力表(PG-OUT)与进口压力表(PG-IN)位置", "出口压力 6.42 MPa，波动 1.8%，未见工况突变"],
          },
        ],
      },
      evidence: ["出口压力 6.42 MPa", "压力波动 1.8%", "未见工况突变证据"],
      agent: "泵体工况可作为对照项，当前不建议把泵体作为主故障源。",
    },
    {
      id: "seal",
      label: "密封",
      short: "密封",
      status: "ok",
      badge: "排除项",
      component: "机械密封",
      position: { x: 360, y: 185 },
      summary: "机械密封未见泄漏和温升异常，作为排除项记录。",
      checkItem: "机械密封泄漏和温升观察",
      trend: {
        title: "密封泄漏观察记录",
        unit: "级",
        threshold: 1,
        points: [["07-18", 0], ["07-19", 0], ["07-20", 0], ["07-21", 0], ["07-22", 0]],
        alert: "连续观察为 0 级，未触发泄漏预警。",
      },
      vision: {
        title: "现场密封检查照片",
        src: "fieldClose",
        caption: "现场近景用于辅助确认密封、连接和周边状态。",
        finding: "未见明显泄漏痕迹，保留人工复核项。",
        frames: [
          {
            id: "seal-pointmap-tdeseal",
            label: "密封测温点标注",
            src: "pointMap",
            bbox: { x: 0.30, y: 0.29, w: 0.14, h: 0.23 },
            boxLabel: "TDE-SEAL 密封测温点标注",
            findings: ["点位图标注驱动端密封测温探头(TDE-SEAL)位置", "密封泄漏观察连续记录为 0 级"],
          },
          {
            id: "seal-flange-close",
            label: "法兰连接近景",
            src: "fieldWork",
            bbox: { x: 0.30, y: 0.52, w: 0.13, h: 0.20 },
            boxLabel: "联轴器护罩法兰连接面",
            findings: ["法兰连接面螺栓和垫片外观未见渗漏", "密封与连接状态作为排除项记录，保留人工复核项"],
          },
        ],
      },
      evidence: ["泄漏观察正常", "未见异常温升", "不指向密封故障"],
      agent: "密封部位暂不作为主因，但建议在现场处置票卡中保留复核项。",
    },
    {
      id: "front-bearing",
      label: "泵驱动端轴承",
      short: "轴承",
      status: "danger",
      badge: "时序预警",
      component: "泵驱动端轴承",
      position: { x: 430, y: 280 },
      summary: "泵驱动端垂直振动进入关注区，是本次事件的直接触发测点。",
      checkItem: "泵驱动端轴承垂直振动",
      trend: {
        title: "泵驱动端轴承垂直振动趋势",
        unit: "mm/s",
        threshold: 5.68,
        stop: 7.1,
        points: [["07-18", 2.62], ["07-19", 3.18], ["07-20", 4.12], ["07-21", 5.08], ["07-22", 5.82]],
        alert: "最新值 5.82 mm/s，超过 80% 演示预警线。",
      },
      vision: {
        title: "泵驱动端点位图",
        src: "pointMap",
        caption: "点位图用于定位 P-DE-V、P-DE-H 和基础测点。",
        finding: "视觉模型提示需要补充轴承座和联轴器近景。",
        frames: [
          {
            id: "fb-pointmap-vde",
            label: "点位标注",
            src: "pointMap",
            bbox: { x: 0.33, y: 0.29, w: 0.22, h: 0.23 },
            boxLabel: "VDE-V / TDE 测点标注",
            findings: ["点位图标注驱动端轴承测振探头(VDE-V)与测温探头(TDE)位置", "对应 P-DE-V 主测点，5 日内由 2.62 升至 5.82 mm/s"],
          },
          {
            id: "fb-housing-close",
            label: "轴承座近景",
            src: "fieldWork",
            bbox: { x: 0.01, y: 0.15, w: 0.21, h: 0.32 },
            boxLabel: "轴承座法兰面",
            findings: ["现场轴承座法兰面外观未见明显磨损或渗油", "建议结合振动数据优先复核对中和轴承座状态"],
          },
        ],
      },
      evidence: ["5 日内由 2.62 升至 5.82 mm/s", "超过 80% 演示预警线", "1X/2X 成分同步抬升"],
      agent: "建议把轴承振动与联轴器相位差联判，优先复核对中和轴承座状态。",
    },
    {
      id: "coupling",
      label: "联轴器",
      short: "联轴器",
      status: "danger",
      badge: "核心异常",
      component: "联轴器 / 中间节",
      position: { x: 555, y: 280 },
      summary: "联轴器两侧相位差异常，结合 2X 频谱和基础振动，是疑似不对中的核心入口。",
      checkItem: "联轴器两侧相位和对中状态",
      trend: {
        title: "联轴器相位偏差趋势",
        unit: "°",
        threshold: 70,
        stop: 100,
        points: [["07-18", 24], ["07-19", 38], ["07-20", 52], ["07-21", 68], ["07-22", 81]],
        alert: "相位偏差 81°，命中疑似不对中特征。",
      },
      vision: {
        title: "激光对中仪调整前后",
        src: "laserBefore",
        compareSrc: "laserAfter",
        caption: "对中仪图片用于演示视觉证据与处置复测的关联。",
        finding: "调整前后读数可作为复检和报告归档证据。",
        frames: [
          {
            id: "coup-laser-before",
            label: "调整前",
            src: "laserBefore",
            bbox: { x: 0.42, y: 0.31, w: 0.20, h: 0.24 },
            boxLabel: "读数 -81.06° / r=0.97",
            findings: ["读数框内数值超出允许范围", "激光靶面与基准线不重合"],
          },
          {
            id: "coup-laser-after",
            label: "调整后",
            src: "laserAfter",
            bbox: { x: 0.44, y: 0.33, w: 0.18, h: 0.22 },
            boxLabel: "读数 -3.2° / 合格",
            findings: ["复测读数回到允许范围内"],
          },
        ],
      },
      evidence: ["相位差 -81.06° / r=0.97", "2X 成分突出", "与基础振动偏大并发"],
      agent: "建议进入复核确认，停机窗口内执行激光对中复核，并联动检查地脚螺栓。",
    },
    {
      id: "motor",
      label: "电机",
      short: "电机",
      status: "warn",
      badge: "同步抬升",
      component: "电机驱动端",
      position: { x: 720, y: 275 },
      summary: "电机侧振动随泵驱动端同步抬升，暂不作为首要故障源。",
      checkItem: "电机驱动端水平振动",
      trend: {
        title: "电机驱动端水平振动趋势",
        unit: "mm/s",
        threshold: 5.68,
        points: [["07-18", 2.38], ["07-19", 2.74], ["07-20", 3.21], ["07-21", 3.76], ["07-22", 4.18]],
        alert: "电机侧同步抬升，但未达到主触发阈值。",
      },
      vision: {
        title: "现场电机侧检查",
        src: "fieldWork",
        caption: "现场图用于确认电机侧和联轴器作业位置。",
        finding: "需与联轴器对中复核结果联判。",
        frames: [
          {
            id: "motor-housing-close",
            label: "电机轴承座近景",
            src: "fieldWork",
            bbox: { x: 0.62, y: 0.40, w: 0.27, h: 0.38 },
            boxLabel: "电机驱动端轴承座",
            findings: ["电机驱动端外观未见渗油和异常磨损", "需与联轴器对中及泵侧振动数据联判"],
          },
          {
            id: "motor-pointmap-vde",
            label: "点位标注",
            src: "pointMap",
            bbox: { x: 0.53, y: 0.33, w: 0.10, h: 0.22 },
            boxLabel: "VDE 测点标注",
            findings: ["点位图标注电机端轴承测振探头(VDE)位置", "驱动端水平振动 4.18 mm/s，低于主异常测点"],
          },
        ],
      },
      evidence: ["驱动端水平 4.18 mm/s", "低于主异常测点", "与泵侧存在同步关系"],
      agent: "电机侧作为关联证据，不建议单独形成电机故障结论。",
    },
    {
      id: "base",
      label: "底座",
      short: "底座",
      status: "danger",
      badge: "基础振动",
      component: "底座 / 地脚",
      position: { x: 470, y: 410 },
      summary: "基础振动偏大，与不对中证据共同出现，需要检查地脚和底座刚性。",
      checkItem: "底座基础振动和地脚状态",
      trend: {
        title: "底座基础振动趋势",
        unit: "mm/s",
        threshold: 3,
        stop: 4.5,
        points: [["07-18", 1.12], ["07-19", 1.48], ["07-20", 2.05], ["07-21", 2.84], ["07-22", 3.36]],
        alert: "基础振动 3.36 mm/s，超过关注线。",
      },
      vision: {
        title: "现场基础和地脚复核",
        src: "fieldWork",
        caption: "现场图用于定位底座、地脚和作业空间。",
        finding: "建议补拍地脚螺栓和垫片细节。",
        frames: [
          {
            id: "base-footbolt-close",
            label: "地脚螺栓近景",
            src: "fieldWork",
            bbox: { x: 0.83, y: 0.68, w: 0.10, h: 0.14 },
            boxLabel: "地脚螺栓紧固点",
            findings: ["地脚螺栓外观未见松动或锈蚀脱落", "建议现场力矩复核并纳入处置票卡"],
          },
          {
            id: "base-platform-close",
            label: "作业平台近景",
            src: "fieldWork",
            bbox: { x: 0.16, y: 0.80, w: 0.32, h: 0.15 },
            boxLabel: "底座作业平台",
            findings: ["作业平台未见裂纹或明显积油", "底座基础振动 3.36 mm/s，与联轴器相位异常并发"],
          },
        ],
      },
      evidence: ["F 点基础振动偏大", "与联轴器相位异常并发", "可能放大轴系振动"],
      agent: "处置票卡中应同步纳入地脚螺栓、底座垫片和管道约束检查。",
    },
  ],
  workOrder: {
    id: "WO-CL-P1-001",
    title: "P-1 疑似不对中处置票卡草稿",
    steps: ["记录处置前振动值和轴承温度", "执行能量隔离和现场安全确认", "使用激光对中仪复核轴线", "调整电机地脚垫片并复测", "检查地脚螺栓和管道约束", "恢复备用并提交反馈"],
    roles: ["诊断专家", "运行监视中心", "作业区检修人员", "运行监护人"],
  },
  // 维修路径的归档报告（六段式）。
  //
  // 段落从 [title, text] 二元组改成带 status 的对象：status 原来是 scenes/archive.js
  // 里一个按位置对齐的数组 ["warn","warn","warn","ok","ok","warn"]，业务增删一段
  // 报告，status 就整体错位——而且不会报错，只是某几段的颜色悄悄标错。
  // status 的含义：ok = 已完成并验证过的动作（处置复测、经验沉淀），
  // warn = 叙述或边界说明。业务加段落时自己指定，不依赖顺序。
  report: {
    title: "长岭站 P-1 输油泵疑似不对中诊断与处置报告",
    sections: [
      { title: "事件概况", text: "P-1 泵驱动端轴承振动趋势进入关注区，形成关注级诊断事件。", status: "warn" },
      { title: "模型证据", text: "时序模型提示振动和相位趋势异常，视觉模型要求补充联轴器和底座关键帧。", status: "warn" },
      { title: "专家确认", text: "专家确认按疑似不对中进入处置，知识库命中对中作业卡和专家规则。", status: "warn" },
      { title: "处置复测", text: "对中调整后振动由 5.82 mm/s 回落至 1.80 mm/s，演示口径下满足验收。", status: "ok" },
      { title: "经验沉淀", text: "沉淀为 P-1 不对中处置案例，用于 P-2 相似异常复用。", status: "ok" },
      { title: "案例复用", text: "P-2 仅复用证据标签、处置清单和报告结构，不能直接沿用 P-1 维修结论。", status: "warn" },
    ],
  },

  // 专家结论字典：结论文本、处置路径、判定用的证据测点、以及每条结论对闭环的影响。
  //
  // 这三个结论的文本此前是**字面量**散在 5 个文件里（scripts/boot.js 3 处、
  // scenes/archive.js 5 处、scenes/confirm.js 6 处），靠 `=== "确认不对中"` 这种字符串
  // 相等来驱动"是否解锁 P-2 复用""归档成维修案例还是观察记录"。业务把"确认不对中"
  // 改成别的说法时，得把这 14 处逐个找齐——漏一处不会报错，只会让解锁逻辑静默失效
  // （比较恒为 false，归档后 P-2 永远不解锁，看起来像功能没做）。
  //
  // 收成一份字典之后：文本只在这里出现一次，代码一律用 id（maintenance/observe/
  // falsePositive）判断。业务改文案改这里的 label，改处置步骤改 steps，都不碰代码。
  // isMaintenance 才是"要不要进维修闭环、要不要解锁案例复用"的真正判据，
  // 不再依赖某个具体中文串。
  verdicts: [
    {
      id: "maintenance",
      label: "确认不对中",
      isMaintenance: true,
      hint: "生成处置票卡并进入复测闭环",
      impact: "确认后进入维修处置闭环：生成处置票卡并执行复测，归档后解锁 P-2 相似案例复用。",
      archiveTitle: "长岭站 P-1 输油泵不对中处置案例归档",
      // 维修路径的步骤来自 workOrder.steps（处置票卡本身），不在这里重复一份。
      steps: null,
      // 维修路径的归档案例号来自 reuse().matchedCase（那份复用数据本身就带案例号），
      // 同理不重复存。
      archiveCaseId: null,
      archiveStatusText: "已沉淀为相似异常检索案例。",
      // 维修路径的报告段落取 report.sections（那份六段式报告本身），不在这里重复存。
      reportSections: null,
      agentClosureText: "选择“确认不对中”后生成处置票卡，完成激光对中复测并归档为维修案例，后续 P-2 可命中该案例。",
    },
    {
      id: "observe",
      label: "继续观察",
      isMaintenance: false,
      hint: "生成观察记录，不触发维修案例命中",
      impact: "继续观察不进入维修处置闭环：不生成处置票卡，不解锁案例复用，仅设置 48h 复评窗口。",
      archiveTitle: "长岭站 P-1 输油泵观察记录归档",
      steps: ["生成观察记录", "设置 48h 趋势复评窗口", "归档观察记录", "不触发维修案例命中"],
      archiveCaseId: "OBS-CL-P1-0722",
      archiveStatusText: "已归档为观察记录，不解锁维修案例复用。",
      // 非维修路径的归档报告：原来写死在 scenes/archive.js 的 reportEntries() 里，
      // 靠 if/else 在两组三段式文案之间二选一。报告内容是业务最常改的东西之一，
      // 属于数据。这两条路径都还没有"处置后复测通过"这类可验证结果，
      // 三段统一 warn，不臆造区分。
      reportSections: [
        { title: "专家结论", text: "本轮不生成处置票卡，进入 48h 趋势观察和复评窗口。", status: "warn" },
        { title: "保留证据", text: "保留相位差、2X 成分和基础振动证据，作为后续复评上下文。", status: "warn" },
        { title: "Agent 动作", text: "Agent 在观察窗口内提醒复评，不触发 P-2 维修案例命中。", status: "warn" },
      ],
      agentClosureText: "选择“继续观察”后生成观察记录，归档为复评样本，不触发 P-2 维修案例命中。",
    },
    {
      id: "falsePositive",
      label: "排除误报",
      isMaintenance: false,
      hint: "记录排除依据并反馈模型",
      impact: "排除误报不进入维修处置闭环：记录排除依据并生成模型反馈标签，不生成处置票卡。",
      archiveTitle: "长岭站 P-1 输油泵误报反馈归档",
      steps: ["记录排除依据", "生成模型反馈标签", "归档误报样本", "不生成处置票卡"],
      archiveCaseId: "FP-CL-P1-0722",
      archiveStatusText: "已归档为误报反馈样本，不解锁维修处置复用。",
      reportSections: [
        { title: "专家结论", text: "本轮排除维修处置，形成模型误报反馈记录。", status: "warn" },
        { title: "排除依据", text: "专家确认当前证据不足以生成处置票卡，保留为阈值解释样本。", status: "warn" },
        { title: "模型反馈", text: "样本进入规则和模型反馈池，不触发二次维修案例命中。", status: "warn" },
      ],
      agentClosureText: "选择“排除误报”后生成误报反馈，归档为模型反馈样本，不触发维修处置票卡。",
    },
  ],

  // 复核确认页用来支撑判断的证据测点，顺序与 caseKnowledge().firstPass.facts 的
  // "主触发 / 核心证据 / 并发证据"三条一致。原来写死在 scenes/confirm.js 里，
  // 而"这个案例靠哪几个测点成立"是典型的业务判定口径，属于数据而不是渲染逻辑。
  evidencePoints: ["P-DE-V", "COUP-PH", "BASE-V"],

  // 状态徽标文案：三色语义（danger/warn/ok）对应的中文说法。
  // 原来在 scenes/overview.js 和 scenes/station.js 里各存一份**逐字相同**的
  // BADGE_TEXT，业务改"时序预警"这个词得改两处，漏一处就两页说法不一致。
  //
  // aiFlag 那一组（conflict/gap/ok）原来在 scenes/workbench.js 里，不算重复，
  // 但同属"业务口径文案"，一起收进来：它决定巡检记录表格里那一列显示什么，
  // 以及 AI 建议卡的开头语。
  statusText: {
    badge: { danger: "时序预警", warn: "趋势关注", ok: "运行正常" },
    aiFlag: {
      conflict: { status: "danger", badge: "人机冲突", lead: "人机结论冲突：" },
      gap: { status: "warn", badge: "记录缺项", lead: "记录存在缺项：" },
      ok: { status: "ok", badge: "人机一致", lead: "人机结论一致：" },
    },
  },

  // overview 大屏顶部的 6 张状态卡。放在数据层而不是 scenes/overview.js 里，是因为
  // 它同时是两处的字典：
  //   1. scenes/overview.js 用它渲染卡片列表；
  //   2. core/state.js 的 cleanPick 用它校验持久化下来的 state.pick.overview。
  // 第 2 条是必须的：pick.overview 的语义是"大屏上哪张卡被选中"，字典就该是卡片集合。
  // 早先 cleanPick 拿"全部测点"（points，7 个）校验，而卡片只有 6 张——电机
  // MOT-DE-H 和密封 SEAL-L 没有对应卡。于是一份存着这两个值的旧 localStorage 能
  // 通过清洗，然后在 SelectList 的 activeId 校验处抛错，整个 overview 渲染中断，
  // 页面表现为"顶栏还在、stage 全空"。core/state.js 是 L4、scenes 是 L6，L4 不能
  // 反向引用 L6，所以名单必须落在更早的数据层，而不是在两处各抄一份。
  // UNIT-H 是派生的整机健康分，不在 points 表里，只在这份名单里。
  overviewCards: [
    { id: "UNIT-H", title: "机组健康" },
    { id: "P-DE-V", title: "振动峰值" },
    { id: "COUP-PH", title: "相位偏差" },
    { id: "BASE-V", title: "基础振动" },
    { id: "BRG-T", title: "轴承温度" },
    { id: "PUMP-P", title: "出口压力" },
  ],

  // 测点表：与 parts 解耦，靠 partId 关联。每个部位至少要有一个 primary:true 的测点，
  // 用来在 scripts/data/series.js 里派生该部位的 status（3D 热点、卡片状态色的唯一真源）。
  // type 取值是 anomalyMix() 的分类口径，白名单见 scripts/data/index.js 的 POINT_TYPES。
  points: [
    { id: "P-DE-V", partId: "front-bearing", label: "泵驱动端垂直振动", unit: "mm/s", base: 2.62, noise: 0.12, warn: 5.68, stop: 7.1, type: "不对中特征", primary: true },
    { id: "BRG-T", partId: "front-bearing", label: "驱动端轴承温度", unit: "°C", base: 59.6, noise: 0.5, warn: 70, type: "温升关注" },
    { id: "COUP-PH", partId: "coupling", label: "联轴器相位偏差", unit: "°", base: 24, noise: 1.5, warn: 70, stop: 100, type: "不对中特征", primary: true },
    { id: "BASE-V", partId: "base", label: "底座基础振动", unit: "mm/s", base: 1.12, noise: 0.08, warn: 3, stop: 4.5, type: "基础振动", primary: true },
    { id: "MOT-DE-H", partId: "motor", label: "电机驱动端水平振动", unit: "mm/s", base: 2.38, noise: 0.1, warn: 5.68, type: "轴承振动", primary: true },
    { id: "PUMP-P", partId: "pump-body", label: "泵出口压力", unit: "MPa", base: 6.40, noise: 0.04, warn: 6.8, type: "工况", primary: true },
    { id: "SEAL-L", partId: "seal", label: "密封泄漏观察", unit: "级", base: 0, noise: 0, warn: 1, type: "工况", primary: true },
  ],

  // 叙事旋钮：全演示叙事的唯一真源。anchorClock 对应 meta.clock，是"现在"（t=0）。
  // ramp 是加性偏移：区间外（startDay 之前）返回 0，区间内按 shape 缓动抬升到 to。
  // to 全部照抄现有硬编码值（dashboard.kpis / parts[].trend），保证与已验收版本连续。
  scenario: {
    anchorClock: "2026-07-22 16:31",
    ramps: [
      { unitId: "P-1", pointId: "P-DE-V", startDay: -5, endDay: 0, to: 5.82, shape: "accel" },
      { unitId: "P-1", pointId: "COUP-PH", startDay: -5, endDay: 0, to: 81, shape: "linear" },
      { unitId: "P-1", pointId: "BASE-V", startDay: -5, endDay: 0, to: 3.36, shape: "accel" },
      { unitId: "P-1", pointId: "MOT-DE-H", startDay: -5, endDay: 0, to: 4.18, shape: "linear" },
      { unitId: "P-1", pointId: "BRG-T", startDay: -5, endDay: 0, to: 68.4, shape: "linear" },
      { unitId: "P-2", pointId: "COUP-PH", startDay: -3, endDay: 0, to: 56, shape: "linear" },
      { unitId: "P-2", pointId: "P-DE-V", startDay: -3, endDay: 0, to: 4.96, shape: "linear" },
    ],
  },
};
