// 领域契约 03：时序生成器。
//
// 【只有一个测点】旧目录有三个（出口压力 / 泵体温度 / 控制回路电源状态 %），后两个
// 没有对应的检查项，是为了凑数造的。本版只保留真正有数值 + 有标准 + 有现场读数的
// 出口管线压力，另外三条记录的证据形态是同点位比对 / 事件时间线 / 视觉帧，不配曲线。
//
// 【末点必须等于现场读数】曲线的最后一个点固定落在 DOMAIN_STATION 的
// points[PT-1].fieldReading（9.3MPa）—— 那是记录里人工填的就地表读数。两处不相等就是
// 穿帮：屏上一边写"现场读数 9.3MPa"，一边曲线末点停在 9.37，观众会问哪个对。
// 所以这里不是"让曲线大致收在 9.3 附近"，是**把末点直接钉死成 9.3**，噪声只作用在
// 前面的点上。schema 启动时会断言这一条。
//
// 生成结果必须确定：同一个 (pointId, rangeKey) 每次调用完全相同。因此不用
// Math.random()，只用从入参哈希出来的种子跑一个 LCG。
window.DOMAIN_SERIES = (function () {
  "use strict";

  var STATION = window.DOMAIN_STATION;
  if (!STATION) throw new Error("[DOMAIN_SERIES] 需要先加载 01-station.js");

  // 区间末点固定落在这个时刻 —— 与四张关键帧同一天同一晚（最后一帧 20:18:35），
  // 曲线右端和画面右下角的时间戳能对上。写成常量而不是 new Date()，是为了让曲线
  // 不随"演示机今天几号"漂移。
  var END_AT = "2026-07-22T20:20:00";

  var RANGES = [
    { key: "12h", label: "近 12 小时", points: 72, minutesPerPoint: 10 },
    { key: "7d", label: "近 7 天", points: 168, minutesPerPoint: 60 },
    { key: "30d", label: "近 30 天", points: 180, minutesPerPoint: 240 }
  ];

  // 本轮剧本：压力从基线缓慢抬升，末端越过高报警 9.0，但没到高高报警 9.8。
  // base 是区间起点值，noise 是抖动幅度（绝对值，MPa）。末点由 fieldReading 钉死。
  var SCENARIO = {
    "PT-1": { base: 8.42, noise: 0.05 }
  };

  function rangeDef(rangeKey) {
    var found = RANGES.filter(function (r) { return r.key === rangeKey; })[0];
    if (!found) throw new Error("[DOMAIN_SERIES] 未知时间范围：" + rangeKey);
    return found;
  }

  // 32 位 FNV-1a，只为把 (pointId, rangeKey) 变成一个稳定种子。
  function seedOf(text) {
    var hash = 2166136261;
    var i;
    for (i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = (hash * 16777619) >>> 0;
    }
    return hash || 1;
  }

  // 经典 LCG（数值取自 Numerical Recipes）。返回 [0,1)。
  function lcg(state) {
    var s = state;
    return function () {
      s = (1664525 * s + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function pad2(n) { return n < 10 ? "0" + n : String(n); }

  function stampAt(endDate, minutesBefore) {
    var d = new Date(endDate.getTime() - minutesBefore * 60000);
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()) +
      " " + pad2(d.getHours()) + ":" + pad2(d.getMinutes());
  }

  function series(pointId, rangeKey) {
    var point = STATION.pointById(pointId);
    var scenario = SCENARIO[pointId];
    if (!scenario) throw new Error("[DOMAIN_SERIES] 测点没有剧本：" + pointId);
    var range = rangeDef(rangeKey);
    var rand = lcg(seedOf(pointId + "|" + rangeKey));
    var endDate = new Date(END_AT);
    var lastIndex = range.points - 1;
    var span = point.fieldReading - scenario.base;

    var rows = [];
    var i;
    for (i = 0; i < range.points; i += 1) {
      var progress = lastIndex === 0 ? 1 : i / lastIndex;
      // 抬升用 progress 的平方：前段平、后段翘，读起来像"最近才开始涨"，
      // 比线性更贴"趋势异常"这个说法。
      var trend = scenario.base + span * progress * progress;
      var jitter = (rand() - 0.5) * 2 * scenario.noise;
      var value = i === lastIndex ? point.fieldReading : trend + jitter;
      rows.push({
        at: stampAt(endDate, (lastIndex - i) * range.minutesPerPoint),
        value: Math.round(value * 100) / 100
      });
    }
    return rows;
  }

  // 采样表：区间内均匀抽取，**必须含末点**（末点就是现场读数那一行，讲解时要指着它）。
  function samples(pointId, rangeKey, count) {
    var rows = series(pointId, rangeKey);
    var take = count || 8;
    if (take < 2) throw new Error("[DOMAIN_SERIES] samples 的 count 至少 2");
    if (rows.length <= take) return rows.slice();
    var out = [];
    var i;
    for (i = 0; i < take - 1; i += 1) {
      out.push(rows[Math.round(i * (rows.length - 1) / (take - 1))]);
    }
    out.push(rows[rows.length - 1]);
    return out;
  }

  function ranges() { return RANGES.slice(); }

  function rangeLabel(rangeKey) { return rangeDef(rangeKey).label; }

  return {
    ranges: ranges,
    rangeLabel: rangeLabel,
    series: series,
    samples: samples,
    END_AT: END_AT
  };
})();
