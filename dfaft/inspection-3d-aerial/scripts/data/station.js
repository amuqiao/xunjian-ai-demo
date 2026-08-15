// window.DemoStation —— 3D 巡检地图的「12 区站场态势」数据层。
//
// 本文件定死整个 poc/inspection-3d-sandbox 项目的三维世界坐标系：后续 scripts/map3d/
// model-sandbox.js、model-satellite.js、engine.js 以及 data/track.js 的轨迹，全部
// 必须复用这里给出的 geom 数字，不能各自另起一套坐标。
//
// ==========================================================================
// 世界坐标系（Three.js 惯例）
// ==========================================================================
//   - Y 轴向上；地面铺在 XZ 平面（本文件所有 geom 的 y 分量恒为地面标高 0，
//     具体设备的挂高由 model 层自己处理，不在这里定义）。
//   - 原点 (0, 0) = 站场地块中心。
//   - X 轴向东为正，Z 轴向南为正（对应到平面图，从上往下看时 X 向右、Z 向下）。
//   - 站场地块实际尺寸 680（X）× 460（Z）世界单位。原始建议是「约 600×400」，
//     实测发现 row2 的四个室内区域要严格「零缝拼接连成一体」（见下方 ROW2 说明），
//     一旦四室之间没有缝隙，from row1 通道到 row3 边界唯一的路只剩绕开建筑群
//     东侧的一条支路——支路需要在建筑群东边界 (x=300) 和站场边界之间留出至少
//     20 个单位的通道宽度，600×400 放不下，所以放宽到 680×460。
//
// ASCII 坐标草图（西北角 / 东北角 / 西南角 / 东南角 世界坐标已标出）：
//
//   西北角 (-340,-230) ─────────────────────────────────── 东北角 (340,-230)
//        │                                                        │
//        │   row0 工艺区   z ∈ [-195,-115]                        │
//        │   launcher(x=-225) filter(x=-75) metering(x=75) regulate(x=225) │
//        │                                                        │
//        │  ┄┄ 走廊 A：z ∈ [-115,-45]，宽 70，本项目最宽的一条 ┄┄  │
//        │     （row0 与 row1 之间，向北接工艺区，向南接主通道）    │
//        │                                                        │
//        │   row1 主通道   z ∈ [-45,45]                            │
//        │   gate(x=-225)      [col1/col2 留空＝站内道路/轨迹主干]  blowdown(x=225) │
//        │                                                        │
//        │  ┄┄ 走廊 B：z ∈ [45,65]，宽 20 ┄┄                       │
//        │                                                        │
//        │   row2 建筑区（control/cabinet/ups/power 四室连体）     │
//        │   z ∈ [65,155]；x 从 -300 到 300 首尾零缝拼接，无内部缝隙│
//        │   control(-225) │ cabinet(-75) │ ups(75) │ power(225)  │
//        │                                                        │
//        │  ┄┄ 走廊 C（“南巡检道”）：z ∈ [155,165]，实际通行线取     │
//        │     z=165（对任意 x 都安全，见下方 genset/vent 边界值）  │
//        │     建筑群四室零缝拼接导致 row1→row3 无法直接贯穿，      │
//        │     track.js 靠 x=320 的东侧绕行支路（z 从 0 一直通到    │
//        │     165）从 row1 绕到这条南巡检道，再横向进任意一间。    │
//        │                                                        │
//        │   row3 边界；col0/col1 留空                              │
//        │       genset(x=75) z∈[175,215]  vent(x=225) z∈[185,215]│
//        │                                                        │
//   西南角 (-340,230) ─────────────────────────────────── 东南角 (340,230)
//
// 4 列 × 3 行 + 边界行的对应关系（列中心线 x 坐标固定为 -225/-75/75/225，
// 三行 + 边界行都复用同一组列中心线，方便 model 层按列对齐）：
//
//   row0 工艺区   launcher(col0) │ filter(col1)  │ metering(col2) │ regulate(col3)
//   row1 主通道   gate(col0)     │  道路/轨迹主干  │  道路/轨迹主干  │ blowdown(col3)
//   row2 建筑区   control(col0)  │ cabinet(col1) │ ups(col2)      │ power(col3)
//   row3 边界     —             │ —             │ genset(col2)   │ vent(col3)
//
// 布局依据（均来自 tools/area-mapping.py 引用的 附件1-3.xlsx「天然气站场」sheet
// 里真实的「正确状态」文字，不是随手摆的）：
//   - launcher → filter → metering → regulate 按天然气工艺流向从西向东排列
//     （收发球 → 过滤分离 → 计量 → 调压，与真实清管站工艺顺序一致）。
//   - control/cabinet/ups/power 四个室内区域的巡检标准原文都要求「门、窗、照明
//     应完好，房屋不漏水，有防止小动物进入措施」——这是同一栋综合值班楼里相邻
//     房间的典型表述，因此画成一栋建筑，四块地块首尾零缝拼接（geom 边界严格
//     相接、无重叠也无缝隙），不是四栋分离的小屋。
//   - vent（放空区）标准原文要求「放空区围栏应完好无损」「安全间距范围内无
//     违章建构筑物」——必须在站场边界、独立围栏、离建筑群最远，所以放在 row3
//     （边界行），且刻意比 genset 让出更大的间距：genset 北边界 z=175，离
//     row2 建筑群南边界(z=155) 只留 20 个单位；vent 北边界 z=185，留了 30
//     个单位，是全站离建筑群最远的区域。两者南边界都收在 z=215，离站场南
//     边界 z=230 还留 15 个单位的围栏/安全间距余量。
//   - genset（发电机房）标准原文强调「通风良好」「排烟」——画成敞开式棚，
//     同样贴边界（row3），但不需要像 vent 那样强制独立围栏，离建筑群的间距
//     可以比 vent 更近。
//   - blowdown（排污区）有敞口排污池——摆在 row1 的东端（col3），是工艺气流
//     下游、也是站场东侧，对应真实站场排污区常见的下风向布置。
//
// ==========================================================================
// 区域状态与「完成数」的派生规则（不允许手写第二份数字）
// ==========================================================================
// 每次调用 areas()/area()/statuses()/progress()/stationProgress() 都会现场从
// window.DemoItems.<areaId> 派生，不缓存、不另抄一份静态状态表：
//
//   1. status：该区任一巡检项 status==="danger" → 区域 "danger"；否则任一
//      "warn" → 区域 "warn"；否则 "ok"。这条表达的是"这个区有没有问题"。
//
//   2. itemDone：口径是"巡检人提交完成数"，恒等于该区总项数
//      window.Map3DContract.AREA_ITEM_COUNTS[areaId]，因为 256 条巡检项数据
//      模型里每条都带最终 status（ok/warn/danger 三态），没有"待巡检"这种
//      中间态——凡是在 window.DemoItems 里出现的项，都视为已提交。AI 复检
//      发现异常不会让"已提交数"变少，这与真实 App 的口径一致（区域行显示
//      49/49、任务卡显示"共12个，已完成12个"）。progress(id) 因此 ratio
//      恒为 1，这不是写死的偷懒实现，而是当前数据模型本身没有"未完成"这
//      个状态可以表达——如果后续要演示"执行中"剧本，需要先给 DemoItems 的
//      每条项目补一个 submitted/pending 之类的独立字段，而不是复用 status。
//
//   3. issueCount：该区 status !== "ok" 的项数，是与 itemDone 正交的独立
//      维度，表达"提交之后 AI 复检揪出多少问题"，对应真实 App 卡片底部的
//      红色 "?" 角标。
//
// 按当前 items-*.js 的剧本落点，派生结果应为：
//   gate     → status="danger"（gate-8 danger + gate-40 warn），issueCount=2
//   filter   → status="danger"（filter-4 danger），issueCount=1
//   其余 10 区 → status="ok"，issueCount=0
//   全站 issueCount=3，itemDone===itemTotal===256，areaDone===areaTotal===12
// 这段"预期结果"只是留给人核对用的注释，不在代码里断言——真正的断言在
// scratchpad 的冒烟脚本里跑。
(function () {
  "use strict";

  // ---- 12 区静态定义（顺序 = Map3DContract.AREA_IDS，含顺序全等）----
  // 这里只放"跟 DemoItems 无关"的静态字段：id/name/short/grid/geom/kind/icon/
  // sourceAreas/devices/summary/evidence。status/itemTotal/itemDone/issueCount
  // 全部在下面的 deriveArea() 里现场算，不写在这个静态表里。
  var AREA_DEFS = [
    {
      id: "gate",
      name: "进、出站区",
      short: "进出站",
      icon: "闸",
      grid: { col: 0, row: 1 },
      geom: { x: -225, z: 0, w: 110, d: 90, h: 5 },
      kind: "process",
      // xlsx 溯源：进站区 + 出站区两个原始 sheet 区域合并而来（大量气液联动
      // 阀执行机构条目左右两侧文字几乎相同，build-items.py 按 mergedFrom 记录
      // 了这次合并，详见 tools/area-mapping.py 的 GATE_SEQUENCE 注释）。
      sourceAreas: ["进站区", "出站区"],
      devices: [
        { kind: "进出站汇管", count: 2, note: "进站/出站汇管，工艺气流入口" },
        {
          kind: "气液联动阀执行机构(ESDV)",
          count: 5,
          note: "带气缸/动力气源管/三通梭阀/二次减压阀/消音器/复位手柄"
        },
        { kind: "电动执行机构阀", count: 3, note: "显示面板/指示灯/现场状态" },
        { kind: "安全阀", count: 3, note: "前后隔离阀+铅封" },
        { kind: "电控单元箱", count: 3, note: null },
        { kind: "压力表/压变/温变", count: 4, note: null },
        { kind: "清管器通过指示器", count: 1, note: null }
      ],
      summary:
        "进出站区 49 项已全部提交，AI 复检发现 1 项异常（二次减压阀安全泄放阀顶部" +
        "泄放口堵塞）与 1 项待关注（ESDV010401 气缸压力偏高），其余 47 项正常。",
      evidence: [
        "gate-8：二次减压阀泄放口堵塞",
        "gate-40：ESDV010401 气缸压力 3MPa 偏高",
        "其余 47 项正常"
      ]
    },
    {
      id: "filter",
      name: "过滤分离区",
      short: "过滤",
      icon: "滤",
      grid: { col: 1, row: 0 },
      geom: { x: -75, z: -155, w: 110, d: 80, h: 7 },
      kind: "process",
      sourceAreas: ["过滤分离区"],
      devices: [
        { kind: "立式过滤分离器", count: 3, note: "带附属桁架/滑动支座" },
        { kind: "差压表/匀速管流量计", count: 2, note: null },
        { kind: "快开盲板", count: 2, note: null },
        { kind: "杆式甲烷激光遥测仪", count: 1, note: "转动云台" }
      ],
      summary:
        "过滤分离区 17 项已全部提交，AI 复检发现 1 项异常：分离器差压 0.14MPa" +
        "超过标准上限 0.1MPa，其余 16 项正常。",
      evidence: [
        "filter-4：差压 0.14MPa 超标准 0.1MPa",
        "立式过滤分离器 3 台",
        "其余 16 项正常"
      ]
    },
    {
      id: "metering",
      name: "计量区",
      short: "计量",
      icon: "计",
      grid: { col: 2, row: 0 },
      geom: { x: 75, z: -155, w: 110, d: 80, h: 3 },
      kind: "process",
      sourceAreas: ["去XX用户分输计量区"],
      devices: [
        { kind: "超声波流量计管路", count: 3, note: "上下游直管段，并联布置" },
        { kind: "温度计/压力表/温压变送器", count: 4, note: null },
        { kind: "计量配电盘", count: 1, note: null }
      ],
      summary: "计量区 19 项已全部提交且全部正常，超声波流量计管路运行平稳。",
      evidence: [
        "19 项全部正常",
        "超声波流量计管路 3 路并联",
        "温压变送器读数正常"
      ]
    },
    {
      id: "regulate",
      name: "调压区",
      short: "调压",
      icon: "压",
      grid: { col: 3, row: 0 },
      geom: { x: 225, z: -155, w: 110, d: 80, h: 4 },
      kind: "process",
      sourceAreas: ["去XX用户分输调压区"],
      devices: [
        { kind: "调压橇", count: 2, note: "调压阀+指挥器+保温层" },
        { kind: "防爆电加热器", count: 2, note: "卧式罐体+呼吸口" },
        { kind: "电伴热缠绕管线", count: 1, note: null },
        { kind: "安全阀", count: 2, note: null }
      ],
      summary: "调压区 19 项已全部提交且全部正常，调压橇与电加热器运行平稳。",
      evidence: [
        "19 项全部正常",
        "调压橇 2 台运行平稳",
        "电伴热缠绕管线完好"
      ]
    },
    {
      id: "vent",
      name: "放空区",
      short: "放空",
      icon: "放",
      grid: { col: 3, row: 3 },
      // z 中心 200、深 30 → z∈[185,215]：北边界 185，比 genset 的北边界 175
      // 离 row2 建筑群（南边界 155）更远，体现"离建筑群最远"。
      geom: { x: 225, z: 200, w: 100, d: 30, h: 12 },
      kind: "boundary",
      sourceAreas: ["站场周边及放空区"],
      devices: [
        { kind: "高杆放空立管", count: 1, note: "三向拉线+底部排水阀" },
        { kind: "点火控制盘落地柜", count: 1, note: null },
        { kind: "独立围栏", count: 1, note: null },
        { kind: "警示牌", count: 2, note: null }
      ],
      summary: "放空区 7 项已全部提交且全部正常，独立围栏完好，安全间距内无违章建构筑物。",
      evidence: ["7 项全部正常", "独立围栏完好", "高杆放空立管三向拉线完好"]
    },
    {
      id: "blowdown",
      name: "排污区",
      short: "排污",
      icon: "污",
      grid: { col: 3, row: 1 },
      geom: { x: 225, z: 0, w: 100, d: 90, h: 4 },
      kind: "process",
      sourceAreas: ["排污区"],
      devices: [
        { kind: "卧式排污罐", count: 1, note: "滑动端支座" },
        { kind: "排污滑片泵", count: 2, note: null },
        { kind: "泵配电箱", count: 1, note: null },
        { kind: "液位计/液位变送器", count: 2, note: null },
        { kind: "敞口排污池", count: 1, note: null }
      ],
      summary: "排污区 8 项已全部提交且全部正常，排污泵与排污池状态良好。",
      evidence: ["8 项全部正常", "排污滑片泵运行正常", "敞口排污池无异常"]
    },
    {
      id: "cabinet",
      name: "机柜间",
      short: "机柜",
      icon: "柜",
      grid: { col: 1, row: 2 },
      geom: { x: -75, z: 110, w: 150, d: 90, h: 6 },
      kind: "room",
      sourceAreas: ["综合机柜间"],
      devices: [
        {
          kind: "室内机柜阵列",
          count: 10,
          note:
            "光通信柜/卫星周界工业电视柜/高频开关电源柜/恒电位仪柜/电加热器" +
            "控制柜/PLC·ESD(SIS)柜/网络柜/消防报警柜/流量计算机柜S600/调压控制柜"
        },
        { kind: "顶部空调冷媒管", count: 2, note: null }
      ],
      summary:
        "机柜间 67 项已全部提交且全部正常，10 列机柜与空调冷媒管运行正常，" +
        "是全站巡检项最多的区域。",
      evidence: [
        "67 项全部正常（全站最多）",
        "PLC·ESD(SIS) 柜运行正常",
        "顶部空调冷媒管无泄漏"
      ]
    },
    {
      id: "power",
      name: "配电间",
      short: "配电",
      icon: "电",
      grid: { col: 3, row: 2 },
      geom: { x: 225, z: 110, w: 150, d: 90, h: 6 },
      kind: "room",
      // xlsx 溯源：高压配电间 + 低压配电室 + 变压器室三个原始 sheet 区域合并
      // （18 = 高压8 + 低压6 + 变压器室4，口径见 tools/area-mapping.py 顶部注释）。
      sourceAreas: ["高压配电间", "低压配电室", "变压器室"],
      devices: [
        { kind: "高压开关柜列", count: 3, note: "35kV/10kV/400V" },
        { kind: "低压配电柜", count: 2, note: null },
        { kind: "变压器", count: 2, note: "油浸式带储油柜/压力释放器" },
        { kind: "电缆沟盖板", count: 1, note: null }
      ],
      summary: "配电间 18 项已全部提交且全部正常，高低压开关柜与变压器运行正常。",
      evidence: [
        "18 项全部正常",
        "油浸式变压器油位/油温正常",
        "高压开关柜 3 列运行正常"
      ]
    },
    {
      id: "control",
      name: "站控室",
      short: "站控",
      icon: "控",
      grid: { col: 0, row: 2 },
      geom: { x: -225, z: 110, w: 150, d: 90, h: 6 },
      kind: "room",
      sourceAreas: ["站控室"],
      devices: [
        { kind: "操作台+站控机双屏", count: 1, note: null },
        { kind: "ESD 紧急停车按钮", count: 1, note: null },
        { kind: "火灾报警控制器", count: 1, note: null },
        { kind: "防爆扩音号角扬声器", count: 2, note: null },
        { kind: "工业电视监视墙", count: 1, note: null },
        { kind: "配电箱", count: 1, note: null },
        { kind: "放空点火控制柜", count: 1, note: null }
      ],
      summary: "站控室 19 项已全部提交且全部正常，站控机、ESD 按钮与火灾报警系统均正常。",
      evidence: ["19 项全部正常", "站控机双屏显示正常", "ESD 紧急停车按钮完好"]
    },
    {
      id: "genset",
      name: "发电机棚",
      short: "发电",
      icon: "机",
      grid: { col: 2, row: 3 },
      // z 中心 195、深 40 → z∈[175,215]：北边界 175，离 row2 建筑群
      // （南边界 155）留 20 个单位的走廊 C 间距。
      geom: { x: 75, z: 195, w: 90, d: 40, h: 5 },
      kind: "boundary",
      sourceAreas: ["发电机房"],
      devices: [
        { kind: "燃气/柴油发电机组", count: 1, note: "机体+冷却风扇+排烟管" },
        { kind: "启动蓄电池组", count: 1, note: null },
        { kind: "燃气管线", count: 1, note: null },
        { kind: "可燃气体探测器", count: 2, note: null }
      ],
      summary: "发电机棚 7 项已全部提交且全部正常，机组通风与可燃气体探测器状态良好。",
      evidence: ["7 项全部正常", "发电机组冷却风扇运行正常", "可燃气体探测器无报警"]
    },
    {
      id: "ups",
      name: "UPS室",
      short: "UPS",
      icon: "UPS",
      grid: { col: 2, row: 2 },
      geom: { x: 75, z: 110, w: 150, d: 90, h: 6 },
      kind: "room",
      // xlsx 溯源：UPS室原有 11 项全部保留，另从"蓄电池间"借 1 项补足到 12
      // （UPS_BORROW，tools/area-mapping.py 里有记录，不是凭空多出来的）。
      sourceAreas: ["UPS室", "蓄电池间"],
      devices: [
        { kind: "UPS 控制机柜", count: 2, note: "风扇+直流母线" },
        { kind: "机组火气系统 UPS 控制柜", count: 1, note: null },
        { kind: "蓄电池架", count: 2, note: "多层电池组" },
        { kind: "空调", count: 1, note: null },
        { kind: "感温感烟探测器", count: 2, note: null }
      ],
      summary:
        "UPS室 12 项已全部提交且全部正常（含 1 项蓄电池间借用条目），" +
        "控制机柜与蓄电池架状态良好。",
      evidence: ["12 项全部正常", "UPS 控制机柜风扇运行正常", "蓄电池架无鼓包渗液"]
    },
    {
      id: "launcher",
      name: "收发球区",
      short: "收发球",
      icon: "球",
      grid: { col: 0, row: 0 },
      geom: { x: -225, z: -155, w: 110, d: 80, h: 4 },
      kind: "process",
      sourceAreas: ["收发球区"],
      devices: [
        { kind: "卧式收发球筒", count: 2, note: "发球筒+收球筒" },
        { kind: "收发球架", count: 2, note: null },
        { kind: "快开盲板", count: 2, note: null },
        { kind: "清管器通过指示器", count: 1, note: null },
        { kind: "压力表/压变", count: 2, note: null },
        { kind: "手动执行机构阀", count: 2, note: null }
      ],
      summary: "收发球区 14 项已全部提交且全部正常，收发球筒与清管器通过指示器状态良好。",
      evidence: ["14 项全部正常", "收发球筒2座状态良好", "清管器通过指示器正常"]
    }
  ];

  var AREA_DEF_BY_ID = {};
  AREA_DEFS.forEach(function (def) {
    AREA_DEF_BY_ID[def.id] = def;
  });

  function contract() {
    if (!window.Map3DContract) {
      throw new Error("window.Map3DContract 未加载：station.js 必须晚于 map3d/contract.js 加载");
    }
    return window.Map3DContract;
  }

  // 现场从 window.DemoItems.<areaId> 读取，不缓存——改剧本只改 items-*.js，
  // 这里自动跟着变。
  function areaItems(id) {
    var items = window.DemoItems && window.DemoItems[id];
    if (!Array.isArray(items)) {
      throw new Error(
        "window.DemoItems." + id + " 不是数组，请确认 items-entry.js/items-process.js/" +
        "items-room.js 已在 station.js 之前加载"
      );
    }
    var expected = contract().AREA_ITEM_COUNTS[id];
    if (items.length !== expected) {
      throw new Error("区域 " + id + " 的巡检项数为 " + items.length + "，应为 " + expected);
    }
    return items;
  }

  function deriveStatus(items) {
    var hasDanger = items.some(function (item) { return item.status === "danger"; });
    if (hasDanger) return "danger";
    var hasWarn = items.some(function (item) { return item.status === "warn"; });
    if (hasWarn) return "warn";
    return "ok";
  }

  function deriveIssueCount(items) {
    return items.filter(function (item) { return item.status !== "ok"; }).length;
  }

  // 把静态定义 + 派生字段拼成一份完整的区域对象（每次现场拼，不缓存）。
  function buildArea(def) {
    var items = areaItems(def.id);
    var itemTotal = contract().AREA_ITEM_COUNTS[def.id];
    return {
      id: def.id,
      name: def.name,
      short: def.short,
      icon: def.icon,
      grid: { col: def.grid.col, row: def.grid.row },
      geom: {
        x: def.geom.x, z: def.geom.z,
        w: def.geom.w, d: def.geom.d, h: def.geom.h
      },
      kind: def.kind,
      itemTotal: itemTotal,
      // itemDone 恒等于 itemTotal：口径是"提交完成数"，不是"合格数"，
      // 详见文件头注释「区域状态与完成数的派生规则」第 2 条。
      itemDone: itemTotal,
      status: deriveStatus(items),
      issueCount: deriveIssueCount(items),
      sourceAreas: def.sourceAreas.slice(),
      devices: def.devices.map(function (device) {
        return { kind: device.kind, count: device.count, note: device.note };
      }),
      summary: def.summary,
      evidence: def.evidence.slice()
    };
  }

  function meta() {
    var c = contract();
    return {
      id: "yongzhou-qingguan-zhan",
      fullName: "新气管道广西支干线永州分输清管站",
      shortName: "广西支干线永州站",
      yard: { w: 680, d: 460 },
      areaTotal: c.AREA_IDS.length,
      itemTotal: c.TOTAL_ITEMS
    };
  }

  function areas() {
    return contract().AREA_IDS.map(function (id) {
      return buildArea(AREA_DEF_BY_ID[id]);
    });
  }

  function area(id) {
    var def = AREA_DEF_BY_ID[id];
    if (!def) throw new Error("未知区域：" + id);
    return buildArea(def);
  }

  function statuses() {
    var result = {};
    // 顺序必须 = Map3DContract.AREA_IDS，供 Map3DContract.assertIdSet 校验，
    // 也供 map3d/engine.js 的 setStatuses 直接消费。
    contract().AREA_IDS.forEach(function (id) {
      result[id] = area(id).status;
    });
    return result;
  }

  function progress(id) {
    var a = area(id);
    return {
      done: a.itemDone,
      total: a.itemTotal,
      // ratio 恒为 1：见文件头「区域状态与完成数的派生规则」第 2 条，
      // 当前数据模型没有"待巡检"中间态，不是写死的偷懒实现。
      ratio: a.itemDone / a.itemTotal
    };
  }

  function stationProgress() {
    var list = areas();
    var itemDone = 0;
    var itemTotal = 0;
    var issueCount = 0;
    list.forEach(function (a) {
      itemDone += a.itemDone;
      itemTotal += a.itemTotal;
      issueCount += a.issueCount;
    });
    return {
      itemDone: itemDone,
      itemTotal: itemTotal,
      areaDone: list.length,
      areaTotal: list.length,
      issueCount: issueCount
    };
  }

  window.DemoStation = {
    meta: meta,
    areas: areas,
    area: area,
    statuses: statuses,
    progress: progress,
    stationProgress: stationProgress
  };
})();
