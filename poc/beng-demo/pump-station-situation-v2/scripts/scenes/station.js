// 唯一场景：window.StationScene（L6 场景层，早于 boot.js，晚于 core/* 与 ui/*）。
//
// 【POC：pump-station-situation-v2】骨架照 poc/inspection-demo/inspection-station-v2 搬
// （回字形四段 + 中间 3D + 底带卡片作下钻入口），内容换成一台输油泵机组。
//
// 【相对旧目录 pump-station-situation 的减法】旧屏 15618 行，一屏里塞了：6 步流程轨、
// 诊断工作台、时序/视觉整屏子屏、知识库、Agent 问答、归档确认。**那些是诊断台那一屏的事**
// （poc/beng-demo/diagnosis-flow）。本屏收窄成一个问题：
//
//     这台机组现在什么状态、哪个测点最差。
//
// 于是屏上只有：4 个大数 / 2 张图 / 1 张机组档案 / 1 张测点明细表 / 6 张部位卡。
//
// 【第二维是测点，不是时间】大屏是 40 台机组的横截面（一个时点）。次屏本该配时间，但真实
// 资料只有两个时点（2025-04-08 现场检测、2026-06-30 在线监测月报），两点连不成趋势，
// 编一条时间序列就是假的。所以第二维取空间：25 个标准测点在机组上的分布。
//
// 本文件只渲染 DOM，不 addEventListener：交互点都带 data-action / data-part，
// 由 boot.js 的事件委托统一接。
(function () {
  "use strict";

  var C = window.Pump3DContract;
  var M = window.PumpMeasure;
  var State = window.PumpState;
  var Ledger = window.PumpLedger;

  var CHART_PART = "chart-part-max";
  var CHART_POINT = "chart-point-bars";
  var STATUS_LABEL = { ok: "正常", warn: "关注", danger: "异常" };

  function assertLoaded() {
    if (!C) throw new Error("[StationScene] window.Pump3DContract 未加载");
    if (!M) throw new Error("[StationScene] window.PumpMeasure 未加载");
    if (!State) throw new Error("[StationScene] window.PumpState 未加载");
    if (!Ledger) throw new Error("[StationScene] window.PumpLedger 未加载");
  }

  function pad2(n) { return n < 10 ? "0" + n : String(n); }

  // =====================================================================
  // 顶栏：左 标记+时钟 / 中 机组名 / 右 检测口径
  // =====================================================================
  function renderTopbar() {
    assertLoaded();
    var s = M.summary();
    var now = new Date();
    return h("header", { class: "topbar panel" }, [
      h("div", { class: "topbar-left" }, [
        h("span", { class: "brand-mark", "aria-hidden": "true", text: "泵" }),
        h("div", { class: "topbar-clock" }, [
          h("strong", { class: "num", text: pad2(now.getHours()) + ":" + pad2(now.getMinutes()) + ":" + pad2(now.getSeconds()) }),
          h("small", { text: s.station + " · " + s.ledger.zoneName })
        ])
      ]),
      h("div", { class: "topbar-title" }, [
        h("h1", { text: s.station + " " + s.tag + " 输油泵机组状态" }),
        h("div", { class: "topbar-title-rule", "aria-hidden": "true" })
      ]),
      h("div", { class: "topbar-right" }, [
        h("div", { class: "st-source" }, [
          h("span", { class: "st-source-line", text: "评价依据 · ISO 10186-3 振动速度有效值 10-1000Hz" }),
          h("span", { class: "st-source-line", text: "测点布置 · GB/T 19873 共 " + s.pointTotal + " 处" }),
          h("span", { class: "st-source-line", text: "现场检测 · " + s.checkedAt + " 压缩机组维检修分公司" })
        ])
      ])
    ]);
  }

  // =====================================================================
  // 上边：4 个大数。**不随选中部位变化**（全机组基准，与底带的部位卡对读）。
  //
  // 四个数互不重复，也不与两张图重复：
  //   机组状态  —— ISO 定级的结论，一个字母说完（口径：全部测点最大值定级）
  //   最大振动  —— 定级依据的那个数，并指出它在哪个测点
  //   越 A 级点 —— 25 个点里有几个越过 2.3（回答"是普遍偏高还是个别点高"）
  //   服役年限  —— 与大屏「达大修节点 27 台」同源的那个维度
  // =====================================================================
  function renderStatBand() {
    assertLoaded();
    var s = M.summary();
    var years = Ledger.serviceYears(s.ledger, new Date(2026, 7, 23));
    return h("section", { class: "panel st-stat-band" }, [
      window.Cards.metric({
        label: "机组状态", value: s.grade.grade, unit: s.grade.label,
        status: s.grade.grade === "A" ? "ok" : (s.grade.grade === "B" ? "warn" : "danger"),
        note: "按全部测点最大值定级"
      }),
      window.Cards.metric({
        label: "最大振动", value: s.max.toFixed(2), unit: "mm/s", status: "warn",
        note: s.worstPoint.name
      }),
      window.Cards.metric({
        label: "越 A 级测点", value: s.overGradeA, unit: "/ " + s.pointTotal,
        status: s.overGradeA > 0 ? "warn" : "ok",
        note: "A 级界 2.3 mm/s"
      }),
      window.Cards.metric({
        label: "服役年限", value: years === null ? "—" : years, unit: "年",
        status: years !== null && years >= 10 ? "warn" : "ok",
        note: "投用 " + (s.ledger.commissionAt || "未填报") + " · 大修节点 10 年"
      })
    ]);
  }

  // =====================================================================
  // 左栏：两张图 + 一张机组档案。**不随选中部位变化**（除了第二张图会压暗非选中部位）。
  //
  // 第三块是档案卡而不是第三张图：厂家/型号/扬程/排量/转速/功率/轴承类型这些是**标识**，
  // 画成图没有意义。它们同时是"这台机器是什么"的交底 —— 路演讲到"AI 凭什么判"时要指的。
  // =====================================================================
  function renderLeftColumn(state) {
    assertLoaded();
    var s = M.summary();
    var active = state.partId ? M.partById(state.partId) : null;
    return h("section", { class: "panel st-left-col" }, [
      window.Cards.chart({
        title: "部位最大振动 vs ISO 阈值",
        meta: s.measuredParts + " / " + s.partTotal + " 个部位有测振点",
        chartId: CHART_PART
      }),
      window.Cards.chart({
        title: "25 个测点全貌",
        meta: active ? "高亮 " + active.name : "序号与右栏明细逐行对应",
        chartId: CHART_POINT
      }),
      h("section", { class: "card st-archive" }, [
        h("div", { class: "st-archive-head" }, [
          h("span", { class: "st-archive-title", text: "机组档案" }),
          h("span", { class: "st-archive-meta", text: "台账 + 检测报告" })
        ]),
        h("div", { class: "st-archive-grid" }, [
          ["泵", s.pump.vendor + " " + s.pump.model],
          ["扬程 / 排量", s.pump.head + " m / " + s.pump.flow + " m³·h⁻¹"],
          ["泵轴承", s.pump.bearing],
          ["电机", s.motor.vendor + " " + s.motor.model],
          ["功率 / 转速", s.motor.kw + " kW / " + s.motor.rpm + " r·min⁻¹"],
          ["电流 / 电压", s.motor.amp + " A / " + s.motor.volt + " V"],
          ["设备分级 / 功能", s.ledger.grade + " 级 · " + s.ledger.role],
          ["振动·温度阈值", s.thresholdFilled ? "已填报" : "台账未填报"]
        ].map(function (row) {
          var isMissing = row[0] === "振动·温度阈值" && !s.thresholdFilled;
          return h("div", { class: "st-archive-item" }, [
            h("span", { text: row[0] }),
            h("strong", { class: isMissing ? "danger" : "", text: row[1] })
          ]);
        }))
      ])
    ]);
  }

  // =====================================================================
  // 右栏：测点明细表，跟随选中部位。未选中 = 全部 25 行，选中 = 该部位那几行。
  // 这是屏上唯一跟着下钻换内容的面板（另外两处变化是 3D 高亮和第二张图的压暗）。
  //
  // 序号列不是装饰：它与左栏第二张图的 x 轴一一对应，在图上看到第 17 根最高，
  // 在这里就能直接找到第 17 行是「泵驱动端垂直」。
  // =====================================================================
  function renderRightColumn(state) {
    assertLoaded();
    var active = state.partId ? M.partById(state.partId) : null;
    var rows = state.partId ? M.pointsByPart(state.partId) : M.points();
    var findings = M.findings().filter(function (f) {
      return !state.partId || f.partIds.indexOf(state.partId) >= 0;
    });

    // 【13 行以上排两列】全机组 25 行单列要 1437px，而这一格只有 598px，会变成滚动条 ——
    // 路演大屏不该要人去滚。两列 13+12，每列 ~265px 装得下「序号/测点/数值/分级」四段。
    // 选中某个部位之后只剩 3~12 行，单列更好读（名字不被省略号截断），所以按行数切。
    var twoCols = rows.length >= 13;
    var table = rows.length
      ? h("div", { class: "st-point-wrap" }, [
          h("div", { class: "st-point-head" }, [
            h("span", { text: "#" }), h("span", { text: "测点" }),
            h("span", { text: "mm/s" }), h("span", { text: "分级" })
          ]),
          h("div", { class: "st-point-table" + (twoCols ? " is-two-cols" : "") },
            rows.map(function (p) {
              var tone = p.value >= 2.3 ? "warn" : "ok";
              return h("div", { class: "st-point-row " + tone, title: p.name }, [
                h("span", { class: "num", text: String(p.index) }),
                h("span", { class: "st-point-name", text: p.name }),
                h("strong", { class: "num", text: p.value.toFixed(2) }),
                h("span", { class: "badge " + tone, text: p.grade.grade })
              ]);
            }))
        ])
      // 联轴器 / 机械密封点进来是这一支：不是空白，要写清为什么没有行。
      : h("div", { class: "st-point-empty" }, [
          h("strong", { text: active ? active.name + " 没有测振点" : "无测点" }),
          h("p", { text: active ? active.reason : "" }),
          h("p", { class: "muted", text: active && active.findingCount
            ? "报告仍然对它下了结论 —— 靠相位差与频谱推断，见下方。这类部位最需要人到现场确认。"
            : "它的状态本该靠温度与泄漏检测，而台账里机械密封温度阈值未填报（见左栏机组档案）。" })
        ]);

    return h("section", { class: "panel st-right-col" }, [
      h("section", { class: "card st-point-card" }, [
        h("div", { class: "st-archive-head" }, [
          h("span", { class: "st-archive-title", text: active ? active.name + " · 测点明细" : "测点明细 · 全机组" }),
          h("span", { class: "st-archive-meta",
            text: state.partId ? rows.length + " / " + M.points().length + " 点 · 点部位卡切换"
                               : M.points().length + " 点 · 点部位卡下钻" })
        ]),
        h("div", { class: "st-point-body scroll" }, [table])
      ]),
      h("section", { class: "card st-finding-card" }, [
        h("div", { class: "st-archive-head" }, [
          h("span", { class: "st-archive-title", text: "报告诊断结论" }),
          h("span", { class: "st-archive-meta",
            text: state.partId ? "命中 " + findings.length + " / " + M.findings().length + " 条" : "共 " + findings.length + " 条，原文" })
        ]),
        h("div", { class: "st-finding-list" }, findings.length
          ? findings.map(function (f) {
              return h("div", { class: "st-finding-row" }, [
                h("span", { class: "st-finding-no num", text: String(f.index) }),
                h("div", { class: "st-finding-text" }, [
                  h("p", { text: f.text }),
                  h("div", { class: "st-finding-parts" }, f.partIds.map(function (id) {
                    return h("span", { text: M.partById(id).name });
                  }))
                ])
              ]);
            })
          : [h("div", { class: "st-point-empty" }, [h("strong", { text: "该部位没有被报告结论指名" })])])
      ])
    ]);
  }

  // =====================================================================
  // 中间：3D 泵机组。6 个部位热点，颜色按部位状态。
  //
  // 热点标签必须恰好 6 个、id 集合等于 Pump3DContract.PART_IDS，且都落在
  // .pump3d-labels 容器内 —— assertDom 对这三件事都会抛错。
  // =====================================================================
  function renderMapPanel(state) {
    assertLoaded();
    var parts = M.parts();
    var pins = parts.map(function (p) {
      var isActive = p.id === state.partId;
      var attrs = {
        type: "button",
        // no-signal = 无测振点**且**没有结论指名。它和 status:"ok" 长得不能一样 ——
        // 绿点在说"测过了，正常"，而实情是"没测"。CSS 把这一档的圆点做成空心灰。
        // 联轴器同样无测振点，但报告对它下了结论，status 是 danger，不进这一档。
        class: "part-pin " + p.status + (isActive ? " active" : "")
          + (p.hasData ? "" : " no-data") + (!p.hasData && !p.findingCount ? " no-signal" : ""),
        "aria-pressed": isActive ? "true" : "false",
        title: p.name + " · " + STATUS_LABEL[p.status] + " · " + p.reason
      };
      attrs[C.PIN_ATTR] = p.id;
      // 结构必须是 .part-pin > .pin-core + .pin-label —— 那是
      // ../pump-station-situation/styles/05-pump3d.css 定的契约（禁改区）：
      // .pin-core 是那个圆点（三色 + active 放大 + danger 呼吸），.pin-label 是文字牌。
      // 换成别的类名，圆点和状态色会整块失效且不报错。
      return h("button", attrs, [
        h("span", { class: "pin-core", "aria-hidden": "true" }),
        h("span", { class: "pin-label" }, [
          h("strong", { text: p.short }),
          h("small", { class: "num",
            text: p.hasData ? p.max.toFixed(2) + " " + p.grade.grade : "无测点" })
        ])
      ]);
    });

    // 宿主类名同样是契约：.pump-train 给 position/overflow/底色，.pump-train-3d 给
    // touch-action 与 grab 光标（engine 拖拽时往它上面加 .dragging）。canvas 是
    // position: absolute; inset: 0，少了 .pump-train 的 position: relative 就会飞出去。
    var hostAttrs = {
      class: "pump-train pump-train-3d", role: "group",
      "aria-label": "输油泵机组三维模型，含 " + parts.length + " 个部位热点"
    };
    hostAttrs[C.HOST_ATTR] = "1";

    var s = M.summary();
    return h("section", { class: "st-map-panel" }, [
      h("div", hostAttrs, [
        h("div", { class: "st-map-place" }, [
          h("h3", { text: state.partId ? M.partById(state.partId).name : "机组总览" }),
          h("small", { text: state.partId
            ? M.partById(state.partId).reason
            : s.pump.model + " · " + s.pump.vendor })
        ]),
        h("div", { class: C.LABELS_CLASS }, pins),
        h("div", { class: "st-legend" }, [
          h("span", { class: "st-legend-item" }, [h("i", { class: "dot ok" }), "A 优"]),
          h("span", { class: "st-legend-item" }, [h("i", { class: "dot warn" }), "B 良"]),
          h("span", { class: "st-legend-item" }, [h("i", { class: "dot danger" }), "需现场确认"]),
          h("span", { class: "st-legend-item muted", text: "虚框 = 无测振点" })
        ]),
        h("div", { class: "st-zoom" }, [
          state.partId == null ? null : h("button", {
            type: "button", class: "st-zoom-btn st-zoom-back", "data-action": "clear-part",
            "aria-label": "返回机组总览", title: "返回机组总览（Esc）", text: "‹"
          }),
          h("button", { type: "button", class: "st-zoom-btn", "data-action": "reset-view",
            "aria-label": "重置视角", title: "重置视角", text: "⟲" })
        ])
      ])
    ]);
  }

  // =====================================================================
  // 下边：6 张部位卡（下钻入口）。
  //
  // 不能复用 [data-part] —— assertDom 要求该属性在 .pump3d-labels 内恰好 6 个，
  // 落在外面就变成 12 个、直接抛错。所以用 data-action="select-part"。
  //
  // 主数字是**部位内最大振动值**（这一带回答"哪个部位最差"），测点数进副行 ——
  // 两者不同类，不能加成一个数。无测点的两个部位主数字位写「—」而不是 0。
  // =====================================================================
  function renderPartBand(state) {
    assertLoaded();
    return h("section", { class: "panel st-part-band", "aria-label": "6 个部位" },
      M.parts().map(function (p) {
        var active = state.partId === p.id;
        return h("button", {
          type: "button",
          class: "st-part-card " + p.status + (active ? " is-active" : "")
            + (p.hasData ? "" : " no-data") + (!p.hasData && !p.findingCount ? " no-signal" : ""),
          dataset: { action: "select-part", partId: p.id },
          "aria-pressed": active ? "true" : "false",
          title: p.name + " · " + p.reason
        }, [
          h("div", { class: "st-part-card-head" }, [
            h("span", { class: "st-part-card-name", text: p.name }),
            h("span", { class: "dot " + p.status, "aria-hidden": "true" })
          ]),
          h("div", { class: "st-part-card-value" }, [
            h("strong", { class: "num", text: p.hasData ? p.max.toFixed(2) : "—" }),
            h("span", { text: p.hasData ? "mm/s " + p.grade.grade : "无测振点" })
          ]),
          h("div", { class: "st-part-card-sub num",
            text: p.pointCount + " 点" + (p.findingCount ? " · 结论 " + p.findingCount : "") })
        ]);
      }));
  }

  // 两张图每一轮都画，没有状态分支 —— Charts.draw 对没有先 slot 的 id 会抛错，
  // 所以「渲染了哪几张」必须和「draw 了哪几张」严格相等，这里恒等于 2。
  function renderCharts(state) {
    window.Charts.draw(CHART_PART, window.ChartOptions.partMaxBars());
    window.Charts.draw(CHART_POINT, window.ChartOptions.pointBars(state.partId));
  }

  window.StationScene = {
    renderTopbar: renderTopbar,
    renderStatBand: renderStatBand,
    renderLeftColumn: renderLeftColumn,
    renderMapPanel: renderMapPanel,
    renderRightColumn: renderRightColumn,
    renderPartBand: renderPartBand,
    renderCharts: renderCharts
  };
})();
