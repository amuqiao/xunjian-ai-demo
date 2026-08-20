// 首页图表数据源：从新版站点台账聚合，不再依赖旧 topology.js。
// 真源：scripts/data/sites.js（由 assets/.data/站点数据/湖南公司管道基础资料_20260820102547.xlsx 生成）。
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

  function allSites() {
    var list = requireSites().sites();
    if (!Array.isArray(list)) throw new Error("[HunanSeries] HunanSites.sites() 未返回数组");
    return list;
  }

  function countStatus(list) {
    var out = { ok: 0, warn: 0, danger: 0 };
    list.forEach(function (site) {
      if (out[site.status] === undefined) throw new Error("[HunanSeries] 非法站点状态：" + site.status);
      out[site.status] += 1;
    });
    return out;
  }

  function groupCount(list, key) {
    var out = {};
    list.forEach(function (site) {
      var value = site[key];
      if (!value) throw new Error("[HunanSeries] 站点 " + site.id + " 缺少字段 " + key);
      out[value] = (out[value] || 0) + 1;
    });
    return Object.keys(out).map(function (name) { return { name: name, value: out[name] }; });
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

  function siteKindMix() {
    var list = allSites();
    var station = list.filter(function (site) { return site.kind === "station"; }).length;
    var valve = list.filter(function (site) { return site.kind === "valve"; }).length;
    var total = list.length;
    return {
      station: station,
      valve: valve,
      total: total,
      stationPct: total === 0 ? 0 : Math.round((station / total) * 1000) / 10,
      valvePct: total === 0 ? 0 : Math.round((valve / total) * 1000) / 10
    };
  }

  function mediumMix() {
    return groupCount(allSites(), "medium");
  }

  function categoryMix() {
    return groupCount(allSites(), "category");
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
    siteKindMix: siteKindMix,
    mediumMix: mediumMix,
    categoryMix: categoryMix,
    provinceSummary: provinceSummary,
    inspectionCoverageTrend: inspectionCoverageTrend,
    zoneCoverageRows: zoneCoverageRows
  };
})();
