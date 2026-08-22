// 领域契约 02：视觉关键帧。
//
// 【五帧全部是业务方给的真图，一张没编】assets/诊断工作台/图片 原样搬进 media/。
// bbox 是我按图里那些**真实可见的**东西量出来的归一化坐标（0~1），框住的必须是画面上
// 真有的字或物件 —— 框住空白处，路演一放大就露。
//
// 【为什么 SCADA 截图算"视觉帧"】它是这条链的原始凭据：屏上那条曲线是我们按截图里的
// 走势复现的（见 03-series.js），观众有权要求看原件。所以它既是时序的来源，
// 也是一枚可以点开放大的视觉证据。
//
// 【时间戳咬合】「调整后」那张的相机水印是 2026.07.22 16:31（REDMI K90 Pro Max 拍的），
// 与 SCADA 曲线的 16:30-16:37 落在同一段时间里。这不是我安排的，是素材本来就对得上 ——
// 也正因为对得上，"对中已调好、振动没降"这个推论才成立。
// 【为什么每个框有 detail 与 note 两个同值字段】骨架层 scripts/ui/evidence.js 的
// figure() 读 box.note 当 title、读 box.tone 当 class；而依据链芯片和框列表读 detail。
// 骨架层两个课题共用一份，所以由 domain 这边把两个名字都提供，而不是改骨架 ——
// 少了 tone 会渲染成 class="ev-box undefined"（框没有颜色，且不报错）。
window.DOMAIN_VISION = (function () {
  "use strict";

  // 图片全部在本目录 media/ 下，file:// 直接相对引用。
  var sources = {
    "FRM-SCADA": "media/scada-vibration-trend.jpg",
    "FRM-ALIGN-BEFORE": "media/pump-body-before.jpg",
    "FRM-ALIGN-AFTER": "media/pump-body-after.jpg",
    "FRM-SITE-LASER": "media/pump-drive-end.jpg",
    "FRM-SITE-COUPLING": "media/pump-coupling.jpg",
    "FRM-SEAL-REF": "media/seal-leak-reference.jpg"
  };

  var frames = [
    {
      id: "FRM-SCADA", src: "FRM-SCADA",
      partId: "PART-DE",
      role: "scada",
      label: "SCADA 振动趋势 · 16:30-16:37",
      shotAt: "2026-07-22 16:37",
      camera: "站控 SCADA · CCGD.HYZ.VT7003A",
      caption: "画面标题「长郴管道.衡阳站.P_3泵驱动端振动」。y 轴 7~13，曲线全程在 8.2~12.1 之间。",
      boxes: [
        { id: "BX-TITLE", label: "测点标题", detail: "长郴管道.衡阳站.P_3泵驱动端振动",
          tone: "ok", note: "长郴管道.衡阳站.P_3泵驱动端振动",
          bbox: { x: 0.045, y: 0.145, w: 0.30, h: 0.045 } },
        // ⚠️ 这枚框框住的是画面顶部**另一个表格**的一行（9.5 / 9.8，下方同列还有 90 / 95），
        // 它不属于这条曲线。刻意框出来并写明，是因为路演时一定有人指着它问"那是阈值吧" ——
        // 与其等被问，不如自己先讲清楚：本机组的站控阈值台账里没填。
        { id: "BX-OTHERTAG", label: "非本测点", detail: "顶部表格属于其它测点，不是本曲线的阈值",
          tone: "muted", note: "顶部表格属于其它测点，不是本曲线的阈值",
          bbox: { x: 0.30, y: 0.010, w: 0.14, h: 0.075 } },
        { id: "BX-PEAK", label: "峰值段", detail: "16:34 起峰群 12.1 / 11.8 / 11.4",
          tone: "danger", note: "16:34 起峰群 12.1 / 11.8 / 11.4",
          bbox: { x: 0.46, y: 0.35, w: 0.28, h: 0.22 } }
      ]
    },
    {
      id: "FRM-ALIGN-BEFORE", src: "FRM-ALIGN-BEFORE",
      partId: "PART-COUPLING",
      role: "instrument",
      label: "激光对中 · 调整前",
      shotAt: "2026-07-22 16:12",
      camera: "EASY-LASER 对中仪",
      caption: "屏幕标题「调整前」。H 向 0.31mm —— 落在视觉引擎 0.1~0.3mm 的漏检区间里。",
      boxes: [
        { id: "BX-BEFORE-H", label: "H 向偏差", detail: "0.31 mm",
          tone: "danger", note: "0.31 mm",
          bbox: { x: 0.575, y: 0.315, w: 0.115, h: 0.075 } },
        { id: "BX-BEFORE-V", label: "V 向偏差", detail: "0.07 mm",
          tone: "warn", note: "0.07 mm",
          bbox: { x: 0.315, y: 0.255, w: 0.105, h: 0.070 } },
        { id: "BX-BEFORE-MF", label: "机脚垫片量", detail: "MF1 0.47 / MF2 0.75",
          tone: "warn", note: "MF1 0.47 / MF2 0.75",
          bbox: { x: 0.555, y: 0.625, w: 0.185, h: 0.065 } }
      ]
    },
    {
      id: "FRM-ALIGN-AFTER", src: "FRM-ALIGN-AFTER",
      partId: "PART-COUPLING",
      role: "instrument",
      label: "激光对中 · 调整后",
      shotAt: "2026-07-22 16:31",
      camera: "EASY-LASER 对中仪",
      caption: "屏幕标题「调整后」，右侧相机水印 2026.07.22 16:31。H 向 -0.02mm，已合格。",
      boxes: [
        { id: "BX-AFTER-H", label: "H 向偏差", detail: "-0.02 mm",
          tone: "ok", note: "-0.02 mm",
          bbox: { x: 0.585, y: 0.275, w: 0.115, h: 0.060 } },
        { id: "BX-AFTER-V", label: "V 向偏差", detail: "0.02 mm",
          tone: "ok", note: "0.02 mm",
          bbox: { x: 0.225, y: 0.275, w: 0.105, h: 0.060 } },
        { id: "BX-AFTER-STAMP", label: "相机水印", detail: "2026.07.22 16:31",
          tone: "muted", note: "2026.07.22 16:31",
          bbox: { x: 0.895, y: 0.030, w: 0.070, h: 0.200 } }
      ]
    },
    // 两张现场作业照。role: "site" 的帧不画识别框 —— 它们是"这件事真有人去做了"的
    // 旁证，不是 AI 的识别对象。给它们套框才是假。
    // ★ assets/诊断工作台/泵课题Q&A.docx 故事线第二步是「视觉引擎确认泵体无渗漏
    //   （排除误报）」。这里**没有**按原文那样让 AI 说一句"无渗漏"就完事 ——
    //   因为本轮素材里根本没有一张泵体近景照片（业务方给的四张是 SCADA 截图、
    //   两张仪器屏幕、两张现场作业照，主体都是人和仪器，不是泵体）。
    //
    // 所以这枚证据做成「库内典型形态 + 明说这一项是谁判的」：图是真实的机械密封泄漏
    // 样本（本项目 poc/beng-demo/diagnosis-flow/media/faults/ 下已有），框出三个典型特征；
    // 结论行如实写明本次渗漏排除来自现场目视，不是视觉模型判定。
    //
    // 编一张"泵体近景无渗漏"的图、或者把现场作业照当泵体近景框起来，都是在这一步造假 ——
    // 而这一步恰恰是 Q&A 里专家最爱追问的地方（Q3「它的检测精度到底是多少」）。
    {
      id: "FRM-SEAL-REF", src: "FRM-SEAL-REF",
      partId: "PART-DE",
      role: "reference",
      label: "机械密封泄漏 · 典型形态（库内样本）",
      shotAt: "库内样本",
      camera: "案例库 · 机械密封泄漏",
      caption: "典型形态三项：油沿轴颈滴落、机封腔外缘挂油、基座下方积成片状油迹。"
             + "本轮未采集泵体近景照片，渗漏排除依据是机械专业岗现场目视确认（见现场作业照），"
             + "不是视觉模型判定 —— 这一项的能力边界必须说清楚。",
      boxes: [
        { id: "BX-REF-DRIP", label: "滴落油线", detail: "沿轴颈连续滴落",
          tone: "danger", note: "沿轴颈连续滴落",
          bbox: { x: 0.415, y: 0.545, w: 0.115, h: 0.235 } },
        { id: "BX-REF-POOL", label: "地面油迹", detail: "基座下方成片积油",
          tone: "danger", note: "基座下方成片积油",
          bbox: { x: 0.335, y: 0.735, w: 0.365, h: 0.215 } }
      ]
    },
    {
      id: "FRM-SITE-LASER", src: "FRM-SITE-LASER",
      partId: "PART-BASE",
      role: "site",
      label: "现场 · 激光对中作业",
      shotAt: "2026-07-22 16:05",
      camera: "现场记录",
      caption: "机械专业岗架设 EASY-LASER 测头，另一人用移动终端记录读数。",
      boxes: []
    },
    {
      id: "FRM-SITE-COUPLING", src: "FRM-SITE-COUPLING",
      partId: "PART-COUPLING",
      role: "site",
      label: "现场 · 联轴器测头架设",
      shotAt: "2026-07-22 16:08",
      camera: "现场记录",
      caption: "测头装夹在联轴器中间节两侧，链条固定。",
      boxes: []
    }
  ];

  function assertBoxes() {
    frames.forEach(function (f) {
      if (!sources[f.id]) throw new Error("[DOMAIN_VISION] 帧 " + f.id + " 没有对应图片");
      f.boxes.forEach(function (b) {
        var k = b.bbox;
        if (k.x < 0 || k.y < 0 || k.w <= 0 || k.h <= 0
            || k.x + k.w > 1.0001 || k.y + k.h > 1.0001) {
          throw new Error("[DOMAIN_VISION] bbox 越界：" + f.id + "/" + b.id);
        }
      });
    });
  }

  function frameById(id) {
    var found = frames.filter(function (f) { return f.id === id; })[0];
    if (!found) throw new Error("[DOMAIN_VISION] 未知关键帧：" + id);
    return found;
  }

  function boxById(frameId, boxId) {
    var frame = frameById(frameId);
    var found = frame.boxes.filter(function (b) { return b.id === boxId; })[0];
    if (!found) throw new Error("[DOMAIN_VISION] 帧 " + frameId + " 没有识别框 " + boxId);
    return found;
  }

  function srcOf(frameId) {
    frameById(frameId);
    return sources[frameId];
  }

  // 【接口形状对齐骨架层】scripts/ui/*.js 与 scripts/scenes/*.js 调的是 sourceOf(key)，
  // 那些是骨架层、两个课题共用一份，所以由 domain 这边补别名，而不是改骨架。
  // 每个 frame 的 src 就是它自己的 id —— 参照物那边 src 是另一套命名 key，
  // 这里没有第二套命名的必要，一个 id 走到底更不容易对错。
  function sourceOf(key) {
    if (!sources[key]) throw new Error("[DOMAIN_VISION] 未知图片 key：" + key);
    return sources[key];
  }

  assertBoxes();

  return {
    frames: frames, sources: sources,
    frameById: frameById, boxById: boxById, srcOf: srcOf, sourceOf: sourceOf
  };
})();
