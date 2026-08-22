// 场景：知识库。要回答的问题是"资料怎么进来、怎么被检索到"。
//
// 职责收窄为三件事：报告资产、上传入库动画、Agent 问答。文档关系图不放在这个
// 演示里，避免几分钟讲解被流程细节淹没。
(function () {
  "use strict";

  var AppState = window.AppState;
  var KB = window.DOMAIN_KB;
  var ReportModel = window.ReportModel;
  var REPORT = window.DOMAIN_REPORT;
  var AGENTQA = window.DOMAIN_AGENTQA;
  var Overlay = window.Overlay;

  function documentById(docId) {
    var archived = ReportModel.archivedDocument();
    if (archived && archived.id === docId) return archived;
    return KB.document(docId);
  }

  // ---------------------------------------------------------------- 知识资产

  function uploadRunning() {
    var state = AppState.value;
    var steps = KB.ingestion().length;
    return state.pick.knowledge.ingestStep > 0 && state.pick.knowledge.ingestStep < steps;
  }

  function renderUploadButton() {
    var running = uploadRunning();
    return h("button", {
      type: "button",
      class: "primary-action kb-upload-action",
      disabled: running ? "disabled" : null,
      dataset: { action: "start-ingest", focusKey: "ingest" },
      text: running ? "上传中…" : "上传文档"
    });
  }

  function renderAssetRow(asset) {
    return h("div", { class: "kb-asset" + (asset.fresh ? " fresh" : "") }, [
      h("div", { class: "kb-asset-main" }, [
        h("div", { class: "kb-asset-head" }, [
          h("span", { class: "kb-asset-type", text: asset.type }),
          asset.fresh ? h("span", { class: "kb-doc-new", text: "NEW" }) : null,
          h("strong", { text: asset.title })
        ]),
        h("p", { text: asset.summary }),
        h("div", { class: "kb-asset-tags" }, asset.tags.map(function (tag) {
          return h("span", { text: tag });
        }))
      ]),
      h("div", { class: "kb-asset-side" }, [
        h("span", { class: "kb-asset-status", text: asset.status }),
        asset.docId ? h("button", {
          type: "button",
          class: "plain-button",
          dataset: { action: "open-doc", docId: asset.docId, focusKey: "doc:" + asset.docId },
          text: "查看"
        }) : h("span", { class: "kb-waiting", text: "待归档" })
      ])
    ]);
  }

  function reportAsset() {
    var archived = ReportModel.archivedDocument();
    if (archived) {
      return {
        type: "复核报告",
        title: archived.title,
        summary: "来源：人工复核归档。已沉淀为可检索、可引用的巡检复核案例。",
        tags: ["湘潭站", "巡检复核", "人工确认"],
        status: "已入库",
        docId: archived.id,
        fresh: true
      };
    }
    return {
      type: "复核报告",
      title: "巡检智能复核报告",
      summary: "人工复核确认后会在这里出现，作为可信报告资产进入知识库。",
      tags: ["报告归档", "专家确认", "可追溯"],
      status: "等待归档",
      docId: null,
      fresh: false
    };
  }

  function uploadedAssets() {
    var demoDoc = KB.document(KB.ingestDemoDocId());
    var stdDoc = KB.document("DOC-STD");
    return [
      {
        type: "上传文档",
        title: demoDoc.title,
        summary: "来源：" + demoDoc.source + "。用于演示用户上传资料进入知识库资产。",
        tags: ["操作规程", "现场复核", "可检索"],
        status: "已索引",
        docId: demoDoc.id,
        fresh: false
      },
      {
        type: "上传文档",
        title: stdDoc.title,
        summary: "来源：" + stdDoc.source + "。用于约束 AI 诊断建议和人工复核边界。",
        tags: ["巡检流程", "问题闭环", "引用依据"],
        status: "已索引",
        docId: stdDoc.id,
        fresh: false
      }
    ];
  }

  function renderAssetPanel() {
    var assets = [reportAsset()].concat(uploadedAssets());
    var searchableCount = assets.filter(function (asset) { return !!asset.docId; }).length;
    return h("section", { class: "panel kb-asset-panel" }, [
      h("header", { class: "kb-asset-panel-head" }, [
        h("div", {}, [
          h("p", { class: "kicker", text: "报告归档 · 文档上传 · Agent 复用" }),
          h("h3", { text: "知识库资产" }),
          h("small", { text: assets.length + " 份资产 · " + searchableCount + " 份可检索 · Agent 已启用" })
        ]),
        renderUploadButton()
      ]),
      h("div", { class: "kb-status-strip", "aria-label": "知识库资产状态" }, [
        h("div", { class: "kb-status-card" }, [
          h("span", { text: "报告归档" }),
          h("strong", { text: ReportModel.archivedDocument() ? "1 份" : "待归档" }),
          h("small", { text: ReportModel.archivedDocument() ? "人工复核报告已入库" : "复核后自动进入资产" })
        ]),
        h("div", { class: "kb-status-card" }, [
          h("span", { text: "上传文档" }),
          h("strong", { text: uploadedAssets().length + " 份" }),
          h("small", { text: "巡检制度 / 操作规程" })
        ]),
        h("div", { class: "kb-status-card" }, [
          h("span", { text: "Agent 检索" }),
          h("strong", { text: "已启用" }),
          h("small", { text: searchableCount + " 份资产可引用" })
        ])
      ]),
      h("div", { class: "kb-asset-list" }, assets.map(renderAssetRow)),
      h("footer", { class: "kb-index-hint" }, [
        h("span", { text: "轻量索引" }),
        h("strong", { text: "巡检对象" }),
        h("strong", { text: "异常类型" }),
        h("strong", { text: "处置经验" }),
        h("strong", { text: "复核结论" })
      ])
    ]);
  }

  function renderIndexPanel() {
    var archived = ReportModel.archivedDocument();
    var knowledgeContext = AGENTQA.contexts.filter(function (context) { return context.id === "knowledge"; })[0];
    if (!knowledgeContext) throw new Error("[knowledge] 缺少 knowledge Agent 上下文");
    var presets = knowledgeContext.questions.filter(function (question) {
      if (question.unlockedBy === "archived") return !!archived;
      return true;
    }).slice(0, 3);
    return h("aside", { class: "panel kb-index-panel" }, [
      h("div", { class: "kb-index-panel-head" }, [
        h("p", { class: "kicker", text: "索引状态 · Agent 命中" }),
        h("h3", { text: "资产复用" })
      ]),
      h("div", { class: "kb-pipeline" }, [
        h("article", { class: "kb-pipeline-step done" }, [
          h("span", { text: "01" }),
          h("strong", { text: "报告归档" }),
          h("small", { text: archived ? "复核报告已形成案例资产" : "等待人工复核确认" })
        ]),
        h("article", { class: "kb-pipeline-step done" }, [
          h("span", { text: "02" }),
          h("strong", { text: "资料索引" }),
          h("small", { text: uploadedAssets().length + " 份巡检资料可被检索" })
        ]),
        h("article", { class: "kb-pipeline-step active" }, [
          h("span", { text: "03" }),
          h("strong", { text: "Agent 引用" }),
          h("small", { text: "问答直接引用规程、案例和复核结论" })
        ])
      ]),
      h("div", { class: "kb-query-panel" }, [
        h("span", { class: "kb-side-label", text: "常用问题" }),
        h("div", { class: "kb-query-list" }, presets.map(function (preset) {
          return h("button", {
            type: "button",
            class: "kb-query-chip",
            dataset: {
              action: "open-agent",
              agentContext: "knowledge",
              agentQuestionId: preset.id,
              focusKey: "qa:" + preset.id
            },
            text: preset.question
          });
        }))
      ]),
      h("div", { class: "kb-side-tags" }, [
        h("span", { class: "kb-side-label", text: "轻量索引" }),
        h("div", {}, ["巡检对象", "异常类型", "处置经验", "复核结论", "引用依据"].map(function (tag) {
          return h("strong", { text: tag });
        }))
      ])
    ]);
  }

  function renderKnowledgeAgentFab() {
    return h("button", {
      type: "button",
      class: "wb-agent-fab kb-agent-fab",
      title: "Agent 问答",
      "aria-label": "打开知识库 Agent 问答",
      dataset: { action: "open-agent", agentContext: "knowledge", focusKey: "open-agent" },
      text: "AI"
    });
  }

  // ---------------------------------------------------------------- 文档阅读器

  function chunksOfDoc(doc) {
    if (doc.id === "DOC-ARCHIVED" || doc.isNew) {
      return (doc.body || []).map(function (text, index) {
        return { index: index, text: text };
      });
    }
    return KB.chunksOf(doc.id);
  }

  function renderPdfReader(doc, chunkIndex) {
    var pdf = REPORT.previewPdf;
    return h("div", { class: "kb-report-reader" }, [
      h("header", { class: "kb-report-reader-head" }, [
        h("div", {}, [
          h("span", { class: "kb-reader-type", text: doc.type }),
          h("h4", { text: doc.title }),
          h("p", { text: doc.summary })
        ]),
        h("div", { class: "kb-report-reader-actions" }, [
          h("span", { text: "来源 · " + doc.source }),
          h("span", { text: "更新 · " + doc.updatedAt }),
        h("a", {
          class: "primary-action kb-download",
          href: pdf.src,
          download: pdf.filename,
          text: "下载 PDF"
        })
      ]),
      ]),
      h("main", { class: "kb-pdf-main" }, [
        h("article", { class: "kb-pdf-paper", dataset: { pdfSrc: pdf.src } }, [
          h("header", { class: "kb-pdf-paper-head" }, [
            h("span", { text: "PDF 预览" }),
            h("h3", { text: doc.title })
          ]),
          h("div", { class: "kb-pdf-paper-body" }, (doc.body || []).slice(0, 5).map(function (line) {
            return h("p", { text: line });
          }))
        ]),
        h("p", { class: "kb-pdf-fallback", text: "顶部下载按钮可打开原始 PDF 文件。" })
      ])
    ]);
  }

  function renderTextReader(doc, chunkIndex) {
    var chunks = chunksOfDoc(doc);
    var visibleChunks = chunkIndex == null
      ? chunks
      : chunks.filter(function (chunk) { return chunk.index === chunkIndex; });
    return h("div", { class: "kb-reader" }, [
      h("aside", { class: "kb-reader-side" }, [
        h("span", { class: "kb-reader-type", text: doc.type }),
        h("h4", { text: doc.title }),
        h("p", { text: doc.summary }),
        h("div", { class: "kb-reader-meta" }, [
          h("span", { text: "来源 · " + doc.source }),
          h("span", { text: "更新 · " + doc.updatedAt }),
          chunkIndex == null
            ? h("span", { text: "预览 · " + chunks.length + " 段正文" })
            : h("span", { text: "引用 · 第 " + (chunkIndex + 1) + " 段依据" })
        ])
      ]),
      h("main", { class: "kb-reader-main kb-text-main" }, visibleChunks.map(function (chunk) {
        return h("article", { class: "kb-doc-chunk" + (chunk.index === chunkIndex ? " active" : "") }, [
          h("span", { text: "段落 " + (chunk.index + 1) }),
          h("p", { text: chunk.text })
        ]);
      }))
    ]);
  }

  function renderDocReader(doc, chunkIndex) {
    if (doc.id === "DOC-ARCHIVED" || doc.isNew) return renderPdfReader(doc, chunkIndex);
    return renderTextReader(doc, chunkIndex);
  }

  function renderDocOverlay() {
    var docId = AppState.value.pick.knowledge.docId;
    if (docId === null) return null;
    var doc = documentById(docId);
    var archived = doc.id === "DOC-ARCHIVED" || doc.isNew;
    return Overlay.render({
      open: true,
      title: doc.title,
      kicker: (archived ? "PDF 预览 · " : "文档预览 · ") + doc.type,
      body: [renderDocReader(doc, AppState.value.pick.knowledge.chunkIndex)],
      actions: [],
      onCloseAction: "close-doc",
      key: "kb-doc",
      wide: true,
      panelClass: "kb-doc-overlay"
    });
  }

  // ---------------------------------------------------------------- 入库动画

  function ingestModel() {
    var doc = KB.document(KB.ingestDemoDocId());
    var preset = KB.qaPresets().filter(function (p) {
      return p.citations.some(function (c) { return c.docId === doc.id; });
    })[0];
    if (!preset) throw new Error("[knowledge] 入库演示文档没有任何预设问答引用它：" + doc.id);
    var hits = KB.retrieve(preset.id).hits.filter(function (hit) { return hit.docId === doc.id; });
    return {
      doc: doc,
      preset: preset,
      chunks: KB.chunksOf(doc.id),
      hits: hits,
      hitIndexes: hits.map(function (hit) { return hit.chunkIndex; })
    };
  }

  function renderIngestBody() {
    var model = ingestModel();
    var steps = KB.ingestion();

    return h("div", { class: "kb-ingest" }, [
      h("div", { class: "kb-roadmap" }, steps.map(function (item, index) {
        return h("div", { class: "kb-roadmap-step", dataset: { roadmapIndex: String(index) } }, [
          h("span", { class: "kb-roadmap-index", text: String(index + 1) }),
          h("span", { class: "kb-roadmap-label", text: item.label }),
          h("small", { text: item.desc })
        ]);
      })),

      h("div", { class: "kb-progress", dataset: { ingestPart: "progress" } }, [
        h("span", { class: "kb-progress-name", text: "《" + model.doc.title + "》" }),
        h("div", { class: "kb-progress-track" }, [
          h("i", { dataset: { ingestPart: "progressBar" }, style: "width:0%" })
        ]),
        h("span", { class: "kb-progress-text", dataset: { ingestPart: "progressText" }, text: "" })
      ]),

      h("div", { class: "kb-chunk-field", dataset: { ingestPart: "chunks" } }, model.chunks.map(function (chunk) {
        var hit = model.hits.filter(function (item) { return item.chunkIndex === chunk.index; })[0];
        var score = hit ? hit.score : 0.31 + 0.01 * chunk.index;
        return h("div", {
          class: "kb-rag-chunk",
          style: "--i:" + chunk.index,
          dataset: {
            chunkIndex: String(chunk.index),
            chunkHit: model.hitIndexes.indexOf(chunk.index) >= 0 ? "1" : "0",
            chunkScore: score.toFixed(3)
          }
        }, [
          h("span", { class: "kb-rag-index", text: "第 " + (chunk.index + 1) + " 段" }),
          h("p", { text: chunk.text }),
          h("span", { class: "kb-rag-score", text: "待向量化" })
        ]);
      })),

      h("div", { class: "kb-vector", dataset: { ingestPart: "vector" } }, [
        h("span", { text: "向量库" }),
        h("strong", { text: "共 " + model.chunks.length + " 段待索引" })
      ]),

      h("div", { class: "kb-query", dataset: { ingestPart: "query" } }, [
        h("span", { class: "kb-query-tag", text: "查询" }),
        h("strong", { text: model.preset.question }),
        h("span", { class: "kb-query-hit", dataset: { ingestPart: "queryHit" }, text: "" })
      ])
    ]);
  }

  function renderIngestOverlay() {
    var state = AppState.value;
    if (!state.pick.knowledge.ingestOpen) return null;
    return Overlay.render({
      open: true,
      title: "文档入库演示",
      kicker: "上传 → 解析 → 切分 → 向量化 → 入库 → 可检索",
      body: [renderIngestBody()],
      actions: [],
      onCloseAction: "close-ingest",
      key: "kb-ingest",
      wide: true,
      panelClass: "kb-ingest-overlay"
    });
  }

  function refreshIngest() {
    var state = AppState.value;
    if (!state.pick.knowledge.ingestOpen) return;
    var root = document.querySelector(".kb-ingest");
    if (!root) return;

    var steps = KB.ingestion();
    var step = state.pick.knowledge.ingestStep;
    var finished = step === steps.length;
    var model = ingestModel();

    root.querySelectorAll(".kb-roadmap-step").forEach(function (node) {
      var index = Number(node.dataset.roadmapIndex);
      node.classList.toggle("done", index < step);
      node.classList.toggle("active", index === step - 1);
    });

    root.querySelector('[data-ingest-part="progressBar"]').style.width =
      Math.round(step / steps.length * 100) + "%";
    root.querySelector('[data-ingest-part="progressText"]').textContent =
      step + " / " + steps.length + " · " + steps[Math.max(0, step - 1)].label;

    root.querySelector('[data-ingest-part="chunks"]').classList.toggle("visible", step >= 3);

    root.querySelectorAll(".kb-rag-chunk").forEach(function (node) {
      var scored = step >= 4;
      node.classList.toggle("scored", scored);
      node.classList.toggle("hit", step >= 6 && node.dataset.chunkHit === "1");
      node.querySelector(".kb-rag-score").textContent =
        scored ? "相似度 " + node.dataset.chunkScore : "待向量化";
    });

    var vector = root.querySelector('[data-ingest-part="vector"]');
    vector.classList.toggle("done", step >= 5);
    vector.querySelector("strong").textContent =
      "共 " + model.chunks.length + " 段" + (step >= 5 ? "已索引" : "待索引");

    root.querySelector('[data-ingest-part="query"]').classList.toggle("visible", step >= 6);
    root.querySelector('[data-ingest-part="queryHit"]').textContent =
      finished ? "命中 " + model.hits.length + " 段" : "";

    var closeButton = document.querySelector(".kb-ingest-overlay .overlay-close");
    if (closeButton) closeButton.disabled = false;
  }

  // ---------------------------------------------------------------- 顶层

  function renderKnowledge() {
    return AppState.pageShell(
      "知识库 / 资产复用",
      "诊断知识库",
      h("span", { class: "kb-page-status", text: "报告归档 · 文档上传 · Agent 可检索" }),
      h("div", { class: "kb-scene" }, [
        h("div", { class: "kb-layout" }, [
          renderAssetPanel(),
          renderIndexPanel()
        ]),
        renderKnowledgeAgentFab()
      ])
    );
  }

  function renderKnowledgeOverlays() {
    return [renderDocOverlay(), renderIngestOverlay()];
  }

  window.Scenes = window.Scenes || {};
  window.Scenes.renderKnowledge = renderKnowledge;
  window.Scenes.renderKnowledgeOverlays = renderKnowledgeOverlays;
  window.Scenes.refreshIngest = refreshIngest;
})();
