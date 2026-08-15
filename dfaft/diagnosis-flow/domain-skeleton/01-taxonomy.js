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
    { id: "OBJ-A", label: "占位对象 A", short: "A", note: "本轮主线对象" },
    { id: "OBJ-B", label: "占位对象 B", short: "B", note: "对照对象" }
  ],

  parts: [
    {
      id: "PART-1",
      objectId: null,
      label: "占位部位一",
      short: "部位一",
      badge: "主线",
      component: "占位构件",
      summary: "占位部位一的一句话说明，用于工作台摘要条。",
      checkItem: "占位检查项一"
    },
    {
      id: "PART-2",
      objectId: null,
      label: "占位部位二",
      short: "部位二",
      badge: "对照",
      component: "占位构件",
      summary: "占位部位二的一句话说明。",
      checkItem: "占位检查项二"
    }
  ],

  // safeSide: "above" = 越大越安全（健康度、完好率）
  //           "below" = 越小越安全（差压、偏差、振动）
  points: [
    {
      id: "PT-1",
      partId: "PART-1",
      label: "占位主测点",
      unit: "mm/s",
      primary: true,
      threshold: 4.5,
      safeSide: "below"
    },
    {
      id: "PT-2",
      partId: "PART-1",
      label: "占位副测点",
      unit: "℃",
      primary: false,
      threshold: 75,
      safeSide: "below"
    },
    {
      id: "PT-3",
      partId: "PART-2",
      label: "占位对照测点",
      unit: "%",
      primary: true,
      threshold: 88,
      safeSide: "above"
    }
  ]
};
