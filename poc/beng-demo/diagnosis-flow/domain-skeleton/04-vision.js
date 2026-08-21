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
    pumpClose: "media/pump-close.jpg",
    faultSeal: "media/faults/mechanical-seal.jpg",
    faultBearingThermal: "media/faults/bearing-thermal.jpg",
    faultCavitation: "media/faults/cavitation-impeller.jpg"
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
    },
    {
      id: "FRM-3-CUR",
      partId: "PART-3",
      label: "视觉模型 · 机械密封泄漏风险",
      src: "faultSeal",
      bbox: { x: 0.15, y: 0.18, w: 0.68, h: 0.58 },
      boxLabel: "密封泄漏敏感区 0.87",
      findings: ["机械密封组件识别 0.91", "泄漏敏感区域需现场复核 0.87", "建议补充油迹近景 0.80"],
      confidence: 0.87,
      role: "current"
    },
    {
      id: "FRM-4-CUR",
      partId: "PART-4",
      label: "视觉模型 · 轴承温升热成像",
      src: "faultBearingThermal",
      bbox: { x: 0.26, y: 0.2, w: 0.48, h: 0.52 },
      boxLabel: "局部热斑 0.84",
      findings: ["轴承/电机热斑区域识别 0.84", "温度分布存在局部集中 0.81", "建议复核润滑状态 0.78"],
      confidence: 0.84,
      role: "current"
    },
    {
      id: "FRM-5-CUR",
      partId: "PART-5",
      label: "视觉模型 · 汽蚀损伤样例",
      src: "faultCavitation",
      bbox: { x: 0.08, y: 0.18, w: 0.86, h: 0.62 },
      boxLabel: "汽蚀损伤特征 0.82",
      findings: ["叶轮汽蚀损伤特征识别 0.82", "压力波动需结合入口条件复核 0.76"],
      confidence: 0.82,
      role: "current"
    },
    {
      id: "FRM-6-CUR",
      partId: "PART-6",
      label: "视觉模型 · 泵体与联轴器排除性证据",
      src: "pumpCurrent",
      bbox: { x: 0.26, y: 0.18, w: 0.48, h: 0.46 },
      boxLabel: "无渗漏 / 无明显偏移 0.88",
      findings: ["泵体外观未见渗漏 0.91", "联轴器无明显偏移 0.88", "外观证据排除泄漏和明显不对中，需结合轴承振动与 RAG 复核 0.84"],
      confidence: 0.88,
      role: "current"
    }
  ]
};
