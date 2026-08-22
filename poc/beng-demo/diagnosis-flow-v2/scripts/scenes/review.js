// 场景 ②：人工复核。回答「AI 说的对不对，人怎么接管」。
//
// 这一页是角色交接点：前一页的主语是"AI 在组织证据"，从这里开始主语变成"人在做决定"。
//
// 【只做两层介入，写进契约】旧目录 DESIGN.md 设计了四层（L0 表决 / L1 结论 chips /
// L2 结构化补充下拉+勾选 / L3 自由文本），实现里只做了 L1 + L3，L0/L2 一直空着。
// 本版明确只做两层（见 domain/05-review.js 文件头）—— 演示 demo 要讲的就是"复核人只做
// 轻量结论选择 + 一句意见"，凑四层反而把流程讲啰嗦了。
//
// 【报告草稿就地长出，不再是"点生成报告"】选定结论后右栏下半部分直接出现 A4 报告预览，
// 意见框里打的字逐字进「三、人工复核意见」那一段。归档是另一个动作（浮窗）。
// 旧版是"选结论 → 点生成报告 → 弹浮层"，中间那一步没有信息量，删掉。
window.SceneReview = (function () {
  "use strict";

  var CHART_MINI = "rv-series-mini";

  function need(name) {
    if (!window[name]) throw new Error("[SceneReview] 需要先加载 " + name);
    return window[name];
  }

  // 与 scripts/scenes/workbench.js 的 standardOf() 同一规则、同一份口径。
  // 两处都要显示"判定口径"，规则必须一致，否则工作台说 ISO、复核页说别的。
  function standardOf(record) {
    var STATION = need("DOMAIN_STATION");
    var RECORDS = need("DOMAIN_RECORDS");
    var series = record.evidence.filter(function (e) { return e.kind === "series"; })[0];
    if (series) return STATION.pointById(series.pointId).standardText;
    var rule = record.evidence.filter(function (e) { return e.kind === "rule"; })[0];
    if (rule) return RECORDS.ruleById(rule.ruleId).label;
    return "—";
  }

  // ---------------------------------------------------------------- 左栏

  function renderSummary() {
    var AppState = need("AppState");
    var record = AppState.record();
    var part = AppState.part();
    var s = record.suggestion;
    return h("section", { class: "card auto" }, [
      h("div", { class: "card-head" }, [
        h("span", { class: "card-title", text: "AI 摘要" }),
        h("span", { class: "card-sub", text: record.no + " · " + part.label })
      ]),
      h("div", { class: "wb-verdict" }, [
        h("div", { class: "wb-verdict-label", text: "AI 建议" }),
        h("div", { class: "wb-verdict-text", text: s.label.replace(/^建议结论：/, "") }),
        h("div", { class: "conf" }, [
          h("div", { class: "conf-head" }, [
            h("span", { text: "置信度" }),
            h("strong", { class: "num", text: s.confidence + "%" })
          ]),
          h("div", { class: "conf-bar" }, [h("i", { style: "width:" + s.confidence + "%" })])
        ]),
        h("div", { class: "wb-verdict-note", text: s.text })
      ]),
      h("div", { class: "kv" }, [
        h("div", { class: "kv-row" }, [h("b", { text: "检查项" }), h("span", { text: record.item })]),
        // record.standard 在泵这边不存在 —— 判定口径挂在测点上，见 workbench.js 的 standardOf()。
        h("div", { class: "kv-row" }, [h("b", { text: "判定口径" }), h("span", { text: standardOf(record) })]),
        h("div", { class: "kv-row" }, [h("b", { text: "人工结果" }), h("span", { text: record.result })])
      ])
    ]);
  }

  // 关键证据 mini：只在本条记录有数值型证据时出现。没有就不占位 ——
  // 四条记录里只有一条是数值型，硬给另外三条留一个空图框才是"太假"。
  function renderMiniEvidence() {
    var AppState = need("AppState");
    var STATION = need("DOMAIN_STATION");
    var SERIES = need("DOMAIN_SERIES");
    var record = AppState.record();
    var ev = record.evidence.filter(function (e) { return e.kind === "series"; })[0];
    if (!ev) return null;
    var point = STATION.pointById(ev.pointId);
    return h("section", { class: "card" }, [
      h("div", { class: "card-head" }, [
        h("span", { class: "card-title", text: "关键证据 · " + point.label }),
        h("span", { class: "card-sub", text: SERIES.rangeLabel(AppState.value.range) })
      ]),
      h("div", { class: "card-body" }, [window.Charts.slot(CHART_MINI)])
    ]);
  }

  // 现场佐证照：业务方给的真实现场作业照。它的作用是让复核人（和观众）
  // 看到"人当时确实在现场"，这是"人工介入"最直接的凭证。
  function renderSitePhoto() {
    var VISION = need("DOMAIN_VISION");
    // 现场作业照。泵这边用「激光对中作业」那张 —— 它是"这件事真有人去现场做了"
    // 的旁证，与依据链里那两枚仪器屏幕截图是两回事。
    var frame = VISION.frameById("FRM-SITE-LASER");
    return h("section", { class: "card rv-photo" }, [
      h("div", { class: "card-head" }, [
        h("span", { class: "card-title", text: "现场佐证" }),
        h("span", { class: "card-sub", text: frame.shotAt + " · " + frame.camera })
      ]),
      h("div", { class: "rv-photo-frame" }, [
        h("img", { src: VISION.sourceOf(frame.src), alt: frame.label })
      ])
    ]);
  }

  // ---------------------------------------------------------------- 右栏

  function renderOutcomes() {
    var AppState = need("AppState");
    var REVIEW = need("DOMAIN_REVIEW");
    var state = AppState.value;
    var record = AppState.record();

    return h("section", { class: "card auto" }, [
      h("div", { class: "card-head" }, [
        h("span", { class: "card-title", text: "人工结论" }),
        h("span", { class: "card-sub" }, [
          "复核人 ",
          // 复核人是"谁在做这个决定"，会进报告插槽，所以放在这里而不是当普通表单项。
          h("select", {
            class: "tool-btn",
            dataset: { action: "set-reviewer" },
            "aria-label": "复核人"
          }, REVIEW.reviewers.map(function (rv) {
            return h("option", {
              value: rv.id,
              selected: rv.id === state.reviewerId ? "selected" : null,
              text: rv.name + "（" + rv.role + "）"
            });
          }))
        ])
      ]),
      h("div", { class: "rv-outcomes" }, REVIEW.outcomes.map(function (o) {
        var active = o.id === state.outcomeId;
        var isAi = o.id === record.suggestion.outcomeId;
        return h("button", {
          type: "button",
          class: "chip outcome tone-" + o.tone + (active ? " active" : ""),
          dataset: { action: "select-outcome", outcomeId: o.id },
          "aria-pressed": active ? "true" : "false"
        }, [
          h("span", { class: "chip-text" }, [
            h("strong", { text: o.label + (isAi ? "（AI 建议）" : "") }),
            h("small", { text: o.hint })
          ])
        ]);
      }))
    ]);
  }

  function renderNote() {
    var AppState = need("AppState");
    var REVIEW = need("DOMAIN_REVIEW");
    var state = AppState.value;
    var divergent = AppState.divergent();

    return h("section", { class: "card auto" }, [
      h("div", { class: "card-head" }, [
        h("span", { class: "card-title", text: "复核意见" }),
        h("span", { class: "card-sub", text: divergent ? "分歧态 · 必填" : "选填，会逐字进报告" })
      ]),
      h("div", { class: "rv-note" }, [
        divergent
          ? h("div", { class: "rv-divergence" }, [
              h("i", { class: "dot warn" }),
              h("span", { text: "人工结论与 AI 建议不一致。请填写分歧理由 —— 它会作为报告里的「复核分歧说明」一段，并回流成模型反馈样本。" })
            ])
          : null,
        h("textarea", {
          dataset: { action: "set-note", focusKey: "review-note" },
          placeholder: "写一句复核说明（可点下方常用语快速插入）",
          "aria-label": "复核意见"
        }, state.note),
        h("div", { class: "rv-phrases" }, REVIEW.phrases.map(function (p) {
          return h("button", {
            type: "button", class: "chip phrase",
            dataset: { action: "append-phrase", phrase: p }
          }, p);
        })),
        h("div", { class: "rv-actions" }, [
          h("span", { class: "rv-hint", text: AppState.value.archived
            ? "已归档，报告已进入知识库"
            : (state.outcomeId
                ? (divergent && !state.note.trim() ? "填写分歧理由后可归档" : "可以归档了")
                : "先选一个人工结论") }),
          h("span", { class: "spacer" }),
          h("button", {
            type: "button", class: "primary-btn",
            disabled: (!AppState.canArchive() || state.archived) ? "disabled" : null,
            dataset: { action: "open-archive" }
          }, state.archived ? "已归档" : "归档报告")
        ])
      ])
    ]);
  }

  // 报告草稿：选定结论后就地长出。未选前是一句提示，不是空框。
  function renderDraft() {
    var AppState = need("AppState");
    var ReportView = need("ReportView");
    var state = AppState.value;

    if (!state.outcomeId) {
      return h("section", { class: "card rv-draft" }, [
        h("div", { class: "card-head" }, [
          h("span", { class: "card-title", text: "报告草稿" }),
          h("span", { class: "card-sub", text: "选定结论后生成" })
        ]),
        h("div", { class: "rv-draft-empty", text: "选择人工结论后，报告草稿会在这里逐段生成，你写的复核意见会出现在正文里。" })
      ]);
    }

    var model = ReportView.modelOfState();
    return h("section", { class: "card rv-draft" }, [
      h("div", { class: "card-head" }, [
        h("span", { class: "card-title", text: "报告草稿" }),
        h("span", { class: "card-sub", text: model.header.caseId + " · " + model.pages.length + " 页" +
          (model.divergent ? " · 含分歧说明" : "") })
      ]),
      h("div", { class: "card-body scroll", dataset: { scrollKey: "rv-draft" } }, [ReportView.render(model, null)])
    ]);
  }

  // ---------------------------------------------------------------- 场景与浮层

  function render() {
    return h("div", { class: "rv-scene" }, [
      h("div", { class: "wb-col rv-left" }, [
        renderSummary(),
        renderMiniEvidence(),
        renderSitePhoto()
      ]),
      h("div", { class: "wb-col rv-right" }, [
        renderOutcomes(),
        renderNote(),
        renderDraft()
      ])
    ]);
  }

  // 归档浮窗：左 A4 报告预览（与草稿区同一份 model），右 归档去向 + 下载真 PDF。
  function overlays() {
    var AppState = need("AppState");
    var ReportView = need("ReportView");
    var Overlay = need("Overlay");
    var REPORT = need("DOMAIN_REPORT");
    var KB = need("DOMAIN_KB");
    var state = AppState.value;
    if (!state.archiveOpen) return null;

    var model = ReportView.modelOfState();
    // 两份预构建 PDF，按当前是否分歧取。屏上预览是同一个 model 渲染的，所以
    // "屏上所见"和"下载所得"一致（见 domain/06-report.js 文件头）。
    var pdfPath = model.divergent ? REPORT.meta.pdfPaths.divergent : REPORT.meta.pdfPaths.accepted;
    var caseAsset = KB.assetById("DOC-CASE");

    return Overlay.render({
      key: "archive",
      title: "归档报告",
      sub: model.header.caseId + " · " + (model.divergent ? "含复核分歧说明" : "人工结论与 AI 一致"),
      closeAction: "close-archive",
      bodyClass: "ar-layout",
      body: [
        h("div", { class: "ar-preview" }, [ReportView.render(model, null)]),
        h("div", { class: "ar-side" }, [
          h("section", { class: "card auto" }, [
            h("div", { class: "card-head" }, [h("span", { class: "card-title", text: "归档去向" })]),
            h("div", { class: "kv" }, [
              h("div", { class: "kv-row" }, [h("b", { text: "目标分类" }), h("span", { text: "归档案例" })]),
              h("div", { class: "kv-row" }, [h("b", { text: "案例编号" }), h("span", { class: "num", text: model.header.caseId })]),
              h("div", { class: "kv-row" }, [h("b", { text: "文档标题" }), h("span", { text: caseAsset.title })]),
              h("div", { class: "kv-row" }, [h("b", { text: "复核人" }), h("span", { text: AppState.reviewer().name + "（" + AppState.reviewer().role + "）" })])
            ])
          ]),
          // 【处置去向】assets/诊断工作台/泵课题Q&A.docx 故事线第四步是「自动生成 IMS 工单 +
          // 推送备件信息 + 移动端作业卡」。归档这一刻本来就该同时交代两条路：
          // 报告进知识库（上面那块），处置进工单系统（这块）。
          //
          // ⚠️ 全部是文字说明。三条硬约束：不显示「已推送/已生成」这类完成态、
          //    不给可点的按钮、每一行都标出当前是「待人工」还是「未接入」。
          //    做一个假的"已推送"，是这类演示最容易被当场问穿的地方。
          h("section", { class: "card auto ar-dispatch" }, [
            h("div", { class: "card-head" }, [
              h("span", { class: "card-title", text: "处置去向" }),
              h("span", { class: "card-sub", text: "集成点 · 本演示未接入" })
            ]),
            h("div", { class: "ar-dispatch-list" }, [
              ["IMS 工单", "待人工开单", "按分级方案的四个时间档拆成子任务；停机拆检需分控中心批准"],
              ["备件清单", "待人工核对", "台账中本机组轴承型号与中心库库存需人工核对后再开单"],
              ["移动端作业卡", "未接入", "接通后可推送到现场终端，当前需线下交底"],
              ["下轮复查", "待排期", "无论是否拆检，本条都应纳入下一轮复查并留痕"]
            ].map(function (row) {
              return h("div", { class: "ar-dispatch-row" }, [
                h("div", { class: "ar-dispatch-head" }, [
                  h("strong", { text: row[0] }),
                  h("span", { class: "badge warn", text: row[1] })
                ]),
                h("small", { text: row[2] })
              ]);
            }))
          ]),
          h("section", { class: "card auto" }, [
            h("div", { class: "card-head" }, [h("span", { class: "card-title", text: "完整报告" })]),
            h("div", { class: "rv-note" }, [
              h("p", { class: "muted", style: "font-size:13.5px;line-height:1.75",
                text: "屏上预览与下载的 PDF 来自同一份模板和同一份数据。改判之后报告会多一段「复核分歧说明」，下载的 PDF 也跟着换。" }),
              // 用 <a download> 而不是按钮：file:// 下浏览器原生就能下载/在新标签打开 PDF，
              // 不需要 JS。target=_blank 让它在新标签用系统 PDF 阅读器打开。
              h("a", {
                class: "tool-btn", href: pdfPath, target: "_blank", rel: "noopener",
                style: "display:inline-flex;align-items:center;text-decoration:none"
              }, "在新标签打开 / 下载 PDF")
            ])
          ]),
          h("div", { class: "rv-actions" }, [
            h("span", { class: "rv-hint", text: state.archived ? "已归档" : "确认后进入知识库并可被 Agent 引用" }),
            h("span", { class: "spacer" }),
            h("button", {
              type: "button", class: "primary-btn",
              disabled: state.archived ? "disabled" : null,
              dataset: { action: "confirm-archive" }
            }, state.archived ? "已归档" : "确认归档")
          ])
        ])
      ]
    });
  }

  function drawCharts() {
    var AppState = need("AppState");
    var record = AppState.record();
    var ev = record.evidence.filter(function (e) { return e.kind === "series"; })[0];
    if (!ev) return;
    window.Charts.draw(CHART_MINI,
      window.ChartOptions.vibrationTrend(ev.pointId, AppState.value.range, { mini: true }));
  }

  return { render: render, overlays: overlays, drawCharts: drawCharts };
})();
