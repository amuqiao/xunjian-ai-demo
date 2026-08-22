// 场景 ①：诊断工作台。回答「这条异常，AI 凭什么这么判」。
//
// 三栏从左到右就是推理方向：巡检记录 → AI 判断 → 证据。
//
// 【与旧目录最大的区别：AI 判断在主屏上，不在浮层里】
// 旧版首屏只有一张 4 行表 + 「共 4 条」，一屏 90% 是空白；AI 结论、置信度、依据链
// 全在浮层里，而且首屏那个浮层是关着的（defaultState 里 workbenchAiListOpen: false），
// 要先点一行才弹；关掉之后没有任何按钮能再打开它（boot.js 有 open-ai-list 这个 action，
// 但场景层没有任何元素触发它 —— 死 action），只能再点一次行。
// 本版：AI 判断是第二栏的常驻内容，证据台是第三栏的常驻内容，点依据链芯片换第三栏。
//
// 本文件只渲染 DOM，不绑事件 —— 交互点带 data-action / data-select-id。
window.SceneWorkbench = (function () {
  "use strict";

  var CHART_MAIN = "ev-series";
  var CHART_ZOOM = "ev-series-zoom";

  function need(name) {
    if (!window[name]) throw new Error("[SceneWorkbench] 需要先加载 " + name);
    return window[name];
  }

  // ---------------------------------------------------------------- 第一栏：概况 + 记录表

  // 本轮概况。三个数全部从记录现算，不手写：条数、AI 标记为"重点复核"的条数、
  // "记录缺项"的条数。它填的是第一栏上方那块空间，同时给记录表一个量级参照。
  function renderOverview() {
    var AppState = need("AppState");
    var RECORDS = need("DOMAIN_RECORDS");
    var state = AppState.value;
    var rows = RECORDS.rowsOf(state.objectId);
    var conflict = rows.filter(function (r) { return r.aiFlag === "conflict"; }).length;
    var gap = rows.filter(function (r) { return r.aiFlag === "gap"; }).length;
    return h("div", { class: "stat-row" }, [
      h("div", { class: "stat" }, [
        h("span", { text: "本轮表单项" }),
        h("strong", { class: "num", text: String(rows.length) })
      ]),
      h("div", { class: "stat " + (conflict ? "danger" : "ok") }, [
        h("span", { text: "重点复核" }),
        h("strong", { class: "num", text: String(conflict) })
      ]),
      h("div", { class: "stat " + (gap ? "warn" : "ok") }, [
        h("span", { text: "记录缺项" }),
        h("strong", { class: "num", text: String(gap) })
      ])
    ]);
  }

  function renderRecords() {
    var AppState = need("AppState");
    var RECORDS = need("DOMAIN_RECORDS");
    var state = AppState.value;
    var rows = RECORDS.rowsOf(state.objectId);
    var cols = RECORDS.columns;

    // 列宽是相对权重，换算成 <col> 百分比 —— 表格恒等于容器宽度，窄容器下各列一起
    // 等比收窄，不会溢出被 overflow 裁掉。
    var total = cols.reduce(function (s, c) { return s + c.width; }, 0);

    return h("section", { class: "card" }, [
      h("div", { class: "card-head" }, [
        h("span", { class: "card-title", text: "巡检记录" }),
        h("span", { class: "card-sub", text: "共 " + rows.length + " 条 · 点行切换" })
      ]),
      h("div", { class: "card-body scroll", dataset: { scrollKey: "wb-records" } }, [
        h("table", { class: "dx-table", "aria-label": "巡检记录" }, [
          h("colgroup", {}, cols.map(function (c) {
            return h("col", { style: "width:" + (c.width / total * 100) + "%" });
          })),
          h("thead", {}, [
            h("tr", {}, cols.map(function (c) {
              return h("th", { scope: "col", class: "dx-th", text: c.label });
            }))
          ]),
          h("tbody", {}, rows.map(function (row) {
            var active = row.id === state.recordId;
            return h("tr", {
              class: "dx-row " + row.aiFlag + (active ? " active" : ""),
              dataset: { select: "record", selectId: row.id },
              tabindex: active ? "0" : "-1",
              "aria-selected": active ? "true" : "false"
            }, cols.map(function (c) {
              if (c.type === "status-dot") {
                return h("td", { class: "dx-td dx-td-dot" }, [
                  h("span", { class: "dx-dot " + row.aiFlag, "aria-label": row.aiFlagText })
                ]);
              }
              if (c.key === "aiFlagText") {
                return h("td", { class: "dx-td" }, [
                  h("span", { class: "dx-flag " + row.aiFlag, text: row.aiFlagText })
                ]);
              }
              return h("td", { class: "dx-td", title: row[c.key], text: row[c.key] });
            }));
          }))
        ])
      ])
    ]);
  }

  // ---------------------------------------------------------------- 第二栏：AI 判断

  // 依据链芯片。左侧小方标注证据形态，让"这条依据是什么"在点之前就能看出来。
  // locked 的那枚（二次命中包袱）归档前 disabled + 虚线边框。
  var KIND_MARK = {
    series: "时", compare: "比", timeline: "程", gaps: "缺", vision: "视", rule: "规", case: "案"
  };

  function renderChain() {
    var AppState = need("AppState");
    var state = AppState.value;
    var list = AppState.evidenceList();

    return h("div", { class: "wb-chain" }, list.map(function (ev, index) {
      var locked = !!ev.locked && !AppState.reuseUnlocked();
      var active = index === state.evidenceIndex;
      return h("button", {
        type: "button",
        class: "chip evidence" + (active ? " active" : ""),
        disabled: locked ? "disabled" : null,
        dataset: { action: "select-evidence", evidenceIndex: String(index) },
        title: locked ? "归档后解锁：AI 只组织证据，结论由专家确认后才能作为案例复用" : ev.detail
      }, [
        h("span", { class: "chip-kind " + ev.kind, text: KIND_MARK[ev.kind] }),
        h("span", { class: "chip-text" }, [
          h("strong", { text: ev.label }),
          h("small", { text: locked ? "归档后解锁" : ev.detail })
        ])
      ]);
    }));
  }

  function renderAi() {
    var AppState = need("AppState");
    var record = AppState.record();
    var part = AppState.part();
    var s = record.suggestion;

    return h("section", { class: "card wb-ai" }, [
      h("div", { class: "card-head" }, [
        h("span", { class: "card-title", text: "AI 判断" }),
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
        h("div", { class: "kv-row" }, [h("b", { text: "判定标准" }), h("span", { text: record.standard })]),
        h("div", { class: "kv-row" }, [h("b", { text: "人工结果" }), h("span", { text: record.result })])
      ]),
      h("div", { class: "card-head" }, [
        h("span", { class: "card-title", text: "依据链" }),
        h("span", { class: "card-sub", text: AppState.evidenceList().length + " 条 · 点开看原始证据" })
      ]),
      renderChain()
    ]);
  }

  // ---------------------------------------------------------------- 场景与浮层

  function render() {
    var AppState = need("AppState");
    var EvidenceView = need("EvidenceView");
    return h("div", { class: "wb-scene" }, [
      h("div", { class: "wb-col wb-left" }, [renderOverview(), renderRecords()]),
      h("div", { class: "wb-col wb-ai-col" }, [renderAi()]),
      h("div", { class: "wb-col" }, [
        EvidenceView.render(AppState.currentEvidence(), { chartId: CHART_MAIN })
      ])
    ]);
  }

  function overlays() {
    var AppState = need("AppState");
    var EvidenceView = need("EvidenceView");
    var Overlay = need("Overlay");
    var state = AppState.value;
    if (!state.zoomOpen) return null;
    var ev = AppState.currentEvidence();
    if (!ev) return null;
    return Overlay.render({
      key: "zoom",
      title: "证据细看",
      sub: AppState.record().no + " · " + ev.label,
      closeAction: "close-zoom",
      body: EvidenceView.render(ev, { zoom: true, chartId: CHART_ZOOM })
    });
  }

  // boot.js 在 DOM append 之后调用：把本轮要画的图排进队列。
  // 证据台和放大浮层用**不同的 chartId** —— Charts.slot 对同一 id 返回同一个节点，
  // 同一轮里两处都请求同一个 id，后者会把节点从前者身上摘走，前者就空了。
  function drawCharts() {
    var AppState = need("AppState");
    var EvidenceView = need("EvidenceView");
    var state = AppState.value;
    var ev = AppState.currentEvidence();
    if (!EvidenceView.needsChart(ev)) return;
    window.Charts.draw(CHART_MAIN, window.ChartOptions.pressureTrend(ev.pointId, state.range, {}));
    if (state.zoomOpen) {
      window.Charts.draw(CHART_ZOOM, window.ChartOptions.pressureTrend(ev.pointId, state.range, {}));
    }
  }

  return { render: render, overlays: overlays, drawCharts: drawCharts };
})();
