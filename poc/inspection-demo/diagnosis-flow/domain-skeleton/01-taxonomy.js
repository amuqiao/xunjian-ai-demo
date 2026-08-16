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
    { id: "OBJ-A", label: "长郴-湘潭站", short: "湘潭站", note: "本轮巡检表单质检站场" },
    { id: "OBJ-B", label: "长郴管道相似站场", short: "相似站", note: "历史相似记录对照站场" }
  ],

  parts: [
    {
      id: "PART-1",
      objectId: null,
      label: "泵棚区 P-3 泵出口管线",
      short: "P-3 出口管线",
      badge: "主线",
      component: "P-3 泵及出口压力仪表",
      summary: "关联 PT6903B 安全联锁阈值和 P-3 泵大修后重点巡检提醒。",
      checkItem: "压力联锁与大修前提醒"
    },
    {
      id: "PART-2",
      objectId: null,
      label: "配电间 P6 高压柜",
      short: "P6 高压柜",
      badge: "对照",
      component: "高压开关柜",
      summary: "湘潭站配电间近期巡检问题，表计及测显装置无显示，处置后纳入复查。",
      checkItem: "表计及测显装置复查"
    }
  ],

  // safeSide: "above" = 越大越安全（健康度、完好率）
  //           "below" = 越小越安全（差压、偏差、振动）
  points: [
    {
      id: "PT-1",
      partId: "PART-1",
      label: "PT6903B 出口压力",
      unit: "MPa",
      primary: true,
      threshold: 9,
      safeSide: "below"
    },
    {
      id: "PT-2",
      partId: "PART-1",
      label: "P-3 泵体温度",
      unit: "℃",
      primary: false,
      threshold: 75,
      safeSide: "below"
    },
    {
      id: "PT-3",
      partId: "PART-2",
      label: "控制回路电源状态",
      unit: "%",
      primary: true,
      threshold: 88,
      safeSide: "above"
    }
  ]
};
