// window.DemoTrack —— 巡检人轨迹数据层。
//
// 坐标系与 station.js 完全同一套（Y 轴向上，地面在 XZ 平面，原点=站场中心，
// X 向东为正，Z 向南为正）。所有轨迹点的 x/z 都是站场世界坐标，y 统一取 0.6
// （略高于地面，避免 TubeGeometry 与地面 z-fighting）。
//
// ==========================================================================
// 走线设计：为什么这条折线长这样
// ==========================================================================
// 巡检动线（真实巡检顺序，工艺区绕行后进建筑区收尾）：
//   进出站区(gate) → 收发球区(launcher) → 过滤分离区(filter) → 计量区(metering)
//   → 调压区(regulate) → 排污区(blowdown) → 放空区(vent) → 发电机棚(genset)
//   → 配电间(power) → UPS室(ups) → 机柜间(cabinet) → 站控室(control，终点)
//
// 每个区域的 waypoint 严格取该区 station.js geom 的边缘（贴着走廊那一侧），
// 不进入区域体块内部——用"点是否在矩形内部"判定时用的是开区间（不含边界），
// 所以正好落在边缘上的点算作"在走廊上"，不算"穿进区域"。
//
//   1. row0 与 row1 之间是走廊 A（z ∈ [-115,-45]），row0 四个工艺区的南边界
//      正好是 z=-115，这条线本身就是一条贯穿全宽的安全线：gate→launcher 走
//      x=-225 这条竖线，launcher→filter→metering→regulate 沿 z=-115 这条
//      横线从西走到东，全程贴着 row0 各区的南边界，不会撞进任何区域。
//   2. regulate→blowdown：blowdown 的东边界正好是 x=275，从 regulate 的
//      南边界(225,-115) 先东移到 (275,-115)（仍在 regulate 边界线上），再
//      沿 x=275 这条竖线南下到 (275,0)，正好落在 blowdown 的东边界上。
//   3. blowdown→vent：这一段是全轨迹里唯一需要"绕路"的地方。row2 的四个
//      室内区域（control/cabinet/ups/power）零缝拼接、x 从 -300 到 300 首尾
//      相接，没有任何缝隙可以从 row1 直接穿到 row3。所以轨迹从 blowdown 的
//      东边界 (275,0) 继续东移到 (320,0)——x=320 已经越过 power 的东边界
//      (x=300)，然后沿 x=320 这条竖线一路南下到 z=165（南巡检道），绕开
//      整个建筑群，再折向西进入 vent 的北边界 (225,185)。
//   4. vent→genset→power→ups→cabinet→control：这一段全程沿 z=165 的南巡检道
//      （row2 南边界 z=155 与 row3 最近的北边界 z=175 之间，对任意 x 都是空的，
//      实际通行线取 z=165）东西移动，每到一个区域的正下方就往北/南各"探"一
//      小段到该区边界，探完再退回 z=165 继续走。vent/genset 在 row3，探的
//      方向是北（genset 到北边界 z=175，vent 到北边界 z=185——vent 的间距
//      比 genset 大，见 station.js 里"离建筑群最远"的布局依据）；
//      power/ups/cabinet/control 在 row2，探的方向是南（到它们的南边界
//      z=155）。genset(x=75)→power(x=225) 是这段里唯一的东西向"回头路"——
//      这是原始需求给定的真实巡检顺序本身就是这样绕的，不是本文件设计出来
//      的迂回。
//
// 轨迹总点数 47（含 12 个 waypoint），区域间用 1~3 个中间点连接，落在
// scratchpad 冒烟脚本用 node --check 之外单独跑的矩形碰撞检测里核对过。
//
// ==========================================================================
// atMinute 的加权分配
// ==========================================================================
// 真实耗时 63 分钟（09:02:25 → 10:05:18）。按每个区域的巡检项数
// （window.Map3DContract.AREA_ITEM_COUNTS）在巡检顺序上做累计占比分配：
// atMinute(区域) = 该区域及之前所有区域项数之和 / 256 * 63。
//
//   区域        项数  累计项数  atMinute（累计完成时刻，分钟）
//   gate         49      49      12.06
//   launcher     14      63      15.50
//   filter       17      80      19.69
//   metering     19      99      24.36
//   regulate     19     118      29.03
//   blowdown      8     126      31.01
//   vent          7     133      32.74
//   genset        7     140      34.45
//   power        18     158      38.88
//   ups          12     170      41.84
//   cabinet      67     237      58.32   ← 停留时长 16.48 分钟，全程最长，
//                                            与机柜间 67 项占比最大对应
//   control      19     256      63.00   ← 终点
(function () {
  "use strict";

  var Y = 0.6;

  function p(x, z) { return [x, Y, z]; }

  // 完整折线：47 个点，用于 CatmullRomCurve3 + TubeGeometry。
  var POINTS = [
    p(-225, -45),  // 1  gate waypoint（row0/row1 走廊 A 北端，gate 北边界）
    p(-225, -65),  // 2  走廊 A 内
    p(-225, -95),  // 3  走廊 A 内
    p(-225, -115), // 4  launcher waypoint（launcher 南边界）
    p(-175, -115), // 5  沿 row0 南边界东移
    p(-125, -115), // 6
    p(-75, -115),  // 7  filter waypoint（filter 南边界）
    p(-25, -115),  // 8
    p(25, -115),   // 9
    p(75, -115),   // 10 metering waypoint（metering 南边界）
    p(125, -115),  // 11
    p(175, -115),  // 12
    p(225, -115),  // 13 regulate waypoint（regulate 南边界）
    p(250, -115),  // 14 沿 regulate 南边界继续东移，为转向 blowdown 做准备
    p(275, -115),  // 15 regulate 南边界东端（同时是 blowdown 东边界的正北延长线）
    p(275, -75),   // 16 沿 blowdown 东边界竖线南下
    p(275, -30),   // 17
    p(275, 0),     // 18 blowdown waypoint（blowdown 东边界）
    p(300, 0),     // 19 东移越过 power 东边界(x=300)
    p(320, 0),     // 20 东侧绕行支路，越过建筑群
    p(320, 40),    // 21 沿 x=320 竖线南下
    p(320, 90),    // 22
    p(320, 140),   // 23
    p(320, 165),   // 24 抵达南巡检道（走廊 C）
    p(270, 165),   // 25 沿走廊 C 西移
    p(225, 165),   // 26 对准 vent 的 x
    p(225, 185),   // 27 vent waypoint（vent 北边界，比 genset 多让出 10 个单位）
    p(225, 165),   // 28 退回走廊 C
    p(150, 165),   // 29 继续西移
    p(75, 165),    // 30 对准 genset 的 x
    p(75, 175),    // 31 genset waypoint（genset 北边界）
    p(75, 165),    // 32 退回走廊 C
    p(150, 165),   // 33 回头东移（真实巡检顺序 genset→power 本身就是回头路）
    p(225, 165),   // 34 对准 power 的 x
    p(225, 155),   // 35 power waypoint（power 南边界）
    p(225, 165),   // 36 退回走廊 C
    p(150, 165),   // 37 西移
    p(75, 165),    // 38 对准 ups 的 x
    p(75, 155),    // 39 ups waypoint（ups 南边界）
    p(75, 165),    // 40 退回走廊 C
    p(0, 165),     // 41 继续西移
    p(-75, 165),   // 42 对准 cabinet 的 x
    p(-75, 155),   // 43 cabinet waypoint（cabinet 南边界）
    p(-75, 165),   // 44 退回走廊 C
    p(-150, 165),  // 45 继续西移
    p(-225, 165),  // 46 对准 control 的 x
    p(-225, 155)   // 47 control waypoint（control 南边界）—— 终点
  ];

  // 12 个区域 waypoint：与 POINTS 里对应下标共享同一份坐标（不是另外重新
  // 写一遍数字），顺序 = 真实巡检动线，不是 Map3DContract.AREA_IDS 的顺序。
  var WAYPOINTS = [
    { areaId: "gate", point: POINTS[0], atMinute: 12.06 },
    { areaId: "launcher", point: POINTS[3], atMinute: 15.50 },
    { areaId: "filter", point: POINTS[6], atMinute: 19.69 },
    { areaId: "metering", point: POINTS[9], atMinute: 24.36 },
    { areaId: "regulate", point: POINTS[12], atMinute: 29.03 },
    { areaId: "blowdown", point: POINTS[17], atMinute: 31.01 },
    { areaId: "vent", point: POINTS[26], atMinute: 32.74 },
    { areaId: "genset", point: POINTS[30], atMinute: 34.45 },
    { areaId: "power", point: POINTS[34], atMinute: 38.88 },
    { areaId: "ups", point: POINTS[38], atMinute: 41.84 },
    { areaId: "cabinet", point: POINTS[42], atMinute: 58.32 },
    { areaId: "control", point: POINTS[46], atMinute: 63.00 }
  ];

  var DURATION_MIN = 63;

  function clonePoint(pt) { return [pt[0], pt[1], pt[2]]; }

  function track() {
    var points = POINTS.map(clonePoint);
    var waypoints = WAYPOINTS.map(function (wp) {
      return { areaId: wp.areaId, point: clonePoint(wp.point), atMinute: wp.atMinute };
    });
    var end = clonePoint(POINTS[POINTS.length - 1]);
    return {
      points: points,
      start: clonePoint(POINTS[0]),
      end: end,
      // 巡检人当前位置：演示定格在轨迹终点（站控室，最后一个 waypoint）。
      walker: { point: clonePoint(end), atMinute: DURATION_MIN, areaId: "control" },
      waypoints: waypoints,
      // 尚无真实米制换算表，1 单位 = Three.js 世界单位，与 station.js 的
      // geom 同一套坐标系，不代表具体米数。
      distanceUnit: "world-unit",
      durationMin: DURATION_MIN
    };
  }

  window.DemoTrack = {
    track: track
  };
})();
