// 应用状态：window.AppState —— state 对象定义 / normalize / load / save / reset。
// 参考 beng-ai-demo/poc/pump-demo/scripts/core/state.js 的整体结构（state 只创建
// 一次、resetState 只做属性级重建、normalizeState 对持久化候选值做"非法就退回
// 默认值"的宽松清洗、而运行期的 selectArea/selectItem 两个写入口对"刚发生的
// 真实交互"要求高度确信、查不到直接抛错），但状态形状按本项目重新设计——本项目
// 没有机组/部位的双层结构，只有「站场全景 / 单区下钻」这一层焦点。
//
// state 形状：
//   focus.areaId   当前 3D 下钻聚焦的区域 id；null = 站场全景（12 区都显示，
//                  相机走 overview 机位）。
//   pick.itemId    当前在右侧巡检项列表里选中的具体项；必须属于 focus.areaId，
//                  focus.areaId 为 null 时 pick.itemId 恒为 null（没有区域就没有
//                  "属于该区域的某一项"这回事）。
//   showTrack      巡检轨迹光带是否可见。ActionBar 的"轨迹"按钮切它；从 false
//                  切到 true 的那一刻，scripts/map3d/model-track.js 会额外播放一段
//                  有限时长的流动动画（见该文件顶部注释），不是永久滚动。
//   overlay        当前打开的弹层：{ kind: null|"area-picker"|"issue-report"|
//                  "inspector-picker", areaId, itemId, query }。kind 决定
//                  scenes/areapicker.js / scenes/issuereport.js /
//                  scenes/inspectorpicker.js 谁可见；areaId/itemId 是"问题上报"单
//                  要用到的目标（选择哪个区域/哪一条巡检项来生成上报单），
//                  "inspector-picker" 不需要 areaId/itemId（候选名单现场从
//                  window.DemoData.inspectorCandidates() 取，不依赖 focus/pick）；
//                  query 是"选择区域"弹层搜索框的当前输入（自由文本，不做字典
//                  校验，只在 kind==="area-picker" 时有意义）。
//   flowVisited    页脚 6 步流程轨里已经"走到过"的步骤 key 集合，用于渲染
//                  .flow-step.done。
(function () {
  "use strict";

  var DATA = window.DemoData;
  if (!DATA) {
    throw new Error("[AppState] window.DemoData 未加载，请检查 index.html 的 <script> 顺序");
  }

  // 换一次结构就换一次 key：旧版本的持久化状态形状不兼容时，与其在
  // normalizeState 里费力"部分迁移"，不如让旧数据直接被当成不存在——这是演示
  // 现场最不容易翻车的处理方式，与参考项目 v4->v5 换 key 的理由一致。
  var STORAGE_KEY = "xj-sandbox-v1-state";

  var OVERLAY_KINDS = ["area-picker", "issue-report", "inspector-picker"];

  function defaultState() {
    return {
      focus: { areaId: null },
      pick: { itemId: null },
      showTrack: false,
      overlay: { kind: null, areaId: null, itemId: null, query: "" },
      flowVisited: ["open-task"]
    };
  }

  function loadState() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      window.localStorage.removeItem(STORAGE_KEY);
      console.warn("[AppState] 重置了非法的持久化状态", err);
      return null;
    }
  }

  function saveState() {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  // ---------------------------------------------------------------------
  // 持久化状态清洗：非法就退回默认值，不抛错——这条路径只处理"从 localStorage
  // 读出来的候选状态"，磁盘上的值可能来自旧版本、被手改过、或残留半次没写完的
  // 脏数据。与下面 selectArea/selectItem 对"刚发生的真实交互"直接抛错的纪律
  // 是两条不同的路径，不要糊成一个函数。
  // ---------------------------------------------------------------------

  function cleanFocus(rawFocus) {
    var source = (rawFocus && typeof rawFocus === "object") ? rawFocus : {};
    var areaId = source.areaId;
    if (areaId != null && DATA.areaIds().indexOf(areaId) < 0) areaId = null;
    return { areaId: areaId == null ? null : areaId };
  }

  function cleanPick(rawPick, cleanedFocus) {
    var source = (rawPick && typeof rawPick === "object") ? rawPick : {};
    var itemId = source.itemId;
    if (cleanedFocus.areaId == null) return { itemId: null };
    if (typeof itemId !== "string") return { itemId: null };
    var belongs = DATA.items(cleanedFocus.areaId).some(function (it) { return it.id === itemId; });
    return { itemId: belongs ? itemId : null };
  }

  function cleanOverlay(rawOverlay) {
    var source = (rawOverlay && typeof rawOverlay === "object") ? rawOverlay : {};
    var kind = OVERLAY_KINDS.indexOf(source.kind) >= 0 ? source.kind : null;
    var query = kind === "area-picker" && typeof source.query === "string" ? source.query : "";
    if (kind !== "issue-report") return { kind: kind, areaId: null, itemId: null, query: query };
    var areaId = typeof source.areaId === "string" && DATA.areaIds().indexOf(source.areaId) >= 0 ? source.areaId : null;
    var itemId = null;
    if (areaId != null && typeof source.itemId === "string") {
      var belongs = DATA.items(areaId).some(function (it) { return it.id === source.itemId; });
      if (belongs) itemId = source.itemId;
    }
    // 问题上报单必须有明确的目标（区域 + 巡检项），缺一个就等于这条持久化的
    // "打开状态"已经失效，退回关闭而不是渲染一张打不开的表单。
    if (areaId == null || itemId == null) return { kind: null, areaId: null, itemId: null, query: "" };
    return { kind: "issue-report", areaId: areaId, itemId: itemId, query: "" };
  }

  function normalizeState(candidate) {
    var clean = defaultState();
    Object.keys(clean).forEach(function (key) {
      if (Object.prototype.hasOwnProperty.call(candidate, key)) {
        clean[key] = candidate[key];
      }
    });
    clean.focus = cleanFocus(clean.focus);
    clean.pick = cleanPick(clean.pick, clean.focus);
    clean.showTrack = clean.showTrack === true;
    clean.overlay = cleanOverlay(clean.overlay);
    var stepKeys = DATA.flowSteps().map(function (step) { return step.key; });
    clean.flowVisited = Array.isArray(clean.flowVisited)
      ? clean.flowVisited.filter(function (key) { return stepKeys.indexOf(key) >= 0; })
      : ["open-task"];
    if (clean.flowVisited.indexOf("open-task") < 0) clean.flowVisited.unshift("open-task");
    return clean;
  }

  function markFlowStep(stepKey) {
    if (!DATA.flowSteps().some(function (step) { return step.key === stepKey; })) return;
    if (state.flowVisited.indexOf(stepKey) < 0) state.flowVisited.push(stepKey);
  }

  // 只清空/重建属性，绝不重新赋值 state 变量本身：window.AppState.value 这个
  // 引用要终生保持不变，其他文件在自己模块顶层缓存的 `var state = window.AppState.value`
  // 才不会在重置演示后失效。
  function resetState() {
    window.localStorage.removeItem(STORAGE_KEY);
    var fresh = defaultState();
    Object.keys(state).forEach(function (key) { delete state[key]; });
    Object.keys(fresh).forEach(function (key) { state[key] = fresh[key]; });
  }

  var state = normalizeState(loadState() || defaultState());

  // ---------------------------------------------------------------------
  // 只读派生访问器：查不到直接抛错（此刻 state 里的值理应必然合法，因为所有写
  // 入口——normalizeState/selectArea/selectItem——都已经校验过），不做兜底。
  // ---------------------------------------------------------------------

  function selectedArea() {
    if (!state.focus.areaId) throw new Error("[AppState] selectedArea() 要求 focus.areaId 非空（当前为站场全景态）");
    return DATA.area(state.focus.areaId);
  }

  function selectedItem() {
    if (!state.pick.itemId) throw new Error("[AppState] selectedItem() 要求 pick.itemId 非空");
    return DATA.item(state.focus.areaId, state.pick.itemId);
  }

  window.AppState = {
    value: state,
    STORAGE_KEY: STORAGE_KEY,
    save: saveState,
    reset: resetState,
    markFlowStep: markFlowStep,
    selectedArea: selectedArea,
    selectedItem: selectedItem
  };
})();
