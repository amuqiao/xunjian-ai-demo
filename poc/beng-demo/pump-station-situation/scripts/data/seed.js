// 确定性伪随机数生成器与区间定义表（P1-C）。纯 ES5，不依赖 Math.imul，供
// scripts/data/series.js、scripts/data/records.js 生成"可复现"的时序噪声和填充记录。
//
// 关键设计：种子只由 (unitId|pointId|hour) 三元组决定，不含区间键（24h/7d/30d/90d）。
// 这样 series.js 里"任何区间都是同一条连续小时级函数的切片"才成立——切换区间时
// 曲线形状不会因为换了一套种子而整体跳变。
//
// 加载顺序：必须排在 scripts/data/catalog.js 之前（catalog.js 目前不直接用它，但
// series.js / records.js 依赖它，且约定统一放在 catalog 之前加载，便于以后 catalog
// 里如果也要用确定性数据时不必调整顺序）。
window.DemoDataSeed = (function () {
  "use strict";

  // djb2 变体哈希：全程用 |0 截断在 int32 范围内，最后转成无符号整数作为种子。
  function hashKey(key) {
    var h = 5381;
    var i;
    for (i = 0; i < key.length; i += 1) {
      h = ((h << 5) - h + key.charCodeAt(i)) | 0;
    }
    return h >>> 0;
  }

  // xorshift32：给定种子返回一个 [0,1) 的确定性伪随机数发生器（同一种子每次
  // 从头调用第一次都得到同一个数，满足"同一 key 反复算，结果一致"的可复现要求）。
  function makeRandom(seed) {
    var s = (seed >>> 0) || 0x9e3779b9;
    return function () {
      s = (s ^ (s << 13)) >>> 0;
      s = (s ^ (s >>> 17)) >>> 0;
      s = (s ^ (s << 5)) >>> 0;
      return s / 4294967296;
    };
  }

  // 两种缓动：linear 匀速抬升；accel 前段平缓、后段陡增（振动类特征更贴近真实劣化曲线）。
  var ease = {
    linear: function (u) {
      return u;
    },
    accel: function (u) {
      return u * u;
    }
  };

  // 区间定义表：采样密度、每点聚合跨度、坐标轴标签格式。points/hoursPerPoint 的乘积
  // 就是该区间覆盖的总小时数（24h=24h，7d=168h，30d=720h，90d=2160h）。
  var RANGE_ORDER = ["24h", "7d", "30d", "90d"];
  var RANGE_DEFS = {
    "24h": { key: "24h", label: "最近 24 小时", points: 24, hoursPerPoint: 1, labelFormat: "hour" },
    "7d": { key: "7d", label: "最近 7 天", points: 7, hoursPerPoint: 24, labelFormat: "date" },
    "30d": { key: "30d", label: "最近 1 月", points: 30, hoursPerPoint: 24, labelFormat: "date" },
    "90d": { key: "90d", label: "最近 3 月", points: 45, hoursPerPoint: 48, labelFormat: "date" }
  };

  function rangeDef(rangeKey) {
    var def = RANGE_DEFS[rangeKey];
    if (!def) throw new Error("Missing range: " + rangeKey);
    return def;
  }

  function rangeList() {
    return RANGE_ORDER.map(function (key) {
      var def = RANGE_DEFS[key];
      return { key: def.key, label: def.label };
    });
  }

  return {
    hashKey: hashKey,
    makeRandom: makeRandom,
    ease: ease,
    RANGE_ORDER: RANGE_ORDER,
    rangeDef: rangeDef,
    rangeList: rangeList
  };
})();
