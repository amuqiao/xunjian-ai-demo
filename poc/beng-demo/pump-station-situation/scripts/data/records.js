// 巡检记录生成器（P1-C）。跨 90 天生成 40 条确定性巡检记录，其中 4 条挂着"人工记录 vs
// AI 质检"的叙事文案（照搬 scripts/data/catalog.js 里 inspection 的既有文案），其余 36 条
// 为确定性填充记录，用于让 7d/30d/90d 三个区间下的巡检列表看起来有真实密度变化。
//
// 加载顺序：必须晚于 scripts/data/seed.js 和 scripts/data/catalog.js，早于
// scripts/data/index.js。
window.DemoDataRecords = (function () {
  "use strict";

  var SEED = window.DemoDataSeed;
  if (!SEED) {
    throw new Error("DemoDataSeed is required，请检查 scripts/data/seed.js 是否已加载");
  }
  var CATALOG = window.DemoDataCatalog;
  if (!CATALOG) {
    throw new Error("DemoDataCatalog is required，请检查 scripts/data/catalog.js 是否已加载");
  }

  var SHIFTS = ["早班", "中班", "夜班"];
  var INSPECTORS = ["王建国", "李明", "张伟", "刘芳", "陈晨", "赵磊"];

  // ---------- 锚点日期（沿用 scenario.anchorClock，只取日期部分） ----------

  function parseAnchorDate() {
    var datePart = CATALOG.scenario.anchorClock.split(" ")[0].split("-");
    return {
      year: parseInt(datePart[0], 10),
      month: parseInt(datePart[1], 10),
      day: parseInt(datePart[2], 10)
    };
  }
  var ANCHOR = parseAnchorDate();
  var ANCHOR_UTC_MS = Date.UTC(ANCHOR.year, ANCHOR.month - 1, ANCHOR.day);

  function pad2(n) {
    return n < 10 ? "0" + n : "" + n;
  }

  // dayOffset（0 = 今天，1 = 昨天……）对应的日期，格式 MM-DD / 用于 id 的 MMDD。
  function dateOf(dayOffset) {
    var d = new Date(ANCHOR_UTC_MS - dayOffset * 86400000);
    return { mmdd: pad2(d.getUTCMonth() + 1) + pad2(d.getUTCDate()), label: pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate()) };
  }

  // ---------- 40 条记录横跨 90 天的天数分布 ----------
  //
  // 用 (i/39)^2.1 把偏移量往"最近"压缩：越靠近锚点巡检越密（近 7 天每天一条），
  // 越往前越稀疏（90 天窗口内累计满 40 条）。指数 2.1 是从下列约束反推校准出的常数：
  // 7 天窗口内应有 7 条、30 天窗口内应有 24 条、90 天窗口内恰好 40 条
  // （原 pump-demo 的 verify_data.js 断言用于校准这组数量）。
  function buildDayOffsets() {
    var n = 40;
    var offsets = [];
    var i, off;
    for (i = 0; i < n; i += 1) {
      off = Math.round(89 * Math.pow(i / (n - 1), 2.1));
      offsets.push(off);
    }
    // 四舍五入可能撞出重复的天数，顺延到下一天，保持严格递增且不越过 89。
    var used = {};
    for (i = 0; i < offsets.length; i += 1) {
      while (used[offsets[i]]) offsets[i] += 1;
      used[offsets[i]] = true;
    }
    return offsets;
  }
  var DAY_OFFSETS = buildDayOffsets();

  // ---------- 4 条叙事记录：按 dayOffset 覆盖对应位置 ----------
  //
  // REC-0722-18 是默认选中项：人工记录未见异常，但时序模型证据会聚指向异常，
  // 文案照搬 CATALOG.inspection，不重新编造。
  var NARRATIVE_BY_OFFSET = {
    0: {
      id: "REC-0722-18",
      shift: "夜班",
      inspector: "王建国",
      item: CATALOG.inspection.item,
      partId: "coupling",
      result: "未见异常",
      aiFlag: "conflict",
      conflictText: CATALOG.inspection.conflictText
    },
    1: {
      id: "REC-0721-18",
      shift: "夜班",
      inspector: "王建国",
      item: CATALOG.inspection.item,
      partId: "coupling",
      result: "未见异常",
      aiFlag: "gap",
      conflictText: "同一巡检项前一日的记录同样未填写联轴器对中复核读数，AI 质检提示连续两次缺项。"
    },
    2: {
      id: "REC-0720-06",
      shift: "中班",
      inspector: "李明",
      item: "第 06 项 · 底座基础振动和地脚状态",
      partId: "base",
      result: "未见异常",
      aiFlag: "ok",
      conflictText: "人工记录与模型证据一致，未见冲突。"
    },
    3: {
      id: "REC-0719-18",
      shift: "早班",
      inspector: "张伟",
      item: "第 18 项 · 电机驱动端水平振动",
      partId: "motor",
      result: "待复核",
      aiFlag: "gap",
      conflictText: "电机侧记录缺少驱动端水平振动读数，AI 质检提示需补充采集后再复核。"
    }
  };

  // ---------- 填充记录：确定性生成，不带叙事 ----------

  function fillerRecord(dayOffset) {
    var date = dateOf(dayOffset);
    var rand = SEED.makeRandom(SEED.hashKey("record|" + dayOffset));
    var part = CATALOG.parts[Math.floor(rand() * CATALOG.parts.length)];
    var itemNo = 1 + Math.floor(rand() * 30);
    var shift = SHIFTS[Math.floor(rand() * SHIFTS.length)];
    var inspector = INSPECTORS[Math.floor(rand() * INSPECTORS.length)];
    var isGap = rand() < 0.3;
    var aiFlag = isGap ? "gap" : "ok";
    var result;
    if (aiFlag === "gap") {
      result = "待复核";
    } else {
      result = rand() < 0.85 ? "未见异常" : "已记录异常";
    }
    return {
      id: "REC-" + date.mmdd + "-" + pad2(itemNo),
      date: date.label,
      shift: shift,
      inspector: inspector,
      item: "第 " + pad2(itemNo) + " 项 · " + part.checkItem,
      partId: part.id,
      result: result,
      aiFlag: aiFlag,
      conflictText: ""
    };
  }

  function buildAll() {
    var list = [];
    var i, dayOffset, narrative, record, date;
    for (i = 0; i < DAY_OFFSETS.length; i += 1) {
      dayOffset = DAY_OFFSETS[i];
      date = dateOf(dayOffset);
      narrative = NARRATIVE_BY_OFFSET[dayOffset];
      if (narrative) {
        record = {
          id: narrative.id,
          date: date.label,
          shift: narrative.shift,
          inspector: narrative.inspector,
          item: narrative.item,
          partId: narrative.partId,
          result: narrative.result,
          aiFlag: narrative.aiFlag,
          conflictText: narrative.conflictText
        };
      } else {
        record = fillerRecord(dayOffset);
      }
      record.dayOffset = dayOffset;
      list.push(record);
    }
    return list;
  }
  var ALL_RECORDS = buildAll();

  function stripInternal(record) {
    return {
      id: record.id,
      date: record.date,
      shift: record.shift,
      inspector: record.inspector,
      item: record.item,
      partId: record.partId,
      result: record.result,
      aiFlag: record.aiFlag,
      conflictText: record.conflictText
    };
  }

  // ---------- 巡检记录表格列定义 ----------
  //
  // 业务后期改列（增删/改宽度/改类型）只改这份声明，不改场景层渲染代码。列的取值
  // 组装（把 record 字段映射成单元格内容）是场景层的事，这里只导出列的形状。
  // type 的合法取值只有三个：status-dot / text / badge-icon，具体渲染方式由场景层决定。
  var RECORD_COLUMNS = [
    { key: "aiFlag", label: "", width: 28, type: "status-dot" },
    { key: "dateShift", label: "日期·班次", width: 110, type: "text" },
    { key: "partLabel", label: "部位", width: 80, type: "text" },
    { key: "item", label: "检查项", width: 150, type: "text" },
    { key: "result", label: "人工结论", width: 90, type: "text" },
    { key: "aiFlagText", label: "AI 质检口径", width: 110, type: "badge-icon" }
  ];

  function recordColumns() {
    return RECORD_COLUMNS;
  }

  // ---------- 对外 API ----------

  function records(unitId, rangeKey) {
    var i, unitFound = false;
    for (i = 0; i < CATALOG.pumpUnits.length; i += 1) {
      if (CATALOG.pumpUnits[i].id === unitId) unitFound = true;
    }
    if (!unitFound) throw new Error("Missing pump unit: " + unitId);
    var def = SEED.rangeDef(rangeKey);
    var totalDays = Math.ceil((def.points * def.hoursPerPoint) / 24);
    var result = [];
    for (i = 0; i < ALL_RECORDS.length; i += 1) {
      if (ALL_RECORDS[i].dayOffset < totalDays) {
        result.push(stripInternal(ALL_RECORDS[i]));
      }
    }
    return result;
  }

  function record(id) {
    var i;
    for (i = 0; i < ALL_RECORDS.length; i += 1) {
      if (ALL_RECORDS[i].id === id) return stripInternal(ALL_RECORDS[i]);
    }
    throw new Error("Missing inspection record: " + id);
  }

  return {
    records: records,
    record: record,
    recordColumns: recordColumns
  };
})();
