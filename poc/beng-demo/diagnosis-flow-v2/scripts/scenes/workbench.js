// 场景 ①：诊断工作台。回答「这条异常，AI 凭什么这么判」。
//
// 三栏从左到右就是推理方向：诊断记录 → AI 判断 → 证据。
//
// 【泵课题相对参照物多两处，都是被专家追问出来的】
//   · AI 判断卡里**同时显示主诊断与备选诊断**。assets/诊断工作台/泵课题Q&A.docx 的 Q2
//     就是「你到底是确诊还是猜谜」—— 只给一个置信度就是在回避这个问题。主 83% / 备选 61%
//     并列摆着，读者自己判断这是排序还是确诊。
//   · 置信度条下面挂一行「点开看加权明细」的指引。Q1 追问「这数字怎么算出来的，别编个
//     数据糊弄我」，答案在依据链那枚「历史案例 Top-4」芯片里（四项加权相乘 ≈ 0.83）。
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
    // aiFlag 三态：danger 重点复核 / warn 待确认 / ok 已闭环。
    // 参照物那边是 conflict/gap（冲突/缺项），泵这边的语义不同 —— 一条振动异常不是
    // "AI 与人工冲突"，而是"这条要不要停机"，所以按严重度分而不按分歧类型分。
    var conflict = rows.filter(function (r) { return r.aiFlag === "danger"; }).length;
    var gap = rows.filter(function (r) { return r.aiFlag === "warn"; }).length;
    return h("div", { class: "stat-row" }, [
      h("div", { class: "stat" }, [
        h("span", { text: "本轮记录" }),
        h("strong", { class: "num", text: String(rows.length) })
      ]),
      h("div", { class: "stat " + (conflict ? "danger" : "ok") }, [
        h("span", { text: "重点复核" }),
        h("strong", { class: "num", text: String(conflict) })
      ]),
      h("div", { class: "stat " + (gap ? "warn" : "ok") }, [
        h("span", { text: "待确认" }),
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
        h("span", { class: "card-title", text: "诊断记录" }),
        h("span", { class: "card-sub", text: "共 " + rows.length + " 条 · 点行切换" })
      ]),
      h("div", { class: "card-body scroll", dataset: { scrollKey: "wb-records" } }, [
        h("table", { class: "dx-table", "aria-label": "诊断记录" }, [
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

  // 记录的判定口径。有数值型测点（series 依据）时取测点的 standardText，
  // 否则取第一枚 rule 依据的标签 —— REC-2 是对中实测、REC-3 是台账缺项，
  // 它们的"口径"不是一个阈值而是一条规则。
  function standardOf(record) {
    var STATION = need("DOMAIN_STATION");
    var RECORDS = need("DOMAIN_RECORDS");
    var series = record.evidence.filter(function (e) { return e.kind === "series"; })[0];
    if (series) return STATION.pointById(series.pointId).standardText;
    var rule = record.evidence.filter(function (e) { return e.kind === "rule"; })[0];
    if (rule) return RECORDS.ruleById(rule.ruleId).label;
    return "—";
  }

  // ---------------------------------------------------------------- 第二栏：AI 判断

  // 依据链芯片。左侧小方标注证据形态，让"这条依据是什么"在点之前就能看出来。
  // locked 的那枚（二次命中包袱）归档前 disabled + 虚线边框。
  // 六种证据形态的角标。alignment 用「测」而不是「比」—— 它比的是仪器读数，
  // 不是两张图；plan 用「处」= 处置建议。
  var KIND_MARK = {
    series: "时", alignment: "测", case: "案", plan: "处", vision: "视", rule: "规"
  };

  // 依据链按推理阶段分段。四段小标题就是 assets/诊断工作台/泵课题Q&A.docx 的故事线四步
  // （时序引擎 → 视觉与实测 → 检索与判定 → 应用层）—— 讲解时可以逐段往下指。
  //
  // 没有 stage 的记录（REC-2 / REC-3）走不分段的平铺分支：它们的依据只有 2~4 枚、
  // 也不构成一条推理链，硬套四段标题会出现三个空段。
  function renderChain() {
    var AppState = need("AppState");
    var RECORDS = need("DOMAIN_RECORDS");
    var list = AppState.evidenceList();
    var staged = list.every(function (ev) { return !!ev.stage; });
    if (!staged) return h("div", { class: "wb-chain" }, list.map(chainChip));

    var groups = [];
    RECORDS.stages.forEach(function (st) {
      var items = list.filter(function (ev) { return ev.stage === st.id; });
      if (!items.length) return;
      groups.push(h("div", { class: "wb-stage" }, [
        h("div", { class: "wb-stage-head" }, [
          h("span", { class: "wb-stage-label", text: st.label }),
          h("span", { class: "wb-stage-note", text: st.note })
        ]),
        h("div", { class: "wb-chain" }, items.map(chainChip))
      ]));
    });
    return h("div", { class: "wb-stages" }, groups);
  }

  // 一枚依据芯片。原先内联在 renderChain 里，分段之后两个分支都要用，抽出来。
  function chainChip(ev) {
    var AppState = need("AppState");
    var state = AppState.value;
    var list = AppState.evidenceList();
    var index = list.indexOf(ev);
    return renderChip(ev, index, state);
  }

  function renderChipList() {
    var AppState = need("AppState");
    var state = AppState.value;
    var list = AppState.evidenceList();

    return h("div", { class: "wb-chain" }, list.map(function (ev, index) {
      return renderChip(ev, index, state);
    }));
  }

  function renderChip(ev, index, state) {
      var AppState = need("AppState");
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
        // 【诊断名在最上面，处置动作在它下面】Q&A 故事线第三步的输出是「疑似 X，置信度 Y%」，
        // 那是这张卡要回答的主问题。第一版最显眼的位置放的是处置动作（"确认异常，转分级处置"），
        // 讲到"生成诊断报告"那一步时屏上指不到诊断名。
        h("div", { class: "wb-verdict-label", text: "AI 诊断" }),
        h("div", { class: "wb-diagnosis" }, [
          h("span", { class: "wb-diagnosis-prefix", text: s.diagnosisPrefix }),
          h("strong", { class: "wb-diagnosis-name", text: s.diagnosis })
        ]),
        h("div", { class: "wb-verdict-action" }, [
          h("span", { class: "muted", text: "建议处置" }),
          h("span", { text: s.label.replace(/^建议结论：/, "") })
        ]),
        h("div", { class: "conf" }, [
          h("div", { class: "conf-head" }, [
            h("span", { text: "置信度" }),
            h("strong", { class: "num", text: s.confidence + "%" })
          ]),
          h("div", { class: "conf-bar" }, [h("i", { style: "width:" + s.confidence + "%" })])
        ]),
        h("div", { class: "wb-verdict-note", text: s.text })
      ]),
      // 备选诊断。只有 REC-1 有（REC-2/REC-3 的 alternative 是 null），没有就整块不渲染 ——
      // 不留一个写着"无"的空卡，那是占位不是信息。
      s.alternative ? h("div", { class: "wb-alt" }, [
        h("div", { class: "wb-alt-head" }, [
          h("span", { class: "wb-alt-label", text: "备选诊断" }),
          h("strong", { class: "num", text: s.alternative.confidence + "%" })
        ]),
        h("div", { class: "wb-alt-text", text: s.alternative.diagnosis }),
        h("div", { class: "wb-alt-note", text: s.alternative.text })
      ]) : null,
      h("div", { class: "kv" }, [
        h("div", { class: "kv-row" }, [h("b", { text: "记录项" }), h("span", { text: record.item })]),
        // record.standard 在泵这边不存在 —— 判定口径挂在测点上（point.standardText），
        // 因为同一条记录可能引用多个口径（ISO 分级 + API 610 + 台账缺项）。
        // 这里显示"判定口径"取决于该记录有没有数值型测点。
        h("div", { class: "kv-row" }, [h("b", { text: "判定口径" }), h("span", { text: standardOf(record) })]),
        h("div", { class: "kv-row" }, [h("b", { text: "现场/系统值" }), h("span", { text: record.result })])
      ]),
      h("div", { class: "card-head" }, [
        h("span", { class: "card-title", text: "依据链" }),
        h("span", { class: "card-sub",
          text: AppState.evidenceList().length + " 条 · 置信度加权在「历史案例」里" })
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
    window.Charts.draw(CHART_MAIN, window.ChartOptions.vibrationTrend(ev.pointId, state.range, {}));
    if (state.zoomOpen) {
      window.Charts.draw(CHART_ZOOM, window.ChartOptions.vibrationTrend(ev.pointId, state.range, {}));
    }
  }

  return { render: render, overlays: overlays, drawCharts: drawCharts };
})();
