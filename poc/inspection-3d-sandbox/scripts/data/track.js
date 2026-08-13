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
// atMinute 的权威来源：window.DemoSeries.patrolMinutes()
// ==========================================================================
// 真实耗时 63 分钟（09:02:25 → 10:05:18）。每区分钟数由 scripts/data/series.js
// 的 apportionMinutes()（63 分钟按 12 区项数、最大余数法加权）算出，本文件
// 只按真实巡检顺序把这些整数分钟数累计起来，不再自己重新计算一遍占比——
// 这里曾经各自维护一份连续小数版的累计时刻（gate=12.06、cabinet 停留 16.48
// 分钟），与 series.js 整数版的分配（gate=12、cabinet=16）是同一个数字的两套
// 独立实现，剧本调整巡检项之后两处很容易对不上（"图上说机柜间用了 16 分钟、
// 轨迹动画却走了 16.49 分钟"）。2026-08-13 收口：两处统一调用
// DemoSeries.patrolMinutes()，本文件只负责按下面这条真实巡检顺序把它累计成
// 每个 waypoint 的到达时刻。
//
//   区域（真实巡检顺序）  该区分钟数  累计到达时刻（分钟）
//   gate                      12          12
//   launcher                   3          15
//   filter                     4          19
//   metering                   5          24
//   regulate                   5          29
//   blowdown                   2          31
//   vent                       2          33
//   genset                     2          35
//   power                      4          39
//   ups                        3          42
//   cabinet                   16          58   ← 停留时长最长，全程最长，
//                                                   与机柜间 67 项占比最大对应
//   control                    5          63   ← 终点
// 这段"预期结果"只是留给人核对用的注释，不在代码里断言。
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

  // 12 个区域 waypoint 的位置与真实巡检顺序：与 POINTS 里对应下标共享同一份坐标
  // （不是另外重新写一遍数字），顺序 = 真实巡检动线，不是 Map3DContract.AREA_IDS
  // 的顺序。atMinute 不再是这里的字面量——见上方"权威来源"注释，改由 track() 现场
  // 调用 window.DemoSeries.patrolMinutes() 按这个顺序累计算出。
  var WAYPOINT_DEFS = [
    { areaId: "gate", point: POINTS[0] },
    { areaId: "launcher", point: POINTS[3] },
    { areaId: "filter", point: POINTS[6] },
    { areaId: "metering", point: POINTS[9] },
    { areaId: "regulate", point: POINTS[12] },
    { areaId: "blowdown", point: POINTS[17] },
    { areaId: "vent", point: POINTS[26] },
    { areaId: "genset", point: POINTS[30] },
    { areaId: "power", point: POINTS[34] },
    { areaId: "ups", point: POINTS[38] },
    { areaId: "cabinet", point: POINTS[42] },
    { areaId: "control", point: POINTS[46] }
  ];

  function clonePoint(pt) { return [pt[0], pt[1], pt[2]]; }

  // 按 WAYPOINT_DEFS 的真实巡检顺序，把 DemoSeries.patrolMinutes() 给出的每区
  // 分钟数累计成每个 waypoint 的到达时刻。现场计算、不缓存——series.js 的剧本
  // 调整会自动传导到这里，不需要人工同步。
  function buildWaypoints() {
    if (!window.DemoSeries || typeof window.DemoSeries.patrolMinutes !== "function") {
      throw new Error(
        "window.DemoSeries.patrolMinutes 不存在：track.js 必须在 series.js 之后加载，" +
        "两者共用同一份 63 分钟分配算法（见本文件头部注释）"
      );
    }
    var minutesByArea = window.DemoSeries.patrolMinutes();
    var cumulative = 0;
    return WAYPOINT_DEFS.map(function (def) {
      var minutes = minutesByArea[def.areaId];
      if (typeof minutes !== "number") {
        throw new Error("DemoSeries.patrolMinutes() 缺少区域 " + def.areaId + " 的分钟数");
      }
      cumulative += minutes;
      return { areaId: def.areaId, point: clonePoint(def.point), atMinute: cumulative };
    });
  }

  function track() {
    var points = POINTS.map(clonePoint);
    var waypoints = buildWaypoints();
    var durationMin = window.DemoSeries.TOTAL_DURATION_MINUTES;
    if (typeof durationMin !== "number") {
      throw new Error("window.DemoSeries.TOTAL_DURATION_MINUTES 不存在或非数字");
    }
    var lastWaypoint = waypoints[waypoints.length - 1];
    if (lastWaypoint.atMinute !== durationMin) {
      throw new Error(
        "巡检顺序累计到达时刻（" + lastWaypoint.atMinute + "）与 TOTAL_DURATION_MINUTES（" +
        durationMin + "）不一致，说明 DemoSeries.patrolMinutes() 12 区之和有误"
      );
    }
    var end = clonePoint(POINTS[POINTS.length - 1]);
    return {
      points: points,
      start: clonePoint(POINTS[0]),
      end: end,
      // 巡检人当前位置：演示定格在轨迹终点（站控室，最后一个 waypoint）。
      walker: { point: clonePoint(end), atMinute: durationMin, areaId: "control" },
      waypoints: waypoints,
      // 尚无真实米制换算表，1 单位 = Three.js 世界单位，与 station.js 的
      // geom 同一套坐标系，不代表具体米数。
      distanceUnit: "world-unit",
      durationMin: durationMin
    };
  }

  window.DemoTrack = {
    track: track
  };
})();
