// 领域契约 04：视觉证据（关键帧 + 标注框）。
//
// bbox 是相对**图片本身**的 0~1 归一化比例，不是像素、也不是相对外层容器的比例。
// 这条约束决定了渲染层的写法：<figure> 必须紧贴图片渲染盒（height:100%/width:auto
// + inline-block），图片没铺满的两侧留白由外层深色底填。否则换一张宽高比不同的
// 照片，标注框就整体飘走——而这种错只有肉眼能发现，没有任何断言能替代看一眼。
//
// role 三态对应视觉详情子屏右侧的帧序列：
//   current = 本轮判读用的当前帧（每个部位必须恰好一帧）
//   compare = 同点位历史帧，用于前后比对
//   link    = 关联点位帧，用于旁证
window.DOMAIN_VISION = {
  media: {
    pumpCurrent: "media/pump-current.jpg",
    pumpCompare: "media/pump-compare.jpg",
    pumpClose: "media/pump-close.jpg"
  },

  frames: [
    {
      id: "FRM-1-CUR",
      partId: "PART-1",
      label: "泵棚区关键帧 · P-1 联轴器状态",
      src: "pumpCurrent",
      bbox: { x: 0.34, y: 0.2, w: 0.3, h: 0.42 },
      boxLabel: "联轴器区域 0.89",
      findings: ["P-1 泵组及联轴器区域识别 0.89", "泵驱动端周边可用于复核 0.84", "建议补充激光对中近景 0.78"],
      confidence: 0.89,
      role: "current"
    },
    {
      id: "FRM-1-CMP",
      partId: "PART-1",
      label: "激光对中仪 · 调整前",
      src: "pumpCompare",
      bbox: { x: 0.24, y: 0.2, w: 0.48, h: 0.46 },
      boxLabel: "对中读数 0.90",
      findings: ["激光对中仪读数可复核 0.90", "调整前状态作为处置前证据 0.86"],
      confidence: 0.9,
      role: "compare"
    },
    {
      id: "FRM-1-LNK",
      partId: "PART-1",
      label: "现场近景 · 联轴器与地脚",
      src: "pumpClose",
      bbox: { x: 0.18, y: 0.24, w: 0.44, h: 0.42 },
      boxLabel: "复核近景 0.81",
      findings: ["联轴器与地脚区域可复核 0.81", "用于补充现场照片证据 0.76"],
      confidence: 0.81,
      role: "link"
    },
    {
      id: "FRM-2-CUR",
      partId: "PART-2",
      label: "泵棚区关键帧 · 底座基础",
      src: "pumpCurrent",
      bbox: { x: 0.18, y: 0.55, w: 0.56, h: 0.22 },
      boxLabel: "底座区域 0.84",
      findings: ["底座基础区域识别 0.84", "地脚状态需现场复核 0.79"],
      confidence: 0.84,
      role: "current"
    }
  ]
};
