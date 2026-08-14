// 场景子屏：时序模型详情 / 视觉模型详情（workbench 的场景内子屏，由 boot.js 的
// renderScene() 在 state.scene === "workbench" && state.detail 时路由到这里）。
//
// 架构决定见 boot.js 的 renderScene() 注释：这是 workbench 的场景内子屏，不是第
// 8/9 个场景；state.detail 取值 "" | "trend" | "vision"（既有语义，本文件不改）。
// 用户诉求是"点击展开时序/视觉详情要独占一屏，不要挤在网格卡片之间"——因此本文件
// 产出的整段 DOM 占满整个 stage（不再是追加在网格下方的展开块），但场景导航仍然
// 高亮"诊断工作台"（state.scene 全程保持 "workbench" 不变），底部流程条第 4/5 步
// 的高亮同理由 boot.js 的 activeFlowIndex() 按 state.detail 派生，本文件不用关心。
//
// 数据来源与其它场景同一套 { range, focus } 索引：当前聚焦部位取 state.focus.partId
// （AppState.selectedPart()），机组固定是 workbench 的诊断机组（进入 workbench 时
// normalizeState 已经把 focus.unitId 锁定为 DATA.caseKnowledge().unitId，见
// core/state.js 的 freeUnitScenes 说明），时间窗口取 state.range。
(function () {
  "use strict";

  var DATA = window.DemoData;
  var SEED = window.DemoDataSeed;
  var AppState = window.AppState;
  var state = window.AppState.value;
  var Charts = window.Charts;
  var ChartOptions = window.ChartOptions;
  var Cards = window.Cards;
  var Overlay = window.Overlay;

  var SAMPLE_MAX_ROWS = 10;

  // ---------- 小工具（局部私有：同层场景文件之间不得互相引用，见 boot.js 顶部的
  // 分层注释，因此这几个纯格式化函数只能在本文件里各自维护一份，不与
  // scenes/overview.js 共享） ----------

  function round2(value) {
    return Math.round(value * 100) / 100;
  }

  function fmtNum(value) {
    return String(round2(value));
  }

  function rangeLabel() {
    var matches = DATA.ranges().filter(function (range) { return range.key === state.range; });
    return matches[0].label;
  }

  function unitId() {
    return AppState.selectedUnitId();
  }

  function currentPart() {
    return AppState.selectedPart();
  }

  // 同部位关联测点：primary 主测点排第一个（front-bearing 是唯一一个覆盖 2 个测点
  // 的部位：P-DE-V 主测点 + BRG-T 轴承温度，其余部位各只有 1 个测点，见
  // scripts/data/catalog.js 的 points 表）。
  function partPoints(part) {
    var points = DATA.points().filter(function (point) { return point.partId === part.id; });
    points.sort(function (a, b) {
      var av = a.primary ? 0 : 1;
      var bv = b.primary ? 0 : 1;
      return av - bv;
    });
    return points;
  }

  // 采样口径文案：直接读 scripts/data/seed.js 的 RANGE_DEFS（hoursPerPoint 决定每个
  // 数据点是原始采样还是均值聚合），不在本文件里另编一套与之脱节的文案。
  function samplingCaliberText(rangeKey) {
    var def = SEED.rangeDef(rangeKey);
    if (def.hoursPerPoint === 1) {
      return def.label + " · 逐小时原始采样（" + def.points + " 点）";
    }
    return def.label + " · 每点 " + def.hoursPerPoint + " 小时均值聚合（" + def.points + " 点）";
  }

  // 采样表最多 10 行：区间点数 <= 10 时全取；否则在区间内均匀抽取 10 个点（含末点，
  // 即"此刻"），不做简单的"只取最后 10 个"（那样 90d/30d 区间会看不到早期趋势）。
  function pickSampleIndices(total) {
    var idx = [];
    var i;
    if (total <= SAMPLE_MAX_ROWS) {
      for (i = 0; i < total; i += 1) idx.push(i);
      return idx;
    }
    var step = (total - 1) / (SAMPLE_MAX_ROWS - 1);
    for (i = 0; i < SAMPLE_MAX_ROWS; i += 1) idx.push(Math.round(i * step));
    return idx;
  }

  // ---------- 外壳：两个子屏共用（场景头面包屑 + 返回按钮 / 底部常驻动作条） ----------

  function renderReturnButton() {
    return h("button", {
      type: "button",
      class: "plain-button",
      dataset: { action: "close-detail" },
      text: "‹ 返回诊断工作台",
    });
  }

  function renderActionBar() {
    return h("div", { class: "detail-screen-actions" }, [
      h("button", {
        type: "button",
        class: "plain-button",
        dataset: { action: "close-detail" },
        text: "返回诊断工作台",
      }),
      h("button", {
        type: "button",
        class: "primary-action",
        dataset: { action: "go-confirm" },
        text: "进入复核确认",
      }),
    ]);
  }

  // kicker 沿用 workbench.js/confirm.js 已有的 "A / B" 面包屑式写法（不是字面意义上
  // 的场景导航面包屑，而是这几个场景文件里已经统一的"分区 / 子视图"标题惯例）。
  // row 是 .detail-screen-row 的两个直接子节点（左侧参数栏/清单 + 右侧内容）。
  function renderShell(kicker, title, visual, row) {
    var shell = AppState.pageShell(
      kicker,
      title,
      renderReturnButton(),
      h("div", { class: "detail-screen-content" }, [
        h("div", { class: "detail-screen-body" }, [
          h("div", { class: "detail-screen-visual" }, [visual]),
          h("div", { class: "detail-screen-row" }, row),
        ]),
        renderActionBar(),
      ])
    );
    shell.className += " detail-screen-shell";
    return shell;
  }

  // ---------- 时序模型详情 ----------

  function renderTrendVisual(seriesList) {
    return Cards.chart({
      title: seriesList[0].label + " 趋势 · " + rangeLabel(),
      chartId: "detail-trend-main",
      meta: seriesList.length > 1 ? "含同部位关联测点" : seriesList[0].unit,
    });
  }

  function renderTrendParamPanel(primary, relatedLabel) {
    function row(label, value) {
      return h("div", { class: "detail-param-row" }, [
        h("span", { text: label }),
        h("strong", { text: value }),
      ]);
    }
    return h("section", { class: "panel detail-param-panel" }, [
      AppState.panelTitle("测点参数", rangeLabel()),
      h("div", { class: "detail-param-list" }, [
        row("测点全名", primary.label),
        row("单位", primary.unit),
        row("关注线", fmtNum(primary.warn) + " " + primary.unit),
        row("停机线", primary.stop != null ? (fmtNum(primary.stop) + " " + primary.unit) : "未设定"),
        row("采样口径", samplingCaliberText(state.range)),
        row("区间统计", "均值 " + fmtNum(primary.mean) + " · 峰值 " + fmtNum(primary.peak) + " · 越线 " + primary.breachCount + " 次"),
        row("关联测点", relatedLabel),
      ]),
    ]);
  }

  function renderSampleTable(primary) {
    var idx = pickSampleIndices(primary.labels.length);
    return h("section", { class: "panel detail-sample-panel" }, [
      AppState.panelTitle("采样表", "≤ " + SAMPLE_MAX_ROWS + " 点"),
      h("div", { class: "sample-table" }, [
        h("div", { class: "sample-head" }, [h("span", { text: "时间点" }), h("span", { text: "数值" })]),
        idx.map(function (i) {
          return h("div", {}, [
            h("span", { text: primary.labels[i] }),
            h("strong", { text: fmtNum(primary.values[i]) + " " + primary.unit }),
          ]);
        }),
      ]),
    ]);
  }

  function renderTrendEvidence(part, primary) {
    return Cards.evidence({
      status: primary.status,
      conclusion: primary.alert,
      tags: part.evidence.slice(0, 3),
    });
  }

  function renderTrendScreen(part) {
    var points = partPoints(part);
    var seriesList = points.map(function (point) { return DATA.series(unitId(), point.id, state.range); });
    var primary = seriesList[0];
    var relatedLabel = points.length > 1
      ? points.slice(1).map(function (point) { return point.label; }).join("、")
      : "无（本部位仅 1 个测点覆盖）";

    return renderShell(
      "诊断工作台 / 时序模型详情",
      part.label + " · " + primary.label,
      renderTrendVisual(seriesList),
      [
        renderTrendParamPanel(primary, relatedLabel),
        h("div", { class: "detail-screen-extra" }, [
          renderSampleTable(primary),
          renderTrendEvidence(part, primary),
        ]),
      ]
    );
  }

  // trend() 内部按 s.unit 分组建轴（同一层不重复解释一遍口径，见 core/chartopts.js
  // 顶部注释）；这里在调用侧复刻同一份分组逻辑，只用于"按轴分组重算 min/max 留白"，
  // 不改 chartopts.js 的构造器本身——与 scenes/overview.js 的
  // applyTrendReadability/applyMixReadability 是同一类"只覆盖调用时拿到的 option
  // 对象"手法。
  function unitAxisIndex(seriesList) {
    var order = [];
    var index = {};
    seriesList.forEach(function (s) {
      if (index[s.unit] === undefined) {
        index[s.unit] = order.length;
        order.push(s.unit);
      }
    });
    return { order: order, index: index };
  }

  // 在 trend() 默认只画"关注线"markLine 的基础上，按本屏需求叠加"停机线"（仅当
  // 该测点定义了 stop 时才有），并加上 dataZoom——trend() 是通用构造器，不知道
  // 独占屏这种"允许框选缩放"的诉求，因此这两项都在调用侧追加，不改
  // core/chartopts.js。markArea（越线区域）trend() 已经按每条 series 画好，这里
  // 不重新处理。
  function applyTrendDetailReadability(option, seriesList) {
    var THEME = ChartOptions.THEME;
    var axis = unitAxisIndex(seriesList);
    var bounds = axis.order.map(function () { return { lo: Infinity, hi: -Infinity }; });

    seriesList.forEach(function (s) {
      var b = bounds[axis.index[s.unit]];
      var values = s.values.concat([s.warn]);
      if (s.stop != null) values.push(s.stop);
      var lo = Math.min.apply(null, values);
      var hi = Math.max.apply(null, values);
      if (lo < b.lo) b.lo = lo;
      if (hi > b.hi) b.hi = hi;
    });

    bounds.forEach(function (b, index) {
      var pad = (b.hi - b.lo) * 0.12;
      if (pad <= 0) pad = Math.abs(b.hi) * 0.12 || 1;
      option.yAxis[index].min = round2(Math.max(0, b.lo - pad));
      option.yAxis[index].max = round2(b.hi + pad);
      option.yAxis[index].name = "";
    });

    seriesList.forEach(function (s, i) {
      var lineData = [{ yAxis: s.warn, name: "关注线", lineStyle: { color: THEME.amber } }];
      if (s.stop != null) lineData.push({ yAxis: s.stop, name: "停机线", lineStyle: { color: THEME.red } });
      option.series[i].markLine = {
        symbol: "none",
        label: { formatter: "{b}", color: THEME.ink },
        lineStyle: { type: "dashed" },
        data: lineData,
      };
    });

    option.dataZoom = [
      { type: "inside", start: 0, end: 100 },
      {
        type: "slider",
        start: 0,
        end: 100,
        height: 16,
        bottom: 6,
        borderColor: THEME.lineStrong,
        textStyle: { color: THEME.muted },
      },
    ];
    option.grid.bottom = 54;
    return option;
  }

  function drawTrendCharts(part) {
    var points = partPoints(part);
    var seriesList = points.map(function (point) { return DATA.series(unitId(), point.id, state.range); });
    var option = ChartOptions.trend(seriesList);
    applyTrendDetailReadability(option, seriesList);
    Charts.draw("detail-trend-main", option);
  }

  // ---------- 视觉模型详情 ----------
  //
  // 重做说明（本轮任务）：旧版本这里只是两张现场照片并排（object-fit:contain 在深色
  // 主题下留出大片白色 letterbox），完全没有标注、没有关键帧切换，右侧还塞了一份和
  // "视觉"证据无关的时序 spark 网格（联轴器相位偏差趋势——那是时序模型详情屏该管的
  // 事）。数据层已经在 catalog.js 补了 part.vision.frames[]（每帧
  // { id, label, src, bbox:{x,y,w,h}(0~1 归一化), boxLabel, findings[] }，
  // scripts/data/schema.js 的 assertPartsVisionFrames 已经保证非空、bbox 落在
  // [0,1] 且不越界、findings 是 1~4 条非空字符串），本节直接消费这份数据把"模型看到
  // 了什么"画出来：大图 + 识别框 + 框标签 + 关键帧切换 + 逐帧识别明细，右下角不再放
  // 任何时序图表。
  //
  // 帧切换/放大预览都是本屏内部的临时交互状态（点开哪一帧、放大层开不开），不接入
  // core/state.js：这与 scenes/graph.js 的 focusedId 是同一个理由——不需要跨会话
  // 持久化，也不值得为它在 AppState 里新增一个字段、外加一套"该字段合法值随
  // part.vision.frames 变化"的校验负担。因此这里全部是本文件顶层的模块级变量，
  // 交互直接用 addEventListener 就地更新已渲染出的 DOM（不触发 boot.js 的整页
  // render()），render() 全量重渲染只在离开这个部位（切换到另一个 part）时才把它们
  // 重置回默认帧。

  var visionFrameIndex = 0; // 当前选中的关键帧下标，下标越界的问题交给 applyVisionFrame 内部保证。
  var visionLastPartId = null; // 上一次真正渲染视觉详情时的 part.id，用来判断"是不是换了个部位"。

  // 只有真的换了部位才把选中帧收回第 0 帧：同一个部位内来回点切帧按钮，不应该被
  // 任何一次意外的整页 render()（本屏正常操作下不会触发，但防御性地兼容一下）打回默认帧。
  function resetVisionViewIfNewPart(part) {
    if (visionLastPartId === part.id) return;
    visionLastPartId = part.id;
    visionFrameIndex = 0;
  }

  // "解释区"文案：拼当前帧的识别明细 + 该部位视觉证据的整体结论，回答"这一帧为什么
  // 支持/不支持当前结论"，而不是重复一遍拍摄规范（旧版 keyFrameChecklist 的问题）。
  function visionExplainText(part, frame) {
    return "当前帧「" + frame.boxLabel + "」：" + frame.findings.join("；") + "。" + part.vision.finding;
  }

  // 主图列：标题行（部位/点位名 + 关键帧切换按钮组）+ 图像舞台（bbox 叠在图上）+
  // 帧说明行。refs 由调用方（renderVisionScreen）传入的空对象，用来把需要在切帧时
  // 更新的真实 DOM 节点“带出去”，applyVisionFrame 才能就地改它们，不必重新渲染整棵树。
  function renderVisionMainPanel(part, frames, refs) {
    refs.toolbarButtons = [];
    var toolbar = h("div", { class: "detail-vision-toolbar", role: "group", "aria-label": "关键帧切换" },
      frames.map(function (frame, index) {
        var btn = h("button", { type: "button", class: "detail-vision-frame-btn", text: frame.label });
        btn.addEventListener("click", function () { refs.applyFrame(index); });
        refs.toolbarButtons.push(btn);
        return btn;
      })
    );

    refs.bboxLabelEl = h("span", { class: "detail-vision-bbox-label" });
    refs.bboxEl = h("div", { class: "detail-vision-bbox" }, [refs.bboxLabelEl]);
    refs.imgEl = h("img", { class: "detail-vision-img" });
    var figure = h("figure", { class: "detail-vision-figure" }, [refs.imgEl, refs.bboxEl]);
    refs.stageEl = h("div", { class: "detail-vision-stage" }, [figure]);

    refs.frameLabelEl = h("strong", {});
    var caption = h("div", { class: "detail-vision-caption" }, [
      refs.frameLabelEl,
      h("span", { text: part.vision.caption }),
    ]);

    return h("section", { class: "panel detail-vision-main" }, [
      h("div", { class: "panel-title" }, [
        h("span", { text: part.label + " · " + part.vision.title }),
        toolbar,
      ]),
      refs.stageEl,
      caption,
    ]);
  }

  // 侧栏：模型识别明细（当前帧 findings[]）+ 放大当前帧。
  function renderVisionSidePanel(refs) {
    var titleRow = AppState.panelTitle("模型识别明细", "");
    refs.findingsMetaEl = titleRow.querySelector("small");
    refs.findingsListEl = h("ul", { class: "bullet-list detail-vision-findings" });
    refs.zoomBtn = h("button", { type: "button", class: "primary-action detail-vision-zoom-btn", text: "放大当前帧" });

    return h("section", { class: "panel detail-vision-side" }, [
      titleRow,
      refs.findingsListEl,
      refs.zoomBtn,
    ]);
  }

  // "放大当前帧"复用 scripts/ui/overlay.js 的通用浮层外壳，不新建 modal。
  //
  // Overlay.render 的 mask / 头部关闭按钮是组件内部硬编码好的，必然带
  // dataset:{action: onCloseAction}（见 overlay.js render() 的实现），boot.js 的
  // bindStage() 会无差别给 stage 内所有 [data-action] 元素都挂一份"点击→
  // handleAction→AppState.save()+render()"的委托监听——这与本屏"帧切换/放大预览
  // 都是局部状态，不走整页 render()"的设计相冲突：如果真的让那次点击落到
  // handleAction，即便传一个 handleAction 认不出的 action 字符串，它也会落到该函数
  // 末尾"未识别 action 一律 save()+render()"的兜底分支，force 一次整页重渲染。
  //
  // 解法不是去改 boot.js（不在本次改动范围内，也没必要为一个局部浮层多认一个
  // action），而是本文件自己先一步在这两个节点上挂 click 监听（在它们被
  // append 进 stage、boot.js 的 bindStage() 还没跑到它们之前就已经绑好），并在处理
  // 函数里调用 event.stopImmediatePropagation()——同一个节点上后绑定的监听器
  // （bindStage() 之后才补上的那个）不会再被触发。onCloseAction 传的字符串因此永远
  // 不会真正走到 handleAction 里，只是用来满足 Overlay.render 的必填参数校验。
  function buildVisionZoomOverlay(part) {
    var img = h("img", { class: "detail-vision-zoom-image" });
    var node = Overlay.render({
      open: false,
      title: "关键帧放大预览",
      kicker: part.label + " · " + part.vision.title,
      body: [img],
      actions: [],
      onCloseAction: "noop-vision-zoom-close",
      wide: true,
      panelClass: "detail-vision-zoom-panel",
    });

    function setOpen(open) {
      node.classList.toggle("open", open);
      node.setAttribute("aria-hidden", open ? "false" : "true");
    }

    var mask = node.querySelector(".overlay-mask");
    var closeBtn = node.querySelector(".overlay-head button");
    [mask, closeBtn].forEach(function (el) {
      el.addEventListener("click", function (event) {
        event.stopImmediatePropagation();
        setOpen(false);
      });
    });

    return { node: node, imgEl: img, setOpen: setOpen };
  }

  function renderVisionScreen(part) {
    resetVisionViewIfNewPart(part);
    var frames = part.vision.frames;
    var refs = {};

    var mainPanel = renderVisionMainPanel(part, frames, refs);
    var sidePanel = renderVisionSidePanel(refs);
    var visual = h("div", { class: "detail-vision-grid" }, [mainPanel, sidePanel]);

    var explainCard = Cards.evidence({
      status: part.status,
      conclusion: visionExplainText(part, frames[visionFrameIndex]),
      tags: part.evidence.slice(0, 3),
    });
    explainCard.className += " detail-vision-explain";

    var zoom = buildVisionZoomOverlay(part);

    // .detail-vision-figure 想让自己"shrink-wrap"到图片实际渲染尺寸，但纯 CSS 在这
    // 里会掉进一个循环依赖：figure 用 display:inline-block 让宽高跟着内容（img）走，
    // img 又想用 max-height:100% 跟着 figure 的高度走——figure 没有一个"确定的"高度
    // （它的高度本身就是"content 决定"的 auto），百分比高度在这种"容器高度取决于内容"
    // 的场景下按 CSS 规范会直接失效（等同于没设），于是 img 只受 max-width 约束、
    // 完全不受高度约束，实际渲染出来的高度可以远超 .detail-vision-stage 能给的空间，
    // 多出来的部分被 .detail-vision-stage 的 overflow:hidden 悄悄裁掉——图片竖构图、
    // 照片下半部分被裁掉的那种"看起来正常、实际缺了一块"的坑，比纯白 letterbox 更
    // 隐蔽，肉眼很难在截图里发现（bbox 相对 img 自身的定位仍然算得对，两者数值互相
    // 一致，只是 img 本身画大了、被裁了）。
    //
    // 解法是不依赖百分比高度做这件事：拿到图片的 naturalWidth/naturalHeight 和
    // .detail-vision-stage 当前实际可用的 clientWidth/clientHeight，按"保持宽高比、
    // 整体缩到不超出可用空间"算出一个具体的像素宽高，直接写成 img 的行内
    // style.width/height（不是百分比）。这样 figure 的 inline-block shrink-wrap
    // 就是跟着一个已经算好的确定像素值走，不再有循环依赖，bbox 的百分比定位在这个
    // 确定盒子内继续成立。
    //
    // 需要在两个时机重新算一次：①图片刚加载完（naturalWidth/naturalHeight 从 0 变成
    // 真实值——首次进入、或切到一张体积更大还没解码完的图时都可能有短暂的 0）；
    // ②.detail-vision-stage 自身尺寸变化（例如 1920→1440→1280 这类视口收窄，
    // 不经过图表槽位，core/charts.js 的 ResizeObserver 管不到这里，因此本文件自己
    // 建一个私有的 ResizeObserver，与 scenes/graph.js 顶部注释里"通用机制覆盖不到的
    // 场景各自补一个"是同一种做法）。
    function fitFrameImage() {
      var img = refs.imgEl;
      var stage = refs.stageEl;
      if (!img.naturalWidth || !img.naturalHeight) return;
      var availW = stage.clientWidth;
      var availH = stage.clientHeight;
      if (!availW || !availH) return;
      var scale = Math.min(availW / img.naturalWidth, availH / img.naturalHeight);
      img.style.width = (img.naturalWidth * scale) + "px";
      img.style.height = (img.naturalHeight * scale) + "px";
    }

    refs.fitImage = fitFrameImage;
    refs.imgEl.addEventListener("load", fitFrameImage);
    // 本文件私有的 ResizeObserver：观察对象（refs.stageEl）随本次渲染的整棵树一起
    // 被丢弃（下次全量 render() 会 stage.innerHTML="" 拆掉旧树），没有任何变量继续
    // 持有对它的引用，因此不需要像 scenes/graph.js 那样在"复用同一个长期存活实例"
    // 时手动 disconnect() 旧的一份——这里每次都是全新的元素、全新的 observer，自然
    // 一起被回收。
    new ResizeObserver(fitFrameImage).observe(refs.stageEl);

    // 就地更新：主图 src/alt、bbox 的位置尺寸（百分比，相对图片本身渲染尺寸，见
    // 上面 fitFrameImage 的注释）、框标签、帧说明、识别明细列表、切帧按钮的高亮态、
    // 解释区文案、放大层里的图，全部由这一个函数负责，初次渲染和之后每次点切帧按钮
    // 都调它，不必分两套逻辑各写一遍。
    function applyFrame(index) {
      visionFrameIndex = index;
      var frame = frames[index];

      refs.imgEl.src = DATA.media(frame.src);
      refs.imgEl.alt = frame.boxLabel;
      // 兜底调一次（不是"吞错误"的兜底，是覆盖"新 src 和上一帧相同"这种 <img> 不会
      // 重新触发 load 事件、但图片其实早就 complete 的情况——比如同一部位两帧共用
      // 同一张点位图时，只是 bbox/文案变了，图片尺寸没变，直接按当前已知尺寸算一次
      // 即可，不需要等一个不会发生的 load 事件）。
      fitFrameImage();

      refs.bboxEl.style.left = (frame.bbox.x * 100) + "%";
      refs.bboxEl.style.top = (frame.bbox.y * 100) + "%";
      refs.bboxEl.style.width = (frame.bbox.w * 100) + "%";
      refs.bboxEl.style.height = (frame.bbox.h * 100) + "%";
      refs.bboxLabelEl.textContent = frame.boxLabel;

      refs.frameLabelEl.textContent = frame.label;
      refs.findingsMetaEl.textContent = frame.boxLabel;

      refs.findingsListEl.innerHTML = "";
      frame.findings.forEach(function (item) {
        refs.findingsListEl.appendChild(h("li", { text: item }));
      });

      refs.toolbarButtons.forEach(function (btn, i) {
        var active = i === index;
        btn.classList.toggle("active", active);
        btn.setAttribute("aria-pressed", active ? "true" : "false");
      });

      explainCard.querySelector(".card-evidence-conclusion").textContent = visionExplainText(part, frame);

      zoom.imgEl.src = DATA.media(frame.src);
      zoom.imgEl.alt = frame.boxLabel;
    }

    refs.applyFrame = applyFrame;
    applyFrame(visionFrameIndex);
    refs.zoomBtn.addEventListener("click", function () { zoom.setOpen(true); });

    var shell = renderShell(
      "诊断工作台 / 视觉模型详情",
      part.label + " · " + part.vision.title,
      visual,
      [explainCard]
    );
    // detail-vision-shell 只用于让 09-detail.css 按"主图+识别明细占满、解释区收窄
    // 成单行条"重排 .detail-screen-body/.detail-screen-row 这两个共用容器的行高/列数
    // ——不改 renderShell/pageShell 本身，时序详情屏没有这个类，排布不受影响。
    shell.className += " detail-vision-shell";
    // Overlay 是 position:fixed 的浮层（14-overlay.css 的 .overlay-layer），挂在
    // DOM 树的哪个位置不影响它的视觉呈现，这里直接挂在本屏 shell 下即可，不需要像
    // boot.js 给 Agent 抽屉那样单独 appendChild 成 stage 的另一个顶层子节点。
    shell.appendChild(zoom.node);
    return shell;
  }

  // ---------- 出口 ----------

  function renderDetailScreen() {
    if (state.detail !== "trend" && state.detail !== "vision") {
      throw new Error("未知的详情子屏 state.detail：" + state.detail);
    }
    var part = currentPart();
    return state.detail === "trend" ? renderTrendScreen(part) : renderVisionScreen(part);
  }

  // 供 boot.js 的 renderSceneCharts() 在 "scene === workbench && detail" 时调用：
  // 只负责往已经 mount 好的 Charts 槽位里 draw() 具体 option，不负责创建/挂载槽位
  // 容器本身（那一步是通用的 mountChartSlots()，与 scene 无关）。与
  // Scenes.renderOverviewCharts() 同一种分工。
  //
  // 视觉模型详情不再画任何 ECharts（旧版右下角的时序 spark 网格已经删掉，见上面
  // "视觉模型详情"一节顶部的说明），这里只有 trend 分支要做事；Charts.flush() 在
  // 没有待绘队列时本身就是空操作（core/charts.js 顶部注释），调用它不会有副作用。
  function renderDetailScreenCharts() {
    if (state.detail !== "trend" && state.detail !== "vision") {
      throw new Error("未知的详情子屏 state.detail：" + state.detail);
    }
    if (state.detail === "trend") drawTrendCharts(currentPart());
    Charts.flush();
  }

  window.Scenes = window.Scenes || {};
  window.Scenes.renderDetailScreen = renderDetailScreen;
  window.Scenes.renderDetailScreenCharts = renderDetailScreenCharts;
})();
