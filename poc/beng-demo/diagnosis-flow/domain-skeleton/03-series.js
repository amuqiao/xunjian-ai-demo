// 领域契约 03：时序生成器。
//
// 这里既有数据也有一个函数——是有意的。时序如果写成静态点位数组，切换 7d/30d/90d
// 就必须为每个区间各存一份，业务改一个阈值要动三处。生成器让"同一个测点在不同区间"
// 只有一份口径。
//
// 硬要求：工作台的时序卡、时序详情子屏、复核页的证据 mini 图**必须调这同一个
// series()**。pump-demo 早期工作台读写死的静态数组、子屏读生成器，切时间范围时
// 一个动一个不动，同一个测点两处数字对不上——这是会被现场当场看出来的穿帮。
//
// 生成结果必须确定：同一个 (objectId, pointId, rangeKey) 每次调用完全相同。
// 因此不能用 Math.random()，只能用从入参哈希出来的种子跑 LCG。
window.DOMAIN_SERIES = (function () {
  "use strict";

  var TAXONOMY = window.DOMAIN_TAXONOMY;
  if (!TAXONOMY) throw new Error("[DOMAIN_SERIES] 需要先加载 01-taxonomy.js");

  // 区间末点固定落在这个时刻，所有区间共用。写成常量而不是 new Date()，是为了让
  // 生成结果不随"今天是几号"漂移——演示机上跨天之后曲线还是同一条。
  var END_AT = "2026-07-22T16:00:00";

  var RANGES = [
    { key: "7d", label: "近 7 天", points: 168, hoursPerPoint: 1 },
    { key: "30d", label: "近 30 天", points: 180, hoursPerPoint: 4 },
    { key: "90d", label: "近 90 天", points: 180, hoursPerPoint: 12 }
  ];

  // 每个测点在"本轮演示"里的剧本：诊断工作台表单项统一使用告警型时序。
  // drift 是区间末端相对基线的偏移比例，noise 是抖动幅度（相对基线）。
  var SCENARIO = {
    "PT-1": { base: 2.6, drift: 1.25, noise: 0.07 },
    "PT-2": { base: 28, drift: 1.9, noise: 0.05 },
    "PT-3": { base: 2.2, drift: 0.65, noise: 0.06 },
    "PT-4": { base: 0.32, drift: 1.55, noise: 0.08 },
    "PT-5": { base: 55, drift: 0.58, noise: 0.04 },
    "PT-6": { base: 0.18, drift: 1.55, noise: 0.07 },
    "PT-7": { base: 2.35, drift: 1.35, noise: 0.06 }
  };

  function rangeDef(rangeKey) {
    var i;
    for (i = 0; i < RANGES.length; i += 1) {
      if (RANGES[i].key === rangeKey) return RANGES[i];
    }
    throw new Error("[DOMAIN_SERIES] 未知时间范围：" + rangeKey);
  }

  function pointDef(pointId) {
    var i;
    for (i = 0; i < TAXONOMY.points.length; i += 1) {
      if (TAXONOMY.points[i].id === pointId) return TAXONOMY.points[i];
    }
    throw new Error("[DOMAIN_SERIES] 未知测点：" + pointId);
  }

  function objectExists(objectId) {
    var i;
    for (i = 0; i < TAXONOMY.objects.length; i += 1) {
      if (TAXONOMY.objects[i].id === objectId) return true;
    }
    return false;
  }

  // FNV-1a：把 (objectId, pointId, rangeKey) 压成一个 32 位种子。
  function hashSeed(text) {
    var h = 2166136261;
    var i;
    for (i = 0; i < text.length; i += 1) {
      h ^= text.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return h >>> 0;
  }

  function lcg(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function pad2(value) {
    return value < 10 ? "0" + value : String(value);
  }

  function stampAt(endMs, hoursBefore) {
    var d = new Date(endMs - hoursBefore * 3600 * 1000);
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate())
      + " " + pad2(d.getHours()) + ":00";
  }

  function round2(value) {
    return Math.round(value * 100) / 100;
  }

  // 状态口径：越过阈值 = danger；进入阈值 10% 的缓冲带 = warn；其余 ok。
  // safeSide 决定"越过"是哪一侧。
  function statusOf(latest, threshold, safeSide) {
    var band = Math.abs(threshold) * 0.1;
    if (safeSide === "below") {
      if (latest > threshold) return "danger";
      if (latest > threshold - band) return "warn";
      return "ok";
    }
    if (latest < threshold) return "danger";
    if (latest < threshold + band) return "warn";
    return "ok";
  }

  function alertOf(status, point, latest) {
    if (status === "danger") {
      return point.label + " 当前 " + round2(latest) + point.unit + "，已越过关注线 "
        + point.threshold + point.unit + "。";
    }
    if (status === "warn") {
      return point.label + " 当前 " + round2(latest) + point.unit + "，接近关注线 "
        + point.threshold + point.unit + "。";
    }
    return point.label + " 当前 " + round2(latest) + point.unit + "，处于正常区间。";
  }

  function series(objectId, pointId, rangeKey) {
    if (!objectExists(objectId)) throw new Error("[DOMAIN_SERIES] 未知对象：" + objectId);
    var point = pointDef(pointId);
    var range = rangeDef(rangeKey);
    var script = SCENARIO[pointId];
    if (!script) throw new Error("[DOMAIN_SERIES] 测点缺少时序剧本：" + pointId);

    var rand = lcg(hashSeed(objectId + "|" + pointId + "|" + rangeKey));
    var endMs = new Date(END_AT).getTime();
    // 对照对象不复现主线异常：把漂移压掉，只保留噪声。
    var driftScale = objectId === window.DOMAIN_META.entry.objectId ? 1 : 0.15;

    var dates = [];
    var values = [];
    var i, progress, value;
    for (i = 0; i < range.points; i += 1) {
      progress = range.points === 1 ? 1 : i / (range.points - 1);
      // 漂移在区间末端集中释放（progress 的三次方），前段基本平稳——这样 7d 和 90d
      // 看到的是同一次异常，只是时间尺度不同，而不是两条互不相干的曲线。
      value = script.base
        * (1 + script.drift * driftScale * Math.pow(progress, 3))
        * (1 + (rand() - 0.5) * 2 * script.noise);
      dates.push(stampAt(endMs, (range.points - 1 - i) * range.hoursPerPoint));
      values.push(round2(value));
    }

    var latest = values[values.length - 1];
    var status = statusOf(latest, point.threshold, point.safeSide);
    return {
      label: point.label,
      unit: point.unit,
      dates: dates,
      values: values,
      latest: latest,
      status: status,
      alert: alertOf(status, point, latest),
      threshold: point.threshold,
      safeSide: point.safeSide
    };
  }

  function ranges() {
    return RANGES;
  }

  // 采样口径文案：详情子屏的"逐小时原始采样 / N 小时均值聚合"那一行由它产出，
  // 不在场景层另编一套与 RANGES 脱节的说法。
  function samplingCaliber(rangeKey) {
    var def = rangeDef(rangeKey);
    if (def.hoursPerPoint === 1) {
      return def.label + " · 逐小时原始采样（" + def.points + " 点）";
    }
    return def.label + " · 每点 " + def.hoursPerPoint + " 小时均值聚合（" + def.points + " 点）";
  }

  return {
    endAt: END_AT,
    ranges: ranges,
    rangeDef: rangeDef,
    samplingCaliber: samplingCaliber,
    series: series
  };
})();
