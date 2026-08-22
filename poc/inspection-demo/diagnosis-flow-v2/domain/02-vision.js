// 领域契约 02：视觉关键帧。
//
// 【五帧全部对应真实素材，不再共用同一帧】
// 旧目录 domain-skeleton/04-vision.js 的四帧里有三条记录共用 FRM-1-CUR，而 label 写着
// 「P-3 泵状态」——素材里根本没有 P-3 泵（画面上标的是 P-7）。本版每一帧都对应一个
// 具体机位、一个具体时刻，label 与画面里烧进去的机位名和 OSD 时间戳逐字一致。
//
// 四张站内定点摄像头帧复用旧目录原文件（media/visual-models/，不复制副本）；
// 第五张是业务方补充的现场人工巡检照，放在本目录 media/site-photos/。
//
// 【bbox 口径】相对**图片本身**的 0~1 归一化比例，不是像素、也不是相对外层容器。
// 渲染时 <figure> 必须紧贴图片盒（height:100% / width:auto + inline-block），否则换
// 宽高比不同的图（plc 是 2172×1228 ≈ 1.769，其余是 1920×1080 ≈ 1.778）会整体偏移。
//
// bbox 的数值是我对着渲染出来的原图目测量的，不是标注工具导出的 —— 演示级精度，
// 够把框套在对象上，不足以当训练标签。这一点写在这里，免得后来的人以为它有出处。
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
    sitePhotoWalk: "media/site-photos/photo-patrol-walk.jpg"
  };

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

  return {
    sources: sources,
    frames: frames,
    sourceOf: sourceOf,
    frameById: frameById,
    framesOf: framesOf
  };
})();
