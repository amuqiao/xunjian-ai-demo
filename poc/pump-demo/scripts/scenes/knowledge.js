// 场景：泵知识库。主页面负责"找文档 / 看资产状态 / 发起演示"，长内容和
// RAG 入库动画都放进弹窗，避免页面常态被大段文字或动画舞台占满。
(function () {
  "use strict";

  var DATA = window.DemoData;
  var AppState = window.AppState;
  var state = window.AppState.value;
  var Cards = window.Cards;
  var SelectList = window.SelectList;
  var Overlay = window.Overlay;

  var INGEST_DEMO_DOC_ID = "doc-align-card";
  var lastDocBlobUrl = null;

  function activeCategoryId() {
    return state.pick.knowledge.categoryId || DATA.kbCategories()[0].id;
  }

  function activeCategory() {
    return DATA.kbCategories().filter(function (cat) { return cat.id === activeCategoryId(); })[0];
  }

  function categoryDocs() {
    return DATA.kbDocuments(activeCategoryId());
  }

  function representativeDoc() {
    var docs = categoryDocs();
    var bodyDoc = docs.filter(function (doc) { return doc.body; })[0];
    return bodyDoc || docs[0];
  }

  function docReferences(docId) {
    return DATA.qaPresets().filter(function (preset) {
      return preset.citations.some(function (citation) { return citation.docId === docId; });
    });
  }

  function docTags(doc) {
    var tags = [doc.type, doc.body ? "可视化正文" : "仅摘要", doc.body ? "可下载" : "不可下载"];
    if (docReferences(doc.id).length) tags.push("Agent 可命中");
    return tags;
  }

  function ingestDemoPreset() {
    var matches = DATA.qaPresets().filter(function (preset) {
      return preset.citations.some(function (citation) { return citation.docId === INGEST_DEMO_DOC_ID; });
    });
    if (!matches.length) {
      throw new Error("找不到引用 " + INGEST_DEMO_DOC_ID + " 的预设问答，入库演示的检索命中环节无法工作");
    }
    return matches[0];
  }

  function ingestCaptionText(plan) {
    if (plan.totalChunks <= plan.displayChunks) return "共 " + plan.totalChunks + " 段";
    return "共 " + plan.totalChunks + " 段，展示前 " + plan.displayChunks + " 段";
  }

  function ingestStatusText() {
    var step = state.pick.knowledge.ingestStep;
    if (step === DATA.kbIngestionSteps().length) return "最近一次入库演示已完成";
    if (step > 0) return "文档正在入库演示中";
    return "等待上传演示";
  }

  function renderMetrics() {
    var bodyCount = DATA.kbDocuments().filter(function (doc) { return doc.body; }).length;
    var defs = [
      { label: "知识分类", value: DATA.kbCategories().length, unit: "类", note: "制度规范 / 指标口径 / 作业模板 / 归档案例" },
      { label: "文档资产", value: DATA.kbDocuments().length, unit: "篇", note: "主页面展示索引，全文进入阅读器" },
      { label: "可视化正文", value: bodyCount, unit: "篇", note: "支持 Chunk 视图与 Markdown 下载" },
      { label: "入库状态", value: state.pick.knowledge.ingestStep === DATA.kbIngestionSteps().length ? "完成" : "待演示", unit: "", note: ingestStatusText() },
    ];
    return h("div", { class: "knowledge-metrics" }, defs.map(function (item) {
      return Cards.metric({
        label: item.label,
        value: item.value,
        unit: item.unit,
        status: "ok",
        note: item.note,
      });
    }));
  }

  function renderCategoryList() {
    var items = DATA.kbCategories().map(function (cat) {
      return {
        id: cat.id,
        label: cat.title,
        status: "ok",
        note: cat.desc,
        badge: String(DATA.kbDocuments(cat.id).length) + " 篇",
      };
    });
    var list = SelectList.render({
      name: "kb-category",
      variant: "row",
      activeId: activeCategoryId(),
      ariaLabel: "知识库分类",
      items: items,
    });
    list.className += " knowledge-category-list";
    return list;
  }

  function renderDocList() {
    return h("div", { class: "knowledge-doc-list", role: "list", "aria-label": "文档列表" }, categoryDocs().map(function (doc) {
      return h("button", {
        type: "button",
        class: "kb-doc-item" + (doc.body ? " kb-doc-item-full" : " kb-doc-item-summary"),
        dataset: { action: "open-doc", selectId: doc.id },
      }, [
        h("div", { class: "kb-doc-item-head" }, [
          h("strong", { text: doc.title }),
          h("span", { class: "kb-doc-type", text: doc.type }),
        ]),
        h("p", { text: doc.summary }),
        h("div", { class: "kb-doc-item-foot" }, [
          h("small", { text: doc.updatedAt }),
          h("span", {
            class: "kb-doc-badge " + (doc.body ? "kb-doc-badge-full" : "kb-doc-badge-summary"),
            text: doc.body ? "阅读 / 下载" : "摘要",
          }),
        ]),
      ]);
    }));
  }

  function renderDocumentStudio() {
    var category = activeCategory();
    var doc = representativeDoc();
    var chunks = doc.body ? DATA.kbChunks(doc.id).slice(0, 3) : [];
    var references = docReferences(doc.id);
    return h("section", { class: "panel knowledge-studio-panel" }, [
      AppState.panelTitle("分类代表文档", category.title + " · " + categoryDocs().length + " 篇"),
      h("div", { class: "knowledge-studio-hero" }, [
        h("div", {}, [
          h("p", { class: "kicker", text: "当前分类" }),
          h("h3", { text: category.title }),
          h("p", { text: category.desc }),
        ]),
        h("div", { class: "knowledge-studio-score" }, [
          h("strong", { text: String(categoryDocs().length) }),
          h("span", { text: "文档" }),
        ]),
      ]),
      h("div", { class: "knowledge-visual-doc" }, [
        h("div", { class: "knowledge-visual-head" }, [
          h("div", {}, [
            h("strong", { text: doc.title }),
            h("p", { text: doc.summary }),
          ]),
          h("button", {
            type: "button",
            class: "plain-button",
            dataset: { action: "open-doc", selectId: doc.id },
            text: "打开阅读器",
          }),
        ]),
        h("div", { class: "knowledge-doc-tags" }, docTags(doc).map(function (tag) {
          return h("span", { text: tag });
        })),
        doc.body ? h("div", { class: "knowledge-chunk-preview" }, chunks.map(function (chunk) {
          return h("div", { class: "knowledge-chunk-card" }, [
            h("span", { text: "Chunk " + (chunk.index + 1) }),
            h("p", { text: chunk.text }),
          ]);
        })) : h("div", { class: "knowledge-summary-visual" }, [
          h("span", { text: "摘要材料" }),
          h("p", { text: "该材料只进入索引总览，不提供全文下载。演示时可打开阅读器查看摘要卡。" }),
        ]),
      ]),
      h("div", { class: "knowledge-studio-strip" }, [
        h("span", { text: "可命中问答：" + references.length + " 条" }),
        h("span", { text: "正文状态：" + (doc.body ? ingestCaptionText(DATA.kbIngestPlan(doc.id)) : "仅摘要") }),
        h("span", { text: "来源：" + doc.source }),
      ]),
    ]);
  }

  function renderRoadmap() {
    return h("div", { class: "kb-roadmap" }, DATA.kbIngestionSteps().map(function (label, index) {
      return h("div", { class: "kb-roadmap-chip", style: "--i:" + index }, [
        h("span", { class: "kb-roadmap-index", text: String(index + 1) }),
        h("span", { class: "kb-roadmap-label", text: label }),
      ]);
    }));
  }

  function renderIngestAnimation(doc, plan) {
    var preset = ingestDemoPreset();
    var citation = preset.citations.filter(function (item) { return item.docId === doc.id; })[0];
    var hitSet = citation.hintChunks;
    var chunks = DATA.kbChunks(doc.id).slice(0, plan.displayChunks);
    var retrieveHits = DATA.kbRetrieve(preset.id).hits;

    var chunkNodes = chunks.map(function (chunk) {
      var isHit = hitSet.indexOf(chunk.index) >= 0;
      var score;
      if (isHit) {
        var hit = retrieveHits.filter(function (item) { return item.docId === doc.id && item.chunkIndex === chunk.index; })[0];
        if (!hit) throw new Error("检索命中集合里找不到 " + doc.id + "#" + chunk.index + "，citations 与 retrieve() 结果不一致");
        score = hit.score;
      } else {
        score = window.DemoKb.similarity(preset.id, doc.id, chunk.index);
      }
      return h("div", { class: "rag-chunk " + (isHit ? "hit" : "dim"), style: "--i:" + chunk.index }, [
        h("span", { class: "rag-chunk-index", text: "第 " + (chunk.index + 1) + " 段" }),
        h("p", { class: "rag-chunk-text", text: chunk.text }),
        h("div", { class: "rag-chunk-bars", "aria-hidden": "true" }, [0, 1, 2, 3, 4].map(function () {
          return h("i", {});
        })),
        h("span", { class: "rag-chunk-score", text: "相似度 " + score.toFixed(3) }),
      ]);
    });

    return h("div", { class: "kb-rag-visual" }, [
      h("div", { class: "kb-upload-progress" }, [
        h("span", { class: "kb-upload-name", text: "《" + doc.title + "》上传中..." }),
        h("div", { class: "kb-upload-bar" }, [h("i", {})]),
      ]),
      h("div", { class: "rag-chunk-field" }, chunkNodes),
      h("div", { class: "kb-vector-store" }, [
        h("span", { class: "kb-vector-label", text: "向量库" }),
        h("strong", { class: "kb-vector-count", text: ingestCaptionText(plan) + "已索引" }),
      ]),
      h("div", { class: "kb-query-bubble" }, [
        h("span", { class: "kb-query-tag", text: "查询" }),
        h("strong", { text: preset.question }),
      ]),
    ]);
  }

  function renderUploadPanel() {
    var doc = DATA.kbDocument(INGEST_DEMO_DOC_ID);
    var finished = state.pick.knowledge.ingestStep === DATA.kbIngestionSteps().length;
    var running = state.pick.knowledge.ingestStep > 0 && !finished;
    return h("div", { class: "knowledge-upload-entry" }, [
      h("strong", { text: "文档入库演示" }),
      h("p", { text: "点击上传固定样例文档，在弹窗中播放上传、切分、向量化和命中流程。" }),
      h("div", { class: "knowledge-upload-file" }, [
        h("span", { text: doc.type }),
        h("strong", { text: doc.title }),
        h("small", { text: ingestStatusText() }),
      ]),
      h("button", {
        type: "button",
        class: "primary-action",
        dataset: { action: "start-ingest" },
        disabled: running ? "disabled" : null,
        text: running ? "入库演示中" : finished ? "重新上传演示" : "上传文档",
      }),
    ]);
  }

  function renderAgentEntryPanel() {
    var dialog = DATA.agentDialog("knowledge-agent");
    return h("div", { class: "knowledge-agent-entry" }, [
      h("strong", { text: dialog.entryTitle }),
      h("p", { text: dialog.entryText }),
      h("div", { class: "knowledge-agent-tags" }, dialog.questions.slice(0, 4).map(function (question) {
        return h("span", { text: question.label });
      })),
      h("button", {
        type: "button",
        class: "plain-button",
        dataset: { action: "open-agent-dialog", agentDialogId: "knowledge-agent" },
        text: "打开 Agent 问答"
      })
    ]);
  }

  function renderHitOverview() {
    var kinds = [
      { label: "规则", value: "不对中诊断专家规则" },
      { label: "指标", value: "振动阈值 / 相位差口径" },
      { label: "作业卡", value: "对中作业标准模板卡" },
      { label: "案例", value: "P-1 处置报告" },
    ];
    return h("div", { class: "knowledge-hit-overview" }, [
      h("strong", { text: "命中材料概览" }),
      h("div", {}, kinds.map(function (item) {
        return h("span", {}, [
          h("b", { text: item.label }),
          h("small", { text: item.value }),
        ]);
      })),
    ]);
  }

  function renderActionRail() {
    return h("section", { class: "panel knowledge-action-panel" }, [
      AppState.panelTitle("演示操作", "上传 / 问答 / 命中"),
      renderUploadPanel(),
      renderAgentEntryPanel(),
      renderHitOverview(),
    ]);
  }

  function docMarkdown(doc) {
    var lines = ["# " + doc.title, "", "- 分类：" + doc.type, "- 来源：" + doc.source, "- 更新：" + doc.updatedAt, ""];
    doc.body.forEach(function (paragraph) {
      lines.push(paragraph);
      lines.push("");
    });
    return lines.join("\n");
  }

  function docBlobUrl(doc) {
    if (lastDocBlobUrl) URL.revokeObjectURL(lastDocBlobUrl);
    var blob = new Blob([docMarkdown(doc)], { type: "text/markdown" });
    lastDocBlobUrl = URL.createObjectURL(blob);
    return lastDocBlobUrl;
  }

  function renderDocVisualBody(doc, chunkIndex) {
    var references = docReferences(doc.id);
    var chunks = doc.body ? DATA.kbChunks(doc.id) : [];
    return h("div", { class: "kb-doc-reader" }, [
      h("aside", { class: "kb-doc-reader-side" }, [
        h("span", { class: "kb-doc-reader-type", text: doc.type }),
        h("h3", { text: doc.title }),
        h("p", { text: doc.summary }),
        h("div", { class: "kb-doc-meta" }, [
          h("span", { text: "来源 · " + doc.source }),
          h("span", { text: "更新 · " + doc.updatedAt }),
          h("span", { text: doc.body ? "正文 " + chunks.length + " 段" : "仅摘要" }),
        ]),
        doc.body ? h("a", {
          class: "primary-action kb-doc-download",
          href: docBlobUrl(doc),
          download: doc.id + ".md",
          text: "下载 Markdown",
        }) : h("span", { class: "kb-doc-disabled-download", text: "仅摘要，暂无下载" }),
      ]),
      h("main", { class: "kb-doc-reader-main" }, [
        h("div", { class: "kb-doc-map" }, doc.body ? chunks.map(function (chunk) {
          return h("article", {
            class: "kb-doc-chunk-card" + (chunk.index === chunkIndex ? " kb-doc-chunk-target" : ""),
          }, [
            h("span", { text: "Chunk " + (chunk.index + 1) }),
            h("p", { text: chunk.text }),
          ]);
        }) : [
          h("article", { class: "kb-doc-summary-card" }, [
            h("span", { text: "摘要材料" }),
            h("p", { text: doc.summary }),
          ])
        ]),
      ]),
      h("aside", { class: "kb-doc-reader-insight" }, [
        h("strong", { text: "可视化标签" }),
        h("div", { class: "knowledge-doc-tags" }, docTags(doc).map(function (tag) {
          return h("span", { text: tag });
        })),
        h("strong", { text: "Agent 命中" }),
        h("div", { class: "kb-doc-question-list" }, references.length ? references.map(function (preset) {
          return h("span", { text: preset.question });
        }) : [h("span", { text: "当前材料未绑定预设问答" })]),
      ]),
    ]);
  }

  function renderDocOverlay() {
    var docId = state.pick.knowledge.docId;
    var open = docId !== null;
    var doc = open ? DATA.kbDocument(docId) : null;
    return Overlay.render({
      open: open,
      title: open ? doc.title : "文档阅读器",
      kicker: open ? "可视化文档 · " + doc.type : "知识库文档",
      body: open ? renderDocVisualBody(doc, state.pick.knowledge.chunkIndex) : [h("p", { class: "muted", text: "未选择文档" })],
      actions: [],
      onCloseAction: "close-doc",
      wide: true,
      panelClass: "kb-doc-overlay",
    });
  }

  function renderIngestDialogBody() {
    var doc = DATA.kbDocument(INGEST_DEMO_DOC_ID);
    var plan = DATA.kbIngestPlan(INGEST_DEMO_DOC_ID);
    if (!state.pick.knowledge.ingestOpen || state.pick.knowledge.ingestStep === 0) {
      return h("div", { class: "kb-ingest-dialog kb-ingest-dialog-idle" }, [
        h("aside", { class: "kb-ingest-file" }, [
          h("span", { text: "模拟上传文件" }),
          h("strong", { text: doc.title }),
          h("small", { text: doc.type + " · " + ingestCaptionText(plan) }),
        ]),
        h("section", { class: "kb-ingest-idle" }, [
          h("strong", { text: "等待上传触发" }),
          h("p", { text: "点击页面上的上传文档按钮后，这里会播放上传、切分、向量化和检索命中动画。" }),
        ]),
        h("aside", { class: "kb-ingest-result" }, [
          h("strong", { text: "未开始" }),
          h("span", { text: "Chunk 0 / " + plan.totalChunks }),
          h("span", { text: "暂无写入任务" }),
        ]),
      ]);
    }
    var finished = state.pick.knowledge.ingestStep === DATA.kbIngestionSteps().length;
    return h("div", { class: "kb-ingest-dialog" }, [
      h("aside", { class: "kb-ingest-file" }, [
        h("span", { text: "模拟上传文件" }),
        h("strong", { text: doc.title }),
        h("small", { text: doc.type + " · " + ingestCaptionText(plan) }),
      ]),
      h("section", { class: "kb-rag-stage started" }, [
        renderRoadmap(),
        renderIngestAnimation(doc, plan),
      ]),
      h("aside", { class: "kb-ingest-result " + (finished ? "done" : "running") }, [
        h("strong", { text: finished ? "入库完成" : "处理中" }),
        h("span", { text: "Chunk " + plan.displayChunks + " / " + plan.totalChunks }),
        h("span", { text: "命中问答 · " + ingestDemoPreset().question }),
        h("span", { text: finished ? "可被 Agent 问答命中" : "正在写入检索索引" }),
      ]),
    ]);
  }

  function renderIngestOverlay() {
    var open = state.pick.knowledge.ingestOpen;
    var finished = state.pick.knowledge.ingestStep === DATA.kbIngestionSteps().length;
    return Overlay.render({
      open: open,
      title: "文档入库演示",
      kicker: "上传文档 → RAG 处理 → 检索命中",
      body: [renderIngestDialogBody()],
      actions: finished ? [{ action: "close-ingest", text: "关闭", primary: true }] : [],
      onCloseAction: "close-ingest",
      closeDisabled: !finished,
      wide: true,
      panelClass: "kb-ingest-overlay",
    });
  }

  function renderKnowledgeLibraryContent() {
    var ingestFinished = state.pick.knowledge.ingestStep === DATA.kbIngestionSteps().length;
    var ingestRunning = state.pick.knowledge.ingestStep > 0 && !ingestFinished;
    return [
      h("div", { class: "knowledge-scene" }, [
        renderMetrics(),
        h("div", { class: "knowledge-layout" }, [
          h("section", { class: "panel knowledge-library-panel" }, [
            AppState.panelTitle("知识库索引", "分类 → 文档"),
            renderCategoryList(),
            renderDocList(),
          ]),
          renderDocumentStudio(),
          renderActionRail(),
        ]),
      ]),
      renderDocOverlay(),
      renderIngestOverlay(),
    ];
  }

  function renderKnowledge() {
    var ingestFinished = state.pick.knowledge.ingestStep === DATA.kbIngestionSteps().length;
    var ingestRunning = state.pick.knowledge.ingestStep > 0 && !ingestFinished;
    return AppState.pageShell(
      "泵知识库 / 规范案例",
      "输油泵诊断知识库",
      h("div", { class: "knowledge-head-actions" }, [
        h("div", { class: "graph-module-switch", role: "group", "aria-label": "知识模块切换" }, [
          h("button", { type: "button", class: "plain-button", dataset: { action: "go-graph" }, text: "查看知识图" }),
          h("button", { type: "button", class: "primary-action", disabled: "disabled", text: "查看知识库" }),
        ]),
        h("button", {
          type: "button",
          class: "primary-action",
          dataset: { action: "start-ingest" },
          disabled: ingestRunning ? "disabled" : null,
          text: ingestRunning ? "入库演示中" : "上传文档",
        })
      ]),
      renderKnowledgeLibraryContent()
    );
  }

  window.Scenes = window.Scenes || {};
  window.Scenes.renderKnowledge = renderKnowledge;
  window.Scenes.renderKnowledgeLibraryContent = renderKnowledgeLibraryContent;
  window.Scenes.renderKnowledgeCharts = function () {};
  window.Scenes.knowledgeIngestCaptionText = ingestCaptionText;
})();
