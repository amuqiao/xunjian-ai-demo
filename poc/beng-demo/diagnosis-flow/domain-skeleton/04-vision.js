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
    placeholderCurrent: "media/placeholder-current.svg",
    placeholderCompare: "media/placeholder-compare.svg",
    placeholderLink: "media/placeholder-link.svg"
  },

  frames: [
    {
      id: "FRM-1-CUR",
      partId: "PART-1",
      label: "占位当前帧",
      src: "placeholderCurrent",
      bbox: { x: 0.32, y: 0.28, w: 0.3, h: 0.26 },
      boxLabel: "占位目标 0.89",
      findings: ["占位识别项一 0.89", "占位识别项二 0.76", "占位识别项三 0.71"],
      confidence: 0.89,
      role: "current"
    },
    {
      id: "FRM-1-CMP",
      partId: "PART-1",
      label: "占位对比帧",
      src: "placeholderCompare",
      bbox: { x: 0.3, y: 0.27, w: 0.29, h: 0.25 },
      boxLabel: "占位目标 0.90",
      findings: ["占位识别项一 0.90"],
      confidence: 0.9,
      role: "compare"
    },
    {
      id: "FRM-1-LNK",
      partId: "PART-1",
      label: "占位关联帧",
      src: "placeholderLink",
      bbox: { x: 0.18, y: 0.4, w: 0.44, h: 0.3 },
      boxLabel: "占位关联点位 0.81",
      findings: ["占位识别项四 0.81"],
      confidence: 0.81,
      role: "link"
    },
    {
      id: "FRM-2-CUR",
      partId: "PART-2",
      label: "占位对照部位当前帧",
      src: "placeholderCurrent",
      bbox: { x: 0.4, y: 0.36, w: 0.22, h: 0.2 },
      boxLabel: "占位对照目标 0.84",
      findings: ["占位识别项五 0.84"],
      confidence: 0.84,
      role: "current"
    }
  ]
};
