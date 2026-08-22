// 唯一场景：window.MapScene（L6 场景层，早于 boot.js，晚于 core/* 与 ui/*）。
//
// 页面结构（顶栏任务卡走 02-shell.css/10-taskcard.css 已冻结的 .topbar 契约，
// 不属于本文件的网格范围）：
//   .topbar          renderTaskCard() 产出，由 boot.js 挂进 <header class="topbar">
//   .stage > .map-scene（styles/06-map-scene.css 的三列网格）
//     .area-list-panel   renderAreaList(state)     grid-area: arealist
//     .station-map-panel renderMapPanel(state)     grid-area: map（含 ActionBar）
//     .item-panel        renderItemPanel(state)    grid-area: items
//     .map-bottom-row    renderBottomRow()          grid-area: bottom
//
// 本文件只渲染 DOM，不 addEventListener：所有交互点都天然带 data-select/
// data-select-id / data-map3d-area / data-item-id / data-action，由 boot.js 的
// bindStage() 统一做事件委托。
(function () {
  "use strict";

  var DATA = window.DemoData;

  // 区域类型 → 右栏标签文案。旧版本这里是一串三元表达式
  // （room ? "室内区" : boundary ? "边界区" : "工艺区"），最后那个分支是兜底——
  // 换成平面图分区之后新增了 "tank"（罐区），走兜底会把 4 个罐区标成"工艺区"，
  // 而且不会报错。改成查表 + 查不到直接抛错。
  var KIND_LABEL = { tank: "罐区", room: "室内区", process: "工艺区" };

  function kindLabel(kind) {
    if (!Object.prototype.hasOwnProperty.call(KIND_LABEL, kind)) {
      throw new Error(
        "[MapScene] 未知的区域 kind：" + kind + "，应 ∈ [" + Object.keys(KIND_LABEL).join(", ") + "]"
      );
    }
    return KIND_LABEL[kind];
  }

  function assertLoaded() {
    if (!DATA) throw new Error("[MapScene] window.DemoData 未加载");
  }

  // ---------- 顶栏任务卡（类名契约见 styles/10-taskcard.css 文件头） ----------

  function field(label, value, wide) {
    return h("div", { class: wide ? "task-field wide" : "task-field" }, [
      h("dt", { class: "task-field-label", text: label }),
      h("dd", { class: "task-field-value", text: value }),
    ]);
  }

  function renderTaskCard() {
    assertLoaded();
    var t = DATA.task();
    var badgeStatus = t.overdueBadge === "已超期" ? "danger" : "ok";
    return h("div", { class: "task-card" }, [
      h("div", { class: "task-card-main" }, [
        h("div", { class: "task-card-title" }, [
          h("strong", { class: "task-card-name", text: t.formName }),
          h("span", { class: "badge " + badgeStatus, text: t.overdueBadge }),
        ]),
        h("dl", { class: "task-card-fields" }, [
          field("巡检站场", t.station),
          field("巡检人", t.inspector),
          field("计划", t.planStart + " → " + t.planEnd, true),
          field("实际", t.actualStart + " → " + t.actualEnd, true),
          field("巡检区域", t.areaSummary),
        ]),
      ]),
      h("div", { class: t.status === "已完成" ? "task-card-check done" : "task-card-check", text: "✓" }),
      h("div", { class: "task-card-foot" }, [
        h("ul", { class: "task-card-status", role: "list" },
          DATA.filters().map(function (f) {
            return h("li", {}, [
              h("span", { class: f.active ? "task-status-pill active" : "task-status-pill", text: f.label }),
            ]);
          })),
        h("ul", { class: "task-card-tabs", role: "list" },
          DATA.tabs().map(function (tab, i) {
            return h("li", {}, [
              h("span", { class: i === 0 ? "task-tab active" : "task-tab", text: tab.label }),
            ]);
          })),
      ]),
    ]);
  }

  // ---------- 左栏：12 区列表 ----------

  function renderAreaList(state) {
    assertLoaded();
    var C = window.Map3DContract;
    var items = DATA.areas().map(function (area) {
      var p = DATA.progress(area.id);
      return {
        id: area.id,
        label: area.icon + " " + area.name,
        status: area.status,
        value: String(area.itemTotal),
        unit: "项",
        badge: p.done + "/" + p.total,
        note: area.issueCount > 0 ? "发现问题 " + area.issueCount + " 项" : DATA.badgeText(area.status),
      };
    });
    // 列表里的第 0 层："全站视图"——不是为了绕过 SelectList 校验而藏起来的哨兵项，
    // 而是一个真正可见、可点、语义正当的"退回上一层"入口，放在 12 个区域行最顶部
    // （unshift，不是 push 到末尾）。id 沿用 "__none__"：它作为"没有具体区域被选中"
    // 这个语义的哨兵值没有变，变的是它现在也是列表里一条真实的可选行——SelectList
    // 仍然要求 activeId 必须能在 items 里找到（见 selectlist.js 的 hasActive 校验），
    // 但这次它对应的是一条用户真能看见、真能点的行，不再是靠 CSS display:none 藏起来
    // 凑出来的合法性。status 固定给 "ok"（只是满足 SelectList 的 assertStatus，不代表
    // "全站健康"这个结论——全站层面的真实状态由中间 3D 面板与右栏"全站态势"卡呈现），
    // 视觉上与 12 个真实区域行的区分完全交给 07-arealist.css 的
    // [data-select-id="__none__"] 选择器（更弱的背景 + label 前缀的 "‹" 层级符号）。
    items.unshift({
      id: "__none__",
      label: "‹ 全站视图",
      status: "ok",
      note: C.AREA_IDS.length + " 个区域 · " + C.TOTAL_ITEMS + " 项",
    });
    var activeId = state.focus.areaId != null ? state.focus.areaId : "__none__";
    return h("section", { class: "panel area-list-panel" }, [
      h("div", { class: "area-list-head" }, [
        h("p", { class: "kicker", text: "巡检区域 / 提交情况" }),
        h("h3", { text: DATA.meta().shortName }),
      ]),
      h("div", { class: "area-list-scroll" }, [
        window.SelectList.render({
          name: "area",
          variant: "row",
          activeId: activeId,
          ariaLabel: "12 个巡检区域",
          items: items,
        }),
      ]),
    ]);
  }

  // ---------- 中间：3D 站场地图 + 操作栏 ----------

  function renderMapPanel(state) {
    var mapPanel = window.renderStationMap(state.focus.areaId);
    var host = mapPanel.querySelector(".station-map");
    // 状态语的阶段判定统一走 AppState.phase()，不在这里再写一份
    // `focus.areaId == null ? "overview" : "drilldown"`——见 core/state.js 里
    // phase() 的注释（三处各写一份必然分裂）。
    host.appendChild(window.ActionBar.render({ state: DATA.statusLine(window.AppState.phase()) }));
    return mapPanel;
  }

  // ---------- 右栏：区域详情 + 巡检项列表 ----------

  function uniqueDisciplines(items) {
    var seen = {};
    items.forEach(function (it) { seen[it.discipline] = true; });
    return Object.keys(seen);
  }

  function numberCount(items) {
    return items.filter(function (it) { return it.inputType === "number"; }).length;
  }

  // 全景态右栏：全站态势 + 本轮巡检轨迹概览。
  // 轨迹信息（起点/终点/停留最久的区域/总时长）放在这里，是因为本次演示的重心就是
  // "巡检员沿平面图走了一圈"——全景态右栏原先只有一句"请选择一个区域"，把这块最该
  // 被看到的信息留在了 ActionBar 的一个开关里。
  function renderOverviewHint() {
    var sp = DATA.stationProgress();
    var track = DATA.track();
    var waypoints = track.waypoints;
    var first = waypoints[0];
    var last = waypoints[waypoints.length - 1];
    // 停留最久的区域：相邻 waypoint 的 atMinute 差值即该区停留分钟数（第一个区从 0 起算）。
    var longest = waypoints.reduce(function (best, wp, i) {
      var minutes = wp.atMinute - (i === 0 ? 0 : waypoints[i - 1].atMinute);
      return best == null || minutes > best.minutes ? { areaId: wp.areaId, minutes: minutes } : best;
    }, null);
    return h("article", { class: "card-detail" }, [
      h("div", { class: "detail-head" }, [
        h("div", {}, [
          h("p", { class: "kicker", text: "站场全景 · " + DATA.meta().shortName }),
          h("h3", { class: "detail-title", text: "全站 12 个区域态势" }),
        ]),
        h("span", { class: sp.issueCount > 0 ? "badge danger" : "badge ok", text: sp.issueCount > 0 ? "发现问题" : "全部正常" }),
      ]),
      h("p", {
        class: "detail-conclusion",
        text: "共 " + sp.itemTotal + " 项已全部提交，AI 复检发现 " + sp.issueCount +
          " 处需要关注。点击地图热点或左侧列表查看单区详情。",
      }),
      window.Cards.evidence({
        status: sp.issueCount > 0 ? "danger" : "ok",
        conclusion: "本轮巡检轨迹：" + track.waypoints.length + " 个区域 · 全程 " +
          track.durationMin + " 分钟，沿站内消防通道单向绕行。",
        // Cards.evidence 的 tags 硬限 3 个（超出直接抛错），所以这里只放三条最能
        // 说明"这一趟是怎么走的"：起点、终点、停留最久的区域。
        tags: [
          "起点 " + DATA.area(first.areaId).name,
          "终点 " + DATA.area(last.areaId).name,
          "停留最久 " + DATA.area(longest.areaId).name + " " + longest.minutes + " 分钟",
        ],
      }),
    ]);
  }

  function renderItemPanel(state) {
    assertLoaded();
    var areaId = state.focus.areaId;
    var card;
    var items;

    if (areaId == null) {
      card = renderOverviewHint();
      items = [];
    } else {
      var area = DATA.area(areaId);
      var p = DATA.progress(areaId);
      items = DATA.items(areaId);
      card = window.DetailCard.render({
        kicker: "区域详情 · " + DATA.meta().shortName,
        title: area.name,
        activeAreaLabel: area.name,
        badge: { status: area.status, text: DATA.badgeText(area.status) },
        metrics: [
          { label: "巡检项", value: String(area.itemTotal), unit: "项" },
          { label: "已提交", value: p.done + "/" + p.total },
          { label: "发现问题", value: String(area.issueCount), unit: "项" },
        ],
        conclusion: area.summary,
        tags: [
          kindLabel(area.kind),
          "专业覆盖 " + uniqueDisciplines(items).length + " 类",
          "数值型 " + numberCount(items) + " 项",
        ],
        sections: [
          {
            title: "现场记录",
            node: window.Cards.evidence({ status: area.status, conclusion: area.summary, tags: area.evidence }),
          },
          {
            title: "完成趋势",
            node: window.Cards.metric({
              label: "累计完成比", value: p.done + "/" + p.total, status: area.status,
              sparkId: "area-detail-spark",
            }),
          },
        ],
        // actions 留空数组：原先这里有「问题上报」（primary）与「切换区域」两个按钮，
        // 两者对应的弹层已删除。不改成别的按钮凑数——右栏详情卡本身就没有需要在这里
        // 触发的动作了，返回全景走地图右下角的「‹」，选别的区域走左栏列表。
        actions: [],
      });
    }

    return h("section", { class: "item-panel" }, [
      card,
      h("div", { class: "panel item-list-panel" }, [
        h("div", { class: "item-list-head" }, [
          h("p", { class: "kicker", text: "巡检项 / 标准与实测" }),
          h("h3", { text: areaId == null ? "未选择区域（全景态）" : DATA.area(areaId).name + " · " + DATA.area(areaId).itemTotal + " 项" }),
        ]),
        window.ItemList.render({
          items: items,
          activeItemId: state.pick.itemId,
          ariaLabel: areaId == null ? "巡检项列表（未选择区域）" : DATA.area(areaId).name + " 巡检项列表",
        }),
      ]),
    ]);
  }

  // ---------- 底部：图表行 ----------

  function renderBottomRow() {
    var sp = DATA.stationProgress();
    var mix = DATA.itemTypeMix();
    return h("div", { class: "map-bottom-row" }, [
      window.Cards.chart({ title: "巡检项型分布", chartId: "chart-item-type-mix", meta: mix.bool + "/" + mix.number + " 项" }),
      window.Cards.chart({ title: "巡检耗时曲线", chartId: "chart-duration-by-area", meta: "共 " + sp.itemTotal + " 项" }),
      window.Cards.chart({ title: "12 区完成率", chartId: "chart-area-progress" }),
    ]);
  }

  // ---------- 图表渲染（boot.js 在 append 之后调用，接上 mountChartSlots 留好的容器） ----------

  function renderCharts(state) {
    window.Charts.draw("chart-item-type-mix", window.ChartOptions.itemTypeMix());
    window.Charts.draw("chart-duration-by-area", window.ChartOptions.durationByArea());
    window.Charts.draw("chart-area-progress", window.ChartOptions.areaProgressBars());
    if (state.focus.areaId != null) {
      window.Charts.draw("area-detail-spark", window.ChartOptions.spark(DATA.areaSpark(state.focus.areaId)));
    }
    window.Charts.flush();
  }

  window.MapScene = {
    renderTaskCard: renderTaskCard,
    renderAreaList: renderAreaList,
    renderMapPanel: renderMapPanel,
    renderItemPanel: renderItemPanel,
    renderBottomRow: renderBottomRow,
    renderCharts: renderCharts,
  };
})();
