// 领域契约 03：时序生成器。
//
// 【曲线是按真截图复现的，不是随手造的】数据源是 media/scada-vibration-trend.jpg
// ——「长郴管道.衡阳站.P_3泵驱动端振动」，2026-07-22 16:30:00 → 16:37:00。
// 我从那张图上逐段读出走势，落成下面的 SHAPE：
//   16:30 起在 9.2 附近小幅抖动（谷 8.2、峰 10.6）
//   16:32 后整体抬升，反复越过 9.5 报警线
//   16:34 出现第一个 12.1 尖峰
//   16:35-16:36 峰群 11.2 / 11.8 / 11.4
//   末点 11.9（= 01-station.js 的 point.fieldReading，两处必须相等）
//
// 【为什么不直接用图、还要画一条】图是原始凭据（作为视觉证据可点开放大），但它是一张
// 手机翻拍的截图，屏上没法做 tooltip、没法标阈值线、也没法按范围缩放。所以屏上画一条
// 复现曲线，同时把原图挂在依据链里 —— 两者并存，观众想核对随时能点开。
//
// 【确定性】FNV-1a 种子 + LCG，不用 Math.random()：同一份代码每次打开必须画出同一条线，
// 否则路演两次讲的不是同一件事，而且验收断言也没法钉住末点。
window.DOMAIN_SERIES = (function () {
  "use strict";

  function need(name) {
    if (!window[name]) throw new Error("[DOMAIN_SERIES] 需要先加载 " + name);
    return window[name];
  }

  var START_AT = "2026-07-22T16:30:00";
  var END_AT = "2026-07-22T16:37:00";
  // 截图上点很密，目测约 3 秒一点，7 分钟 ≈ 140 点。
  var STEP_SEC = 3;

  // 从截图上读出的形状锚点：[占全程的比例, 该处的中心值]。
  // 相邻锚点之间线性插值，再叠一层确定性抖动 —— 截图上的抖动幅度目测 ±0.6 上下。
  var SHAPE = [
    [0.00, 9.20], [0.05, 9.55], [0.09, 8.75], [0.13, 9.85], [0.18, 9.10],
    [0.24, 9.75], [0.30, 9.95], [0.36, 10.35], [0.42, 9.80], [0.48, 10.20],
    [0.54, 10.55], [0.58, 11.30], [0.62, 10.15], [0.68, 10.45], [0.74, 10.30],
    [0.80, 10.85], [0.86, 11.25], [0.91, 10.60], [0.96, 11.40], [1.00, 11.90]
  ];
  var JITTER = 0.55;

  // FNV-1a：把字符串折成一个 32 位种子。
  function fnv1a(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i += 1) {
      h ^= str.charCodeAt(i);
      h = (h + (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) >>> 0;
    }
    return h >>> 0;
  }

  // LCG：给定种子的伪随机序列。数值取自 Numerical Recipes。
  function lcg(seed) {
    var s = seed >>> 0;
    return function () {
      s = (Math.imul(1664525, s) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function pad2(n) { return n < 10 ? "0" + n : String(n); }

  function fmt(date) {
    return date.getFullYear() + "-" + pad2(date.getMonth() + 1) + "-" + pad2(date.getDate())
      + " " + pad2(date.getHours()) + ":" + pad2(date.getMinutes()) + ":" + pad2(date.getSeconds());
  }

  function shapeAt(ratio) {
    for (var i = 1; i < SHAPE.length; i += 1) {
      if (ratio <= SHAPE[i][0]) {
        var a = SHAPE[i - 1];
        var b = SHAPE[i];
        var t = (ratio - a[0]) / (b[0] - a[0] || 1);
        return a[1] + (b[1] - a[1]) * t;
      }
    }
    return SHAPE[SHAPE.length - 1][1];
  }

  var CACHE = {};

  function build(pointId) {
    var Station = need("DOMAIN_STATION");
    var point = Station.pointById(pointId);
    var start = new Date(START_AT.replace(/-/g, "/").replace("T", " ")).getTime();
    var end = new Date(END_AT.replace(/-/g, "/").replace("T", " ")).getTime();
    var total = Math.round((end - start) / 1000 / STEP_SEC);
    var rand = lcg(fnv1a(pointId + "|" + START_AT + "|" + END_AT));
    var rows = [];
    for (var i = 0; i <= total; i += 1) {
      var ratio = i / total;
      var center = shapeAt(ratio);
      var jitter = (rand() - 0.5) * 2 * JITTER;
      var value = Math.round((center + jitter) * 100) / 100;
      rows.push({ at: fmt(new Date(start + i * STEP_SEC * 1000)), value: value });
    }
    // 末点钉成现场读数：01-station.js 的 point.fieldReading 是"这条曲线走到哪儿"的
    // 单一真源，两处不相等就是数据错了。这里直接覆盖，不做四舍五入的凑近。
    rows[rows.length - 1].value = point.fieldReading;
    return rows;
  }

  // 三档展示范围。全程 7 分钟，所以"近 2 分钟"是掐掉前面只看末尾那一段 ——
  // 它回答的是"最后这两分钟到底有多糟"，与全程曲线是两个问题。
  var RANGES = [
    { key: "7m", label: "全程 7 分钟", tailRatio: 1 },
    { key: "3m", label: "近 3 分钟", tailRatio: 3 / 7 },
    { key: "2m", label: "近 2 分钟", tailRatio: 2 / 7 }
  ];

  function rangeByKey(key) {
    var found = RANGES.filter(function (r) { return r.key === key; })[0];
    if (!found) throw new Error("[DOMAIN_SERIES] 未知展示范围：" + key);
    return found;
  }

  function series(pointId, rangeKey) {
    if (!CACHE[pointId]) CACHE[pointId] = build(pointId);
    var all = CACHE[pointId];
    var range = rangeByKey(rangeKey);
    if (range.tailRatio >= 1) return all.slice();
    // 末点必须始终在结果里 —— 它是"现在多少"，任何范围下都不能被切掉。
    var keep = Math.max(2, Math.round(all.length * range.tailRatio));
    return all.slice(all.length - keep);
  }

  // 统计摘要：屏上"上升幅度 +29%"这类说法从这里出，不在场景层现算。
  function stats(pointId) {
    var Station = need("DOMAIN_STATION");
    var point = Station.pointById(pointId);
    var all = series(pointId, "7m");
    var values = all.map(function (r) { return r.value; });
    var max = Math.max.apply(null, values);
    var overWarn = values.filter(function (v) { return v >= point.warnAt; }).length;
    var overDanger = values.filter(function (v) { return v >= point.dangerAt; }).length;
    return {
      total: all.length,
      first: all[0].value,
      last: all[all.length - 1].value,
      max: max,
      baseline: point.baseline,
      // 相对基线的上升幅度。基线取台账/截图起段的平稳值，不用曲线首点 ——
      // 首点自带抖动，拿它当分母会让这个百分比每次都不一样。
      risePercent: Math.round((point.fieldReading - point.baseline) / point.baseline * 1000) / 10,
      overWarnCount: overWarn,
      overDangerCount: overDanger,
      overWarnRatio: Math.round(overWarn / all.length * 1000) / 10,
      startAt: all[0].at,
      endAt: all[all.length - 1].at
    };
  }

  // 【接口形状对齐骨架层】scripts/core/state.js 调的是 ranges() 与 rangeLabel(key)。
  // 那份文件是骨架层、两个课题共用一份，所以由 domain 这边去适配它，而不是改骨架 ——
  // 一改骨架，两个 POC 的 state.js 就分叉了，"换课题只换 domain"这条设计立刻失效。
  function ranges() { return RANGES.map(function (r) { return { key: r.key, label: r.label }; }); }

  function rangeLabel(key) { return rangeByKey(key).label; }

  return {
    ranges: ranges, rangeLabel: rangeLabel, rangeByKey: rangeByKey,
    series: series, stats: stats
  };
})();
