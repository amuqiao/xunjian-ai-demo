// window.EvidenceView —— 证据台的六种证据形态。
//
// 【为什么抽成一个组件】同一份证据要在两处渲染：工作台右栏的常驻证据台，以及点「放大」
// 之后的浮层。两处只差尺寸和一个 chartId，内容完全一样 —— 各写一份必然分叉（旧目录
// 的时序详情子屏和工作台时序卡就是各写一份，切时间范围时一个动一个不动，同一个测点
// 两处数字对不上，那是会被现场当场看出来的穿帮）。
//
// 六种形态对应 domain/04-records.js 里 evidence[].kind：
//   series     数值型 + 有分级口径  → 时序曲线（ISO 四档色带 + 档界线）
//   vision     关键帧 / 仪器屏幕     → 图 + bbox 识别框 + 识别项清单
//   alignment  对中前后两组读数      → 对照表 + 一行排除结论
//   case       历史案例检索          → Top-N 表 + 置信度加权明细
//   plan       分级处置建议          → 四个时间档 + 时间窗依据
//   rule       判定口径              → 规则卡
//
// 参照物（poc/inspection-demo/diagnosis-flow-v2）还有 compare / timeline / gaps 三种，
// 泵这边一个都没用上：compare 要「同机位前后两帧」，而本轮的前后对比是**仪器读数**
// （由 alignment 承担）；timeline 要开关量故障的处置过程，本轮是连续量；gaps 要表单缺项，
// 本轮的缺项是台账阈值（由 rule 承担）。删掉而不是留着空跑 —— 留着就是死代码。
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

    // 结论行说的是 ISO 档位而不是"越过高报警"——本机组的站控报警值台账里没填，
    // 说"越过高报警"就是在指一个不存在的数。stats 里的三个量（峰值、越 D 档比例、
    // 相对基线的上升幅度）都由 domain 算好，这里不现算。
    var stats = SERIES.stats(ev.pointId);
    var grade = window.ChartOptions.gradeOf(point.fieldReading);
    var tone = grade.tone;

    return h("section", { class: "ev" }, [
      head(point.label, point.tag + " · " + SERIES.rangeLabel(state.range), rangeBtns),
      h("div", { class: "ev-body ev-series" }, [
        h("div", { class: "ev-chart" }, [window.Charts.slot(chartId)]),
        h("div", { class: "ev-verdict-line" }, [
          h("i", { class: "dot " + tone }),
          h("span", {}, [
            "末点 " + point.fieldReading.toFixed(1) + point.unit + " 落在 ISO " +
            grade.grade + " 档（" + grade.label + "），峰值 " + stats.max.toFixed(1) +
            "，全程 " + stats.total + " 点中 " + stats.overDangerCount +
            " 点在 D 档以上；相对基线 " + stats.baseline.toFixed(1) + " 上升 " +
            stats.risePercent + "%。",
            h("span", { class: "muted", text: " " + point.standardText + " " + point.sampleNote })
          ])
        ])
      ])
    ]);
  }




  // ---------------------------------------------------------------- alignment
  //
  // 对中前后实测。它是**两组离散读数**，不是曲线也不是两张照片 —— 参照物那个
  // renderCompare 比的是同机位前后两帧图像，这里比的是仪器面板上的四个数。
  // 所以做成一张对照表 + 一行结论，而不是并排两张图（图在依据链里另有两枚 vision 芯片）。
  //
  // ★ 结论那一行是整屏最硬的一句话：对中已合格而振动未降 —— 这是「排除」，
  //   不是参照物里那种「未发现变化」的弱陈述。
  function renderAlignment(ev, opts) {
    var RECORDS = need("DOMAIN_RECORDS");
    var al = RECORDS.alignmentById(ev.alignmentId);
    return h("section", { class: "ev" }, [
      head(al.label, al.instrument, opts.zoom ? null : [zoomBtn()]),
      h("div", { class: "ev-body ev-align" }, [
        h("div", { class: "ev-align-table" }, [
          h("div", { class: "ev-align-head" }, [
            h("span", { text: "项目" }), h("span", { text: "调整前" }),
            h("span", { text: "调整后" }), h("span", { text: "判定" })
          ])
        ].concat(al.rows.map(function (row) {
          return h("div", { class: "ev-align-row" }, [
            h("span", { text: row.label }),
            h("strong", { class: "num warn", text: row.before }),
            h("strong", { class: "num ok", text: row.after }),
            h("span", { class: "badge " + (row.ok ? "ok" : "warn"), text: row.ok ? "合格" : "超差" })
          ]);
        }))),
        h("div", { class: "ev-verdict-line" }, [
          h("i", { class: "dot danger" }),
          h("span", { text: al.conclusion })
        ]),
        // 视觉能力边界写在这里而不是藏进 rule 芯片：这条依据的价值恰恰在于
        // 「为什么不能靠视觉」，不写出来读者会以为我们本来就有视觉结论。
        h("p", { class: "muted ev-align-note", text: al.visionLimit })
      ])
    ]);
  }

  // ---------------------------------------------------------------- caseHits
  //
  // 历史案例检索 Top-N。参照物的 renderCase 是"一篇归档案例解锁没解锁"，
  // 这里是"检索命中了 N 条，每条的确诊是什么" —— 两件事，所以两个渲染器都保留。
  //
  // ★ 表里 verdict 列必须原样显示，包括那两条确诊与主诊断无关的（探头故障 / 工艺水击）。
  //   把它们藏起来或改写成"疑似轴承"，这张表就没有价值了。
  function renderCaseHits(ev, opts) {
    var RECORDS = need("DOMAIN_RECORDS");
    var hit = RECORDS.caseHitById(ev.caseHitId);
    var mech = hit.rows.filter(function (r) { return r.tone === "danger" || r.tone === "warn"; });
    return h("section", { class: "ev" }, [
      head(hit.label, hit.note, opts.zoom ? null : [zoomBtn()]),
      h("div", { class: "ev-body ev-cases" }, [
        h("div", { class: "ev-case-table" }, [
          h("div", { class: "ev-case-head" }, hit.columns.map(function (c) {
            return h("span", { text: c });
          }))
        ].concat(hit.rows.map(function (row) {
          return h("div", { class: "ev-case-row" }, [
            h("span", { class: "num", text: "#" + row.rank }),
            h("div", { class: "ev-case-code" }, [
              h("strong", { text: row.code }),
              h("small", { text: row.detail })
            ]),
            h("strong", { class: "num", text: row.score.toFixed(2) }),
            h("span", { class: "badge " + row.tone, text: row.verdict })
          ]);
        }))),
        // 置信度加权四项。Q&A 的 Q1 追问「这数字怎么算出来的」，答案就摊在这里，
        // 而且第 4 项是减分 —— 减分项必须和加分项一样显眼。
        h("div", { class: "ev-weight" }, [
          h("div", { class: "ev-weight-head" }, [
            h("span", { class: "card-title", text: "置信度加权" }),
            h("span", { class: "card-sub",
              text: hit.rows.length + " 条命中 · " + mech.length + " 条确诊为机械类" })
          ]),
          h("div", { class: "ev-weight-rows" }, hit.weighting.map(function (w) {
            var minus = w.value < 1;
            return h("div", { class: "ev-weight-row" }, [
              h("strong", { class: "num " + (minus ? "warn" : "ok"),
                text: (minus ? "" : "+") + w.value.toFixed(2) }),
              h("div", { class: "ev-weight-text" }, [
                h("strong", { text: w.label }),
                h("small", { text: w.note })
              ])
            ]);
          }))
        ])
      ])
    ]);
  }

  // ---------------------------------------------------------------- plan
  //
  // 分级处置建议。Q&A 的 Q15 要的就是这个「中间方案」：不是二选一（停 or 不停），
  // 而是四个时间档各自该做什么。
  //
  // ⚠️ 备件与移动端作业卡那一行**只写说明，不做任何假动作** —— 不显示「已推送」、
  //    不给可点的按钮。按需求：那是集成点，当前未接入，说清楚比演一下诚实。
  function renderPlan(ev, opts) {
    var RECORDS = need("DOMAIN_RECORDS");
    var plan = RECORDS.planById(ev.planId);
    return h("section", { class: "ev" }, [
      head(plan.label, plan.note, opts.zoom ? null : [zoomBtn()]),
      h("div", { class: "ev-body ev-plan" }, [
        h("div", { class: "ev-plan-steps" }, plan.steps.map(function (st) {
          return h("div", { class: "ev-plan-step " + st.tone }, [
            h("span", { class: "ev-plan-at", text: st.at }),
            h("div", { class: "ev-plan-text" }, [
              h("strong", { text: st.label }),
              h("small", { text: st.detail })
            ])
          ]);
        })),
        h("div", { class: "ev-plan-basis" }, [
          h("strong", { text: "72 小时窗口的依据" }),
          h("ul", {}, plan.windowBasis.map(function (line) {
            return h("li", { text: line });
          }))
        ]),
        h("p", { class: "muted ev-align-note", text: plan.costNote }),
        // 未接入的集成点：用 muted + 明确措辞，不做成按钮。
        h("p", { class: "muted ev-align-note ev-plan-parts", text: plan.partsNote })
      ])
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


  // ---------------------------------------------------------------- 分发

  var RENDERERS = {
    series: renderSeries,
    alignment: renderAlignment,
    case: renderCaseHits,
    plan: renderPlan,
    vision: renderVision,
    rule: renderRule
  };

  // 未选依据时的空态。它不是占位 —— 首屏就是这个状态，一句话说清"接下来该点哪儿"。
  function renderEmpty() {
    return h("section", { class: "ev" }, [
      head("证据台", "点左侧依据链查看", null),
      h("div", { class: "ev-body ev-case" }, [
        h("p", { text: "AI 的每一条依据都可以点开看原始证据：SCADA 时序曲线、激光对中前后实测、历史案例检索与置信度加权、分级处置建议、仪器屏幕识别框、判定口径。" })
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
