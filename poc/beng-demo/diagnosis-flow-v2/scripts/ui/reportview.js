// window.ReportView —— 把 ReportModel.resolve() 的结果渲染成 A4 版式的 DOM。
//
// 与 tools/report-template.html 里那段渲染逻辑是**同一套 DOM 结构 + 同一份 CSS**
// （styles/05-report.css）。两处各写一遍渲染是有意的取舍：模板要跑在无 AppState 的
// 构建环境里、还要处理图片 onload 才能打印，而这里要读运行状态；把两者硬合成一个函数
// 会让它同时背两套环境的包袱。真正必须单一真源的是**版式（CSS）和内容（ReportModel）**，
// 那两样都只有一份 —— DOM 结构不一致会立刻在肉眼对比里露出来，所以两边的 class 名
// 逐字相同，改一处必须改另一处。
window.ReportView = (function () {
  "use strict";

  function need(name) {
    if (!window[name]) throw new Error("[ReportView] 需要先加载 " + name);
    return window[name];
  }

  function renderSection(sec) {
    if (sec.kind === "callout") {
      return h("div", { class: "rp-sec rp-callout " + sec.tone }, [
        h("h2", { text: sec.title }),
        h("p", { text: sec.body })
      ]);
    }
    var children = [h("h2", { text: sec.title })];
    if (sec.kind === "grid") {
      children.push(h("div", { class: "rp-grid" }, sec.rows.map(function (row, i) {
        // 判定标准与人工结果通常较长，让最后两行各占满一行。
        return h("div", { class: i >= sec.rows.length - 2 ? "wide" : null }, [
          h("b", { text: row[0] + "：" }),
          h("span", { text: row[1] })
        ]);
      })));
    } else if (sec.kind === "list") {
      children.push(h("ul", { class: "rp-list" }, sec.items.map(function (t) {
        return h("li", { text: t });
      })));
      if (sec.id === "SEC-SOURCE") {
        var VISION = need("DOMAIN_VISION");
        children.push(h("figure", { class: "rp-photo" }, [
          h("img", {
            src: VISION.sourceOf("FRM-SITE-LASER"),
            alt: "机械专业岗现场架设激光对中仪"
          }),
          h("figcaption", { text: "现场佐证：机械专业岗架设 EASY-LASER 测头，另一人用移动终端记录读数。" })
        ]));
      }
    } else if (sec.kind === "tags") {
      children.push(h("div", { class: "rp-tags" }, sec.tags.map(function (t) {
        return h("span", { text: t });
      })));
    } else {
      throw new Error("[ReportView] 未知段落类型：" + sec.kind);
    }
    return h("div", { class: "rp-sec" }, children);
  }

  // opts: { pages: number[] | null } —— 只渲染指定页；不传就全渲染。
  function render(model, opts) {
    var pages = model.pages;
    if (opts && opts.pages) {
      pages = pages.filter(function (p) { return opts.pages.indexOf(p.page) >= 0; });
    }
    return h("div", { class: "rp-stack" }, pages.map(function (page) {
      return h("div", { class: "rp-page", dataset: { page: String(page.page) } }, [
        h("div", { class: "rp-head" }, [
          h("div", {}, [
            h("h1", { text: model.header.title }),
            h("small", { text: model.header.subtitle })
          ]),
          h("div", { class: "rp-head-meta" }, [
            h("div", { text: "报告编号：" + model.header.caseId }),
            h("div", { text: "生成时间：" + model.header.generatedAt })
          ])
        ]),
        h("div", { class: "rp-body" }, page.sections.map(renderSection)),
        h("div", { class: "rp-foot" }, [
          h("span", { text: model.divergent ? "本报告含复核分歧说明段" : "人工结论与 AI 建议一致" }),
          h("span", { text: "第 " + page.page + " 页 / 共 " + page.total + " 页" })
        ])
      ]);
    }));
  }

  // 从当前状态拼出报告模型。复核页和归档浮窗都调它，保证两处看的是同一份。
  function modelOfState() {
    var AppState = need("AppState");
    var ReportModel = need("ReportModel");
    var state = AppState.value;
    return ReportModel.resolve(ReportModel.contextFromState({
      recordId: state.recordId,
      reviewerId: state.reviewerId,
      outcomeId: state.outcomeId,
      note: state.note,
      range: state.range,
      // 生成时间取自素材里那个下午，不用 new Date() —— 演示机跨天之后报告上的时间
      // 不该跟着变（SCADA 截图 16:30-16:37、对中仪水印 16:31 都是固定的，对不上就露）。
      // 日期部分与 scripts/core/state.js 的 REPORT_DATE 必须一致（案例编号两处都在拼）。
      generatedAt: "2026-07-22 17:05"
    }));
  }

  return { render: render, modelOfState: modelOfState };
})();
