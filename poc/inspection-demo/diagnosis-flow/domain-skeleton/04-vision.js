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
    pumpCurrent: "media/visual-models/pump-current.png",
    pumpCompare: "media/visual-models/pump-compare.png",
    plcCurrent: "media/visual-models/plc-current.png",
    powerCurrent: "media/visual-models/power-current.png"
  },

  frames: [
    {
      id: "FRM-1-CUR",
      partId: "PART-1",
      label: "泵区关键帧 · 设备状态",
      src: "pumpCurrent",
      bbox: { x: 0.36, y: 0.12, w: 0.16, h: 0.24 },
      boxLabel: "设备区域 0.89",
      findings: ["泵组主体识别 0.89", "管线与阀门区域完整 0.84", "巡检补拍位可复核 0.78"],
      confidence: 0.89,
      role: "current"
    },
    {
      id: "FRM-1-CMP",
      partId: "PART-1",
      label: "泵区关键帧 · 同点位对比",
      src: "pumpCompare",
      bbox: { x: 0.36, y: 0.12, w: 0.16, h: 0.24 },
      boxLabel: "同点位对比 0.90",
      findings: ["同路线泵组位置匹配 0.90", "现场遮挡关系一致 0.82"],
      confidence: 0.9,
      role: "compare"
    },
    {
      id: "FRM-1-LNK",
      partId: "PART-1",
      label: "PLC 联动帧 · 柜体状态",
      src: "plcCurrent",
      bbox: { x: 0.1, y: 0.13, w: 0.32, h: 0.78 },
      boxLabel: "联动核验 0.91",
      findings: ["PLC 柜体区域识别 0.91", "区域标识与巡检对象匹配 0.86"],
      confidence: 0.91,
      role: "link"
    },
    {
      id: "FRM-2-CUR",
      partId: "PART-2",
      label: "配电间关键帧 · 低压柜状态",
      src: "powerCurrent",
      bbox: { x: 0.54, y: 0.06, w: 0.36, h: 0.74 },
      boxLabel: "低压柜核验 0.87",
      findings: ["低压柜状态识别 0.87", "柜面仪表与标签清晰 0.82"],
      confidence: 0.87,
      role: "current"
    }
  ]
};
