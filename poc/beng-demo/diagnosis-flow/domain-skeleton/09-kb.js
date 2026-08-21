// 领域契约 09：知识库。
//
// 这一页的职责收窄为三件事：文档索引、上传入库动画、Agent 问答。**不画任何关系图
// 或节点连线**——文档之间的关系可视化由独立的知识文档地图 POC 承担，与本 POC 无关。
//
// body: null 表示"仅摘要"文档，不参与切分、不可下载。空数组是非法的：没有正文请
// 显式写 null，让"这份材料只有摘要"成为一个声明，而不是一次疑似漏填。
//
// archiveTarget.categoryId 是归档动画的落点，也是那个 "+1" 计数的目标分类。归档后
// 新文档插到该分类列表最前面并带 NEW 标——这是把报告归档和知识库真正缝上的那一针。
window.DOMAIN_KB = (function () {
  "use strict";

  var DATA = {
    categories: [
      { id: "cat-std", title: "标准规范", desc: "API 610/API 682、输油泵运行维护和专家复核边界。" },
      { id: "cat-metric", title: "监测指标", desc: "振动、相位差、频谱、基础振动和复测验收口径。" },
      { id: "cat-card", title: "作业模板", desc: "对中作业卡、轴承拆装、机械密封和标准化检修票卡。" },
      { id: "cat-case", title: "归档案例", desc: "P-1 不对中处置、轴承剥落、后续复检相似命中和历史停泵/泄漏案例。" }
    ],

    documents: [
      {
        id: "DOC-STD",
        categoryId: "cat-std",
        title: "输油泵诊断复核边界说明",
        type: "标准规范",
        summary: "说明输油泵智能诊断只组织证据和建议，最终结论需专家复核确认。",
        source: "API 610-2010；油气站场设备设施资产完整性管理规范；演示方案",
        updatedAt: "2026-07-22",
        body: [
          "输油泵智能诊断用于组织时序趋势、频谱特征、巡检记录、现场照片和专家规则，形成复核建议；它不能替代专家最终结论。",
          "当泵驱动端振动升高、联轴器相位差异常且 2X 频谱成分突出时，应进入联轴器不对中复核，并结合底座基础振动和管道约束排查。",
          "泵驱动端振动关注线按 4.5mm/s 演示口径处理；接近或越过关注线时，应补充现场复测、激光对中读数和复核意见。"
        ]
      },
      {
        id: "DOC-CARD",
        categoryId: "cat-card",
        title: "ZLMI400 07型鲁尔输油泵对中作业卡",
        type: "作业模板",
        summary: "用于 P-1 联轴器不对中复核和处置票卡生成的标准模板。",
        source: "P1/04-ZLMI400 07型鲁尔输油泵对中作业卡.doc",
        updatedAt: "2026-07-22",
        body: [
          "对中作业前应完成停机挂牌、监护确认、工器具准备和现场风险交底，确认泵组具备安全作业条件。",
          "激光对中仪安装后，应记录调整前读数、联轴器相位状态和地脚垫片调整情况；调整过程应避免管道约束导致重复偏移。",
          "作业完成后应复测泵驱动端振动、联轴器相位差和基础振动，记录调整前后数值并回填处置票卡。"
        ]
      },
      {
        id: "DOC-METRIC",
        categoryId: "cat-metric",
        title: "输油泵机组运行状态监测指标说明",
        type: "指标口径",
        summary: "解释振动、相位差、2X 频谱和基础振动在不对中诊断中的演示口径；本演示仅保留摘要，不参与 chunk 切分。",
        source: "输油泵机组运行状态监测报告2026年5月/6月-湖南公司",
        updatedAt: "2026-07-22",
        body: null
      },
      {
        id: "DOC-CASE",
        categoryId: "cat-case",
        title: "长岭站 P-1 输油泵不对中诊断与处置报告",
        type: "归档案例",
        summary: "记录 P-1 从疑似不对中、专家复核、对中处置到后续复检相似命中的闭环样例。",
        source: "湖南公司长岭站P-1输油泵机组状态检测与评估报告；本演示归档案例",
        updatedAt: "2026-07-22",
        body: [
          "P-1 输油泵在巡检中出现泵驱动端振动升高、联轴器相位差异常和 2X 频谱突出，AI 组织证据后建议进入不对中复核。",
          "专家复核调取激光对中仪读数、现场近景照片、底座基础振动和作业卡模板，确认需要执行对中复核和处置票卡。",
          "处置后复测显示泵驱动端振动由 5.82mm/s 回落至 1.80mm/s，联轴器相位差由 81° 收敛至可接受范围。",
          "案例归档后，P-1 后续复检再次出现相似 2X 频谱、相位差异常和基础振动偏大标签时，可复用复核路径和作业清单，但不能直接继承上一次结论。"
        ]
      },
      {
        id: "DOC-SEAL-CARD",
        categoryId: "cat-card",
        title: "K248 泵机组机械密封更换与泄漏复核卡",
        type: "作业模板",
        summary: "用于机械密封漏油、油迹和泄漏回收异常的现场复核与处置票卡。",
        source: "K248 泵机组机械密封更换；站场设备设施泄漏管理暂行细则",
        updatedAt: "2026-07-22",
        body: [
          "机械密封泄漏复核应检查密封端面、轴套磨损、冲洗管路、冷却水状态和泄漏回收口，记录油迹、液滴或油雾位置。",
          "当视觉模型识别到密封区域油迹，且泄漏告警指数持续越线时，应补拍近景照片并确认是否生成机械密封处置票卡。",
          "处置完成后需复核泄漏回收状态、泵驱动端振动和轴承温度，确认没有因密封异常引起的伴随风险。"
        ]
      },
      {
        id: "DOC-BEARING-CARD",
        categoryId: "cat-card",
        title: "泵驱动端轴承温升复核作业卡",
        type: "作业模板",
        summary: "用于轴承温度告警、热成像热斑和润滑状态异常的复核处置。",
        source: "泵机组润滑油更换作业卡；输油泵机组运行状态监测指标说明",
        updatedAt: "2026-07-22",
        body: [
          "轴承温升复核应先确认运行负荷、润滑油位、油质、轴承箱异响和振动伴随变化，避免只凭单点温度下结论。",
          "热成像出现局部热斑且温度曲线持续抬升时，应复核润滑不足、轴承游隙、安装偏差和冷却条件。",
          "形成处置记录时应保留温度趋势、热成像关键帧、润滑复核结果和复测温度。"
        ]
      },
      {
        id: "DOC-BEARING-SPALL-CASE",
        categoryId: "cat-case",
        title: "2023年XX站2号轴承内圈剥落处置案例",
        type: "归档案例",
        summary: "用于演示 RAG 检索：轴承、振动上升和当前工况共同命中历史内圈剥落案例。",
        source: "2023年XX站设备检修报告；演示构造",
        updatedAt: "2026-07-22",
        body: [
          "2023年XX站同型号输油泵出现 2号轴承振动值异常上升，现场外观未见泵体渗漏，联轴器未见明显偏移，故障特征集中在轴承振动通道。",
          "专家复核后安排 72 小时内停机检查，拆检发现轴承内圈剥落，随后更换轴承并复测振动趋势。",
          "该案例的可复用上下文包括案例特征、处置记录、设备档案、当前工况和备件型号，适合作为 RAG Top-5 相似案例之一。",
          "复用边界：RAG 可生成诊断报告、IMS 工单建议、备件信息和移动端作业卡，但是否停机检查必须由人工复核确认。"
        ]
      },
      {
        id: "DOC-BEARING-IMS-CARD",
        categoryId: "cat-card",
        title: "2号轴承振动异常复核票卡",
        type: "作业模板",
        summary: "用于演示 AI 建议匹配集团既有处理流程，生成 IMS 工单、备件信息和移动端作业卡。",
        source: "集团设备复核票卡模板；演示构造",
        updatedAt: "2026-07-22",
        body: [
          "票卡触发条件：时序引擎检测到 2号轴承振动值异常上升，且当前工况与历史轴承剥落案例相似。",
          "复核前置条件：视觉引擎确认泵体无渗漏、联轴器无明显偏移，排除泄漏和明显不对中造成的误报。",
          "应用层动作：自动生成 IMS 工单建议，推送轴承备件信息，并形成移动端作业卡供班组确认执行。"
        ]
      },
      {
        id: "DOC-CAVITATION-RULE",
        categoryId: "cat-std",
        title: "出口压力波动与汽蚀风险复核说明",
        type: "规则说明",
        summary: "用于压力波动、流量不稳和泵体异响场景的工况复核依据。",
        source: "SY/T 6695-2024 成品油管道运行规范；输油泵运行维护规程",
        updatedAt: "2026-07-22",
        body: [
          "出口压力波动告警需要结合入口压力、阀位、过滤器压差、流量设定和运行工况判断，不能直接等同于设备故障。",
          "当压力波动、泵体异响和振动升高同时出现时，应关注入口条件不足、汽蚀风险和工况切换影响。",
          "复核记录应保留压力趋势、泵体异响描述、入口条件检查结论和必要的停泵检查意见。"
        ]
      }
    ],

    qaPresets: [
      {
        id: "QA-1",
        question: "P-1 为什么判断为疑似不对中？",
        answer: "P-1 泵驱动端振动升高、联轴器相位差异常且 2X 频谱突出，同时底座基础振动作为并发证据，符合不对中复核规则。",
        citations: [
          { docId: "DOC-STD", hintChunks: [1] },
          { docId: "DOC-CASE", hintChunks: [0] }
        ]
      },
      {
        id: "QA-2",
        question: "对中作业要记录哪些内容？",
        answer: "对中作业需要记录停机挂牌、调整前读数、相位状态、地脚垫片调整情况，以及处置后的振动、相位差和基础振动复测结果。",
        citations: [{ docId: "DOC-CARD", hintChunks: [0, 1, 2] }]
      },
      {
        id: "QA-3",
        question: "P-1 后续复检命中归档案例后能复用什么？",
        answer: "可以复用 P-1 的复核路径、作业模板、复测指标和报告结构；后续复检是否确认不对中仍需依据本轮现场复核重新判断。",
        citations: [{ docId: "DOC-CASE", hintChunks: [3] }]
      },
      {
        id: "QA-4",
        question: "泵驱动端振动和相位差阈值是多少？",
        answer: "演示口径中泵驱动端振动关注线为 4.5mm/s；P-1 当前 5.82mm/s 已越线，联轴器相位差约 81°，需要结合 2X 频谱和现场复测综合判断。",
        citations: [
          { docId: "DOC-STD", hintChunks: [2] },
          { docId: "DOC-CASE", hintChunks: [0] }
        ]
      },
      {
        id: "QA-5",
        question: "处置后复测要看哪些指标？",
        answer: "处置后应复测泵驱动端振动、联轴器相位差和基础振动，并记录调整前后数值回填处置票卡；P-1 案例中振动由 5.82mm/s 回落至 1.80mm/s。",
        citations: [
          { docId: "DOC-CARD", hintChunks: [2] },
          { docId: "DOC-CASE", hintChunks: [2] }
        ]
      },
      {
        id: "QA-6",
        question: "2号轴承振动异常如何生成复核票卡？",
        answer: "演示链路先由时序引擎识别 2号轴承振动值异常上升，再由视觉引擎排除泵体渗漏和联轴器明显偏移，RAG 检索历史轴承剥落案例后，生成 IMS 工单建议、备件信息和移动端作业卡。",
        citations: [
          { docId: "DOC-BEARING-SPALL-CASE", hintChunks: [0, 2, 3] },
          { docId: "DOC-BEARING-IMS-CARD", hintChunks: [0, 1, 2] }
        ]
      }
    ],

    // 入库动画的步骤条。ms 是每步停留时长，全程约 4 秒——再长会拖节奏。
    ingestion: [
      { key: "upload", label: "上传", desc: "输油泵报告和作业卡进入待解析队列", ms: 700 },
      { key: "parse", label: "解析", desc: "抽取设备、测点、故障模式和处置段落", ms: 700 },
      { key: "chunk", label: "切分", desc: "按报告章节和作业步骤生成 chunk", ms: 700 },
      { key: "embed", label: "向量化", desc: "生成泵课题语义检索向量", ms: 700 },
      { key: "index", label: "入库", desc: "写入泵智能运维知识索引", ms: 700 },
      { key: "search", label: "可检索", desc: "Agent 可引用报告、规则和作业卡", ms: 700 }
    ],

    ingestDemoDocId: "DOC-CARD",
    archiveTarget: { categoryId: "cat-case" }
  };

  function document(docId) {
    var i;
    for (i = 0; i < DATA.documents.length; i += 1) {
      if (DATA.documents[i].id === docId) return DATA.documents[i];
    }
    throw new Error("[DOMAIN_KB] 未知文档：" + docId);
  }

  // 切分口径：一段正文一个 chunk。放在契约里而不是骨架里，是因为换课题时"怎么算
  // 一段"可能不同（比如按条款号切）；骨架只消费 { index, text } 这个形状。
  function chunksOf(docId) {
    var doc = document(docId);
    if (!doc.body) return [];
    return doc.body.map(function (text, index) {
      return { index: index, text: text };
    });
  }

  function qaPreset(presetId) {
    var i;
    for (i = 0; i < DATA.qaPresets.length; i += 1) {
      if (DATA.qaPresets[i].id === presetId) return DATA.qaPresets[i];
    }
    throw new Error("[DOMAIN_KB] 未知问答预设：" + presetId);
  }

  // 检索结果**必须恒等于该预设声明的 citations 集合**，不能是"取前 N 名"。
  // pump-demo 早先是 hits.slice(0, 3)，而多数预设只声明 1~2 个命中段，于是前 3 名
  // 必然掺进非命中段：动画高亮的 chunk 和答案实际引用的 chunk 对不上，而当时全套
  // 数据断言是绿的——因为没有任何一条断言"检索结果恒等于 citations"。
  function retrieve(presetId) {
    var preset = qaPreset(presetId);
    var hits = [];
    preset.citations.forEach(function (citation) {
      var chunks = chunksOf(citation.docId);
      citation.hintChunks.forEach(function (chunkIndex) {
        hits.push({
          docId: citation.docId,
          chunkIndex: chunkIndex,
          text: chunks[chunkIndex].text,
          score: 0.8 + 0.02 * chunkIndex
        });
      });
    });
    return { presetId: presetId, hits: hits };
  }

  return {
    categories: function () { return DATA.categories; },
    documents: function (categoryId) {
      if (categoryId === undefined) return DATA.documents;
      return DATA.documents.filter(function (doc) { return doc.categoryId === categoryId; });
    },
    document: document,
    chunksOf: chunksOf,
    qaPresets: function () { return DATA.qaPresets; },
    qaPreset: qaPreset,
    retrieve: retrieve,
    ingestion: function () { return DATA.ingestion; },
    // 下面两个也必须是函数，不能直接导出 DATA 里的值。原来 ingestDemoDocId 导出的是
    // 一个字符串快照、archiveTarget 导出的是对象引用——同一份契约里一个是死的、一个
    // 是活的，读的人分不清，改 DATA 时也只有一半生效。统一成访问器。
    ingestDemoDocId: function () { return DATA.ingestDemoDocId; },
    archiveTarget: function () { return DATA.archiveTarget; },
    raw: DATA
  };
})();
