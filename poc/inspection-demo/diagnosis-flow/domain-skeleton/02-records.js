// 领域契约 02：报表（工作台左列的可点选记录表）。
//
// columns 声明的是**表格单元格的 key**，不是 records 的字段名——场景层负责把一条
// record 映射成 cells。因此校验器不能拿 columns[].key 去比对 records 的字段，只能
// 各自校各自的形状，外加"恰好一列 status-dot 且它的 key 是 aiFlag"这条硬约束
// （status-dot 列的取值来自行状态，cells 里不提供该 key）。
//
// aiFlag 是本页最重要的一个字段：它控制行状态色和 AI 建议卡的开头语。这里仍沿用
// conflict/gap/ok 三个 key，但展示文案按巡检演示重命名为重点复核 / 关注提醒 / 已闭环。
// aiFlagText 必须覆盖 records 里出现的每一个取值，未覆盖到的直接抛错，不静默退回默认文案。
window.DOMAIN_RECORDS = {
  columns: [
    { key: "aiFlag", label: "", type: "status-dot", width: 28 },
    { key: "formNo", label: "表单项", type: "text", width: 74 },
    { key: "area", label: "区域", type: "text", width: 96 },
    { key: "device", label: "设备", type: "text", width: 132 },
    { key: "item", label: "检查项", type: "text", width: 132 },
    { key: "result", label: "人工结果", type: "text", width: 132 },
    { key: "aiFlagText", label: "AI 质检", type: "badge-icon", width: 104 }
  ],

  records: [
    {
      id: "REC-001",
      objectId: "OBJ-A",
      partId: "PART-1",
      date: "2026-07-21",
      shift: "白班",
      inspector: "廖震宇",
      no: "106",
      area: "泵棚区",
      device: "P-3 泵 PT6903B",
      item: "出口管线压力",
      standard: "高报警 9.0MPa，高高报警 9.8MPa。",
      result: "现场读数 9.3MPa",
      aiFlag: "conflict",
      note: "该点位为安全联锁相关仪表，当前读数已越过高报警值 9.0MPa，未达到高高报警值 9.8MPa，系统提示巡检时核对现场表、趋势和上下游工况。"
    },
    {
      id: "REC-002",
      objectId: "OBJ-A",
      partId: "PART-2",
      date: "2026-04-24",
      shift: "白班",
      inspector: "湘潭站生产运维人员",
      no: "250",
      area: "配电间",
      device: "P6 泵高压柜",
      item: "表计及测显装置",
      standard: "柜面表计、测显装置应显示正常，综保无控制回路断线报警。",
      result: "无显示，已修复",
      aiFlag: "ok",
      note: "巡检发现开关柜上表计及测显装置无显示，经排查为操作柱接线松动，已完成修复并纳入复查。"
    },
    {
      id: "REC-003",
      objectId: "OBJ-A",
      partId: "PART-1",
      date: "2026-07-22",
      shift: "白班",
      inspector: "廖震宇",
      no: "138",
      area: "泵棚区",
      device: "P-3 泵",
      item: "大修前重点巡检",
      standard: "加强泄漏、压力、温度、运行情况、油位和外观检查。",
      result: "7月28日计划大修",
      aiFlag: "gap",
      note: "P-3 泵计划于 7月28日开展大修作业，本轮巡检需要提前关注泄漏、出口压力、温度、运行情况、油位和外观。"
    },
    {
      id: "REC-004",
      objectId: "OBJ-B",
      partId: "PART-1",
      date: "2026-07-18",
      shift: "白班",
      inspector: "相似站场巡检员",
      no: "106",
      area: "泵棚区",
      device: "P-3 泵 PT6903B",
      item: "出口管线压力",
      standard: "高报警 9.0MPa，高高报警 9.8MPa。",
      result: "现场读数接近高报",
      aiFlag: "conflict",
      note: "相似站场对照记录，用于验证当前站场不会误选其它对象记录。"
    },
    {
      id: "REC-005",
      objectId: "OBJ-A",
      partId: "PART-1",
      date: "2026-07-22",
      shift: "白班",
      inspector: "站场巡检班组",
      no: "107",
      area: "泵棚区",
      device: "P-3 泵",
      item: "油位与外观",
      standard: "油位应处于正常刻度，泵体外观无渗漏、异响和异常振动。",
      result: "油位正常，外观完好",
      aiFlag: "gap",
      note: "与 7月28日计划大修提醒联动，巡检人员需补充大修前基准照片，便于大修后对照。"
    }
  ],

  aiFlagText: {
    conflict: { status: "danger", badge: "重点复核", lead: "AI 提示该表单项需要重点复核：" },
    gap: { status: "warn", badge: "关注提醒", lead: "系统对该表单项给出巡检提醒：" },
    ok: { status: "ok", badge: "已闭环", lead: "该表单项与处置记录一致：" }
  }
};
