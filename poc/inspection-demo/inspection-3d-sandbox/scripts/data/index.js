// window.DemoData —— 数据层门面（facade）。把 DemoStation/DemoTask/DemoTrack/
// DemoSeries/DemoFlow/DemoItems 六个各自独立的数据模块收成一个入口，供
// core/state.js（校验持久化状态用的字典）和 scripts/scenes/*.js（拼场景数据）
// 统一引用，不强制每个调用方都记住六个全局名字分别叫什么。
//
// 本文件不重新实现任何聚合/派生逻辑——所有方法都是对下层模块同名（或语义对应）
// 函数的直接透传（必要时补一层参数校验），真正的数据与算法仍然只在 DemoStation/
// DemoTask/DemoTrack/DemoSeries/DemoFlow/DemoItems 各自的文件里各有一份实现。
//
// 加载顺序要求：必须在 station.js / series.js / track.js / task.js / flow.js /
// items-entry.js|items-process.js|items-room.js 全部之后加载（本文件是 L2 数据层
// 里最后一个文件），任何一个前置模块缺失都直接抛错。
(function () {
  "use strict";

  function assertGlobal(name, value) {
    if (!value) {
      throw new Error("[DemoData] 缺少全局依赖 " + name + "，请检查 index.html 的 <script> 加载顺序");
    }
  }

  assertGlobal("Map3DContract", window.Map3DContract);
  assertGlobal("DemoItems", window.DemoItems);
  assertGlobal("DemoStation", window.DemoStation);
  assertGlobal("DemoTrack", window.DemoTrack);
  assertGlobal("DemoSeries", window.DemoSeries);
  assertGlobal("DemoTask", window.DemoTask);
  assertGlobal("DemoFlow", window.DemoFlow);

  var Contract = window.Map3DContract;
  var Station = window.DemoStation;
  var Track = window.DemoTrack;
  var Series = window.DemoSeries;
  var Task = window.DemoTask;
  var Flow = window.DemoFlow;

  function areaIds() {
    return Contract.AREA_IDS.slice();
  }

  function items(areaId) {
    var list = window.DemoItems[areaId];
    if (!Array.isArray(list)) {
      throw new Error("[DemoData] items(\"" + areaId + "\") 未找到，区域 id 应 ∈ [" + Contract.AREA_IDS.join(", ") + "]");
    }
    return list;
  }

  function item(areaId, itemId) {
    var matches = items(areaId).filter(function (it) { return it.id === itemId; });
    if (matches.length === 0) {
      throw new Error("[DemoData] 区域 " + areaId + " 内未找到巡检项 " + itemId);
    }
    return matches[0];
  }

  window.DemoData = {
    // ---- 站场 / 12 区（scripts/data/station.js） ----
    meta: Station.meta,
    areas: Station.areas,
    area: Station.area,
    statuses: Station.statuses,
    progress: Station.progress,
    stationProgress: Station.stationProgress,

    // ---- 12 区键集合与逐项巡检数据（scripts/map3d/contract.js + items-*.js） ----
    areaIds: areaIds,
    items: items,
    item: item,

    // ---- 任务卡 / 问题列表（scripts/data/task.js） ----
    task: Task.task,
    taskMeta: Task.meta,
    tabs: Task.tabs,
    filters: Task.filters,
    issues: Task.issues,
    otherTasks: Task.otherTasks,
    inspectorCandidates: Task.inspectorCandidates,
    addInspector: Task.addInspector,

    // ---- 巡检轨迹（scripts/data/track.js） ----
    track: Track.track,

    // ---- 图表聚合数据源（scripts/data/series.js） ----
    areaProgressRows: Series.areaProgressRows,
    itemTypeMix: Series.itemTypeMix,
    disciplineMix: Series.disciplineMix,
    durationByArea: Series.durationByArea,
    areaSpark: Series.areaSpark,
    numericReadings: Series.numericReadings,
    patrolMinutes: Series.patrolMinutes,

    // ---- 流程步骤 / 状态文案唯一真源（scripts/data/flow.js） ----
    flowSteps: Flow.steps,
    statusText: Flow.statusText,
    badgeText: Flow.badgeText,
    controlDisplay: Flow.controlDisplay,
    statusLine: Flow.statusLine
  };
})();
