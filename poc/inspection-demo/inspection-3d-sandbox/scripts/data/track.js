// window.DemoTrack —— 巡检人轨迹数据层。
//
// 坐标系与 station.js / plan.js 完全同一套（Y 轴向上，地面在 XZ 平面，原点=平面图
// 中心，X 向东为正，Z 向南为正，1 世界单位 = 平面图 1 像素）。所有轨迹点的 y 统一
// 取 TRACK_Y，略高于硬化地坪板面，避免 TubeGeometry 与地坪 z-fighting。
//
// ==========================================================================
// 2026-08-20 改造：这条轨迹现在走在平面图的真实消防通道上
// ==========================================================================
// 旧版本的 47 点折线是绕着自编 4×3 网格走的，每个"走廊 A/B/C"都是为了那套网格
// 布局临时发明的空隙。现在换成业务方那张平面图之后，路不需要发明了——图上本来
// 就画着一整套消防通道，还用 23 个红箭头标了疏散方向（见 scripts/data/plan.js 的
// ARROWS）。本文件的每一段都压在 DemoPlan.lanes() 的某条车道中心线上：
//
//   东通道   x=259  （px 888）  贯穿南北，从长沙站大门一直通到北通道
//   北通道   z=-262 （py 94）   沿站场北边界东西向贯通
//   西通道   x=-520 （px 109）  沿站场西边界南北向
//   中通道   z=14   （py 370）  罐区南侧东西向
//   南通道   z=170  （py 526）  混油区/消防区南侧东西向
//   罐区东通道 x=-68 （px 561） 罐区与工艺区之间
//   混油区东通道 x=-36（px 593）混油罐区与消防泵房之间
//   变电所北支线 z=-190（py 166）东通道 → 35KV 变电所
//
// ==========================================================================
// 巡检动线：为什么是这个顺序
// ==========================================================================
// 从长沙站大门进站开始，按"先交接班、再消防设施、再油品工艺、最后动力电气"的
// 现场惯例走一圈，且尽量单向不折返：
//
//   综合控制室(cabinet，进站交接班) → 消防水罐区(vent) → 消防泵房(ups)
//   → 混油罐区(launcher) → 中间罐区(blowdown) → 混油处理区(filter)
//   → 储油罐区(gate) → ESD区(genset) → 工艺设备区(regulate)
//   → 阀组区(metering) → 泵棚区(control) → 35KV变电所(power，终点)
//
// 每个 waypoint 都取在该区 station.js geom 的**外侧紧邻处**（贴着车道那一侧），
// 不进入区域体块内部。逐点核对过的三处易碰撞位置，记在这里免得后人"顺手拉直"：
//   1. 消防泵房/消防水罐区/综合控制室三个区在同一排、彼此间距只有 6~7 个单位，
//      三者的 z 范围都是 [37,143.5]。所以这一段**不能沿 z=90 从东往西直穿**（第一
//      版就是这么写的，实测直接从综合控制室与消防水罐区的体块中间穿了过去）。
//      正确的走法是用围栏（px 382-514 → z∈[26,158]）与三个区块之间那条 11 个单位
//      宽的北侧步道：主线压在 z=30，每到一个区正上方向南探到 z=34（该区北边界
//      z=37 之外）取 waypoint，探完退回 z=30 继续西行。
//   2. (-9,30)→(-29,62)→(-63,93)：出围栏西口后斜切进混油罐区(px 559)与消防泵房
//      (px 628)之间那段 69 个单位宽的空档，再南下贴上混油罐区东边界。
//   3. (131,-6)→(237,-6)：泵棚区 z 到 -14.5、阀组区 z 到 -13.5，z=-6 正好从
//      两者南侧的空隙横过去。走 z=0 会插进泵棚区南端。
//
// ==========================================================================
// atMinute 的权威来源：window.DemoSeries.patrolMinutes()
// ==========================================================================
// 真实耗时 63 分钟。每区分钟数由 scripts/data/series.js 的 apportionMinutes()
// （63 分钟按 12 区项数、最大余数法加权）算出，本文件只按上面这条真实巡检顺序
// 把这些整数分钟数累计起来，不再自己重新算一遍占比——两处各算一套就会出现
// "图上说控制室用了 16 分钟、轨迹动画却走了 16.49 分钟"这种对不上。
// 注意巡检顺序变了之后每个 waypoint 的到达时刻自然也变了，但**总和仍然是 63**
// （同一组 12 个加数换个次序相加），所以 track() 末尾那条"末个 waypoint 的
// atMinute 必须等于 TOTAL_DURATION_MINUTES"的断言原样成立、不需要放宽。
(function () {
  "use strict";

  // 硬化地坪板面在 y≈1.2（见 model-plan.js 的 PAVED_THICKNESS），这里取 3
  // 让光带明显浮在路面之上，同时远低于任何区域体块的高度（最矮的 ESD 区 h=10）。
  var TRACK_Y = 3;

  function p(x, z) { return [x, TRACK_Y, z]; }

  // 完整折线：46 个点，用于 CatmullRomCurve3 + TubeGeometry。
  // 行末注释里的 WPn 标出哪些点同时是区域 waypoint（下方 WAYPOINT_DEFS 直接引用
  // 同一个数组元素，不重新写一遍坐标）。
  var POINTS = [
    p(259, 222),   // 0  起点：长沙站大门内侧（px 888,578）
    p(259, 184),   // 1  沿东通道北上
    p(259, 144),   // 2
    p(259, 96),    // 3
    p(259, 30),    // 4  抵达消防及控制区围栏的北侧步道
    p(231, 30),    // 5  西行进入围栏内（围栏东边界 x=231）
    p(187, 34),    // 6  WP1  综合控制室（北边界外侧，北边界 z=37）
    p(187, 30),    // 7  退回北侧步道
    p(116, 34),    // 8  WP2  消防水罐区（北边界外侧）
    p(116, 30),    // 9  退回北侧步道
    p(37, 34),     // 10 WP3  消防泵房（北边界外侧）
    p(37, 30),     // 11 退回北侧步道
    p(-9, 30),     // 12 出围栏西口
    p(-29, 62),    // 13 切入混油区东通道（px 561~628 之间的空档）
    p(-63, 93),    // 14 WP4  混油罐区（东边界外侧）
    p(-63, 56),    // 15 沿混油区东通道北上
    p(-63, 22),    // 16 抵达中通道
    p(-129, 22),   // 17 沿中通道西行
    p(-193, 22),   // 18 WP5  中间罐区（北边界外侧）
    p(-281, 22),   // 19 WP6  混油处理区（北边界外侧）
    p(-379, -6),   // 20 WP7  储油罐区（南边界外侧，南边界 z=-21）
    p(-469, 16),   // 21 退回中通道继续西行
    p(-520, 16),   // 22 抵达西通道
    p(-520, -56),  // 23 沿西通道北上
    p(-520, -136), // 24
    p(-520, -216), // 25
    p(-520, -262), // 26 抵达北通道
    p(-429, -262), // 27 沿北通道东行
    p(-299, -262), // 28
    p(-179, -262), // 29
    p(-68, -262),  // 30 经过罐区东通道北端路口
    p(31, -262),   // 31
    p(131, -256),  // 32 南折进入工艺装置区
    p(131, -205),  // 33 WP8  ESD区（东边界外侧）
    p(131, -161),  // 34
    p(131, -121),  // 35 WP9  工艺设备区（东边界外侧）
    p(131, -76),   // 36
    p(131, -36),   // 37 WP10 阀组区（东边界外侧）
    p(131, -6),    // 38 绕到阀组区/泵棚区南侧（见文件头易碰撞位置 3）
    p(237, -6),    // 39 东行至泵棚区正南
    p(237, -85),   // 40 WP11 泵棚区（东边界外侧）
    p(259, -126),  // 41 回到东通道
    p(259, -190),  // 42 抵达变电所北支线路口
    p(331, -190),  // 43 沿北支线东行
    p(404, -190),  // 44 对准 35KV 变电所的 x
    p(404, -166)   // 45 WP12 35KV变电所（北边界外侧）—— 终点
  ];

  // 12 个区域 waypoint：顺序 = 真实巡检动线（不是 Map3DContract.AREA_IDS 的顺序），
  // 坐标与 POINTS 里对应下标共享同一份数组元素，不另抄一遍数字。
  var WAYPOINT_DEFS = [
    { areaId: "cabinet", point: POINTS[6] },
    { areaId: "vent", point: POINTS[8] },
    { areaId: "ups", point: POINTS[10] },
    { areaId: "launcher", point: POINTS[14] },
    { areaId: "blowdown", point: POINTS[18] },
    { areaId: "filter", point: POINTS[19] },
    { areaId: "gate", point: POINTS[20] },
    { areaId: "genset", point: POINTS[33] },
    { areaId: "regulate", point: POINTS[35] },
    { areaId: "metering", point: POINTS[37] },
    { areaId: "control", point: POINTS[40] },
    { areaId: "power", point: POINTS[45] }
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
      // 巡检人当前位置：演示定格在轨迹终点（35KV变电所，最后一个 waypoint）。
      walker: { point: clonePoint(end), atMinute: durationMin, areaId: "power" },
      waypoints: waypoints,
      // 平面图没有比例尺，1 单位 = 平面图 1 像素，不代表具体米数（见 plan.js 文件头）。
      distanceUnit: "plan-pixel",
      durationMin: durationMin
    };
  }

  window.DemoTrack = {
    track: track
  };
})();
