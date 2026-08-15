// 程序化时序数据生成器（P1-C）。把 scripts/data/catalog.js 里的 points/scenario 展开成
// 任意区间（24h/7d/30d/90d）下的振动/相位/温度/压力等测点曲线、机组健康分曲线、异常类型
// 占比和机组横向对比——所有派生统计都在这里算完，场景层只管展示，不做二次计算。
//
// 加载顺序：必须晚于 scripts/data/seed.js 和 scripts/data/catalog.js，早于
// scripts/data/index.js（index.js 转发本文件的 series/healthSeries/anomalyMix/unitCompare，
// 也会调用 pointStatus() 派生 parts() 的 status）。
window.DemoDataSeries = (function () {
  "use strict";

  var SEED = window.DemoDataSeed;
  if (!SEED) {
    throw new Error("DemoDataSeed is required，请检查 scripts/data/seed.js 是否已加载");
  }
  var CATALOG = window.DemoDataCatalog;
  if (!CATALOG) {
    throw new Error("DemoDataCatalog is required，请检查 scripts/data/catalog.js 是否已加载");
  }

  // 各测点在"健康分/异常占比"两个聚合指标里的权重。数值本身是演示口径的校准常数：
  // 让 healthSeries("P-1","7d") 的最新值落在 70-74（沿用现有硬编码的 72 分口径），
  // 权重越大代表该测点越线对整体健康分/异常占比的影响越大。
  var IMPACT_WEIGHTS = {
    "P-DE-V": 60,
    "BRG-T": 40,
    "COUP-PH": 40,
    "BASE-V": 30,
    "MOT-DE-H": 30,
    "PUMP-P": 20,
    "SEAL-L": 20
  };

  // ---------- 基础查表 ----------

  function pointOf(pointId) {
    var i;
    for (i = 0; i < CATALOG.points.length; i += 1) {
      if (CATALOG.points[i].id === pointId) return CATALOG.points[i];
    }
    throw new Error("Missing series point: " + pointId);
  }

  function unitOf(unitId) {
    var i;
    for (i = 0; i < CATALOG.pumpUnits.length; i += 1) {
      if (CATALOG.pumpUnits[i].id === unitId) return CATALOG.pumpUnits[i];
    }
    throw new Error("Missing pump unit: " + unitId);
  }

  function findRamp(unitId, pointId) {
    var ramps = CATALOG.scenario.ramps;
    var i;
    for (i = 0; i < ramps.length; i += 1) {
      if (ramps[i].unitId === unitId && ramps[i].pointId === pointId) return ramps[i];
    }
    return null;
  }

  // ---------- 锚点时间（t=0） ----------

  function parseAnchor() {
    var clock = CATALOG.scenario.anchorClock;
    var datePart = clock.split(" ")[0].split("-");
    var timePart = clock.split(" ")[1].split(":");
    return {
      year: parseInt(datePart[0], 10),
      month: parseInt(datePart[1], 10),
      day: parseInt(datePart[2], 10),
      hour: parseInt(timePart[0], 10)
    };
  }
  var ANCHOR = parseAnchor();
  var ANCHOR_UTC_MS = Date.UTC(ANCHOR.year, ANCHOR.month - 1, ANCHOR.day, ANCHOR.hour);

  function pad2(n) {
    return n < 10 ? "0" + n : "" + n;
  }

  // hourEnd（<=0，"现在"往前数第几小时）对应的日期标签，格式 MM-DD。
  function dateLabel(hourEnd) {
    var ms = ANCHOR_UTC_MS + hourEnd * 3600000;
    var d = new Date(ms);
    return pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate());
  }

  // hourEnd 对应的钟点标签，格式 HH:00（用于 24h 区间）。
  function hourLabel(hourEnd) {
    var hourOfDay = ((ANCHOR.hour + hourEnd) % 24 + 24) % 24;
    return pad2(hourOfDay) + ":00";
  }

  // ---------- 连续小时级函数：base + ramp + season + noise ----------

  // 加性偏移：区间外（t 早于 startDay）返回 0；区间内按 shape 缓动，从 0 抬升到 (to-base)。
  // t===0（endDay 恰为 0）时 u 精确等于 1，ease(1)===1（linear/accel 皆然），
  // 所以 valueAtHour 在 t=0 会精确落到 ramp.to（见下方特判），不依赖这里的浮点巧合。
  function rampOffset(ramp, base, t) {
    if (!ramp) return 0;
    var startHour = ramp.startDay * 24;
    var endHour = ramp.endDay * 24;
    if (t <= startHour) return 0;
    var u = (t - startHour) / (endHour - startHour);
    if (u > 1) u = 1;
    if (u < 0) u = 0;
    var easeFn = SEED.ease[ramp.shape];
    return (ramp.to - base) * easeFn(u);
  }

  // 极小幅日/周周期正弦，幅度相对 noise 缩放（noise 为 0 的测点——如密封泄漏观察——
  // 因此恒为 0，不会凭空产生波动）。
  function seasonOffset(t, noiseAmp) {
    if (!noiseAmp) return 0;
    var daily = Math.sin((t / 24) * Math.PI * 2);
    var weekly = Math.sin((t / (24 * 7)) * Math.PI * 2);
    return noiseAmp * (daily * 0.2 + weekly * 0.1);
  }

  // 种子只取决于 (unitId, pointId, t) 三元组，不含区间键：任何区间都是同一条连续小时级
  // 函数的切片，7d/30d 重叠的那些天必须给出完全一致的值。
  function noiseOffset(unitId, pointId, t, noiseAmp) {
    if (!noiseAmp) return 0;
    var rand = SEED.makeRandom(SEED.hashKey(unitId + "|" + pointId + "|" + t));
    return (rand() - 0.5) * 2 * noiseAmp;
  }

  function valueAtHour(unitId, pointId, t) {
    var point = pointOf(pointId);
    var ramp = findRamp(unitId, pointId);
    // 最新点直接取叙事目标值，跳过噪声：保证"最新值 5.82 mm/s"这句文案和曲线末点
    // （24h 区间下曲线末点就是这一刻的原始采样，不经聚合）精确一致。
    if (ramp && t === 0) return ramp.to;
    return point.base + rampOffset(ramp, point.base, t) + seasonOffset(t, point.noise) + noiseOffset(unitId, pointId, t, point.noise);
  }

  // ---------- 区间采样：把连续小时函数按区间定义聚合成 labels/values ----------

  // valueFn(t) -> number，聚合方式见 seed.js 的 RANGE_DEFS（24h 是单小时原值，
  // 7d/30d 是"当日 24 小时均值"，90d 是"2 日 48 小时均值"）。
  function sampleRange(rangeKey, valueFn) {
    var def = SEED.rangeDef(rangeKey);
    var n = def.points;
    var hp = def.hoursPerPoint;
    var labels = [];
    var values = [];
    var i, hourEnd, sum, h;
    for (i = 0; i < n; i += 1) {
      hourEnd = -((n - 1 - i) * hp);
      sum = 0;
      for (h = 0; h < hp; h += 1) {
        sum += valueFn(hourEnd - h);
      }
      values.push(sum / hp);
      labels.push(def.labelFormat === "hour" ? hourLabel(hourEnd) : dateLabel(hourEnd));
    }
    return { labels: labels, values: values };
  }

  function mean(list) {
    var i, sum = 0;
    for (i = 0; i < list.length; i += 1) sum += list[i];
    return sum / list.length;
  }

  function max(list) {
    var i, m = list[0];
    for (i = 1; i < list.length; i += 1) {
      if (list[i] > m) m = list[i];
    }
    return m;
  }

  // 峰值和越线次数按"原始小时采样"统计，不用聚合后的 values（7d/30d/90d 的 values 是
  // 当日/两日均值，会把越线的尖峰抹平——统计出"最新值已超线，但区间内 0 次越线"这种
  // 自相矛盾的文案）。90d 最多 2160 小时，逐小时算一次量级完全可以接受。
  function rawPeakAndBreach(unitId, pointId, point, rangeKey) {
    var def = SEED.rangeDef(rangeKey);
    var totalHours = def.points * def.hoursPerPoint;
    var peak = valueAtHour(unitId, pointId, 0);
    var breachCount = 0;
    var t, v;
    for (t = 0; t > -totalHours; t -= 1) {
      v = valueAtHour(unitId, pointId, t);
      if (v > peak) peak = v;
      if (v >= point.warn) breachCount += 1;
    }
    return { peak: peak, breachCount: breachCount };
  }

  function roundTo(value, decimals) {
    var factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
  }

  function fmt(value) {
    return roundTo(value, 2).toString();
  }

  // ---------- status：全项目唯一判定处 ----------

  // 三色语义对齐界面图例：danger=异常 / warn=关注 / ok=对照。判定同时看**阈值**和**趋势**：
  //   danger: latest >= warn          —— 已越过关注线
  //   warn  : latest < warn 但区间内显著上升（deltaPct >= 25）—— 未越线但在爬升
  //   ok    : 其余
  // 只看阈值的三段式（<warn=ok / [warn,stop)=warn / >=stop=danger）是错的：那样
  // P-DE-V(5.82 vs warn 5.68 stop 7.1)、COUP-PH(81 vs 70/100)、BASE-V(3.36 vs 3/4.5)
  // 全部只算"关注"，整个演示会变成 0 个异常部位，而这一轮讲的就是 P-1 的红色告警事件。
  // 现在这条规则能精确复现 6 个部位原本手写的状态（danger/danger/danger/warn/ok/ok）。
  // stop 不参与三色判定，它是图表上的停机线 markLine。
  var TREND_WARN_PCT = 25;

  function statusFor(point, latestValue, deltaPct) {
    if (latestValue >= point.warn) return "danger";
    if (deltaPct >= TREND_WARN_PCT) return "warn";
    return "ok";
  }

  // 供 index.js 派生 parts() 的 status。
  // 趋势这一半需要一个窗口，这里固定取 7d 而不是跟随用户选择的时间范围：部位状态是"本轮
  // 事件"的定性标记，必须在切换时间范围时保持稳定，否则 3D 热点颜色会随用户选择跳变，
  // 演示叙事不稳。图表/详情卡用的是 series(range).status，各自对自己的区间自洽。
  var STATUS_TREND_RANGE = "7d";

  function pointStatus(unitId, pointId) {
    var point = pointOf(pointId);
    var latest = valueAtHour(unitId, pointId, 0);
    var reference = series(unitId, pointId, STATUS_TREND_RANGE);
    return { latest: latest, status: statusFor(point, latest, reference.deltaPct) };
  }

  // 文案必须跟着 statusFor 的判定口径写，不能自己另立一套。
  //   danger = 已越过关注线（不是越过停机线）→ 文案说"超过关注线"，若同时也过了停机线才追加提示
  //   warn   = 未越线但区间内显著上升          → 文案说"未越线但上升 X%"，绝不能说"超过关注线"
  //   ok     = 平稳
  // 早先这里按"danger 就是过了停机线"写，配上新判定后会输出
  // "最新值 5.82 mm/s，超过停机线 7.1 mm/s" 这种自相矛盾的句子（5.82 < 7.1）。
  // 结论文案和图表数字来自同一份 series()，任何一方自己解释一遍口径都会立刻穿帮。
  function buildAlert(point, latestValue, breachCount, deltaPct, status) {
    if (status === "ok") {
      return "最新值 " + fmt(latestValue) + " " + point.unit + "，低于关注线 " + fmt(point.warn) + " " + point.unit + "，运行平稳。";
    }
    if (status === "warn") {
      return "最新值 " + fmt(latestValue) + " " + point.unit + "，尚未越过关注线 " + fmt(point.warn) + " " + point.unit +
        "，但区间内上升 " + Math.round(deltaPct) + "%，进入关注区。";
    }
    var text = "最新值 " + fmt(latestValue) + " " + point.unit + "，超过关注线 " + fmt(point.warn) + " " + point.unit +
      "（区间内 " + breachCount + " 次越线）";
    if (typeof point.stop === "number" && latestValue >= point.stop) {
      text += "，且已越过停机线 " + fmt(point.stop) + " " + point.unit + "。";
    }
    return text;
  }

  // ---------- 对外 API ----------

  function series(unitId, pointId, rangeKey) {
    unitOf(unitId);
    var point = pointOf(pointId);
    var sampled = sampleRange(rangeKey, function (t) {
      return valueAtHour(unitId, pointId, t);
    });
    var latest = valueAtHour(unitId, pointId, 0);
    var raw = rawPeakAndBreach(unitId, pointId, point, rangeKey);
    var meanValue = mean(sampled.values);
    var first = sampled.values[0];
    var delta = latest - first;
    var deltaPct = first === 0 ? 0 : (delta / first) * 100;
    var status = statusFor(point, latest, deltaPct);
    return {
      unitId: unitId,
      pointId: pointId,
      label: point.label,
      unit: point.unit,
      warn: point.warn,
      stop: point.stop,
      type: point.type,
      rangeKey: rangeKey,
      labels: sampled.labels,
      values: sampled.values,
      latest: latest,
      peak: raw.peak,
      mean: meanValue,
      first: first,
      delta: delta,
      deltaPct: deltaPct,
      breachCount: raw.breachCount,
      status: status,
      alert: buildAlert(point, latest, raw.breachCount, deltaPct, status)
    };
  }

  function overshoot(point, value) {
    if (value <= point.warn) return 0;
    var band = typeof point.stop === "number" ? point.stop - point.warn : point.warn;
    var o = (value - point.warn) / band;
    if (o > 1) o = 1;
    return o;
  }

  function healthAt(unitId, t) {
    var sum = 0;
    var i, point, value;
    for (i = 0; i < CATALOG.points.length; i += 1) {
      point = CATALOG.points[i];
      value = valueAtHour(unitId, point.id, t);
      sum += overshoot(point, value) * IMPACT_WEIGHTS[point.id];
    }
    return 100 - sum;
  }

  function healthSeries(unitId, rangeKey) {
    unitOf(unitId);
    var sampled = sampleRange(rangeKey, function (t) {
      return healthAt(unitId, t);
    });
    var latest = healthAt(unitId, 0);
    return {
      unitId: unitId,
      rangeKey: rangeKey,
      labels: sampled.labels,
      values: sampled.values,
      latest: latest,
      peak: max(sampled.values),
      mean: mean(sampled.values)
    };
  }

  function anomalyMix(unitId, rangeKey) {
    unitOf(unitId);
    SEED.rangeDef(rangeKey);
    var typeSums = {};
    var i, point, raw;
    for (i = 0; i < CATALOG.points.length; i += 1) {
      point = CATALOG.points[i];
      raw = rawPeakAndBreach(unitId, point.id, point, rangeKey);
      if (!typeSums[point.type]) typeSums[point.type] = 0;
      typeSums[point.type] += raw.breachCount * IMPACT_WEIGHTS[point.id];
    }
    var types = [];
    var total = 0;
    var type;
    for (type in typeSums) {
      types.push({ name: type, weight: typeSums[type] });
      total += typeSums[type];
    }
    if (total === 0) {
      return [{ name: "其他", value: 100 }];
    }
    types.sort(function (a, b) {
      return b.weight - a.weight;
    });
    var result = [];
    var assigned = 0;
    for (i = 0; i < types.length; i += 1) {
      var value = Math.round((types[i].weight / total) * 100);
      assigned += value;
      result.push({ name: types[i].name, value: value });
    }
    // 四舍五入后凑不满/超出 100 的余量记到"其他"（没有的话新建一项），保证百分比之和恒为 100。
    var remainder = 100 - assigned;
    if (remainder !== 0) {
      var otherIndex = -1;
      for (i = 0; i < result.length; i += 1) {
        if (result[i].name === "其他") otherIndex = i;
      }
      if (otherIndex >= 0) {
        result[otherIndex].value += remainder;
      } else {
        result.push({ name: "其他", value: remainder });
      }
    }
    return result;
  }

  function unitCompare(pointId, rangeKey) {
    pointOf(pointId);
    var result = [];
    var i, unitId, health, pointSeries;
    for (i = 0; i < CATALOG.pumpUnits.length; i += 1) {
      unitId = CATALOG.pumpUnits[i].id;
      health = healthSeries(unitId, rangeKey).latest;
      pointSeries = series(unitId, pointId, rangeKey);
      result.push({ unitId: unitId, health: roundTo(health, 0), peak: pointSeries.peak });
    }
    return result;
  }

  return {
    IMPACT_WEIGHTS: IMPACT_WEIGHTS,
    valueAtHour: valueAtHour,
    pointStatus: pointStatus,
    series: series,
    healthSeries: healthSeries,
    anomalyMix: anomalyMix,
    unitCompare: unitCompare
  };
})();
