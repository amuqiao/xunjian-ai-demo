// 领域契约 02：报表（工作台左列的可点选记录表）。
//
// columns 声明的是**表格单元格的 key**，不是 records 的字段名——场景层负责把一条
// record 映射成 cells。因此校验器不能拿 columns[].key 去比对 records 的字段，只能
// 各自校各自的形状，外加"恰好一列 status-dot 且它的 key 是 aiFlag"这条硬约束
// （status-dot 列的取值来自行状态，cells 里不提供该 key）。
//
// aiFlag 是本页最重要的一个字段：它是"人工记录"和"模型判读"之间的关系，三态
// conflict/gap/ok 直接决定行状态色和 AI 建议卡的开头语。aiFlagText 必须覆盖
// records 里出现的每一个取值，未覆盖到的直接抛错，不静默退回默认文案。
window.DOMAIN_RECORDS = {
  columns: [
    { key: "aiFlag", label: "", type: "status-dot", width: 28 },
    { key: "dateShift", label: "时间", type: "text", width: 128 },
    { key: "partLabel", label: "部位", type: "text", width: 96 },
    { key: "item", label: "检查项", type: "text", width: 140 },
    { key: "result", label: "人工结果", type: "text", width: 120 },
    { key: "aiFlagText", label: "AI 质检", type: "badge-icon", width: 104 }
  ],

  records: [
    {
      id: "REC-001",
      objectId: "OBJ-A",
      partId: "PART-1",
      date: "2026-07-22",
      shift: "夜班",
      inspector: "占位记录人甲",
      item: "占位检查项一",
      result: "占位人工结果：正常",
      aiFlag: "conflict",
      note: "占位备注：人工填写正常，模型判读异常。"
    },
    {
      id: "REC-002",
      objectId: "OBJ-A",
      partId: "PART-2",
      date: "2026-07-22",
      shift: "早班",
      inspector: "占位记录人乙",
      item: "占位检查项二",
      result: "占位人工结果：正常",
      aiFlag: "ok",
      note: "占位备注：人机一致。"
    },
    {
      id: "REC-003",
      objectId: "OBJ-A",
      partId: "PART-1",
      date: "2026-07-21",
      shift: "夜班",
      inspector: "占位记录人甲",
      item: "占位检查项一",
      result: "",
      aiFlag: "gap",
      note: "占位备注：该项未填写。"
    },
    {
      id: "REC-004",
      objectId: "OBJ-B",
      partId: "PART-1",
      date: "2026-07-22",
      shift: "夜班",
      inspector: "占位记录人丙",
      item: "占位检查项一",
      result: "占位人工结果：正常",
      aiFlag: "conflict",
      note: "占位备注：二次命中演示用的相似记录。"
    }
  ],

  aiFlagText: {
    conflict: { status: "danger", badge: "人机冲突", lead: "人工记录与模型判读不一致：" },
    gap: { status: "warn", badge: "记录缺项", lead: "该项人工记录缺失：" },
    ok: { status: "ok", badge: "人机一致", lead: "人工记录与模型判读一致：" }
  }
};
