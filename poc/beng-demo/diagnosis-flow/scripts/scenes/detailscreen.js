// 场景子屏：时序详情 / 视觉详情。
//
// 它们是工作台的**证据下钻**，不是第 5、6 个页面：整屏接管 stage，但导航仍高亮
// "诊断工作台"（state.scene 全程保持 workbench，只有 state.detail 在变）。做成独立
// 页面会让讲解者在导航上来回跳，叙事断掉。
//
// 两个入口都能进来，且都要能定位：
//   工作台卡片上的「展开详情」→ 落在该部位的主测点 / current 帧
//   AI 依据链芯片          → 落在该芯片指定的测点 / 帧
// 所以本文件一律读 state.pick.trend.pointId / state.pick.vision.frameId，不自己挑默认值
// ——挑默认值会让"点芯片进来"和"点按钮进来"落在不同的地方。
(function () {
  "use strict";

  var AppState = window.AppState;
  var SERIES = window.DOMAIN_SERIES;
  var VISION = window.DOMAIN_VISION;
  var Charts = window.Charts;
  var ChartOptions = window.ChartOptions;
  var Overlay = window.Overlay;

  var MAIN_SLOT = "dt-main";
  var SUB_SLOT = "dt-sub";
  var SAMPLE_ROWS = 10;

  function currentPoint() {
    var pointId = AppState.value.pick.trend.pointId;
    if (!pointId) throw new Error("[detailscreen] 进入时序子屏时必须已确定测点");
    return AppState.pointById(pointId);
  }

  function currentFrame() {
    var frameId = AppState.value.pick.vision.frameId;
    if (!frameId) throw new Error("[detailscreen] 进入视觉子屏时必须已确定关键帧");
    return AppState.frameById(frameId);
  }

  function returnButton() {
    return h("button", {
      type: "button",
      class: "plain-button",
      dataset: { action: "close-detail", focusKey: "close-detail" },
      text: "← 返回工作台"
    });
  }

  // ---------------------------------------------------------------- 时序子屏

  // 采样表最多 10 行：区间点数 ≤10 时全取；否则在区间内**均匀抽取**（含末点，即
  // "此刻"）。不做"只取最后 10 个"——那样 90d 区间会完全看不到早期趋势。
  function sampleIndices(total) {
    if (total <= SAMPLE_ROWS) {
      return Array.apply(null, { length: total }).map(function (_, i) { return i; });
    }
    var out = [];
    var i;
    for (i = 0; i < SAMPLE_ROWS; i += 1) {
      out.push(Math.round(i * (total - 1) / (SAMPLE_ROWS - 1)));
    }
    return out;
  }

  function renderPointSwitch(part, activeId) {
    var points = AppState.pointsOf(part.id);
    if (points.length < 2) return null;
    return h("div", { class: "dt-point-switch", role: "group", "aria-label": "同部位测点" },
      points.map(function (point) {
        var active = point.id === activeId;
        return h("button", {
          type: "button",
          class: "dt-point-btn" + (active ? " active" : ""),
          "aria-pressed": active ? "true" : "false",
          dataset: { action: "select-point", pointId: point.id, focusKey: "point:" + point.id },
          text: point.label + (point.primary ? " · 主测点" : "")
        });
      }));
  }

  function renderParams(s, point) {
    var rows = [
      ["阈值", point.threshold + " " + point.unit],
      ["安全侧", point.safeSide === "below" ? "越小越安全" : "越大越安全"],
      ["当前值", s.latest + " " + s.unit],
      ["采样口径", SERIES.samplingCaliber(AppState.value.range)],
      ["数据质量", s.values.length + " / " + s.values.length + " 完整"]
    ];
    return h("section", { class: "panel dt-params" }, [
      AppState.panelTitle("参数", point.id),
      h("dl", { class: "dt-param-list" }, rows.map(function (row) {
        return [h("dt", { text: row[0] }), h("dd", { text: row[1] })];
      }))
    ]);
  }

  function renderSampleTable(s) {
    var indices = sampleIndices(s.values.length);
    return h("section", { class: "panel dt-sample" }, [
      AppState.panelTitle("采样表", "均匀抽取 " + indices.length + " 行"),
      h("div", { class: "dt-sample-scroll" }, [
        h("table", { class: "dt-table" }, [
          h("thead", {}, [h("tr", {}, [
            h("th", { scope: "col", text: "时间" }),
            h("th", { scope: "col", text: "数值" }),
            h("th", { scope: "col", text: "状态" })
          ])]),
          h("tbody", {}, indices.map(function (index) {
            var value = s.values[index];
            var over = s.safeSide === "below" ? value > s.threshold : value < s.threshold;
            return h("tr", { class: over ? "over" : "" }, [
              h("td", { text: s.dates[index] }),
              h("td", { class: "dt-num", text: String(value) }),
              h("td", { text: over ? "越线" : "正常" })
            ]);
          }))
        ])
      ])
    ]);
  }

  function renderTrendScreen() {
    var part = AppState.currentPart();
    var point = currentPoint();
    var s = AppState.seriesOf(point.id);
    var points = AppState.pointsOf(part.id);
    var sub = points.filter(function (p) { return p.id !== point.id; })[0];

    return AppState.pageShell(
      "告警数据 / 证据下钻",
      part.label + " · " + point.label,
      returnButton(),
      h("div", { class: "dt-trend-grid" }, [
        h("section", { class: "panel dt-main" }, [
          h("div", { class: "dt-main-head" }, [
            AppState.panelTitle("主曲线", AppState.rangeLabel()),
            renderPointSwitch(part, point.id)
          ]),
          h("div", { class: "dt-chart" }, [Charts.slot(MAIN_SLOT)]),
          h("p", { class: "dt-verdict " + s.status, text: s.alert })
        ]),
        h("div", { class: "dt-side" }, [
          renderParams(s, point),
          sub
            ? h("section", { class: "panel dt-sub" }, [
              AppState.panelTitle("关联测点", sub.label),
              h("div", { class: "dt-chart-sub" }, [Charts.slot(SUB_SLOT)])
            ])
            : null,
          renderSampleTable(s)
        ])
      ])
    );
  }

  // ---------------------------------------------------------------- 视觉子屏

  function frameFigure(frame, extraClass) {
    var b = frame.bbox;
    var boxStyle = "left:" + (b.x * 100) + "%;top:" + (b.y * 100) + "%;"
      + "width:" + (b.w * 100) + "%;height:" + (b.h * 100) + "%;";
    return h("figure", { class: "dt-frame " + (extraClass || "") }, [
      h("img", { class: "dt-frame-img", src: VISION.media[frame.src], alt: frame.label }),
      h("div", { class: "dt-frame-box", style: boxStyle }, [
        h("span", { class: "dt-frame-box-label", text: frame.boxLabel })
      ])
    ]);
  }

  function renderFrameStrip(part, activeId) {
    var ROLE_TEXT = { current: "当前帧", compare: "对比帧", link: "关联帧" };
    return h("div", { class: "dt-strip", role: "group", "aria-label": "帧序列" },
      AppState.framesOf(part.id).map(function (frame) {
        var active = frame.id === activeId;
        return h("button", {
          type: "button",
          class: "dt-strip-item" + (active ? " active" : ""),
          "aria-pressed": active ? "true" : "false",
          dataset: { action: "select-frame", frameId: frame.id, focusKey: "frame:" + frame.id }
        }, [
          h("img", { src: VISION.media[frame.src], alt: "" }),
          h("span", { class: "dt-strip-role", text: ROLE_TEXT[frame.role] }),
          h("small", { text: frame.label })
        ]);
      }));
  }

  function renderZoomOverlay(frame) {
    if (!AppState.value.pick.vision.zoomOpen) return null;
    return Overlay.render({
      open: true,
      title: frame.label,
      kicker: "关键帧放大",
      body: [h("div", { class: "dt-zoom" }, [frameFigure(frame, "dt-frame-zoom")])],
      actions: [],
      onCloseAction: "close-zoom",
      key: "vision-zoom",
      wide: true,
      panelClass: "dt-zoom-overlay"
    });
  }

  function renderVisionScreen() {
    var part = AppState.currentPart();
    var frame = currentFrame();

    return AppState.pageShell(
      "视觉模型 / 证据下钻",
      part.label + " · " + frame.label,
      returnButton(),
      h("div", { class: "dt-vision-grid" }, [
        h("section", { class: "panel dt-vision-main" }, [
          AppState.panelTitle("关键帧", "点击图片放大"),
          h("button", {
            type: "button",
            class: "dt-frame-btn",
            "aria-label": "放大查看 " + frame.label,
            dataset: { action: "zoom-frame", focusKey: "zoom" }
          }, [frameFigure(frame)])
        ]),
        h("div", { class: "dt-vision-side" }, [
          h("section", { class: "panel dt-findings" }, [
            AppState.panelTitle("识别项", "置信度 " + frame.confidence.toFixed(2)),
            h("ul", { class: "dt-finding-list" }, frame.findings.map(function (finding) {
              return h("li", { text: finding });
            }))
          ]),
          h("section", { class: "panel dt-strip-panel" }, [
            AppState.panelTitle("帧序列", AppState.framesOf(part.id).length + " 帧"),
            renderFrameStrip(part, frame.id)
          ])
        ])
      ])
    );
  }

  // ---------------------------------------------------------------- 顶层

  function renderDetailScreen() {
    var detail = AppState.value.detail;
    if (detail === "trend") return renderTrendScreen();
    if (detail === "vision") return renderVisionScreen();
    throw new Error("[detailscreen] 未知子屏：" + detail);
  }

  function renderDetailScreenCharts() {
    if (AppState.value.detail !== "trend") return;
    var part = AppState.currentPart();
    var point = currentPoint();
    Charts.draw(MAIN_SLOT, ChartOptions.trend([AppState.seriesOf(point.id)]));
    var sub = AppState.pointsOf(part.id).filter(function (p) { return p.id !== point.id; })[0];
    if (sub) Charts.draw(SUB_SLOT, ChartOptions.spark(AppState.seriesOf(sub.id)));
  }

  // 放大浮层属于视觉子屏，挂到 overlayRoot 由 boot.js 统一渲染。
  function renderDetailOverlays() {
    if (AppState.value.detail !== "vision") return null;
    return renderZoomOverlay(currentFrame());
  }

  window.Scenes = window.Scenes || {};
  window.Scenes.renderDetailScreen = renderDetailScreen;
  window.Scenes.renderDetailScreenCharts = renderDetailScreenCharts;
  window.Scenes.renderDetailOverlays = renderDetailOverlays;
})();
