// 领域契约 01：站场 / 部位 / 测点。
//
// 【本版与旧目录 domain-skeleton/01-taxonomy.js 的根本区别】
// 旧版的部位和测点是先写出来、再去找图配的（PART-1「泵棚区 P-3 泵出口管线」、
// PART-2「配电间 P6 高压柜」，测点 PT-1/PT-2/PT-3），结果四张真实关键帧对不上任何
// 一条：三条记录共用同一帧 FRM-1-CUR，而 PT-2「泵体温度 75℃」/ PT-3「控制回路电源
// 状态 88%」这两个量纲根本没有对应的检查项 —— 演示时一眼假。
//
// 本版反过来：**先认素材，再定部位**。业务方给的四张站内定点摄像头关键帧，OSD 时间
// 戳是连续的，机位依次推进：
//     20:01:55  长郴-湘潭站-P-4泵棚-B-R
//     20:10:26  长郴-湘潭站-P-4泵棚-B-R   （同机位，晚 8 分 31 秒）
//     20:13:39  低压配电室
//     20:18:35  PLC 机房（IPC 鱼眼）
// 这四帧本身就是一条真实的巡检动线（横跨 16 分 40 秒），所以部位直接按机位来定，
// 一个机位一个部位，不再有"编出来的部位"。
window.DOMAIN_STATION = (function () {
  "use strict";

  // 巡检对象。OBJ-B 是"相似站场"，只用于验证记录筛选不会跨对象串台，屏上不展示。
  var objects = [
    { id: "OBJ-A", label: "长郴-湘潭站", short: "湘潭站", note: "本轮巡检表单质检站场" },
    { id: "OBJ-B", label: "长郴管道相似站场", short: "相似站", note: "历史相似记录对照站场" }
  ];

  // 三个部位 = 三个真实摄像头机位。cameraLabel 是画面右下角烧进去的机位名，
  // frameAt 是画面左上/右上角 OSD 的时间戳 —— 两者都能被观众直接看到，所以必须与
  // 图片里的文字逐字一致，不能写成"约 20:02"这种概括。
  var parts = [
    {
      id: "PART-PUMP",
      objectId: "OBJ-A",
      label: "P-4 泵棚",
      cameraLabel: "长郴-湘潭站-P-4泵棚-B-R",
      area: "泵棚区",
      note: "主输油泵机组与出口管线，含就地压力表与阀门电动执行机构"
    },
    {
      id: "PART-POWER",
      objectId: "OBJ-A",
      label: "低压配电室",
      cameraLabel: "低压配电室",
      area: "配电区",
      note: "GGD 低压柜两列，柜面表计、指示灯与操作把手"
    },
    {
      id: "PART-PLC",
      objectId: "OBJ-A",
      label: "PLC 机房",
      cameraLabel: "PLC 机房 · IPC",
      area: "站控区",
      note: "PLC 机柜与 SIS 机柜，含中石化 / 国家管网设备分区标识"
    }
  ];

  // 【测点只剩一个】旧版有三个：PT-1 出口压力（MPa，阈值 9）、PT-2 泵体温度（℃，
  // 阈值 75）、PT-3 控制回路电源状态（%，阈值 88）。后两个是为了"凑三个测点"造的：
  // 没有任何检查项叫这个名字，"控制回路电源状态"用百分比更是没有工程口径。
  //
  // 本版只保留真正有数值、有标准、有现场读数的那一个：出口管线压力。它的阈值直接
  // 取自记录里的标准原文「高报警 9.0MPa，高高报警 9.8MPa」，末点对上现场读数 9.3MPa。
  // 另外两条记录（配电室表计无显示 / PLC 机柜门禁）本来就不是数值型 —— 它们的证据
  // 形态是事件时间线和视觉帧，硬配一条曲线才是假。
  var points = [
    {
      id: "PT-1",
      partId: "PART-PUMP",
      label: "PT6903B 出口管线压力",
      unit: "MPa",
      // 高报警 / 高高报警两条线都画。旧版只有一个 threshold，讲不出"越过高报但未到
      // 高高报"这个正是本案例要讲的状态。
      warnAt: 9.0,
      dangerAt: 9.8,
      // 【两条线各自"做什么"也在契约里】只画两条虚线、只标数值，读者看不出它们的区别，
      // 而本案例的全部张力就在这个区别上：9.0 只是提示，9.8 才停泵，9.3 落在中间。
      // 口径与 04-records.js 的 R-INTERLOCK、07-kb.js 的 DOC-INTERLOCK 同源，
      // 图上读的是这里，不在 chartopts.js 里另写一份。
      warnNote: "提示核对",
      dangerNote: "联锁停泵",
      standardText: "高报警 9.0MPa，高高报警 9.8MPa。",
      // 现场就地表读数。它同时是 R1 记录的 result 和时序末点，两处必须相等 ——
      // 由 03-series.js 把末点直接钉成 fieldReading 来保证，验收里另有一条断言复查。
      fieldReading: 9.3,
      safeSide: "低于高报警值",
      sampleNote: "站控 SCADA 采样，1 分钟一点，区间内均匀抽取展示"
    }
  ];

  function objectById(id) {
    var found = objects.filter(function (o) { return o.id === id; })[0];
    if (!found) throw new Error("[DOMAIN_STATION] 未知巡检对象：" + id);
    return found;
  }

  function partById(id) {
    var found = parts.filter(function (p) { return p.id === id; })[0];
    if (!found) throw new Error("[DOMAIN_STATION] 未知部位：" + id);
    return found;
  }

  // 必填字段在取用时校验，缺一个直接炸。图上那两条阈值线的说明文字读的就是 warnNote /
  // dangerNote —— 少写一个不会报错，只会在屏上印出「高报警 9.0MPa · undefined」，
  // 路演时才被看见。宁可加载就失败。
  var POINT_FIELDS = ["unit", "label", "warnAt", "dangerAt", "warnNote", "dangerNote", "fieldReading"];

  function pointById(id) {
    var found = points.filter(function (p) { return p.id === id; })[0];
    if (!found) throw new Error("[DOMAIN_STATION] 未知测点：" + id);
    POINT_FIELDS.forEach(function (key) {
      if (found[key] === undefined || found[key] === "") {
        throw new Error("[DOMAIN_STATION] 测点 " + id + " 缺字段 " + key);
      }
    });
    return found;
  }

  function partsOf(objectId) {
    return parts.filter(function (p) { return p.objectId === objectId; });
  }

  return {
    objects: objects,
    parts: parts,
    points: points,
    objectById: objectById,
    partById: partById,
    pointById: pointById,
    partsOf: partsOf
  };
})();
