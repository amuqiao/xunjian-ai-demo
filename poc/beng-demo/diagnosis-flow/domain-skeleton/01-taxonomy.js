// 领域契约 01：对象树（对象 → 部位 → 测点）。
//
// parts[].objectId 为 null 表示"所有对象共用这套部位表"（物理布局相同的同型设备）。
// 这是显式语义，不是兜底：写 null 是一个声明，漏写字段则校验直接抛错。
//
// 每个部位必须恰好有一个 primary:true 的测点——它是该部位状态色的唯一派生依据。
// 0 个会让状态色算不出来、2 个会让"主测点"这个概念产生歧义，两者在运行期都不会
// 自己报错，所以必须在启动校验里卡死。
window.DOMAIN_TAXONOMY = {
  objects: [
    { id: "OBJ-A", label: "长岭站 P-1 输油泵", short: "P-1", note: "本轮主线诊断泵机组" },
    { id: "OBJ-B", label: "长岭站 P-2 输油泵", short: "P-2", note: "同站健康对照机组" }
  ],

  parts: [
    {
      id: "PART-1",
      objectId: null,
      label: "联轴器与泵驱动端",
      short: "联轴器",
      badge: "主线",
      component: "联轴器 / 泵驱动端轴承",
      summary: "P-1 联轴器相位差异常，泵驱动端振动升高，需复核是否存在不对中。",
      checkItem: "联轴器对中与振动复核"
    },
    {
      id: "PART-2",
      objectId: null,
      label: "底座基础与地脚",
      short: "底座基础",
      badge: "对照",
      component: "底座 / 地脚螺栓",
      summary: "底座基础振动和地脚状态作为并发证据，用于排查管道约束或基础松动。",
      checkItem: "底座基础振动和地脚状态"
    },
    {
      id: "PART-3",
      objectId: null,
      label: "机械密封与泄漏点",
      short: "机械密封",
      badge: "泄漏",
      component: "机械密封 / 泄漏回收口",
      summary: "机械密封区域出现泄漏风险，需复核油迹、液滴、冲洗管路和密封端面状态。",
      checkItem: "机械密封及泵体泄漏检查"
    },
    {
      id: "PART-4",
      objectId: null,
      label: "泵驱动端轴承",
      short: "驱动端轴承",
      badge: "温升",
      component: "驱动端轴承 / 润滑系统",
      summary: "轴承温度告警持续升高，需复核润滑、轴承游隙和热成像局部热斑。",
      checkItem: "轴承温度与润滑状态"
    },
    {
      id: "PART-5",
      objectId: null,
      label: "出口管线与泵体流道",
      short: "出口压力",
      badge: "工况",
      component: "出口管线 / 泵体流道",
      summary: "出口压力波动叠加泵体异响，需复核入口条件、阀位、过滤器压差和汽蚀风险。",
      checkItem: "出口压力、流量和泵体异响"
    },
    {
      id: "PART-6",
      objectId: null,
      label: "2号轴承与振动通道",
      short: "2号轴承",
      badge: "RAG",
      component: "2号轴承 / IMS 工单联动",
      summary: "2号轴承振动值异常上升，视觉证据排除泵体渗漏和联轴器明显偏移，RAG 命中历史轴承内圈剥落案例。",
      checkItem: "2号轴承振动与内圈剥落复核"
    }
  ],

  // safeSide: "above" = 越大越安全（健康度、完好率）
  //           "below" = 越小越安全（差压、偏差、振动）
  points: [
    {
      id: "PT-1",
      partId: "PART-1",
      label: "泵驱动端振动",
      unit: "mm/s",
      primary: true,
      threshold: 4.5,
      safeSide: "below"
    },
    {
      id: "PT-2",
      partId: "PART-1",
      label: "联轴器相位差",
      unit: "°",
      primary: false,
      threshold: 60,
      safeSide: "below"
    },
    {
      id: "PT-3",
      partId: "PART-2",
      label: "基础振动",
      unit: "mm/s",
      primary: true,
      threshold: 3.5,
      safeSide: "below"
    },
    {
      id: "PT-4",
      partId: "PART-3",
      label: "泄漏告警指数",
      unit: "级",
      primary: true,
      threshold: 0.7,
      safeSide: "below"
    },
    {
      id: "PT-5",
      partId: "PART-4",
      label: "轴承温度告警",
      unit: "℃",
      primary: true,
      threshold: 75,
      safeSide: "below"
    },
    {
      id: "PT-6",
      partId: "PART-5",
      label: "出口压力波动告警",
      unit: "MPa",
      primary: true,
      threshold: 0.35,
      safeSide: "below"
    },
    {
      id: "PT-7",
      partId: "PART-6",
      label: "2号轴承振动告警",
      unit: "mm/s",
      primary: true,
      threshold: 4.5,
      safeSide: "below"
    }
  ]
};
