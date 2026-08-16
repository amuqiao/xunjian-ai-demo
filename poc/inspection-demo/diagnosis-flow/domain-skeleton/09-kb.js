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
      { id: "cat-std", title: "巡检制度", desc: "巡检流程、职责边界、任务下发与问题闭环要求。" },
      { id: "cat-metric", title: "视觉依据", desc: "工业电视、关键帧复核与多源证据归档口径。" },
      { id: "cat-card", title: "操作规程", desc: "现场仪表复核、处置记录与复测验收依据。" },
      { id: "cat-case", title: "归档案例", desc: "历史异常复核、处置过程和后续相似命中样本。" }
    ],

    documents: [
      {
        id: "DOC-STD",
        categoryId: "cat-std",
        title: "巡检管理流程说明",
        type: "流程说明",
        summary: "覆盖巡检标准制定、方案审核、IMS 下发、现场实施、问题上报、考核和标准完善。",
        source: "10.巡检管理/巡检管理流程说明.docx；湖南公司业务场景重塑工作任务分解表-巡检管理.xlsx",
        updatedAt: "2026-08-16",
        body: [
          "巡检管理以制定通用巡检标准和巡检方案模板为起点，生产部专业管理岗负责组织模板和通用标准，作业区结合站场、阀室、专业点表编制本区域巡检方案。",
          "作业区巡检标准应基于生产运维管理办法、站场完整性管理规定、工艺安全分析报告、风险评价报告和密封点台账形成，覆盖日常巡检、专业巡检、联合巡检和特殊巡检。",
          "巡检任务通过 IMS 系统下发到执行岗位，巡检人员按路线、点位和检查项记录结果；发现压力、差压、视频画面或现场状态异常时，应补充复核依据并形成问题记录。",
          "巡检问题需在 IMS 中上报、分派和闭环，整改完成后保留复测结果、处置说明和归档结论；标准不适配现场变化时，应回到巡检标准修改完善环节。"
        ]
      },
      {
        id: "DOC-CARD",
        categoryId: "cat-card",
        title: "压力表、差压表操作及维护规程",
        type: "操作规程",
        summary: "用于差压趋势异常复核，说明现场仪表检查、对比判读、处置记录和复测留痕要求。",
        source: "PDF版-操作规程及作业指导书/HN-SC-YK-GC-017-2025 压力表、差压表操作及维护规程.pdf",
        updatedAt: "2026-08-16",
        body: [
          "压力表、差压表巡检应核对仪表外观、接头、引压管和现场安装状态，确认表盘读数清晰、连接无松动、无泄漏、无异常振动或遮挡。",
          "示值异常或趋势接近关注线时，应与历史曲线、上下游相关测点、现场工况和视频画面交叉比对，不宜仅凭单点瞬时值直接下结论。",
          "确认异常后，应记录复测前后数值、设备运行状态、处置措施和复核人意见；若需要转处置，应同步生成作业票卡或问题整改记录。",
          "涉及拆装、校验或恢复作业时，应落实停机挂牌、监护确认和试运行观察，复测结果应回填到本次巡检记录和归档案例中。"
        ]
      },
      {
        id: "DOC-METRIC",
        categoryId: "cat-metric",
        title: "工业电视系统操作规程",
        type: "操作规程",
        summary: "用于说明视频巡检、关键帧复核和视觉证据归档的演示口径。",
        source: "PDF版-操作规程及作业指导书/HN-SC-TX-GC-001-2025 工业电视系统操作规程.pdf",
        updatedAt: "2026-08-16",
        body: [
          "工业电视系统用于站场、阀室、阀组、管廊和关键设备区域的远程画面巡查，巡检人员应确认画面清晰、时间一致、重点区域无遮挡。",
          "发生仪表、差压或时序异常时，视频画面应作为辅助复核证据，重点查看目标设备周边状态、人员作业、泄漏迹象、异常位移和环境变化。",
          "视频证据应与巡检记录、时序数据、人工复核结论一起归档；用于模型复用时，应保留关键帧、截图时间和对应巡检对象。"
        ]
      },
      {
        id: "DOC-CASE",
        categoryId: "cat-case",
        title: "差压趋势异常归档案例",
        type: "归档案例",
        summary: "记录一次差压趋势异常从模型提示、人工复核、处置记录到后续相似命中的闭环过程。",
        source: "2025年技术通报汇编-v5.doc（待结构化）；本演示归档案例",
        updatedAt: "2026-08-16",
        body: [
          "某站场在日常巡检中发现压力、差压趋势持续抬升，AI 诊断同时提示主测点变化与历史相似异常接近，但置信度不足以自动确认。",
          "复核人员调取工业电视关键帧，确认目标区域画面无明显遮挡，设备周边未见外部作业干扰；同时比对副测点和上下游工况，排除单点采集误差。",
          "现场按压力表、差压表操作及维护规程完成复测，记录复测前后数值、处置措施和复核意见，最终结论为确认异常并转入处置闭环。",
          "该报告归档后作为差压趋势异常样本，后续相似记录可命中本案例，用于提示复核路径、证据组合和处置留痕要求。"
        ]
      }
    ],

    qaPresets: [
      {
        id: "QA-1",
        question: "巡检问题发现后如何闭环？",
        answer: "巡检任务由 IMS 下发，发现异常后应补充复核依据并形成问题记录；问题进入 IMS 上报、分派、整改和复测归档，标准不适配时回到巡检标准完善环节。",
        citations: [{ docId: "DOC-STD", hintChunks: [2, 3] }]
      },
      {
        id: "QA-2",
        question: "差压趋势异常复核要看哪些依据？",
        answer: "应把压力、差压历史曲线、上下游相关测点、现场工况和视频画面放在一起比对；确认异常后记录复测前后数值、处置措施和复核人意见。",
        citations: [
          { docId: "DOC-CARD", hintChunks: [1, 2] },
          { docId: "DOC-METRIC", hintChunks: [1] }
        ]
      },
      {
        id: "QA-3",
        question: "工业电视证据如何进入知识库？",
        answer: "工业电视用于远程画面巡查和异常辅助复核，归档时应保留关键帧、截图时间、巡检对象，并与时序数据和人工复核结论一并沉淀。",
        citations: [{ docId: "DOC-METRIC", hintChunks: [0, 2] }]
      }
    ],

    // 入库动画的步骤条。ms 是每步停留时长，全程约 4 秒——再长会拖节奏。
    ingestion: [
      { key: "upload", label: "上传", desc: "巡检规程进入待解析队列", ms: 700 },
      { key: "parse", label: "解析", desc: "抽取标题、来源和正文段落", ms: 700 },
      { key: "chunk", label: "切分", desc: "按条款和段落生成 chunk", ms: 700 },
      { key: "embed", label: "向量化", desc: "生成巡检语义检索向量", ms: 700 },
      { key: "index", label: "入库", desc: "写入演示知识索引", ms: 700 },
      { key: "search", label: "可检索", desc: "Agent 可引用规程依据", ms: 700 }
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
