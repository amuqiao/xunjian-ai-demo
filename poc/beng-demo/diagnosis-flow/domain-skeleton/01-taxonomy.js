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
    }
  ]
};
