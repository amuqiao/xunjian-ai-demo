// window.EvidenceView —— 证据台的六种证据形态。
//
// 【为什么抽成一个组件】同一份证据要在两处渲染：工作台右栏的常驻证据台，以及点「放大」
// 之后的浮层。两处只差尺寸和一个 chartId，内容完全一样 —— 各写一份必然分叉（旧目录
// 的时序详情子屏和工作台时序卡就是各写一份，切时间范围时一个动一个不动，同一个测点
// 两处数字对不上，那是会被现场当场看出来的穿帮）。
//
// 六种形态对应 domain/04-records.js 里 evidence[].kind：
//   series   数值型 + 有标准    → 时序曲线（两条阈值线 + 越线阴影）
//   compare  同点位前后变化      → 真实的同机位两帧并排
//   timeline 开关量故障 + 处置   → 事件时间线
//   gaps     记录缺项           → 表单缺项清单
//   vision   目视 / 门禁 / 分区  → 关键帧 + bbox + 识别项
//   rule     判定口径           → 规则卡
//   case     历史同类           → 跳知识库（locked 时说明为什么锁）
//
// 本文件只建 DOM，不绑事件 —— 交互点带 data-action，由 boot.js 事件委托处理。
window.EvidenceView = (function () {
  "use strict";

  function need(name) {
    if (!window[name]) throw new Error("[EvidenceView] 需要先加载 " + name);
    return window[name];
  }

  // ---------------------------------------------------------------- 公共小件

  function head(title, sub, actions) {
    return h("div", { class: "ev-head" }, [
      h("span", { class: "card-title", text: title }),
      sub ? h("span", { class: "card-sub", text: sub }) : null,
      actions && actions.length ? h("div", { class: "ev-actions" }, actions) : null
    ]);
  }

  function zoomBtn() {
    return h("button", {
      type: "button", class: "tool-btn",
      dataset: { action: "open-zoom" },
      title: "在浮层里细看这条证据"
    }, "放大");
  }

  // 一张带 bbox 的图。bbox 是相对**图片本身**的 0~1 比例，所以 .ev-fig 必须紧贴图片盒
  // （见 styles/04-scenes.css 的说明）—— 这里靠 CSS 保证，JS 只负责把百分比写上去。
  function figure(frame, opts) {
    var VISION = need("DOMAIN_VISION");
    var showBoxes = !(opts && opts.noBoxes);
    var boxes = showBoxes ? frame.boxes : [];
    return h("div", { class: "ev-figwrap" }, [
      h("figure", { class: "ev-fig" }, [
        h("img", { src: VISION.sourceOf(frame.src), alt: frame.label }),
        boxes.map(function (box) {
          return h("div", {
            class: "ev-box " + box.tone,
            style: "left:" + (box.bbox.x * 100) + "%;top:" + (box.bbox.y * 100) + "%;" +
              "width:" + (box.bbox.w * 100) + "%;height:" + (box.bbox.h * 100) + "%",
            title: box.note
          }, [
            h("span", { class: "ev-box-tag", text: box.label })
          ]);
        })
      ])
    ]);
  }

  function boxList(frame) {
    return h("div", { class: "ev-boxlist" }, frame.boxes.map(function (box) {
      return h("span", { class: "ev-boxlist-item " + box.tone, title: box.note }, [
        h("i", {}),
        h("span", { text: box.label }),
        h("b", { text: box.confidence + "%" })
      ]);
    }));
  }

  // ---------------------------------------------------------------- 六种形态

  function renderSeries(ev, opts) {
    var STATION = need("DOMAIN_STATION");
    var SERIES = need("DOMAIN_SERIES");
    var AppState = need("AppState");
    var point = STATION.pointById(ev.pointId);
    var state = AppState.value;
    var chartId = opts.chartId;

    // 区间切换按钮。它们进 head 的 actions 区，**不能**作为 .ev 的第三个子元素 ——
    // .ev 的 grid-template-rows 是 `auto minmax(0,1fr)`，多出来的一个子元素会把 1fr
    // 抢走，body 掉到隐式 auto 行上，图表被压成一条扁线（第一版就是这样）。
    var rangeBtns = SERIES.ranges().map(function (r) {
      return h("button", {
        type: "button",
        class: "tool-btn" + (r.key === state.range ? " active" : ""),
        dataset: { action: "set-range", rangeKey: r.key },
        "aria-pressed": r.key === state.range ? "true" : "false"
      }, r.label);
    }).concat(opts.zoom ? [] : [zoomBtn()]);

    var overWarn = point.fieldReading >= point.warnAt;
    var tone = point.fieldReading >= point.dangerAt ? "danger" : (overWarn ? "warn" : "ok");

    return h("section", { class: "ev" }, [
      head(point.label, SERIES.rangeLabel(state.range), rangeBtns),
      h("div", { class: "ev-body ev-series" }, [
        h("div", { class: "ev-chart" }, [window.Charts.slot(chartId)]),
        h("div", { class: "ev-verdict-line" }, [
          h("i", { class: "dot " + tone }),
          h("span", {}, [
            "末点 " + point.fieldReading.toFixed(1) + point.unit +
            "，已越过高报警 " + point.warnAt.toFixed(1) + point.unit +
            "、未到高高报警 " + point.dangerAt.toFixed(1) + point.unit + "。",
            h("span", { class: "muted", text: " " + point.standardText + " " + point.sampleNote })
          ])
        ])
      ])
    ]);
  }

  function renderCompare(ev, opts) {
    var VISION = need("DOMAIN_VISION");
    var a = VISION.frameById(ev.frameId);
    var b = VISION.frameById(ev.compareFrameId);
    return h("section", { class: "ev" }, [
      head("同点位前后帧比对", a.camera, opts.zoom ? null : [zoomBtn()]),
      h("div", { class: "ev-body ev-compare" }, [
        h("div", { class: "ev-compare-pair" }, [
          h("div", { class: "card auto" }, [
            h("div", { class: "card-head" }, [
              h("span", { class: "card-title", text: a.label }),
              h("span", { class: "card-sub", text: a.role === "current" ? "本次" : "对照" })
            ]),
            figure(a, { noBoxes: true })
          ]),
          h("div", { class: "card auto" }, [
            h("div", { class: "card-head" }, [
              h("span", { class: "card-title", text: b.label }),
              h("span", { class: "card-sub", text: "对照" })
            ]),
            figure(b)
          ])
        ]),
        h("div", { class: "ev-verdict-line" }, [
          h("i", { class: "dot ok" }),
          h("span", { text: ev.detail + "。两帧比对未发现部件位移、新增油迹或外观变化。" })
        ])
      ])
    ]);
  }

  function renderTimeline(ev, opts) {
    var RECORDS = need("DOMAIN_RECORDS");
    var tl = RECORDS.timelineById(ev.timelineId);
    return h("section", { class: "ev" }, [
      head(tl.label, tl.steps.length + " 个节点", opts.zoom ? null : [zoomBtn()]),
      h("div", { class: "ev-body ev-timeline" }, [
        h("div", { class: "ev-tl" }, tl.steps.map(function (step) {
          return h("div", { class: "ev-tl-step " + step.tone }, [
            h("span", { class: "ev-tl-at num", text: step.at }),
            h("span", { class: "ev-tl-ic" }),
            h("div", { class: "ev-tl-text" }, [
              h("strong", { text: step.label }),
              h("small", { text: step.detail })
            ])
          ]);
        }))
      ])
    ]);
  }

  function renderGaps(ev, opts) {
    var RECORDS = need("DOMAIN_RECORDS");
    var list = RECORDS.gapListById(ev.gapId);
    var missing = list.rows.filter(function (r) { return !r.filled; }).length;
    return h("section", { class: "ev" }, [
      head(list.label, list.total + " 项中 " + missing + " 项未记录", opts.zoom ? null : [zoomBtn()]),
      h("div", { class: "ev-body ev-gaps" }, list.rows.map(function (row) {
        return h("div", { class: "ev-gap-row" + (row.filled ? "" : " missing") }, [
          h("span", { class: "ev-gap-mark", text: row.filled ? "✓" : "!" }),
          h("div", { class: "ev-gap-text" }, [
            h("strong", { text: row.label }),
            h("small", { text: row.note })
          ])
        ]);
      }))
    ]);
  }

  function renderVision(ev, opts) {
    var VISION = need("DOMAIN_VISION");
    var frame = VISION.frameById(ev.frameId);
    return h("section", { class: "ev" }, [
      head(frame.label, frame.camera + " · 识别 " + frame.boxes.length + " 处",
        opts.zoom ? null : [zoomBtn()]),
      h("div", { class: "ev-body ev-vision" }, [
        figure(frame),
        boxList(frame)
      ])
    ]);
  }

  function renderRule(ev, opts) {
    var RECORDS = need("DOMAIN_RECORDS");
    var rule = RECORDS.ruleById(ev.ruleId);
    return h("section", { class: "ev" }, [
      head(rule.label, "判定口径", opts.zoom ? null : [zoomBtn()]),
      h("div", { class: "ev-body ev-rule" }, [
        h("ul", { class: "ev-rule-lines" }, rule.lines.map(function (line) {
          return h("li", { text: line });
        }))
      ])
    ]);
  }

  function renderCase(ev) {
    var AppState = need("AppState");
    var KB = need("DOMAIN_KB");
    var unlocked = !ev.locked || AppState.reuseUnlocked();
    var asset = KB.assetById(ev.docId);
    return h("section", { class: "ev" }, [
      head(ev.label, unlocked ? "可引用" : "归档后解锁", null),
      h("div", { class: "ev-body ev-case" }, [
        h("span", { class: "badge " + (unlocked ? "ai" : "warn"),
          text: unlocked ? "案例已可引用" : "案例依据锁定中" }),
        h("p", {
          text: unlocked
            ? "《" + asset.title + "》已进入知识库并可被检索，Agent 问答可直接引用它。"
            : "这条依据要等人工复核确认并归档之后才解锁 —— AI 只组织证据，结论由专家确认后才能作为案例复用。"
        }),
        h("button", {
          type: "button",
          class: unlocked ? "primary-btn" : "tool-btn",
          disabled: unlocked ? null : "disabled",
          dataset: { action: "go-knowledge" }
        }, unlocked ? "去知识库查看" : "尚未解锁")
      ])
    ]);
  }

  // ---------------------------------------------------------------- 分发

  var RENDERERS = {
    series: renderSeries,
    compare: renderCompare,
    timeline: renderTimeline,
    gaps: renderGaps,
    vision: renderVision,
    rule: renderRule,
    case: renderCase
  };

  // 未选依据时的空态。它不是占位 —— 首屏就是这个状态，一句话说清"接下来该点哪儿"。
  function renderEmpty() {
    return h("section", { class: "ev" }, [
      head("证据台", "点左侧依据链查看", null),
      h("div", { class: "ev-body ev-case" }, [
        h("p", { text: "AI 的每一条依据都可以点开看原始证据：时序曲线、同点位前后帧、处置过程、表单缺项、关键帧识别框、判定口径。" })
      ])
    ]);
  }

  // opts: { zoom: bool, chartId: string }
  function render(ev, opts) {
    opts = opts || {};
    if (!ev) return renderEmpty();
    var fn = RENDERERS[ev.kind];
    if (!fn) throw new Error("[EvidenceView] 未知证据形态：" + ev.kind);
    if (ev.kind === "series" && !opts.chartId) {
      throw new Error("[EvidenceView] series 形态必须传 chartId");
    }
    return fn(ev, opts);
  }

  // 本轮渲染是否需要画图（boot.js 用它决定要不要 draw）。
  function needsChart(ev) { return !!ev && ev.kind === "series"; }

  return { render: render, needsChart: needsChart, figure: figure };
})();
