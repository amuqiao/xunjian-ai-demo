// 知识库派生器（阶段三 G1）：从 scripts/data/kb-dataset.js 的正文确定性切分 chunk、
// 按种子生成相似度、按预设问答检索命中。换了数据集之后动画和引用会自动跟着新内容走
// ——这里不存在任何手写的 chunk 列表或相似度表，全部从 body 现算。
//
// 依赖顺序：必须晚于 scripts/data/seed.js（复用 hashKey/makeRandom）和
// scripts/data/kb-dataset.js（读 window.DemoKbDataset），早于 scripts/data/graph.js
// （投影器要用 documents(categoryId) 取知识节点）和 scripts/data/index.js。
window.DemoKb = (function () {
  "use strict";

  var SEED = window.DemoDataSeed;
  if (!SEED) {
    throw new Error("DemoDataSeed is required，请检查 scripts/data/seed.js 是否已加载");
  }
  var DATASET = window.DemoKbDataset;
  if (!DATASET) {
    throw new Error("DemoKbDataset is required，请检查 scripts/data/kb-dataset.js 是否已加载");
  }

  // 单段 chunk 的字符数上限：只用于切分算法，不是"一份文档应该有多少 chunk"的
  // 预设——chunk 数量完全由 body 的实际长度决定，见 chunksOf()。
  var MAX_CHUNK_CHARS = 170;

  // ingestPlan() 的动画展示上限：换了长文档可能切出几十段，动画只渲染
  // min(总数, INGEST_DISPLAY_CAP) 个方块，不能假设总数恰好等于这个上限。
  var INGEST_DISPLAY_CAP = 12;

  // 两个区间必须**不相交**：命中段永远高于非命中段。
  // 早先取 base 0.62-0.94 / hint 0.88-0.96 是重叠的，于是"命中段稳定进前 3"只能靠
  // 把检索候选池缩到"该问答已声明引用的那几份文档"里才成立——那样演的就只是
  // "给定文档找最相关段落"，而这个 demo 的意义恰恰是"为什么 Agent 能从库里捞出
  // 这份文档"。区间分开之后可以放心做全库检索，top-3 依然稳定。
  var BASE_LOW = 0.55;
  var BASE_HIGH = 0.82;
  var HINT_LOW = 0.88;
  var HINT_HIGH = 0.96;

  // ---------- 基础查表：未知 id 一律抛错 ----------

  function categoryOf(categoryId) {
    var i;
    for (i = 0; i < DATASET.categories.length; i += 1) {
      if (DATASET.categories[i].id === categoryId) return DATASET.categories[i];
    }
    throw new Error("Missing kb category: " + categoryId);
  }

  function documentOf(docId) {
    var i;
    for (i = 0; i < DATASET.documents.length; i += 1) {
      if (DATASET.documents[i].id === docId) return DATASET.documents[i];
    }
    throw new Error("Missing kb document: " + docId);
  }

  function presetOf(qaPresetId) {
    var i;
    for (i = 0; i < DATASET.qaPresets.length; i += 1) {
      if (DATASET.qaPresets[i].id === qaPresetId) return DATASET.qaPresets[i];
    }
    throw new Error("Missing qa preset: " + qaPresetId);
  }

  function categories() {
    return DATASET.categories;
  }

  // categoryId 缺省时返回全部文档；传入非法 categoryId 直接抛错（借
  // categoryOf 的查找做校验），不做兜底退回全部文档。
  function documents(categoryId) {
    if (categoryId === undefined || categoryId === null) return DATASET.documents;
    categoryOf(categoryId);
    return DATASET.documents.filter(function (doc) {
      return doc.categoryId === categoryId;
    });
  }

  function documentById(docId) {
    return documentOf(docId);
  }

  // ---------- 确定性切分：body 是自然段数组，按句号累加到不超过 MAX_CHUNK_CHARS
  // 为止切出一个 chunk；单句本身超限时整句单独成一个 chunk（不做更细的字符级硬切，
  // 保留语义完整）。换正文只改 kb-dataset.js 的 body 数组，这里不需要任何改动，
  // chunk 数量和内容会自动重算。 ----------

  function splitParagraph(paragraph) {
    var sentences = paragraph.split("。").filter(function (s) { return s.length > 0; });
    var pieces = [];
    var current = "";
    var i, sentence, candidate;
    for (i = 0; i < sentences.length; i += 1) {
      sentence = sentences[i] + "。";
      candidate = current + sentence;
      if (current && candidate.length > MAX_CHUNK_CHARS) {
        pieces.push(current);
        current = sentence;
      } else {
        current = candidate;
      }
    }
    if (current) pieces.push(current);
    return pieces;
  }

  function chunksOf(docId) {
    var doc = documentOf(docId);
    if (!doc.body) {
      throw new Error("文档没有正文，无法切分 chunk：" + docId);
    }
    var texts = [];
    doc.body.forEach(function (paragraph) {
      splitParagraph(paragraph).forEach(function (text) {
        texts.push(text);
      });
    });
    return texts.map(function (text, index) {
      return { index: index, text: text, chars: text.length };
    });
  }

  function chunkAt(docId, index) {
    var chunks = chunksOf(docId);
    if (index < 0 || index >= chunks.length) {
      throw new Error("chunk index 越界：" + docId + "#" + index + "（该文档共 " + chunks.length + " 个 chunk）");
    }
    return chunks[index];
  }

  // ---------- 相似度：确定性伪随机，命中 hintChunks 时抬到 0.88-0.96 ----------

  function findHintChunks(qaPresetId, docId) {
    var preset = presetOf(qaPresetId);
    var result = [];
    preset.citations.forEach(function (citation) {
      if (citation.docId === docId) result = result.concat(citation.hintChunks);
    });
    return result;
  }

  function round3(value) {
    return Math.round(value * 1000) / 1000;
  }

  function similarity(queryId, docId, chunkIndex) {
    var chunkCount = chunksOf(docId).length;
    if (typeof chunkIndex !== "number" || chunkIndex < 0 || chunkIndex >= chunkCount) {
      throw new Error("chunk index 越界：" + docId + "#" + chunkIndex + "（该文档共 " + chunkCount + " 个 chunk）");
    }
    var isHint = findHintChunks(queryId, docId).indexOf(chunkIndex) >= 0;
    var low = isHint ? HINT_LOW : BASE_LOW;
    var high = isHint ? HINT_HIGH : BASE_HIGH;
    var seedKey = queryId + "|" + docId + "|" + chunkIndex + (isHint ? "|hint" : "");
    var rand = SEED.makeRandom(SEED.hashKey(seedKey));
    return round3(low + rand() * (high - low));
  }

  // 检索候选池限定在该预设问答 citations 覆盖的文档内：这些文档就是这条问答在知识库
  // 里"应该能查到"的范围，检索在这个范围内按相似度重排，返回前 3 条。
  // 检索结果**必须恒等于该问答声明的 citations 集合**，不能"取前 3 名"。
  //
  // 早先是 hits.slice(0, 3)，而多数问答只声明 1-2 个命中段，于是前 3 名必然掺进
  // 非命中段——后果是"动画高亮的段"和"答案实际引用的段"对不上，这正是本项目一路
  // 在防的那类穿帮（文案和数字来自同一份数据却各自解释一遍）。
  //
  // 全库仍然要打分（similarity 对任意文档的任意 chunk 都可算），动画用它把非命中段
  // 显示成低分暗块、命中段显示成高分亮块；corpusChunks 给动画显示"从全库 N 段中命中"。
  // 命中段的最低分（HINT_LOW=0.88）严格高于非命中段的最高分（BASE_HIGH=0.82），
  // 所以亮暗分层在视觉上永远成立，不需要靠缩小候选池来保证。
  function corpusChunkCount() {
    var total = 0;
    DATASET.documents.forEach(function (doc) {
      if (doc.body && doc.body.length) total += chunksOf(doc.id).length;
    });
    return total;
  }

  function retrieve(qaPresetId) {
    var preset = presetOf(qaPresetId);
    var hits = [];
    preset.citations.forEach(function (citation) {
      citation.hintChunks.forEach(function (index) {
        hits.push({
          docId: citation.docId,
          chunkIndex: index,
          text: chunkAt(citation.docId, index).text,
          score: similarity(qaPresetId, citation.docId, index)
        });
      });
    });
    hits.sort(function (a, b) { return b.score - a.score; });
    return { corpusChunks: corpusChunkCount(), hits: hits };
  }

  // 供入库动画使用的元信息：总 chunk 数、展示上限（min(总数, INGEST_DISPLAY_CAP)）。
  function ingestPlan(docId) {
    var chunks = chunksOf(docId);
    return {
      docId: docId,
      totalChunks: chunks.length,
      displayChunks: Math.min(chunks.length, INGEST_DISPLAY_CAP),
      displayCap: INGEST_DISPLAY_CAP
    };
  }

  function qaPresets() {
    return DATASET.qaPresets;
  }

  function qaPreset(qaPresetId) {
    return presetOf(qaPresetId);
  }

  function ingestionSteps() {
    return DATASET.ingestion;
  }

  return {
    MAX_CHUNK_CHARS: MAX_CHUNK_CHARS,
    INGEST_DISPLAY_CAP: INGEST_DISPLAY_CAP,
    categories: categories,
    documents: documents,
    document: documentById,
    chunksOf: chunksOf,
    similarity: similarity,
    retrieve: retrieve,
    ingestPlan: ingestPlan,
    qaPresets: qaPresets,
    qaPreset: qaPreset,
    ingestionSteps: ingestionSteps
  };
})();
