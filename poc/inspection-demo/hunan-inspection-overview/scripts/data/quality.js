// 巡检质量指标（演示配置）。
// 全省指标只从各作业区汇总计算，页面层不再手写第二份总数。
(function () {
  "use strict";

  var Contract = window.HunanContract;
  if (!Contract) {
    throw new Error("[HunanInspectionQuality] 缺少 window.HunanContract，请先加载 scripts/map3d/contract.js");
  }

  // currentRisk 表示当前仍处于 P1 的风险项；p1Issues 表示累计发现问题中的 P1 项。
  var ZONE_METRICS = [
    { zoneId: "yueyang", planned: 36, completed: 34, issues: 5, currentRisk: 1, p1Issues: 2, duration: 2, interval: 1, offWindow: 1, aiAlerts: 2 },
    { zoneId: "changsha", planned: 28, completed: 27, issues: 1, currentRisk: 0, p1Issues: 0, duration: 0, interval: 1, offWindow: 0, aiAlerts: 1 },
    { zoneId: "hengyang", planned: 27, completed: 26, issues: 2, currentRisk: 0, p1Issues: 0, duration: 1, interval: 1, offWindow: 0, aiAlerts: 1 },
    { zoneId: "yongchen", planned: 20, completed: 19, issues: 2, currentRisk: 0, p1Issues: 0, duration: 1, interval: 1, offWindow: 0, aiAlerts: 1 },
    { zoneId: "xianglou", planned: 18, completed: 17, issues: 1, currentRisk: 0, p1Issues: 0, duration: 1, interval: 0, offWindow: 0, aiAlerts: 0 },
    { zoneId: "zhuzhou", planned: 12, completed: 11, issues: 2, currentRisk: 1, p1Issues: 1, duration: 1, interval: 0, offWindow: 1, aiAlerts: 1 }
  ];

  function assertCoverage() {
    var seen = {};
    var valid = {};
    Contract.ZONE_IDS.forEach(function (zoneId) { valid[zoneId] = true; });
    ZONE_METRICS.forEach(function (row) {
      if (!valid[row.zoneId]) throw new Error("[HunanInspectionQuality] 非法作业区指标：" + row.zoneId);
      if (seen[row.zoneId]) throw new Error("[HunanInspectionQuality] 作业区指标重复：" + row.zoneId);
      seen[row.zoneId] = true;
    });
    Contract.ZONE_IDS.forEach(function (zoneId) {
      if (!seen[zoneId]) throw new Error("[HunanInspectionQuality] 缺少作业区指标：" + zoneId);
    });
  }

  function round1(value) {
    return Math.round(value * 10) / 10;
  }

  function completionRate(row) {
    if (row.planned <= 0) throw new Error("[HunanInspectionQuality] planned 必须大于 0：" + row.zoneId);
    return round1(row.completed / row.planned * 100);
  }

  function riskLevel(row) {
    if (row.currentRisk > 0) return "P1";
    if (row.issues >= 2 || row.aiAlerts > 0 || row.offWindow > 0) return "P2";
    if (row.issues > 0 || row.duration > 0 || row.interval > 0) return "P3";
    return "-";
  }

  function cloneWithDerived(row, name) {
    return {
      zoneId: row.zoneId,
      name: name,
      planned: row.planned,
      completed: row.completed,
      completionRate: completionRate(row),
      riskLevel: riskLevel(row),
      currentRisk: row.currentRisk,
      p1Issues: row.p1Issues,
      issues: row.issues,
      duration: row.duration,
      interval: row.interval,
      offWindow: row.offWindow,
      aiAlerts: row.aiAlerts
    };
  }

  function byZone(zoneId) {
    var matches = ZONE_METRICS.filter(function (row) { return row.zoneId === zoneId; });
    if (!matches.length) throw new Error("[HunanInspectionQuality] 未找到作业区指标：" + zoneId);
    return cloneWithDerived(matches[0], Contract.ZONE_NAMES[zoneId]);
  }

  function province() {
    var sum = ZONE_METRICS.reduce(function (acc, row) {
      acc.planned += row.planned;
      acc.completed += row.completed;
      acc.issues += row.issues;
      acc.currentRisk += row.currentRisk;
      acc.p1Issues += row.p1Issues;
      acc.duration += row.duration;
      acc.interval += row.interval;
      acc.offWindow += row.offWindow;
      acc.aiAlerts += row.aiAlerts;
      return acc;
    }, { zoneId: null, planned: 0, completed: 0, issues: 0, currentRisk: 0, p1Issues: 0, duration: 0, interval: 0, offWindow: 0, aiAlerts: 0 });
    return cloneWithDerived(sum, "全省");
  }

  function current(zoneId) {
    return zoneId == null ? province() : byZone(zoneId);
  }

  assertCoverage();

  window.HunanInspectionQuality = {
    province: province,
    byZone: byZone,
    current: current
  };
})();
