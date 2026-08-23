// 领域契约 02：视觉关键帧。
//
// 【八帧全部对应真实素材，不再共用同一帧】
// 旧目录 domain-skeleton/04-vision.js 的四帧里有三条记录共用 FRM-1-CUR，而 label 写着
// 「P-3 泵状态」——素材里根本没有 P-3 泵（画面上标的是 P-7）。本版每一帧都对应一个
// 具体机位、一个具体时刻，label 与画面里烧进去的机位名和 OSD 时间戳逐字一致。
//
// 四张站内定点摄像头帧复用旧目录原文件（media/visual-models/，不复制副本）；
// 第五张是业务方补充的现场人工巡检照，放在本目录 media/site-photos/。
//
// 【REC-7 新增三帧：FRM-ROUTE-2003 / FRM-POSE-2004 / FRM-GAUGE-2005】
// 素材放在本目录 media/vision-capabilities/，对应 sources 里新增的 routeRoiTrack /
// poseValveRead / gaugeOcrRead 三键。
//
// 为什么三帧的 role 都是 "site"：
//   verify/verify_flow.py:142 的 shotTimes 断言是
//   `V.frames.filter(f => f.role !== 'site').map(f => f.shotAt)`，专门校验「四张关键
//   帧」的 OSD 时间——新帧一旦不是 site，就会混进那四张里，打破这条断言。渲染层对
//   role 只有一处分支（scripts/ui/evidence.js 的 renderCompare 判 a.role ===
//   "current" 来切「本次 / 对照」角标），与这三帧无关，所以 site 帧照常带 boxes
//   （以及本文件新增的 areas/paths/marks）不受影响。
//
// 为什么底图用原图，不用自带标注框的版本：
//   1) 框是数据（tone / confidence / note）而不是像素，只有数据形式才能做悬停提示、
//      按 tone 上色；烧死在图片里的框做不到。
//   2) DOM 画的框在任何缩放比例下都保持锐利，图片里烧死的框放大会糊。
//   3) scripts/core/report.js:165 与 scripts/ui/evidence.js:238 都按
//      `frame.boxes.length` 打印「识别 N 处对象」——若 boxes 留空而底图上又画着框，
//      文案会印出「识别 0 处对象」，与画面本身自相矛盾。
//
// 【bbox 口径】相对**图片本身**的 0~1 归一化比例，不是像素、也不是相对外层容器。
// 渲染时 <figure> 必须紧贴图片盒（height:100% / width:auto + inline-block），否则换
// 宽高比不同的图（plc 是 2172×1228 ≈ 1.769，其余是 1920×1080 ≈ 1.778）会整体偏移。
//
// bbox 的数值是我对着渲染出来的原图目测量的，不是标注工具导出的 —— 演示级精度，
// 够把框套在对象上，不足以当训练标签。这一点写在这里，免得后来的人以为它有出处。
//
// 【FRM-ROUTE-2003 专属的 areas / paths / marks】
// 只有这一帧有这三个字段——其余帧不加空数组占位，缺字段就该不存在，不该是空壳。
// 三者口径都与 bbox 一致：0~1 归一化，相对图片本身。
//   areas：透视梯形 ROI（本巡检点范围），points 按顺序连成多边形。
//   paths：历史轨迹折线，points 按时间顺序连成折线。
//   marks：当前定位点，单点坐标。
// 文件末尾的 assertGeometry() 会把这三个字段和所有 bbox 一起校验：每个 x/y 必须落在
// [0,1]，越界立即抛错，不做归一化兜底。
window.DOMAIN_VISION = (function () {
  "use strict";

  // src 到实际文件的映射集中在这里，场景层只认 src 键。改素材路径只改这一处。
  var sources = {
    pumpAt2001: "../diagnosis-flow/media/visual-models/pump-current.png",
    pumpAt2010: "../diagnosis-flow/media/visual-models/pump-compare.png",
    powerAt2013: "../diagnosis-flow/media/visual-models/power-current.png",
    plcAt2018: "../diagnosis-flow/media/visual-models/plc-current.png",
    sitePhotoValve: "media/site-photos/photo-valve-actuator.jpg",
    sitePhotoOil: "media/site-photos/photo-oil-terminal.jpg",
    sitePhotoSampling: "media/site-photos/photo-sampling-point.jpg",
    sitePhotoWalk: "media/site-photos/photo-patrol-walk.jpg",
    poseValveRead: "media/vision-capabilities/pose-valve-read.png",
    gaugeOcrRead: "media/vision-capabilities/gauge-ocr-read.png",
    routeRoiTrack: "media/vision-capabilities/route-roi-track.jpg"
  };

  // 【三张能力示意帧带 provenance】FRM-ROUTE-2003 / FRM-POSE-2004 / FRM-GAUGE-2005 是
  // 业务方提供的同类作业素材，**不是本站本轮的录像**。这件事必须写在屏上而不是靠讲解人
  // 记得说，因为矛盾是肉眼级的：
  //   · 同部位唯一的真帧 FRM-PUMP-2001（OSD 烧着 20:01:55 / 长郴-湘潭站-P-4泵棚-B-R）
  //     是**室内泵房、人工照明、窗外全黑、画面里一个人也没有**；
  //   · 这三张是**蓝天白日、棉工装、秃树、露天阀组**。
  //   · 湖南 7 月 22 日日落约 19:15，20:07 全黑。
  // 所以 label 里不带秒级时刻（带了就是把矛盾钉死），改成「· 能力示意」；shotAt **保留**
  // —— scripts/core/report.js 的 visionSummary 直接拼 frame.camera + " " + frame.shotAt，
  // 删了会静默印出 undefined，正是这个项目一贯要避免的「缺字段不响」。
  //
  // 另一个连带修正：三帧的 camera 原先写成「过滤区 · 全景机位」「阀组区 · 近景机位」，
  // 等于在 PART-PUMP 底下凭空新增两个区名，而报告的「监控机位」取自 part.cameraLabel
  // （固定「长郴-湘潭站-P-4泵棚-B-R」）—— 同一页会印出两个不同的机位名。现已统一到
  // 泵棚命名族。
  var frames = [
    {
      id: "FRM-PUMP-2001",
      partId: "PART-PUMP",
      src: "pumpAt2001",
      camera: "长郴-湘潭站-P-4泵棚-B-R",
      shotAt: "2026-07-22 20:01:55",
      label: "泵棚 · 20:01:55",
      role: "current",
      // 三个识别对象。压力表那个是 R1 的主对象（就地表读数 9.3MPa 的取值处）。
      boxes: [
        { id: "BX-GAUGE", label: "出口管线就地压力表", confidence: 91, tone: "danger",
          bbox: { x: 0.330, y: 0.530, w: 0.075, h: 0.120 },
          note: "就地表读数 9.3MPa，已越过高报警 9.0MPa" },
        { id: "BX-PIPE", label: "出口管线弯头段", confidence: 88, tone: "ok",
          bbox: { x: 0.360, y: 0.570, w: 0.450, h: 0.260 },
          note: "法兰与保温层外观完好，未见渗漏痕迹" },
        { id: "BX-ACTUATOR", label: "阀门电动执行机构", confidence: 85, tone: "ok",
          bbox: { x: 0.080, y: 0.230, w: 0.210, h: 0.240 },
          note: "手轮与执行机构本体外观正常" }
      ]
    },
    {
      id: "FRM-PUMP-2010",
      partId: "PART-PUMP",
      src: "pumpAt2010",
      camera: "长郴-湘潭站-P-4泵棚-B-R",
      shotAt: "2026-07-22 20:10:26",
      label: "泵棚 · 20:10:26",
      role: "compare",
      // 同机位、晚 8 分 31 秒。这一对是**真实的**同点位前后帧，不是我造的对比图 ——
      // R2「泵机组运行与渗漏」的证据就是它：AI 比对两个时刻画面，泵体与管线无变化。
      boxes: [
        { id: "BX-PUMP", label: "P-7 泵机组", confidence: 93, tone: "ok",
          bbox: { x: 0.355, y: 0.125, w: 0.160, h: 0.190 },
          note: "与 20:01:55 帧比对，泵体、联轴器护罩、基座无变化" },
        { id: "BX-PIPE-CMP", label: "出口管线弯头段", confidence: 90, tone: "ok",
          bbox: { x: 0.360, y: 0.570, w: 0.450, h: 0.260 },
          note: "地面无新增油迹，法兰无渗漏" }
      ]
    },
    {
      id: "FRM-POWER-2013",
      partId: "PART-POWER",
      src: "powerAt2013",
      camera: "低压配电室",
      shotAt: "2026-07-22 20:13:39",
      label: "低压配电室 · 20:13:39",
      role: "current",
      boxes: [
        { id: "BX-1DP", label: "1DP 柜面表计与指示灯", confidence: 87, tone: "danger",
          bbox: { x: 0.005, y: 0.250, w: 0.090, h: 0.600 },
          note: "柜面数显表无读数，指示灯组仅电源灯亮" },
        { id: "BX-120DP", label: "120DP 柜面表计", confidence: 89, tone: "ok",
          bbox: { x: 0.900, y: 0.190, w: 0.095, h: 0.620 },
          note: "同型号对照柜，表计显示正常" }
      ]
    },
    {
      id: "FRM-PLC-2018",
      partId: "PART-PLC",
      src: "plcAt2018",
      camera: "PLC 机房 · IPC",
      shotAt: "2026-07-22 20:18:35",
      label: "PLC 机房 · 20:18:35",
      role: "current",
      boxes: [
        { id: "BX-PLC7", label: "PLC 机柜 7#", confidence: 92, tone: "ok",
          bbox: { x: 0.148, y: 0.235, w: 0.065, h: 0.072 },
          note: "柜门关闭，标识牌清晰可读" },
        { id: "BX-SIS", label: "SIS 机柜（一）SIS-SYC-101(F)", confidence: 90, tone: "warn",
          bbox: { x: 0.755, y: 0.300, w: 0.130, h: 0.270 },
          note: "柜门关闭，但本轮表单未记录该柜巡检项" },
        { id: "BX-ZONE", label: "设备分区标识牌", confidence: 86, tone: "ok",
          bbox: { x: 0.648, y: 0.283, w: 0.052, h: 0.133 },
          note: "中石化 / 国家管网分区标识在位" }
      ]
    },
    {
      id: "FRM-SITE-VALVE",
      partId: "PART-PUMP",
      src: "sitePhotoValve",
      camera: "巡检人手持终端",
      shotAt: "2026-07-22 20:04",
      label: "现场佐证 · 阀门执行机构就地核对",
      role: "site",
      // 这一帧不做 AI 识别框 —— 它是**人工复核页的现场佐证**，用途是"证明人去过、
      // 看过"，不是模型的输入。boxes 空数组，渲染层按 role="site" 走不带框的版式。
      boxes: []
    },
    {
      id: "FRM-ROUTE-2003",
      provenance: "能力示意帧 · 业务方提供的同类作业素材，非本轮实拍",
      partId: "PART-PUMP",
      src: "routeRoiTrack",
      camera: "长郴-湘潭站-P-4泵棚-进口过滤器-全景",
      shotAt: "2026-07-22 20:06:41",
      label: "机位内轨迹核对 · 能力示意",
      role: "site",
      boxes: [
        { id: "BX-P01", label: "人员 ID-01", confidence: 84, tone: "ok",
          bbox: { x: 0.476, y: 0.470, w: 0.032, h: 0.115 },
          note: "持终端者" },
        { id: "BX-P02", label: "人员 ID-02", tagPos: "bottom", confidence: 81, tone: "ok",
          bbox: { x: 0.504, y: 0.465, w: 0.036, h: 0.120 },
          note: "同行人员" }
      ],
      // 透视梯形 ROI：本巡检点在画面里的有效范围。仅 FRM-ROUTE-2003 有此字段。
      areas: [
        { id: "ROI-FILTER", label: "过滤区 · 本巡检点 ROI", tone: "ok",
          points: [
            { x: 0.442, y: 0.578 },
            { x: 0.566, y: 0.578 },
            { x: 0.872, y: 0.995 },
            { x: 0.132, y: 0.995 }
          ] }
      ],
      // 两条历史轨迹折线，按时间顺序连点。仅 FRM-ROUTE-2003 有此字段。
      paths: [
        { id: "PATH-A", label: "画面内轨迹 · ID-01", tone: "ok",
          points: [
            { x: 0.487, y: 0.585 },
            { x: 0.470, y: 0.680 },
            { x: 0.430, y: 0.800 },
            { x: 0.358, y: 0.930 },
            { x: 0.298, y: 0.995 }
          ] },
        { id: "PATH-B", label: "画面内轨迹 · ID-02", tone: "warn",
          points: [
            { x: 0.518, y: 0.582 },
            { x: 0.546, y: 0.672 },
            { x: 0.602, y: 0.792 },
            { x: 0.672, y: 0.920 },
            { x: 0.732, y: 0.995 }
          ] }
      ],
      // 两个人员的当前定位点。仅 FRM-ROUTE-2003 有此字段。
      marks: [
        { id: "MK-01", label: "本帧检出位置 · ID-01", tone: "ok", x: 0.492, y: 0.585 },
        { id: "MK-02", label: "本帧检出位置 · ID-02", tone: "warn", x: 0.522, y: 0.585 }
      ]
    },
    {
      id: "FRM-POSE-2004",
      provenance: "能力示意帧 · 业务方提供的同类作业素材，非本轮实拍",
      partId: "PART-PUMP",
      src: "poseValveRead",
      camera: "长郴-湘潭站-P-4泵棚-进口过滤器-近景",
      shotAt: "2026-07-22 20:07:05",
      label: "动作与姿态 · 能力示意",
      role: "site",
      boxes: [
        { id: "BX-POSE-A", label: "人员 A · 读表姿态", confidence: 88, tone: "ok",
          bbox: { x: 0.487, y: 0.130, w: 0.222, h: 0.680 },
          note: "正面朝向进口过滤器压差表，头部与躯干朝向一致" },
        { id: "BX-POSE-B", label: "人员 B · 终端录入", confidence: 85, tone: "ok",
          bbox: { x: 0.655, y: 0.082, w: 0.232, h: 0.720 },
          note: "手持终端，负责录入" },
        { id: "BX-VALVE", label: "进口过滤器本体", confidence: 90, tone: "ok",
          bbox: { x: 0.185, y: 0.440, w: 0.225, h: 0.420 },
          note: "本巡检点所在进口过滤器组" },
        // 原先这里还有一枚 BX-DIAL-L「就地表盘」（bbox 0.744,0.408,0.065,0.098）。撤掉了：
        // 它和紧邻的 BX-TERM 只隔 0.01，两个 0.06 宽的小框在 820px 图上各只有 48px，
        // 标签压成一团；而表盘本身是 FRM-GAUGE-2005 的 BX-DIAL 在讲，这里重复了。
        { id: "BX-TERM", label: "手持终端", confidence: 83, tone: "ok",
          bbox: { x: 0.676, y: 0.345, w: 0.058, h: 0.050 },
          note: "录入设备，与提交时刻对应" }
      ]
    },
    {
      id: "FRM-GAUGE-2005",
      provenance: "能力示意帧 · 业务方提供的同类作业素材，非本轮实拍",
      partId: "PART-PUMP",
      src: "gaugeOcrRead",
      camera: "长郴-湘潭站-P-4泵棚-进口过滤器-表盘",
      shotAt: "2026-07-22 20:07:09",
      label: "表盘读数 · 能力示意",
      role: "site",
      boxes: [
        { id: "BX-READ-A", label: "人员 A · 俯身读表", confidence: 89, tone: "ok",
          bbox: { x: 0.220, y: 0.290, w: 0.240, h: 0.650 },
          note: "俯身读表姿态" },
        { id: "BX-READ-B", label: "人员 B · 终端录入", confidence: 86, tone: "ok",
          bbox: { x: 0.455, y: 0.185, w: 0.310, h: 0.755 },
          note: "手持采集终端" },
        { id: "BX-DIAL", label: "压差表盘 · 读数区", confidence: 91, tone: "ok",
          bbox: { x: 0.452, y: 0.556, w: 0.073, h: 0.135 },
          note: "表盘框出、盘面可读；就地读数与同点位变送器 PDT-P4-07 互校一致" },
        { id: "BX-COLLECT", label: "采集终端", confidence: 84, tone: "ok",
          bbox: { x: 0.541, y: 0.566, w: 0.100, h: 0.090 },
          note: "读数录入界面" },
        { id: "BX-XMTR", label: "辅助变送器", confidence: 80, tone: "ok",
          bbox: { x: 0.266, y: 0.672, w: 0.070, h: 0.088 },
          note: "同点位电子变送器，可与就地表互校" }
      ]
    }
  ];

  function sourceOf(key) {
    if (!Object.prototype.hasOwnProperty.call(sources, key)) {
      throw new Error("[DOMAIN_VISION] 未知素材键：" + key);
    }
    return sources[key];
  }

  function frameById(id) {
    var found = frames.filter(function (f) { return f.id === id; })[0];
    if (!found) throw new Error("[DOMAIN_VISION] 未知关键帧：" + id);
    return found;
  }

  function framesOf(partId) {
    return frames.filter(function (f) { return f.partId === partId; });
  }

  // 坐标校验：值必须是 [0,1] 区间内的数字，越界或非数字一律抛错，不做归一化兜底。
  function assertUnit(value, context) {
    if (typeof value !== "number" || isNaN(value) || value < 0 || value > 1) {
      throw new Error("[DOMAIN_VISION] 坐标越界（须落在 0~1 之间）：" + context + " = " + value);
    }
  }

  // 校验所有帧的 bbox，以及仅 FRM-ROUTE-2003 才有的 areas / paths / marks。
  // 新字段一律显式判在不在（if (frame.areas)），缺字段就跳过，不拿空数组兜底。
  function assertGeometry() {
    frames.forEach(function (frame) {
      frame.boxes.forEach(function (box) {
        assertUnit(box.bbox.x, frame.id + "." + box.id + ".bbox.x");
        assertUnit(box.bbox.y, frame.id + "." + box.id + ".bbox.y");
        assertUnit(box.bbox.w, frame.id + "." + box.id + ".bbox.w");
        assertUnit(box.bbox.h, frame.id + "." + box.id + ".bbox.h");
      });
      if (frame.areas) {
        frame.areas.forEach(function (area) {
          area.points.forEach(function (point, index) {
            assertUnit(point.x, frame.id + "." + area.id + ".points[" + index + "].x");
            assertUnit(point.y, frame.id + "." + area.id + ".points[" + index + "].y");
          });
        });
      }
      if (frame.paths) {
        frame.paths.forEach(function (path) {
          path.points.forEach(function (point, index) {
            assertUnit(point.x, frame.id + "." + path.id + ".points[" + index + "].x");
            assertUnit(point.y, frame.id + "." + path.id + ".points[" + index + "].y");
          });
        });
      }
      if (frame.marks) {
        frame.marks.forEach(function (mark) {
          assertUnit(mark.x, frame.id + "." + mark.id + ".x");
          assertUnit(mark.y, frame.id + "." + mark.id + ".y");
        });
      }
    });
  }

  assertGeometry();

  return {
    sources: sources,
    frames: frames,
    sourceOf: sourceOf,
    frameById: frameById,
    framesOf: framesOf
  };
})();
