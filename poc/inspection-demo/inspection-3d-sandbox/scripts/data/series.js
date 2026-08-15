// 图表数据源：window.DemoSeries。只导出「纯数据」，不导出 ECharts option——option
// 由 core/chartopts.js 构造（不属于本文件）。
//
// 加载顺序要求：必须在 map3d/contract.js（提供 window.Map3DContract）之后、以及
// items-entry.js / items-process.js / items-room.js 三个文件（提供 window.DemoItems 的
// 全部 12 区数据）之后加载。任何一个前置模块缺失都直接抛错，不做兼容或降级。
//
// 数据纪律：本文件所有导出函数都从 window.DemoItems 实时派生聚合结果，不把聚合数字
// 写成字面量缓存。剧本调整某条巡检项的 status/value 后，这里的统计必须自动跟着变，
// 否则会出现「图上说发现问题 1 处，列表里却有 3 处」这种分裂。
//
// 与 track.js 的分工：apportionMinutes()（本文件内部实现，不对外导出）是「63 分钟
// 按 12 区项数加权」这套口径的唯一算法，patrolMinutes() 是它对外的唯一出口（返回
// { areaId: 分钟数 }）。durationByArea()（本文件，按 AREA_IDS 顺序累计，供图表用）
// 与 scripts/data/track.js 的 track().waypoints[].atMinute（按真实巡检顺序累计，
// 供轨迹动画用）都必须调用 patrolMinutes() 取每区分钟数，不许各自再实现一遍加权
// 算法或另起一份累计——两处各算一套，就会出现「图上说机柜间用了 16 分钟、轨迹
// 动画却走了 16.49 分钟」这种对不上（这正是本文件曾经的真实状态，2026-08-13 收口）。
(function () {
  "use strict";

  if (!window.Map3DContract) {
    throw new Error("series.js 必须在 map3d/contract.js 之后加载：window.Map3DContract 不存在");
  }
  if (!window.DemoItems) {
    throw new Error("series.js 必须在 items-entry.js 之后加载：window.DemoItems 不存在");
  }

  var Contract = window.Map3DContract;

  // ---- 12 区中文名 ----
  // 权威来源：tools/area-mapping.py 的 AREA_DEFS[<areaId>].cn（build-items.py 生成
  // items-*.js 时用的同一份区域裁剪映射表）。这里手工抄一份是因为 items-*.js 的每条
  // 巡检项只带 areaKey（如 "gate"），不带中文区域名，中文名在 DemoItems 里派生不出来。
  // 若 AREA_IDS 改动而这里没跟着改，下面的 assertIdSet 会在加载期立刻抛错，不会静默
  // 显示 undefined。
  var AREA_NAMES = {
    gate: "进、出站区",
    filter: "过滤分离区",
    metering: "计量区",
    regulate: "调压区",
    vent: "放空区",
    blowdown: "排污区",
    cabinet: "机柜间",
    power: "配电间",
    control: "站控室",
    genset: "发电机棚",
    ups: "UPS室",
    launcher: "收发球区"
  };
  Contract.assertIdSet("DemoSeries.AREA_NAMES", AREA_NAMES);

  function areaName(areaId) {
    return AREA_NAMES[areaId];
  }

  function areaItems(areaId) {
    var items = window.DemoItems[areaId];
    if (!Array.isArray(items)) {
      throw new Error(
        "[DemoSeries] window.DemoItems." + areaId + " 未加载或非数组，请确认 " +
        "items-entry.js / items-process.js / items-room.js 三个文件均已在 series.js 之前加载完毕"
      );
    }
    return items;
  }

  function allItems() {
    var out = [];
    Contract.AREA_IDS.forEach(function (areaId) {
      out = out.concat(areaItems(areaId));
    });
    return out;
  }

  // ---- 状态优先级：三态取「最严重」一档作为区域整体状态 ----
  var STATUS_PRIORITY = { ok: 0, warn: 1, danger: 2 };

  function worstStatus(items) {
    var worst = "ok";
    items.forEach(function (item) {
      if (Contract.STATUSES.indexOf(item.status) < 0) {
        throw new Error("[DemoSeries] 巡检项 status 非法：" + item.status + "（" + item.id + "）");
      }
      if (STATUS_PRIORITY[item.status] > STATUS_PRIORITY[worst]) {
        worst = item.status;
      }
    });
    return worst;
  }

  // 真实巡检总耗时：09:02:25 → 10:05:18，剧本口径取整数 63 分钟。这个常量与
  // apportionMinutes() 一起构成 durationByArea() 的唯一算法实现，见文件头注释。
  var TOTAL_DURATION_MINUTES = 63;

  // 按各区巡检项数占比，把 totalMinutes 分钟数分配到 12 区，使用最大余数法
  // （Hamilton apportionment）保证：
  //   1) 每区分到的分钟数是整数；
  //   2) 12 区分钟数之和恒等于 totalMinutes（不会因为四舍五入丢分钟或多分钟）；
  //   3) 同余数并列时，AREA_IDS 中靠前的区域优先拿到多余的 1 分钟（Array#sort 是
  //      稳定排序，相同 frac 的元素保持原始顺序，因此不需要额外的 tie-break 字段）。
  // 这是本文件内部函数，不导出——外部（包括 track.js）一律通过 durationByArea() 取数，
  // 不要复制这段算法。
  function apportionMinutes(totalMinutes) {
    var ids = Contract.AREA_IDS;
    var counts = ids.map(function (areaId) { return areaItems(areaId).length; });
    var totalItems = counts.reduce(function (sum, count) { return sum + count; }, 0);
    if (totalItems !== Contract.TOTAL_ITEMS) {
      throw new Error(
        "[DemoSeries] 12 区巡检项数之和为 " + totalItems + "，与 Map3DContract.TOTAL_ITEMS=" +
        Contract.TOTAL_ITEMS + " 不一致"
      );
    }

    var raw = counts.map(function (count) { return totalMinutes * count / totalItems; });
    var floors = raw.map(Math.floor);
    var used = floors.reduce(function (sum, n) { return sum + n; }, 0);
    var remainder = totalMinutes - used;
    if (remainder < 0 || remainder > ids.length) {
      throw new Error("[DemoSeries] 分钟数分配异常：totalMinutes=" + totalMinutes + " remainder=" + remainder);
    }

    var order = ids.map(function (areaId, index) {
      return { index: index, frac: raw[index] - floors[index] };
    });
    order.sort(function (a, b) { return b.frac - a.frac; });

    var minutes = floors.slice();
    for (var k = 0; k < remainder; k += 1) {
      minutes[order[k].index] += 1;
    }
    return minutes;
  }

  window.DemoSeries = {
    // 12 区完成率横条：本数据集里的 256 条巡检项都已带着最终 status/value（这是一份
    // 「已完成巡检」的静态结果集，不存在「待巡检」中间态），所以 done 恒等于 total、
    // ratio 恒为 1——这不是偷懒简化，是数据模型的真实边界：完成度这个维度本身就是
    // 100%，图表的可读性来自 total（各区体量差异，如机柜间 67 项 vs 放空区 7 项）和
    // status（哪个区有问题）两个维度。
    areaProgressRows: function () {
      return Contract.AREA_IDS.map(function (areaId) {
        var items = areaItems(areaId);
        var total = items.length;
        return {
          areaId: areaId,
          name: areaName(areaId),
          done: total,
          total: total,
          ratio: total > 0 ? total / total : 0,
          status: worstStatus(items)
        };
      });
    },

    // 项型分布：bool 项数 vs number 项数。真实数据里两者悬殊（number 型极少），
    // 这是真实数据的特征，不做任何美化或补数。
    itemTypeMix: function () {
      var all = allItems();
      var counts = { bool: 0, number: 0 };
      all.forEach(function (item) {
        if (Contract.CONTROL_TYPES.indexOf(item.inputType) < 0) {
          throw new Error("[DemoSeries] 巡检项 inputType 非法：" + item.inputType + "（" + item.id + "）");
        }
        counts[item.inputType] += 1;
      });
      return { bool: counts.bool, number: counts.number, total: all.length };
    },

    // 专业分布：按 items 的 discipline 字段聚合，字段取值从数据里实时扫出，不硬编码
    // 专业名单。按数量从多到少排序，便于图表直接按返回顺序渲染。
    disciplineMix: function () {
      var all = allItems();
      var order = [];
      var counts = {};
      all.forEach(function (item) {
        if (!item.discipline) {
          throw new Error("[DemoSeries] 巡检项缺少 discipline：" + item.id);
        }
        if (!Object.prototype.hasOwnProperty.call(counts, item.discipline)) {
          counts[item.discipline] = 0;
          order.push(item.discipline);
        }
        counts[item.discipline] += 1;
      });
      return order
        .map(function (discipline) {
          return {
            discipline: discipline,
            count: counts[discipline],
            ratio: counts[discipline] / all.length
          };
        })
        .sort(function (a, b) { return b.count - a.count; });
    },

    // 巡检耗时曲线：横轴 12 区（AREA_IDS 顺序即真实巡检动线），minutes 是该区自身
    // 耗时（12 区之和恒等于 TOTAL_DURATION_MINUTES=63），cumulativeMinutes 是巡检动线
    // 走到该区末尾时的累计耗时（最后一项恒等于 63）。两个字段都给，具体图表用哪个
    // 自行选——但两者的算法只在 apportionMinutes 这一处实现，见文件头注释。
    durationByArea: function () {
      var byArea = window.DemoSeries.patrolMinutes();
      var cumulative = 0;
      return Contract.AREA_IDS.map(function (areaId) {
        cumulative += byArea[areaId];
        return {
          areaId: areaId,
          name: areaName(areaId),
          minutes: byArea[areaId],
          cumulativeMinutes: cumulative,
          itemCount: areaItems(areaId).length
        };
      });
    },

    // 权威时间轴的唯一真源：{ areaId: 分钟数 }，12 区之和恒等于
    // TOTAL_DURATION_MINUTES。apportionMinutes() 是本文件内部的最大余数法实现，
    // 不对外导出——durationByArea()（本文件，按 AREA_IDS 顺序累计）与
    // scripts/data/track.js 的 track().waypoints[].atMinute（按真实巡检顺序累计）
    // 都必须调用这一个函数取每区分钟数，不允许各自再实现一遍分配算法。这正是
    // 文件头注释里点名的"同一个数字的两套实现"要收口的地方：改之前 track.js 用
    // 连续分钟数（如 gate=12.06）、series.js 用整数分钟数（如 gate=12），两者是
    // 同一份 63 分钟按项数占比分配的两套独立算法，容易在剧本调整后互相对不上。
    // 现在两处都从这一份整数分配结果派生，不会再出现"图上说机柜间用了 16 分钟、
    // 轨迹动画却走了 16.49 分钟"这种口径分裂。
    patrolMinutes: function () {
      var ids = Contract.AREA_IDS;
      var minutes = apportionMinutes(TOTAL_DURATION_MINUTES);
      var byArea = {};
      ids.forEach(function (areaId, index) { byArea[areaId] = minutes[index]; });
      return byArea;
    },

    // 63 分钟这个总时长常量只在这里出现一次；track.js 的 durationMin 字段也读
    // 这一个值，不在别处重复写字面量 63。
    TOTAL_DURATION_MINUTES: TOTAL_DURATION_MINUTES,

    // 单区进度 spark：按 seq 顺序把该区巡检项逐条「过一遍」，给出累计完成比
    // （第 i 条过完时 = i / total），单调从 1/total 升到 1。这是对「累计完成比」这个
    // 措辞最直接、不掺假的派生——数据集本身没有巡检中间态，无法派生出更复杂的
    // 时间序列。
    areaSpark: function (areaId) {
      var items = areaItems(areaId).slice().sort(function (a, b) { return a.seq - b.seq; });
      var total = items.length;
      return items.map(function (item, index) { return (index + 1) / total; });
    },

    // 数值型项读数对照：把所有 inputType=number 的巡检项按单位分组（单位枚举取自
    // Map3DContract.UNITS，保证分组顺序稳定），供"数值项一览"渲染。
    numericReadings: function () {
      var all = allItems();
      all.forEach(function (item) {
        if (Contract.CONTROL_TYPES.indexOf(item.inputType) < 0) {
          throw new Error("[DemoSeries] 巡检项 inputType 非法：" + item.inputType + "（" + item.id + "）");
        }
      });
      var numericItems = all.filter(function (item) { return item.inputType === "number"; });
      numericItems.forEach(function (item) {
        if (Contract.UNITS.indexOf(item.unit) < 0) {
          throw new Error("[DemoSeries] 数值型巡检项单位非法：" + item.unit + "（" + item.id + "）");
        }
      });
      return Contract.UNITS.map(function (unit) {
        var group = numericItems.filter(function (item) { return item.unit === unit; });
        return {
          unit: unit,
          count: group.length,
          items: group.map(function (item) {
            return {
              id: item.id,
              areaId: item.areaKey,
              title: item.title,
              value: item.value,
              unit: item.unit,
              status: item.status,
              tag: item.tag
            };
          })
        };
      });
    }
  };
})();
