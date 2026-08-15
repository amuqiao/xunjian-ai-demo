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
      { id: "cat-std", title: "制度规范", desc: "占位分类说明：制度、规程、标准。" },
      { id: "cat-metric", title: "指标口径", desc: "占位分类说明：阈值与统计口径。" },
      { id: "cat-card", title: "作业模板", desc: "占位分类说明：作业卡与票卡模板。" },
      { id: "cat-case", title: "归档案例", desc: "占位分类说明：历史复核与处置报告。" }
    ],

    documents: [
      {
        id: "DOC-STD",
        categoryId: "cat-std",
        title: "占位制度文档",
        type: "制度",
        summary: "占位摘要：覆盖巡检、复核与异常闭环要求。",
        source: "占位来源：企业标准 X-000",
        updatedAt: "2026-07-18",
        body: [
          "占位正文第一段：巡检作业应按路线逐项记录，不得代填。",
          "占位正文第二段：主测点越过关注线时，应结合视觉证据与副测点变化综合判读。",
          "占位正文第三段：主测点关注线取 4.5 mm/s，接近关注线时须人工复核。"
        ]
      },
      {
        id: "DOC-CARD",
        categoryId: "cat-card",
        title: "占位作业模板卡",
        type: "作业模板",
        summary: "占位摘要：处置作业的标准步骤与验收口径。",
        source: "占位来源：作业指导书 Y-000",
        updatedAt: "2026-07-15",
        body: [
          "占位正文第一段：作业前应停机挂牌并确认监护到位。",
          "占位正文第二段：作业完成后须复测并记录前后数值。"
        ]
      },
      {
        id: "DOC-METRIC",
        categoryId: "cat-metric",
        title: "占位指标口径说明",
        type: "指标口径",
        summary: "占位摘要：仅索引用，不提供全文。",
        source: "占位来源：待业务确认",
        updatedAt: "2026-07-20",
        body: null
      },
      {
        id: "DOC-CASE",
        categoryId: "cat-case",
        title: "占位历史归档案例",
        type: "归档案例",
        summary: "占位摘要：同类异常的历史复核与处置记录。",
        source: "占位来源：本演示归档",
        updatedAt: "2026-07-21",
        body: [
          "占位正文第一段：本案例记录了一次同类异常的完整复核过程。",
          "占位正文第二段：处置后复测数值回落至关注线以下。"
        ]
      }
    ],

    qaPresets: [
      {
        id: "QA-1",
        question: "占位阈值标准是多少？",
        answer: "占位答案：主测点关注线为 4.5 mm/s，接近时须人工复核。",
        citations: [{ docId: "DOC-STD", hintChunks: [2] }]
      },
      {
        id: "QA-2",
        question: "处置作业有哪些标准步骤？",
        answer: "占位答案：停机挂牌、监护到位、作业后复测并记录前后数值。",
        citations: [{ docId: "DOC-CARD", hintChunks: [0, 1] }]
      }
    ],

    // 入库动画的步骤条。ms 是每步停留时长，全程约 4 秒——再长会拖节奏。
    ingestion: [
      { key: "upload", label: "上传", desc: "占位文档进入待解析队列", ms: 700 },
      { key: "parse", label: "解析", desc: "抽取正文段落", ms: 700 },
      { key: "chunk", label: "切分", desc: "按段落切成 chunk", ms: 700 },
      { key: "embed", label: "向量化", desc: "生成检索向量", ms: 700 },
      { key: "index", label: "入库", desc: "写入演示向量索引", ms: 700 },
      { key: "search", label: "可检索", desc: "Agent 可引用该来源", ms: 700 }
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
