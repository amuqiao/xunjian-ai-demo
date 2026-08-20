// 流程定义与文案唯一真源：window.DemoFlow。
//
// 加载顺序要求：必须在 map3d/contract.js（提供 window.Map3DContract）之后、以及
// items-entry.js / items-process.js / items-room.js 三个文件（提供 window.DemoItems 的
// 全部 12 区数据）之后加载。任何一个前置模块缺失都直接抛错，不做兼容或降级。
//
// 分工纪律（全项目最容易分裂成几份的地方）：
//   - statusText / badgeText 是「状态文案」的唯一真源，任何要展示 ok/warn/danger
//     文案的地方都必须调这两个函数，不许自己写一份 "正常"/"关注"/"异常" 的映射。
//   - controlDisplay(item) 是「巡检项读数显示串」的唯一真源。ui/itemlist.js（列表行）
//     和 ui/detailcard.js（区域详情）都要展示同一条巡检项的读数，两处各自拼一遍
//     字符串就会出现「列表显示 3MPa、详情显示 3.0 MPa」这种不一致——任何要展示巡检项
//     读数的地方都必须调用 controlDisplay，不许自己拼串。
(function () {
  "use strict";

  if (!window.Map3DContract) {
    throw new Error("flow.js 必须在 map3d/contract.js 之后加载：window.Map3DContract 不存在");
  }
  if (!window.DemoItems) {
    throw new Error("flow.js 必须在 items-entry.js 之后加载：window.DemoItems 不存在");
  }

  var Contract = window.Map3DContract;

  // ---- 6 步流程轨（页脚 .flow-rail） ----
  //
  // 2026-08-20 换掉了其中一步：删除 "report"（问题上报），新增 "track"（巡检轨迹）
  // 并把它排在"站场全景"之后。这不是为了凑够 6 步——是本次改造的叙事重心变了：
  // 演示要讲的是"巡检员沿着平面图上的消防通道走了一圈，走到哪、用了多久"，
  // 问题上报那一步（连同它的弹层、上报单模板、ActionBar 按钮）整套移出范围。
  // 轨迹本来只是 ActionBar 上一个开关，现在它是叙事主线里的一步。
  var STEPS = [
    {
      key: "open-task",
      index: 1,
      label: "打开任务",
      hint: "选择本轮巡检任务，加载站场与 12 区数据。"
    },
    {
      key: "overview",
      index: 2,
      label: "站场全景",
      hint: "对照站点平面图查看全局态势与各区状态徽标。"
    },
    {
      key: "track",
      index: 3,
      label: "巡检轨迹",
      hint: "沿平面图消防通道回放巡检人走位与逐区停留时长。"
    },
    {
      key: "drilldown",
      index: 4,
      label: "区域详情",
      hint: "点击地图热点或左栏列表选中区域，查看该区巡检项清单。"
    },
    {
      key: "checklist",
      index: 5,
      label: "逐项核对",
      hint: "逐条核对巡检标准与现场读数是否一致。"
    },
    {
      key: "findings",
      index: 6,
      label: "发现问题",
      hint: "AI 复检标记出异常与需关注的巡检项。"
    }
  ];
  var PHASE_KEYS = STEPS.map(function (step) { return step.key; });

  // 这里原先有一份「沙盘 / 卫星」双模式定义。双模式已于 2026-08-13 拆成两个互不耦合
  // 的独立 POC（本 POC 只做沙盘），所以 MODES 与 modes() 一并移除，顶栏也不再有模式
  // 切换控件。拆分理由见 scripts/map3d/contract.js 的注释。

  // ---- 状态文案唯一真源 ----
  var STATUS_TEXT = { ok: "正常", warn: "关注", danger: "异常" };
  var BADGE_TEXT = { ok: "已通过", warn: "待关注", danger: "发现问题" };
  Contract.STATUSES.forEach(function (status) {
    if (!Object.prototype.hasOwnProperty.call(STATUS_TEXT, status) ||
        !Object.prototype.hasOwnProperty.call(BADGE_TEXT, status)) {
      throw new Error("[DemoFlow] STATUS_TEXT/BADGE_TEXT 缺少 Map3DContract.STATUSES 中的状态：" + status);
    }
  });

  function statusText(status) {
    if (!Object.prototype.hasOwnProperty.call(STATUS_TEXT, status)) {
      throw new Error("[DemoFlow] statusText 收到非法 status：" + status);
    }
    return STATUS_TEXT[status];
  }

  function badgeText(status) {
    if (!Object.prototype.hasOwnProperty.call(BADGE_TEXT, status)) {
      throw new Error("[DemoFlow] badgeText 收到非法 status：" + status);
    }
    return BADGE_TEXT[status];
  }

  // 巡检项右侧控件显示串的唯一真源：
  //   bool   → statusText 那套词（"正常"/"关注"/"异常"）
  //   number → value + " " + unit（如 "3 MPa"）
  function controlDisplay(item) {
    if (!item || Contract.CONTROL_TYPES.indexOf(item.inputType) < 0) {
      throw new Error(
        "[DemoFlow] controlDisplay 收到非法 item.inputType：" + (item && item.inputType) +
        "（" + (item && item.id) + "）"
      );
    }
    if (item.inputType === "bool") {
      return statusText(item.status);
    }
    if (item.unit === null || item.unit === undefined) {
      throw new Error("[DemoFlow] controlDisplay：number 型巡检项缺少 unit（" + item.id + "）");
    }
    return item.value + " " + item.unit;
  }

  // 顶栏状态语所需的统计：直接扫 window.DemoItems，不引入对 station.js / DemoSeries
  // 的耦合。
  function scanStatusCounts() {
    var counts = { ok: 0, warn: 0, danger: 0, total: 0 };
    Contract.AREA_IDS.forEach(function (areaId) {
      var items = window.DemoItems[areaId];
      if (!Array.isArray(items)) {
        throw new Error(
          "[DemoFlow] window.DemoItems." + areaId + " 未加载或非数组，请确认 " +
          "items-entry.js / items-process.js / items-room.js 三个文件均已在 flow.js 之前加载完毕"
        );
      }
      items.forEach(function (item) {
        if (!Object.prototype.hasOwnProperty.call(counts, item.status)) {
          throw new Error("[DemoFlow] 巡检项 status 非法：" + item.status + "（" + item.id + "）");
        }
        counts[item.status] += 1;
        counts.total += 1;
      });
    });
    return counts;
  }

  // 顶栏状态语：按流程步返回一句演示旁白。发现项数量（危/关注）实时扫 DemoItems，
  // 不写死数字——剧本改了某条 status，这里的旁白必须自动跟着变。
  function statusLine(phase) {
    if (PHASE_KEYS.indexOf(phase) < 0) {
      throw new Error(
        "[DemoFlow] statusLine 收到未知 phase：" + phase + "，应 ∈ [" + PHASE_KEYS.join(", ") + "]"
      );
    }
    var counts = scanStatusCounts();
    var nonOk = counts.warn + counts.danger;
    switch (phase) {
      case "open-task":
        return "任务已加载：本轮巡检覆盖 12 个区域、共 " + counts.total + " 项巡检点位。";
      case "overview":
        return "本轮 12 个区域已全部提交，AI 复检发现 " + nonOk + " 处需要关注。";
      case "track":
        return "巡检轨迹已展开：巡检人沿消防通道走完 12 个区域，全程 63 分钟。";
      case "drilldown":
        return "已选中区域，可查看该区巡检项与现场读数。";
      case "checklist":
        return "正在逐项核对巡检标准与现场读数，请重点关注异常与待关注项。";
      case "findings":
        return "AI 复检共标记 " + counts.danger + " 处异常、" + counts.warn + " 处待关注，已加入问题清单。";
      default:
        throw new Error("[DemoFlow] statusLine 缺少 phase=" + phase + " 对应的文案");
    }
  }

  window.DemoFlow = {
    steps: function () {
      return STEPS.map(function (step) {
        return { key: step.key, index: step.index, label: step.label, hint: step.hint };
      });
    },
    statusText: statusText,
    badgeText: badgeText,
    controlDisplay: controlDisplay,
    statusLine: statusLine
  };
})();
