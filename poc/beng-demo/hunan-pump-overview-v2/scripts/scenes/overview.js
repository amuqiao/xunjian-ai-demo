// 唯一场景：window.OverviewScene（L6 场景层，早于 boot.js，晚于 core/* 与 ui/*）。
//
// 【POC：hunan-pump-overview-v2】回字形骨架照 poc/inspection-demo/hunan-overview-v2 搬，
// 内容全部换成泵。相对旧目录 hunan-pump-overview 的核心改动只有一句话：
// **第一维从「站点/管道」换成「机组」**。旧屏 9 个指标里只有 1 个跟泵有关
// （站点总数/管道总数/问题合计/站点构成/作业区排名/压力剖面/作业区状态分布/各段日输量/
// 泵站健康排名），而且它在数 44 个成品油节点 —— 站场 11 + 阀室 33，阀室里没有泵，
// 屏上 3/4 的点跟泵课题无关。
//
// 【删掉了日期范围选择器】旧屏顶栏右边有「近7天/近30天/本月/自定义」四个按钮。泵这边
// 的数据是三份**快照**：台账（填报态）、2026-06 在线监测（月报）、24 个月故障统计
// （固定区间）。放一个日期控件会假装它们能跟着变，实际不会。改成一枚数据口径 chip，
// 把三份资料的名字和截止时间写清楚 —— 演示被追问"这数是什么时候的"时直接指给他看。
//
// 本文件只渲染 DOM，不 addEventListener：交互点都带 data-action / data-hunan-zone，
// 由 boot.js 的事件委托统一接。
(function () {
  "use strict";

  var Contract = window.HunanContract;
  var Sites = window.HunanSites;
  var Ledger = window.PumpLedger;
  var Faults = window.PumpFaults;
  var State = window.PumpState;
  var STATUS_LABEL = { ok: "正常", warn: "关注", danger: "异常" };
  // 湖南公司实际的 6 个作业区（来源：湖南公司管道基础资料_20260820102547.xlsx，141 行）。
  // 3D 契约的 ZONE_IDS 有 10 个，多出的 4 个来自旧的全量拓扑表，见 renderMapPanel 注释。
  var HUNAN_ZONE_IDS = ["yueyang", "changsha", "xianglou", "zhuzhou", "hengyang", "yongchen"];

  var CHART_STATION = "chart-station-mix";
  var CHART_YEARS = "chart-service-years";
  var CHART_PARETO = "chart-fault-pareto";
  var CHART_SITE = "chart-fault-site";

  function assertLoaded() {
    if (!Contract) throw new Error("[OverviewScene] window.HunanContract 未加载");
    if (!Sites) throw new Error("[OverviewScene] window.HunanSites 未加载");
    if (!Ledger) throw new Error("[OverviewScene] window.PumpLedger 未加载");
    if (!Faults) throw new Error("[OverviewScene] window.PumpFaults 未加载");
    if (!State) throw new Error("[OverviewScene] window.PumpState 未加载");
  }

  function pad2(n) { return n < 10 ? "0" + n : String(n); }
  function fmtDate(d) {
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  // =====================================================================
  // 顶栏：左 标记+时钟 / 中 标题 / 右 数据口径
  // =====================================================================
  function renderTopbar() {
    assertLoaded();
    var now = new Date();
    var weekday = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][now.getDay()];
    var monitor = State.monitor();
    return h("header", { class: "topbar panel" }, [
      h("div", { class: "topbar-left" }, [
        h("span", { class: "brand-mark", "aria-hidden": "true", text: "泵" }),
        h("div", { class: "topbar-clock" }, [
          h("strong", { class: "num", text: pad2(now.getHours()) + ":" + pad2(now.getMinutes()) + ":" + pad2(now.getSeconds()) }),
          h("small", { class: "num", text: fmtDate(now) + " " + weekday })
        ])
      ]),
      h("div", { class: "topbar-title" }, [
        h("h1", { text: "湖南公司输油泵机组运行监督" }),
        h("div", { class: "topbar-title-rule", "aria-hidden": "true" })
      ]),
      h("div", { class: "topbar-right" }, [
        h("div", { class: "ov-source" }, [
          h("span", { class: "ov-source-line", text: "设备台账 · 主输泵维护保养信息表" }),
          h("span", { class: "ov-source-line", text: "在线监测 · " + monitor.reportNo + " 截至 " + monitor.dataThrough }),
          h("span", { class: "ov-source-line", text: "故障统计 · 近 " + Faults.summary().monthTotal + " 个月 " + Faults.summary().total + " 条" })
        ])
      ])
    ]);
  }

  // =====================================================================
  // 上边：5 个大数。**不随下钻变化**（下钻时全省基准仍在屏上，可与下边作业区卡对读）。
  //
  // 五个数互不重复、也不与四张图里的任何数字重复：
  //   在役机组   —— 盘子多大（给旁边地图一个量级参照）
  //   主输/给油  —— 机队构成，一个数说完
  //   当月故障   —— 最紧急的那个，来自 2026-06 在线监测报告，不是编的
  //   达大修节点 —— 台账表头口径「50000 小时或 10 年」，并把"有大修记录只 4 台"写在 note 里
  //   近24月停机 —— 这一类设备在全集团的代价，右栏帕累托图的总量
  // =====================================================================
  function renderStatBand() {
    assertLoaded();
    var s = Ledger.summary(Sites.asOf());
    var f = Faults.summary();
    var monitor = State.monitor();
    return h("section", { class: "panel ov-stat-band" }, [
      window.Cards.metric({ label: "在役机组", value: s.total, unit: "台", status: "ok",
        note: s.stationTotal + " 个站库 · 全部 A 级设备" }),
      window.Cards.metric({ label: "主输 / 给油", value: s.main + " / " + s.feed, unit: "台", status: "ok",
        note: "长郴管道 32 · 兰郑长 8" }),
      window.Cards.metric({ label: "当月故障", value: monitor.faultUnits.length, unit: "台",
        status: monitor.faultUnits.length > 0 ? "danger" : "ok",
        note: monitor.dataThrough + " 在线监测判定" }),
      window.Cards.metric({ label: "达大修节点", value: s.overhaulDue, unit: "台", status: "warn",
        note: "有大修记录仅 " + s.overhaulLogged + " 台" }),
      window.Cards.metric({ label: "近 24 月停机", value: f.total, unit: "次", status: "warn",
        note: "合计 " + f.hours + " h · 全集团 " + f.companyTotal + " 家公司" })
    ]);
  }

  // =====================================================================
  // 左栏：两张图 + 一块台账质量。**不随下钻变化**。
  //
  // 第三块是「台账完整率」而不是第三张图：它的三个数（阈值缺项 / 投用未填报 / 大修记录）
  // 都是"缺多少"，画成图只会得到三根一样长的柱。而且这块本身是个卖点 ——
  // AI 要先能看出台账没填，才谈得上后面的诊断。这三个数全是真的，不是演示假定。
  // =====================================================================
  function renderLeftColumn() {
    assertLoaded();
    var s = Ledger.summary(Sites.asOf());
    var vendors = Ledger.vendorMix();
    var top = vendors[0];
    return h("section", { class: "panel ov-left-col" }, [
      window.Cards.chart({
        title: "机组构成 · 按站库",
        meta: s.total + " 台 / " + s.stationTotal + " 站库",
        chartId: CHART_STATION
      }),
      window.Cards.chart({
        title: "服役年限分布",
        meta: "大修节点 10 年",
        chartId: CHART_YEARS
      }),
      h("section", { class: "card ov-list-card" }, [
        h("div", { class: "ov-list-card-head" }, [
          h("span", { class: "ov-list-card-title", text: "台账数据质量" }),
          h("span", { class: "ov-list-card-meta", text: "源表填报态，如实显示" })
        ]),
        h("div", { class: "ov-quality-grid" }, [
          h("div", { class: "ov-quality-item" }, [
            h("span", { text: "振动/温度阈值缺项" }),
            h("strong", { class: "num danger", text: s.thresholdMissing + " / " + s.total })
          ]),
          h("div", { class: "ov-quality-item" }, [
            h("span", { text: "投用日期未填报" }),
            h("strong", { class: "num warn", text: s.commissionMissing + " / " + s.total })
          ]),
          h("div", { class: "ov-quality-item" }, [
            h("span", { text: "有大修记录" }),
            h("strong", { class: "num warn", text: s.overhaulLogged + " / " + s.total })
          ]),
          h("div", { class: "ov-quality-item" }, [
            h("span", { text: "主泵厂家集中度" }),
            h("strong", { class: "num", text: top.name + " " + Math.round(top.count / s.total * 100) + "%" })
          ])
        ])
      ])
    ]);
  }

  // =====================================================================
  // 右栏：帕累托 + 故障部位 + 当月故障机组。
  //
  // 第三块是表而不是图：当月只有 2 台故障，画图是两根柱；而这两条的价值全在
  // 「诊断结论」和「维护建议」那两列文字上 —— 那是在线监测报告的原文，是这屏最硬的东西。
  // =====================================================================
  function renderFaultUnitTable() {
    var monitor = State.monitor();
    var rows = monitor.faultUnits.map(function (fu) {
      var p = Ledger.pumpsByStation(fu.station).filter(function (x) { return x.tag === fu.ledgerTag; })[0];
      var years = p ? Ledger.serviceYears(p, Sites.asOf()) : null;
      return h("div", { class: "ov-fault-row" }, [
        h("div", { class: "ov-fault-who" }, [
          h("strong", { text: fu.station + " " + fu.tag }),
          h("small", { text: (p ? p.vendor + " " + p.model : "台账无此编号")
            + (years === null ? "" : " · 服役 " + years + " 年") })
        ]),
        h("div", { class: "ov-fault-what" }, [
          h("span", { class: "badge danger", text: fu.state }),
          h("strong", { text: fu.conclusion })
        ]),
        h("div", { class: "ov-fault-advice", text: fu.advice })
      ]);
    });
    return h("section", { class: "card ov-list-card" }, [
      h("div", { class: "ov-list-card-head" }, [
        h("span", { class: "ov-list-card-title", text: "当月故障机组" }),
        h("span", { class: "ov-list-card-meta", text: monitor.reportNo + " · " + monitor.fleet + " 台在线监测" })
      ]),
      h("div", { class: "ov-fault-list" }, rows)
    ]);
  }

  function renderRightColumn() {
    assertLoaded();
    var f = Faults.summary();
    return h("section", { class: "panel ov-right-col" }, [
      window.Cards.chart({
        title: "故障类别 · 次数与停机时长",
        // ★ 这行 meta 就是这张图要讲的那句话，直接写在标题旁边，不指望观众自己看出来。
        meta: "中位 " + f.medianHours + "h / 均值 " + f.avgHours + "h",
        chartId: CHART_PARETO
      }),
      window.Cards.chart({
        title: "故障部位分布",
        meta: "归因分类，非设备结构树",
        chartId: CHART_SITE
      }),
      renderFaultUnitTable()
    ]);
  }

  // =====================================================================
  // 下边：6 个作业区卡（下钻入口）。
  //
  // 不能复用 [data-hunan-zone] —— contract.js 的 assertPinNamespace() 只允许该属性
  // 出现在 .hunan-labels 内部，落在外面直接抛错。所以用 data-action="select-zone"。
  //
  // 永郴作业区 0 台如实显示：它不是数据缺失，是这个区本来就没有输油泵机组
  // （成品油站场里只有郴州站，台账里没有它的机组填报）。
  // =====================================================================
  function renderZoneBand(state) {
    assertLoaded();
    var zoneStatuses = Sites.zoneStatuses();
    var monitor = State.monitor();
    return h("section", { class: "panel ov-zone-band", "aria-label": "作业区总览" },
      // 6 张卡 = 湖南公司管道基础资料（141 行）里真实存在的 6 个作业区。
      // 永郴 0 台也给一张卡 —— 它在底表里有成品油站场（郴州站），只是台账里没有机组填报，
      // 属于"确实没有"而不是"没这个区"，和地图上那 4 个 is-empty 标签性质不同。
      HUNAN_ZONE_IDS.map(function (zoneId) {
        var pumps = Ledger.pumpsByZone(zoneId);
        var stations = Sites.sitesByZone(zoneId);
        var faultCount = stations.reduce(function (acc, st) {
          return acc + monitor.faultUnits.filter(function (fu) { return fu.station === st.name; }).length;
        }, 0);
        var status = pumps.length === 0 ? "ok" : zoneStatuses[zoneId];
        var active = state.zoneId === zoneId;
        return h("button", {
          type: "button",
          class: "ov-zone-card " + status + (active ? " is-active" : ""),
          "data-action": "select-zone",
          "data-zone-id": zoneId,
          "aria-pressed": active ? "true" : "false",
          title: Contract.ZONE_NAMES[zoneId] + " · " + STATUS_LABEL[status]
        }, [
          h("div", { class: "ov-zone-card-head" }, [
            h("span", { class: "ov-zone-card-name", text: Contract.ZONE_NAMES[zoneId].replace("作业区", "") }),
            h("span", { class: "dot " + status, "aria-hidden": "true" })
          ]),
          h("div", { class: "ov-zone-card-alert" }, [
            h("strong", { class: "num", text: String(pumps.length) }),
            h("span", { text: "台机组" })
          ]),
          h("div", { class: "ov-zone-card-rate num",
            text: pumps.length === 0 ? "无机组" : (stations.length + " 站库 · 故障 " + faultCount) })
        ]);
      }));
  }

  // =====================================================================
  // 中间：3D 地图。无面板边框。
  //
  // 【地图上只有 7 个站库】喂给引擎的 data.sites 是 scripts/data/sites.js 的 7 站库投影，
  // 不是旧目录那 44 个节点。引擎里 showZones = (level === "province")，所以省域态看到
  // 6 个作业区标签，下钻后才出站库标签；站点光柱始终只有 7 根。
  //
  // 标签 LOD：省域全渲染，下钻只渲染当前作业区那一个。必须过滤而不是全渲染 ——
  // engine.js 的 syncLabels 末尾会把标签 clamp 进视口，画外的标签不会消失而是被钉在
  // 屏幕四边，下钻到岳阳时四条边会贴满与当前视图无关的标签。
  // =====================================================================
  function renderMapPanel(state) {
    assertLoaded();
    var zoneStatuses = Sites.zoneStatuses();
    // 【为什么是 10 个而不是 6 个】contract.js 的 assertLabelKeys 在**省域态**要求标签
    // id 集合等于 ZONE_IDS 全集（10 个），少一个直接抛错。而 10 这个数来自旧的全量拓扑
    // 表（天然气 + 成品油），湖南公司管道基础资料（141 行）里实际只有 6 个作业区 ——
    // 湘北 / 湘中 / 郴州 / 湘西 这 4 个在新底表里根本不出现，台账里当然也 0 台机组。
    // 所以这 4 个标签照渲染（满足契约）但标成「无机组」+ is-empty，读者一眼看出不在盘子里。
    // 下边的作业区带只放 6 张卡 —— 那里是下钻入口，给 0 台的区放入口是骗人。
    var visibleZoneIds = state.zoneId == null ? Contract.ZONE_IDS : [state.zoneId];
    var zoneLabels = visibleZoneIds.map(function (zoneId) {
      var pumps = Ledger.pumpsByZone(zoneId);
      var empty = pumps.length === 0;
      var status = empty ? "ok" : zoneStatuses[zoneId];
      return h("button", {
        type: "button",
        class: status + (empty ? " is-empty" : ""),
        "data-hunan-zone": zoneId,
        title: Contract.ZONE_NAMES[zoneId] + (empty ? " · 无输油泵机组" : " · " + STATUS_LABEL[status])
      }, [
        h("span", { class: "zone-pin-name", text: Contract.ZONE_NAMES[zoneId].replace("作业区", "") }),
        h("span", { class: "zone-pin-count num", text: empty ? "无机组" : pumps.length + " 台" })
      ]);
    });

    var stationCount = state.zoneId == null
      ? Sites.sites().length
      : Sites.sitesByZone(state.zoneId).length;
    var pumpCount = state.zoneId == null
      ? Ledger.pumps().length
      : Ledger.pumpsByZone(state.zoneId).length;

    return h("section", { class: "ov-map-panel" }, [
      h("div", { class: "hunan-map", "data-hunan-host": "1" }, [
        h("div", { class: "ov-map-place" }, [
          h("h3", { text: state.zoneId == null ? "湖南省全域" : Contract.ZONE_NAMES[state.zoneId] }),
          h("small", { text: stationCount + " 个站库 · " + pumpCount + " 台机组" })
        ]),
        h("div", { class: "hunan-labels" }, zoneLabels),
        h("div", { class: "ov-legend" }, [
          h("span", { class: "ov-legend-item" }, [h("i", { class: "dot ok" }), "正常"]),
          h("span", { class: "ov-legend-item" }, [h("i", { class: "dot warn" }), "关注"]),
          h("span", { class: "ov-legend-item" }, [h("i", { class: "dot danger" }), "有故障机组"])
        ]),
        h("div", { class: "ov-zoom" }, [
          state.zoneId == null ? null : h("button", {
            type: "button", class: "ov-zoom-btn ov-zoom-back", "data-action": "back-to-overview",
            "aria-label": "返回全省", title: "返回全省", text: "‹"
          }),
          h("button", { type: "button", class: "ov-zoom-btn", "data-action": "map-zoom-in", "aria-label": "放大", title: "放大", text: "+" }),
          h("button", { type: "button", class: "ov-zoom-btn", "data-action": "map-zoom-out", "aria-label": "缩小", title: "缩小", text: "−" }),
          h("button", { type: "button", class: "ov-zoom-btn ov-zoom-reset", "data-action": "reset-view", "aria-label": "重置视角", title: "重置视角", text: "⟲" })
        ])
      ])
    ]);
  }

  // 四张图每一轮都画，没有状态分支 —— Charts.draw 对没有先 slot 的 id 会抛错，
  // 所以「渲染了哪几张」必须和「draw 了哪几张」严格相等，这里恒等于 4。
  function renderCharts() {
    window.Charts.draw(CHART_STATION, window.ChartOptions.stationPumpMix());
    window.Charts.draw(CHART_YEARS, window.ChartOptions.serviceYears());
    window.Charts.draw(CHART_PARETO, window.ChartOptions.faultPareto());
    window.Charts.draw(CHART_SITE, window.ChartOptions.faultSiteRows());
  }

  window.OverviewScene = {
    renderTopbar: renderTopbar,
    renderStatBand: renderStatBand,
    renderLeftColumn: renderLeftColumn,
    renderMapPanel: renderMapPanel,
    renderRightColumn: renderRightColumn,
    renderZoneBand: renderZoneBand,
    renderCharts: renderCharts,
    chartIds: [CHART_STATION, CHART_YEARS, CHART_PARETO, CHART_SITE]
  };
})();
