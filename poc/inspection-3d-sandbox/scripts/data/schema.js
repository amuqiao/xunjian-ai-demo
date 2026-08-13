// window.DemoDataSchema —— 逐条巡检项的字段级硬校验。
//
// 分工边界（与 scripts/map3d/contract.js 呼应，见该文件顶部注释）：contract.js
// 只管「12 区键集合 + 每区项数 + DOM 命名」这三件事；单条巡检项内部的字段合法性
// （seq 连续性、inputType 枚举、number 项的 unit/min/max、bool 项的 value 类型、
// status 枚举）归本文件。本文件复用 Map3DContract 的 AREA_IDS / AREA_ITEM_COUNTS
// 做区域真源，不另起一套 12 区列表。
//
// 加载顺序要求：必须在 map3d/contract.js 与 items-entry.js / items-process.js /
// items-room.js 三个文件之后加载——assertAll() 现场读 window.DemoItems。
//
// 错误处理纪律：assertAll() 逐项检查，任何一条不合法立刻抛错并指名具体的 id +
// 字段 + 实际值，不做兼容、不静默跳过、不计数汇总后才报告——第一条坏数据就应该
// 让整个页面加载失败，而不是让人在几百条里排查是哪一条。
(function () {
  "use strict";

  if (!window.Map3DContract) {
    throw new Error("schema.js 必须在 map3d/contract.js 之后加载：window.Map3DContract 不存在");
  }

  var Contract = window.Map3DContract;
  var STATUSES = Contract.STATUSES;
  var CONTROL_TYPES = Contract.CONTROL_TYPES;
  var UNITS = Contract.UNITS;

  function fail(item, message) {
    var label = item && item.id ? item.id : "(未知 id)";
    throw new Error("[DemoDataSchema] 巡检项 " + label + " " + message);
  }

  function assertNonEmptyString(item, field) {
    var value = item[field];
    if (typeof value !== "string" || value === "") {
      fail(item, "的 " + field + " 必须是非空字符串，实际为 " + JSON.stringify(value));
    }
  }

  function assertOneOf(item, field, allowed) {
    var value = item[field];
    if (allowed.indexOf(value) < 0) {
      fail(item, "的 " + field + " 非法：" + JSON.stringify(value) + "，应 ∈ [" + allowed.join(", ") + "]");
    }
  }

  // seq 在区内必须唯一且从 1 连续——这是"区内序号连续"这条契约唯一的校验点，
  // 不在别处（ItemList/DetailCard 等）重复检查。
  function assertSeqContinuous(areaId, items) {
    var seqs = items.map(function (item) { return item.seq; }).slice().sort(function (a, b) { return a - b; });
    var i;
    for (i = 0; i < seqs.length; i += 1) {
      var expected = i + 1;
      if (seqs[i] !== expected) {
        throw new Error(
          "[DemoDataSchema] 区域 " + areaId + " 的 seq 不连续：排序后第 " + (i + 1) +
          " 个应为 " + expected + "，实际为 " + seqs[i] + "（完整序列 [" + seqs.join(", ") + "]）"
        );
      }
    }
  }

  function assertItem(item, areaId) {
    if (!item || typeof item !== "object") {
      throw new Error("[DemoDataSchema] 区域 " + areaId + " 存在非法巡检项：" + item);
    }
    assertNonEmptyString(item, "id");
    if (item.areaKey !== areaId) {
      fail(item, "的 areaKey（" + item.areaKey + "）与所属区域（" + areaId + "）不一致");
    }
    if (typeof item.seq !== "number" || item.seq <= 0 || Math.floor(item.seq) !== item.seq) {
      fail(item, "的 seq 必须是正整数，实际为 " + JSON.stringify(item.seq));
    }
    assertNonEmptyString(item, "point");
    assertNonEmptyString(item, "discipline");
    assertNonEmptyString(item, "title");
    assertNonEmptyString(item, "standard");
    assertOneOf(item, "inputType", CONTROL_TYPES);
    assertOneOf(item, "status", STATUSES);

    if (item.inputType === "bool") {
      if (typeof item.value !== "boolean") {
        fail(item, "是 bool 型但 value 不是布尔值，实际为 " + JSON.stringify(item.value) + "(" + typeof item.value + ")");
      }
      if (item.unit !== null) {
        fail(item, "是 bool 型但 unit 不为 null，实际为 " + JSON.stringify(item.unit));
      }
      if (item.min !== null || item.max !== null) {
        fail(item, "是 bool 型但 min/max 未置 null（min=" + item.min + " max=" + item.max + "）");
      }
      return;
    }

    // inputType === "number"
    if (typeof item.value !== "number" || !isFinite(item.value)) {
      fail(item, "是 number 型但 value 不是有限数字，实际为 " + JSON.stringify(item.value));
    }
    assertOneOf(item, "unit", UNITS);
    if (typeof item.min !== "number" || typeof item.max !== "number") {
      fail(item, "是 number 型但缺少合法 min/max（min=" + JSON.stringify(item.min) + " max=" + JSON.stringify(item.max) + "）");
    }
    if (item.min >= item.max) {
      fail(item, "的量程非法：min(" + item.min + ") 必须小于 max(" + item.max + ")");
    }
    // 注意：这里不校验 value 是否落在 [min,max] 之内。真实剧本里 status=warn/danger
    // 的数值项就是靠"读数越出量程"来表达异常的（如 gate-40 的 3MPa 低于量程下限
    // 4MPa），value 越界正是这些项存在的意义，不是录入错误——量程本身的 min<max
    // 才是这里要保证的结构性约束。
    if (item.tag != null && (typeof item.tag !== "string" || item.tag === "")) {
      fail(item, "的 tag 必须是非空字符串或 null，实际为 " + JSON.stringify(item.tag));
    }
  }

  function assertArea(areaId) {
    var items = window.DemoItems && window.DemoItems[areaId];
    if (!Array.isArray(items)) {
      throw new Error(
        "[DemoDataSchema] window.DemoItems." + areaId + " 不是数组，请确认 items-entry.js/" +
        "items-process.js/items-room.js 已在 schema.js 之前加载"
      );
    }
    var expected = Contract.AREA_ITEM_COUNTS[areaId];
    if (items.length !== expected) {
      throw new Error(
        "[DemoDataSchema] 区域 " + areaId + " 的巡检项数为 " + items.length + "，应为 " + expected
      );
    }
    items.forEach(function (item) { assertItem(item, areaId); });
    assertSeqContinuous(areaId, items);
  }

  // 全量断言入口：boot.js 在首次 render 前调用一次。逐区、逐项检查，任何一条
  // 不合法立刻抛错（不汇总、不计数、不吞错）。
  function assertAll() {
    Contract.AREA_IDS.forEach(assertArea);
  }

  window.DemoDataSchema = {
    assertAll: assertAll
  };
})();
