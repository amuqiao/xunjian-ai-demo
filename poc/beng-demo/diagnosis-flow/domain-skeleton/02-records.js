// 领域契约 02：报表（工作台左列的可点选记录表）。
//
// columns 声明的是**表格单元格的 key**，不是 records 的字段名——场景层负责把一条
// record 映射成 cells。因此校验器不能拿 columns[].key 去比对 records 的字段，只能
// 各自校各自的形状，外加"恰好一列 status-dot 且它的 key 是 aiFlag"这条硬约束
// （status-dot 列的取值来自行状态，cells 里不提供该 key）。
//
// aiFlag 是本页最重要的一个字段：它控制行状态色和 AI 建议卡的开头语。这里仍沿用
// conflict/gap/ok 三个 key，但展示文案按泵课题演示重命名。
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
      date: "2026-07-22",
      shift: "夜班",
      inspector: "王建国",
      no: "18",
      area: "泵棚区",
      device: "P-1 输油泵联轴器",
      item: "联轴器对中状态",
      standard: "相位差关注线 60°，泵驱动端振动关注线 4.5mm/s。",
      result: "未见异常",
      aiFlag: "conflict",
      note: "人工记录未见异常，但振动趋势升至 5.82mm/s，联轴器相位差约 81°，2X 频谱突出，建议进入不对中复核。"
    },
    {
      id: "REC-002",
      objectId: "OBJ-A",
      partId: "PART-1",
      date: "2026-07-21",
      shift: "夜班",
      inspector: "王建国",
      no: "18",
      area: "泵棚区",
      device: "P-1 输油泵联轴器",
      item: "对中复核读数",
      standard: "巡检记录需填写对中复核读数或说明未复测原因。",
      result: "未填写读数",
      aiFlag: "gap",
      note: "同一巡检项前一日未填写联轴器对中复核读数，AI 质检提示连续缺项。"
    },
    {
      id: "REC-003",
      objectId: "OBJ-A",
      partId: "PART-2",
      date: "2026-07-20",
      shift: "中班",
      inspector: "李明",
      no: "06",
      area: "泵棚区",
      device: "P-1 泵底座",
      item: "底座基础振动和地脚状态",
      standard: "基础振动低于 3.5mm/s，地脚螺栓无松动。",
      result: "未见异常",
      aiFlag: "ok",
      note: "底座基础振动处于关注线附近但未越线，地脚状态无明显异常，作为并发证据留存。"
    },
    {
      id: "REC-004",
      objectId: "OBJ-B",
      partId: "PART-1",
      date: "2026-07-22",
      shift: "早班",
      inspector: "张伟",
      no: "18",
      area: "泵棚区",
      device: "P-2 输油泵联轴器",
      item: "联轴器对中状态",
      standard: "相位差关注线 60°，泵驱动端振动关注线 4.5mm/s。",
      result: "未见异常",
      aiFlag: "ok",
      note: "P-2 作为同站对照机组，振动和相位差未进入复核区间，用于状态清洗和对照数据校验。"
    },
    {
      id: "REC-005",
      objectId: "OBJ-A",
      partId: "PART-3",
      date: "2026-07-22",
      shift: "夜班",
      inspector: "王建国",
      no: "22",
      area: "泵棚区",
      device: "P-1 输油泵机械密封",
      item: "机械密封及泵体泄漏检查",
      standard: "机械密封端面、冲洗管路和泄漏回收口无明显油迹、液滴或油雾。",
      result: "轻微油迹",
      aiFlag: "conflict",
      note: "视觉模型识别密封区域疑似油迹，泄漏告警指数升至 0.81，建议进入密封泄漏复核。"
    },
    {
      id: "REC-006",
      objectId: "OBJ-A",
      partId: "PART-4",
      date: "2026-07-22",
      shift: "夜班",
      inspector: "王建国",
      no: "23",
      area: "泵棚区",
      device: "P-1 输油泵驱动端轴承",
      item: "轴承温度与润滑状态",
      standard: "轴承温度低于 75℃，润滑油位正常，无明显异响和异味。",
      result: "温度偏高",
      aiFlag: "conflict",
      note: "时序告警显示轴承温度持续抬升，热成像关键帧存在局部热斑，建议复核润滑和轴承状态。"
    },
    {
      id: "REC-007",
      objectId: "OBJ-A",
      partId: "PART-5",
      date: "2026-07-22",
      shift: "夜班",
      inspector: "王建国",
      no: "24",
      area: "泵棚区",
      device: "P-1 输油泵出口管线",
      item: "出口压力、流量和泵体异响",
      standard: "出口压力波动低于 0.35MPa，流量稳定，泵体无连续异响。",
      result: "压力波动",
      aiFlag: "conflict",
      note: "出口压力波动告警越过关注线，结合泵体异响记录和汽蚀损伤样例，建议复核运行工况。"
    }
  ],

  aiFlagText: {
    conflict: { status: "danger", badge: "重点复核", lead: "AI 提示该巡检项需要重点复核：" },
    gap: { status: "warn", badge: "记录缺项", lead: "该巡检项存在记录缺项：" },
    ok: { status: "ok", badge: "人机一致", lead: "人工记录与模型判读一致：" }
  }
};
