// 首页图表数据源：从新版站点台账聚合，不再依赖旧 topology.js。
// 真源：scripts/data/sites.js（由 assets/.data/站点数据/湖南公司管道基础资料_20260820102547.xlsx 生成）。
//
// 【2026-08 精简】删掉 siteKindMix / mediumMix / categoryMix 三个方法：它们唯一的
// 消费者是 scripts/core/chartopts.js 里同名的三个 ECharts 构造器，而那三个构造器
// 从来没有被任何场景调用过，已同批删除。随之失去调用者的两个内部辅助函数
// allSites() 与 groupCount() 也一并删除。
// 仍在使用的：zoneRankRows / zoneStatusMix / provinceSummary /
// inspectionCoverageTrend / zoneCoverageRows。其中 zoneStatusMix 除了本目录，
// 也被 poc/inspection-demo/hunan-overview-v2 的新版总览读取（那边跨目录引用本文件
// 原文，不复制副本），删它之前要先确认那一侧。
(function () {
  "use strict";

  var Contract = window.HunanContract;
  if (!Contract) {
    throw new Error("[HunanSeries] 缺少 window.HunanContract，请先加载 scripts/map3d/contract.js");
  }

  var ZONE_IDS = Contract.ZONE_IDS;
  var ZONE_NAMES = Contract.ZONE_NAMES;

  function requireSites() {
    if (!window.HunanSites || typeof window.HunanSites.sites !== "function") {
      throw new Error("[HunanSeries] 需要 window.HunanSites.sites()，请先加载 scripts/data/sites.js");
    }
    return window.HunanSites;
  }

  function countStatus(list) {
    var out = { ok: 0, warn: 0, danger: 0 };
    list.forEach(function (site) {
      if (out[site.status] === undefined) throw new Error("[HunanSeries] 非法站点状态：" + site.status);
      out[site.status] += 1;
    });
    return out;
  }

  // 6 作业区排名：{ zoneId, name, stationCount, valveCount, total, issueCount, score }
  function zoneRankRows() {
    var Sites = requireSites();
    return ZONE_IDS.map(function (zoneId) {
      var list = Sites.sitesByZone(zoneId);
      var mix = countStatus(list);
      var stationCount = list.filter(function (site) { return site.kind === "station"; }).length;
      var valveCount = list.filter(function (site) { return site.kind === "valve"; }).length;
      var issueCount = mix.warn + mix.danger;
      var total = list.length;
      var score = total === 0 ? null : Math.round(100 - (mix.danger * 100 + mix.warn * 50) / total);
      return {
        zoneId: zoneId,
        name: ZONE_NAMES[zoneId],
        stationCount: stationCount,
        valveCount: valveCount,
        total: total,
        issueCount: issueCount,
        score: score
      };
    });
  }

  function zoneStatusMix() {
    var Sites = requireSites();
    return ZONE_IDS.map(function (zoneId) {
      var mix = countStatus(Sites.sitesByZone(zoneId));
      return { zoneId: zoneId, name: ZONE_NAMES[zoneId], ok: mix.ok, warn: mix.warn, danger: mix.danger };
    });
  }

  function provinceSummary() {
    return requireSites().provinceSummary();
  }

  function inspectionCoverageTrend(options) {
    options = options || {};
    var pointCount = options.pointCount || 7;
    if (pointCount < 1 || pointCount > 31) {
      throw new Error("[HunanSeries] inspectionCoverageTrend pointCount 应在 1..31 之间，实际 " + pointCount);
    }
    var lastIndex = pointCount - 1;
    var days = [];
    for (var d = lastIndex; d >= 0; d -= 1) days.push("D-" + d);
    if (!window.HunanInspectionQuality || typeof window.HunanInspectionQuality.province !== "function") {
      throw new Error("[HunanSeries] inspectionCoverageTrend 需要 window.HunanInspectionQuality.province()");
    }
    var current = window.HunanInspectionQuality.province().completionRate;
    return days.map(function (label, i) {
      var wave = Math.round(Math.sin(i * 0.9) * 4);
      var slope = lastIndex === 0 ? 0 : Math.round((i / lastIndex) * 4);
      var rate = Math.round(current - 4 + wave + slope);
      if (rate > 100) rate = 100;
      if (rate < 60) rate = 60;
      return { day: label, completionRate: rate };
    });
  }

  function zoneCoverageRows() {
    if (!window.HunanInspectionQuality || typeof window.HunanInspectionQuality.byZone !== "function") {
      throw new Error("[HunanSeries] zoneCoverageRows 需要 window.HunanInspectionQuality.byZone()");
    }
    return ZONE_IDS.map(function (zoneId) {
      var q = window.HunanInspectionQuality.byZone(zoneId);
      return { zoneId: zoneId, name: ZONE_NAMES[zoneId], coverageRate: q.completionRate };
    });
  }

  window.HunanSeries = {
    zoneRankRows: zoneRankRows,
    zoneStatusMix: zoneStatusMix,
    provinceSummary: provinceSummary,
    inspectionCoverageTrend: inspectionCoverageTrend,
    zoneCoverageRows: zoneCoverageRows
  };
})();
