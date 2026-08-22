// 唯一场景：window.StationScene（L6 场景层，早于 boot.js，晚于 core/* 与 ui/*）。
//
// 【POC：inspection-station-v2】原目录 scripts/scenes/map.js（299 行）的布局与文案
// 重排版。2.5D 平面图层、数据层、契约层全部复用原目录原文件，一行未改；变的只有
// 「屏上摆什么、摆在哪、写多少字」，外加一份新增的 AI 数据（scripts/data/ai.js）。
//
// ── 回字形：内容从四边围住平面图（与 hunan-overview-v2 同一套骨架） ──────────
//   上  .st-stat-band   4 个监督指标（本轮值 + 较上轮 Δ）      —— 全站，**下钻时不变**
//   左  .st-left-col    合规率趋势 / 行为异常逐轮 / 用时逐轮    —— 全站，**下钻时不变**
//   中  .st-map-panel   2.5D 平面图（无面板边框）              —— 跟随焦点
//   右  .st-right-col   全景=本轮异常明细 / 下钻=该区巡检项      —— 跟随焦点
//   下  .st-area-band   12 个区域卡                           —— 分区总览 + 第二个下钻入口
//
// 上/左恒为全站是刻意的：点开储油罐区时全站的合规率曲线仍在屏上，可以和右栏该区的
// 明细对读。跟随焦点变的只有三处：平面图高亮、右栏、区域带高亮。
//
// ── 本页的视角是**监督者**，第二个维度是**时间** ───────────────────────────
// 省域大屏是 141 个站点 × 一个时点的横截面，回答「哪个作业区差」。本页只有 1 个站点，
// 横截面只剩一行，所以第二个维度换成时间：同一套指标按巡检轮次排开，回答「这个站最近
// 怎么样、在变好还是变差」。同一个指标在两屏换的是轴，不是 scope。
//
// 监督者要问的不是「勾打完了吗」（256 项每轮都提交完，提交完成率恒 100%），而是
// 「打完的这些勾里有多少是走过场的」。所以屏上的主线是：
//     合规率（扣掉行为异常判定为无效的项）→ 行为异常逐轮 → 巡检用时逐轮
// 左栏那三张图连起来就是一句话：**越赶越糙**（用时 88 → 63 分钟，行为异常 3 → 12 次）。
//
// 原页面的重心是「巡检员沿平面图走了一圈」（轨迹起点/终点/停留最久的区域）与
// 「12 区完成率」。前者退成平面图上的一条轨迹线 + 图例一项，后者整张图删除 ——
// 那份数据集是已完成巡检的静态结果，完成率恒 100%，画出来是 12 根等长满条。
//
// ── 删掉的内容 ──────────────────────────────────────────────────────────
// 1) 顶栏那张 .task-card：表单名 + 5 个字段 + 一行状态 pill + 一行 tab + 一个大勾。
//    pill 和 tab 都不可点，是照录屏截图复刻的装饰。压成顶栏右侧两行 + 一个徽标，
//    完整的「计划 → 实际」时间戳进 title。
// 2) 底部 6 步「巡检闭环流程」轨（.flow-rail）：回字形的底边给了 12 个区域卡，
//    一屏不该有两条并列的横向导航。
// 3) 右栏那张「区域详情卡」（DetailCard）：metrics 三格与 tags 三条分别落到右栏卡头的
//    meta 与底部区域卡上，conclusion 与「现场记录」整段散文删除。
// 4) 全景态右栏那张「全站 12 个区域态势」evidence 卡：一句「共 256 项已全部提交，
//    AI 复检发现 3 处需要关注。点击地图热点或左侧列表查看单区详情。」—— 前半句的数字
//    已经在上边指标带上，后半句是操作说明。
// 5) 地图头 .station-map-head（kicker「站点平面图 / 区域态势」+ h3 + 7 项图例）与
//    .map-submit-banner（「巡检区域提交情况 12 / 12」，恒成立的废话）。位置改由浮在
//    平面图左上角的 .st-map-place 表达，图例砍到 4 项浮在左下角。
// 6) ActionBar（地图底部那条悬浮状态栏）与 InspectorPicker（添加巡检人弹层）：
//    前者的状态语与顶栏右侧重复，后者不属于 AI 主题。
//
// 本文件只渲染 DOM，不 addEventListener：交互点天然带 data-action / data-map3d-area /
// data-item-id，由 boot.js 的 bindStage() 统一做事件委托。
(function () {
  "use strict";

  var DATA = window.DemoData;
  var Q = window.StationQuality;
  var C = window.Map3DContract;

  // 图表 id：与 renderCharts() 里 Charts.draw() 的第一个参数一一对应。
  // Charts.draw 对未先 slot 的 id 直接抛错，所以「渲染了哪几张」必须和「draw 了哪几张」
  // 严格相等；本页恒等于 3，不随 focus 变化。
  var CHART_COMPLIANCE = "chart-compliance-trend";
  var CHART_BEHAVIOR = "chart-behavior-by-round";
  var CHART_MINUTES = "chart-minutes-trend";

  function assertLoaded() {
    if (!DATA) throw new Error("[StationScene] window.DemoData 未加载");
    if (!Q) throw new Error("[StationScene] window.StationQuality 未加载");
    if (!C) throw new Error("[StationScene] window.Map3DContract 未加载");
    if (!window.Cards) throw new Error("[StationScene] window.Cards 未加载");
    if (!window.ItemList) throw new Error("[StationScene] window.ItemList 未加载");
  }

  // =====================================================================
  // 顶栏：三列（左 站名 / 中 居中标题 / 右 巡检人+时段+徽标），高度 62px。
  // DOM 契约见 styles/02-shell.css 文件头。
  // =====================================================================

  // 「09:02 → 10:05」这种短格式：从 "2026-08-04 09:02:25" 里取 HH:MM。
  // 完整时间戳不上屏，进 title —— 屏上要的是「这一轮花了多久」，不是秒级精度。
  function hhmm(stamp) {
    var match = /(\d{2}):(\d{2})/.exec(stamp);
    if (!match) throw new Error("[StationScene] 无法从时间戳里取出 HH:MM：" + stamp);
    return match[1] + ":" + match[2];
  }

  function renderTopbar() {
    assertLoaded();
    var meta = DATA.meta();
    var t = DATA.task();
    var track = DATA.track();
    var badgeStatus = t.overdueBadge === "已超期" ? "danger" : "ok";
    return h("header", { class: "topbar panel" }, [
      h("div", { class: "topbar-left" }, [
        h("span", { class: "brand-mark", "aria-hidden": "true", text: "巡" }),
        h("div", { class: "topbar-site" }, [
          h("strong", { text: meta.shortName }),
          h("small", { text: "长郴管道 · " + meta.areaTotal + " 个巡检区域 · " + meta.itemTotal + " 项" }),
        ]),
      ]),
      h("div", { class: "topbar-title" }, [
        h("h1", { text: "站场巡检质量监督" }),
        h("div", { class: "topbar-title-rule", "aria-hidden": "true" }),
      ]),
      h("div", { class: "topbar-right" }, [
        h("div", {
          class: "topbar-task",
          title: "计划 " + t.planStart + " → " + t.planEnd + "\n实际 " + t.actualStart + " → " + t.actualEnd,
        }, [
          h("strong", { class: "num", text: hhmm(t.actualStart) + " → " + hhmm(t.actualEnd) }),
          h("small", { text: "巡检人 " + t.inspector + " · " + track.durationMin + " 分钟" }),
        ]),
        h("span", { class: "badge " + badgeStatus, text: t.overdueBadge }),
      ]),
    ]);
  }

  // =====================================================================
  // 上边：4 个监督指标（Cards.metric，**每个都传 note**）。**不随下钻变化**。
  //
  // 这里传 note 是刻意的，和 hunan-overview-v2 那边「一律不传 note」相反：监督者视角下
  // 副行承载的是「较上轮怎么变」与「构成」，那不是冗余，正是这一屏比一个静态数字多出来
  // 的信息。省域大屏没有时间维，所以那边的 note 只能写重复的绝对值，才要删。
  //
  // 四个数与你要的那份清单一一对应，且**每个数只出现一次**：
  //   当前风险 P1（2 项待处置）      —— riskLevel / currentRisk
  //   计划巡检 256 项（已提交 256）  —— planned / submitted
  //   行为异常 12 次（较上轮 −1）    —— duration+interval+offWindow，逐类构成在左②
  //   发现问题 3 项（P1 2 · AI 提醒 6）—— issues / p1 / aiAlerts
  // 合规率不在这里 —— 它是左①那条曲线的主角，标题 meta 里给本轮值。
  // =====================================================================

  function signed(delta) {
    if (delta > 0) return "+" + delta;
    return String(delta);
  }

  function renderStatBand() {
    assertLoaded();
    var c = Q.current();
    var prev = Q.previous();
    return h("section", { class: "panel st-stat-band" }, [
      window.Cards.metric({
        label: "当前风险", value: c.riskLevel, status: c.p1 > 0 ? "danger" : (c.issues > 0 ? "warn" : "ok"),
        note: c.p1 + " 项待处置",
      }),
      window.Cards.metric({
        label: "计划巡检", value: c.planned, unit: "项", status: "ok",
        note: "已提交 " + c.submitted + " 项",
      }),
      window.Cards.metric({
        label: "行为异常", value: c.invalid, unit: "次",
        status: c.invalid > prev.invalid ? "danger" : (c.invalid > 0 ? "warn" : "ok"),
        note: "较上轮 " + signed(c.invalid - prev.invalid) + " 次",
      }),
      window.Cards.metric({
        label: "发现问题", value: c.issues, unit: "项",
        status: c.p1 > 0 ? "danger" : (c.issues > 0 ? "warn" : "ok"),
        note: "P1 " + c.p1 + " 项 · AI 提醒 " + c.aiAlerts + " 条",
      }),
    ]);
  }

  // =====================================================================
  // 左边：三张以轮次为横轴的图。**不随下钻变化**，一律全站口径。
  // 三张连起来读就是这一屏的结论：合规率在降、行为异常在涨、用时在被压短。
  // =====================================================================

  function renderLeftColumn() {
    assertLoaded();
    var c = Q.current();
    var rounds = Q.rounds();
    return h("section", { class: "panel st-left-col" }, [
      window.Cards.chart({
        title: "合规率 · 近 " + rounds.length + " 轮",
        meta: "本轮 " + c.complianceRate + "%",
        chartId: CHART_COMPLIANCE,
      }),
      window.Cards.chart({
        title: "行为异常 · 逐轮",
        meta: "本轮 " + c.invalid + " 次",
        chartId: CHART_BEHAVIOR,
      }),
      window.Cards.chart({
        title: "巡检用时 · 逐轮",
        meta: "本轮 " + c.minutes + " 分钟 · " + c.secondsPerItem + " 秒/项",
        chartId: CHART_MINUTES,
      }),
    ]);
  }

  // =====================================================================
  // 右边：整格一块，内容随焦点切换。
  //   全景态：本轮异常明细（18 条 = 12 条行为异常 + 6 条 AI 提醒），每条挂真实巡检项
  //   下钻态：该区巡检项列表（ItemList，7–67 行，标准与实测逐项可查）
  // 渐进披露：先看这一轮哪些项被判了、判的什么，点进某个区再看该区的全部项。
  // 两种状态都恰好 1 块，容器数不变、布局不跳。
  // =====================================================================

  // 列宽是相对权重，renderDetailTable 换算成 <col> 的百分比。这组数是实测调的：
  // 「区域」最长 6 个字（35KV变电所），少于 20 会被截成「35KV变…」；「判定」固定 4 个字；
  // 「实测」最长 4 个字（时序模型）或「偏移 41 分钟」；富余全部给「巡检项」，它是唯一
  // 长度不可控的一列（点位 + 项名），整格有 title 兜住全文。
  var DETAIL_COLUMNS = [
    { key: "areaName", label: "区域", width: 20 },
    { key: "kindLabel", label: "判定", width: 16 },
    { key: "item", label: "巡检项", width: 42 },
    { key: "actual", label: "实测", width: 22 },
  ];

  // 排序：按 KINDS 的书写顺序（时长 → 间隔 → 时段 → AI 提醒），同类内按区域名。
  // 三类行为异常排在 AI 提醒之前 —— 前者要追责到人，是监督者先看的。
  function detailRank(kind) {
    var index = 0;
    Q.KINDS.forEach(function (k, i) { if (k.key === kind) index = i; });
    return index;
  }

  function sortDetails(a, b) {
    if (a.kind !== b.kind) return detailRank(a.kind) - detailRank(b.kind);
    if (a.areaName !== b.areaName) return a.areaName < b.areaName ? -1 : 1;
    return a.itemId < b.itemId ? -1 : 1;
  }

  // 三类行为异常共用 warn 的语义色，AI 提醒用 cyan —— 与 data/quality.js 的 KINDS.tone
  // 同源（那里是唯一真源），也与左②那张堆叠柱「只堆行为异常、不含 AI 提醒」一致。
  function kindClass(kind) {
    return kind === "aiAlerts" ? "ai" : "behavior";
  }

  function renderDetailTable(rows) {
    var total = DETAIL_COLUMNS.reduce(function (sum, col) { return sum + col.width; }, 0);
    return h("table", { class: "st-table" }, [
      h("colgroup", {}, DETAIL_COLUMNS.map(function (col) {
        return h("col", { style: "width:" + (col.width / total * 100) + "%" });
      })),
      h("thead", {}, [
        h("tr", {}, DETAIL_COLUMNS.map(function (col) {
          return h("th", { scope: "col", class: "st-table-th", text: col.label });
        })),
      ]),
      h("tbody", {}, rows.map(function (row) {
        return h("tr", {}, DETAIL_COLUMNS.map(function (col) {
          // 判定列：类别名带色，判定规则（阈值口径）进 title —— 阈值说明不上屏，
          // 悬停可见。18 行每行都印一遍「单项现场停留 < 10 秒」是纯噪声。
          if (col.key === "kindLabel") {
            return h("td", { class: "st-table-td", title: row.rule }, [
              h("span", { class: "st-kind " + kindClass(row.kind), text: row.kindLabel }),
            ]);
          }
          // 巡检项列：点位 + 项名。两段都可能很长，整格 title 给全文。
          if (col.key === "item") {
            return h("td", {
              class: "st-table-td",
              title: row.itemPoint + " / " + row.itemTitle,
              text: row.itemPoint + " · " + row.itemTitle,
            });
          }
          // 实测列：AI 提醒那几条的具体描述在 hint 里（数据层刻意没把它塞进 actual，
          // 否则会挤掉前面两列），挂到 title 上悬停可见。
          if (col.key === "actual") {
            return h("td", { class: "st-table-td", title: row.hint || row.actual, text: row.actual });
          }
          return h("td", { class: "st-table-td", text: row[col.key] });
        }));
      })),
    ]);
  }

  function renderRightColumn(state) {
    assertLoaded();
    var areaId = state.focus.areaId;

    if (areaId == null) {
      var rows = Q.details().sort(sortDetails);
      var c = Q.current();
      return h("section", { class: "panel st-right-col" }, [
        h("section", { class: "st-list-card" }, [
          h("div", { class: "st-list-card-head" }, [
            h("span", { class: "st-list-card-title", text: "本轮异常明细" }),
            h("span", {
              class: "st-list-card-meta",
              text: "行为异常 " + c.invalid + " · AI 提醒 " + c.aiAlerts + " · 共 " + rows.length + " 条",
            }),
          ]),
          h("div", { class: "st-list-card-body" }, [renderDetailTable(rows)]),
        ]),
      ]);
    }

    var area = DATA.area(areaId);
    var items = DATA.items(areaId);
    var areaDetails = Q.detailsByArea(areaId);
    return h("section", { class: "panel st-right-col" }, [
      h("section", { class: "st-list-card" }, [
        h("div", { class: "st-list-card-head" }, [
          h("span", { class: "st-list-card-title", text: area.name }),
          h("span", {
            class: "st-list-card-meta",
            text: area.itemTotal + " 项 · 本轮标记 " + areaDetails.length + " 条",
          }),
        ]),
        h("div", { class: "st-list-card-body" }, [
          window.ItemList.render({
            items: items,
            activeItemId: state.pick.itemId,
            ariaLabel: area.name + " 巡检项列表",
          }),
        ]),
      ]),
    ]);
  }

  // =====================================================================
  // 中间：2.5D 平面图。**没有面板边框**（见 styles/06-station-scene.css 第五节）。
  //
  // 本函数不复用 core/dom.js 的 renderStationMap()：那个函数产出的是「.panel 外观 +
  // .station-map-head + .map-submit-banner + 7 项图例」的旧形态，本页要的是无边框 +
  // 浮层。3D 契约本身（.station-map[data-map3d-host] / .map3d-labels /
  // button.area-pin[data-map3d-area] / .map-zoom）逐字保留，styles/05-map3d.css
  // 原样复用。
  //
  // ⚠️ 12 个区域热点必须**全部渲染、且严格按 AREA_IDS 顺序**：contract.js 的
  // assertLabelKeys() 走 assertIdSet()，同时比键集合与顺序。这里和 hunan-overview-v2
  // 不同 —— 那边下钻时只渲染当前作业区一个标签（那份契约在 zone 级放行子集），
  // 本页没有这个豁免，少一个或换个顺序就直接抛错。
  // =====================================================================

  function renderMapPanel(state) {
    assertLoaded();
    var areaId = state.focus.areaId;
    var statuses = DATA.statuses();
    var areasById = {};
    DATA.areas().forEach(function (a) { areasById[a.id] = a; });

    var pins = C.AREA_IDS.map(function (id) {
      var area = areasById[id];
      var isActive = id === areaId;
      var pinAttrs = {
        type: "button",
        class: "area-pin " + area.status + (isActive ? " active" : ""),
        "aria-pressed": isActive ? "true" : "false",
        title: area.name + " · " + area.itemTotal + " 项 · 本轮标记 " + Q.detailsByArea(id).length + " 条",
      };
      pinAttrs[C.PIN_ATTR] = id;
      return h("button", pinAttrs, [
        h("span", { class: "area-pin-name", text: area.name }),
        // 原来这里是 done/total（恒为 N/N，零信息），换成本轮被标记的条数 ——
        // 那才是监督者在图上要找的东西。
        h("span", { class: "area-pin-count num", text: Q.detailsByArea(id).length + " 标记" }),
      ]);
    });

    var hostAttrs = {
      class: "station-map",
      role: "group",
      "aria-label": "站场平面图，含 " + C.AREA_IDS.length + " 个区域热点",
    };
    hostAttrs[C.HOST_ATTR] = "1";

    return h("section", { class: "st-map-panel" }, [
      h("div", hostAttrs, [
        h("div", { class: "st-map-place" }, [
          h("h3", { text: areaId == null ? DATA.meta().shortName + " · 站场全景" : areasById[areaId].name }),
          h("small", {
            text: areaId == null
              ? C.AREA_IDS.length + " 个区域 · " + C.TOTAL_ITEMS + " 项 · " + Q.current().minutes + " 分钟走完"
              : areasById[areaId].itemTotal + " 项 · 本轮标记 " + Q.detailsByArea(areaId).length + " 条",
          }),
        ]),
        h("div", { class: C.LABELS_CLASS }, pins),
        // 图例从原来的 7 条砍到 4 条：三色状态 + 巡检轨迹。起点/终点/巡检人/消防通道
        // 那四个图形在缩小后的图上分辨不出来，四行图例换不回任何可读性。
        h("div", { class: "map-legend" }, [
          window.legendDot("danger", "异常"),
          window.legendDot("warn", "关注"),
          window.legendDot("ok", "正常"),
          h("span", { class: "map-legend-item" }, [
            h("i", { class: "map-legend-track", "aria-hidden": "true" }),
            h("span", { text: "巡检轨迹" }),
          ]),
        ]),
        // 视图操作**唯一**的一组：返回全站 / 放大 / 缩小 / 重置视角。全部带 title。
        // 「返回全站」只在下钻态渲染（全景态没有可返回的上一层，不出现、也不做成
        // disabled 占位），所以这一组在两种态下分别是 3 个和 4 个按钮。
        h("div", { class: "map-zoom" }, [
          areaId == null ? null : h("button", {
            type: "button", class: "map-zoom-btn map-zoom-back",
            dataset: { action: "back-to-overview" },
            "aria-label": "返回全站", title: "返回全站", text: "‹",
          }),
          h("button", {
            type: "button", class: "map-zoom-btn", dataset: { action: "map-zoom-in" },
            "aria-label": "放大", title: "放大", text: "+",
          }),
          h("button", {
            type: "button", class: "map-zoom-btn", dataset: { action: "map-zoom-out" },
            "aria-label": "缩小", title: "缩小", text: "−",
          }),
          h("button", {
            type: "button", class: "map-zoom-btn map-zoom-reset", dataset: { action: "reset-view" },
            "aria-label": "重置视角", title: "重置视角", text: "⟲",
          }),
        ]),
      ]),
    ]);
  }

  // =====================================================================
  // 下边：12 个区域卡。分区总览 + 平面图热点之外的第二个下钻入口。
  //
  // ⚠️ 卡片不能用 [data-map3d-area]：contract.js 的 assertPinNamespace() 会遍历全文档
  // 的 [data-map3d-area]/[data-map3d-item]，任何一个落在 .map3d-labels 之外就直接抛错
  // （那两个属性归 3D 热点独占）。所以用 data-action="select-area" + data-area-id。
  //
  // 卡上的状态色取自 DATA.statuses()，与平面图热点同源 —— 同一个区域在图上和在这条带
  // 上必须是同一个颜色，否则会出现「图上红了、下面卡还是绿的」。
  // =====================================================================

  function renderAreaBand(state) {
    assertLoaded();
    var statuses = DATA.statuses();
    return h("section", { class: "panel st-area-band", "aria-label": "12 个巡检区域" },
      DATA.areas().map(function (area) {
        var rows = Q.detailsByArea(area.id);
        // 主数字是**行为异常**条数（这一带回答的是「哪个区在走过场」），AI 提醒进副行 ——
        // 两者管理动作不同类，不能加成一个数。
        var behaviorCount = rows.filter(function (d) { return d.kind !== "aiAlerts"; }).length;
        var aiCount = rows.length - behaviorCount;
        var active = state.focus.areaId === area.id;
        // 卡片的状态色取自 DATA.statuses()，与平面图热点同源 —— 同一个区域在图上和在这条
        // 带上必须是同一个颜色，否则会出现「图上红了、下面卡还是绿的」。
        return h("button", {
          type: "button",
          class: "st-area-card " + statuses[area.id] + (active ? " is-active" : ""),
          dataset: { action: "select-area", areaId: area.id },
          "aria-pressed": active ? "true" : "false",
          title: area.name + " · " + area.itemTotal + " 项 · 行为异常 " + behaviorCount + " 条 · AI 提醒 " + aiCount + " 条",
        }, [
          h("div", { class: "st-area-card-head" }, [
            h("span", { class: "st-area-card-name", text: area.name }),
            h("span", { class: "dot " + statuses[area.id], "aria-hidden": "true" }),
          ]),
          h("div", { class: "st-area-card-alert" }, [
            h("strong", { class: "num", text: String(behaviorCount) }),
            h("span", { text: "行为异常" }),
          ]),
          h("div", { class: "st-area-card-items num", text: area.itemTotal + " 项 · AI " + aiCount }),
        ]);
      }));
  }

  // =====================================================================
  // 图表绘制（boot.js 在 DOM append + mountChartSlots 之后调用）
  //
  // 三张图都在左栏、都是全站口径、每一轮都画，没有状态分支。Charts.draw 对没有先
  // slot 的 id 会直接抛错，所以「渲染了哪几张」必须和「draw 了哪几张」严格相等；
  // 这里恒等于 3，不随 focus.areaId 变化。
  // =====================================================================

  function renderCharts() {
    window.Charts.draw(CHART_COMPLIANCE, window.ChartOptions.complianceTrend());
    window.Charts.draw(CHART_BEHAVIOR, window.ChartOptions.behaviorByRound());
    window.Charts.draw(CHART_MINUTES, window.ChartOptions.patrolMinutesTrend());
  }

  window.StationScene = {
    renderTopbar: renderTopbar,
    renderStatBand: renderStatBand,
    renderLeftColumn: renderLeftColumn,
    renderMapPanel: renderMapPanel,
    renderRightColumn: renderRightColumn,
    renderAreaBand: renderAreaBand,
    renderCharts: renderCharts,
  };
})();
