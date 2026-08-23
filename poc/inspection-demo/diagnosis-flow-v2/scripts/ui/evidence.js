// window.EvidenceView —— 证据台的十种证据形态。
//
// 【为什么抽成一个组件】同一份证据要在两处渲染：工作台右栏的常驻证据台，以及点「放大」
// 之后的浮层。两处只差尺寸和一个 chartId，内容完全一样 —— 各写一份必然分叉（旧目录
// 的时序详情子屏和工作台时序卡就是各写一份，切时间范围时一个动一个不动，同一个测点
// 两处数字对不上，那是会被现场当场看出来的穿帮）。
//
// 十种形态对应 domain/04-records.js 里 evidence[].kind：
//   series   数值型 + 有标准    → 时序曲线（两条阈值线 + 越线阴影）
//   track    巡检行为核查        → 提交时刻/间隔/停留 三个数各对一条规则
//   compare  同点位前后变化      → 真实的同机位两帧并排
//   timeline 开关量故障 + 处置   → 事件时间线
//   gaps     记录缺项           → 表单缺项清单
//   vision   目视 / 门禁 / 分区  → 关键帧 + bbox + 识别项
//   pose     动作与姿态         → 帧图 + 动作阶段时间轴（到位/读表/录入）
//   route    定位与轨迹         → 帧图（ROI/历史轨迹/定位点）+ 停留统计
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

  // dom.js 的 h() 没有 SVG 命名空间分支，document.createElement("svg") 建不出真正
  // 的 SVG 节点 —— ROI/轨迹/定位点这层叠加只能在这里用 createElementNS 手搭。
  var SVG_NS = "http://www.w3.org/2000/svg";

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
    // provenance 存在就渲染一行灰字。**显式判存在，不给默认值** —— 真帧没有这个字段，
    // 而示意帧必须把「非本轮实拍」写在屏上：白昼室外照配夜班时刻是肉眼级矛盾，
    // 靠讲解人记得说不算保障。
    var prov = frame.provenance
      ? h("p", { class: "ev-fig-prov", text: frame.provenance })
      : null;
    return h("div", { class: "ev-figwrap" }, [
      prov,
      h("figure", { class: "ev-fig" }, [
        h("img", { src: VISION.sourceOf(frame.src), alt: frame.label }),
        boxes.map(function (box) {
          return h("div", {
            // tagPos:"bottom" 让标签翻到框下沿，用于相邻小目标标签互压的情况。
            class: "ev-box " + box.tone + (box.tagPos === "bottom" ? " tag-bottom" : ""),
            style: "left:" + (box.bbox.x * 100) + "%;top:" + (box.bbox.y * 100) + "%;" +
              "width:" + (box.bbox.w * 100) + "%;height:" + (box.bbox.h * 100) + "%",
            title: box.note
          }, [
            h("span", { class: "ev-box-tag", text: box.label })
          ]);
        }),
        overlayOf(frame)
      ])
    ]);
  }

  // 创建一个 SVG 节点。attrs 直接 setAttribute —— 不复用 h() 的属性分支，因为
  // h() 那套 class/dataset/style 特殊键是给 HTML 节点设计的，SVG 这里用不上。
  function svgEl(tag, attrs) {
    var node = document.createElementNS(SVG_NS, tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (key) {
      var value = attrs[key];
      if (value === false || value == null) return;
      node.setAttribute(key, value);
    });
    return node;
  }

  // 0~1 归一化坐标转成 viewBox="0 0 100 100" 下的点串。
  function svgPoints(points) {
    return points.map(function (p) { return (p.x * 100) + "," + (p.y * 100); }).join(" ");
  }

  // ROI 多边形 / 历史轨迹 / 当前定位点的叠加层，与 .ev-box 同级铺在 .ev-fig 里。
  // viewBox 固定写死 100x100 + preserveAspectRatio="none"：图片是
  // height:100%;width:auto，加载完成前拿不到真实像素宽度，坐标不能按像素算，
  // 只能靠归一化坐标乘 100 直接落进这套虚拟坐标系。
  //
  // areas / paths / marks 三个字段各自显式判存在 —— 缺一个就不画那一层，
  // 不许拿 `frame.areas || []` 把"没这个字段"悄悄变成"这层是空的"。
  function overlayOf(frame) {
    var svg = svgEl("svg", {
      class: "ev-fig-paths",
      viewBox: "0 0 100 100",
      preserveAspectRatio: "none"
    });
    var hasOverlay = false;
    if (frame.areas) {
      frame.areas.forEach(function (area) {
        svg.appendChild(svgEl("polygon", {
          class: "ev-area " + area.tone,
          points: svgPoints(area.points)
        }));
      });
      hasOverlay = true;
    }
    if (frame.paths) {
      frame.paths.forEach(function (path) {
        svg.appendChild(svgEl("polyline", {
          class: "ev-path " + path.tone,
          points: svgPoints(path.points)
        }));
      });
      hasOverlay = true;
    }
    if (frame.marks) {
      frame.marks.forEach(function (mark) {
        svg.appendChild(svgEl("circle", {
          class: "ev-mark " + mark.tone,
          cx: mark.x * 100, cy: mark.y * 100, r: 1.6
        }));
      });
      hasOverlay = true;
    }
    return hasOverlay ? svg : null;
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

  // ---------------------------------------------------------------- track
  //
  // 巡检行为核查。它判的不是「设备怎么样」，而是「这一轮是不是真去了」——
  // 管理者视角的核心。证据形态是**时间**：提交时刻、与前项的间隔、现场停留时长，
  // 三个数各自对一条规则，命中的标红。
  //
  // ★ 最后那段 visionNote 是这枚证据真正的价值：说清视觉为什么帮上忙 / 帮不上忙。
  //   有些巡检项（电缆沟、地面孔洞）根本不在摄像头视野里，只能靠人到位 ——
  //   所以行为核查是它唯一可核的维度。不写这一段，读者会以为"怎么不看画面"。
  //
  // ★ 裁决色 verdictTone 必须**读**、不能算：命中条数不等于裁决结论 ——
  //   命中一条也可能因为姿态/表盘/轨迹三路视觉证据一致而判正常归档（见 REC-7），
  //   `hits >= 2 ? "danger" : "warn"` 这种算法会在只命中一条时配错颜色。
  function renderTrack(ev, opts) {
    var RECORDS = need("DOMAIN_RECORDS");
    var tk = RECORDS.trackById(ev.trackId);
    if (!tk.verdictTone) throw new Error("[EvidenceView] " + tk.id + " 缺少 verdictTone");
    return h("section", { class: "ev" }, [
      head(tk.label, tk.window.label + " " + tk.window.from + "-" + tk.window.to,
           opts.zoom ? null : [zoomBtn()]),
      h("div", { class: "ev-body ev-track" }, [
        h("div", { class: "ev-track-rows" }, tk.rows.map(function (row) {
          return h("div", { class: "ev-track-row " + (row.hit ? "hit" : "") }, [
            h("div", { class: "ev-track-main" }, [
              h("strong", { text: row.label }),
              h("span", { class: "ev-track-value " + row.tone, text: row.value })
            ]),
            row.rule ? h("div", { class: "ev-track-rule" }, [
              h("span", { class: "badge " + (row.hit ? "danger" : "ok"),
                text: row.hit ? "命中" : "未命中" }),
              h("span", { class: "muted", text: row.rule })
            ]) : null,
            h("small", { text: row.note })
          ]);
        })),
        // 同段节奏：说明"不是只有这一项快"，避免被当成个例。
        h("div", { class: "ev-track-segment" }, [
          h("strong", { text: "同段节奏" }),
          h("span", { text: tk.segment.note })
        ]),
        h("div", { class: "ev-verdict-line" }, [
          h("i", { class: "dot " + tk.verdictTone }),
          h("span", { text: tk.conclusion })
        ]),
        h("p", { class: "muted ev-track-note", text: tk.visionNote })
      ])
    ]);
  }

  // ---------------------------------------------------------------- pose
  //
  // 动作与姿态。track 只给出"停留 8 秒"这一个抽象数字，这里把 8 秒拆成
  // 到位 / 读表 / 录入三段动作序列 —— 这才是这枚证据真正要说的事：
  // 8 秒不是"太快"，而是干完这份活刚好要用的时间。
  function renderPose(ev, opts) {
    var VISION = need("DOMAIN_VISION");
    var RECORDS = need("DOMAIN_RECORDS");
    var frame = VISION.frameById(ev.frameId);
    var pose = RECORDS.poseById(ev.poseId);
    return h("section", { class: "ev" }, [
      head(pose.label, pose.model + " · 置信度 " + pose.confidence + "%",
           opts.zoom ? null : [zoomBtn()]),
      h("div", { class: "ev-body ev-pose" }, [
        figure(frame),
        h("div", { class: "ev-pose-phases" }, pose.phases.map(function (phase) {
          return h("div", { class: "ev-pose-phase" }, [
            h("span", { class: "ev-pose-phase-at num", text: phase.at }),
            h("div", { class: "ev-pose-phase-text" }, [
              h("strong", { text: phase.label }),
              h("span", { class: "ev-pose-phase-sec num", text: phase.seconds + " 秒" })
            ]),
            h("small", { text: phase.detail })
          ]);
        })),
        h("p", { class: "muted ev-pose-note", text: pose.conclusion })
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

  // ---------------------------------------------------------------- route
  //
  // 定位与轨迹。ROI 多边形、历史轨迹、当前定位点都画在帧图里（figure() 里的
  // overlayOf 会自动处理，这里不用重复画）—— 这个渲染器只再补四行统计：
  // 进入/离开 ROI 的时刻、ROI 内停留时长、路径是否经过本巡检点。
  function renderRoute(ev, opts) {
    var VISION = need("DOMAIN_VISION");
    var RECORDS = need("DOMAIN_RECORDS");
    var frame = VISION.frameById(ev.frameId);
    var route = RECORDS.routeById(ev.routeId);
    return h("section", { class: "ev" }, [
      head(route.label, route.model + " · 置信度 " + route.confidence + "%",
           opts.zoom ? null : [zoomBtn()]),
      h("div", { class: "ev-body ev-route" }, [
        figure(frame),
        h("div", { class: "ev-route-rows" }, route.rows.map(function (row) {
          return h("div", { class: "ev-route-row" }, [
            h("span", { class: "ev-route-row-label", text: row.label }),
            h("span", { class: "ev-route-row-value num", text: row.value })
          ]);
        })),
        h("p", { class: "muted ev-route-note", text: route.conclusion })
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
    track: renderTrack,
    compare: renderCompare,
    timeline: renderTimeline,
    gaps: renderGaps,
    vision: renderVision,
    pose: renderPose,
    route: renderRoute,
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
