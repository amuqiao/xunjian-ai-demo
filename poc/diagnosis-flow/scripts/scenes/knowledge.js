// 场景：知识库。要回答的问题是"资料怎么进来、怎么被检索到"。
//
// 职责收窄为三件事：文档索引、上传入库动画、Agent 问答。**不画任何关系图或节点
// 连线**——文档之间的关系可视化由独立的知识文档地图 POC 承担，与本 POC 无关。
//
// 归档产物由 core/report.js 的 archivedDocument() 提供，在这里拼进列表最前面并带
// NEW 标。它不写回领域数据（契约是只读的），演示重置后自然消失，不留残渣。
(function () {
  "use strict";

  var AppState = window.AppState;
  var KB = window.DOMAIN_KB;
  var ReportModel = window.ReportModel;
  var Overlay = window.Overlay;
  var Cards = window.Cards;

  var lastDocBlobUrl = null;

  // ---------------------------------------------------------------- 文档集合

  // 归档报告插在目标分类的最前面。这是把"报告归档"和"知识库"缝上的那一针——
  // 不这么做，两页各说各的，观众感觉不到闭环。
  function documentsOf(categoryId) {
    var list = KB.documents(categoryId).slice();
    var archived = ReportModel.archivedDocument();
    if (archived && archived.categoryId === categoryId) list.unshift(archived);
    return list;
  }

  function allDocuments() {
    var list = KB.documents().slice();
    var archived = ReportModel.archivedDocument();
    if (archived) list.unshift(archived);
    return list;
  }

  function documentById(docId) {
    var archived = ReportModel.archivedDocument();
    if (archived && archived.id === docId) return archived;
    return KB.document(docId);
  }

  function chunksOf(doc) {
    if (!doc.body) return [];
    if (doc.id === "DOC-ARCHIVED") {
      return doc.body.map(function (text, index) { return { index: index, text: text }; });
    }
    return KB.chunksOf(doc.id);
  }

  function activeCategoryId() {
    return AppState.value.pick.knowledge.categoryId || KB.categories()[0].id;
  }

  // ---------------------------------------------------------------- 顶部指标

  function renderMetrics() {
    var state = AppState.value;
    var docs = allDocuments();
    var withBody = docs.filter(function (doc) { return !!doc.body; }).length;
    var steps = KB.ingestion().length;
    var defs = [
      { label: "知识分类", value: KB.categories().length, unit: "类", note: "制度 / 口径 / 模板 / 案例" },
      { label: "文档资产", value: docs.length, unit: "篇", note: state.archived ? "含本轮归档的 1 篇" : "尚未归档本轮报告" },
      { label: "可视化正文", value: withBody, unit: "篇", note: "支持 Chunk 视图与 Markdown 下载" },
      {
        label: "入库状态",
        value: state.pick.knowledge.ingestStep === steps ? "完成" : "待演示",
        unit: "",
        note: state.pick.knowledge.ingestStep === steps ? "最近一次入库演示已完成" : "点右上角上传文档开始"
      }
    ];
    return h("div", { class: "kb-metrics" }, defs.map(function (def) {
      return Cards.metric({
        label: def.label, value: def.value, unit: def.unit, status: "ok", note: def.note
      });
    }));
  }

  // ---------------------------------------------------------------- 分类 / 文档

  function renderCategoryList() {
    var list = window.SelectList.render({
      name: "kb-category",
      variant: "row",
      activeId: activeCategoryId(),
      ariaLabel: "知识库分类",
      items: KB.categories().map(function (category) {
        return {
          id: category.id,
          label: category.title,
          status: "ok",
          note: category.desc,
          badge: String(documentsOf(category.id).length) + " 篇"
        };
      })
    });
    list.className += " kb-category-list";
    return list;
  }

  function renderDocList() {
    return h("div", { class: "kb-doc-list", role: "list", "aria-label": "文档列表" },
      documentsOf(activeCategoryId()).map(function (doc) {
        return h("button", {
          type: "button",
          class: "kb-doc" + (doc.isNew ? " fresh" : ""),
          dataset: { action: "open-doc", docId: doc.id, focusKey: "doc:" + doc.id }
        }, [
          h("div", { class: "kb-doc-head" }, [
            h("strong", { text: doc.title }),
            doc.isNew ? h("span", { class: "kb-doc-new", text: "NEW" }) : null
          ]),
          h("p", { text: doc.summary }),
          h("div", { class: "kb-doc-foot" }, [
            h("small", { text: doc.type + " · " + doc.updatedAt }),
            h("span", { class: "kb-doc-badge" + (doc.body ? " full" : " brief"), text: doc.body ? "阅读 / 下载" : "仅摘要" })
          ])
        ]);
      }));
  }

  // ---------------------------------------------------------------- 操作台

  function renderActionRail() {
    var state = AppState.value;
    var steps = KB.ingestion().length;
    var finished = state.pick.knowledge.ingestStep === steps;
    var running = state.pick.knowledge.ingestStep > 0 && !finished;
    var demoDoc = KB.document(KB.ingestDemoDocId());
    var context = window.DOMAIN_AGENTQA.contexts.filter(function (c) { return c.id === "knowledge"; })[0];

    return h("section", { class: "panel kb-actions" }, [
      AppState.panelTitle("演示操作", "上传 / 问答"),
      h("div", { class: "kb-upload" }, [
        h("strong", { text: "文档入库演示" }),
        h("p", { text: "点击上传固定样例文档，在弹窗里播放上传、切分、向量化和检索命中。" }),
        h("div", { class: "kb-upload-file" }, [
          h("span", { text: demoDoc.type }),
          h("strong", { text: demoDoc.title })
        ]),
        h("button", {
          type: "button",
          class: "primary-action",
          disabled: running ? "disabled" : null,
          dataset: { action: "start-ingest", focusKey: "ingest" },
          text: running ? "入库演示中…" : finished ? "重新演示" : "上传文档"
        })
      ]),
      h("div", { class: "kb-agent" }, [
        h("strong", { text: context.entryTitle }),
        h("p", { text: context.entryText }),
        h("div", { class: "kb-agent-tags" }, context.questions.slice(0, 3).map(function (question) {
          return h("span", { text: question.label });
        })),
        h("button", {
          type: "button",
          class: "plain-button",
          dataset: { action: "open-agent", agentContext: "knowledge", focusKey: "open-agent" },
          text: "打开 Agent 问答"
        })
      ])
    ]);
  }

  // ---------------------------------------------------------------- 文档阅读器

  function docMarkdown(doc) {
    var lines = ["# " + doc.title, "", "- 分类：" + doc.type, "- 来源：" + doc.source, "- 更新：" + doc.updatedAt, ""];
    doc.body.forEach(function (paragraph) {
      lines.push(paragraph);
      lines.push("");
    });
    return lines.join("\n");
  }

  // 每次生成新的 blob 前先撤销上一个，否则每打开一次文档就泄漏一个 object URL。
  function docBlobUrl(doc) {
    if (lastDocBlobUrl) URL.revokeObjectURL(lastDocBlobUrl);
    lastDocBlobUrl = URL.createObjectURL(new Blob([docMarkdown(doc)], { type: "text/markdown" }));
    return lastDocBlobUrl;
  }

  function renderDocReader(doc, chunkIndex) {
    var chunks = chunksOf(doc);
    return h("div", { class: "kb-reader" }, [
      h("aside", { class: "kb-reader-side" }, [
        h("span", { class: "kb-reader-type", text: doc.type }),
        h("h4", { text: doc.title }),
        h("p", { text: doc.summary }),
        h("div", { class: "kb-reader-meta" }, [
          h("span", { text: "来源 · " + doc.source }),
          h("span", { text: "更新 · " + doc.updatedAt }),
          h("span", { text: doc.body ? "正文 " + chunks.length + " 段" : "仅摘要" })
        ]),
        doc.body
          ? h("a", {
            class: "primary-action kb-download",
            href: docBlobUrl(doc),
            download: doc.id + ".md",
            text: "下载 Markdown"
          })
          : h("span", { class: "muted", text: "仅摘要，暂无下载" })
      ]),
      h("main", { class: "kb-reader-main" }, doc.body
        ? chunks.map(function (chunk) {
          return h("article", {
            // 命中跳转会带一个 chunkIndex：定位到具体那一段并高亮，这样"引用不是贴
            // 标签，是真指到某一段"才立得住。
            class: "kb-chunk" + (chunk.index === chunkIndex ? " target" : "")
          }, [
            h("span", { class: "kb-chunk-index", text: "Chunk " + (chunk.index + 1) }),
            h("p", { text: chunk.text })
          ]);
        })
        : [h("article", { class: "kb-chunk" }, [
          h("span", { class: "kb-chunk-index", text: "摘要材料" }),
          h("p", { text: doc.summary })
        ])])
    ]);
  }

  function renderDocOverlay() {
    var docId = AppState.value.pick.knowledge.docId;
    // 浮层的开合不额外存布尔量，直接由 docId 是否为空派生——少一个需要同步的字段，
    // 就少一处可能不一致的地方。
    if (docId === null) return null;
    var doc = documentById(docId);
    return Overlay.render({
      open: true,
      title: doc.title,
      kicker: "文档阅读器 · " + doc.type,
      body: [renderDocReader(doc, AppState.value.pick.knowledge.chunkIndex)],
      actions: [],
      onCloseAction: "close-doc",
      key: "kb-doc",
      wide: true,
      panelClass: "kb-doc-overlay"
    });
  }

  // ---------------------------------------------------------------- 入库动画

  // 入库动画的静态骨架：节点**只创建一次**。六步推进不重建任何节点，只由
  // refreshIngest() 改类名和文本。
  //
  // 这一点是这个浮层的设计要害：chunk 卡的落下动画和浮层的淡入动画都是"元素一出现
  // 就播一次"，只要节点被重建，动画就从头重播——每 700ms 重建一次就是每 700ms 闪
  // 一次。所以结构与状态必须彻底分开：结构在这里一次画完，状态在下面逐帧改。
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

      // 总进度条：宽度由**步数**算出来，不用 CSS 关键帧。
      //
      // 原来这里是"上传"这一步自己的进度条，用一次性关键帧 0→100% 跑 0.7 秒——第一步
      // 就拉满，剩下五步（约 3.5 秒）它一动不动，看起来像整个流程瞬间完成了。
      // 现在改成 step / 总步数，由 refreshIngest() 每步推一次，配 CSS transition 平滑
      // 过渡：六步就是六段，进度和路线图同步走。
      h("div", { class: "kb-progress", dataset: { ingestPart: "progress" } }, [
        h("span", { class: "kb-progress-name", text: "《" + model.doc.title + "》" }),
        h("div", { class: "kb-progress-track" }, [
          h("i", { dataset: { ingestPart: "progressBar" }, style: "width:0%" })
        ]),
        h("span", { class: "kb-progress-text", dataset: { ingestPart: "progressText" }, text: "" })
      ]),

      h("div", { class: "kb-chunk-field", dataset: { ingestPart: "chunks" } }, model.chunks.map(function (chunk) {
        // 未命中段的相似度是一个明显更低的固定值：这里不需要真的算向量，但两档分数
        // 必须拉开，否则"命中"这件事在视觉上说不清楚。
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
    var finished = state.pick.knowledge.ingestStep === KB.ingestion().length;
    return Overlay.render({
      open: true,
      title: "文档入库演示",
      kicker: "上传 → 解析 → 切分 → 向量化 → 入库 → 可检索",
      body: [renderIngestBody()],
      // 关闭按钮**恒存在**，只切换 disabled。做成"完成后才出现"的话，按钮的出现
      // 需要重建 footer，而重建 footer 就要重建整个浮层。
      actions: [{ action: "close-ingest", text: "关闭", primary: true, disabled: !finished }],
      onCloseAction: "close-ingest",
      // 动画没跑完不许关：关掉就看不到最关键的"检索命中"那一步了。
      closeDisabled: !finished,
      key: "kb-ingest",
      wide: true,
      panelClass: "kb-ingest-overlay"
    });
  }

  // 逐帧更新：只改类名和文本，不创建也不删除任何节点。
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

    // 进度条按步推进：六步就是六段，和上面的路线图同步。宽度是算出来的状态，不是
    // 一次性动画——这样任何时刻重新进入（或被定点刷新调用多次）结果都一致。
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

    // 关闭闸门：动画跑完才允许关。两处按钮同时解禁。
    var closeButton = document.querySelector(".kb-ingest-overlay .overlay-close");
    if (closeButton) closeButton.disabled = !finished;
    var footButton = document.querySelector('.kb-ingest-overlay [data-action="close-ingest"]');
    if (footButton) footButton.disabled = !finished;
  }

  // ---------------------------------------------------------------- 顶层

  function renderKnowledge() {
    var state = AppState.value;
    var steps = KB.ingestion().length;
    var running = state.pick.knowledge.ingestStep > 0 && state.pick.knowledge.ingestStep < steps;

    return AppState.pageShell(
      "知识库 / 资料检索",
      "诊断知识库",
      h("button", {
        type: "button",
        class: "primary-action",
        disabled: running ? "disabled" : null,
        dataset: { action: "start-ingest" },
        text: running ? "入库演示中…" : "上传文档"
      }),
      h("div", { class: "kb-scene" }, [
        renderMetrics(),
        h("div", { class: "kb-layout" }, [
          h("section", { class: "panel kb-index" }, [
            AppState.panelTitle("知识库索引", "分类 → 文档"),
            renderCategoryList(),
            renderDocList()
          ]),
          renderActionRail()
        ])
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
